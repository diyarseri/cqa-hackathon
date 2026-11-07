// Evaluate one conversation: build prompt from checklist → LLM → validate the
// strict JSON in code (repair round-trip if needed) → score in code → store.
import crypto from 'node:crypto';
import { computeFacts } from './facts.js';
import { buildSystemPrompt, buildUserPrompt, responseSchema } from './prompt.js';
import { complete, pricing, providerInfo, LlmError } from './llm.js';
import { normalizeAnswer, score, ScoringError } from '../../shared/scoring.js';
import { scaleMax } from '../../shared/checklist.js';
import { p, readJson, writeJson, listJson, safeId } from './store.js';

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

/** Runs the LLM with up to MAX_REPAIRS correction rounds. Returns criteria + usage. */
export async function runModel(checklist, conv, { llm = complete } = {}) {
  const facts = computeFacts(conv);
  const system = buildSystemPrompt();
  const user = buildUserPrompt(checklist, conv, facts);
  const schema = responseSchema();
  const usage = { input: 0, output: 0, calls: 0 };
  let prompt = user;
  let lastErrors = [];
  let model;
  for (let attempt = 0; attempt <= MAX_REPAIRS; attempt++) {
    const r = await llm({ system, user: prompt, schema });
    usage.input += r.usage?.input || 0;
    usage.output += r.usage?.output || 0;
    usage.calls++;
    model = r.model;
    const v = validateModelOutput(r.text, checklist, conv);
    if (!v.errors.length) return { criteria: v.criteria, usage, model, facts, prompt_chars: user.length, repairs: attempt };
    lastErrors = v.errors;
    prompt = `${user}\n\n## ИСПРАВЬ ПРЕДЫДУЩИЙ ОТВЕТ\nТвой предыдущий ответ:\n${r.text.slice(0, 12000)}\n\nОшибки проверки:\n${v.errors.map((e) => `- ${e}`).join('\n')}\nВерни полный исправленный JSON.`;
  }
  throw new LlmError(`ответ модели не прошёл проверку после ${MAX_REPAIRS} исправлений: ${lastErrors.join('; ')}`, { status: 422, retryable: true });
}

const evalDir = (group) => p('evaluations', safeId(group));
const evalFile = (group, convId, checklistId) => `${evalDir(group)}/${safeId(convId)}__${safeId(checklistId)}.json`;

export async function evaluate({ group, conv, checklist, llm }) {
  const started = Date.now();
  const run = await runModel(checklist, conv, { llm });
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
    cost_usd_estimate: price.in == null || price.out == null ? null : round6((run.usage.input * price.in + run.usage.output * price.out) / 1e6),
    facts: run.facts,
    criteria: run.criteria,
    original_score: result,
    appeals: [],
    final_score: result,
  };
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
