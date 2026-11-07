// Hash router. Each view is a module exporting render(root, ctx, ...params).
import { api } from './api.js';
import { h, mount, errorBox, loading, enhanceView } from './ui.js';
import { initI18n, t } from './i18n.js';

const routes = [
  [/^#?\/?$/, () => import('./views/home.js'), 'home', 'Главная'],
  [/^#\/dialogs(?:\?status=([^&]+))?$/, () => import('./views/dialogs.js'), 'dialogs', 'Все диалоги'],
  [/^#\/c\/([^/]+)(?:\/(\d+))?$/, () => import('./views/card.js'), 'dialogs', 'Карточка диалога'],
  [/^#\/insights$/, () => import('./views/insights.js'), 'insights', 'Результаты'],
  [/^#\/batch$/, () => import('./views/batch.js'), 'batch', 'Проверить набор'],
  [/^#\/checklists(?:\/([^/]+))?$/, () => import('./views/checklists.js'), 'checklists', 'Критерии оценки'],
  [/^#\/appeals(?:\/([^/]+))?$/, () => import('./views/appeals.js'), 'appeals', 'Спорные оценки'],
  [/^#\/validation(?:\/([^/]+))?$/, () => import('./views/validation.js'), 'validation', 'Проверка точности'],
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
const menuToggle = document.getElementById('cqa-menu-toggle');
const nav = document.getElementById('cqa-nav');
const helpDialog = document.getElementById('cqa-help');
const localeSelect = document.getElementById('cqa-locale');
const utilityWrap = document.getElementById('cqa-utility');
const utilityToggle = document.getElementById('cqa-utility-toggle');
const utilityMenu = document.getElementById('cqa-utility-menu');

initI18n(localeSelect);

const headerMenus = [];

function closeHeaderMenus(except = null) {
  for (const item of headerMenus) {
    if (item === except) continue;
    item.panel.hidden = true;
    item.trigger.setAttribute('aria-expanded', 'false');
    item.root.classList.remove('open');
  }
}

function toggleHeaderMenu(item) {
  const open = item.panel.hidden;
  closeHeaderMenus(item);
  if (open) {
    nav.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', t('Открыть меню'));
  }
  item.panel.hidden = !open;
  item.trigger.setAttribute('aria-expanded', String(open));
  item.root.classList.toggle('open', open);
}

function registerMenu(root, trigger, panel) {
  const item = { root, trigger, panel };
  headerMenus.push(item);
  trigger.addEventListener('click', () => toggleHeaderMenu(item));
  return item;
}

function setupPicker({ rootId, select, triggerId, valueId, menuId }) {
  const root = document.getElementById(rootId);
  const trigger = document.getElementById(triggerId);
  const value = document.getElementById(valueId);
  const menu = document.getElementById(menuId);
  const item = registerMenu(root, trigger, menu);

  const refresh = () => {
    const options = [...select.options];
    const selected = options.find((option) => option.value === select.value) || options[0];
    value.textContent = selected?.textContent || select.value;
    trigger.setAttribute('aria-label', `${root.querySelector('.picker-label')?.textContent || ''}: ${value.textContent}`);
    mount(menu, options.map((option) => h('button.picker-option', {
      type: 'button',
      role: 'option',
      'aria-selected': option.value === select.value,
      onclick: () => {
        select.value = option.value;
        closeHeaderMenus();
        select.dispatchEvent(new Event('change', { bubbles: true }));
      },
    }, h('span', option.textContent), option.value === select.value ? h('span.option-check', { 'aria-hidden': true }, '✓') : null)));
  };
  select.addEventListener('change', refresh);
  refresh();
  return { ...item, refresh };
}

const groupPicker = setupPicker({
  rootId: 'cqa-group-picker', select: groupSel, triggerId: 'cqa-group-trigger', valueId: 'cqa-group-value', menuId: 'cqa-group-menu',
});
const localePicker = setupPicker({
  rootId: 'cqa-locale-picker', select: localeSelect, triggerId: 'cqa-locale-trigger', valueId: 'cqa-locale-value', menuId: 'cqa-locale-menu',
});
registerMenu(utilityWrap, utilityToggle, utilityMenu);

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
  connection.querySelector('.connection-label').textContent = t(label);
  connection.title = t(detail || label);
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
    h('option', { value: '__new' }, '+ добавить набор…'),
  );
  groupPicker.refresh();
}

groupSel.addEventListener('change', async () => {
  let g = groupSel.value;
  if (g === '__new') {
    g = (prompt(t('Введите название или ID набора, который сообщили организаторы:')) || '').trim();
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
    nav.classList.remove('open');
    closeHeaderMenus();
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', t('Открыть меню'));
    app.dataset.route = tab;
    document.title = `${t(title)} — Conversation Quality`;

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
    h('a.btn.primary', { href: '#/dialogs' }, 'К диалогам'),
  ));
}

function applyTheme(theme) {
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  localStorageSet('cqa.theme.v2', next);
  themeButton.setAttribute('aria-label', next === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему');
  themeButton.setAttribute('aria-label', t(themeButton.getAttribute('aria-label')));
  themeButton.title = themeButton.getAttribute('aria-label');
  themeButton.querySelector('.theme-glyph').textContent = next === 'dark' ? '☀' : '◐';
  themeButton.querySelector('.theme-label').textContent = t(next === 'dark' ? 'Светлая тема' : 'Тёмная тема');
}

applyTheme(document.documentElement.dataset.theme);
themeButton.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  closeHeaderMenus();
});

const commands = [
  { title: 'Главная', detail: 'Что требует внимания', hash: '#/', terms: 'home обзор начало' },
  { title: 'Все диалоги', detail: 'Список и поиск разговоров', hash: '#/dialogs', terms: 'dialogs conversations чаты звонки' },
  { title: 'Результаты', detail: 'Сводка по качеству и критериям', hash: '#/insights', terms: 'analytics insights отчёт' },
  { title: 'Проверить набор', detail: 'Проверить новые диалоги', hash: '#/batch', terms: 'batch model запуск оценить' },
  { title: 'Критерии оценки', detail: 'Правила и версии', hash: '#/checklists', terms: 'checklists criteria настройки' },
  { title: 'Спорные оценки', detail: 'Очередь пересмотра', hash: '#/appeals', terms: 'appeals review споры' },
  { title: 'Проверка точности', detail: 'Сравнение с ручной разметкой', hash: '#/validation', terms: 'validation labels разметка' },
];

function goCommand(hash) {
  commandDialog.close();
  if (location.hash === hash) route();
  else location.hash = hash;
}

function drawCommands() {
  const query = commandInput.value.trim();
  const needle = query.toLocaleLowerCase('ru');
  const matches = commands.filter((item) => `${item.title} ${t(item.title)} ${item.detail} ${t(item.detail)} ${item.terms}`.toLocaleLowerCase().includes(needle));
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
  closeHeaderMenus();
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

menuToggle.addEventListener('click', () => {
  closeHeaderMenus();
  const open = nav.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', t(open ? 'Закрыть меню' : 'Открыть меню'));
});
nav.addEventListener('click', (event) => {
  if (!event.target.closest('a, button')) return;
  nav.classList.remove('open');
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', t('Открыть меню'));
});

document.addEventListener('pointerdown', (event) => {
  if (!headerMenus.some((item) => item.root.contains(event.target))) closeHeaderMenus();
  if (nav.classList.contains('open') && !nav.contains(event.target) && !menuToggle.contains(event.target)) {
    nav.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', t('Открыть меню'));
  }
});

function openHelp() {
  closeHeaderMenus();
  nav.classList.remove('open');
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', t('Открыть меню'));
  helpDialog.showModal();
}

document.getElementById('cqa-help-open').addEventListener('click', openHelp);
document.getElementById('cqa-assistant').addEventListener('click', openHelp);
helpDialog.querySelectorAll('.help-close').forEach((button) => button.addEventListener('click', () => helpDialog.close()));
helpDialog.querySelector('.help-start').addEventListener('click', () => helpDialog.close());
helpDialog.addEventListener('click', (event) => {
  if (event.target === helpDialog) helpDialog.close();
});

window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  closeHeaderMenus();
});

window.addEventListener('hashchange', route);
window.addEventListener('cqa:localechange', () => {
  applyTheme(document.documentElement.dataset.theme);
  localePicker.refresh();
  loadGroups().then(route);
});
loadGroups().then(route);
