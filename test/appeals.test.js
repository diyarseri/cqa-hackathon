import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.CQA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cqa-ap-'));
const cl = await import('../server/lib/checklists.js');
const ev = await import('../server/lib/evaluator.js');
const ap = await import('../server/lib/appeals.js');
const { normalizeRecord } = await import('../shared/normalize.js');

cl.seedDefault();
const checklist = cl.get('chat-quality');
const conv = normalizeRecord({ conversation_id: 'a-1', channel: 'agent chat', language: 'RU', transcript: [
  { timestamp: '00:00', speaker: 'client', text: 'Где тариф?' },
  { timestamp: '00:10', speaker: 'operator', text: 'Здравствуйте, я Алина. В «Кабинете».' },
  { timestamp: '00:20', speaker: 'operator', text: 'Хорошего дня!' },
] });
const crit = (id, answer, extra = {}) => ({ id, answer, explanation: 'x', evidence: [1], checked_range: null, na_reason: answer === 'na' ? 'r' : null, quote: '', ...extra });
const stub = async () => ({
  model: 'stub', usage: { input: 10, output: 5 },
  text: JSON.stringify({ criteria: [
    crit('01', 'yes'), crit('02', 'na'), crit('03', 'na'), crit('04', '15'),
    crit('05', 'yes'), crit('06', '10'), crit('07', 'no', { checked_range: { from: 1, to: 2 } }), crit('08', 'no'),
  ] }),
});

test('appeal → reviewer changes answer → total recalculated; original kept', async () => {
  const e = await ev.evaluate({ group: 'T', conv, checklist, llm: stub });
  // applicable 01,04,05,06,07 = 65 → (10 + 15 + 15 + 15 + 0)/65*100
  assert.equal(e.original_score.total, 84.62);
  const { appeal } = ap.fileAppeal({ group: 'T', convId: 'a-1', checklistId: 'chat-quality', criterionId: '07', comment: 'Оператор попрощался и итог был в ответе' });
  assert.equal(appeal.status, 'open');
  assert.equal(appeal.disputed_answer, 'no');
  assert.throws(() => ap.fileAppeal({ group: 'T', convId: 'a-1', checklistId: 'chat-quality', criterionId: '07', comment: 'again' }), /already has an open appeal/);
  assert.throws(() => ap.decide({ group: 'T', convId: 'a-1', checklistId: 'chat-quality', appealId: appeal.id, action: 'change', answer: 'yes', reason: '' }), /reason is required/);
  const r = ap.decide({ group: 'T', convId: 'a-1', checklistId: 'chat-quality', appealId: appeal.id, action: 'change', answer: 'yes', reason: 'Итог был в предыдущей реплике' });
  assert.equal(r.appeal.status, 'changed');
  assert.equal(r.evaluation.original_score.total, 84.62);
  assert.equal(r.evaluation.final_score.total, 92.31); // 60/65
  assert.equal(r.appeal.score_before, 84.62);
  assert.equal(r.appeal.score_after, 92.31);
  assert.equal(r.evaluation.criteria.find((c) => c.id === '07').answer, 'no'); // model answer untouched
});

test('confirm keeps the score; invalid change rejected; list shows open first', async () => {
  const { appeal } = ap.fileAppeal({ group: 'T', convId: 'a-1', checklistId: 'chat-quality', criterionId: '04', comment: 'Должно быть 20' });
  assert.throws(() => ap.decide({ group: 'T', convId: 'a-1', checklistId: 'chat-quality', appealId: appeal.id, action: 'change', answer: '17', reason: 'x' }), /one of 20, 15/);
  assert.equal(ap.listAppeals('T')[0].id, appeal.id);
  const r = ap.decide({ group: 'T', convId: 'a-1', checklistId: 'chat-quality', appealId: appeal.id, action: 'confirm', reason: 'Пропущена деталь про комиссию' });
  assert.equal(r.appeal.status, 'confirmed');
  assert.equal(r.evaluation.final_score.total, 92.31);
  assert.equal(ap.listAppeals('T', { status: 'open' }).length, 0);
});

test('re-evaluation archives the previous record with its appeals', async () => {
  await ev.evaluate({ group: 'T', conv, checklist, llm: stub });
  const hist = fs.readdirSync(path.join(process.env.CQA_DATA_DIR, 'evaluations/T/history'));
  assert.equal(hist.length, 1);
  assert.equal(ev.getEvaluation('T', 'a-1', 'chat-quality').appeals.length, 0);
});
