// Batch evaluation of a whole group with live progress and retry.
import { api, enc } from '../api.js';
import { h, mount, toast, fmtScore, fmtDate, loading } from '../ui.js';
import { currentChecklist, checklistPicker } from '../checklist-pick.js';

let timer = null;
let watchSequence = 0;

const STATUS = {
  pending: 'В очереди',
  running: 'Проверяется',
  done: 'Готово',
  skipped: 'Уже проверен',
  error: 'Ошибка',
  finished: 'Завершена',
  failed: 'Не завершена',
  cancelling: 'Останавливается',
  cancelled: 'Остановлена',
};

const simpleStatus = (status) => STATUS[status] || status;

export async function render(root, ctx, jobId) {
  clearTimeout(timer);
  watchSequence += 1;
  mount(root, loading());
  const jobs = await api.get('/api/batch');
  const groupJobs = jobs.filter((j) => j.group_id === ctx.group);
  const active = jobId || groupJobs.find((j) => j.status === 'running')?.id || groupJobs[0]?.id;

  const onlyMissing = h('input', { type: 'checkbox', checked: true });
  const refresh = h('input', { type: 'checkbox' });
  const conc = h('input', { type: 'number', min: 1, max: 8, value: 4, style: { width: '4.5rem' } });
  const runs = h('select', { style: { width: 'auto' } }, [1, 3, 5].map((n) => h('option', { value: n, selected: n === 3 }, n === 1 ? '1 (быстро)' : `${n} (голосование)`)));
  const jobBox = h('div');
  const startBtn = h('button.btn.primary', { onclick: start }, 'Проверить новые диалоги');

  async function start(e) {
    e.target.disabled = true;
    try {
      const job = await api.post('/api/batch', {
        group_id: ctx.group, checklist_id: await currentChecklist(),
        only_missing: onlyMissing.checked, refresh: refresh.checked, concurrency: Number(conc.value), runs: Number(runs.value),
      });
      toast(`Запущено: ${job.items.length} диалогов`);
      watch(jobBox, ctx, job.id);
    } catch (err) {
      toast(err.message, 'err');
    }
    e.target.disabled = false;
  }

  onlyMissing.addEventListener('change', () => {
    startBtn.textContent = onlyMissing.checked ? 'Проверить новые диалоги' : 'Проверить весь набор';
  });

  mount(root,
    h('div.page-heading',
      h('div', h('h1', 'Проверить весь набор'), h('p.muted', `Система проверит новые диалоги из набора «${ctx.group}» и покажет результат по каждому из них.`))),
    h('div.panel.batch-start',
      h('div',
        h('h2', { style: { marginTop: 0 } }, 'Начать проверку'),
        h('p', 'По умолчанию уже проверенные диалоги пропускаются. Вы сможете продолжать пользоваться страницей, пока идёт проверка.')),
      h('div.row', startBtn, h('a.btn.ghost', { href: '#/dialogs' }, 'Сначала посмотреть диалоги'))),
    h('details.box.batch-settings',
      h('summary', 'Дополнительные настройки'),
      h('p.muted', 'Эти параметры можно не менять для обычной проверки.'),
      h('div.toolbar',
        await checklistPicker(),
        h('label.check', onlyMissing, ' Проверять только новые диалоги'),
        h('label.check', refresh, ' Обновить набор данных перед проверкой'),
        h('label.check', 'Одновременно проверять: ', conc),
        h('label.check', 'Надёжность результата: ', runs)),
      h('h3', 'Отчёт и резервная копия'),
      h('div.toolbar',
        h('a.btn', { href: api.url(`/api/groups/${enc(ctx.group)}/results.csv?checklist=${enc(await currentChecklist())}`) }, 'Скачать отчёт'),
        h('a.btn.ghost', { href: api.url(`/api/groups/${enc(ctx.group)}/export`) }, 'Сохранить полную копию'),
        h('label.btn', { style: { flexDirection: 'row', margin: 0, color: 'var(--ink)', cursor: 'pointer' } }, 'Загрузить резервную копию',
          h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: (e) => importFile(e.target, root, ctx) }))),
      h('p.muted', 'При временной ошибке система автоматически повторит попытку.')),
    jobBox,
    groupJobs.length ? h('details.box', h('summary', `История проверок (${groupJobs.length})`),
      h('div.table-scroll', h('table.tbl', groupJobs.map((j) => h('tr',
        h('td', h('button.btn.ghost.small', { type: 'button', onclick: () => watch(jobBox, ctx, j.id), 'aria-label': `Открыть проверку от ${fmtDate(j.started_at)}` }, 'Открыть')),
        h('td', fmtDate(j.started_at)), h('td', j.group_id), h('td', simpleStatus(j.status)),
        h('td', `${j.counts.done} готово · ${j.counts.skipped} пропущено · ${j.counts.error} ошибок`), h('td', j.checklist.name)))))) : null,
  );
  if (active) watch(jobBox, ctx, active);
}

async function importFile(input, root, ctx) {
  const file = input.files?.[0];
  if (!file) return;
  try {
    const r = await api.post('/api/import', JSON.parse(await file.text()));
    toast(`Импорт ${r.group_id}: оценок ${r.evaluations} (оставлено своих ${r.evaluations_kept_local}), разметок ${r.labels}, версий чек-листов ${r.checklist_versions}${r.checklist_conflicts.length ? `, конфликтов ${r.checklist_conflicts.length}` : ''}`);
    render(root, ctx);
  } catch (e) {
    toast(`Импорт не удался: ${e.message}`, 'err');
  }
}

function watch(box, ctx, id) {
  clearTimeout(timer);
  const sequence = ++watchSequence;
  const tick = async () => {
    let job;
    try {
      job = await api.get(`/api/batch/${enc(id)}`);
    } catch (e) {
      if (sequence !== watchSequence || !document.body.contains(box)) return;
      mount(box, h('div.alert.err',
        h('b', 'Не удалось обновить ход оценки. '),
        e.message,
        ' ',
        h('button.btn.small', { type: 'button', onclick: () => watch(box, ctx, id) }, 'Повторить')));
      return;
    }
    if (sequence !== watchSequence || !document.body.contains(box)) return;
    draw(box, ctx, job);
    if (job.status === 'running') timer = setTimeout(tick, 2000);
  };
  tick();
}

function draw(box, ctx, job) {
  const c = job.counts;
  const pct = Math.round(job.progress * 100);
  mount(box, h('div.panel',
    h('div.row', h('b', 'Текущая проверка'), h('span.pill', simpleStatus(job.status)),
      job.status === 'running' && h('button.btn.small', { onclick: async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
          await api.post(`/api/batch/${enc(job.id)}/cancel`);
          toast('Проверка остановится после текущего диалога');
        } catch (error) {
          toast(error.message, 'err');
          button.disabled = false;
        }
      } }, 'Остановить проверку'),
      job.status !== 'running' && (c.error || c.pending) ? h('button.btn.small.primary', {
        onclick: async () => {
          try { const j = await api.post(`/api/batch/${enc(job.id)}/retry`); toast(`Повтор: ${j.items.length}`); watch(box, ctx, j.id); }
          catch (e) { toast(e.message, 'err'); }
        },
      }, `Повторить ошибки (${c.error + c.pending})`) : null),
    h('div.progress', {
      role: 'progressbar',
      'aria-label': `Прогресс пакетной оценки: ${pct}%`,
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-valuenow': String(pct),
    }, h('div', { style: { width: `${pct}%` } })),
    h('div.row', { 'aria-live': 'polite' },
      h('span.pill', `${c.done} проверено`), h('span.pill.na', `${c.skipped} уже были готовы`), h('span.pill.warn', `${c.running} проверяется · ${c.pending} ожидает`),
      c.error ? h('span.pill.err', `${c.error} ошибок`) : null,
      h('b', `${pct}%`)),
    h('details.box.batch-technical',
      h('summary', 'Технические сведения'),
      h('p.muted', `${job.group_id} · ${job.checklist.name}, версия ${job.checklist.version}`),
      h('p.muted', `${job.usage.calls} обращений к модели · ${job.usage.input + job.usage.output} токенов${job.cost_usd_estimate ? ` · приблизительная стоимость $${job.cost_usd_estimate}` : ''}`)),
    h('div.table-scroll', { role: 'region', 'aria-label': 'Результаты пакетной оценки', tabIndex: 0 }, h('table.tbl',
      h('thead', h('tr', h('th', 'Диалог'), h('th', 'Язык'), h('th', 'Статус'), h('th.num', 'Попытки'), h('th.num', 'Результат'), h('th', 'Серьёзное нарушение'), h('th', 'Сообщение'))),
      h('tbody', job.items.map((it) => h('tr',
        h('td', h('a', { href: `#/c/${enc(it.conversation_id)}` }, it.conversation_id)),
        h('td', it.language), h('td', simpleStatus(it.status)), h('td.num', it.attempts),
        h('td.num', fmtScore(it.total)),
        h('td', it.gross_error ? h('span.flag-gross', 'Найдено') : '—'),
        h('td.muted', it.error ? it.error.slice(0, 120) : ''))))))));
}
