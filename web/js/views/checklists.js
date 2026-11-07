// Checklist editor: create, edit, delete, version history / restore.
import { api, enc } from '../api.js';
import { h, mount, toast, fmtDate, errorBox, loading } from '../ui.js';
import { validateChecklist, blankCriterion, TYPE_LABELS } from '/shared/checklist.js';
import { invalidateChecklists } from '../checklist-pick.js';

export async function render(root, ctx, id) {
  invalidateChecklists();
  mount(root, loading());
  const list = await api.get('/api/checklists');
  if (!id) id = list[0]?.id;
  const side = h('aside.cl-side',
    h('h2', 'Критерии оценки'),
    h('ul.cl-list', list.map((c) =>
      h('li', { class: c.id === id ? 'on' : '' },
        h('a', { href: `#/checklists/${enc(c.id)}`, 'aria-current': c.id === id ? 'page' : null }, c.name),
        h('small', `v${c.version} · ${c.criteria} крит.`)))),
    h('button.btn', { onclick: () => newChecklist(list) }, '+ Новый чек-лист'),
  );
  const main = h('section.cl-main', { 'aria-label': 'Редактор чек-листа' });
  mount(root, h('div.cl-layout', side, main));
  if (!id) return mount(main,
    h('div.page-head',
      h('div', h('h1', { tabindex: -1 }, 'Редактор чек-листов'), h('p.muted', 'Настройте критерии оценки без изменений в коде.'))),
    h('div.empty-state', h('h2', 'Критериев пока нет'), h('p', 'Создайте первый набор критериев, чтобы начать проверять диалоги.'), h('button.btn.primary', { onclick: () => newChecklist(list) }, 'Создать критерии')),
  );
  try {
    const doc = await api.get(`/api/checklists/${enc(id)}`);
    const versions = await api.get(`/api/checklists/${enc(id)}/versions`);
    editor(main, doc, versions, root, ctx);
  } catch (e) {
    mount(main, errorBox(e));
  }
}

async function newChecklist(list) {
  const name = prompt('Название нового чек-листа');
  if (!name) return;
  const base = list[0] ? await api.get(`/api/checklists/${enc(list[0].id)}`) : null;
  const copy = base && confirm('Скопировать критерии из текущего чек-листа?');
  const body = copy
    ? { ...base, id: undefined, name, version_note: `Копия «${base.name}» v${base.version}` }
    : { name, description: '', total_points: 100, rounding: 2, global_rules: [], sections: [], criteria: [{ ...blankCriterion([]), title: 'Новый критерий', description: 'Да — …' }] };
  try {
    const saved = await api.post('/api/checklists', body);
    toast('Критерии оценки созданы');
    location.hash = `#/checklists/${enc(saved.id)}`;
  } catch (e) {
    toast(e.message, 'err');
  }
}

function editor(root, original, versions, pageRoot, ctx) {
  const doc = structuredClone(original);
  const status = h('div.cl-status', { role: 'status', 'aria-live': 'polite' });
  const body = h('div');

  function refresh() {
    const errs = validateChecklist(doc);
    const weights = doc.criteria.filter((k) => k.type !== 'flag').reduce((s, k) => s + (Number(k.weight) || 0), 0);
    mount(status,
      h('span', { class: weights === (doc.total_points || 100) ? 'pill ok' : 'pill warn' },
        `Сумма весов: ${weights}`, weights !== (doc.total_points || 100) ? ` (нормализуется к ${doc.total_points || 100})` : ''),
      errs.length ? h('ul.errs', errs.map((e) => h('li', e))) : h('span.pill.ok', 'Конфигурация корректна'));
    saveBtn.disabled = errs.length > 0;
  }

  const saveBtn = h('button.btn.primary', { onclick: save }, 'Сохранить как новую версию');

  async function save() {
    const note = prompt('Комментарий к версии (что изменилось)?', '') ?? null;
    if (note === null) return;
    try {
      const saved = await api.put(`/api/checklists/${enc(doc.id)}`, { ...doc, version_note: note });
      toast(`Сохранено: версия ${saved.version}`);
      await render(pageRoot, ctx, doc.id);
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  async function del() {
    if (!confirm(`Удалить чек-лист «${doc.name}»? История версий сохранится для уже выполненных оценок.`)) return;
    try {
      await api.del(`/api/checklists/${enc(doc.id)}`);
      toast('Критерии оценки удалены');
      location.hash = '#/checklists';
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  async function restore(v) {
    try {
      const old = await api.get(`/api/checklists/${enc(doc.id)}?version=${v}`);
      if (!confirm(`Восстановить версию ${v}? Будет создана новая версия с её содержимым.`)) return;
      await api.put(`/api/checklists/${enc(doc.id)}`, { ...old, version_note: `Восстановлено из v${v}` });
      toast('Версия восстановлена');
      await render(pageRoot, ctx, doc.id);
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  const bind = (obj, key, cast = (v) => v) => ({
    value: obj[key] ?? '',
    oninput: (e) => {
      obj[key] = cast(e.target.value);
      refresh();
    },
  });

  function draw() {
    mount(body,
      h('div.grid2',
        h('label', 'Название', h('input', bind(doc, 'name'))),
        h('label', 'Описание', h('input', bind(doc, 'description')))),
      h('details.box',
        h('summary', `Общие правила оценки (${doc.global_rules?.length || 0}) — попадают в промпт`),
        h('textarea', {
          rows: 8,
          'aria-label': 'Общие правила оценки, по одному правилу на строку',
          value: (doc.global_rules || []).join('\n'),
          oninput: (e) => {
            doc.global_rules = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean);
            refresh();
          },
        }),
        h('small.muted', 'Одно правило на строку.')),
      h('details.box',
        h('summary', `Секции (${doc.sections?.length || 0})`),
        (doc.sections || []).map((s, i) =>
          h('div.row',
            h('input', { ...bind(s, 'id'), placeholder: 'id', 'aria-label': `ID секции ${i + 1}`, style: { maxWidth: '9rem' } }),
            h('input', { ...bind(s, 'title'), placeholder: 'Название секции', 'aria-label': `Название секции ${i + 1}` }),
            h('button.btn.ghost', { 'aria-label': `Удалить секцию ${s.title || s.id || i + 1}`, onclick: () => { doc.sections.splice(i, 1); draw(); } }, '✕'))),
        h('button.btn', { onclick: () => { (doc.sections ||= []).push({ id: `s${doc.sections.length + 1}`, title: '' }); draw(); } }, '+ Секция')),
      h('h3', 'Критерии'),
      doc.criteria.map((k, i) => criterionCard(k, i)),
      h('button.btn', { onclick: () => { doc.criteria.push(blankCriterion(doc.criteria)); draw(); } }, '+ Критерий'),
    );
    refresh();
  }

  function criterionCard(k, i) {
    const move = (d) => {
      const j = i + d;
      if (j < 0 || j >= doc.criteria.length) return;
      [doc.criteria[i], doc.criteria[j]] = [doc.criteria[j], doc.criteria[i]];
      draw();
    };
    k.na ||= { allowed: false, condition: '' };
    return h('div.crit',
      h('div.crit-head',
        h('input.id', { ...bind(k, 'id'), title: 'ID критерия', 'aria-label': `ID критерия ${i + 1}` }),
        h('input.title', { ...bind(k, 'title'), placeholder: 'Название критерия', 'aria-label': `Название критерия ${k.id || i + 1}` }),
        h('div.crit-tools',
          h('button.btn.ghost', { title: 'Выше', 'aria-label': `Переместить критерий ${k.id} выше`, onclick: () => move(-1) }, '↑'),
          h('button.btn.ghost', { title: 'Ниже', 'aria-label': `Переместить критерий ${k.id} ниже`, onclick: () => move(1) }, '↓'),
          h('button.btn.ghost.danger', {
            title: 'Удалить критерий',
            'aria-label': `Удалить критерий ${k.id}`,
            onclick: () => { if (confirm(`Удалить критерий ${k.id}?`)) { doc.criteria.splice(i, 1); draw(); } },
          }, '✕'))),
      h('div.grid4',
        h('label', 'Секция',
          h('select', { onchange: (e) => { k.section = e.target.value || null; refresh(); } },
            h('option', { value: '' }, '—'),
            (doc.sections || []).map((s) => h('option', { value: s.id, selected: s.id === k.section }, s.title || s.id)))),
        h('label', 'Тип ответа',
          h('select', {
            onchange: (e) => {
              k.type = e.target.value;
              if (k.type === 'flag') { k.weight = 0; k.na = { allowed: false, condition: '' }; }
              if (k.type === 'scale' && !k.scale) k.scale = { steps: [{ value: 10, label: 'Полностью' }, { value: 5, label: 'Частично' }, { value: 0, label: 'Нет' }] };
              if (k.type !== 'flag' && !k.weight) k.weight = 10;
              draw();
            },
          }, Object.entries(TYPE_LABELS).map(([v, l]) => h('option', { value: v, selected: v === k.type }, l)))),
        h('label', 'Вес',
          h('input', { type: 'number', min: 0, step: 'any', disabled: k.type === 'flag', ...bind(k, 'weight', Number) })),
        h('label.check',
          h('input', {
            type: 'checkbox', checked: !!k.na.allowed, disabled: k.type === 'flag',
            onchange: (e) => { k.na.allowed = e.target.checked; draw(); },
          }), ' N/A допустим')),
      h('label', 'Формулировка (что значит «Да» / что оценивается)', h('textarea', { rows: 2, ...bind(k, 'description') })),
      k.na.allowed && h('label', 'Условие N/A', h('input', bind(k.na, 'condition'))),
      k.type === 'scale' && h('div.steps',
        h('div.muted', 'Ступени шкалы (верхняя даёт полный вес)'),
        k.scale.steps.map((s, si) => h('div.row',
          h('input', { type: 'number', min: 0, step: 'any', 'aria-label': `Значение ступени ${si + 1} критерия ${k.id}`, style: { maxWidth: '6rem' }, ...bind(s, 'value', Number) }),
          h('input', { ...bind(s, 'label'), placeholder: 'Описание ступени', 'aria-label': `Описание ступени ${si + 1} критерия ${k.id}` }),
          h('button.btn.ghost', { 'aria-label': `Удалить ступень ${si + 1} критерия ${k.id}`, onclick: () => { k.scale.steps.splice(si, 1); draw(); } }, '✕'))),
        h('button.btn', { onclick: () => { k.scale.steps.push({ value: 0, label: '' }); draw(); } }, '+ Ступень')),
      h('label', 'Пояснения для оценщика (уточнения правил, попадают в промпт)',
        h('textarea', { rows: 2, ...bind(k, 'guidance') })),
    );
  }

  mount(root,
    h('div.cl-toolbar.page-head',
      h('div',
        h('h1', { tabindex: -1 }, doc.name),
        h('p.muted', `${doc.id} · версия ${doc.version}. Изменения сохраняются новой неизменяемой версией.`)),
      h('div.row', saveBtn, h('button.btn.ghost.danger', { onclick: del }, 'Удалить чек-лист'))),
    status,
    body,
    h('details.box',
      h('summary', `История версий (${versions.length})`),
      h('div.table-scroll', { tabindex: 0, role: 'region', 'aria-label': 'История версий чек-листа' }, h('table.tbl',
        h('tr', h('th', 'Версия'), h('th', 'Сохранено'), h('th', 'Комментарий'), h('th', '')),
        versions.slice().reverse().map((v) => h('tr',
          h('td', `v${v.version}`), h('td', fmtDate(v.saved_at)), h('td', v.note || ''),
          h('td', v.version === doc.version ? h('span.muted', 'текущая') : h('button.btn.ghost', { onclick: () => restore(v.version) }, 'Восстановить'))))))),
  );
  draw();
}
