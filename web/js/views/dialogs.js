// Dialogue list for the selected group, with scores when evaluated.
import { api, enc } from '../api.js';
import { h, mount, fmtScore, errorBox, loading, toast } from '../ui.js';
import { currentChecklist, checklistPicker } from '../checklist-pick.js';

export async function render(root, ctx) {
  mount(root, loading('Загрузка диалогов…'));
  const checklistId = await currentChecklist();
  let convs, evals;
  try {
    [convs, evals] = await Promise.all([
      api.get(`/api/groups/${enc(ctx.group)}/conversations`),
      api.get(`/api/groups/${enc(ctx.group)}/evaluations?checklist=${enc(checklistId)}`),
    ]);
  } catch (e) {
    return mount(root, errorBox(e), h('p.muted', 'Проверьте group_id и CQA_API_URL в .env.'));
  }
  const byId = Object.fromEntries(evals.map((e) => [e.conversation_id, e]));
  const state = { q: '', lang: '', channel: '', status: '' };
  const tbody = h('tbody');

  function draw() {
    const rows = convs.filter((c) => {
      const e = byId[c.conversation_id];
      if (state.q && !c.conversation_id.toLowerCase().includes(state.q.toLowerCase())) return false;
      if (state.lang && c.language !== state.lang) return false;
      if (state.channel && c.channel !== state.channel) return false;
      if (state.status === 'todo' && e) return false;
      if (state.status === 'done' && !e) return false;
      if (state.status === 'gross' && !e?.gross_error) return false;
      if (state.status === 'appeal' && !e?.open_appeals) return false;
      if (state.status === 'review' && !e?.review_flags) return false;
      return true;
    });
    mount(tbody, rows.map((c) => {
      const e = byId[c.conversation_id];
      const changed = e && e.final_total !== e.original_total;
      return h('tr.click', { onclick: () => (location.hash = `#/c/${enc(c.conversation_id)}`) },
        h('td', h('b', c.conversation_id)),
        h('td', c.channel === 'voice call' ? '📞 звонок' : '💬 чат'),
        h('td', c.language),
        h('td.num', c.messages),
        h('td.num', e ? h('span.score', fmtScore(e.final_total)) : h('span.muted', 'не оценён')),
        h('td', changed ? h('span.muted', `было ${fmtScore(e.original_total)}`) : ''),
        h('td', e?.gross_error ? h('span.flag-gross', '⚠ грубая ошибка') : '', e?.review_flags ? h('span.pill.warn', { title: 'Требует проверки человеком' }, `⚑ ${e.review_flags}`) : ''),
        h('td', e?.open_appeals ? h('span.pill.warn', `апелляций: ${e.open_appeals}`) : ''),
      );
    }));
    count.textContent = `${rows.length} из ${convs.length}`;
  }

  const count = h('span.muted');
  const sel = (key, opts) => h('select', { onchange: (ev) => { state[key] = ev.target.value; draw(); } },
    opts.map(([v, l]) => h('option', { value: v }, l)));
  const langs = [...new Set(convs.map((c) => c.language))];
  const done = evals.length;
  const avg = done ? evals.reduce((s, e) => s + (e.final_total ?? 0), 0) / evals.filter((e) => e.final_total != null).length : null;

  mount(root,
    h('div.summary',
      h('div.kpi', h('div.v', convs.length), h('div.l', `диалогов в наборе ${ctx.group}`)),
      h('div.kpi', h('div.v', done), h('div.l', 'оценено')),
      h('div.kpi', h('div.v', fmtScore(avg)), h('div.l', 'средний итог')),
      h('div.kpi', { class: evals.some((e) => e.gross_error) ? 'kpi bad' : 'kpi' }, h('div.v', evals.filter((e) => e.gross_error).length), h('div.l', 'с грубыми ошибками')),
    ),
    h('div.toolbar',
      h('input', { type: 'search', placeholder: 'Поиск по ID…', oninput: (ev) => { state.q = ev.target.value; draw(); } }),
      sel('lang', [['', 'Все языки'], ...langs.map((l) => [l, l])]),
      sel('channel', [['', 'Все каналы'], ['agent chat', 'Чаты'], ['voice call', 'Звонки']]),
      sel('status', [['', 'Все'], ['todo', 'Не оценённые'], ['done', 'Оценённые'], ['gross', 'Грубые ошибки'], ['review', '⚑ Требуют проверки'], ['appeal', 'Открытые апелляции']]),
      await checklistPicker(() => render(root, ctx)),
      h('button.btn', {
        onclick: async () => {
          try { await api.post(`/api/groups/${enc(ctx.group)}/fetch`); toast('Набор обновлён из API'); render(root, ctx); }
          catch (e) { toast(e.message, 'err'); }
        },
      }, '⟳ Обновить из API'),
      count,
    ),
    h('table.tbl',
      h('thead', h('tr', h('th', 'Диалог'), h('th', 'Канал'), h('th', 'Язык'), h('th.num', 'Реплик'), h('th.num', 'Итог'), h('th', ''), h('th', 'Флаг'), h('th', 'Апелляции'))),
      tbody),
  );
  draw();
}
