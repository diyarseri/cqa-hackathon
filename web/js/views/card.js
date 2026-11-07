// Dialogue card: transcript (+ audio for calls) and evaluation results.
// Clicking evidence scrolls to and highlights the message and seeks the audio.
import { api, enc } from '../api.js';
import { h, mount, fmtScore, answerLabel, fmtDate, SPEAKERS, errorBox, loading, toast } from '../ui.js';
import { fmtClock } from '/shared/normalize.js';
import { currentChecklist, checklistPicker } from '../checklist-pick.js';
import { appealBlock } from '../appeal-ui.js';

export async function render(root, ctx, convId, focusIdx) {
  mount(root, loading());
  const checklistId = await currentChecklist();
  const conv = await api.get(`/api/groups/${enc(ctx.group)}/conversations/${enc(convId)}`);
  let evaluation = null;
  try {
    evaluation = await api.get(`/api/groups/${enc(ctx.group)}/conversations/${enc(convId)}/evaluation?checklist=${enc(checklistId)}`);
  } catch {}
  const checklist = evaluation
    ? await api.get(`/api/checklists/${enc(evaluation.checklist.id)}?version=${evaluation.checklist.version}`)
    : await api.get(`/api/checklists/${enc(checklistId)}`);

  const view = new CardView(root, ctx, conv, checklist, evaluation);
  view.draw();
  if (focusIdx != null) view.focus([Number(focusIdx)]);
}

class CardView {
  constructor(root, ctx, conv, checklist, evaluation) {
    Object.assign(this, { root, ctx, conv, checklist, evaluation });
    this.msgEls = new Map();
    this.audio = null;
  }

  draw() {
    const { conv } = this;
    const left = h('div', this.player(), this.transcript());
    this.right = h('div');
    mount(this.root,
      h('div.toolbar',
        h('a.btn.ghost', { href: '#/' }, '← К списку'),
        h('h2', { style: { margin: 0 } }, conv.conversation_id,
          h('small', ` · ${conv.channel === 'voice call' ? 'звонок' : 'чат'} · ${conv.language} · ${conv.messages.length} реплик`))),
      h('div.card-layout', left, this.right));
    this.drawResults();
  }

  player() {
    if (!this.conv.audio_url) return null;
    this.audio = h('audio', { controls: true, preload: 'none', src: api.audioUrl(this.ctx.group, this.conv.conversation_id) });
    return h('div.panel.player', h('span', '🎧'), this.audio);
  }

  transcript() {
    const box = h('div.transcript');
    for (const m of this.conv.messages) {
      const t = this.conv.audio_url && m.audio_sec != null
        ? h('button', { title: 'Воспроизвести с этого места', onclick: () => this.seek(m) }, fmtClock(m.audio_sec))
        : m.offset_sec != null ? fmtClock(m.offset_sec) : m.timestamp;
      const el = h(`div.msg.${m.speaker}`, { id: `m-${m.idx}`, class: `msg ${m.speaker}${m.duplicate_of != null ? ' dup' : ''}`, title: m.timestamp },
        h('div.i', m.idx),
        h('div.ts', t),
        h('div', h('div.who', SPEAKERS[m.speaker] || m.speaker, m.duplicate_of != null ? ` (повтор #${m.duplicate_of})` : ''), m.text));
      this.msgEls.set(m.idx, el);
      box.append(el);
    }
    this.box = box;
    return box;
  }

  seek(m) {
    if (!this.audio || m.audio_sec == null) return;
    const go = () => {
      this.audio.currentTime = Math.max(0, m.audio_sec - 1);
      this.audio.play().catch(() => {});
    };
    if (this.audio.readyState >= 1) go();
    else {
      this.audio.preload = 'auto';
      this.audio.addEventListener('loadedmetadata', go, { once: true });
      this.audio.load();
    }
  }

  /** Highlight messages (and optional range), scroll to the first, seek audio. */
  focus(indices, range) {
    for (const el of this.msgEls.values()) el.classList.remove('hl', 'inrange', 'flash');
    if (range) for (let i = range.from; i <= range.to; i++) this.msgEls.get(i)?.classList.add('inrange');
    const first = indices.length ? Math.min(...indices) : range?.from;
    for (const i of indices) this.msgEls.get(i)?.classList.add('hl');
    const el = this.msgEls.get(first);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    void el.offsetWidth;
    el.classList.add('flash');
    const m = this.conv.messages[first];
    if (this.audio && m?.audio_sec != null) this.seek(m);
  }

  async runEvaluation(btn) {
    btn.disabled = true;
    btn.textContent = 'Оценка… (15–40 с)';
    try {
      this.evaluation = await api.post(`/api/groups/${enc(this.ctx.group)}/conversations/${enc(this.conv.conversation_id)}/evaluate`, { checklist_id: await currentChecklist() });
      this.checklist = await api.get(`/api/checklists/${enc(this.evaluation.checklist.id)}?version=${this.evaluation.checklist.version}`);
      toast('Оценка готова');
      this.drawResults();
    } catch (e) {
      toast(e.message, 'err');
      btn.disabled = false;
      btn.textContent = 'Оценить';
    }
  }

  drawResults() {
    const { evaluation: ev, checklist } = this;
    const evalBtn = h('button.btn.primary', { onclick: (e) => this.runEvaluation(e.target) }, ev ? 'Оценить заново' : 'Оценить');
    const pickSlot = h('span');
    const tools = h('div.toolbar',
      evalBtn,
      pickSlot,
      h('a.btn.ghost', { href: `/api/groups/${enc(this.ctx.group)}/conversations/${enc(this.conv.conversation_id)}/prompt?checklist=${enc(checklist.id)}`, target: '_blank' }, 'Промпт'));
    checklistPicker(() => render(this.root, this.ctx, this.conv.conversation_id)).then((el) => pickSlot.replaceWith(el));

    if (!ev) {
      return mount(this.right, tools, h('div.alert.info', `Диалог ещё не оценён по чек-листу «${checklist.name}».`));
    }
    const fs = ev.final_score;
    const os = ev.original_score;
    const changed = fs.total !== os.total;
    const byId = Object.fromEntries(ev.criteria.map((c) => [c.id, c]));
    const scoreById = Object.fromEntries(fs.criteria.map((c) => [c.id, c]));

    const summary = h('div.summary',
      h('div.kpi', h('div.v', fs.total == null ? '—' : fmtScore(fs.total)), h('div.l', fs.total == null ? 'итог не рассчитывается: нет применимых критериев' : `итог из ${fs.max}${changed ? ' (после апелляции)' : ''}`)),
      changed && h('div.kpi', h('div.v', fmtScore(os.total)), h('div.l', 'исходная оценка')),
      h('div.kpi', { class: fs.gross_error ? 'kpi bad' : 'kpi' }, h('div.v', fs.gross_error ? 'ДА' : 'нет'), h('div.l', 'грубая ошибка (отдельно от балла)')),
      h('div.kpi', h('div.l', `${ev.checklist.name} v${ev.checklist.version}`), h('div.l', `${ev.model} · ${fmtDate(ev.created_at)}`), h('div.l', `${ev.usage.input}+${ev.usage.output} токенов${ev.cost_usd_estimate != null ? ` · ≈$${ev.cost_usd_estimate}` : ''}`)));

    const sections = checklist.sections?.length ? checklist.sections : [{ id: null, title: 'Критерии' }];
    const blocks = sections.map((s) => {
      const ks = checklist.criteria.filter((k) => (s.id == null ? true : k.section === s.id));
      if (!ks.length) return null;
      const st = fs.sections.find((x) => x.id === s.id);
      return h('div',
        h('div.section-title', h('span', s.title), st?.has_weighted ? h('span', st.applicable ? `${fmtScore(st.points)} / ${fmtScore(st.max)}` : 'N/A') : null),
        ks.map((k) => this.criterionResult(k, byId[k.id], scoreById[k.id])));
    });
    const orphan = checklist.criteria.filter((k) => checklist.sections?.length && !sections.some((s) => s.id === k.section));
    const recFlags = (ev.review_flags || []).filter((f) => !f.criterion_id);
    const nFlags = (ev.review_flags || []).length;
    const flagBox = nFlags
      ? h('div.alert.warn', h('b', `⚑ Требует проверки человеком: ${nFlags}`), recFlags.map((f) => h('div', f.message)),
          nFlags > recFlags.length ? h('div', 'Отмечены критерии со значком ⚑ ниже.') : null)
      : h('div.alert.info', '✓ Автоматические проверки пройдены: цитаты найдены в репликах, модель не сомневалась.');
    mount(this.right, tools, summary, flagBox, blocks,
      orphan.length ? h('div', h('div.section-title', 'Без секции'), orphan.map((k) => this.criterionResult(k, byId[k.id], scoreById[k.id]))) : null);
  }

  criterionResult(k, r, s) {
    if (!r) return h('div.res', h('div.res-head', h('span.t', `${k.id}. ${k.title}`), h('span.muted', 'нет результата')));
    const a = s?.answer ?? r.answer;
    const cls = a === 'yes' ? (k.type === 'flag' ? 'no' : 'yes') : a === 'no' ? (k.type === 'flag' ? 'yes' : 'no') : a === 'na' ? 'na' : 'scale';
    const label = k.type === 'scale' && typeof a === 'number' ? `${a} / ${Math.max(...k.scale.steps.map((x) => x.value))}` : answerLabel(a);
    const pts = k.type === 'flag' ? 'без баллов' : s?.applicable ? `${fmtScore(s.points)} из ${fmtScore(s.effective_weight)} (вес ${k.weight})` : `N/A · вес ${k.weight} перераспределён`;
    const stepLabel = k.type === 'scale' && typeof a === 'number' ? k.scale.steps.find((x) => x.value === a)?.label : null;
    return h('div.res', { id: `r-${k.id}` },
      h('div.res-head', h('span.t', `${k.id}. ${k.title}`), h(`span.ans.${cls}`, label), h('span.pts', pts),
        r.votes ? h('span.muted', { title: `Ответы прогонов: ${r.votes.answers.map(answerLabel).join(', ')}` }, `голоса ${r.votes.agree}/${r.votes.total}`) : null),
      stepLabel && h('div.muted', stepLabel),
      (this.evaluation.review_flags || []).filter((f) => f.criterion_id === k.id).map((f) => h('div.flag-review', '⚑ ', f.message)),
      h('p', r.explanation),
      r.quote && h('p.muted', '«', r.quote, '»'),
      a === 'na' && r.na_reason && h('p', h('b', 'Причина N/A: '), r.na_reason),
      h('div.ev',
        r.evidence.length ? [h('span.muted', 'Доказательства:'), r.evidence.map((i) => h('button', { onclick: () => this.focus([i], r.checked_range) }, `#${i} ${who(this.conv, i)}`))] : null,
        r.checked_range ? h('button', { title: 'Проверенный участок разговора', onclick: () => this.focus([], r.checked_range) }, `проверено #${r.checked_range.from}–#${r.checked_range.to}`) : null),
      appealBlock(this, k, r),
    );
  }
}

function who(conv, i) {
  const m = conv.messages[i];
  return m ? (SPEAKERS[m.speaker] || m.speaker).toLowerCase() : '';
}
