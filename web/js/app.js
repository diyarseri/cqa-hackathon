// Hash router. Each view is a module exporting render(root, ctx, ...params).
import { api } from './api.js';
import { h, mount, errorBox } from './ui.js';

const routes = [
  [/^#?\/?$/, () => import('./views/dialogs.js'), 'dialogs'],
  [/^#\/c\/([^/]+)(?:\/(\d+))?$/, () => import('./views/card.js'), 'dialogs'],
  [/^#\/batch$/, () => import('./views/batch.js'), 'batch'],
  [/^#\/checklists(?:\/([^/]+))?$/, () => import('./views/checklists.js'), 'checklists'],
  [/^#\/appeals(?:\/([^/]+))?$/, () => import('./views/appeals.js'), 'appeals'],
  [/^#\/validation(?:\/([^/]+))?$/, () => import('./views/validation.js'), 'validation'],
];

const view = document.getElementById('cqa-view');
const groupSel = document.getElementById('cqa-group');

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

async function loadGroups() {
  let groups = [];
  try {
    groups = (await api.get('/api/groups')).groups;
  } catch {}
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
  for (const [re, load, tab] of routes) {
    const m = re.exec(hash);
    if (!m) continue;
    document.querySelectorAll('#cqa-nav a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
    try {
      const mod = await load();
      if (my !== seq) return;
      await mod.render(view, ctx, ...m.slice(1).map((x) => (x ? decodeURIComponent(x) : x)));
    } catch (e) {
      if (my === seq) mount(view, errorBox(e));
      console.error(e);
    }
    return;
  }
  mount(view, h('div.alert.err', 'Страница не найдена'));
}

window.addEventListener('hashchange', route);
loadGroups().then(route);
