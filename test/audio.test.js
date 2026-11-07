import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeRecord } from '../shared/normalize.js';
import { runModel } from '../server/lib/evaluator.js';
import { validateChecklist } from '../shared/checklist.js';

const base = JSON.parse(fs.readFileSync(new URL('../config/checklist.default.json', import.meta.url)));
const voice = {
  ...base,
  criteria: [...base.criteria, {
    id: '09', section: 'conduct', title: 'Тон и дикция', type: 'scale', weight: 10, source: 'audio',
    description: 'Голос оператора спокойный, речь чёткая.',
    scale: { steps: [{ value: 10, label: 'Да' }, { value: 0, label: 'Нет' }] },
    na: { allowed: true, condition: 'Нет записи звонка (чат).' },
  }],
};
const ans = (ids) => JSON.stringify({ criteria: ids.map((id) => ({
  id, answer: { '04': '20', '06': '10', '09': '10', '02': 'na', '03': 'na', '07': 'na', '08': 'no' }[id] || 'yes',
  explanation: 'x', evidence: [1], checked_range: null, na_reason: ['02', '03', '07'].includes(id) ? 'r' : null, quote: '',
})) });
const rec = (audio) => normalizeRecord({ conversation_id: 'v', channel: audio ? 'voice call' : 'agent chat', language: 'RU', audio_url: audio ? 'https://x' : null,
  transcript: [{ timestamp: '00:00', speaker: 'client', text: 'q' }, { timestamp: '00:05', speaker: 'operator', text: 'Здравствуйте, я Алина.' }] });

test('audio criteria must allow N/A', () => {
  const bad = structuredClone(voice); bad.criteria.at(-1).na = { allowed: false, condition: '' };
  assert.match(validateChecklist(bad).join(' '), /должен допускать N\/A/);
  assert.deepEqual(validateChecklist(voice), []);
});

test('chat: audio criterion is N/A in code, only one model call', async () => {
  const seen = [];
  const llm = async ({ user, audio }) => { seen.push({ audio: !!audio, has09: /Критерий 09/.test(user) }); return { text: ans(['01', '02', '03', '04', '05', '06', '07', '08']), usage: { input: 1, output: 1 }, model: 'stub' }; };
  const r = await runModel(voice, rec(false), { llm, getAudio: async () => Buffer.from('x') });
  assert.deepEqual(seen, [{ audio: false, has09: false }]);
  assert.equal(r.criteria.at(-1).answer, 'na');
});

test('call: second call carries the recording and only the audio criterion', async () => {
  const seen = [];
  const llm = async ({ user, audio }) => {
    seen.push({ audio: audio?.format, has09: /Критерий 09/.test(user), has01: /Критерий 01/.test(user) });
    return { text: audio ? ans(['09']) : ans(['01', '02', '03', '04', '05', '06', '07', '08']), usage: { input: 1, output: 1 }, model: 'stub' };
  };
  const r = await runModel(voice, rec(true), { llm, getAudio: async () => Buffer.from('mp3') });
  assert.deepEqual(seen, [{ audio: undefined, has09: false, has01: true }, { audio: 'mp3', has09: true, has01: false }]);
  assert.equal(r.criteria.length, 9);
  assert.equal(r.criteria.at(-1).answer, 10);
  assert.equal(r.usage.calls, 2);
});
