// Checklist schema validation. Pure; used by the server API and the editor UI.

export const TYPES = ['binary', 'scale', 'flag'];
export const TYPE_LABELS = { binary: 'Да / Нет', scale: 'Шкала', flag: 'Флаг (без баллов)' };
export const SOURCE_LABELS = { transcript: 'Транскрипт', audio: 'Запись звонка (звук)' };

/** Returns a list of human-readable problems; empty list = valid. */
export function validateChecklist(c) {
  const errs = [];
  if (!c || typeof c !== 'object') return ['чек-лист должен быть объектом'];
  if (!str(c.name)) errs.push('нужно название чек-листа');
  if (c.total_points != null && !(c.total_points > 0)) errs.push('максимум баллов должен быть больше 0');
  if (c.rounding != null && !(Number.isInteger(c.rounding) && c.rounding >= 0 && c.rounding <= 6))
    errs.push('округление — целое число от 0 до 6');
  const sections = Array.isArray(c.sections) ? c.sections : [];
  const sectionIds = new Set();
  for (const s of sections) {
    if (!str(s.id)) errs.push('у каждой секции нужен id');
    else if (sectionIds.has(s.id)) errs.push(`секция ${s.id} повторяется`);
    sectionIds.add(s.id);
    if (!str(s.title)) errs.push(`секция ${s.id}: нужно название`);
  }
  if (!Array.isArray(c.criteria) || c.criteria.length === 0) {
    errs.push('нужен хотя бы один критерий');
    return errs;
  }
  const ids = new Set();
  for (const k of c.criteria) {
    const at = `Критерий ${k.id ?? '?'}`;
    if (!str(k.id) || !/^[A-Za-z0-9_-]{1,20}$/.test(k.id)) errs.push(`${at}: ID — от 1 до 20 латинских букв или цифр`);
    else if (ids.has(k.id)) errs.push(`ID ${k.id} повторяется`);
    ids.add(k.id);
    if (!str(k.title)) errs.push(`${at}: нужно название`);
    if (!str(k.description)) errs.push(`${at}: нужна формулировка`);
    if (!TYPES.includes(k.type)) errs.push(`${at}: неизвестный тип ответа`);
    if (k.section != null && sections.length && !sectionIds.has(k.section))
      errs.push(`${at}: секция ${k.section} не существует`);
    if (k.type === 'flag') {
      if (k.weight && k.weight !== 0) errs.push(`${at}: у флага не бывает веса`);
    } else if (!(typeof k.weight === 'number' && k.weight > 0)) {
      errs.push(`${at}: вес должен быть числом больше 0`);
    }
    if (k.type === 'scale') {
      const steps = k.scale?.steps;
      if (!Array.isArray(steps) || steps.length < 2) errs.push(`${at}: у шкалы нужно хотя бы 2 ступени`);
      else {
        const vals = steps.map((s) => s.value);
        if (vals.some((v) => typeof v !== 'number' || !Number.isFinite(v) || v < 0))
          errs.push(`${at}: значения ступеней — числа ≥ 0`);
        if (new Set(vals).size !== vals.length) errs.push(`${at}: значения ступеней не должны повторяться`);
        if (!(Math.max(...vals) > 0)) errs.push(`${at}: верхняя ступень должна быть больше 0`);
        if (steps.some((s) => !str(s.label))) errs.push(`${at}: у каждой ступени нужно описание`);
      }
    }
    if (k.source != null && !['transcript', 'audio'].includes(k.source)) errs.push(`${at}: источник — транскрипт или запись`);
    if (k.source === 'audio' && !k.na?.allowed) errs.push(`${at}: критерий по записи должен допускать N/A (у чатов нет записи)`);
    if (k.na?.allowed) {
      if (k.type === 'flag') errs.push(`${at}: флаг не может быть N/A`);
      if (!str(k.na.condition)) errs.push(`${at}: N/A разрешён — нужно условие N/A`);
    }
  }
  if (!c.criteria.some((k) => k.type !== 'flag')) errs.push('нужен хотя бы один критерий с весом');
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
