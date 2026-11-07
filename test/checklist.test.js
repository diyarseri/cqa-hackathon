import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateChecklist, allowedAnswers } from '../shared/checklist.js';

const def = JSON.parse(fs.readFileSync(new URL('../config/checklist.default.json', import.meta.url)));

test('default checklist seeded from the PDF is valid: 8 criteria, weights sum to 100', () => {
  assert.deepEqual(validateChecklist(def), []);
  assert.equal(def.criteria.length, 8);
  assert.equal(def.criteria.reduce((s, k) => s + k.weight, 0), 100);
  assert.deepEqual(def.criteria.map((k) => [k.id, k.type, k.weight, !!k.na.allowed]), [
    ['01', 'binary', 10, false], ['02', 'binary', 15, true], ['03', 'binary', 20, true],
    ['04', 'scale', 20, true], ['05', 'binary', 15, false], ['06', 'scale', 15, false],
    ['07', 'binary', 5, true], ['08', 'flag', 0, false],
  ]);
  assert.deepEqual(allowedAnswers(def.criteria[3]), [20, 15, 10, 5, 0, 'na']);
  assert.deepEqual(allowedAnswers(def.criteria[5]), [10, 7, 4, 0]);
});

test('validator catches broken configs', () => {
  const bad = structuredClone(def);
  bad.criteria[1].na.condition = '';
  bad.criteria[3].scale.steps[1].value = 20;
  bad.criteria.push({ ...bad.criteria[0] });
  const errs = validateChecklist(bad).join(' | ');
  assert.match(errs, /N\/A condition text is required/);
  assert.match(errs, /unique/);
  assert.match(errs, /duplicate criterion id 01/);
});

test('storage: every save is a new version, delete is soft', async () => {
  process.env.CQA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cqa-'));
  const cl = await import(`../server/lib/checklists.js?${Date.now()}`);
  cl.seedDefault();
  cl.seedDefault(); // idempotent
  assert.equal(cl.history('chat-quality').length, 1);
  const edited = { ...cl.get('chat-quality'), name: 'Изменённый' };
  edited.criteria = edited.criteria.filter((k) => k.id !== '07');
  const v2 = cl.update('chat-quality', edited);
  assert.equal(v2.version, 2);
  assert.equal(cl.get('chat-quality', 1).criteria.length, 8);
  assert.equal(cl.get('chat-quality').criteria.length, 7);
  assert.throws(() => cl.update('chat-quality', { ...edited, criteria: [] }), /invalid/);
  cl.remove('chat-quality');
  assert.equal(cl.list().length, 0);
  assert.equal(cl.get('chat-quality').version, 2); // history still readable
});
