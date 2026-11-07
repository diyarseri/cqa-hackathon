import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combineRuns } from '../server/lib/evaluator.js';

const cl = { criteria: [
  { id: 'b', type: 'binary' },
  { id: 's', type: 'scale', scale: { steps: [{ value: 10 }, { value: 7 }, { value: 4 }, { value: 0 }] } },
  { id: 'n', type: 'binary', na: { allowed: true } },
] };
const run = (b, s, n, tag) => ({
  criteria: [
    { id: 'b', answer: b, explanation: `b-${tag}` },
    { id: 's', answer: s, explanation: `s-${tag}` },
    { id: 'n', answer: n, explanation: `n-${tag}` },
  ],
  usage: { input: 10, output: 2, calls: 1 }, repairs: 0, model: 'm', facts: {}, prompt_chars: 1,
});

test('majority for binary/N/A, median for split scales, explanation from a matching run', () => {
  const r = combineRuns(cl, [run('yes', 10, 'na', 1), run('no', 4, 'yes', 2), run('yes', 7, 'na', 3)]);
  const by = Object.fromEntries(r.criteria.map((c) => [c.id, c]));
  assert.equal(by.b.answer, 'yes');
  assert.deepEqual(by.b.votes, { agree: 2, total: 3, answers: ['yes', 'no', 'yes'] });
  assert.equal(by.b.explanation, 'b-1');
  assert.equal(by.s.answer, 7); // all different → median
  assert.equal(by.s.explanation, 's-3');
  assert.equal(by.n.answer, 'na');
  assert.equal(r.usage.calls, 3);
  assert.equal(r.usage.input, 30);
});

test('a single run passes through unchanged', () => {
  const one = run('yes', 10, 'na', 1);
  assert.equal(combineRuns(cl, [one]), one);
});
