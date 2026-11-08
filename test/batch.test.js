import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.CQA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cqa-b-'));
process.env.BATCH_MAX_ATTEMPTS = '3';
const store = await import('../server/lib/store.js');
const cl = await import('../server/lib/checklists.js');
const batch = await import('../server/lib/batch.js');
const { LlmError } = await import('../server/lib/llm.js');

// Seed a fake cached group so no network is used.
const rec = (id) => ({ conversation_id: id, channel: 'agent chat', language: 'RU', audio_url: null, transcript: [
  { timestamp: '00:00', speaker: 'client', text: 'вопрос' },
  { timestamp: '00:30', speaker: 'operator', text: 'Здравствуйте, я Алина. Ответ.' },
] });
store.writeJson(store.p('cache', 'G.json'), { fetched_at: 'x', group_id: 'G', response: { isSuccess: true, data: { records: ['a', 'b', 'c'].map(rec) } } });
cl.seedDefault();

const ok = JSON.stringify({ criteria: ['01', '02', '03', '04', '05', '06', '07', '08'].map((id) => ({
  id, answer: { '04': '20', '06': '10', '02': 'na', '03': 'na', '07': 'na', '08': 'no' }[id] || 'yes',
  explanation: 'x', evidence: [1], checked_range: null, na_reason: ['02', '03', '07'].includes(id) ? 'r' : null, quote: '',
})) });

const waitDone = async (id) => {
  for (let i = 0; i < 200; i++) {
    const j = batch.getJob(id);
    if (j.status !== 'running') return j;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('timeout');
};

test('batch: transient failures are retried, permanent ones reported, then retry-failed works', async (t) => {
  const calls = {};
  const llm = async ({ user }) => {
    const id = /ID: (\w+)/.exec(user)[1];
    calls[id] = (calls[id] || 0) + 1;
    if (id === 'b' && calls[id] === 1) throw new LlmError('503 overloaded', { status: 503 });
    if (id === 'c') throw new LlmError('bad key', { status: 401, retryable: false });
    return { text: ok, usage: { input: 100, output: 10 }, model: 'stub' };
  };
  const job = await batch.startBatch({ group: 'G', concurrency: 2, llm });
  assert.equal(job.items.length, 3);
  assert.equal(job.concurrency, 1);
  const done = await waitDone(job.id);
  const st = Object.fromEntries(done.items.map((i) => [i.conversation_id, i]));
  assert.equal(st.a.status, 'done');
  assert.equal(st.a.total, 100);
  assert.equal(st.b.status, 'done');
  assert.equal(st.b.attempts, 2);
  assert.equal(st.c.status, 'error');
  assert.equal(st.c.attempts, 1);
  assert.equal(done.counts.done, 2);
  assert.equal(done.usage.calls, 2);

  // second run with onlyMissing skips the evaluated ones
  const again = await batch.startBatch({ group: 'G', llm });
  assert.deepEqual(again.items.filter((i) => i.status === 'skipped').map((i) => i.conversation_id).sort(), ['a', 'b']);
  const fin = await waitDone(again.id);
  assert.equal(fin.items.find((i) => i.conversation_id === 'c').status, 'error');
});
