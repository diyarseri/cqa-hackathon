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
  let searchInput;
  let languageSelect;
  let channelSelect;
  let statusSelect;

  function resetFilters() {
    Object.assign(state, { q: '', lang: '', channel: '', status: '' });
    searchInput.value = '';
    languageSelect.value = '';
    channelSelect.value = '';
    statusSelect.value = '';
    draw();
  }

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
    const rendered = rows.map((c) => {
      const e = byId[c.conversation_id];
      const changed = e && e.final_total !== e.original_total;
      return h('tr',
        h('td', h('a.table-link', { href: `#/c/${enc(c.conversation_id)}`, 'aria-label': `Открыть диалог ${c.conversation_id}` }, c.conversation_id)),
        h('td', c.channel === 'voice call' ? '📞 звонок' : '💬 чат'),
        h('td', c.language),
        h('td.num', c.messages),
        h('td.num', e ? h('span.score', fmtScore(e.final_total)) : h('span.muted', 'не оценён')),
        h('td', changed ? h('span.muted', `было ${fmtScore(e.original_total)}`) : ''),
        h('td', e?.gross_error ? h('span.flag-gross', '⚠ грубая ошибка') : '', e?.review_flags ? h('span.pill.warn', { title: 'Требует проверки человеком' }, `⚑ ${e.review_flags}`) : ''),
        h('td', e?.open_appeals ? h('span.pill.warn', `апелляций: ${e.open_appeals}`) : ''),
      );
    });
    if (rendered.length) {
      mount(tbody, rendered);
    } else {
      mount(tbody, h('tr', h('td', { colSpan: 8 },
        h('div.muted', convs.length ? 'По выбранным фильтрам ничего не найдено.' : 'В наборе пока нет диалогов.'),
        convs.length ? h('button.btn', { type: 'button', onclick: resetFilters }, 'Сбросить фильтры') : null,
      )));
    }
    count.textContent = `${rows.length} из ${convs.length}`;
  }

  const count = h('span.muted');
  const sel = (key, opts, label) => h('select', { 'aria-label': label, onchange: (ev) => { state[key] = ev.target.value; draw(); } },
    opts.map(([v, l]) => h('option', { value: v }, l)));
  const langs = [...new Set(convs.map((c) => c.language))];
  const done = evals.length;
  const scoredTotals = evals
    .map((e) => e.final_total)
    .filter((total) => total != null && Number.isFinite(Number(total)))
    .map(Number);
  const avg = scoredTotals.length
    ? scoredTotals.reduce((sum, total) => sum + total, 0) / scoredTotals.length
    : null;

  searchInput = h('input', { type: 'search', 'aria-label': 'Поиск диалога по ID', placeholder: 'Поиск по ID…', oninput: (ev) => { state.q = ev.target.value; draw(); } });
  languageSelect = sel('lang', [['', 'Все языки'], ...langs.map((l) => [l, l])], 'Фильтр по языку');
  channelSelect = sel('channel', [['', 'Все каналы'], ['agent chat', 'Чаты'], ['voice call', 'Звонки']], 'Фильтр по каналу');
  statusSelect = sel('status', [['', 'Все'], ['todo', 'Не оценённые'], ['done', 'Оценённые'], ['gross', 'Грубые ошибки'], ['review', '⚑ Требуют проверки'], ['appeal', 'Открытые апелляции']], 'Фильтр по статусу');

  const needsReview = evals.filter((e) => e.review_flags).length;

  mount(root,
    h('div.page-head',
      h('div',
        h('h1', { tabindex: -1 }, 'Диалоги'),
        h('p.muted', `Набор ${ctx.group}: найдите разговор, проверьте доказательства и итоговую оценку.`)),
      h('a.btn.primary', { href: '#/batch' }, done < convs.length ? 'Оценить набор' : 'Пакетная оценка')),
    h('div.summary',
      h('div.kpi', h('div.v', convs.length), h('div.l', `диалогов в наборе ${ctx.group}`)),
      h('div.kpi', h('div.v', done), h('div.l', 'оценено')),
      h('div.kpi', h('div.v', fmtScore(avg)), h('div.l', 'средний итог')),
      h('div.kpi', { class: evals.some((e) => e.gross_error) ? 'kpi bad' : 'kpi' }, h('div.v', evals.filter((e) => e.gross_error).length), h('div.l', 'с грубыми ошибками')),
      h('div.kpi', h('div.v', needsReview), h('div.l', 'требуют проверки человеком')),
    ),
    h('div.toolbar',
      searchInput,
      languageSelect,
      channelSelect,
      statusSelect,
      await checklistPicker(() => render(root, ctx)),
      h('button.btn', {
        onclick: async () => {
          try { await api.post(`/api/groups/${enc(ctx.group)}/fetch`); toast('Набор обновлён из API'); await render(root, ctx); }
          catch (e) { toast(e.message, 'err'); }
        },
      }, '⟳ Обновить из API'),
      h('label.btn', { style: { flexDirection: 'row', margin: 0, color: 'var(--ink)', cursor: 'pointer' }, title: 'JSON в формате API организаторов, одна запись или массив реплик {timestamp, speaker, text}' },
        '⬆ Загрузить диалог (JSON)',
        h('input', { type: 'file', accept: '.json,application/json', multiple: true, hidden: true, onchange: (e) => uploadFiles(e.target, ctx) })),
      count,
    ),
    h('div.table-scroll', { role: 'region', 'aria-label': 'Список диалогов', tabIndex: 0 },
      h('table.tbl',
        h('thead', h('tr', h('th', 'Диалог'), h('th', 'Канал'), h('th', 'Язык'), h('th.num', 'Реплик'), h('th.num', 'Итог'), h('th', ''), h('th', 'Флаг'), h('th', 'Апелляции'))),
        tbody)),
  );
  draw();
}

async function uploadFiles(input, ctx) {
  const files = [...(input.files || [])];
  if (!files.length) return;
  const target = (prompt('В какой набор загрузить? (новое имя создаст отдельный набор)', ctx.group === 'DEV' ? 'UPLOAD' : ctx.group) || '').trim();
  if (!target) return;
  let added = [];
  try {
    for (const f of files) {
      const r = await api.post(`/api/groups/${enc(target)}/upload`, { data: JSON.parse(await f.text()), file_name: f.name });
      added = added.concat(r.added);
    }
    toast(`Загружено в набор ${target}: ${added.join(', ')}`);
    try { localStorage.setItem('cqa.group', target); } catch {}
    location.hash = added.length === 1 ? `#/c/${enc(added[0])}` : '#/';
    location.reload();
  } catch (e) {
    toast(e instanceof SyntaxError ? `Файл не является JSON: ${e.message}` : e.message, 'err');
  }
  input.value = '';
}
