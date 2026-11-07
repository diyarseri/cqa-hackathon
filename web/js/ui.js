// Small DOM helpers shared by the views.
import { applyTranslations } from './i18n.js';

/** h('div.card#x', {onclick}, child, 'text') */
export function h(tag, attrs, ...children) {
  const [, name = 'div', rest = ''] = /^([a-z0-9]+)?(.*)$/i.exec(tag);
  const el = document.createElement(name);
  for (const part of rest.match(/[.#][^.#]+/g) || []) {
    if (part[0] === '.') el.classList.add(part.slice(1));
    else el.id = part.slice(1);
  }
  // A number or string as the 2nd argument is content, including 0 (message #0).
  if (attrs != null && attrs !== false && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('aria-') && typeof v === 'boolean') el.setAttribute(k, String(v));
    else if (k in el && k !== 'list' && k !== 'form') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  applyTranslations(el);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function mount(el, ...children) {
  el.replaceChildren();
  append(el, children);
  applyTranslations(el);
  return el;
}

let toastTimer;
let toastHideTimer;
export function toast(msg, kind = 'ok') {
  const t = document.getElementById('cqa-toast');
  clearTimeout(toastTimer);
  clearTimeout(toastHideTimer);
  mount(t,
    h('span.toast-icon', { 'aria-hidden': true }, kind === 'err' ? '!' : '✓'),
    h('span.toast-copy', msg),
    h('button.toast-close', { type: 'button', 'aria-label': 'Закрыть уведомление', onclick: hideToast }, '×'),
  );
  t.className = `toast ${kind}`;
  t.setAttribute('role', kind === 'err' ? 'alert' : 'status');
  t.setAttribute('aria-live', kind === 'err' ? 'assertive' : 'polite');
  t.hidden = false;
  requestAnimationFrame(() => t.classList.add('show'));
  toastTimer = setTimeout(hideToast, kind === 'err' ? 7000 : 4000);
}

function hideToast() {
  const t = document.getElementById('cqa-toast');
  if (!t || t.hidden) return;
  t.classList.remove('show');
  toastHideTimer = setTimeout(() => { t.hidden = true; }, reducedMotion() ? 0 : 180);
}

export function fmtScore(x) {
  return x == null ? '—' : Number(x).toFixed(2);
}

export function answerLabel(a) {
  if (a === 'yes') return 'Да';
  if (a === 'no') return 'Нет';
  if (a === 'na') return 'N/A';
  if (a == null) return '—';
  return String(a);
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

export const SPEAKERS = { client: 'Клиент', operator: 'Оператор', bot: 'Бот', system: 'Система' };

export function errorBox(e) {
  return h('div.alert.err', { role: 'alert' },
    h('span.alert-mark', { 'aria-hidden': true }, '!'),
    h('span', String(e?.message || e)),
  );
}

export function loading(text = 'Загрузка…') {
  return h('div.loading', { role: 'status', 'aria-live': 'polite' },
    h('span.loader', { 'aria-hidden': true }),
    h('span', text),
  );
}

export function reducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

// Apply shared responsive and keyboard behavior without coupling each feature
// module to the application shell.
export function enhanceView(root) {
  root.querySelectorAll('table.tbl').forEach((table) => {
    let wrap = table.parentElement;
    if (!wrap?.classList.contains('table-scroll')) {
      wrap = h('div.table-scroll');
      table.before(wrap);
      wrap.append(table);
    }
    if (!wrap.hasAttribute('role')) wrap.setAttribute('role', 'region');
    if (!wrap.hasAttribute('aria-label')) wrap.setAttribute('aria-label', table.getAttribute('aria-label') || 'Таблица данных');
    if (!wrap.dataset.autoTabstop) wrap.dataset.autoTabstop = wrap.hasAttribute('tabindex') ? 'false' : 'true';
    const updateTabStop = () => {
      if (wrap.dataset.autoTabstop !== 'true') return;
      if (table.scrollWidth > wrap.clientWidth + 1) wrap.tabIndex = 0;
      else wrap.removeAttribute('tabindex');
    };
    requestAnimationFrame(updateTabStop);
    if (!wrap.dataset.resizeReady && 'ResizeObserver' in window) {
      wrap.dataset.resizeReady = 'true';
      new ResizeObserver(updateTabStop).observe(wrap);
    }
  });

  root.querySelectorAll('tr.click').forEach((row) => {
    if (row.dataset.keyboardReady === 'true') return;
    row.dataset.keyboardReady = 'true';
    if (!row.hasAttribute('tabindex')) row.tabIndex = 0;
    if (!row.hasAttribute('role')) row.setAttribute('role', 'link');
    if (!row.hasAttribute('aria-label')) row.setAttribute('aria-label', row.textContent.trim());
    row.addEventListener('keydown', (event) => {
      if (event.target.closest('a,button,input,select,textarea')) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      row.click();
    });
  });

  root.querySelectorAll('a[target="_blank"]').forEach((link) => {
    link.rel = 'noopener noreferrer';
  });
}
