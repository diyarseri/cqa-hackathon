// Group analytics for the QA manager: where operators lose points.
import { api, enc } from '../api.js';
import { h, mount, fmtScore, loading } from '../ui.js';
import { currentChecklist, checklistPicker } from '../checklist-pick.js';

const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
const LANG = { RU: 'Русский', KZ: 'Казахский', EN: 'Английский' };

export async function render(root, ctx) {
  mount(root, loading());
  const d = await api.get(`/api/groups/${enc(ctx.group)}/insights?checklist=${enc(await currentChecklist())}`);
  if (!d.evaluated) {
    return mount(root,
      h('div.page-head',
        h('div',
          h('h1', { tabindex: -1 }, 'Аналитика'),
          h('p.muted', `Набор ${ctx.group}: качество диалогов, зоны роста и результаты по каналам.`))),
      h('div.empty-state',
        h('h2', 'Пока нечего анализировать'),
        h('p', `В наборе ${ctx.group} ещё нет оценённых диалогов.`),
        h('a.btn.primary', { href: '#/batch' }, 'Запустить пакетную оценку')),
    );
  }
  const weighted = d.criteria.filter((c) => c.type !== 'flag' && c.applicable);
  const sorted = [...weighted].sort((a, b) => b.shortfall_rate - a.shortfall_rate);
  const top = sorted[0];
  const gross = d.criteria.find((c) => c.type === 'flag');

  // Single-series horizontal bars: share of applicable dialogues where the criterion lost points.
  const bars = h('table.tbl.bars', { 'aria-label': 'Потери баллов по критериям' },
    h('thead', h('tr', h('th', 'Критерий'), h('th', 'Доля диалогов с потерей баллов'), h('th.num', 'Потеряно / применимо'), h('th.num', 'N/A'))),
    h('tbody', sorted.map((c) => h('tr', { title: `${c.id}. ${c.title}: ${c.shortfall} из ${c.applicable} применимых (${pct(c.shortfall_rate)}), N/A в ${c.na}` },
      h('td', `${c.id}. ${c.title}`),
      h('td', h('div.bar', h('div', { style: { width: `${Math.max(0.5, c.shortfall_rate * 100)}%` } }), h('span', pct(c.shortfall_rate)))),
      h('td.num', `${c.shortfall} / ${c.applicable}`),
      h('td.num', c.na)))));

  mount(root,
    h('div.toolbar.page-head',
      h('div',
        h('h1', { tabindex: -1, style: { margin: 0 } }, 'Аналитика качества'),
        h('p.muted', { style: { marginBottom: 0 } }, `Набор ${ctx.group}: итоговые оценки после решений по апелляциям.`)),
      await checklistPicker(() => render(root, ctx))),
    h('div.summary',
      h('div.kpi', h('div.v', d.evaluated), h('div.l', 'оценено диалогов')),
      h('div.kpi', h('div.v', fmtScore(d.avg_total)), h('div.l', 'средний итог')),
      h('div.kpi', { class: d.gross.length ? 'kpi bad' : 'kpi' }, h('div.v', d.gross.length), h('div.l', 'с грубыми ошибками')),
      h('div.kpi', h('div.v', d.needs_review), h('div.l', '⚑ требуют проверки человеком')),
      d.cost_usd_estimate ? h('div.kpi', h('div.v', `$${d.cost_usd_estimate.toFixed(2)}`), h('div.l', 'стоимость оценки набора')) : null),
    top && h('div.alert.warn', h('b', 'Главная зона роста: '), `${top.id}. ${top.title} — баллы потеряны в ${pct(top.shortfall_rate)} применимых диалогов (${top.shortfall} из ${top.applicable}). Примеры: `,
      top.examples.map((id) => h('a', { href: `#/c/${enc(id)}`, style: { marginRight: '.5rem' } }, id))),
    h('h2', 'Где операторы теряют баллы'),
    h('div.table-scroll', { tabindex: 0, role: 'region', 'aria-label': 'Таблица потерь баллов по критериям' }, bars),
    gross && h('div.panel', { style: { marginTop: '1rem' } },
      h('b', `⚠ ${gross.title}: ${gross.flagged}`), gross.flagged ? ' — ' : ' — не выявлено',
      gross.examples.map((id) => h('a', { href: `#/c/${enc(id)}`, style: { marginRight: '.5rem' } }, id))),
    h('h2', 'По языкам'),
    h('div.table-scroll', { tabindex: 0, role: 'region', 'aria-label': 'Результаты по языкам' }, h('table.tbl',
      h('thead', h('tr', h('th', 'Критерий'), d.languages.map((l) => h('th.num', `${LANG[l] || l}`)))),
      h('tbody',
        h('tr', h('td', h('b', 'Средний итог')), d.languages.map((l) => h('td.num', h('b', fmtScore(d.by_language.find((x) => x.language === l)?.avg))))),
        weighted.map((c) => h('tr', h('td', `${c.id}. ${c.title}`), d.languages.map((l) => {
          const b = c.by_language[l];
          return h('td.num', b.applicable ? `${pct(b.shortfall / b.applicable)} (${b.shortfall}/${b.applicable})` : '—');
        })))))),
    h('p.muted', 'Процент — доля применимых диалогов, где критерий получил «Нет» или неполную ступень шкалы. Учитываются итоговые оценки после апелляций.'),
    h('h2', 'По каналам'),
    h('div.table-scroll', h('table.tbl', { 'aria-label': 'Результаты по каналам' }, h('tbody', d.by_channel.map((c) => h('tr', h('td', c.channel === 'voice call' ? 'Звонки' : 'Чаты'), h('td.num', `${c.n} диалогов`), h('td.num', h('b', fmtScore(c.avg)))))))),
    h('h2', 'Самые низкие оценки'),
    d.worst.length
      ? h('div.table-scroll', h('table.tbl', { 'aria-label': 'Диалоги с самыми низкими оценками' }, h('tbody', d.worst.map((w) => h('tr',
        h('td', h('a.table-link', { href: `#/c/${enc(w.conversation_id)}` }, w.conversation_id)),
        h('td.num', fmtScore(w.total)),
        h('td', w.gross_error ? h('span.flag-gross', '⚠ грубая ошибка') : ''))))))
      : h('div.empty-state.compact', h('p', 'Диалогов с итоговой оценкой пока нет.')),
  );
}
