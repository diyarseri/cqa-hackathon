// Reviewer workspace: list of appeals → decision on one appeal.
import { api, enc } from '../api.js';
import { h, mount, toast, answerLabel, fmtScore, fmtDate, SPEAKERS, errorBox, loading } from '../ui.js';
import { allowedAnswers } from '/shared/checklist.js';

export async function render(root, ctx, appealId) {
  mount(root, loading());
  const all = await api.get(`/api/groups/${enc(ctx.group)}/appeals`);
  if (appealId) {
    const a = all.find((x) => x.id === appealId);
    if (!a) return mount(root, errorBox('Апелляция не найдена'));
    return detail(root, ctx, a);
  }
  const open = all.filter((a) => a.status === 'open').length;
  mount(root,
    h('h2', 'Апелляции', h('small', ` · набор ${ctx.group} · открыто ${open} из ${all.length}`)),
    all.length === 0
      ? h('div.alert.info', 'Апелляций пока нет. Откройте карточку диалога и нажмите «Оспорить» у критерия.')
      : h('table.tbl',
        h('thead', h('tr', h('th', 'Статус'), h('th', 'Диалог'), h('th', 'Критерий'), h('th', 'Оспорено'), h('th', 'Комментарий'), h('th.num', 'Итог'), h('th', 'Подана'))),
        h('tbody', all.map((a) => h('tr.click', { onclick: () => (location.hash = `#/appeals/${enc(a.id)}`) },
          h('td', a.status === 'open' ? h('span.pill.warn', 'открыта') : a.status === 'changed' ? h('span.pill', 'изменена') : h('span.pill.na', 'подтверждена')),
          h('td', h('b', a.conversation_id)),
          h('td', a.criterion_id),
          h('td', answerLabel(a.disputed_answer), a.decision ? ` → ${answerLabel(a.decision.answer)}` : ''),
          h('td', a.comment.length > 80 ? a.comment.slice(0, 80) + '…' : a.comment),
          h('td.num', a.status === 'open' ? fmtScore(a.final_total) : `${fmtScore(a.score_before)} → ${fmtScore(a.score_after)}`),
          h('td', fmtDate(a.created_at)))))),
  );
}

async function detail(root, ctx, a) {
  const [conv, checklist] = await Promise.all([
    api.get(`/api/groups/${enc(ctx.group)}/conversations/${enc(a.conversation_id)}`),
    api.get(`/api/checklists/${enc(a.checklist.id)}?version=${a.checklist.version}`),
  ]);
  const k = checklist.criteria.find((x) => x.id === a.criterion_id);

  // Fragment: evidence and checked range, with 2 messages of context each side.
  const idx = new Set();
  const add = (i) => { for (let j = i - 2; j <= i + 2; j++) if (j >= 0 && j < conv.messages.length) idx.add(j); };
  a.evidence.forEach(add);
  if (a.checked_range) for (let i = a.checked_range.from; i <= a.checked_range.to; i++) add(i);
  if (!idx.size) conv.messages.forEach((m) => idx.add(m.idx));
  const sorted = [...idx].sort((x, y) => x - y);
  const frag = [];
  sorted.forEach((i, n) => {
    if (n && i !== sorted[n - 1] + 1) frag.push(h('div.muted', { style: { padding: '.2rem .5rem' } }, '…'));
    const m = conv.messages[i];
    const hl = a.evidence.includes(i);
    const inr = a.checked_range && i >= a.checked_range.from && i <= a.checked_range.to;
    frag.push(h('div', { class: `msg ${m.speaker}${hl ? ' hl' : inr ? ' inrange' : ''}` },
      h('div.i', i), h('div.ts', m.timestamp.length > 8 ? m.timestamp.slice(11, 19) : m.timestamp),
      h('div', h('div.who', SPEAKERS[m.speaker] || m.speaker), m.text)));
  });

  const decision = h('div');
  if (a.status === 'open') {
    let action = 'confirm';
    const answers = allowedAnswers(k).filter((v) => v !== a.disputed_answer);
    const ansSel = h('select', { disabled: true }, answers.map((v) => h('option', { value: v }, answerLabel(v))));
    const reason = h('textarea', { rows: 3, placeholder: 'Причина решения (обязательно)' });
    const radio = (val, label) => h('label.check', h('input', {
      type: 'radio', name: 'act', checked: val === action,
      onchange: () => { action = val; ansSel.disabled = val !== 'change'; },
    }), ' ', label);
    mount(decision, h('div.panel',
      h('h3', { style: { marginTop: 0 } }, 'Решение проверяющего'),
      radio('confirm', `Подтвердить оценку «${answerLabel(a.disputed_answer)}»`),
      h('div.row', radio('change', 'Изменить на'), ansSel),
      reason,
      h('div.row', h('button.btn.primary', {
        onclick: async (e) => {
          e.target.disabled = true;
          try {
            const res = await api.post(`/api/groups/${enc(ctx.group)}/conversations/${enc(a.conversation_id)}/appeals/${enc(a.id)}/decision`, {
              checklist_id: a.checklist.id, action, answer: action === 'change' ? ansSel.value : undefined, reason: reason.value,
            });
            toast(`Решение сохранено. Итог: ${fmtScore(res.appeal.score_before)} → ${fmtScore(res.appeal.score_after)}`);
            render(root, ctx, a.id);
          } catch (err) {
            toast(err.message, 'err');
            e.target.disabled = false;
          }
        },
      }, 'Сохранить решение'))));
  } else {
    mount(decision, h('div.panel',
      h('h3', { style: { marginTop: 0 } }, a.status === 'changed' ? '✔ Оценка изменена' : '✔ Оценка подтверждена'),
      h('p', `${answerLabel(a.disputed_answer)} → ${answerLabel(a.decision.answer)}`),
      h('p', h('b', 'Причина: '), a.decision.reason),
      h('p', `${a.decision.reviewer} · ${fmtDate(a.decision.decided_at)}`),
      h('div.summary',
        h('div.kpi', h('div.v', fmtScore(a.original_total)), h('div.l', 'исходный итог (модель)')),
        h('div.kpi', h('div.v', fmtScore(a.score_before)), h('div.l', 'до решения')),
        h('div.kpi', h('div.v', fmtScore(a.score_after)), h('div.l', 'после решения'))),
    ));
  }

  mount(root,
    h('div.toolbar', h('a.btn.ghost', { href: '#/appeals' }, '← Все апелляции'),
      h('h2', { style: { margin: 0 } }, `Апелляция: ${a.conversation_id}, критерий ${k.id}`),
      h('a.btn.ghost', { href: `#/c/${enc(a.conversation_id)}` }, 'Открыть карточку диалога')),
    h('div.card-layout',
      h('div',
        h('div.panel',
          h('h3', { style: { marginTop: 0 } }, `${k.id}. ${k.title}`),
          h('p.muted', k.description),
          h('p', h('b', 'Спорная оценка: '), h('span.ans.scale', answerLabel(a.disputed_answer)), `  · итог диалога сейчас ${fmtScore(a.final_total)}`),
          h('p', h('b', 'Обоснование модели: '), a.explanation),
          a.quote && h('p.muted', '«', a.quote, '»'),
          h('div.appeal-note', h('b', 'Комментарий апелляции: '), a.comment, h('div.muted', `${a.author} · ${fmtDate(a.created_at)}`))),
        decision),
      h('div', h('h3', { style: { marginTop: 0 } }, 'Фрагмент диалога'), h('div.transcript', frag))));
}
