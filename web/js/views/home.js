// Guided home dashboard: the common actions and current dataset state without
// exposing the technical evaluation controls on the first screen.
import { api, enc } from '../api.js';
import { h, mount, fmtScore, loading } from '../ui.js';
import { currentChecklist } from '../checklist-pick.js';

export async function render(root, ctx) {
  const data = h('section.home-data', { 'aria-label': 'Состояние набора данных' }, loading('Загружаем сводку…'));

  mount(root, h('div.home-page',
    hero(),
    data,
    gettingStarted(),
    benefits(),
  ));

  try {
    const checklistId = await currentChecklist();
    const [conversations, evaluations] = await Promise.all([
      api.get(`/api/groups/${enc(ctx.group)}/conversations`),
      api.get(`/api/groups/${enc(ctx.group)}/evaluations?checklist=${enc(checklistId)}`),
    ]);
    mount(data, dashboard(ctx, checklistId, conversations, evaluations));
  } catch (error) {
    mount(data, setupState(error));
  }
}

function hero() {
  return h('section.home-hero',
    h('div.home-hero-copy',
      h('span.home-eyebrow', 'КОНТРОЛЬ КАЧЕСТВА'),
      h('h1', { tabindex: -1 }, 'Проверяйте диалоги быстрее'),
      h('p', 'Система показывает оценку, доказательства и разговоры, которым нужно ваше внимание.'),
      h('div.home-hero-actions',
        h('a.btn.primary', { href: '#/batch' }, 'Проверить новые диалоги'),
        h('a.btn.hero-secondary', { href: '#/dialogs' }, 'Открыть список'))),
    h('div.home-hero-art', { 'aria-hidden': true },
      h('img', { src: 'assets/cqa-quality-hero.webp', alt: '', width: 1100, height: 587, loading: 'eager' })),
  );
}

function dashboard(ctx, checklistId, conversations, evaluations) {
  const total = conversations.length;
  const checked = evaluations.length;
  const progress = total ? Math.min(100, Math.round((checked / total) * 100)) : 0;
  const scored = evaluations
    .map((item) => item.final_total)
    .filter((value) => value != null && Number.isFinite(Number(value)))
    .map(Number);
  const average = scored.length ? scored.reduce((sum, value) => sum + value, 0) / scored.length : null;
  const serious = evaluations.filter((item) => item.gross_error).length;
  const attention = evaluations.filter((item) => item.gross_error || item.review_flags || item.open_appeals).length;
  const csv = api.url(`/api/groups/${enc(ctx.group)}/results.csv?checklist=${enc(checklistId)}`);

  return [
    h('div.home-section-heading',
      h('div', h('h2', 'Сводка по набору'), h('p.muted', `Набор данных: ${ctx.group}`)),
      h('a.simple-link', { href: '#/insights' }, 'Посмотреть результаты →')),
    h('div.home-summary-grid',
      statCard('Всего диалогов', total, 'Все разговоры в выбранном наборе'),
      h('article.home-stat',
        h('span.home-stat-label', 'Проверено'),
        h('strong.home-stat-value', `${checked} из ${total}`),
        h('div.home-progress', {
          role: 'progressbar',
          'aria-label': `Проверено ${checked} из ${total} диалогов`,
          'aria-valuemin': 0,
          'aria-valuemax': 100,
          'aria-valuenow': progress,
        }, h('span', { style: { width: `${progress}%` } })),
        h('small', `${progress}% готово`)),
      statCard('Средняя оценка', fmtScore(average), scored.length ? 'По проверенным диалогам' : 'Появится после первой проверки'),
      h('article.home-stat.attention',
        h('span.home-stat-label', 'Нужно проверить'),
        h('strong.home-stat-value', attention),
        h('a.simple-link', { href: '#/dialogs?status=attention' }, attention ? 'Открыть список →' : 'Всё в порядке'))),
    serious
      ? h('div.attention-banner', { role: 'status' },
        h('div', h('strong', `Найдены серьёзные нарушения: ${serious}`), h('p', 'Откройте диалоги и проверьте отмеченные фрагменты.')),
        h('a.btn', { href: '#/dialogs?status=gross' }, 'Посмотреть'))
      : null,
    h('section.home-actions-section',
      h('div.home-section-heading',
        h('div', h('h2', 'Полезные действия'), h('p.muted', 'Самые частые задачи собраны в одном месте.'))),
      h('div.home-actions',
        actionCard('Проверить новые', 'Запустить проверку только для новых разговоров.', '#/batch', 'Начать'),
        actionCard('Нужно проверить', 'Открыть диалоги с замечаниями и серьёзными нарушениями.', '#/dialogs?status=attention', 'Открыть'),
        actionCard('Спорные оценки', 'Посмотреть обращения и решения проверяющего.', '#/appeals', 'Перейти'),
        h('article.quick-action',
          h('div', h('h3', 'Скачать отчёт'), h('p', 'Сохранить результаты набора в формате CSV.')),
          h('a.simple-link', { href: csv }, 'Скачать →')),
        h('article.quick-action',
          h('div', h('h3', 'Как пользоваться'), h('p', 'Короткая инструкция из четырёх шагов.')),
          h('button.simple-link', { type: 'button', onclick: () => document.getElementById('cqa-assistant')?.click() }, 'Показать →')),
      )),
  ];
}

function statCard(label, value, note) {
  return h('article.home-stat',
    h('span.home-stat-label', label),
    h('strong.home-stat-value', value),
    h('small', note));
}

function actionCard(title, description, href, label) {
  return h('article.quick-action',
    h('div', h('h3', title), h('p', description)),
    h('a.simple-link', { href }, `${label} →`));
}

function gettingStarted() {
  return h('section.home-steps-section',
    h('div.home-section-heading',
      h('div', h('h2', 'Как начать'), h('p.muted', 'Три простых шага — технические знания не нужны.'))),
    h('div.home-steps',
      step(1, 'Выберите набор', 'Укажите нужный набор данных в верхней части страницы.'),
      step(2, 'Запустите проверку', 'Нажмите «Проверить новые диалоги» и дождитесь результата.'),
      step(3, 'Просмотрите результат', 'Откройте диалог, оценку и подтверждающие реплики.')),
  );
}

function step(number, title, text) {
  return h('article.home-step',
    h('span.home-step-number', number),
    h('div', h('h3', title), h('p', text)));
}

function benefits() {
  return h('section.home-benefits', { 'aria-label': 'Возможности системы' },
    benefit('✓', 'Понятная оценка', 'Итог и статус видны сразу, без сложных таблиц.'),
    benefit('“', 'Доказательства', 'Каждое решение связано с конкретными репликами.'),
    benefit('↺', 'История решений', 'Исходная оценка, обращения и итог сохраняются.'));
}

function benefit(symbol, title, text) {
  return h('article.home-benefit',
    h('span.home-benefit-icon', { 'aria-hidden': true }, symbol),
    h('h3', title),
    h('p', text));
}

function setupState(error) {
  return h('section.setup-card', { role: 'alert' },
    h('div.setup-copy',
      h('span.setup-badge', 'НУЖНА НАСТРОЙКА'),
      h('h2', 'Подключите набор данных'),
      h('p', 'Сайт уже работает. Чтобы увидеть диалоги, один раз добавьте ссылку организаторов в файл .env.'),
      h('ol',
        h('li', 'Откройте страницу 3 в Student Guide.'),
        h('li', 'Скопируйте адрес кнопки «Открыть GET для DEV».'),
        h('li', 'Вставьте адрес после CQA_API_URL= и перезапустите сайт.')),
      h('code', 'CQA_API_URL=https://…'),
      h('details', h('summary', 'Показать техническую причину'), h('p', error?.message || String(error)))),
    h('div.setup-guide',
      h('img', { src: 'assets/cqa-guide-robot.webp', alt: '', width: 760, height: 682, 'aria-hidden': true }),
      h('p', 'Ссылку нужно добавить только один раз. Потом я покажу все диалоги.')),
  );
}
