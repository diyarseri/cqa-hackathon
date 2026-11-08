// Batch evaluation of a whole group_id: worker pool, per-item retry with
// exponential backoff, progress persisted to data/jobs/<id>.json.
import crypto from 'node:crypto';
import * as ds from './datasource.js';
import * as cl from './checklists.js';
import { evaluate, getEvaluation } from './evaluator.js';
import { p, readJson, writeJson, listJson, safeId, httpError } from './store.js';

const jobs = new Map();
const jobFile = (id) => p('jobs', `${safeId(id)}.json`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function persist(job) {
  const { _cancel, ...rest } = job;
  writeJson(jobFile(job.id), rest);
}

function summarize(job) {
  const c = { pending: 0, running: 0, done: 0, skipped: 0, error: 0 };
  for (const it of job.items) c[it.status]++;
  job.counts = c;
  job.progress = job.items.length ? (c.done + c.skipped + c.error) / job.items.length : 1;
  return job;
}

export async function startBatch({ group, checklistId = 'chat-quality', onlyMissing = true, refresh = false, concurrency = 1, ids, llm, runs } = {}) {
  if (!group) throw httpError(400, 'group is required');
  const checklist = cl.get(checklistId); // current version at start; pinned for the whole job
  const convs = await ds.getConversations(group, { refresh });
  const chosen = ids?.length ? convs.filter((c) => ids.includes(c.conversation_id)) : convs;
  const job = {
    id: crypto.randomUUID().slice(0, 8),
    group_id: group,
    checklist: { id: checklist.id, version: checklist.version, name: checklist.name },
    only_missing: onlyMissing,
    // One local GPU should process one dialogue at a time. Parallel Ollama
    // requests increase memory pressure and were the main source of timeouts.
    concurrency: 1,
    runs: Math.max(1, Math.min(7, Number(runs ?? process.env.EVAL_RUNS ?? 1) || 1)),
    status: 'running',
    started_at: new Date().toISOString(),
    finished_at: null,
    usage: { input: 0, output: 0, calls: 0 },
    cost_usd_estimate: 0,
    items: chosen.map((c) => {
      const prev = onlyMissing ? getEvaluation(group, c.conversation_id, checklist.id) : null;
      const fresh = prev && prev.checklist.version === checklist.version;
      return {
        conversation_id: c.conversation_id,
        language: c.language,
        channel: c.channel,
        status: fresh ? 'skipped' : 'pending',
        attempts: 0,
        error: null,
        total: fresh ? prev.final_score.total : null,
        gross_error: fresh ? prev.final_score.gross_error : null,
      };
    }),
  };
  summarize(job);
  jobs.set(job.id, job);
  persist(job);
  run(job, checklist, convs, llm).catch((e) => {
    job.status = 'failed';
    job.error = e.message;
    persist(job);
  });
  return job;
}

async function run(job, checklist, convs, llm) {
  const byId = new Map(convs.map((c) => [c.conversation_id, c]));
  const queue = job.items.filter((it) => it.status === 'pending');
  let lastSave = 0;
  const save = (force) => {
    summarize(job);
    if (force || Date.now() - lastSave > 1000) {
      lastSave = Date.now();
      persist(job);
    }
  };
  const worker = async () => {
    while (queue.length && !job._cancel) {
      const it = queue.shift();
      it.status = 'running';
      save();
      await evalWithRetry(job, it, byId.get(it.conversation_id), checklist, llm);
      save();
    }
  };
  await Promise.all(Array.from({ length: job.concurrency }, worker));
  job.status = job._cancel ? 'cancelled' : 'finished';
  job.finished_at = new Date().toISOString();
  for (const it of job.items) if (it.status === 'running' || (job._cancel && it.status === 'pending')) it.status = 'pending';
  save(true);
}

const MAX_ATTEMPTS = Number(process.env.BATCH_MAX_ATTEMPTS || 4);
const MIN_INTERVAL = Number(process.env.LLM_MIN_INTERVAL_MS || 0); // spacing between calls (free-tier RPM)
let lastCall = 0;

async function evalWithRetry(job, it, conv, checklist, llm) {
  for (;;) {
    it.attempts++;
    try {
      if (MIN_INTERVAL) {
        const wait = lastCall + MIN_INTERVAL - Date.now();
        lastCall = Math.max(Date.now(), lastCall + MIN_INTERVAL);
        if (wait > 0) await sleep(wait);
      }
      const rec = await evaluate({ group: job.group_id, conv, checklist, llm, runs: job.runs });
      it.status = 'done';
      it.error = null;
      it.total = rec.final_score.total;
      it.gross_error = rec.final_score.gross_error;
      it.duration_ms = rec.duration_ms;
      job.usage.input += rec.usage.input;
      job.usage.output += rec.usage.output;
      job.usage.calls += rec.usage.calls;
      if (rec.cost_usd_estimate != null) job.cost_usd_estimate = Math.round((job.cost_usd_estimate + rec.cost_usd_estimate) * 1e6) / 1e6;
      return;
    } catch (e) {
      it.error = e.message;
      const retryable = e.retryable !== false && !(e.status >= 400 && e.status < 500 && ![408, 409, 422, 429].includes(e.status));
      if (!retryable || it.attempts >= MAX_ATTEMPTS || job._cancel) {
        it.status = 'error';
        return;
      }
      await sleep(Math.min(60_000, 2000 * 2 ** (it.attempts - 1)) + Math.random() * 500);
    }
  }
}

export function getJob(id) {
  const j = jobs.get(id) || readJson(jobFile(id));
  if (!j) throw httpError(404, 'job not found');
  return summarize(j);
}

export function listJobs() {
  const disk = listJson(p('jobs'));
  const merged = new Map(disk.map((j) => [j.id, j]));
  for (const [id, j] of jobs) merged.set(id, j);
  return [...merged.values()]
    .map((j) => { const { items, _cancel, ...rest } = summarize(j); return rest; })
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
}

export function cancelJob(id) {
  const j = jobs.get(id);
  if (!j || j.status !== 'running') throw httpError(409, 'job is not running');
  j._cancel = true;
  return summarize(j);
}

/** Re-run only failed (or never-started) items of a finished job. */
export async function retryFailed(id, { llm } = {}) {
  const old = getJob(id);
  if (old.status === 'running') throw httpError(409, 'job is still running');
  const ids = old.items.filter((it) => it.status === 'error' || it.status === 'pending').map((it) => it.conversation_id);
  if (!ids.length) throw httpError(400, 'nothing to retry');
  return startBatch({ group: old.group_id, checklistId: old.checklist.id, onlyMissing: false, concurrency: old.concurrency, ids, llm, runs: old.runs });
}
