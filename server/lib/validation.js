// Human labels + model/human agreement per criterion.
import { p, readJson, writeJson, listJson, safeId, httpError } from './store.js';
import { listEvaluations } from './evaluator.js';
import * as cl from './checklists.js';
import { normalizeAnswer, score } from '../../shared/scoring.js';

// Default validation sample: mixed languages, channels, good and bad dialogues.
export const SUGGESTED_DEV = [
  'p1-ru-001', 'p1-ru-009', 'p1-ru-018', 'p1-ru-029', 'p1-kz-005',
  'p1-kz-013', 'p1-en-007', 'p1-en-015', 'p4-ru-002', 'p4-ru-004',
];

const file = (g, conv, cid) => p('labels', safeId(g), `${safeId(conv)}__${safeId(cid)}.json`);

export function getLabel(group, convId, checklistId) {
  return readJson(file(group, convId, checklistId));
}

export function saveLabel(group, convId, { checklist_id = 'chat-quality', answers, notes = {}, labeler = '' }) {
  const checklist = cl.get(checklist_id);
  const norm = {};
  for (const k of checklist.criteria) {
    if (answers?.[k.id] == null || answers[k.id] === '') throw httpError(400, `answer for ${k.id} is required`);
    try {
      norm[k.id] = normalizeAnswer(k, answers[k.id]);
    } catch (e) {
      throw httpError(400, e.message);
    }
  }
  const rec = {
    group_id: group,
    conversation_id: convId,
    checklist: { id: checklist.id, version: checklist.version },
    answers: norm,
    notes,
    labeler,
    total: score(checklist, norm).total,
    updated_at: new Date().toISOString(),
  };
  writeJson(file(group, convId, checklist.id), rec);
  return rec;
}

export function agreement(group, checklistId = 'chat-quality') {
  const checklist = cl.get(checklistId);
  const labels = listJson(p('labels', safeId(group))).filter((l) => l.checklist.id === checklistId);
  const evals = Object.fromEntries(listEvaluations(group, checklistId).map((e) => [e.conversation_id, e]));
  const pairs = labels.filter((l) => evals[l.conversation_id]);
  const per = checklist.criteria.map((k) => {
    const steps = k.type === 'scale' ? [...k.scale.steps.map((s) => s.value)].sort((a, b) => b - a) : null;
    let n = 0, exact = 0, near = 0;
    const disagreements = [];
    for (const l of pairs) {
      const e = evals[l.conversation_id];
      const m = e.criteria.find((c) => c.id === k.id)?.answer; // raw model answer, before appeals
      const hmn = l.answers[k.id];
      if (m === undefined || hmn === undefined) continue;
      n++;
      if (m === hmn) exact++;
      else disagreements.push({ conversation_id: l.conversation_id, human: hmn, model: m });
      if (m === hmn || (steps && typeof m === 'number' && typeof hmn === 'number' && Math.abs(steps.indexOf(m) - steps.indexOf(hmn)) <= 1)) near++;
    }
    return {
      id: k.id, title: k.title, type: k.type, n,
      exact: n ? exact / n : null,
      within_one_step: steps && n ? near / n : null,
      disagreements,
    };
  });
  const diffs = pairs
    .map((l) => ({ id: l.conversation_id, human: l.total, model: evals[l.conversation_id].original_score.total }))
    .filter((d) => d.human != null && d.model != null);
  const totalAll = per.reduce((s, c) => s + c.n, 0);
  return {
    group_id: group,
    checklist: { id: checklist.id, version: checklist.version },
    labelled: labels.length,
    compared: pairs.length,
    overall_exact: totalAll ? per.reduce((s, c) => s + (c.exact ?? 0) * c.n, 0) / totalAll : null,
    total_mae: diffs.length ? diffs.reduce((s, d) => s + Math.abs(d.human - d.model), 0) / diffs.length : null,
    totals: diffs,
    criteria: per,
    labelled_ids: labels.map((l) => l.conversation_id),
  };
}
