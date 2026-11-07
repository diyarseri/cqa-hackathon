// Hash router. Each view is a module exporting render(root, ctx, ...params).
import { api } from './api.js';
import { h, mount, errorBox, loading, enhanceView } from './ui.js';

const routes = [
  [/^#?\/?$/, () => import('./views/dialogs.js'), 'dialogs', 'Диалоги'],
  [/^#\/c\/([^/]+)(?:\/(\d+))?$/, () => import('./views/card.js'), 'dialogs', 'Карточка диалога'],
  [/^#\/insights$/, () => import('./views/insights.js'), 'insights', 'Аналитика'],
  [/^#\/batch$/, () => import('./views/batch.js'), 'batch', 'Пакетная оценка'],
  [/^#\/checklists(?:\/([^/]+))?$/, () => import('./views/checklists.js'), 'checklists', 'Чек-листы'],
  [/^#\/appeals(?:\/([^/]+))?$/, () => import('./views/appeals.js'), 'appeals', 'Апелляции'],
  [/^#\/validation(?:\/([^/]+))?$/, () => import('./views/validation.js'), 'validation', 'Валидация'],
];

const app = document.getElementById('cqa-app');
const view = document.getElementById('cqa-view');
const groupSel = document.getElementById('cqa-group');
const connection = document.getElementById('cqa-connection');
const themeButton = document.getElementById('cqa-theme');
const commandDialog = document.getElementById('cqa-command');
const commandOpen = document.getElementById('cqa-command-open');
const commandInput = document.getElementById('cqa-command-input');
const commandList = document.getElementById('cqa-command-list');

export const ctx = {
  get group() {
    return localStorageGet('cqa.group') || 'DEV';
  },
  set group(g) {
    localStorageSet('cqa.group', g);
  },
};

function localStorageGet(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}
function localStorageSet(k, v) {
  try { localStorage.setItem(k, v); } catch {}
}

function setConnection(state, label, detail = '') {
  connection.className = `connection ${state}`;
  connection.querySelector('.connection-label').textContent = label;
  connection.title = detail || label;
}

async function loadGroups() {
  let groups = [];
  setConnection('pending', 'Подключение');
  try {
    groups = (await api.get('/api/groups')).groups;
    setConnection('online', 'Сервер доступен');
  } catch (error) {
    setConnection('offline', 'Нет связи', error.message);
  }
  if (!groups.includes(ctx.group)) groups.unshift(ctx.group);
  mount(
    groupSel,
    groups.map((g) => h('option', { value: g, selected: g === ctx.group }, g)),
    h('option', { value: '__new' }, '+ другой group_id…'),
  );
}

groupSel.addEventListener('change', async () => {
  let g = groupSel.value;
  if (g === '__new') {
    g = (prompt('group_id из API организаторов (например, контрольный набор):') || '').trim();
    if (!g) return loadGroups();
  }
  ctx.group = g;
  await loadGroups();
  route();
});

let seq = 0;
async function route() {
  const hash = location.hash || '#/';
  const my = ++seq;
  for (const [re, load, tab, title] of routes) {
    const m = re.exec(hash);
    if (!m) continue;
    document.querySelectorAll('#cqa-nav a').forEach((a) => {
      const current = a.dataset.tab === tab;
      a.classList.toggle('on', current);
      if (current) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    app.dataset.route = tab;
    document.title = `${title} — Conversation Quality`;

    // Each navigation renders into its own node. A slow previous request can
    // finish safely without replacing the newer route.
    const stage = h('section.route-stage', { 'aria-label': title });
    mount(stage, loading('Открываем раздел…'));
    mount(view, stage);
    view.setAttribute('aria-busy', 'true');
    try {
      const mod = await load();
      if (my !== seq) return;
      await mod.render(stage, ctx, ...m.slice(1).map((x) => (x ? decodeURIComponent(x) : x)));
      if (my !== seq) return;
      enhanceView(stage);
      stage.classList.add('route-ready');
      view.setAttribute('aria-busy', 'false');
      const heading = stage.querySelector('h1, h2');
      if (heading) {
        heading.tabIndex = -1;
        requestAnimationFrame(() => heading.focus({ preventScroll: true }));
      }
    } catch (e) {
      if (my === seq) {
        mount(stage, errorBox(e));
        stage.classList.add('route-ready');
        view.setAttribute('aria-busy', 'false');
      }
      console.error(e);
    }
    return;
  }
  view.setAttribute('aria-busy', 'false');
  mount(view, h('section.route-stage.route-ready',
    h('h1', 'Страница не найдена'),
    h('div.alert.err', 'Проверьте адрес или вернитесь к списку диалогов.'),
    h('a.btn.primary', { href: '#/' }, 'К диалогам'),
  ));
}

function applyTheme(theme) {
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  localStorageSet('cqa.theme', next);
  themeButton.setAttribute('aria-label', next === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему');
  themeButton.title = themeButton.getAttribute('aria-label');
  themeButton.querySelector('.theme-glyph').textContent = next === 'dark' ? '☀' : '◐';
}

applyTheme(document.documentElement.dataset.theme);
themeButton.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});

const commands = [
  { title: 'Диалоги', detail: 'Список и поиск разговоров', hash: '#/', terms: 'dialogs conversations чаты звонки' },
  { title: 'Аналитика', detail: 'Сводка по качеству и критериям', hash: '#/insights', terms: 'analytics insights отчёт' },
  { title: 'Пакетная оценка', detail: 'Запустить оценку набора', hash: '#/batch', terms: 'batch model запуск' },
  { title: 'Чек-листы', detail: 'Критерии и версии', hash: '#/checklists', terms: 'checklists criteria настройки' },
  { title: 'Апелляции', detail: 'Очередь проверки', hash: '#/appeals', terms: 'appeals review споры' },
  { title: 'Валидация', detail: 'Сравнение с ручной разметкой', hash: '#/validation', terms: 'validation labels разметка' },
];

function goCommand(hash) {
  commandDialog.close();
  if (location.hash === hash) route();
  else location.hash = hash;
}

function drawCommands() {
  const query = commandInput.value.trim();
  const needle = query.toLocaleLowerCase('ru');
  const matches = commands.filter((item) => `${item.title} ${item.detail} ${item.terms}`.toLocaleLowerCase('ru').includes(needle));
  const direct = query
    ? h('button.command-item.direct', { type: 'button', onclick: () => goCommand(`#/c/${encodeURIComponent(query)}`) },
      h('span.command-symbol', { 'aria-hidden': true }, '↗'),
      h('span', h('strong', `Открыть диалог «${query}»`), h('small', `Набор ${ctx.group}`)),
      h('kbd', 'Enter'))
    : null;
  mount(commandList,
    matches.map((item) => h('button.command-item', { type: 'button', onclick: () => goCommand(item.hash) },
      h('span.command-symbol', { 'aria-hidden': true }, '→'),
      h('span', h('strong', item.title), h('small', item.detail)),
    )),
    direct,
    !direct && !matches.length ? h('p.command-empty', 'Ничего не найдено') : null,
  );
}

function openCommands() {
  drawCommands();
  commandDialog.showModal();
  requestAnimationFrame(() => commandInput.focus());
}

commandOpen.addEventListener('click', openCommands);
commandDialog.querySelector('.command-close').addEventListener('click', () => commandDialog.close());
commandDialog.addEventListener('click', (event) => {
  if (event.target === commandDialog) commandDialog.close();
});
commandInput.addEventListener('input', drawCommands);
commandInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  commandList.querySelector('button')?.click();
});
window.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (commandDialog.open) commandDialog.close();
    else openCommands();
  }
});

window.addEventListener('hashchange', route);
loadGroups().then(route);
