// Deterministic facts computed in code and handed to the LLM, so it never has
// to do time arithmetic or hunt for system events.
import { fmtClock } from '../../shared/normalize.js';

const RX = {
  escalation: [/эскалация на оператора/i, /chat transferred to an agent/i, /чат операторға жіберілді/i, /переведен .*на представителя/i, /агент присоединился/i],
  identity: [/личность клиента подтверждена/i, /identity verified/i, /жеке басы расталды/i, /идентификацию успешно/i],
  clientLeft: [/клиент покинул чат/i, /клиент завершил разговор/i, /соединение с клиентом прервано/i, /connection to customer lost/i, /клиентпен байланыс үзілді/i, /customer left/i],
  operatorClosed: [/оператор закрыл чат/i, /agent closed the chat/i, /оператор чатты жапты/i],
  holdStart: [/клиент находится на удержании/i, /on hold/i],
  holdEnd: [/клиент больше не находится на удержании/i, /no longer on hold/i],
};
const hit = (k, t) => RX[k].some((r) => r.test(t));

export function computeFacts(conv, { firstReactionLimitSec = 180 } = {}) {
  const ms = conv.messages;
  const f = { notes: [] };
  const esc = ms.find((m) => m.speaker === 'system' && hit('escalation', m.text));
  const firstOp = ms.find((m) => m.speaker === 'operator');
  f.escalation_idx = esc?.idx ?? null;
  f.first_operator_idx = firstOp?.idx ?? null;
  if (esc && firstOp && esc.offset_sec != null && firstOp.offset_sec != null) {
    const d = firstOp.offset_sec - esc.offset_sec;
    f.first_reaction_sec = Math.round(d);
    f.first_reaction_over_limit = d > firstReactionLimitSec;
    f.notes.push(
      `Первая реакция оператора: через ${fmtClock(d)} после передачи оператору (сообщение [${esc.idx}] → [${firstOp.idx}]); порог ${fmtClock(firstReactionLimitSec)} ${d > firstReactionLimitSec ? 'ПРЕВЫШЕН' : 'соблюдён'}.`,
    );
  } else if (!firstOp) {
    f.notes.push('Оператор не написал ни одной реплики.');
  }

  // Longest operator silence while the client is waiting for an answer.
  let longest = null;
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i];
    if (m.speaker !== 'client' || m.offset_sec == null || (firstOp && m.idx < firstOp.idx)) continue;
    const next = ms.slice(i + 1).find((x) => x.speaker === 'operator');
    if (!next || next.offset_sec == null) continue;
    const gap = next.offset_sec - m.offset_sec;
    if (!longest || gap > longest.gap) longest = { gap, from: m.idx, to: next.idx };
  }
  if (longest)
    f.notes.push(`Самая долгая пауза оператора после реплики клиента: ${fmtClock(longest.gap)} ([${longest.from}] → [${longest.to}]).`);

  const id = ms.filter((m) => m.speaker === 'system' && hit('identity', m.text)).map((m) => m.idx);
  f.identity_confirmed_idx = id;
  f.notes.push(id.length ? `Системное подтверждение личности: ${id.map((i) => `[${i}]`).join(', ')}.` : 'Системного сообщения о подтверждении личности нет.');

  const left = ms.find((m) => m.speaker === 'system' && hit('clientLeft', m.text));
  const closed = ms.find((m) => m.speaker === 'system' && hit('operatorClosed', m.text));
  if (left) f.notes.push(`Клиент покинул диалог / связь прервалась: [${left.idx}] «${left.text}».`);
  if (closed) f.notes.push(`Оператор закрыл чат: [${closed.idx}].`);

  const holds = [];
  let hs = null;
  for (const m of ms) {
    if (m.speaker !== 'system') continue;
    if (hit('holdEnd', m.text) && hs != null) {
      holds.push([hs, m.idx]);
      hs = null;
    } else if (hit('holdStart', m.text)) hs = m.idx;
  }
  if (holds.length)
    f.notes.push(`Клиент на удержании: ${holds.map(([a, b]) => `[${a}]–[${b}]`).join(', ')}. Реплики operator внутри — внутренний разговор/консультация, клиент их не слышит.`);
  f.holds = holds;

  const dups = ms.filter((m) => m.duplicate_of != null);
  if (dups.length) f.notes.push(`Дубликаты распознавания: ${dups.map((m) => `[${m.idx}]=[${m.duplicate_of}]`).join(', ')} — игнорируйте повтор.`);

  const lastClient = [...ms].reverse().find((m) => m.speaker === 'client');
  f.last_client_idx = lastClient?.idx ?? null;
  f.last_idx = ms.length - 1;
  return f;
}
