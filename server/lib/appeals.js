// Appeals live inside the evaluation record, so the card always shows the
// original model answer, every decision, and the final recalculated score.
import crypto from 'node:crypto';
import { getEvaluation, saveEvaluation, listEvaluations } from './evaluator.js';
import * as cl from './checklists.js';
import { score, normalizeAnswer } from '../../shared/scoring.js';
import { httpError } from './store.js';

function load(group, convId, checklistId) {
  const e = getEvaluation(group, convId, checklistId);
  if (!e) throw httpError(404, `no evaluation for ${convId} with checklist ${checklistId}`);
  return e;
}

/** Final answers = model answers with the latest "changed" decision per criterion applied. */
export function finalAnswers(e) {
  const answers = Object.fromEntries(e.criteria.map((c) => [c.id, c.answer]));
  const decided = e.appeals.filter((a) => a.status !== 'open').sort((a, b) => a.decision.decided_at.localeCompare(b.decision.decided_at));
  for (const a of decided) if (a.status === 'changed') answers[a.criterion_id] = a.decision.answer;
  return answers;
}

export function recalc(e) {
  const checklist = cl.get(e.checklist.id, e.checklist.version);
  e.final_score = score(checklist, finalAnswers(e));
  return e;
}

export function fileAppeal({ group, convId, checklistId, criterionId, comment, author }) {
  const e = load(group, convId, checklistId);
  const crit = e.criteria.find((c) => c.id === criterionId);
  if (!crit) throw httpError(400, `unknown criterion ${criterionId}`);
  if (!String(comment || '').trim()) throw httpError(400, 'comment is required');
  if (e.appeals.some((a) => a.criterion_id === criterionId && a.status === 'open'))
    throw httpError(409, `criterion ${criterionId} already has an open appeal`);
  const current = finalAnswers(e)[criterionId];
  const appeal = {
    id: crypto.randomUUID(),
    criterion_id: criterionId,
    comment: String(comment).trim(),
    author: author || 'Оператор / руководитель',
    created_at: new Date().toISOString(),
    status: 'open',
    disputed_answer: current, // what the reviewer is asked to look at
    model_answer: crit.answer, // original model output, never changes
    score_before: e.final_score.total,
    decision: null,
  };
  e.appeals.push(appeal);
  saveEvaluation(e);
  return { appeal, evaluation: e };
}

export function decide({ group, convId, checklistId, appealId, action, answer, reason, reviewer }) {
  const e = load(group, convId, checklistId);
  const a = e.appeals.find((x) => x.id === appealId);
  if (!a) throw httpError(404, 'appeal not found');
  if (a.status !== 'open') throw httpError(409, 'appeal already decided');
  if (!String(reason || '').trim()) throw httpError(400, 'reason is required');
  if (!['confirm', 'change'].includes(action)) throw httpError(400, 'action must be confirm or change');
  const checklist = cl.get(e.checklist.id, e.checklist.version);
  const k = checklist.criteria.find((x) => x.id === a.criterion_id);
  let newAnswer = a.disputed_answer;
  if (action === 'change') {
    try {
      newAnswer = normalizeAnswer(k, answer);
    } catch (err) {
      throw httpError(400, err.message);
    }
    if (newAnswer === a.disputed_answer) throw httpError(400, 'the new answer equals the disputed one — use confirm');
  }
  a.status = action === 'confirm' ? 'confirmed' : 'changed';
  a.decision = {
    answer: newAnswer,
    reason: String(reason).trim(),
    reviewer: reviewer || 'Проверяющий',
    decided_at: new Date().toISOString(),
  };
  recalc(e);
  a.score_after = e.final_score.total;
  saveEvaluation(e);
  return { appeal: a, evaluation: e };
}

export function listAppeals(group, { status } = {}) {
  const out = [];
  for (const e of listEvaluations(group)) {
    for (const a of e.appeals) {
      if (status && a.status !== status) continue;
      const c = e.criteria.find((x) => x.id === a.criterion_id);
      out.push({
        ...a,
        group_id: e.group_id,
        conversation_id: e.conversation_id,
        checklist: e.checklist,
        explanation: c?.explanation,
        evidence: c?.evidence || [],
        checked_range: c?.checked_range || null,
        quote: c?.quote,
        final_total: e.final_score.total,
        original_total: e.original_score.total,
      });
    }
  }
  // open first, then newest
  return out.sort((x, y) => (y.status === 'open') - (x.status === 'open') || y.created_at.localeCompare(x.created_at));
}
