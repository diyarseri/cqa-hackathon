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
    return mount(root,
      h('h1', { tabindex: -1 }, 'Не удалось загрузить диалоги'),
      errorBox(e),
      h('p.muted', 'Проверьте подключение к набору данных. Инструкция находится в разделе «Помощь».'));
  }
  const byId = Object.fromEntries(evals.map((e) => [e.conversation_id, e]));
  const requestedStatus = new URLSearchParams(location.hash.split('?')[1] || '').get('status');
  const state = {
    q: '',
    lang: '',
    channel: '',
    status: ['todo', 'attention', 'gross'].includes(requestedStatus) ? requestedStatus : '',
  };
  const tbody = h('tbody');
  let searchInput;
  let languageSelect;
  let channelSelect;
  let statusSelect;
  const quickButtons = new Map();

  function resetFilters() {
    Object.assign(state, { q: '', lang: '', channel: '', status: '' });
    searchInput.value = '';
    languageSelect.value = '';
    channelSelect.value = '';
    statusSelect.value = '';
    draw();
  }

  function setStatus(status) {
    state.status = status;
    if (statusSelect) statusSelect.value = status;
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
      if (state.status === 'attention' && !e?.gross_error && !e?.review_flags && !e?.open_appeals) return false;
      return true;
    });
    const rendered = rows.map((c) => {
      const e = byId[c.conversation_id];
      const changed = e && e.final_total !== e.original_total;
      const status = !e
        ? h('span.pill.na', 'Не проверен')
        : [
          e.gross_error ? h('span.pill.err', 'Серьёзное нарушение') : null,
          e.review_flags ? h('span.pill.warn', 'Проверить вручную') : null,
          e.open_appeals ? h('span.pill.warn', 'Спорная оценка') : null,
          !e.gross_error && !e.review_flags && !e.open_appeals ? h('span.pill', 'Проверен') : null,
        ];
      return h('tr',
        h('td', { 'data-label': 'Диалог' },
          h('a.table-link', { href: `#/c/${enc(c.conversation_id)}`, 'aria-label': `Открыть диалог ${c.conversation_id}` }, c.conversation_id),
          h('small.muted', c.language ? `Язык: ${c.language}` : '')),
        h('td', { 'data-label': 'Тип' },
          h('span', c.channel === 'voice call' ? 'Звонок' : 'Чат'),
          h('small.muted', `${c.messages} реплик`)),
        h('td.num', { 'data-label': 'Результат' },
          e ? h('span.score', fmtScore(e.final_total)) : h('span.muted', '—'),
          changed ? h('small.muted', `Раньше: ${fmtScore(e.original_total)}`) : null),
        h('td', { 'data-label': 'Статус' }, status),
        h('td', { 'data-label': 'Действие' }, h('a.btn.small', { href: `#/c/${enc(c.conversation_id)}` }, 'Открыть →')),
      );
    });
    if (rendered.length) {
      mount(tbody, rendered);
    } else {
      mount(tbody, h('tr', h('td', { colSpan: 5 },
        h('div.muted', convs.length ? 'По выбранным фильтрам ничего не найдено.' : 'В наборе пока нет диалогов.'),
        convs.length ? h('button.btn', { type: 'button', onclick: resetFilters }, 'Сбросить фильтры') : null,
      )));
    }
    count.textContent = `${rows.length} из ${convs.length}`;
    quickButtons.forEach((button, value) => {
      const active = state.status === value;
      button.classList.toggle('on', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  const count = h('span.muted');
  const sel = (key, opts, label) => h('select', { 'aria-label': label, onchange: (ev) => { state[key] = ev.target.value; draw(); } },
    opts.map(([v, l]) => h('option', { value: v }, l)));
  const langs = [...new Set(convs.map((c) => c.language))];
  const done = evals.length;

  searchInput = h('input', { type: 'search', 'aria-label': 'Найти диалог по номеру', placeholder: 'Введите номер диалога', oninput: (ev) => { state.q = ev.target.value; draw(); } });
  languageSelect = sel('lang', [['', 'Все языки'], ...langs.map((l) => [l, l])], 'Фильтр по языку');
  channelSelect = sel('channel', [['', 'Все каналы'], ['agent chat', 'Чаты'], ['voice call', 'Звонки']], 'Фильтр по каналу');
  statusSelect = sel('status', [['', 'Все статусы'], ['todo', 'Не проверены'], ['done', 'Проверены'], ['attention', 'Нужно проверить'], ['gross', 'Серьёзные нарушения'], ['appeal', 'Спорные оценки']], 'Фильтр по статусу');
  statusSelect.value = state.status;

  const quickFilters = [
    ['', 'Все'],
    ['todo', 'Не проверены'],
    ['attention', 'Нужно проверить'],
    ['gross', 'Серьёзные нарушения'],
  ];
  const quickFilterBar = h('div.quick-filters', { role: 'group', 'aria-label': 'Быстрые фильтры' }, quickFilters.map(([value, label]) => {
    const button = h('button.filter-chip', { type: 'button', 'aria-pressed': state.status === value, onclick: () => setStatus(value) }, label);
    quickButtons.set(value, button);
    return button;
  }));

  mount(root,
    h('div.page-head',
      h('div',
        h('h1', { tabindex: -1 }, 'Все диалоги'),
        h('p.muted', `Набор данных ${ctx.group}. Найдите разговор и откройте его результат.`)),
      h('a.btn.primary', { href: '#/batch' }, done < convs.length ? 'Проверить новые' : 'Проверить весь набор')),
    h('div.dialog-search',
      h('label', 'Найти диалог', searchInput),
      h('span.dialog-count', count)),
    quickFilterBar,
    h('details.box.dialog-options',
      h('summary', 'Дополнительные фильтры и действия'),
      h('div.toolbar',
        languageSelect,
        channelSelect,
        statusSelect,
        await checklistPicker(() => render(root, ctx)),
        h('button.btn', {
          onclick: async () => {
            try { await api.post(`/api/groups/${enc(ctx.group)}/fetch`); toast('Набор данных обновлён'); await render(root, ctx); }
            catch (e) { toast(e.message, 'err'); }
          },
        }, 'Обновить данные'),
        h('label.btn', { title: 'Можно загрузить JSON из API организаторов, одну запись или массив реплик' },
          'Загрузить разговор',
          h('input', { type: 'file', accept: '.json,application/json', multiple: true, hidden: true, onchange: (e) => uploadFiles(e.target, ctx) })))),
    h('div.table-scroll', { role: 'region', 'aria-label': 'Список диалогов', tabIndex: 0 },
      h('table.tbl',
        h('thead', h('tr', h('th', 'Диалог'), h('th', 'Тип'), h('th.num', 'Результат'), h('th', 'Статус'), h('th', ''))),
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
    location.hash = added.length === 1 ? `#/c/${enc(added[0])}` : '#/dialogs';
    location.reload();
  } catch (e) {
    toast(e instanceof SyntaxError ? `Файл не является JSON: ${e.message}` : e.message, 'err');
  }
  input.value = '';
}
