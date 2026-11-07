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
  } catch (error) {
    // A missing evaluation is the expected first-run state. Other failures
    // should remain visible instead of being presented as "not evaluated".
    if (error.status !== 404) throw error;
  }
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
    this.messagesById = new Map(conv.messages.map((message) => [String(message.idx), message]));
    this.audio = null;
    this.evaluationTimer = null;
  }

  draw() {
    const { conv } = this;
    const left = h('div', this.player(), this.transcript());
    this.right = h('div');
    mount(this.root,
      h('div.toolbar',
        h('a.btn.ghost', { href: '#/' }, '← К списку'),
        h('h1', { style: { margin: 0 }, tabindex: -1 }, conv.conversation_id,
          h('small', ` · ${conv.channel === 'voice call' ? 'звонок' : 'чат'} · ${conv.language} · ${conv.messages.length} реплик`))),
      h('div.card-layout', left, this.right));
    this.drawResults();
  }

  player() {
    if (!this.conv.audio_url) return null;
    this.audio = h('audio', {
      controls: true,
      preload: 'none',
      src: api.audioUrl(this.ctx.group, this.conv.conversation_id),
      'aria-label': 'Запись разговора',
    });
    return h('div.panel.player',
      h('span', { 'aria-hidden': 'true' }, '🎧'),
      h('span.player-label', 'Запись разговора'),
      this.audio);
  }

  transcript() {
    const box = h('div.transcript', { role: 'region', 'aria-label': 'Расшифровка диалога', tabIndex: 0 });
    for (const m of this.conv.messages) {
      const t = this.conv.audio_url && m.audio_sec != null
        ? h('button', {
          type: 'button',
          title: 'Воспроизвести с этого места',
          'aria-label': `Воспроизвести с реплики ${m.idx}, ${fmtClock(m.audio_sec)}`,
          onclick: () => this.seek(m),
        }, fmtClock(m.audio_sec))
        : m.offset_sec != null ? fmtClock(m.offset_sec) : m.timestamp;
      const el = h(`div.msg.${m.speaker}`, { id: `m-${m.idx}`, class: `msg ${m.speaker}${m.duplicate_of != null ? ' dup' : ''}`, title: m.timestamp },
        h('div.i', m.idx),
        h('div.ts', t),
        h('div', h('div.who', SPEAKERS[m.speaker] || m.speaker, m.duplicate_of != null ? ` (повтор #${m.duplicate_of})` : ''), m.text));
      this.msgEls.set(String(m.idx), el);
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
    if (range) {
      for (const message of this.conv.messages) {
        if (Number(message.idx) >= Number(range.from) && Number(message.idx) <= Number(range.to)) {
          this.msgEls.get(String(message.idx))?.classList.add('inrange');
        }
      }
    }
    const numericIndices = indices.map(Number).filter(Number.isFinite);
    const first = numericIndices.length ? Math.min(...numericIndices) : range?.from;
    for (const i of indices) this.msgEls.get(String(i))?.classList.add('hl');
    const el = this.msgEls.get(String(first));
    if (!el) return;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
    void el.offsetWidth;
    el.classList.add('flash');
    const m = this.messagesById.get(String(first));
    if (this.audio && m?.audio_sec != null) this.seek(m);
  }

  async runEvaluation(btn) {
    btn.disabled = true;
    const startedAt = Date.now();
    const updateElapsed = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      btn.textContent = `Оценка… ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
    };
    updateElapsed();
    clearInterval(this.evaluationTimer);
    this.evaluationTimer = setInterval(updateElapsed, 1000);
    try {
      this.evaluation = await api.post(`/api/groups/${enc(this.ctx.group)}/conversations/${enc(this.conv.conversation_id)}/evaluate`, { checklist_id: await currentChecklist() });
      this.checklist = await api.get(`/api/checklists/${enc(this.evaluation.checklist.id)}?version=${this.evaluation.checklist.version}`);
      toast('Оценка готова');
      this.drawResults();
    } catch (e) {
      toast(e.message, 'err');
      btn.disabled = false;
      btn.textContent = 'Оценить';
    } finally {
      clearInterval(this.evaluationTimer);
      this.evaluationTimer = null;
    }
  }

  drawResults() {
    const { evaluation: ev, checklist } = this;
    const evalBtn = h('button.btn.primary', { onclick: (e) => this.runEvaluation(e.target) }, ev ? 'Оценить заново' : 'Оценить');
    const pickSlot = h('span');
    const tools = h('div.toolbar',
      evalBtn,
      pickSlot,
      h('a.btn.ghost', {
        href: api.url(`/api/groups/${enc(this.ctx.group)}/conversations/${enc(this.conv.conversation_id)}/prompt?checklist=${enc(checklist.id)}`),
        target: '_blank',
        rel: 'noopener',
      }, 'Промпт'));
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
    const evidence = r.evidence || [];
    const firstEvidence = evidence[0] ?? r.checked_range?.from;
    return h('div.res', { id: `r-${k.id}` },
      h('div.res-head', h('span.t', `${k.id}. ${k.title}`), h(`span.ans.${cls}`, label), h('span.pts', pts),
        r.votes ? h('span.muted', { title: `Ответы прогонов: ${r.votes.answers.map(answerLabel).join(', ')}` }, `голоса ${r.votes.agree}/${r.votes.total}`) : null),
      stepLabel && h('div.muted', stepLabel),
      (this.evaluation.review_flags || []).filter((f) => f.criterion_id === k.id).map((f) => h('div.flag-review', '⚑ ', f.message)),
      h('p', r.explanation),
      r.quote && h('p.muted', '«', r.quote, '»'),
      a === 'na' && r.na_reason && h('p', h('b', 'Причина N/A: '), r.na_reason),
      h('div.ev',
        evidence.length ? [h('span.muted', 'Доказательства:'), evidence.map((i) => h('button', {
          type: 'button',
          'aria-label': `Показать реплику ${i}, ${this.who(i)}`,
          onclick: () => this.focus([i], r.checked_range),
        }, `#${i} ${this.who(i)}`))] : null,
        r.checked_range ? h('button', {
          type: 'button',
          title: 'Проверенный участок разговора',
          onclick: () => this.focus([], r.checked_range),
        }, `проверено #${r.checked_range.from}–#${r.checked_range.to}`) : null,
        firstEvidence != null ? h('button', {
          type: 'button',
          title: 'Скопировать ссылку на доказательство',
          'aria-label': `Скопировать ссылку на реплику ${firstEvidence}`,
          onclick: () => this.copyEvidenceLink(firstEvidence),
        }, 'Скопировать ссылку') : null),
      appealBlock(this, k, r),
    );
  }

  who(messageId) {
    const message = this.messagesById.get(String(messageId));
    return message ? (SPEAKERS[message.speaker] || message.speaker).toLowerCase() : '';
  }

  async copyEvidenceLink(messageId) {
    const hash = `#/c/${encodeURIComponent(this.conv.conversation_id)}/${encodeURIComponent(messageId)}`;
    const link = `${window.location.origin}${window.location.pathname}${window.location.search}${hash}`;
    try {
      await navigator.clipboard.writeText(link);
      toast('Ссылка на доказательство скопирована');
    } catch {
      window.prompt('Скопируйте ссылку', link);
    }
  }
}
