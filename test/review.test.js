import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quoteFound, computeReviewFlags } from '../server/lib/review.js';
import { providerInfo } from '../server/lib/llm.js';

const ACTIVE_MODEL = providerInfo().model;

test('quote matching tolerates punctuation, case, ё and "…" gaps', () => {
  const t = ['Здравствуйте, меня зовут Алина. В веб-версии откройте вкладку «Кабинет». Название тарифа будет под вашим ФИО.'];
  assert.equal(quoteFound('меня зовут алина', t), true);
  assert.equal(quoteFound('«Кабинет»… Название тарифа будет', t), true);
  assert.equal(quoteFound('Скиньте деньги мне на карту', t), false);
  assert.equal(quoteFound('', t), true);
});

test('flags: missing quote, hedged explanation, repairs', () => {
  const conv = { messages: [{ idx: 0, text: 'Hello, I am Maya.' }, { idx: 1, text: 'I can see a withdrawal restriction.' }] };
  const rec = {
    model: ACTIVE_MODEL, repairs: 1,
    criteria: [
      { id: '01', explanation: 'Greeted.', evidence: [0], quote: 'I am Maya' },
      { id: '08', explanation: 'Нарушений нет. Хотя оператор упомянул ограничение…', evidence: [1], quote: 'invented sentence here' },
    ],
  };
  const checklist = { criteria: [{ id: '01', type: 'binary' }, { id: '08', type: 'flag' }] };
  rec.criteria[1].answer = 'no';
  const codes = computeReviewFlags(rec, conv, checklist).map((f) => `${f.criterion_id}:${f.code}`);
  assert.deepEqual(codes.sort(), ['08:hedged', '08:quote_not_found', 'null:repaired']);
});

test('contrast words alone do not flag a normal "No" explanation', () => {
  const checklist = { criteria: [{ id: '02', type: 'binary' }] };
  const rec = { model: ACTIVE_MODEL, repairs: 0, criteria: [{ id: '02', answer: 'no', explanation: 'Оператор переспросил, хотя клиент уже указал сайт.', evidence: [], quote: '' }] };
  assert.deepEqual(computeReviewFlags(rec, { messages: [] }, checklist), []);
  rec.criteria[0].explanation = 'Возможно, оператор учёл детали.';
  assert.equal(computeReviewFlags(rec, { messages: [] }, checklist)[0].code, 'hedged');
});
