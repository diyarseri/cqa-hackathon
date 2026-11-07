import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const A = fs.mkdtempSync(path.join(os.tmpdir(), 'cqa-a-'));
process.env.CQA_DATA_DIR = A;
const store = await import('../server/lib/store.js');
const cl = await import('../server/lib/checklists.js');
const bundle = await import('../server/lib/bundle.js');

test('export → re-import: identical kept, newer appeal decision wins', () => {
  cl.seedDefault();
  store.writeJson(store.p('cache', 'G.json'), { response: { isSuccess: true, data: { records: [] } } });
  const ev = { conversation_id: 'x', checklist: { id: 'chat-quality', version: 1 }, created_at: '2026-11-07T10:00:00Z', appeals: [] };
  store.writeJson(store.p('evaluations/G/x__chat-quality.json'), ev);
  store.writeJson(store.p('labels/G/x__chat-quality.json'), { conversation_id: 'x', checklist: { id: 'chat-quality' }, updated_at: '2026-11-07T11:00:00Z' });
  const b = bundle.exportBundle('G');
  assert.equal(b.evaluations.length, 1);
  assert.equal(b.checklists.length, 1);

  // import into the same store: identical → kept local
  const same = bundle.importBundle(b);
  assert.equal(same.evaluations, 0);
  assert.equal(same.evaluations_kept_local, 1);
  // newer appeal decision wins
  const newer = structuredClone(b);
  newer.evaluations[0].appeals = [{ created_at: '2026-11-07T12:00:00Z', decision: { decided_at: '2026-11-07T12:05:00Z' } }];
  assert.equal(bundle.importBundle(newer).evaluations, 1);
  assert.equal(store.readJson(store.p('evaluations/G/x__chat-quality.json')).appeals.length, 1);
  assert.throws(() => bundle.importBundle({ format: 'nope' }), /not a cqa-bundle/);
});
