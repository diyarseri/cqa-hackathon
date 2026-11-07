import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseClock, parseIso, normalizeRecord, fmtClock } from '../shared/normalize.js';
import { extractAudioSrc } from '../server/lib/datasource.js';

test('MM:SS and H:MM:SS → seconds', () => {
  assert.equal(parseClock('00:00'), 0);
  assert.equal(parseClock('02:04'), 124);
  assert.equal(parseClock('14:07'), 847);
  assert.equal(parseClock('1:02:03'), 3723);
  assert.equal(parseClock('2026-11-03T15:49:13Z'), null);
});

test('ISO 8601 with 7-digit fraction and offset', () => {
  const a = parseIso('2026-11-03T15:49:13.1900670+00:00');
  const b = parseIso('2026-11-03T15:49:22.4171535+00:00');
  assert.ok(Math.abs(b - a - 9.2270865) < 1e-6);
  assert.equal(parseIso('2026-11-03T18:49:13+03:00'), parseIso('2026-11-03T15:49:13Z'));
  assert.equal(parseIso('00:13'), null);
});

test('chat record keeps original timestamps and adds offsets', () => {
  const r = normalizeRecord({
    conversation_id: 'x', channel: 'agent chat', language: 'RU', audio_url: null,
    transcript: [
      { timestamp: '00:00', speaker: 'client', text: 'a' },
      { timestamp: '01:15', speaker: 'operator', text: 'b' },
    ],
  });
  assert.equal(r.timestamp_format, 'clock');
  assert.equal(r.messages[1].timestamp, '01:15');
  assert.equal(r.messages[1].offset_sec, 75);
  assert.equal(r.messages[1].audio_sec, null);
  assert.equal(r.messages[1].idx, 1);
});

test('call audio offset subtracts paused recording, keeps holds, clamps pre-recording', () => {
  const T = (s) => new Date(Date.UTC(2026, 10, 3, 15, 0, 0) + s * 1000).toISOString();
  const r = normalizeRecord({
    conversation_id: 'c', channel: 'voice call', language: 'RU', audio_url: 'https://x',
    transcript: [
      { timestamp: T(0), speaker: 'bot', text: 'before recording' },
      { timestamp: T(5), speaker: 'system', text: 'Запись и транскрибирование запущены.' },
      { timestamp: T(20), speaker: 'bot', text: 'ivr' },
      { timestamp: T(30), speaker: 'system', text: 'Запись и транскрибирование приостановлены.' },
      { timestamp: T(42), speaker: 'system', text: 'Запись и транскрибирование возобновлены.' },
      { timestamp: T(50), speaker: 'operator', text: 'hello' },
      { timestamp: T(60), speaker: 'system', text: 'Клиент находится на удержании.' },
      { timestamp: T(160), speaker: 'operator', text: 'thanks for waiting' },
    ],
  });
  const a = r.messages.map((m) => m.audio_sec);
  assert.deepEqual(a, [0, 0, 15, 25, 25, 33, 43, 143]);
  assert.equal(r.messages[7].offset_sec, 160);
});

test('exact duplicate messages are marked, not removed', () => {
  const m = { timestamp: '2026-11-03T13:11:40.9991021+00:00', speaker: 'client', text: 'dup' };
  const r = normalizeRecord({ conversation_id: 'd', transcript: [m, { ...m }] });
  assert.equal(r.messages.length, 2);
  assert.equal(r.messages[0].duplicate_of, null);
  assert.equal(r.messages[1].duplicate_of, 0);
});

test('audio player page → blob src', () => {
  const html = '<audio id="a" controls><source src="https://h/f?sp=r&amp;sig=Q%3D&amp;rsct=audio%2Fmpeg" type="audio/mpeg"></audio>';
  assert.equal(extractAudioSrc(html), 'https://h/f?sp=r&sig=Q%3D&rsct=audio%2Fmpeg');
  assert.equal(extractAudioSrc('<html></html>'), null);
});

test('fmtClock', () => {
  assert.equal(fmtClock(75.9), '01:15');
  assert.equal(fmtClock(3723), '1:02:03');
});
