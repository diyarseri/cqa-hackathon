// Export / import everything about a group as one JSON file, so teammates can
// share results and the demo works offline. Import merges: newer wins.
import fs from 'node:fs';
import { p, readJson, writeJson, listJson, safeId, httpError } from './store.js';

const FORMAT = 'cqa-bundle/1';

// Same checklist content regardless of when each laptop saved it.
const content = (c) => JSON.stringify({ n: c.name, r: c.global_rules, s: c.sections, k: c.criteria, t: c.total_points, d: c.rounding });

function checklistFiles() {
  const out = [];
  let ids = [];
  try { ids = fs.readdirSync(p('checklists')); } catch { return out; }
  for (const id of ids) {
    for (const f of fs.readdirSync(p('checklists', id))) {
      if (/^v\d+\.json$/.test(f)) out.push(readJson(p('checklists', id, f)));
    }
  }
  return out;
}

export function exportBundle(group) {
  return {
    format: FORMAT,
    exported_at: new Date().toISOString(),
    group_id: group,
    dataset: readJson(p('cache', `${safeId(group)}.json`)),
    checklists: checklistFiles(),
    evaluations: listJson(p('evaluations', safeId(group))),
    labels: listJson(p('labels', safeId(group))),
  };
}

export function importBundle(b) {
  if (!b || b.format !== FORMAT) throw httpError(400, `not a ${FORMAT} file`);
  const group = safeId(b.group_id);
  const r = { group_id: group, dataset: false, checklist_versions: 0, checklist_conflicts: [], evaluations: 0, evaluations_kept_local: 0, labels: 0 };

  if (b.dataset?.response?.data?.records && !readJson(p('cache', `${group}.json`))) {
    writeJson(p('cache', `${group}.json`), b.dataset);
    r.dataset = true;
  }
  for (const c of b.checklists || []) {
    const file = p('checklists', safeId(c.id), `v${Number(c.version)}.json`);
    const local = readJson(file);
    if (!local) { writeJson(file, c); r.checklist_versions++; }
    else if (content(local) !== content(c)) r.checklist_conflicts.push(`${c.id} v${c.version}`);
  }
  for (const e of b.evaluations || []) {
    const file = p('evaluations', group, `${safeId(e.conversation_id)}__${safeId(e.checklist.id)}.json`);
    const local = readJson(file);
    const stamp = (x) => [x.created_at, ...x.appeals.map((a) => a.decision?.decided_at || a.created_at)].sort().at(-1);
    if (!local || stamp(e) > stamp(local)) { writeJson(file, e); r.evaluations++; }
    else r.evaluations_kept_local++;
  }
  for (const l of b.labels || []) {
    const file = p('labels', group, `${safeId(l.conversation_id)}__${safeId(l.checklist.id)}.json`);
    const local = readJson(file);
    if (!local || l.updated_at > local.updated_at) { writeJson(file, l); r.labels++; }
  }
  return r;
}

