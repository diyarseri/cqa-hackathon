const STORAGE_KEY = 'cqa.locale';
const SUPPORTED = new Set(['ru', 'kk', 'en']);

const TEXT = {
  'Перейти к содержимому': ['Skip to content', 'Мазмұнға өту'],
  'Меню': ['Menu', 'Мәзір'],
  'Основная навигация': ['Main navigation', 'Негізгі навигация'],
  'Дополнительные действия': ['Additional actions', 'Қосымша әрекеттер'],
  'Открыть меню': ['Open menu', 'Мәзірді ашу'],
  'Закрыть меню': ['Close menu', 'Мәзірді жабу'],
  'Главная': ['Home', 'Басты бет'],
  'Все диалоги': ['All conversations', 'Барлық диалогтар'],
  'Результаты': ['Results', 'Нәтижелер'],
  'Проверить набор': ['Check dataset', 'Жинақты тексеру'],
  'Спорные оценки': ['Disputed scores', 'Даулы бағалар'],
  'Критерии оценки': ['Evaluation criteria', 'Бағалау критерийлері'],
  'Проверка точности': ['Accuracy check', 'Дәлдікті тексеру'],
  'Набор данных': ['Dataset', 'Деректер жинағы'],
  '+ добавить набор…': ['+ add dataset…', '+ жинақ қосу…'],
  'Введите название или ID набора, который сообщили организаторы:': ['Enter the dataset name or ID provided by the organizers:', 'Ұйымдастырушылар берген жинақ атауын немесе ID енгізіңіз:'],
  'Выбранный набор данных': ['Selected dataset', 'Таңдалған деректер жинағы'],
  'Язык': ['Language', 'Тіл'],
  'Язык интерфейса': ['Interface language', 'Интерфейс тілі'],
  'Поиск': ['Search', 'Іздеу'],
  'Помощь': ['Help', 'Көмек'],
  'Инструменты': ['Tools', 'Құралдар'],
  'Изменить оформление': ['Change appearance', 'Безендіруді өзгерту'],
  'Тёмная тема': ['Dark theme', 'Қараңғы тақырып'],
  'Светлая тема': ['Light theme', 'Жарық тақырып'],
  'Тема': ['Theme', 'Тақырып'],
  'Включить тёмную тему': ['Turn on dark theme', 'Қараңғы тақырыпты қосу'],
  'Включить светлую тему': ['Turn on light theme', 'Жарық тақырыпты қосу'],
  'Быстрый переход': ['Quick navigation', 'Жылдам өту'],
  'Раздел или ID диалога': ['Section or conversation ID', 'Бөлім немесе диалог ID'],
  'Поиск команды или диалога': ['Search for a section or conversation', 'Бөлімді немесе диалогты іздеу'],
  'Например: аналитика или dialog_123': ['For example: results or dialog_123', 'Мысалы: нәтижелер немесе dialog_123'],
  'Введите ID и нажмите Enter, чтобы открыть диалог в выбранном наборе.': ['Enter an ID and press Enter to open a conversation in the selected dataset.', 'Таңдалған жинақтағы диалогты ашу үшін ID енгізіп, Enter басыңыз.'],
  'Нужна помощь?': ['Need help?', 'Көмек керек пе?'],
  'Покажу, что делать': ['I’ll show you what to do', 'Не істеу керегін көрсетемін'],
  'БЫСТРЫЙ СТАРТ': ['QUICK START', 'ЖЫЛДАМ БАСТАУ'],
  'Как пользоваться системой': ['How to use the system', 'Жүйені қалай пайдалану керек'],
  'Я помогу начать — всего четыре простых шага.': ['I’ll help you get started in four simple steps.', 'Төрт қарапайым қадаммен бастауға көмектесемін.'],
  'Выберите набор данных': ['Select a dataset', 'Деректер жинағын таңдаңыз'],
  'Обычно для начала подходит набор DEV.': ['The DEV dataset is usually the best place to start.', 'Әдетте DEV жинағынан бастаған ыңғайлы.'],
  'Проверьте новые диалоги': ['Check new conversations', 'Жаңа диалогтарды тексеріңіз'],
  'Система оценит только те разговоры, которые ещё не проверены.': ['The system will evaluate only conversations that have not been checked yet.', 'Жүйе әлі тексерілмеген диалогтарды ғана бағалайды.'],
  'Откройте результат': ['Open the result', 'Нәтижені ашыңыз'],
  'Посмотрите итог, объяснение и подтверждающие реплики.': ['Review the score, explanation, and supporting messages.', 'Қорытындыны, түсіндірмені және дәлел хабарламаларын қараңыз.'],
  'Исправьте спорную оценку': ['Resolve a disputed score', 'Даулы бағаны түзетіңіз'],
  'Отправьте её на пересмотр, если не согласны с результатом.': ['Submit it for review if you disagree with the result.', 'Нәтижемен келіспесеңіз, қайта қарауға жіберіңіз.'],
  'Начать проверку': ['Start checking', 'Тексеруді бастау'],
  'Понятно': ['Got it', 'Түсінікті'],
  'КОНТРОЛЬ КАЧЕСТВА': ['QUALITY CONTROL', 'САПАНЫ БАҚЫЛАУ'],
  'Состояние набора данных': ['Dataset status', 'Деректер жинағының күйі'],
  'Загружаем сводку…': ['Loading overview…', 'Шолу жүктелуде…'],
  'Проверяйте диалоги быстрее': ['Review conversations faster', 'Диалогтарды жылдамырақ тексеріңіз'],
  'Система показывает оценку, доказательства и разговоры, которым нужно ваше внимание.': ['See scores, evidence, and conversations that need your attention.', 'Бағаларды, дәлелдерді және назар аударуды қажет ететін диалогтарды көріңіз.'],
  'Проверить новые диалоги': ['Check new conversations', 'Жаңа диалогтарды тексеру'],
  'Открыть список': ['Open list', 'Тізімді ашу'],
  'Сводка по набору': ['Dataset overview', 'Жинақ бойынша шолу'],
  'Посмотреть результаты →': ['View results →', 'Нәтижелерді көру →'],
  'Всего диалогов': ['Total conversations', 'Барлық диалогтар'],
  'Все разговоры в выбранном наборе': ['All conversations in the selected dataset', 'Таңдалған жинақтағы барлық диалогтар'],
  'Проверено': ['Checked', 'Тексерілді'],
  'Средняя оценка': ['Average score', 'Орташа баға'],
  'По проверенным диалогам': ['Across checked conversations', 'Тексерілген диалогтар бойынша'],
  'Появится после первой проверки': ['Appears after the first check', 'Алғашқы тексеруден кейін көрсетіледі'],
  'Нужно проверить': ['Needs review', 'Тексеру қажет'],
  'Открыть список →': ['Open list →', 'Тізімді ашу →'],
  'Всё в порядке': ['All clear', 'Барлығы дұрыс'],
  'Откройте диалоги и проверьте отмеченные фрагменты.': ['Open the conversations and review the highlighted excerpts.', 'Диалогтарды ашып, белгіленген үзінділерді тексеріңіз.'],
  'Посмотреть': ['View', 'Көру'],
  'Полезные действия': ['Useful actions', 'Пайдалы әрекеттер'],
  'Самые частые задачи собраны в одном месте.': ['Common tasks are collected in one place.', 'Жиі қолданылатын әрекеттер бір жерде жиналған.'],
  'Проверить новые': ['Check new', 'Жаңаларын тексеру'],
  'Запустить проверку только для новых разговоров.': ['Run checks only for new conversations.', 'Тек жаңа диалогтарды тексеру.'],
  'Открыть диалоги с замечаниями и серьёзными нарушениями.': ['Open conversations with review notes and serious violations.', 'Ескертулері мен елеулі бұзушылықтары бар диалогтарды ашу.'],
  'Посмотреть обращения и решения проверяющего.': ['Review appeals and reviewer decisions.', 'Өтініштер мен тексеруші шешімдерін қарау.'],
  'Начать': ['Start', 'Бастау'],
  'Открыть': ['Open', 'Ашу'],
  'Перейти': ['Go', 'Өту'],
  'Скачать отчёт': ['Download report', 'Есепті жүктеу'],
  'Сохранить результаты набора в формате CSV.': ['Save dataset results as a CSV file.', 'Жинақ нәтижелерін CSV форматында сақтау.'],
  'Скачать →': ['Download →', 'Жүктеу →'],
  'Как пользоваться': ['How to use it', 'Қалай пайдалану керек'],
  'Короткая инструкция из четырёх шагов.': ['A short four-step guide.', 'Төрт қадамнан тұратын қысқа нұсқаулық.'],
  'Показать →': ['Show →', 'Көрсету →'],
  'Как начать': ['How to start', 'Қалай бастау керек'],
  'Три простых шага — технические знания не нужны.': ['Three simple steps — no technical knowledge required.', 'Үш қарапайым қадам — техникалық білім қажет емес.'],
  'Выберите набор': ['Select a dataset', 'Жинақты таңдаңыз'],
  'Укажите нужный набор данных в верхней части страницы.': ['Choose the required dataset at the top of the page.', 'Беттің жоғарғы жағынан қажетті деректер жинағын таңдаңыз.'],
  'Запустите проверку': ['Start the check', 'Тексеруді бастаңыз'],
  'Нажмите «Проверить новые диалоги» и дождитесь результата.': ['Select “Check new conversations” and wait for the result.', '«Жаңа диалогтарды тексеру» батырмасын басып, нәтижені күтіңіз.'],
  'Просмотрите результат': ['Review the result', 'Нәтижені қараңыз'],
  'Откройте диалог, оценку и подтверждающие реплики.': ['Open the conversation, score, and supporting messages.', 'Диалогты, бағаны және дәлел хабарламаларын ашыңыз.'],
  'Понятная оценка': ['Clear score', 'Түсінікті баға'],
  'Итог и статус видны сразу, без сложных таблиц.': ['See the total and status immediately without complex tables.', 'Қорытынды мен күй күрделі кестелерсіз бірден көрінеді.'],
  'Доказательства': ['Evidence', 'Дәлелдер'],
  'Каждое решение связано с конкретными репликами.': ['Every decision links to specific messages.', 'Әр шешім нақты хабарламалармен байланыстырылған.'],
  'История решений': ['Decision history', 'Шешімдер тарихы'],
  'Исходная оценка, обращения и итог сохраняются.': ['The original score, appeals, and final result are preserved.', 'Бастапқы баға, өтініштер және қорытынды сақталады.'],
  'НУЖНА НАСТРОЙКА': ['SETUP REQUIRED', 'БАПТАУ ҚАЖЕТ'],
  'Подключите набор данных': ['Connect a dataset', 'Деректер жинағын қосыңыз'],
  'Сайт уже работает. Чтобы увидеть диалоги, один раз добавьте ссылку организаторов в файл .env.': ['The site is running. To see conversations, add the organizers’ link to the .env file once.', 'Сайт жұмыс істеп тұр. Диалогтарды көру үшін ұйымдастырушылар сілтемесін .env файлына бір рет қосыңыз.'],
  'Откройте страницу 3 в Student Guide.': ['Open page 3 of the Student Guide.', 'Student Guide құжатының 3-бетін ашыңыз.'],
  'Скопируйте адрес кнопки «Открыть GET для DEV».': ['Copy the address of the “Open GET for DEV” button.', '«Open GET for DEV» батырмасының мекенжайын көшіріңіз.'],
  'Вставьте адрес после CQA_API_URL= и перезапустите сайт.': ['Paste the address after CQA_API_URL= and restart the site.', 'Мекенжайды CQA_API_URL= кейін қойып, сайтты қайта іске қосыңыз.'],
  'Показать техническую причину': ['Show technical reason', 'Техникалық себепті көрсету'],
  'Ссылку нужно добавить только один раз. Потом я покажу все диалоги.': ['You only need to add the link once. Then I’ll show all conversations.', 'Сілтемені бір рет қана қосу керек. Содан кейін барлық диалогтарды көрсетемін.'],
  'Все диалоги': ['All conversations', 'Барлық диалогтар'],
  'Найти диалог': ['Find a conversation', 'Диалогты табу'],
  'Введите номер диалога': ['Enter a conversation number', 'Диалог нөмірін енгізіңіз'],
  'Все': ['All', 'Барлығы'],
  'Не проверены': ['Not checked', 'Тексерілмеген'],
  'Серьёзные нарушения': ['Serious violations', 'Елеулі бұзушылықтар'],
  'Дополнительные фильтры и действия': ['Additional filters and actions', 'Қосымша сүзгілер мен әрекеттер'],
  'Все языки': ['All languages', 'Барлық тілдер'],
  'Все каналы': ['All channels', 'Барлық арналар'],
  'Чаты': ['Chats', 'Чаттар'],
  'Звонки': ['Calls', 'Қоңыраулар'],
  'Все статусы': ['All statuses', 'Барлық күйлер'],
  'Проверены': ['Checked', 'Тексерілген'],
  'Обновить данные': ['Refresh data', 'Деректерді жаңарту'],
  'Загрузить разговор': ['Upload conversation', 'Диалогты жүктеу'],
  'Диалог': ['Conversation', 'Диалог'],
  'Тип': ['Type', 'Түрі'],
  'Результат': ['Result', 'Нәтиже'],
  'Статус': ['Status', 'Күйі'],
  'Не проверен': ['Not checked', 'Тексерілмеген'],
  'Проверить вручную': ['Review manually', 'Қолмен тексеру'],
  'Спорная оценка': ['Disputed score', 'Даулы баға'],
  'Проверен': ['Checked', 'Тексерілді'],
  'Чат': ['Chat', 'Чат'],
  'Звонок': ['Call', 'Қоңырау'],
  'Открыть →': ['Open →', 'Ашу →'],
  'Проверить весь набор': ['Check entire dataset', 'Бүкіл жинақты тексеру'],
  'Начать проверку': ['Start checking', 'Тексеруді бастау'],
  'Дополнительные настройки': ['Additional settings', 'Қосымша параметрлер'],
  'Эти параметры можно не менять для обычной проверки.': ['You can keep these defaults for a normal check.', 'Қалыпты тексеру үшін бұл параметрлерді өзгертпеуге болады.'],
  'Проверять только новые диалоги': ['Check only new conversations', 'Тек жаңа диалогтарды тексеру'],
  'Обновить набор данных перед проверкой': ['Refresh the dataset before checking', 'Тексеру алдында деректер жинағын жаңарту'],
  'Отчёт и резервная копия': ['Report and backup', 'Есеп және сақтық көшірме'],
  'Сохранить полную копию': ['Save full backup', 'Толық көшірмені сақтау'],
  'Загрузить резервную копию': ['Upload backup', 'Сақтық көшірмені жүктеу'],
  'Текущая проверка': ['Current check', 'Ағымдағы тексеру'],
  'Остановить проверку': ['Stop check', 'Тексеруді тоқтату'],
  'Технические сведения': ['Technical details', 'Техникалық мәліметтер'],
  'В очереди': ['Queued', 'Кезекте'],
  'Проверяется': ['Checking', 'Тексерілуде'],
  'Готово': ['Done', 'Дайын'],
  'Уже проверен': ['Already checked', 'Бұрын тексерілген'],
  'Ошибка': ['Error', 'Қате'],
  'Завершена': ['Completed', 'Аяқталды'],
  'Не завершена': ['Failed', 'Аяқталмады'],
  'Останавливается': ['Stopping', 'Тоқтатылуда'],
  'Остановлена': ['Stopped', 'Тоқтатылды'],
  'Загрузка…': ['Loading…', 'Жүктелуде…'],
  'Открываем раздел…': ['Opening section…', 'Бөлім ашылуда…'],
  'Загрузка диалогов…': ['Loading conversations…', 'Диалогтар жүктелуде…'],
  'Не удалось загрузить диалоги': ['Could not load conversations', 'Диалогтарды жүктеу мүмкін болмады'],
  'Проверьте подключение к набору данных. Инструкция находится в разделе «Помощь».': ['Check the dataset connection. Instructions are available under Help.', 'Деректер жинағына қосылуды тексеріңіз. Нұсқаулық «Көмек» бөлімінде.'],
  'По выбранным фильтрам ничего не найдено.': ['Nothing matches the selected filters.', 'Таңдалған сүзгілер бойынша ештеңе табылмады.'],
  'В наборе пока нет диалогов.': ['There are no conversations in this dataset yet.', 'Бұл жинақта әзірге диалогтар жоқ.'],
  'Сбросить фильтры': ['Reset filters', 'Сүзгілерді тазарту'],
  'Результаты проверки': ['Check results', 'Тексеру нәтижелері'],
  'Пока нечего анализировать': ['Nothing to analyse yet', 'Әзірге талдайтын дерек жоқ'],
  'Где операторы теряют баллы': ['Where operators lose points', 'Операторлар қай жерде ұпай жоғалтады'],
  'По языкам': ['By language', 'Тілдер бойынша'],
  'По каналам': ['By channel', 'Арналар бойынша'],
  'Самые низкие оценки': ['Lowest scores', 'Ең төмен бағалар'],
  'Критерий': ['Criterion', 'Критерий'],
  'Средний итог': ['Average total', 'Орташа қорытынды'],
  'оценено диалогов': ['conversations evaluated', 'диалог бағаланды'],
  'средний итог': ['average total', 'орташа қорытынды'],
  'с серьёзными нарушениями': ['with serious violations', 'елеулі бұзушылықтары бар'],
  'требуют проверки человеком': ['need human review', 'адам тексеруін қажет етеді'],
  'Спорных оценок пока нет': ['No disputed scores yet', 'Әзірге даулы бағалар жоқ'],
  'Перейти к диалогам': ['Go to conversations', 'Диалогтарға өту'],
  'Статус': ['Status', 'Күйі'],
  'Комментарий': ['Comment', 'Пікір'],
  'Подана': ['Submitted', 'Жіберілді'],
  'Решение проверяющего': ['Reviewer decision', 'Тексерушінің шешімі'],
  'Выберите решение': ['Choose a decision', 'Шешімді таңдаңыз'],
  'Изменить на': ['Change to', 'Мынаған өзгерту'],
  'Причина решения': ['Decision reason', 'Шешім себебі'],
  'Сохранить решение': ['Save decision', 'Шешімді сақтау'],
  'Все апелляции': ['All appeals', 'Барлық апелляциялар'],
  'Открыть карточку диалога': ['Open conversation card', 'Диалог картасын ашу'],
  'Фрагмент диалога': ['Conversation excerpt', 'Диалог үзіндісі'],
  'Проверить диалог': ['Check conversation', 'Диалогты тексеру'],
  'Проверить ещё раз': ['Check again', 'Қайта тексеру'],
  'Как выполняется проверка': ['How the check works', 'Тексеру қалай орындалады'],
  'Все диалоги': ['All conversations', 'Барлық диалогтар'],
  'исходная оценка': ['original score', 'бастапқы баға'],
  'Критерии': ['Criteria', 'Критерийлер'],
  'Без секции': ['Without section', 'Бөлімсіз'],
  'нет результата': ['no result', 'нәтиже жоқ'],
  'Доказательства:': ['Evidence:', 'Дәлелдер:'],
  'Скопировать ссылку': ['Copy link', 'Сілтемені көшіру'],
  'Ссылка на доказательство скопирована': ['Evidence link copied', 'Дәлел сілтемесі көшірілді'],
  'Редактор чек-листов': ['Checklist editor', 'Чек-парақ редакторы'],
  'Настройте критерии оценки без изменений в коде.': ['Configure evaluation criteria without changing code.', 'Бағалау критерийлерін кодты өзгертпей баптаңыз.'],
  'Критериев пока нет': ['No criteria yet', 'Әзірге критерийлер жоқ'],
  'Создать критерии': ['Create criteria', 'Критерийлерді құру'],
  '+ Новый чек-лист': ['+ New checklist', '+ Жаңа чек-парақ'],
  'Сохранить как новую версию': ['Save as new version', 'Жаңа нұсқа ретінде сақтау'],
  'Название': ['Name', 'Атауы'],
  'Описание': ['Description', 'Сипаттама'],
  'Секции': ['Sections', 'Бөлімдер'],
  '+ Секция': ['+ Section', '+ Бөлім'],
  '+ Критерий': ['+ Criterion', '+ Критерий'],
  'Тип ответа': ['Answer type', 'Жауап түрі'],
  'Вес': ['Weight', 'Салмақ'],
  'Удалить чек-лист': ['Delete checklist', 'Чек-парақты жою'],
  'История версий': ['Version history', 'Нұсқалар тарихы'],
  'Версия': ['Version', 'Нұсқа'],
  'Сохранено': ['Saved', 'Сақталды'],
  'Восстановить': ['Restore', 'Қалпына келтіру'],
  'Проверка точности': ['Accuracy check', 'Дәлдікті тексеру'],
  'Согласие по критериям': ['Agreement by criterion', 'Критерийлер бойынша сәйкестік'],
  'Выборка для разметки': ['Labelling sample', 'Белгілеу үлгісі'],
  'Отчёт в JSON': ['JSON report', 'JSON есебі'],
  'Кто размечал': ['Labelled by', 'Белгілеген адам'],
  'Сохранить и сравнить': ['Save and compare', 'Сақтау және салыстыру'],
  'Сравнение с моделью': ['Comparison with model', 'Модельмен салыстыру'],
  'размечен': ['labelled', 'белгіленген'],
  'не размечен': ['not labelled', 'белгіленбеген'],
  'Сервер доступен': ['Server available', 'Сервер қолжетімді'],
  'Нет связи': ['No connection', 'Байланыс жоқ'],
  'Подключение': ['Connecting', 'Қосылуда'],
  'Подключение к серверу': ['Connecting to server', 'Серверге қосылу'],
  'Закрыть': ['Close', 'Жабу'],
  'Закрыть уведомление': ['Close notification', 'Хабарламаны жабу'],
  'Да': ['Yes', 'Иә'],
  'Нет': ['No', 'Жоқ'],
  'Клиент': ['Client', 'Клиент'],
  'Оператор': ['Operator', 'Оператор'],
  'Бот': ['Bot', 'Бот'],
  'Система': ['System', 'Жүйе'],
};

const patterns = {
  en: [
    [/^Набор данных: (.+)$/u, 'Dataset: $1'],
    [/^(\d+) из (\d+)$/u, '$1 of $2'],
    [/^(\d+)% готово$/u, '$1% complete'],
    [/^Найдены серьёзные нарушения: (\d+)$/u, 'Serious violations found: $1'],
    [/^Язык: (.+)$/u, 'Language: $1'],
    [/^(\d+) реплик$/u, '$1 messages'],
    [/^Раньше: (.+)$/u, 'Previous: $1'],
    [/^Набор данных (.+)\. Найдите разговор и откройте его результат\.$/u, 'Dataset $1. Find a conversation and open its result.'],
    [/^Система проверит новые диалоги из набора «(.+)» и покажет результат по каждому из них\.$/u, 'The system will check new conversations in “$1” and show each result.'],
    [/^Набор (.+): качество диалогов, зоны роста и результаты по каналам\.$/u, 'Dataset $1: conversation quality, improvement areas, and channel results.'],
    [/^Набор (.+): итоговые оценки после решений по апелляциям\.$/u, 'Dataset $1: final scores after appeal decisions.'],
  ],
  kk: [
    [/^Набор данных: (.+)$/u, 'Деректер жинағы: $1'],
    [/^(\d+) из (\d+)$/u, '$1 / $2'],
    [/^(\d+)% готово$/u, '$1% дайын'],
    [/^Найдены серьёзные нарушения: (\d+)$/u, 'Елеулі бұзушылықтар табылды: $1'],
    [/^Язык: (.+)$/u, 'Тіл: $1'],
    [/^(\d+) реплик$/u, '$1 хабарлама'],
    [/^Раньше: (.+)$/u, 'Алдыңғысы: $1'],
    [/^Набор данных (.+)\. Найдите разговор и откройте его результат\.$/u, '$1 деректер жинағы. Диалогты тауып, нәтижесін ашыңыз.'],
    [/^Система проверит новые диалоги из набора «(.+)» и покажет результат по каждому из них\.$/u, 'Жүйе «$1» жинағындағы жаңа диалогтарды тексеріп, әр нәтижені көрсетеді.'],
    [/^Набор (.+): качество диалогов, зоны роста и результаты по каналам\.$/u, '$1 жинағы: диалог сапасы, даму аймақтары және арналар бойынша нәтижелер.'],
    [/^Набор (.+): итоговые оценки после решений по апелляциям\.$/u, '$1 жинағы: апелляция шешімдерінен кейінгі қорытынды бағалар.'],
  ],
};

let locale = readLocale();
const sourceText = new WeakMap();
const sourceAttrs = new WeakMap();
let observer;

function readLocale() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return SUPPORTED.has(value) ? value : 'ru';
  } catch { return 'ru'; }
}

export function getLocale() { return locale; }

export function t(value) {
  const source = String(value ?? '');
  if (locale === 'ru' || !source) return source;
  const leading = source.match(/^\s*/u)?.[0] || '';
  const trailing = source.match(/\s*$/u)?.[0] || '';
  const core = source.slice(leading.length, source.length - trailing.length || undefined);
  const translated = TEXT[core]?.[locale === 'en' ? 0 : 1];
  if (translated) return `${leading}${translated}${trailing}`;
  for (const [pattern, replacement] of patterns[locale] || []) {
    if (pattern.test(core)) return `${leading}${core.replace(pattern, replacement)}${trailing}`;
  }
  return source;
}

function translateNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    if (!sourceText.has(node)) sourceText.set(node, node.nodeValue);
    const next = t(sourceText.get(node));
    if (node.nodeValue !== next) node.nodeValue = next;
    return;
  }
  if (!(node instanceof Element) || node.matches('script,style')) return;
  const attrs = ['aria-label', 'title', 'placeholder'];
  if (!sourceAttrs.has(node)) sourceAttrs.set(node, new Map());
  const originals = sourceAttrs.get(node);
  for (const attr of attrs) {
    if (node.hasAttribute(attr) && !originals.has(attr)) originals.set(attr, node.getAttribute(attr));
    if (originals.has(attr)) node.setAttribute(attr, t(originals.get(attr)));
  }
  for (const child of node.childNodes) translateNode(child);
}

export function applyTranslations(root = document.documentElement) { translateNode(root); }

export function setLocale(next) {
  if (!SUPPORTED.has(next)) return;
  locale = next;
  try { localStorage.setItem(STORAGE_KEY, next); } catch {}
  document.documentElement.lang = next;
  applyTranslations();
  window.dispatchEvent(new CustomEvent('cqa:localechange', { detail: { locale: next } }));
}

export function initI18n(select) {
  document.documentElement.lang = locale;
  if (select) {
    select.value = locale;
    select.addEventListener('change', () => setLocale(select.value));
  }
  applyTranslations();
  observer?.disconnect();
  observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'characterData') translateNode(record.target);
      else record.addedNodes.forEach(translateNode);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}
