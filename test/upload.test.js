import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.CQA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cqa-up-'));
const ds = await import('../server/lib/datasource.js');
const msgs = [{ timestamp: '00:00', speaker: 'client', text: 'Где тариф?' }, { timestamp: '00:10', speaker: 'operator', text: 'Здравствуйте, я Алина.' }];

test('accepts API format, record list, single record and bare transcript', () => {
  assert.equal(ds.parseUpload({ isSuccess: true, data: { records: [{ conversation_id: 'a', transcript: msgs }] } })[0].conversation_id, 'a');
  assert.equal(ds.parseUpload([{ transcript: msgs }, { transcript: msgs }], { fileName: 'set.json' })[1].conversation_id, 'set-2');
  const one = ds.parseUpload({ conversation_id: 'x1', language: 'kz', transcript: msgs })[0];
  assert.equal(one.language, 'KZ');
  assert.equal(one.channel, 'agent chat');
  assert.equal(ds.parseUpload(msgs, { fileName: 'my chat.json' })[0].conversation_id, 'my-chat');
});

test('rejects things that are not dialogues, with a Russian message', () => {
  assert.throws(() => ds.parseUpload({ foo: 1 }), /Не похоже на диалог/);
  assert.throws(() => ds.parseUpload({ transcript: [] }), /пустой/);
  assert.throws(() => ds.parseUpload({ transcript: [{ text: 'a' }] }), /нет speaker/);
});

test('uploaded group is stored locally, replaces by id, and is never fetched from the API', async () => {
  ds.addUploaded('UPLOAD', ds.parseUpload({ conversation_id: 'u1', transcript: msgs }));
  const r = ds.addUploaded('UPLOAD', ds.parseUpload({ conversation_id: 'u1', transcript: [...msgs, msgs[0]] }));
  assert.equal(r.total, 1);
  const convs = await ds.getConversations('UPLOAD');
  assert.equal(convs[0].messages.length, 3);
  await assert.rejects(ds.fetchGroup('UPLOAD'), /загружен вручную/);
});
