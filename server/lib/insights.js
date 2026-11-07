// Group-level analytics: where operators lose points, by criterion, language, channel.
import * as cl from './checklists.js';
import { listEvaluations } from './evaluator.js';
import { scaleMax } from '../../shared/checklist.js';
import { computeReviewFlags } from './review.js';
import * as ds from './datasource.js';

const isShortfall = (k, a) => (k.type === 'scale' ? typeof a === 'number' && a < scaleMax(k) : a === 'no');

export async function insights(group, checklistId = 'chat-quality') {
  const checklist = cl.get(checklistId);
  const evals = listEvaluations(group, checklistId);
  if (evals.some((e) => !e.review_flags)) {
    const convs = Object.fromEntries((await ds.getConversations(group)).map((c) => [c.conversation_id, c]));
    for (const e of evals) if (!e.review_flags) e.review_flags = computeReviewFlags(e, convs[e.conversation_id], cl.get(e.checklist.id, e.checklist.version));
  }
  const langs = [...new Set(evals.map((e) => e.language))].sort();
  const crits = checklist.criteria.map((k) => {
    const row = { id: k.id, title: k.title, type: k.type, evaluated: 0, applicable: 0, na: 0, shortfall: 0, flagged: 0, examples: [], by_language: {} };
    for (const l of langs) row.by_language[l] = { applicable: 0, shortfall: 0, flagged: 0 };
    for (const e of evals) {
      const a = e.final_score.criteria.find((c) => c.id === k.id)?.answer;
      if (a === undefined) continue;
      row.evaluated++;
      const bl = row.by_language[e.language];
      if (k.type === 'flag') {
        if (a === 'yes') { row.flagged++; bl.flagged++; row.examples.push(e.conversation_id); }
        continue;
      }
      if (a === 'na') { row.na++; continue; }
      row.applicable++; bl.applicable++;
      if (isShortfall(k, a)) { row.shortfall++; bl.shortfall++; if (row.examples.length < 6) row.examples.push(e.conversation_id); }
    }
    row.shortfall_rate = row.applicable ? row.shortfall / row.applicable : null;
    return row;
  });
  const byLang = langs.map((l) => {
    const es = evals.filter((e) => e.language === l && e.final_score.total != null);
    return { language: l, n: es.length, avg: es.length ? es.reduce((s, e) => s + e.final_score.total, 0) / es.length : null };
  });
  const byChannel = [...new Set(evals.map((e) => e.channel))].map((c) => {
    const es = evals.filter((e) => e.channel === c && e.final_score.total != null);
    return { channel: c, n: es.length, avg: es.length ? es.reduce((s, e) => s + e.final_score.total, 0) / es.length : null };
  });
  const totals = evals.map((e) => e.final_score.total).filter((t) => t != null);
  const worst = [...evals].filter((e) => e.final_score.total != null).sort((a, b) => a.final_score.total - b.final_score.total).slice(0, 5)
    .map((e) => ({ conversation_id: e.conversation_id, total: e.final_score.total, gross_error: e.final_score.gross_error }));
  return {
    group_id: group,
    checklist: { id: checklist.id, version: checklist.version, name: checklist.name },
    evaluated: evals.length,
    avg_total: totals.length ? totals.reduce((s, t) => s + t, 0) / totals.length : null,
    gross: evals.filter((e) => e.final_score.gross_error).map((e) => e.conversation_id).sort(),
    needs_review: evals.filter((e) => (e.review_flags || []).length).length,
    languages: langs,
    criteria: crits,
    by_language: byLang,
    by_channel: byChannel,
    worst,
    cost_usd_estimate: evals.reduce((s, e) => s + (e.cost_usd_estimate || 0), 0),
  };
}
