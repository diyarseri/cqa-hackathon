// Checklist storage with immutable versions:
//   data/checklists/<id>/v1.json, v2.json, ...   (every save = new version)
//   data/checklists/<id>/deleted.json            (soft delete; history kept so
//                                                 old evaluations stay explainable)
import fs from 'node:fs';
import path from 'node:path';
import { p, readJson, writeJson, safeId, httpError, PROJECT_ROOT } from './store.js';
import { validateChecklist } from '../../shared/checklist.js';

const dir = (id) => p('checklists', safeId(id));

function versions(id) {
  try {
    return fs
      .readdirSync(dir(id))
      .map((f) => /^v(\d+)\.json$/.exec(f)?.[1])
      .filter(Boolean)
      .map(Number)
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

export function seedDefault() {
  const def = readJson(path.join(PROJECT_ROOT, 'config/checklist.default.json'));
  if (versions(def.id).length === 0) save(def.id, def, { note: 'Начальная конфигурация из PDF' });
}

export function list({ includeDeleted = false } = {}) {
  let ids = [];
  try {
    ids = fs.readdirSync(p('checklists'));
  } catch {
    return [];
  }
  return ids
    .map((id) => {
      const vs = versions(id);
      if (!vs.length) return null;
      const deleted = fs.existsSync(path.join(dir(id), 'deleted.json'));
      if (deleted && !includeDeleted) return null;
      const cur = readJson(path.join(dir(id), `v${vs.at(-1)}.json`));
      return {
        id,
        name: cur.name,
        version: cur.version,
        versions: vs.length,
        saved_at: cur.saved_at,
        criteria: cur.criteria.length,
        deleted,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function get(id, version) {
  const vs = versions(id);
  if (!vs.length) throw httpError(404, `checklist ${id} not found`);
  const v = version ? Number(version) : vs.at(-1);
  if (!vs.includes(v)) throw httpError(404, `checklist ${id} has no version ${version}`);
  return readJson(path.join(dir(id), `v${v}.json`));
}

export function history(id) {
  return versions(id).map((v) => {
    const c = readJson(path.join(dir(id), `v${v}.json`));
    return { version: v, saved_at: c.saved_at, note: c.version_note || '', name: c.name };
  });
}

function save(id, body, { note = '' } = {}) {
  const doc = structuredClone(body);
  delete doc.version;
  delete doc.saved_at;
  delete doc.version_note;
  doc.id = id;
  const errs = validateChecklist(doc);
  if (errs.length) throw httpError(400, 'Чек-лист не сохранён: ' + errs.join('; '));
  const next = (versions(id).at(-1) || 0) + 1;
  const out = { ...doc, version: next, saved_at: new Date().toISOString(), version_note: note };
  writeJson(path.join(dir(id), `v${next}.json`), out);
  try {
    fs.rmSync(path.join(dir(id), 'deleted.json'));
  } catch {}
  return out;
}

export function create(body) {
  const id = slug(body.id || body.name || 'checklist');
  let unique = id;
  for (let i = 2; versions(unique).length; i++) unique = `${id}-${i}`;
  return save(unique, body, { note: body.version_note || 'Создан' });
}

export function update(id, body) {
  if (!versions(id).length) throw httpError(404, `checklist ${id} not found`);
  return save(id, body, { note: body.version_note || '' });
}

export function remove(id) {
  if (!versions(id).length) throw httpError(404, `checklist ${id} not found`);
  writeJson(path.join(dir(id), 'deleted.json'), { deleted_at: new Date().toISOString() });
  return { id, deleted: true };
}

function slug(s) {
  const out = String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return out || `checklist-${Date.now().toString(36)}`;
}
