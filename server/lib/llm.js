// LLM providers. Gemini (Google AI Studio key) by default; any OpenAI-compatible
// endpoint as an alternative. Both return { text, usage:{input,output}, model }.

export function providerInfo() {
  const provider = (process.env.LLM_PROVIDER || 'gemini').toLowerCase();
  if (provider === 'openai')
    return { provider, model: process.env.OPENAI_MODEL || 'gpt-4.1-mini', base: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1' };
  return { provider: 'gemini', model: process.env.GEMINI_MODEL || 'gemini-3.5-flash' };
}

export class LlmError extends Error {
  constructor(msg, { status, retryable } = {}) {
    super(msg);
    this.status = status;
    this.retryable = retryable ?? (status === 429 || (status >= 500 && status < 600));
  }
}

export async function complete({ system, user, schema }) {
  const info = providerInfo();
  return info.provider === 'openai' ? openai(info, { system, user, schema }) : gemini(info, { system, user, schema });
}

// Gemini via its OpenAI-compatible endpoint: the AI Studio key goes in a plain
// "Authorization: Bearer" header, and the JSON schema is enforced server-side.
async function gemini({ model }, { system, user, schema }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new LlmError('GEMINI_API_KEY is not set (get a free key at aistudio.google.com)', { status: 401, retryable: false });
  // On overload (429/5xx) fall through to the next model in GEMINI_FALLBACK_MODELS.
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS ?? 'gemini-3.8-flash,gemini-3.5-flash-lite')
    .split(',').map((m) => m.trim()).filter((m) => m && m !== model);
  let lastErr;
  for (const m of [model, ...fallbacks]) {
    try {
      return await chatCompletions({
        base: 'https://generativelanguage.googleapis.com/v1beta/openai',
        key,
        model: m,
        system,
        user,
        schema,
        extra: process.env.GEMINI_REASONING ? { reasoning_effort: process.env.GEMINI_REASONING } : {},
        label: 'Gemini',
      });
    } catch (e) {
      // Keep the first overload error: a later 404 (retired fallback model)
      // must not hide it, or the batch would stop retrying.
      if (!lastErr || (e.retryable && !lastErr.retryable)) lastErr = e;
      if (!(e.retryable || e.status === 404)) throw e;
    }
  }
  if (lastErr && !lastErr.retryable && lastErr.status === 404) lastErr.retryable = true;
  throw lastErr;
}

async function chatCompletions({ base, key, model, system, user, schema, extra = {}, label }) {
  const res = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: schema
        ? { type: 'json_schema', json_schema: { name: 'evaluation', schema: toJsonSchema(schema) } }
        : { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      ...extra,
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const raw = await res.text();
  let data = {};
  try { data = JSON.parse(raw); } catch {}
  if (Array.isArray(data)) data = data[0] || {};
  if (!res.ok) throw new LlmError(`${label} HTTP ${res.status}: ${data?.error?.message || raw.slice(0, 300)}`.trim(), { status: res.status });
  const text = data.choices?.[0]?.message?.content || '';
  if (!text) throw new LlmError(`${label} returned no text (finish_reason ${data.choices?.[0]?.finish_reason || '?'})`, { status: 502 });
  return {
    text,
    model: data.model || model,
    usage: { input: data.usage?.prompt_tokens || 0, output: data.usage?.completion_tokens || 0 },
  };
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

async function openai({ model, base }, { system, user, schema }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new LlmError('OPENAI_API_KEY is not set', { status: 401, retryable: false });
  return chatCompletions({ base, key, model, system, user, schema, label: 'OpenAI' });
}

/**
 * USD per 1M tokens for the cost estimate. Prices change often, so they are
 * NOT hardcoded: set LLM_PRICE_IN / LLM_PRICE_OUT from the provider's pricing
 * page. Unset → the cost estimate is null and only token counts are reported.
 */
export function pricing() {
  const { provider, model } = providerInfo();
  const num = (v) => (v == null || v === '' ? null : Number(v));
  return {
    provider,
    model,
    in: num(process.env.LLM_PRICE_IN),
    out: num(process.env.LLM_PRICE_OUT),
    note: 'Paid-tier price per 1M tokens from env. The Gemini API free tier costs $0 within its rate limits.',
  };
}
