// Scoring engine — pure, deterministic, shared by server and browser.
// Implements "Порядок расчёта" from page 2 of the checklist:
//  1. applicability: N/A only where allowed
//  2. Yes = full weight, No = 0; scale = one of the defined steps
//  3. scale → points proportionally to weight (top step = full weight)
//  4. drop N/A criteria and redistribute their weight proportionally so the
//     maximum stays total_points (100)
//  5. round the total to 2 decimals; no total when nothing weighted applies;
//     gross errors (flag criteria) are reported separately and never change points.

import { scaleMax } from './checklist.js';

/** Round half away from zero to `d` decimals, robust to binary float noise (1.005 → 1.01). */
export function round(x, d = 2) {
  if (x == null || !Number.isFinite(x)) return x;
  const s = Math.sign(x) || 1;
  const a = Math.abs(x).toFixed(12); // fixed notation: no "1e-7" strings, trims float noise
  return (s * Math.round(Number(a + 'e' + d))) / Number('1e' + d) || 0;
}

export class ScoringError extends Error {}

/**
 * Normalise one raw answer for a criterion. Accepts 'yes'|'no'|'na', booleans,
 * localized words and scale numbers (as numbers or numeric strings).
 */
export function normalizeAnswer(k, a) {
  if (a && typeof a === 'object' && 'answer' in a) a = a.answer;
  if (typeof a === 'string') {
    const t = a.trim().toLowerCase();
    if (['na', 'n/a', 'н/д', 'n.a.', 'not applicable', 'неприменимо'].includes(t)) a = 'na';
    else if (['yes', 'да', 'иә', 'true'].includes(t)) a = 'yes';
    else if (['no', 'нет', 'жоқ', 'false'].includes(t)) a = 'no';
    else if (t !== '' && !Number.isNaN(Number(t))) a = Number(t);
  }
  if (a === true) a = 'yes';
  if (a === false) a = 'no';
  if (a === 'na') {
    if (!k.na?.allowed) throw new ScoringError(`${k.id}: N/A is not allowed for this criterion`);
    return 'na';
  }
  if (k.type === 'scale') {
    const vals = k.scale.steps.map((s) => s.value);
    if (typeof a !== 'number' || !vals.includes(a))
      throw new ScoringError(`${k.id}: scale answer must be one of ${vals.join(', ')}${k.na?.allowed ? ', na' : ''} (got ${JSON.stringify(a)})`);
    return a;
  }
  if (a !== 'yes' && a !== 'no')
    throw new ScoringError(`${k.id}: answer must be yes/no${k.na?.allowed ? '/na' : ''} (got ${JSON.stringify(a)})`);
  return a;
}

/**
 * @param checklist  checklist config
 * @param answers    { [criterionId]: answer | {answer} }
 * @returns {{
 *   total: number|null, max: number, applicable_weight: number,
 *   criteria: Array<{id, title, section, type, weight, answer, applicable, fraction, effective_weight, points}>,
 *   sections: Array<{id, title, points, max, applicable}>,
 *   gross_error: boolean, gross_flags: string[]
 * }}
 */
export function score(checklist, answers) {
  const total = checklist.total_points ?? 100;
  const digits = checklist.rounding ?? 2;

  const rows = checklist.criteria.map((k) => {
    if (!(k.id in answers)) throw new ScoringError(`${k.id}: missing answer`);
    const answer = normalizeAnswer(k, answers[k.id]);
    const weighted = k.type !== 'flag';
    const applicable = weighted && answer !== 'na';
    let fraction = null;
    if (applicable) fraction = k.type === 'scale' ? answer / scaleMax(k) : answer === 'yes' ? 1 : 0;
    return { id: k.id, title: k.title, section: k.section ?? null, type: k.type, weight: weighted ? k.weight : 0, answer, applicable, fraction };
  });

  const applicableWeight = rows.reduce((s, r) => s + (r.applicable ? r.weight : 0), 0);
  const factor = applicableWeight > 0 ? total / applicableWeight : null;

  for (const r of rows) {
    r.effective_weight = r.applicable ? r.weight * factor : 0; // weight after redistribution
    r.points_exact = r.applicable ? r.fraction * r.effective_weight : null;
    r.points = r.applicable ? round(r.points_exact, digits) : null;
    r.effective_weight = round(r.effective_weight, digits);
  }

  const totalExact = factor == null ? null : rows.reduce((s, r) => s + (r.points_exact ?? 0), 0);

  const sections = (checklist.sections || []).map((s) => {
    const mine = rows.filter((r) => r.section === s.id && r.type !== 'flag');
    const app = mine.filter((r) => r.applicable);
    return {
      id: s.id,
      title: s.title,
      applicable: app.length > 0,
      points: app.length ? round(app.reduce((a, r) => a + r.points_exact, 0), digits) : null,
      max: app.length ? round(app.reduce((a, r) => a + r.weight * factor, 0), digits) : null,
      has_weighted: mine.length > 0,
    };
  });

  const gross = rows.filter((r) => r.type === 'flag' && r.answer === 'yes').map((r) => r.id);
  for (const r of rows) delete r.points_exact;

  return {
    total: totalExact == null ? null : round(totalExact, digits),
    max: total,
    applicable_weight: applicableWeight,
    criteria: rows,
    sections,
    gross_error: gross.length > 0,
    gross_flags: gross,
  };
}

/** Apply reviewer overrides ({criterionId: newAnswer}) on top of model answers and rescore. */
export function rescoreWithOverrides(checklist, answers, overrides = {}) {
  return score(checklist, { ...answers, ...overrides });
}
