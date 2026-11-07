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
    return mount(root, h('h2', 'Аналитика'), h('div.alert.info', `В наборе ${ctx.group} ещё нет оценок. Запустите «Пакетную оценку».`));
  }
  const weighted = d.criteria.filter((c) => c.type !== 'flag' && c.applicable);
  const sorted = [...weighted].sort((a, b) => b.shortfall_rate - a.shortfall_rate);
  const top = sorted[0];
  const gross = d.criteria.find((c) => c.type === 'flag');

  // Single-series horizontal bars: share of applicable dialogues where the criterion lost points.
  const bars = h('table.tbl.bars',
    h('thead', h('tr', h('th', 'Критерий'), h('th', 'Доля диалогов с потерей баллов'), h('th.num', 'Потеряно / применимо'), h('th.num', 'N/A'))),
    h('tbody', sorted.map((c) => h('tr', { title: `${c.id}. ${c.title}: ${c.shortfall} из ${c.applicable} применимых (${pct(c.shortfall_rate)}), N/A в ${c.na}` },
      h('td', `${c.id}. ${c.title}`),
      h('td', h('div.bar', h('div', { style: { width: `${Math.max(0.5, c.shortfall_rate * 100)}%` } }), h('span', pct(c.shortfall_rate)))),
      h('td.num', `${c.shortfall} / ${c.applicable}`),
      h('td.num', c.na)))));

  mount(root,
    h('div.toolbar', h('h2', { style: { margin: 0 } }, 'Аналитика', h('small', ` · набор ${ctx.group}`)), await checklistPicker(() => render(root, ctx))),
    h('div.summary',
      h('div.kpi', h('div.v', d.evaluated), h('div.l', 'оценено диалогов')),
      h('div.kpi', h('div.v', fmtScore(d.avg_total)), h('div.l', 'средний итог')),
      h('div.kpi', { class: d.gross.length ? 'kpi bad' : 'kpi' }, h('div.v', d.gross.length), h('div.l', 'с грубыми ошибками')),
      h('div.kpi', h('div.v', d.needs_review), h('div.l', '⚑ требуют проверки человеком')),
      d.cost_usd_estimate ? h('div.kpi', h('div.v', `$${d.cost_usd_estimate.toFixed(2)}`), h('div.l', 'стоимость оценки набора')) : null),
    top && h('div.alert.warn', h('b', 'Главная зона роста: '), `${top.id}. ${top.title} — баллы потеряны в ${pct(top.shortfall_rate)} применимых диалогов (${top.shortfall} из ${top.applicable}). Примеры: `,
      top.examples.map((id) => h('a', { href: `#/c/${enc(id)}`, style: { marginRight: '.5rem' } }, id))),
    h('h3', 'Где операторы теряют баллы'),
    bars,
    gross && h('div.panel', { style: { marginTop: '1rem' } },
      h('b', `⚠ ${gross.title}: ${gross.flagged}`), gross.flagged ? ' — ' : ' — не выявлено',
      gross.examples.map((id) => h('a', { href: `#/c/${enc(id)}`, style: { marginRight: '.5rem' } }, id))),
    h('h3', 'По языкам'),
    h('table.tbl',
      h('thead', h('tr', h('th', 'Критерий'), d.languages.map((l) => h('th.num', `${LANG[l] || l}`)))),
      h('tbody',
        h('tr', h('td', h('b', 'Средний итог')), d.languages.map((l) => h('td.num', h('b', fmtScore(d.by_language.find((x) => x.language === l)?.avg))))),
        weighted.map((c) => h('tr', h('td', `${c.id}. ${c.title}`), d.languages.map((l) => {
          const b = c.by_language[l];
          return h('td.num', b.applicable ? `${pct(b.shortfall / b.applicable)} (${b.shortfall}/${b.applicable})` : '—');
        }))))),
    h('p.muted', 'Процент — доля применимых диалогов, где критерий получил «Нет» или неполную ступень шкалы. Учитываются итоговые оценки после апелляций.'),
    h('h3', 'По каналам'),
    h('table.tbl', h('tbody', d.by_channel.map((c) => h('tr', h('td', c.channel === 'voice call' ? 'Звонки' : 'Чаты'), h('td.num', `${c.n} диалогов`), h('td.num', h('b', fmtScore(c.avg))))))),
    h('h3', 'Самые низкие оценки'),
    h('table.tbl', h('tbody', d.worst.map((w) => h('tr.click', { onclick: () => (location.hash = `#/c/${enc(w.conversation_id)}`) },
      h('td', h('b', w.conversation_id)), h('td.num', fmtScore(w.total)), h('td', w.gross_error ? h('span.flag-gross', '⚠ грубая ошибка') : ''))))),
  );
}
