// Batch evaluation of a whole group with live progress and retry.
import { api, enc } from '../api.js';
import { h, mount, toast, fmtScore, fmtDate, loading } from '../ui.js';
import { currentChecklist, checklistPicker } from '../checklist-pick.js';

let timer = null;
let watchSequence = 0;

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

  const start = async (e) => {
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
  };

  mount(root,
    h('div.page-heading',
      h('div', h('h1', 'Пакетная оценка'), h('p.muted', `Оцените весь набор ${ctx.group} и следите за ходом работы модели.`))),
    h('div.panel',
      h('div.toolbar',
        await checklistPicker(),
        h('label.check', onlyMissing, ' только неоценённые / оценённые старой версией чек-листа'),
        h('label.check', refresh, ' заново загрузить набор из API'),
        h('label.check', 'Параллельно: ', conc),
        h('label.check', 'Прогонов на диалог: ', runs),
        h('button.btn.primary', { onclick: start }, `▶ Оценить весь набор ${ctx.group}`),
        h('a.btn.ghost', { href: api.url(`/api/groups/${enc(ctx.group)}/results.csv?checklist=${enc(await currentChecklist())}`) }, '⬇ CSV результатов')),
      h('div.toolbar',
        h('b', 'Обмен с напарником / резервная копия:'),
        h('a.btn', { href: api.url(`/api/groups/${enc(ctx.group)}/export`) }, `⬇ Экспорт набора ${ctx.group} (оценки, апелляции, разметка, чек-листы)`),
        h('label.btn', { style: { flexDirection: 'row', margin: 0, color: 'var(--ink)', cursor: 'pointer' } }, '⬆ Импорт файла',
          h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: (e) => importFile(e.target, root, ctx) }))),
      h('p.muted', 'Контрольный набор: выберите «+ другой group_id…» в правом верхнем углу, затем запустите здесь. Ошибки модели повторяются автоматически (до 4 попыток с паузой 2→4→8 с).')),
    jobBox,
    groupJobs.length ? h('details.box', h('summary', `Предыдущие запуски (${groupJobs.length})`),
      h('div.table-scroll', h('table.tbl', groupJobs.map((j) => h('tr',
        h('td', h('button.btn.ghost.small', { type: 'button', onclick: () => watch(jobBox, ctx, j.id), 'aria-label': `Открыть запуск ${j.id}` }, j.id)),
        h('td', j.group_id), h('td', `${j.checklist.name} v${j.checklist.version}`), h('td', j.status),
        h('td', `${j.counts.done} ✓ · ${j.counts.skipped} пропущено · ${j.counts.error} ошибок`), h('td', fmtDate(j.started_at))))))) : null,
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
  const STATUS = { pending: '⏳ в очереди', running: '⚙ оценивается', done: '✔ готово', skipped: '↷ уже оценён', error: '✖ ошибка' };
  mount(box, h('div.panel',
    h('div.row', h('b', `Запуск ${job.id}`), h('span.muted', `${job.group_id} · ${job.checklist.name} v${job.checklist.version} · ${job.status}`),
      job.status === 'running' && h('button.btn.small', { onclick: async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
          await api.post(`/api/batch/${enc(job.id)}/cancel`);
          toast('Останавливаю после текущих диалогов');
        } catch (error) {
          toast(error.message, 'err');
          button.disabled = false;
        }
      } }, 'Стоп'),
      job.status !== 'running' && (c.error || c.pending) ? h('button.btn.small.primary', {
        onclick: async () => {
          try { const j = await api.post(`/api/batch/${enc(job.id)}/retry`); toast(`Повтор: ${j.items.length}`); watch(box, ctx, j.id); }
          catch (e) { toast(e.message, 'err'); }
        },
      }, `↻ Повторить неудачные (${c.error + c.pending})`) : null),
    h('div.progress', {
      role: 'progressbar',
      'aria-label': `Прогресс пакетной оценки: ${pct}%`,
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-valuenow': String(pct),
    }, h('div', { style: { width: `${pct}%` } })),
    h('div.row', { 'aria-live': 'polite' },
      h('span.pill', `${c.done} готово`), h('span.pill.na', `${c.skipped} пропущено`), h('span.pill.warn', `${c.running} в работе · ${c.pending} в очереди`),
      c.error ? h('span.pill.err', `${c.error} ошибок`) : null,
      h('span.muted', `${pct}% · ${job.usage.calls} вызовов модели · ${job.usage.input + job.usage.output} токенов${job.cost_usd_estimate ? ` · ≈$${job.cost_usd_estimate}` : ''}`)),
    h('div.table-scroll', { role: 'region', 'aria-label': 'Результаты пакетной оценки', tabIndex: 0 }, h('table.tbl',
      h('thead', h('tr', h('th', 'Диалог'), h('th', 'Язык'), h('th', 'Статус'), h('th.num', 'Попыток'), h('th.num', 'Итог'), h('th', 'Флаг'), h('th', 'Ошибка'))),
      h('tbody', job.items.map((it) => h('tr',
        h('td', h('a', { href: `#/c/${enc(it.conversation_id)}` }, it.conversation_id)),
        h('td', it.language), h('td', STATUS[it.status]), h('td.num', it.attempts),
        h('td.num', fmtScore(it.total)),
        h('td', it.gross_error ? h('span.flag-gross', { 'aria-label': 'Грубая ошибка', title: 'Грубая ошибка' }, '⚠') : ''),
        h('td.muted', it.error ? it.error.slice(0, 120) : ''))))))));
}
