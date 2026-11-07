// The evaluation prompt is GENERATED from the checklist config — nothing about
// specific criteria is hardcoded here. Change the checklist, the prompt changes.
import { allowedAnswers, scaleMax } from '../../shared/checklist.js';
import { fmtClock } from '../../shared/normalize.js';

const LANG = { RU: 'русский', KZ: 'казахский', EN: 'английский' };
const SPEAKER = { client: 'CLIENT', operator: 'OPERATOR', bot: 'BOT', system: 'SYSTEM' };

export function buildSystemPrompt() {
  return [
    'Ты — эксперт службы контроля качества (QA) брокерской компании. Ты оцениваешь работу ОПЕРАТОРА в диалоге с клиентом строго по выданному чек-листу.',
    'Диалоги бывают на русском, казахском и английском. Понимай их на языке оригинала; пояснения пиши по-русски.',
    'Отвечай ТОЛЬКО JSON по заданной схеме. Не придумывай реплик, которых нет в транскрипте. Ссылайся на реплики по их номеру в квадратных скобках.',
  ].join('\n');
}

export function describeCriterion(k, sectionTitle) {
  const lines = [];
  lines.push(`### Критерий ${k.id}. ${k.title}${sectionTitle ? ` (секция: ${sectionTitle})` : ''}`);
  if (k.type === 'flag') {
    lines.push('Тип: ФЛАГ без баллов. Ответ "yes" — нарушение выявлено, "no" — не выявлено.');
  } else if (k.type === 'binary') {
    lines.push(`Тип: да/нет, вес ${k.weight}. Ответ "yes" или "no"${k.na?.allowed ? ' или "na"' : ''}.`);
  } else {
    lines.push(`Тип: шкала, вес ${k.weight}. Выбери ровно одну ступень${k.na?.allowed ? ' или "na"' : ''}:`);
    for (const s of [...k.scale.steps].sort((a, b) => b.value - a.value))
      lines.push(`  - "${s.value}": ${s.label}`);
  }
  lines.push(`Формулировка: ${k.description}`);
  lines.push(k.na?.allowed ? `N/A допустим только если: ${k.na.condition}` : 'N/A НЕ допускается.');
  if (k.guidance?.trim()) lines.push(`Уточнения: ${k.guidance.trim()}`);
  lines.push(`Допустимые значения answer: ${allowedAnswers(k).map((a) => JSON.stringify(String(a))).join(', ')}.`);
  return lines.join('\n');
}

export function formatTranscript(conv, { audioTimes = false } = {}) {
  return conv.messages
    .map((m) => {
      const t = audioTimes && m.audio_sec != null ? fmtClock(m.audio_sec) : m.offset_sec != null ? fmtClock(m.offset_sec) : m.timestamp;
      const dup = m.duplicate_of != null ? ` (повтор [${m.duplicate_of}])` : '';
      return `[${m.idx}] (${t}) ${SPEAKER[m.speaker] || m.speaker.toUpperCase()}${dup}: ${oneLine(m.text)}`;
    })
    .join('\n');
}

const oneLine = (s) => String(s).replace(/\s+/g, ' ').trim();

export function buildUserPrompt(checklist, conv, facts, { audio = false } = {}) {
  const secTitle = Object.fromEntries((checklist.sections || []).map((s) => [s.id, s.title]));
  const parts = [];
  parts.push(`# Чек-лист: ${checklist.name} (версия ${checklist.version ?? '—'})`);
  if (checklist.global_rules?.length) {
    parts.push('## Общие правила');
    parts.push(checklist.global_rules.map((r, i) => `${i + 1}. ${r}`).join('\n'));
  }
  parts.push('## Критерии');
  parts.push(checklist.criteria.map((k) => describeCriterion(k, secTitle[k.section])).join('\n\n'));

  parts.push('## Диалог');
  parts.push(
    `ID: ${conv.conversation_id}; канал: ${conv.channel}; язык клиента: ${LANG[conv.language] || conv.language}; реплик: ${conv.messages.length} (номера 0–${conv.messages.length - 1}).`,
  );
  if (conv.channel === 'voice call') parts.push('Это ЗВОНОК: текст — автоматическая расшифровка речи с ошибками распознавания.');
  if (audio)
    parts.push('К сообщению приложена АУДИОЗАПИСЬ звонка. Критерии выше оценивай ПО ЗВУКУ голоса оператора (тон, интонация, темп, дикция, паузы), а не по тексту. Транскрипт нужен, чтобы указать номера реплик-доказательств; время в транскрипте — позиция в записи (MM:SS). Голос автоответчика и клиента не оценивай.');
  if (facts?.notes?.length) {
    parts.push('### Факты, вычисленные системой (им можно доверять)');
    parts.push(facts.notes.map((n) => `- ${n}`).join('\n'));
  }
  parts.push('### Транскрипт');
  parts.push(formatTranscript(conv, { audioTimes: audio }));

  parts.push('## Что вернуть');
  parts.push(
    [
      `Верни JSON {"criteria": [...]} — ровно по одному объекту на каждый критерий (${checklist.criteria.map((k) => k.id).join(', ')}), в этом порядке. Поля:`,
      '- "id": ID критерия.',
      '- "answer": строка из допустимых значений этого критерия.',
      '- "explanation": 1–3 предложения по-русски: что сделал или не сделал оператор и почему это такой ответ. Образец: «Завершение — Нет. После ответа на вопрос оператор закрыл чат без прощания.»',
      '- "evidence": массив номеров реплик (operator, client, bot или system), которые подтверждают вывод. Для выполненного действия — реплика, где оно выполнено.',
      '- "checked_range": если действие пропущено или выполнено неверно — {"from": N, "to": M}, участок, где оно ожидалось; иначе null.',
      '- "na_reason": если answer = "na" — какое условие неприменимости выполнено; иначе null.',
      '- "quote": короткая дословная цитата (до 120 символов) из главной реплики-доказательства, на языке оригинала; или "" если доказательство — отсутствие действия.',
    ].join('\n'),
  );
  return parts.join('\n\n');
}

/** JSON schema for Gemini structured output (OpenAPI subset). */
export function responseSchema() {
  return {
    type: 'OBJECT',
    properties: {
      criteria: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            id: { type: 'STRING' },
            answer: { type: 'STRING' },
            explanation: { type: 'STRING' },
            evidence: { type: 'ARRAY', items: { type: 'INTEGER' } },
            checked_range: {
              type: 'OBJECT',
              nullable: true,
              properties: { from: { type: 'INTEGER' }, to: { type: 'INTEGER' } },
              required: ['from', 'to'],
            },
            na_reason: { type: 'STRING', nullable: true },
            quote: { type: 'STRING' },
          },
          required: ['id', 'answer', 'explanation', 'evidence', 'checked_range', 'na_reason', 'quote'],
          propertyOrdering: ['id', 'answer', 'explanation', 'evidence', 'checked_range', 'na_reason', 'quote'],
        },
      },
    },
    required: ['criteria'],
  };
}

export { scaleMax };
