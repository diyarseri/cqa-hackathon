// Checklist schema validation. Pure; used by the server API and the editor UI.

export const TYPES = ['binary', 'scale', 'flag'];
export const TYPE_LABELS = { binary: 'Да / Нет', scale: 'Шкала', flag: 'Флаг (без баллов)' };
export const SOURCE_LABELS = { transcript: 'Транскрипт', audio: 'Запись звонка (звук)' };

/** Returns a list of human-readable problems; empty list = valid. */
export function validateChecklist(c) {
  const errs = [];
  if (!c || typeof c !== 'object') return ['checklist must be an object'];
  if (!str(c.name)) errs.push('name is required');
  if (c.total_points != null && !(c.total_points > 0)) errs.push('total_points must be > 0');
  if (c.rounding != null && !(Number.isInteger(c.rounding) && c.rounding >= 0 && c.rounding <= 6))
    errs.push('rounding must be an integer 0..6');
  const sections = Array.isArray(c.sections) ? c.sections : [];
  const sectionIds = new Set();
  for (const s of sections) {
    if (!str(s.id)) errs.push('every section needs an id');
    else if (sectionIds.has(s.id)) errs.push(`duplicate section id ${s.id}`);
    sectionIds.add(s.id);
    if (!str(s.title)) errs.push(`section ${s.id}: title is required`);
  }
  if (!Array.isArray(c.criteria) || c.criteria.length === 0) {
    errs.push('at least one criterion is required');
    return errs;
  }
  const ids = new Set();
  for (const k of c.criteria) {
    const at = `criterion ${k.id ?? '?'}`;
    if (!str(k.id) || !/^[A-Za-z0-9_-]{1,20}$/.test(k.id)) errs.push(`${at}: id must be 1–20 letters/digits`);
    else if (ids.has(k.id)) errs.push(`duplicate criterion id ${k.id}`);
    ids.add(k.id);
    if (!str(k.title)) errs.push(`${at}: title is required`);
    if (!str(k.description)) errs.push(`${at}: wording (description) is required`);
    if (!TYPES.includes(k.type)) errs.push(`${at}: type must be one of ${TYPES.join(', ')}`);
    if (k.section != null && sections.length && !sectionIds.has(k.section))
      errs.push(`${at}: unknown section ${k.section}`);
    if (k.type === 'flag') {
      if (k.weight && k.weight !== 0) errs.push(`${at}: a flag has no weight`);
    } else if (!(typeof k.weight === 'number' && k.weight > 0)) {
      errs.push(`${at}: weight must be a number > 0`);
    }
    if (k.type === 'scale') {
      const steps = k.scale?.steps;
      if (!Array.isArray(steps) || steps.length < 2) errs.push(`${at}: a scale needs at least 2 steps`);
      else {
        const vals = steps.map((s) => s.value);
        if (vals.some((v) => typeof v !== 'number' || !Number.isFinite(v) || v < 0))
          errs.push(`${at}: scale step values must be numbers ≥ 0`);
        if (new Set(vals).size !== vals.length) errs.push(`${at}: scale step values must be unique`);
        if (!(Math.max(...vals) > 0)) errs.push(`${at}: the top scale step must be > 0`);
        if (steps.some((s) => !str(s.label))) errs.push(`${at}: every scale step needs a label`);
      }
    }
    if (k.source != null && !['transcript', 'audio'].includes(k.source)) errs.push(`${at}: source must be transcript or audio`);
    if (k.source === 'audio' && !k.na?.allowed) errs.push(`${at}: an audio criterion must allow N/A (chats have no recording)`);
    if (k.na?.allowed) {
      if (k.type === 'flag') errs.push(`${at}: a flag cannot be N/A`);
      if (!str(k.na.condition)) errs.push(`${at}: N/A is allowed, so the N/A condition text is required`);
    }
  }
  if (!c.criteria.some((k) => k.type !== 'flag')) errs.push('at least one weighted criterion is required');
  return errs;
}

export function scaleMax(criterion) {
  return Math.max(...criterion.scale.steps.map((s) => s.value));
}

/** Allowed answers for a criterion, as the evaluator and the UI see them. */
export function allowedAnswers(k) {
  const base = k.type === 'scale' ? k.scale.steps.map((s) => s.value) : ['yes', 'no'];
  return k.na?.allowed ? [...base, 'na'] : base;
}

/** Blank criterion for the editor. */
export function blankCriterion(existing = []) {
  let n = existing.length + 1;
  const used = new Set(existing.map((k) => k.id));
  while (used.has(String(n).padStart(2, '0'))) n++;
  return {
    id: String(n).padStart(2, '0'),
    section: null,
    title: '',
    type: 'binary',
    weight: 10,
    description: '',
    na: { allowed: false, condition: '' },
    guidance: '',
  };
}

const str = (v) => typeof v === 'string' && v.trim().length > 0;
