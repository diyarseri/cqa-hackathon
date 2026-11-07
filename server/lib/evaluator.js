// Evaluate one conversation: build prompt from checklist → LLM → validate the
// strict JSON in code (repair round-trip if needed) → score in code → store.
import crypto from 'node:crypto';
import { computeFacts } from './facts.js';
import { buildSystemPrompt, buildUserPrompt, responseSchema } from './prompt.js';
import { complete, pricing, providerInfo, LlmError } from './llm.js';
import { normalizeAnswer, score, ScoringError } from '../../shared/scoring.js';
import { scaleMax } from '../../shared/checklist.js';
import { p, readJson, writeJson, listJson, safeId } from './store.js';
import { computeReviewFlags } from './review.js';
import { getAudioBytes } from './datasource.js';

const MAX_REPAIRS = 2;

/** Validate and normalise raw model output against checklist + transcript. */
export function validateModelOutput(raw, checklist, conv) {
  const errors = [];
  let obj = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(stripFences(raw));
    } catch (e) {
      return { errors: [`ответ не является корректным JSON: ${e.message}`] };
    }
  }
  const arr = Array.isArray(obj) ? obj : obj?.criteria;
  if (!Array.isArray(arr)) return { errors: ['нет массива "criteria"'] };
  const n = conv.messages.length;
  const byId = new Map();
  for (const it of arr) {
    if (it && typeof it === 'object' && it.id != null) byId.set(String(it.id), it);
  }
  const out = [];
  for (const k of checklist.criteria) {
    const it = byId.get(k.id);
    if (!it) {
      errors.push(`критерий ${k.id}: отсутствует в ответе`);
      continue;
    }
    let answer;
    try {
      answer = normalizeAnswer(k, it.answer);
    } catch (e) {
      errors.push(`критерий ${k.id}: недопустимый answer ${JSON.stringify(it.answer)} — ${e.message}`);
      continue;
    }
    const evidence = [...new Set((Array.isArray(it.evidence) ? it.evidence : []).map(Number))].filter(Number.isInteger);
    const bad = evidence.filter((i) => i < 0 || i >= n);
    if (bad.length) errors.push(`критерий ${k.id}: номера реплик вне диапазона 0–${n - 1}: ${bad.join(', ')}`);
    let range = it.checked_range && typeof it.checked_range === 'object' ? { from: Number(it.checked_range.from), to: Number(it.checked_range.to) } : null;
    if (range && (!Number.isInteger(range.from) || !Number.isInteger(range.to))) range = null;
    if (range) {
      if (range.from > range.to) range = { from: range.to, to: range.from };
      range.from = Math.max(0, range.from);
      range.to = Math.min(n - 1, range.to);
    }
    const explanation = String(it.explanation || '').trim();
    if (!explanation) errors.push(`критерий ${k.id}: пустое explanation`);
    const naReason = it.na_reason ? String(it.na_reason).trim() : null;
    if (answer === 'na' && !naReason) errors.push(`критерий ${k.id}: answer = "na", но na_reason пуст`);
    const shortfall = answer === 'no' || (k.type === 'scale' && typeof answer === 'number' && answer < scaleMax(k));
    const isFlagHit = k.type === 'flag' && answer === 'yes';
    if ((shortfall && k.type !== 'flag') && !range && evidence.length === 0)
      errors.push(`критерий ${k.id}: для «${answer}» укажи checked_range (где ожидалось действие) или evidence`);
    if ((answer === 'yes' && k.type !== 'flag') || isFlagHit) {
      if (evidence.length === 0) errors.push(`критерий ${k.id}: для «${answer}» нужен хотя бы один номер реплики в evidence`);
    }
    out.push({
      id: k.id,
      answer,
      explanation,
      evidence: evidence.filter((i) => i >= 0 && i < n),
      checked_range: range,
      na_reason: answer === 'na' ? naReason : null,
      quote: String(it.quote || '').slice(0, 300),
    });
  }
  return { errors, criteria: out };
}

function stripFences(s) {
  return s.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
}

/** One model conversation (with repairs) for a subset of criteria. */
async function runPart(sub, conv, facts, { llm, audio }) {
  const system = buildSystemPrompt();
  const user = buildUserPrompt(sub, conv, facts, { audio: !!audio });
  const schema = responseSchema();
  const usage = { input: 0, output: 0, calls: 0 };
  let prompt = user;
  let lastErrors = [];
  let model;
  for (let attempt = 0; attempt <= MAX_REPAIRS; attempt++) {
    const r = await llm({ system, user: prompt, schema, audio });
    usage.input += r.usage?.input || 0;
    usage.output += r.usage?.output || 0;
    usage.calls++;
    model = r.model;
    const v = validateModelOutput(r.text, sub, conv);
    if (!v.errors.length) return { criteria: v.criteria, usage, model, prompt_chars: user.length, repairs: attempt };
    lastErrors = v.errors;
    prompt = `${user}\n\n## ИСПРАВЬ ПРЕДЫДУЩИЙ ОТВЕТ\nТвой предыдущий ответ:\n${r.text.slice(0, 12000)}\n\nОшибки проверки:\n${v.errors.map((e) => `- ${e}`).join('\n')}\nВерни полный исправленный JSON.`;
  }
  throw new LlmError(`ответ модели не прошёл проверку после ${MAX_REPAIRS} исправлений: ${lastErrors.join('; ')}`, { status: 422, retryable: true });
}

/**
 * Evaluates all criteria. Transcript criteria go in one call; criteria with
 * source "audio" go in a second call with the recording attached, or get N/A
 * in code when the dialogue has no recording.
 */
async function runOnce(checklist, conv, { llm = complete, getAudio } = {}) {
  const facts = computeFacts(conv);
  const textK = checklist.criteria.filter((k) => k.source !== 'audio');
  const audioK = checklist.criteria.filter((k) => k.source === 'audio');
  const total = { input: 0, output: 0, calls: 0 };
  const results = new Map();
  let model = null;
  let repairs = 0;
  let promptChars = 0;
  const merge = (r) => {
    for (const c of r.criteria) results.set(c.id, c);
    total.input += r.usage.input; total.output += r.usage.output; total.calls += r.usage.calls;
    model ||= r.model; repairs += r.repairs; promptChars += r.prompt_chars;
  };
  if (textK.length) merge(await runPart({ ...checklist, criteria: textK }, conv, facts, { llm }));
  if (audioK.length) {
    if (conv.audio_url && getAudio) {
      const buf = await getAudio(conv);
      merge(await runPart({ ...checklist, criteria: audioK }, conv, facts, { llm, audio: { data: buf.toString('base64'), format: 'mp3' } }));
    } else {
      for (const k of audioK)
        results.set(k.id, {
          id: k.id, answer: 'na', evidence: [], checked_range: null, quote: '',
          explanation: 'Критерий оценивается по звуку, а записи у этого диалога нет.',
          na_reason: k.na?.condition || 'Нет записи звонка.',
        });
    }
  }
  return {
    criteria: checklist.criteria.map((k) => results.get(k.id)),
    usage: total, model, facts, prompt_chars: promptChars, repairs,
  };
}

/**
 * Majority vote over several independent runs (EVAL_RUNS, default 1).
 * Binary/flag/N/A: most frequent answer; scales: the median step. The
 * explanation and evidence come from the first run that gave the final
 * answer. Each criterion records its vote, e.g. "2/3".
 */
export function combineRuns(checklist, runs) {
  if (runs.length === 1) return runs[0];
  const criteria = checklist.criteria.map((k) => {
    const all = runs.map((r) => r.criteria.find((c) => c.id === k.id));
    const answers = all.map((c) => c.answer);
    let final;
    const counts = new Map();
    for (const a of answers) counts.set(a, (counts.get(a) || 0) + 1);
    const top = [...counts.entries()].sort((x, y) => y[1] - x[1]);
    if (k.type === 'scale' && top[0][1] <= runs.length / 2) {
      const nums = answers.filter((a) => typeof a === 'number').sort((x, y) => x - y);
      final = nums.length > runs.length / 2 ? nums[Math.floor((nums.length - 1) / 2)] : top[0][0];
    } else final = top[0][0];
    const pick = all.find((c) => c.answer === final);
    const agreeing = answers.filter((a) => a === final).length;
    return { ...pick, votes: { agree: agreeing, total: runs.length, answers } };
  });
  const sum = (key) => runs.reduce((s, r) => s + r.usage[key], 0);
  return {
    criteria,
    usage: { input: sum('input'), output: sum('output'), calls: sum('calls') },
    model: runs[0].model,
    facts: runs[0].facts,
    prompt_chars: runs[0].prompt_chars,
    repairs: runs.reduce((s, r) => s + r.repairs, 0),
    runs: runs.length,
  };
}

export async function runModel(checklist, conv, opts = {}) {
  const n = Math.max(1, Math.min(7, Number(opts.runs ?? process.env.EVAL_RUNS ?? 1) || 1));
  const runs = await Promise.all(Array.from({ length: n }, () => runOnce(checklist, conv, opts)));
  return combineRuns(checklist, runs);
}

const evalDir = (group) => p('evaluations', safeId(group));
const evalFile = (group, convId, checklistId) => `${evalDir(group)}/${safeId(convId)}__${safeId(checklistId)}.json`;

export async function evaluate({ group, conv, checklist, llm, getAudio, runs }) {
  const started = Date.now();
  const run = await runModel(checklist, conv, { llm, runs, getAudio: getAudio ?? ((c) => getAudioBytes(group, c)) });
  const answers = Object.fromEntries(run.criteria.map((c) => [c.id, c.answer]));
  const result = score(checklist, answers);
  const price = pricing();
  const record = {
    id: crypto.randomUUID(),
    group_id: group,
    conversation_id: conv.conversation_id,
    channel: conv.channel,
    language: conv.language,
    checklist: { id: checklist.id, version: checklist.version, name: checklist.name },
    provider: providerInfo().provider,
    model: run.model,
    created_at: new Date().toISOString(),
    duration_ms: Date.now() - started,
    usage: run.usage,
    repairs: run.repairs,
    runs: run.runs || 1,
    cost_usd_estimate: price.in == null || price.out == null ? null : round6((run.usage.input * price.in + run.usage.output * price.out) / 1e6),
    facts: run.facts,
    criteria: run.criteria,
    original_score: result,
    appeals: [],
    final_score: result,
  };
  record.review_flags = computeReviewFlags(record, conv, checklist);
  // Re-evaluation replaces the record; keep the previous one (with its appeals) in history.
  const prev = readJson(evalFile(group, conv.conversation_id, checklist.id));
  if (prev) writeJson(`${evalDir(group)}/history/${safeId(prev.conversation_id)}__${safeId(prev.checklist.id)}__${prev.id}.json`, prev);
  writeJson(evalFile(group, conv.conversation_id, checklist.id), record);
  return record;
}

export function getEvaluation(group, convId, checklistId) {
  return readJson(evalFile(group, convId, checklistId));
}

export function saveEvaluation(rec) {
  writeJson(evalFile(rec.group_id, rec.conversation_id, rec.checklist.id), rec);
}

export function listEvaluations(group, checklistId) {
  return listJson(evalDir(group)).filter((e) => !checklistId || e.checklist.id === checklistId);
}

const round6 = (x) => Math.round(x * 1e6) / 1e6;
export { ScoringError };
