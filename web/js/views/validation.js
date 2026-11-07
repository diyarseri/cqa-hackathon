// Step 8: blind hand-labelling + agreement report (human vs model, per criterion).
import { api, enc } from '../api.js';
import { h, mount, toast, answerLabel, SPEAKERS, loading } from '../ui.js';
import { allowedAnswers } from '/shared/checklist.js';
import { fmtClock } from '/shared/normalize.js';
import { currentChecklist } from '../checklist-pick.js';

const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);

export async function render(root, ctx, convId) {
  mount(root, loading());
  const checklistId = await currentChecklist();
  if (convId) return labelView(root, ctx, convId, checklistId);
  const rep = await api.get(`/api/groups/${enc(ctx.group)}/validation?checklist=${enc(checklistId)}`);
  const ids = [...new Set([...rep.suggested, ...rep.labelled_ids])];
  const labelled = new Set(rep.labelled_ids);

  mount(root,
    h('div.page-heading',
      h('div', h('h1', 'Валидация'), h('p.muted', `Сравнение ручной разметки с моделью · набор ${ctx.group}`))),
    h('div.alert.info',
      'Разметьте вручную 10 диалогов, не глядя на оценку модели (она скрыта до сохранения). Делите работу: каждый размечает 5, затем 2–3 диалога размечают оба и сверяют разногласия между собой.'),
    h('div.summary',
      h('div.kpi', h('div.v', `${rep.labelled}`), h('div.l', 'размечено вручную')),
      h('div.kpi', h('div.v', `${rep.compared}`), h('div.l', 'есть и разметка, и оценка модели')),
      h('div.kpi', h('div.v', pct(rep.overall_exact)), h('div.l', 'совпадение ответов по всем критериям')),
      h('div.kpi', h('div.v', rep.total_mae == null ? '—' : rep.total_mae.toFixed(2)), h('div.l', 'средняя разница итога, баллов'))),
    h('h2', 'Согласие по критериям'),
    h('div.table-scroll', h('table.tbl',
      h('thead', h('tr', h('th', 'Критерий'), h('th.num', 'Пар'), h('th.num', 'Точное совпадение'), h('th.num', '± 1 ступень'), h('th', 'Расхождения (человек → модель)'))),
      h('tbody', rep.criteria.map((c) => h('tr',
        h('td', `${c.id}. ${c.title}`), h('td.num', c.n),
        h('td.num', h('span', { class: c.exact == null ? '' : c.exact >= 0.8 ? 'agree-hi' : c.exact < 0.6 ? 'agree-lo' : '' }, pct(c.exact))),
        h('td.num', c.within_one_step == null ? '' : pct(c.within_one_step)),
        h('td', c.disagreements.map((d) => h('a', { href: `#/c/${enc(d.conversation_id)}`, style: { marginRight: '.6rem' } },
          `${d.conversation_id}: ${answerLabel(d.human)}→${answerLabel(d.model)}`)))))))),
    h('h2', 'Выборка для разметки'),
    h('div.table-scroll', h('table.tbl', h('tbody', ids.map((id) => {
      const t = rep.totals.find((x) => x.id === id);
      return h('tr',
        h('td', h('a', { href: `#/validation/${enc(id)}` }, h('b', id))),
        h('td', labelled.has(id) ? h('span.pill', 'размечен') : h('span.pill.warn', 'не размечен')),
        h('td', t ? `человек ${t.human ?? '—'} · модель ${t.model ?? '—'}` : ''));
    })))),
    h('p', h('a.btn', { href: api.url(`/api/groups/${enc(ctx.group)}/validation?checklist=${enc(checklistId)}`), target: '_blank', rel: 'noreferrer' }, 'Отчёт в JSON')),
  );
}

async function labelView(root, ctx, convId, checklistId) {
  const [conv, checklist, existing] = await Promise.all([
    api.get(`/api/groups/${enc(ctx.group)}/conversations/${enc(convId)}`),
    api.get(`/api/checklists/${enc(checklistId)}`),
    api.get(`/api/groups/${enc(ctx.group)}/conversations/${enc(convId)}/label?checklist=${enc(checklistId)}`),
  ]);
  const answers = { ...(existing.answers || {}) };
  const notes = { ...(existing.notes || {}) };
  const labeler = h('input', { placeholder: 'Кто размечал', 'aria-label': 'Имя разметчика', value: existing.labeler || '', style: { maxWidth: '14rem' } });
  const compare = h('div');

  const rows = checklist.criteria.map((k) => {
    const seg = h('div.seg', { role: 'group', 'aria-label': `Ответ по критерию ${k.id}: ${k.title}` });
    const drawSeg = () => mount(seg, allowedAnswers(k).map((v) =>
      h('button', {
        type: 'button',
        class: answers[k.id] === v ? 'on' : '',
        'aria-pressed': answers[k.id] === v ? 'true' : 'false',
        onclick: () => { answers[k.id] = v; drawSeg(); },
      }, answerLabel(v))));
    drawSeg();
    return h('div.lbl-row',
      h('b', k.id),
      h('div', h('div', h('b', k.title)), h('div.muted', k.description),
        k.na?.allowed && h('div.muted', `N/A: ${k.na.condition}`),
        h('input', { placeholder: 'заметка (необязательно)', 'aria-label': `Заметка к критерию ${k.id}`, value: notes[k.id] || '', oninput: (e) => (notes[k.id] = e.target.value) })),
      seg);
  });

  const save = async () => {
    try {
      await api.put(`/api/groups/${enc(ctx.group)}/conversations/${enc(convId)}/label`, { checklist_id: checklistId, answers, notes, labeler: labeler.value });
      toast('Разметка сохранена');
      showCompare();
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  async function showCompare() {
    let ev;
    try {
      ev = await api.get(`/api/groups/${enc(ctx.group)}/conversations/${enc(convId)}/evaluation?checklist=${enc(checklistId)}`);
    } catch (error) {
      if (error.status !== 404) {
        return mount(compare, h('div.alert.err', `Не удалось загрузить оценку модели: ${error.message}`));
      }
      return mount(compare, h('div.alert.warn', 'Модель ещё не оценила этот диалог.'));
    }
    mount(compare, h('div.panel', h('h3', { style: { marginTop: 0 } }, 'Сравнение с моделью'),
      h('div.table-scroll', { role: 'region', 'aria-label': 'Сравнение ручной разметки с моделью', tabIndex: 0 }, h('table.tbl', checklist.criteria.map((k) => {
        const m = ev.criteria.find((c) => c.id === k.id);
        const same = m && m.answer === answers[k.id];
        return h('tr', h('td', k.id), h('td', 'человек: ', h('b', answerLabel(answers[k.id]))),
          h('td', 'модель: ', h('b', { class: same ? 'agree-hi' : 'agree-lo' }, answerLabel(m?.answer))),
          h('td.muted', same ? '' : m?.explanation));
      })))));
  }

  mount(root,
    h('div.toolbar', h('a.btn.ghost', { href: '#/validation' }, '← Валидация'), h('h1', { style: { margin: 0 } }, `Разметка: ${convId}`), labeler,
      h('button.btn.primary', { onclick: save }, 'Сохранить и сравнить')),
    h('div.card-layout',
      h('div.transcript', { role: 'region', 'aria-label': 'Расшифровка диалога', tabIndex: 0 }, conv.messages.map((m) => h('div', { class: `msg ${m.speaker}` },
        h('div.i', m.idx), h('div.ts', m.offset_sec != null ? fmtClock(m.offset_sec) : ''),
        h('div', h('div.who', SPEAKERS[m.speaker] || m.speaker), m.text)))),
      h('div', h('div.lbl-grid', rows), compare)));
  if (existing.answers) showCompare();
}
