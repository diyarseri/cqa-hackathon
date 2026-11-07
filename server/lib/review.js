// "Needs review" flags: cheap, deterministic checks that tell the human
// reviewer which AI results to double-check. Nothing here is criterion-specific.
import { providerInfo } from './llm.js';

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[«»"“”„'’`]/g, '')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** Is the quote (possibly with "…" gaps) present in any of the cited messages? */
export function quoteFound(quote, texts) {
  const parts = String(quote || '')
    .split(/\.\.\.|…/)
    .map(norm)
    .filter((p) => p.length >= 6);
  if (!parts.length) return true; // nothing checkable
  const hay = texts.map(norm);
  return parts.every((p) => hay.some((h) => h.includes(p)));
}

// Genuine uncertainty anywhere; contrast words only when the model CLEARS a
// flag criterion ("no violation, although the operator disclosed…").
const UNSURE = /(^|[^\p{L}])(возможно|может быть|сложно (определить|сказать|оценить)|неясно|не совсем ясно|спорно|possibly|unclear|ambiguous|hard to tell)(?=[^\p{L}]|$)/iu;
const CONTRAST = /(^|[^\p{L}])(хотя|однако|но при этом|although|however|but|дегенмен|бірақ)(?=[^\p{L}]|$)/iu;

export function computeReviewFlags(rec, conv, checklist) {
  const flags = [];
  const texts = (idx) => idx.map((i) => conv?.messages?.[i]?.text).filter(Boolean);
  for (const c of rec.criteria) {
    if (c.quote && conv && !quoteFound(c.quote, texts(c.evidence.length ? c.evidence : conv.messages.map((m) => m.idx)))) {
      flags.push({ criterion_id: c.id, code: 'quote_not_found', message: 'Цитата не найдена в указанных репликах — возможна неточность модели.' });
    }
    const isFlagCleared = c.answer === 'no' && checklist?.criteria.find((k) => k.id === c.id)?.type === 'flag';
    if (UNSURE.test(c.explanation || '') || (isFlagCleared && CONTRAST.test(c.explanation || ''))) {
      flags.push({ criterion_id: c.id, code: 'hedged', message: 'Модель сомневается в своём выводе — проверьте ответ.' });
    }
  }
  if (rec.repairs > 0) flags.push({ criterion_id: null, code: 'repaired', message: `Ответ модели исправлялся ${rec.repairs} раз(а) после проверки кодом.` });
  const primary = providerInfo().model;
  if (rec.model && primary && String(rec.model).replace(/^models\//, '') !== primary)
    flags.push({ criterion_id: null, code: 'fallback_model', message: `Оценено резервной моделью ${rec.model} вместо ${primary}.` });
  return flags;
}
