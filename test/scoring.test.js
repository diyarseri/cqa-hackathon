import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { score, round, normalizeAnswer, rescoreWithOverrides } from '../shared/scoring.js';

const CL = JSON.parse(fs.readFileSync(new URL('../config/checklist.default.json', import.meta.url)));
const ALL_YES = { '01': 'yes', '02': 'yes', '03': 'yes', '04': 20, '05': 'yes', '06': 10, '07': 'yes', '08': 'no' };
const crit = (r, id) => r.criteria.find((c) => c.id === id);

test('perfect dialogue = 100', () => {
  const r = score(CL, ALL_YES);
  assert.equal(r.total, 100);
  assert.equal(r.gross_error, false);
});

test('PDF case: 03 = N/A, 04 = 15 → 04 is worth 18.75', () => {
  const r = score(CL, { ...ALL_YES, '03': 'na', '04': 15 });
  const c4 = crit(r, '04');
  assert.equal(c4.points, 18.75); // 15/20 * 20 * 100/80
  assert.equal(c4.effective_weight, 25);
  assert.equal(crit(r, '03').points, null);
  assert.equal(crit(r, '03').applicable, false);
  assert.equal(r.applicable_weight, 80);
  assert.equal(r.total, 93.75); // 100 - 25*(5/20)
});

test('scale → weight conversion uses the top step as full weight (06: 7/10 of 15)', () => {
  const r = score(CL, { ...ALL_YES, '06': 7 });
  assert.equal(crit(r, '06').points, 10.5);
  assert.equal(r.total, 95.5);
  const r4 = score(CL, { ...ALL_YES, '06': 4 });
  assert.equal(crit(r4, '06').points, 6);
});

test('No gives zero; several N/A redistribute to a max of 100', () => {
  const r = score(CL, { ...ALL_YES, '02': 'na', '03': 'na', '07': 'na', '05': 'no' });
  // applicable: 01(10) 04(20) 05(15) 06(15) = 60 → factor 100/60
  assert.equal(r.applicable_weight, 60);
  assert.equal(crit(r, '05').points, 0);
  assert.equal(crit(r, '01').effective_weight, 16.67);
  assert.equal(r.total, 75); // 45/60
  const maxSum = r.criteria.reduce((s, c) => s + (c.applicable ? c.weight * (100 / 60) : 0), 0);
  assert.ok(Math.abs(maxSum - 100) < 1e-9);
});

test('rounding to 2 decimals (1/3 cases, half-up)', () => {
  const r = score(CL, { ...ALL_YES, '02': 'na', '03': 'na', '07': 'na', '01': 'no' });
  assert.equal(r.total, 83.33); // 50/60
  assert.equal(round(1.005), 1.01);
  assert.equal(round(2.675), 2.68);
  assert.equal(round(-1.005), -1.01);
  assert.equal(round(83.333333), 83.33);
  assert.equal(round(1e-9), 0);
  assert.equal(round(18.75), 18.75);
});

test('section subtotals add up to the total', () => {
  const r = score(CL, { ...ALL_YES, '03': 'na', '04': 10, '06': 4, '07': 'no' });
  const bySec = Object.fromEntries(r.sections.map((s) => [s.id, s]));
  assert.equal(bySec.start.max, 31.25); // (10+15)*100/80
  assert.equal(bySec.security.max, 25);
  assert.equal(bySec.security.points, 12.5);
  assert.equal(bySec.gross.has_weighted, false);
  assert.equal(bySec.gross.points, null);
  const sum = r.sections.reduce((s, x) => s + (x.points ?? 0), 0);
  assert.ok(Math.abs(sum - r.total) < 0.011);
});

test('gross-error flag is separate and never changes the score', () => {
  const clean = score(CL, ALL_YES);
  const flagged = score(CL, { ...ALL_YES, '08': 'yes' });
  assert.equal(flagged.total, clean.total);
  assert.equal(flagged.gross_error, true);
  assert.deepEqual(flagged.gross_flags, ['08']);
  assert.equal(crit(flagged, '08').points, null);
});

test('no total when no weighted criterion applies', () => {
  const cl = {
    total_points: 100, rounding: 2, sections: [],
    criteria: [
      { id: 'a', type: 'binary', weight: 50, na: { allowed: true, condition: 'x' } },
      { id: 'b', type: 'scale', weight: 50, scale: { steps: [{ value: 2 }, { value: 0 }] }, na: { allowed: true, condition: 'x' } },
      { id: 'g', type: 'flag', weight: 0 },
    ],
  };
  const r = score(cl, { a: 'na', b: 'na', g: 'yes' });
  assert.equal(r.total, null);
  assert.equal(r.gross_error, true);
});

test('weights that do not sum to 100 are normalised to 100', () => {
  const cl = { sections: [], criteria: [
    { id: 'a', type: 'binary', weight: 3 },
    { id: 'b', type: 'binary', weight: 1 },
  ] };
  assert.equal(score(cl, { a: 'yes', b: 'no' }).total, 75);
});

test('invalid answers are rejected', () => {
  assert.throws(() => score(CL, { ...ALL_YES, '01': 'na' }), /N\/A is not allowed/);
  assert.throws(() => score(CL, { ...ALL_YES, '04': 12 }), /one of 20, 15, 10, 5, 0/);
  assert.throws(() => score(CL, { ...ALL_YES, '05': 'maybe' }), /yes\/no/);
  const { '06': _, ...missing } = ALL_YES;
  assert.throws(() => score(CL, missing), /06: missing answer/);
});

test('answer normalisation accepts RU/KZ words and numeric strings', () => {
  const k3 = CL.criteria[2], k4 = CL.criteria[3];
  assert.equal(normalizeAnswer(k3, 'Да'), 'yes');
  assert.equal(normalizeAnswer(k3, 'жоқ'), 'no');
  assert.equal(normalizeAnswer(k3, 'N/A'), 'na');
  assert.equal(normalizeAnswer(k4, '15'), 15);
  assert.equal(normalizeAnswer(k4, { answer: 5 }), 5);
});

test('reviewer override recalculates the total', () => {
  const before = score(CL, { ...ALL_YES, '07': 'no' });
  const after = rescoreWithOverrides(CL, { ...ALL_YES, '07': 'no' }, { '07': 'na' });
  assert.equal(before.total, 95);
  assert.equal(after.total, 100);
});
