// Local-only LLM adapter. Evaluation requests may only go to an Ollama server
// bound to this computer; external model endpoints are rejected in code.

const DEFAULT_BASE = 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'qwen2.5:7b';

export function providerInfo() {
  const requested = (process.env.LLM_PROVIDER || 'ollama').toLowerCase();
  if (requested !== 'ollama' && requested !== 'local') {
    throw new LlmError(
      `Эта копия работает только локально. LLM_PROVIDER=${requested} запрещён; укажите ollama.`,
      { status: 500, retryable: false },
    );
  }
  return {
    provider: 'ollama-local',
    model: process.env.OLLAMA_MODEL || DEFAULT_MODEL,
    base: assertLocalEndpoint(process.env.OLLAMA_BASE_URL || DEFAULT_BASE),
    local_only: true,
    transcript_leaves_device: false,
  };
}

export async function providerStatus() {
  const info = providerInfo();
  try {
    const res = await fetch(`${info.base}/api/tags`, { signal: AbortSignal.timeout(2_500) });
    if (!res.ok) return { available: false, model_installed: false, detail: `Ollama HTTP ${res.status}` };
    const data = await res.json();
    const installed_models = (data.models || []).map((item) => item.name).filter(Boolean);
    return {
      available: true,
      model_installed: modelIsInstalled(info.model, installed_models),
      installed_models,
      detail: modelIsInstalled(info.model, installed_models) ? 'Локальная модель готова.' : `Выполните: ollama pull ${info.model}`,
    };
  } catch {
    return { available: false, model_installed: false, installed_models: [], detail: 'Запустите приложение Ollama.' };
  }
}

export function modelIsInstalled(wanted, installed) {
  const exact = String(wanted).includes(':') ? String(wanted) : `${wanted}:latest`;
  return installed.some((name) => name === wanted || name === exact);
}

export class LlmError extends Error {
  constructor(msg, { status, retryable } = {}) {
    super(msg);
    this.status = status;
    this.retryable = retryable ?? (status === 429 || (status >= 500 && status < 600));
  }
}

export function assertLocalEndpoint(value) {
  let url;
  try {
    url = new URL(value || DEFAULT_BASE);
  } catch {
    throw new LlmError(`Некорректный OLLAMA_BASE_URL: ${value}`, { status: 500, retryable: false });
  }
  const host = url.hostname.toLowerCase();
  const ipv4 = host.split('.').map(Number);
  const loopbackV4 = ipv4.length === 4 && ipv4[0] === 127 && ipv4.every((part) => Number.isInteger(part) && part >= 0 && part <= 255);
  const local = host === 'localhost' || host === '::1' || host === '[::1]' || loopbackV4;
  if (!local || !['http:', 'https:'].includes(url.protocol)) {
    throw new LlmError(
      `Локальный режим заблокировал внешний адрес модели: ${url.origin}. Используйте Ollama на 127.0.0.1.`,
      { status: 500, retryable: false },
    );
  }
  if (url.username || url.password || (url.pathname !== '/' && url.pathname !== '')) {
    throw new LlmError('OLLAMA_BASE_URL должен содержать только локальный адрес и порт.', { status: 500, retryable: false });
  }
  return url.origin;
}

/** Complete one structured evaluation using Ollama's native local API. */
export async function complete({ system, user, schema, audio }) {
  const info = providerInfo();
  if (audio) {
    throw new LlmError(
      'Выбранная локальная текстовая модель не анализирует аудиофайл. Используйте критерии по транскрипту или локальную мультимодальную модель.',
      { status: 422, retryable: false },
    );
  }
  const timeout = boundedNumber(process.env.OLLAMA_TIMEOUT_MS, 300_000, 10_000, 900_000);
  let res;
  try {
    res = await fetch(`${info.base}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: info.model,
        stream: false,
        think: false,
        format: schema ? toJsonSchema(schema) : 'json',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        options: {
          temperature: 0,
          num_ctx: boundedNumber(process.env.OLLAMA_CONTEXT_TOKENS, 8_192, 2_048, 32_768),
          num_predict: boundedNumber(process.env.OLLAMA_MAX_TOKENS, 8_000, 512, 16_000),
        },
      }),
      signal: AbortSignal.timeout(timeout),
    });
  } catch (error) {
    if (error?.name === 'TimeoutError') {
      throw new LlmError(`Локальная модель не ответила за ${Math.round(timeout / 1000)} с.`, { status: 504, retryable: true });
    }
    throw new LlmError(
      `Не удалось подключиться к локальной Ollama (${info.base}). Запустите Ollama и загрузите модель ${info.model}.`,
      { status: 503, retryable: true },
    );
  }
  const raw = await res.text();
  let data = {};
  try { data = JSON.parse(raw); } catch {}
  if (!res.ok) {
    const detail = String(data?.error || raw).slice(0, 300);
    throw new LlmError(`Ollama HTTP ${res.status}: ${detail}`.trim(), { status: res.status });
  }
  const text = data?.message?.content || '';
  if (!text) throw new LlmError('Ollama вернула пустой ответ.', { status: 502, retryable: true });
  return {
    text,
    model: data.model || info.model,
    usage: { input: data.prompt_eval_count || 0, output: data.eval_count || 0 },
  };
}

function boundedNumber(value, fallback, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
}

/** Gemini-style schema (type: 'OBJECT', nullable) → standard JSON Schema. */
export function toJsonSchema(s) {
  if (!s || typeof s !== 'object') return s;
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === 'propertyOrdering' || k === 'nullable') continue;
    if (k === 'type') out.type = String(v).toLowerCase();
    else if (k === 'properties') out.properties = Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, toJsonSchema(pv)]));
    else if (k === 'items') out.items = toJsonSchema(v);
    else out[k] = v;
  }
  if (s.nullable) out.type = [out.type, 'null'];
  return out;
}

export function pricing() {
  const { provider, model } = providerInfo();
  return {
    provider,
    model,
    in: 0,
    out: 0,
    note: 'Локальная Ollama не тарифицирует токены. Модель работает на этом компьютере.',
  };
}
