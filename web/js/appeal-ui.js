// Appeal controls inside a criterion result on the dialogue card.
import { api, enc } from './api.js';
import { h, mount, toast, answerLabel, fmtScore, fmtDate } from './ui.js';

export function appealBlock(view, k, r) {
  const ev = view.evaluation;
  if (!ev) return null;
  const mine = ev.appeals.filter((a) => a.criterion_id === k.id);
  const open = mine.find((a) => a.status === 'open');
  const wrap = h('div');

  const history = mine.map((a) =>
    h('div', { class: `appeal-note${a.status === 'open' ? '' : ' done'}` },
      h('b', a.status === 'open' ? '⏳ Апелляция на рассмотрении' : a.status === 'changed' ? '✔ Оценка изменена' : '✔ Оценка подтверждена'),
      ` · ${fmtDate(a.created_at)}`,
      h('div', 'Комментарий: ', a.comment),
      a.decision && h('div',
        `Решение: ${answerLabel(a.disputed_answer)} → ${answerLabel(a.decision.answer)}. Причина: ${a.decision.reason}. `,
        `Итог: ${fmtScore(a.score_before)} → ${fmtScore(a.score_after)}`),
      a.status === 'open' && h('a', { href: `#/appeals/${enc(a.id)}` }, 'Открыть у проверяющего →')));

  const form = h('div');
  const openForm = () => {
    const ta = h('textarea', { rows: 2, placeholder: 'Почему оценка неверна? Сошлитесь на реплики (#номер).' });
    mount(form,
      h('div.box', ta,
        h('div.row',
          h('button.btn.primary', {
            onclick: async (e) => {
              e.target.disabled = true;
              try {
                const res = await api.post(`/api/groups/${enc(view.ctx.group)}/conversations/${enc(view.conv.conversation_id)}/appeals`, {
                  checklist_id: ev.checklist.id, criterion_id: k.id, comment: ta.value,
                });
                view.evaluation = res.evaluation;
                toast('Апелляция подана');
                view.drawResults();
                document.getElementById(`r-${k.id}`)?.scrollIntoView({ block: 'center' });
              } catch (err) {
                toast(err.message, 'err');
                e.target.disabled = false;
              }
            },
          }, 'Подать апелляцию'),
          h('button.btn.ghost', { onclick: () => mount(form) }, 'Отмена'))));
    ta.focus();
  };

  mount(wrap, history, !open && h('div.row', h('button.btn.small', { onclick: openForm }, 'Оспорить')), form);
  return wrap;
}
