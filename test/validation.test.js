import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.CQA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cqa-v-'));
const store = await import('../server/lib/store.js');
const cl = await import('../server/lib/checklists.js');
const val = await import('../server/lib/validation.js');
cl.seedDefault();

const model = (id, answers) => ({
  conversation_id: id, group_id: 'V', checklist: { id: 'chat-quality', version: 1 },
  criteria: Object.entries(answers).map(([cid, answer]) => ({ id: cid, answer })),
  original_score: { total: 80 }, final_score: { total: 80 }, appeals: [],
});
const base = { '01': 'yes', '02': 'na', '03': 'na', '04': 20, '05': 'yes', '06': 10, '07': 'yes', '08': 'no' };

test('agreement per criterion: exact and within one scale step', () => {
  store.writeJson(store.p('evaluations/V/x__chat-quality.json'), model('x', { ...base, '04': 15, '07': 'no' }));
  store.writeJson(store.p('evaluations/V/y__chat-quality.json'), model('y', base));
  val.saveLabel('V', 'x', { answers: base });
  val.saveLabel('V', 'y', { answers: { ...base, '06': 4 } });
  assert.throws(() => val.saveLabel('V', 'z', { answers: { ...base, '01': undefined } }), /01 is required/);
  const r = val.agreement('V');
  const c = Object.fromEntries(r.criteria.map((x) => [x.id, x]));
  assert.equal(r.compared, 2);
  assert.equal(c['01'].exact, 1);
  assert.equal(c['04'].exact, 0.5);
  assert.equal(c['04'].within_one_step, 1); // 20 vs 15 = adjacent steps
  assert.equal(c['06'].within_one_step, 0.5); // 4 vs 10 = two steps apart
  assert.equal(c['07'].exact, 0.5);
  assert.deepEqual(c['07'].disagreements, [{ conversation_id: 'x', human: 'yes', model: 'no' }]);
  assert.equal(r.overall_exact, 13 / 16);
});
