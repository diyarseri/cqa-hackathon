// CQA prototype server. Run: npm start  →  http://localhost:8080
import path from 'node:path';
import { Router } from './http.js';
import { loadDotEnv, PROJECT_ROOT, httpError } from './lib/store.js';
import * as ds from './lib/datasource.js';
import * as cl from './lib/checklists.js';
import * as ev from './lib/evaluator.js';
import * as ap from './lib/appeals.js';
import * as batch from './lib/batch.js';
import * as val from './lib/validation.js';
import * as ins from './lib/insights.js';
import * as bundle from './lib/bundle.js';
import { computeFacts } from './lib/facts.js';
import { buildSystemPrompt, buildUserPrompt } from './lib/prompt.js';
import { providerInfo, pricing } from './lib/llm.js';
import { computeReviewFlags } from './lib/review.js';

loadDotEnv();
const app = new Router();

// ---- Step 1: data -----------------------------------------------------------
app.get('/api/groups', async () => ({ groups: await ds.listCachedGroups() }));

app.post('/api/groups/:group/fetch', async ({ params }) => {
  const g = await ds.fetchGroup(params.group);
  return { group_id: params.group, fetched_at: g.fetched_at, total: g.response.data.records.length };
});

app.get('/api/groups/:group/conversations', async ({ params, query }) => {
  const list = await ds.getConversations(params.group, { refresh: query.get('refresh') === '1' });
  return list.map((c) => ({
    conversation_id: c.conversation_id,
    channel: c.channel,
    language: c.language,
    has_audio: !!c.audio_url,
    messages: c.messages.length,
    duration_sec: c.messages.at(-1)?.offset_sec ?? null,
  }));
});

app.get('/api/groups/:group/conversations/:id', ({ params }) =>
  ds.getConversation(params.group, params.id),
);

// Redirects the <audio> element to a fresh signed recording URL.
app.get('/api/groups/:group/conversations/:id/audio', async ({ params, res }) => {
  const c = await ds.getConversation(params.group, params.id);
  if (!c.audio_url) throw httpError(404, 'this conversation has no recording');
  const src = await ds.resolveAudio(c.audio_url);
  res.writeHead(302, { location: src, 'cache-control': 'no-store' });
  res.end();
});

// ---- Step 2: checklists (every save is a new immutable version) ---------------
cl.seedDefault();
app.get('/api/checklists', ({ query }) => cl.list({ includeDeleted: query.get('deleted') === '1' }));
app.post('/api/checklists', ({ body }) => cl.create(body));
app.get('/api/checklists/:id', ({ params, query }) => cl.get(params.id, query.get('version')));
app.put('/api/checklists/:id', ({ params, body }) => cl.update(params.id, body));
app.delete('/api/checklists/:id', ({ params }) => cl.remove(params.id));
app.get('/api/checklists/:id/versions', ({ params }) => cl.history(params.id));

// ---- Step 3: evaluation -------------------------------------------------------
app.get('/api/model', () => ({ ...providerInfo(), pricing: pricing() }));

// Preview the generated prompt (shows the jury it is built from the config).
app.get('/api/groups/:group/conversations/:id/prompt', async ({ params, query }) => {
  const conv = await ds.getConversation(params.group, params.id);
  const checklist = cl.get(query.get('checklist') || 'chat-quality');
  const facts = computeFacts(conv);
  return { system: buildSystemPrompt(), user: buildUserPrompt(checklist, conv, facts), facts };
});

app.post('/api/groups/:group/conversations/:id/evaluate', async ({ params, body }) => {
  const conv = await ds.getConversation(params.group, params.id);
  const checklist = cl.get(body.checklist_id || 'chat-quality', body.checklist_version);
  return ev.evaluate({ group: params.group, conv, checklist });
});

app.get('/api/groups/:group/conversations/:id/evaluation', async ({ params, query }) => {
  const e = ev.getEvaluation(params.group, params.id, query.get('checklist') || 'chat-quality');
  if (!e) throw httpError(404, 'not evaluated yet');
  if (!e.review_flags) e.review_flags = computeReviewFlags(e, await ds.getConversation(params.group, params.id), cl.get(e.checklist.id, e.checklist.version));
  return e;
});

app.get('/api/groups/:group/evaluations', async ({ params, query }) => {
  const evals = ev.listEvaluations(params.group, query.get('checklist'));
  if (evals.some((e) => !e.review_flags)) {
    const convs = Object.fromEntries((await ds.getConversations(params.group)).map((c) => [c.conversation_id, c]));
    for (const e of evals) if (!e.review_flags) e.review_flags = computeReviewFlags(e, convs[e.conversation_id], cl.get(e.checklist.id, e.checklist.version));
  }
  return evals.map((e) => ({
    conversation_id: e.conversation_id,
    checklist: e.checklist,
    created_at: e.created_at,
    model: e.model,
    original_total: e.original_score.total,
    final_total: e.final_score.total,
    gross_error: e.final_score.gross_error,
    open_appeals: e.appeals.filter((a) => a.status === 'open').length,
    review_flags: (e.review_flags || []).length,
    cost_usd_estimate: e.cost_usd_estimate,
  }));
});

// ---- Step 6: appeals ----------------------------------------------------------
app.get('/api/groups/:group/appeals', ({ params, query }) =>
  ap.listAppeals(params.group, { status: query.get('status') || undefined }),
);

app.post('/api/groups/:group/conversations/:id/appeals', ({ params, body }) =>
  ap.fileAppeal({
    group: params.group,
    convId: params.id,
    checklistId: body.checklist_id || 'chat-quality',
    criterionId: body.criterion_id,
    comment: body.comment,
    author: body.author,
  }),
);

app.post('/api/groups/:group/conversations/:id/appeals/:appeal/decision', ({ params, body }) =>
  ap.decide({
    group: params.group,
    convId: params.id,
    checklistId: body.checklist_id || 'chat-quality',
    appealId: params.appeal,
    action: body.action,
    answer: body.answer,
    reason: body.reason,
    reviewer: body.reviewer,
  }),
);

// ---- Step 7: batch ------------------------------------------------------------
app.post('/api/batch', ({ body }) =>
  batch.startBatch({
    group: body.group_id,
    checklistId: body.checklist_id || 'chat-quality',
    onlyMissing: body.only_missing !== false,
    refresh: !!body.refresh,
    concurrency: body.concurrency,
  }),
);
app.get('/api/batch', () => batch.listJobs());
app.get('/api/batch/:id', ({ params }) => batch.getJob(params.id));
app.post('/api/batch/:id/cancel', ({ params }) => batch.cancelJob(params.id));
app.post('/api/batch/:id/retry', ({ params }) => batch.retryFailed(params.id));

// CSV of all results for a group (final scores + per-criterion answers).
app.get('/api/groups/:group/results.csv', ({ params, query, res }) => {
  const checklistId = query.get('checklist') || 'chat-quality';
  const evals = ev.listEvaluations(params.group, checklistId).sort((a, b) => a.conversation_id.localeCompare(b.conversation_id));
  const ids = [...new Set(evals.flatMap((e) => e.criteria.map((c) => c.id)))];
  const esc = (v) => (v == null ? '' : /[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const lines = [['conversation_id', 'language', 'channel', 'checklist_version', 'original_total', 'final_total', 'gross_error', ...ids].join(',')];
  for (const e of evals) {
    const fin = Object.fromEntries(e.final_score.criteria.map((c) => [c.id, c.answer]));
    lines.push([e.conversation_id, e.language, e.channel, e.checklist.version, e.original_score.total, e.final_score.total, e.final_score.gross_error, ...ids.map((i) => fin[i])].map(esc).join(','));
  }
  res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="cqa-${params.group}.csv"` });
  res.end('﻿' + lines.join('\n'));
});

// ---- Step 8: validation (human labels vs model) ----------------------------------
app.get('/api/groups/:group/validation', ({ params, query }) => ({
  suggested: params.group === 'DEV' ? val.SUGGESTED_DEV : [],
  ...val.agreement(params.group, query.get('checklist') || 'chat-quality'),
}));
app.get('/api/groups/:group/conversations/:id/label', ({ params, query }) =>
  val.getLabel(params.group, params.id, query.get('checklist') || 'chat-quality') || {},
);
app.put('/api/groups/:group/conversations/:id/label', ({ params, body }) => val.saveLabel(params.group, params.id, body));

// ---- Insights ---------------------------------------------------------------------
app.get('/api/groups/:group/insights', ({ params, query }) => ins.insights(params.group, query.get('checklist') || 'chat-quality'));

// ---- Export / import (share results between laptops, offline demo) -------------
app.get('/api/groups/:group/export', ({ params, res }) => {
  const body = JSON.stringify(bundle.exportBundle(params.group));
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  res.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'content-disposition': `attachment; filename="cqa-${params.group}-${stamp}.json"`,
  });
  res.end(body);
});
app.post('/api/import', ({ body }) => bundle.importBundle(body));

// ---- static UI ----------------------------------------------------------------
app.static('/shared/', path.join(PROJECT_ROOT, 'shared')); // pure modules shared with the browser
app.static('/', path.join(PROJECT_ROOT, 'web'));

const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || '127.0.0.1';
app.listen(port, host).then(() => console.log(`CQA running on http://${host}:${port}`));
