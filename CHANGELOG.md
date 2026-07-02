# Changelog: Don't Touch Prod

Этот changelog описывает развитие проекта в текущем чате: от первых документов и анализа до актуального realtime-прототипа.

---

## 2026-07-02 - v0.1.5 Work completion sound

Добавлен звук завершения работы персонажем:

- `sounds/on-subtask-completed.ogg` подключен как sound effect `subtaskCompleted`;
- звук проигрывается на `analysis_done`, `subtask_done`, `bugfix_done`, `qa_done`;
- сохраненные события не переигрывают звук при восстановлении autosave, потому что уже учтены в `soundEventKeysRef`.

Версия приложения поднята до `0.1.5` как patch audio/UI feedback правка. Формат сохранения не менялся, `SAVE_SCHEMA_VERSION` остается `rt-board-v4`.

---

## 2026-07-02 - v0.1.4 Backlog expiration sound

Добавлен звук для исчезновения карточки из `Backlog`:

- `sounds/on-backlog-end.ogg` подключен как sound effect `backlogEnd`;
- звук проигрывается на событии `backlog_opportunity_expired`;
- это срабатывает в момент, когда untouched backlog-карточка теряет всю ценность и исчезает с активной доски.

Версия приложения поднята до `0.1.4` как patch audio/UI feedback правка. Формат сохранения не менялся, `SAVE_SCHEMA_VERSION` остается `rt-board-v4`.

---

## 2026-07-02 - v0.1.3 Save 0.x policy и UI-полировка карточек

Доработано правило сохранений и визуальная читаемость карточек:

- несовместимый autosave больше не запускается как игра;
- при `SAVE_SCHEMA_VERSION` mismatch меню показывает карточку с объяснением и debug `save old -> current`;
- `normalizeRealtimeState` зафиксирован в документации как санитарная нормализация только внутри той же schema;
- selected clean-карточки получают зеленую рамку, selected risky - желтую;
- impact-dot скрывается у clean low/medium карточек в `Done` и `Prod`;
- в inspector убран дубль текста про очередь релиза.

Версия приложения поднята до `0.1.3` как patch UI/save-policy правка. Формат сохранения не менялся, `SAVE_SCHEMA_VERSION` остается `rt-board-v4`.

---

## 2026-07-02 - v0.1.2 Версия UI из package.json

Исправлен источник версии в игровом footer:

- UI больше не получает `APP_VERSION` через Vite `define`, который обновляется только при старте dev-сервера;
- версия импортируется из `package.json` как watched-модуль;
- следующие semver bump должны доходить до dev UI без ручной синхронизации кода;
- формат сохранения не менялся, `SAVE_SCHEMA_VERSION` остается `rt-board-v4`.

---

## 2026-07-02 - v0.1.1 Deadline pressure вне readiness

Уточнена player-facing модель готовности:

- `deadline_pressure` больше не делает карточку `Risky`;
- `Clean / Risky / Dirty` теперь описывает только рабочие и качественные причины, которые игрок может исправить задачей, QA, SRE, анализом или bugfix;
- дедлайн остается отдельным визуальным слоем: deadline bar, urgent pulse, late/overdue-плашка после фактической просрочки;
- `releaseScore` продолжает учитывать deadline penalty отдельно от readiness;
- если задача полностью готова и срок еще не истек, она остается `Clean`, даже если дедлайн почти кончился.

Версия приложения поднята до `0.1.1` по semver как patch-исправление player-facing логики. Формат сохранения не менялся, `SAVE_SCHEMA_VERSION` остается `rt-board-v4`.

---

## 2026-07-02 - Backlog value decay

Переработан смысл `Backlog`:

- untouched-задачи в `Backlog` больше не тратят delivery deadline;
- вместо этого у них уменьшается `backlogValue`;
- первый перенос `Backlog -> In Progress` фиксирует текущую value и стартует настоящий delivery deadline;
- engaged-задачу нельзя вернуть в бесплатный backlog-state;
- если `backlogValue` дошел до нуля, задача тихо исчезает как упущенная возможность;
- такая упущенная возможность добавляет capped `Debt`, но не создает named fallout;
- Morning Briefing показывает `backlogExpiredCount`, `backlogValueLost`, `backlogDebtAdded`;
- `Prod -> Невыполненные` больше не показывает такие тихо истекшие backlog-задачи;
- autosave schema поднята до `rt-board-v4`, старые сейвы сбрасываются.

Добавлены проверки:

- untouched backlog не тикает `deadlineMs`;
- backlog value убывает;
- перенос в работу фиксирует value;
- истечение backlog value применяет дневной cap по debt;
- expired backlog не создает fallout consequences.

---

## 2026-07-01 - Survival-мета, late release и визуальная читаемость

P0-фикс квартального ритма:

- `daysPerQuarter` возвращен с `1` на `5`;
- `normalizeRealtimeState` поднимает старые autosave-сессии с `daysPerQuarter < 5` до актуального значения;
- `debug:rt` получил guardrail и падает, если новый run стартует с `daysPerQuarter < 5`.

Зафиксировано дизайн-решение:

```txt
Don't Touch Prod пока проектируется как endless survival
```

Это значит:

- нет ранней финальной победы;
- основной мотив забега - прожить как можно дольше;
- поражение наступает только при развале ресурсов: `Trust <= 0`, `Clients <= 0`, `Debt >= 100`;
- сорванная цель, missed work, late release, dirty/risky release и выжженный персонаж сами по себе не заканчивают run;
- лидерборд должен сравнивать не только длину выживания, но и качество забега.

Решение по росту квартальной цели:

- жесткий cap пока не вводится;
- бесконечный рост цели считается частью survival-давления;
- рост команды/найм/долгосрочные апгрейды поднимаются как обязательный будущий контррычаг;
- если рост команды не появится, цель придется смягчать или ограничивать.

Сформулирована рабочая гипотеза целей:

- недельные цели - короткий тактический pressure;
- месячные цели - средний горизонт эффективности;
- квартальные цели - stretch-направление и риск ради награды;
- цели должны поощрять риск и рост score, а не заменять survival-поражение/победу.

Добавлена late-release механика:

- после истечения deadline задача копит `overdueMs`;
- если просроченная задача все-таки попала в `Done`, она релизится, а не превращается в missed work;
- полезные свойства задачи применяются;
- `Value` режется через late multiplier;
- карточка и инспектор показывают `Late -N%`;
- event log/release postmortem фиксируют late value penalty.

UI-доработки:

- выбранная карточка слегка приподнимается, увеличивается и получает тень;
- карточки используют фон как readiness-сигнал: clean-ready зеленоватый, risky-ready желтоватый, needs-work серый;
- карточки снова показывают role chips нужных специализаций;
- подсказочные fallout-плашки убраны из карточек в пользу более спокойного визуального слоя.

Документация:

- `Диздок.md` поднят до версии 0.7;
- добавлены разделы про endless survival, лидерборды, цели недели/месяца/квартала;
- добавлены требования к логам для анализа survival-score и goal windows на плейтестах.

---

## 2026-06-30 - Realtime prototype baseline

Актуальный прототип:

- React + Vite frontend в `dtp2`;
- realtime-симуляция в `src/realtime/simulation.ts`;
- локальный diagnostics backend в `/Users/vladimirtitskiy/Dev/dtp-backend`;
- основной UX - drag-and-drop;
- доска `Backlog -> In Progress -> Done -> Released`;
- суточный release train в 18:00;
- Morning Briefing после суточного релиза;
- source-linked последствия релиза и fallout-задачи;
- missed-work consequences для просроченных невыпущенных задач;
- terminal cap для цепочек fallout;
- `Team Budget` и `Outsource`;
- autosave текущей игровой сессии в браузере;
- debug snapshots и JSON-логи по отдельным session-файлам;
- git-история заведена для frontend и backend проектов.

---

## 1. Старт: ревизия старых документов

Работа началась с изучения исходных документов:

- `DTP_postmortem.md`;
- `Диздок.md`;
- `ТЗ.md`.

Исходная позиция проекта была противоречивой:

- постмортем фиксировал закрытие прошлой версии;
- диздок описывал новый pivot в сторону Kanban Pivot;
- ТЗ задавало пошаговый прототип с большим числом колонок и кнопочным управлением.

Главный вывод:

```txt
старое ядро "техническая задача -> правильное инженерное решение" не работает как игра;
новое ядро надо искать в управлении потоком задач, командой, сроками и релизным риском.
```

---

## 2. Первый playable loop

Был собран минимальный прототип канбан-игры:

- карточки задач;
- персонажи;
- ресурсы;
- event log;
- выбранная карточка;
- первичный игровой цикл "двигать карточку, назначать работу, релизить".

На этом этапе игра еще была скорее пошаговой и процедурной. Игроку было непонятно, что именно делать и зачем.

---

## 3. Переход к drag-and-drop

Кнопочный путь был признан неподходящим для игры про карточки.

Сделано:

- карточки начали перетаскиваться между колонками;
- персонажи начали назначаться перетаскиванием на карточку;
- drag-and-drop стал основным UX;
- кнопки были убраны как основной способ игры.

Ключевое решение:

```txt
игра про карточки должна играться карточками
```

---

## 4. Переход из пошагового режима в realtime

Пошаговый режим заменен realtime-циклом.

Сделано:

- добавлен игровой тик 500 мс;
- добавлено игровое время в хэдер;
- добавлена кнопка Pause;
- pause останавливает тик и блокирует изменения;
- задачи начали появляться со временем;
- появились deadline/progress bars;
- задача перестает быть просто "очередной карточкой" и становится событием во времени.

Масштаб времени:

```txt
1 real second = 1 game minute
```

---

## 5. Первичная realtime-модель задач

На раннем realtime-этапе были введены:

- backlog timer;
- deadline timer;
- понятность задачи (`clarity`);
- качество (`quality`);
- прогресс выполнения;
- упрощенные колонки;
- назначение одного человека на одну задачу;
- запрет таскать карточку, пока она в работе;
- отмена задачи через кнопку в хэдере.

Позже backlog timer был удален как лишний. Остался только deadline.

---

## 6. Диагностика и логи

Когда стало непонятно, почему игра "остановилась", была добавлена диагностика.

Сделано:

- in-game `Event Log`;
- `Debug Trace`;
- snapshot в localStorage;
- запись latest snapshot через Vite middleware в `.dtp-debug/latest-run.json`;
- отдельный проект `dtp-backend`;
- API `GET /health`, `GET /api/log`, `POST /api/log`, `POST /api/reset`;
- JSON-лог в `dtp-backend/logs/game-log.json`;
- отправка frontend actions, game events и snapshots в backend.

Также `dta-backend` был переименован в `dtp-backend`.

Позже backend был переведен с общего `game-log.json` на отдельные файлы сессий:

```txt
logs/index.json
logs/sessions/<sessionId>.json
```

`GET /api/log` теперь возвращает index, а `GET /api/log?sessionId=...` возвращает конкретную игровую сессию.

---

## 7. Понятное поражение

Поражение было доработано: вместо сухого "проиграл" появился отчет.

Сделано:

- `lossReport`;
- headline;
- explanation;
- snapshot ресурсов;
- последние плохие релизы;
- активные задачи под давлением;
- рекомендация игроку.

Условия поражения:

```txt
Trust <= 0
Clients <= 0
Debt >= 100
```

---

## 8. Удаление старости задачи

Механика "старости" была убрана, потому что дублировала deadline и сбивала игрока.

Осталось:

- один deadline на задачу;
- visual urgency, когда deadline почти закончился;
- deadline penalty при релизе;
- freeze deadline, когда задача попала в `Done`.

Также добавлен лимит:

```txt
Backlog max: 5 задач
```

---

## 9. Подзадачи и специализации

Вместо отдельных колонок Analysis/Design/Dev/Test была введена модель подзадач внутри карточки.

Сделано:

- checklist/subtasks;
- роли подзадач: backend, frontend, design, qa, sre, bugfix;
- importance: optional, important, critical;
- часть подзадач скрыта;
- analysis раскрывает скрытую работу и повышает clarity;
- подзадачи отображаются на карточке и в инспекторе;
- персонажи выбирают работу по своим лучшим specialty.

Позже была исправлена строгая последовательность подзадач: QA и другие роли могут брать доступные подзадачи независимо от порядка.

---

## 10. Упрощение доски

Доска была сведена к актуальной модели:

```txt
Backlog -> In Progress -> Done -> Released
```

Удалено:

- отдельная колонка Analysis;
- отдельная колонка Test;
- отдельные Dev/Review/Release стадии.

Analysis, QA, SRE, frontend, backend и design стали работой внутри `In Progress`.

---

## 11. Суточный release train

Релиз стал не ручным действием, а суточным окном.

Сделано:

- `Done` стала очередью релиза;
- задачи из `Done` применяются к бизнесу только в 18:00;
- добавлена колонка `Released`;
- последние задачи в `Done` и `Released` сортируются сверху;
- до релиза игрок может забрать задачу из `Done` назад в работу за `Trust -4`;
- позже была убрана отдельная текстовая маркировка `Queued on time / Queued late`, потому deadline уже виден по bar/pulse.

Позже этот слой был перестроен в Morning Briefing: release train закрывает день, переносит игру на 08:00 следующего утра и показывает игроку последствия вчерашнего релиза до продолжения игры.

---

## 12. Рабочий день 08:00-18:00

Часы были ограничены рабочим днем.

Сделано:

- день идет с 08:00 до 18:00;
- после 18:00 часы сбрасываются на 08:00 следующего дня;
- команда получает overnight stamina boost;
- shock от отмененной задачи очищается утром.

---

## 13. Code Freeze и анимация релиза (устаревший слой)

Релизная анимация была улучшена.

Сделано:

- в 18:00 включается `CODE FREEZE`;
- время останавливается;
- задачи из `Done` по одной перепрыгивают в `Released`;
- эффекты релиза показываются рядом;
- карточки не просто перескакивают мгновенно, а отрабатывают staged animation.

Позже этот слой был заменен на Morning Briefing без перелетной анимации: карточки сразу переходят в `Released`, игра останавливается на утреннем отчете, а игрок продолжает только после кнопки `Начать день`.

---

## 14. Сигнал завершенной работы

После завершения работы персонажем карточка должна привлекать внимание, но не становиться постоянным зеленым статусом.

Сделано:

- одноразовый bounce после `analysis_done`, `subtask_done`, `bugfix_done`, `qa_done`;
- удалена постоянная зеленая подсветка после каждого pass;
- `Known work complete` остается только для карточки, где видимая работа закрыта.

---

## 15. Баги, QA и rework

После удаления колонки Test баги были возвращены в механику.

Сделано:

- dev-подзадачи могут создавать баги;
- шанс багов зависит от clarity, stamina, quality, pressure, complexity, importance, off-role и specialty;
- QA может найти баги;
- QA уменьшает bug count;
- QA превращает баги в rework-подзадачи;
- rework назначается разным специализациям: backend, frontend, sre, design;
- bugfix/rework повышает quality.

Позже добавлен QA recheck после доработок: если после QA была development/bugfix/outsource-работа, задача автоматически получает открытую QA-подзадачу `Re-test changes after rework`, чтобы `Changed after QA` не становился тупиком.

---

## 16. Stamina вместо fatigue/morale

Мораль и усталость были признаны дублирующими.

Сделано:

- введен общий параметр `stamina`;
- `fatigue` и `morale` больше не являются актуальными UI-параметрами;
- stamina влияет на скорость, качество и баги;
- stamina восстанавливается при простое и утром;
- burnout растет только при очень низкой stamina.

---

## 17. Темп и баланс

После плейтеста темп был замедлен.

Сделано:

- задачи появляются реже;
- дедлайны стали длиннее;
- выполнение задач стало дольше;
- целевой темп смещен к 4-5 задачам в сутки, а не к десятку;
- backlog relief замедляет новые задачи при заполненном backlog.

Цель баланса:

```txt
дать игроку пространство читать карточки, дедлайны и состояние команды
```

---

## 18. Роль SRE

SRE получил понятную функцию:

- production safety;
- rollout safety;
- timeouts/retries;
- performance pressure;
- incident stabilization;
- blast radius reduction на релизе.

Если SRE-подзадача закрыта, плохой релиз меньше бьет по trust/clients/debt.

---

## 19. Off-role работа

Было исправлено ограничение, из-за которого персонажи не могли брать чужие important-подзадачи.

Сделано:

- персонаж сначала ищет работу по своим лучшим specialty;
- если своей работы нет, может взять чужую подзадачу при specialty > 0;
- off-role медленнее и хуже;
- off-role дает больше риска багов и штраф к stamina;
- off-role прокачивает соответствующий specialty.

---

## 20. Team Budget и Outsource

Добавлен экономический слой для закрытия недостающей компетенции.

Сделано:

- `Team Budget` в хэдере;
- успешные релизы пополняют budget;
- `Outsource` как карточка в панели команды;
- `Outsource` перетаскивается на задачу в `In Progress`;
- стоимость зависит от importance:
  - optional: 3;
  - important: 4;
  - critical: 6;
- аутсорс выбирает только подзадачи, которые можно оплатить текущим бюджетом;
- приоритет получает недостающая компетенция команды.

---

## 21. Fixed Team Panel

Секция персонажей была переработана.

Сделано:

- игровая страница фиксирована по высоте;
- список команды скроллится внутри своей панели;
- канбан-доска скроллится отдельно;
- правая панель скроллится отдельно;
- команда может расти без растягивания всей страницы.

---

## 22. UX и визуальные уточнения

Сделано:

- стартовый экран вместо мгновенного запуска игры;
- progress работы показывается не только на карточке, но и в карточке персонажа;
- выбранная задача в `In Progress` получила серую рамку, чтобы не конфликтовать с красным urgent/deadline;
- карточки с подзадачами показывают summary и chips;
- deadline/pulse оставлен как главный сигнал срочности;
- drag/drop аутсорса получил fallback через внутренний active drag state.

---

## 23. Readiness вместо калькулятора

После ревью прототипа player-facing слой был отрезан от точного release forecast.

Сделано:

- `Release score` убран из инспектора задачи;
- `score ...` убран из Event Log, release effects и Morning Briefing;
- `Ready for Done` переименован в `Known work complete`;
- прямой `Backlog -> Done` запрещен;
- добавлена внутренняя классификация `Clean / Risky / Dirty`;
- добавлены player-facing risk reasons;
- `blastRadius` добавлен как видимое поле задачи;
- high blast без SRE safety попадает в причины риска;
- скрытая работа больше не показывает точное количество, роли и importance;
- точный `releaseScore`, hidden subtasks и readiness report остаются в Debug Trace/snapshot.

---

## 24. Исправления после плейтеста readiness-слоя

Сделано:

- drop карточки поверх другой карточки теперь считается drop в соответствующую колонку;
- исправлен блокирующий UX, когда `Done` или `In Progress` нельзя было использовать из-за заполнения карточками;
- аутсорс больше не закрывает подзадачу мгновенно, а работает с progress bar;
- аутсорс блокирует задачу на время выполнения;
- если stamina персонажа падает до 0, персонаж становится `Exhausted` до следующего утра;
- анализ замедлен и стал заметно дороже по stamina;
- spawn ускоряется, если на доске почти не осталось активной работы;
- после разработки, выполненной после QA, появляется риск `Changed after QA`, QA coverage устаревает и автоматически добавляется QA recheck-подзадача;
- backend snapshots стали компактными, полный snapshot остается локально;
- backend пишет session JSON атомарно и карантинит битый session-файл вместо падения.

---

## 25. Autosave, версии и git

Добавлено сохранение текущей игровой сессии в браузере.

Сделано:

- autosave в `localStorage` по ключу `dtp.autosave.rt-board`;
- восстановление run после refresh страницы;
- сохранение `sessionId`, чтобы backend-продолжение писалось в тот же session-файл;
- envelope сохранения с `schemaVersion` и `appCommit`;
- `SAVE_SCHEMA_VERSION` как ручной рубильник для критичных изменений state;
- после перехода на `morningReport` schema поднята до `rt-board-v2`;
- после добавления missed-work/chain-depth schema поднята до `rt-board-v3`;
- `normalizeRealtimeState` используется для совместимых миграций;
- несовместимый или поврежденный autosave очищается перед запуском;
- Vite inject текущего git commit в frontend;
- Debug Trace показывает save schema и commit.

Правило на будущие доработки:

```txt
если изменение state совместимо - добавить нормализацию;
если изменение state критично ломает старый save - поднять SAVE_SCHEMA_VERSION.
```

---

## 26. Morning Briefing и последствия релиза

Релиз был переработан из анимационного code-freeze в утренний отчет.

Сделано:

- в 18:00 release train сразу переносит задачи из `Done` в `Released`;
- бизнес-эффекты применяются в момент закрытия релиза;
- симуляция сразу переводится на 08:00 следующего дня;
- игра ставится на паузу, а кнопка `Pause` становится неактивной;
- канбан-доска, выбранная карточка и event log скрываются;
- вместо них показывается Morning Briefing;
- игрок продолжает только после кнопки `Начать день`.

Morning Briefing показывает:

- последствия вчерашнего релиза;
- source task, cause и symptom для каждого fallout;
- generated task id, если последствие породило новую задачу;
- business impact по `Trust`, `Clients`, `Debt`;
- список вчерашних shipments.

Генерация последствий стала source-linked:

- плохой релиз больше не создает абстрактный follow-up;
- consequence привязан к конкретной задаче, например `PAY-002`;
- новая задача получает тот же доменный prefix, например `PAY-003`;
- event log/backend получают событие `release_consequence_spawned`;
- debug snapshot содержит `morningReport`.

Позже P0-слой расширил Morning Briefing:

- просроченные невыпущенные задачи разрешаются как missed work;
- missed backlog создает ignored-work consequence;
- missed in-progress создает более мягкий missed-deadline consequence с переносом части контекста;
- мелкая missed-задача дает дешевый capped hit без новой карточки;
- fallout-цепочки получили `rootCauseTaskId`, `sourceTaskId`, `chainDepth` и terminal cap;
- если backlog full или chain cap достигнут, consequence не исчезает молча, а закрывается resource hit;
- `day_summary` пишет clean/risky/dirty, missed, fallout created/resolved/unresolved и terminal counts;
- UI показывает предупреждение `May create follow-up tomorrow` / `Likely follow-up tomorrow`;
- добавлен `npm run debug:ab` для anti-dominance проверки clean / mild dirty / heavy dirty.

Цель изменения:

```txt
утренние поломки должны ощущаться как результат вчерашних решений игрока,
а не как случайный генератор инцидентов
```

---

## 27. Текущее техническое состояние

Актуальные команды frontend:

```sh
npm run dev
npm run check
npm run build
npm run debug:rt
npm run debug:ab
```

Актуальные команды backend:

```sh
cd /Users/vladimirtitskiy/Dev/dtp-backend
npm run dev
npm run check
```

Актуальный runtime:

```txt
src/realtime/simulation.ts - публичный фасад realtime-движка
src/engine/* - правила симуляции, баланс, задачи, релиз, последствия, миграции
src/hooks/* - browser/runtime orchestration: tick, autosave, drag-and-drop, logging, actions
src/components/* - player-facing UI панели
src/App.tsx - shell-композиция экранов menu/game/docs
src/styles.css - визуальный слой
src/save.ts - autosave envelope и schema guard
src/frontendLogging.ts - backend logging + browser fallback queue
vite.config.ts - dev/build wiring
/Users/vladimirtitskiy/Dev/dtp-backend/src/server.ts - локальный JSONL/session logger backend
```

Legacy runtime:

```txt
src/archive/core
src/debug/legacy.ts
```

---

## 28. Menu, RTFM, Prod cleanup и UI-рефакторинг

Последняя серия правок закрыла несколько UI/UX долгов после плейтеста.

### Главное меню и пауза

Поведение разделено:

- `Пауза` в header снова только останавливает / возобновляет игровой тик;
- отдельная кнопка `Меню` открывает pause-menu и ставит run на паузу;
- при refresh страница открывается в меню;
- если есть autosave, меню показывает компактную карточку сохраненной партии;
- `Новая игра` находится в главном/pause-menu рядом с `Продолжить`;
- `Новая игра` убрана из игрового header, чтобы снизить риск случайного клика.

### RTFM и userdocs

Добавлена player-facing mini-wiki:

```txt
userdocs/ru
userdocs/en
```

Статьи:

- общее описание игры;
- игровой процесс;
- роли команды: analyst, backend, frontend, QA, SRE, outsource;
- качество, баги, QA и readiness.

В меню появился раздел `RTFM`, который открывает wiki на выбранном языке. Markdown хранится отдельными `.md` файлами, а UI рендерит базовые заголовки, абзацы и списки без внешних зависимостей.

### Колонка Прод

Колонка `Прод` получила два режима:

- `Релизы` - доставленные задачи, которые уже применили бизнес-эффекты;
- `Невыполненные` - resolved missed-work карточки.

UI упрощен:

- с карточек в `Прод` убрана плашка `Зарелизено`;
- resolved missed-work карточки в фильтре `Невыполненные` больше не пульсируют, даже если deadline равен нулю;
- история должна читаться спокойно, без сигналов "срочно сделай это", потому что такие задачи уже разрешились.

### Source-linked fallout в инспекторе

Последствия стали структурнее:

- fallout-задачи больше не тащат в названии длинное "упало после такой-то задачи";
- связь показывается в инспекторе через секцию `Спровоцировано задачей`;
- задача-источник отображается ссылкой-плашкой;
- клик по ссылке выбирает задачу и автоматически переключает `Прод` на нужный режим;
- у релизной задачи есть секция `Последствия` со ссылками на задачи, которые она спровоцировала.

Это снижает шум в названиях карточек и оставляет причинно-следственную связь в данных для анализа логов.

### Локализация fallout UI

Долокализованы новые секции инспектора и fallback-тексты:

- `Спровоцировано задачей`;
- `Последствия`;
- postmortem/fallout-ссылки;
- source/cause-тексты, которые раньше частично оставались на английском.

### Отладочный UI

In-game Event Log и Debug Trace убраны с основного игрового экрана. События и snapshots продолжают писаться:

- во внутренний `RtGameState.log`;
- в `.dtp-debug/latest-run.json`;
- в backend session logs, если backend запущен;
- в browser fallback queue, если backend временно недоступен.

### UI-рефакторинг

Из `src/App.tsx` вынесены:

```txt
src/components/MenuScreen.tsx
src/components/DocsScreen.tsx
src/components/LanguageSwitch.tsx
src/userdocs.ts
src/formatting.ts
```

`App.tsx` уменьшен примерно на 280 строк. Поведение игры не менялось: это чистый вынос player-facing меню, RTFM и общих форматтеров из shell-компонента.

---

## 29. Большой рефакторинг App и realtime-движка

После ревью архитектуры был выполнен последовательный рефакторинг без изменения правил игры.

Главная цель:

```txt
перестать наращивать App.tsx и simulation.ts как два монолита
```

### Движок

`src/realtime/simulation.ts` превращен в фасад над модульным движком. Он сохраняет стабильный API для UI и debug harnesses, но правила больше не живут в одном файле.

Основные модули:

- `src/engine/balance.ts` - константы и баланс;
- `src/engine/types.ts` - типы realtime-состояния;
- `src/engine/taskFactory.ts` и `src/engine/spawn.ts` - генерация задач, команды и входящего потока;
- `src/engine/board.ts` - правила движения карточек;
- `src/engine/work.ts` - назначение людей, прогресс, stamina, analysis, QA, баги и rework;
- `src/engine/outsourcing.ts` - аутсорс;
- `src/engine/release.ts` - release train и бизнес-эффекты;
- `src/engine/consequences.ts` - fallout, missed work, цепочки и terminal cap;
- `src/engine/morning.ts` - Morning Briefing;
- `src/engine/time.ts` - часы, дедлайны и дневной цикл;
- `src/engine/loss.ts` - поражение;
- `src/engine/migration.ts` - нормализация autosave;
- `src/engine/readiness.ts` - clean/risky/dirty, late release и внутренний score.

Legacy runtime перенесен в `src/archive/core`, а старый debug-скрипт переименован в `debug:legacy`.

### Shell и hooks

Из `App.tsx` вынесены runtime-эффекты и игровые действия:

- `useGameBoot`;
- `useGameMutation`;
- `useRuntimeEffects`;
- `useGameActions`;
- `useGameDragAndDrop`;
- `useGameEventEffects`;
- `useTaskFeedback`;
- `useLocaleSync`;
- `useSelectedTaskSync`.

Теперь `App.tsx` в основном:

- хранит выбранный экран (`menu`, `game`, `docs`);
- держит выбранную задачу/doc/prod-filter;
- связывает hooks и компоненты;
- раскладывает страницу.

### UI-компоненты

Игровой экран разложен на компоненты:

- `GameHeader`;
- `MenuScreen`;
- `DocsScreen`;
- `TeamPanel`;
- `BoardPanel`;
- `TaskCard`;
- `TaskInspector`;
- `MorningReportPage`;
- `LossReport`;
- `RunBanner`;
- `SidePanel`;
- `ReadinessBadge`;
- `TinyBar`.

### UI-полировка, зафиксированная в этом проходе

Сохранены и задокументированы последние UX-решения:

- язык переключается в меню/docs, а не в активном игровом header;
- `Пауза` только ставит игру на паузу, `Меню` открывает меню;
- `Новая игра` находится в меню;
- из header убран шумный текст с промежуточными подсказками по цели;
- `Released` заменен player-facing колонкой `Прод`;
- у `Прод` есть фильтры `Релизы` и `Невыполненные`;
- с карточек в проде убраны лишние плашки `Зарелизено`;
- с карточек в `Done` убрана плашка `Уедет в 18:00`;
- `Чеклист` переименован в `Подзадачи`;
- `Unknown work` на русском называется `Скрытая работа`;
- fallout-названия очищены от длинного "после такой-то задачи";
- связи между задачами показываются структурно через `Спровоцировано задачей` и `Последствия`;
- клик по linked task выбирает карточку и скроллит к ней, при необходимости переключая фильтр `Прод`;
- Event Log и Debug Trace убраны из игрового экрана, но structured logs остаются для плейтеста.

### Текущий размер узких мест

После прохода самые крупные активные файлы:

```txt
src/engine/work.ts
src/engine/consequences.ts
src/components/MorningReportPage.tsx
src/hooks/useGameDragAndDrop.ts
src/engine/migration.ts
src/engine/types.ts
src/engine/taskFactory.ts
src/realtime/simulation.ts
src/App.tsx
```

Вывод:

```txt
основной App/simulation-монолит снят;
следующие кандидаты на дробление стали локальными и понятными.
```

### Проверки

После рефакторинга прогонялись:

```sh
npm run check
npm run build
npm run debug:rt
npm run debug:ab
git diff --check
```

Подробная архитектурная заметка:

```txt
docs/update-2026-07-01-refactor-milestones.md
```

---

## 30. Открытые вопросы

1. Нужно ли сохранять `Burnout`, если `Stamina` уже покрывает короткую усталость?
2. Достаточно ли понятна роль `Team Budget`, если кроме outsource пока нет расходов?
3. Нужно ли возвращать наем/рост команды как долгосрочную цель?
4. Не слишком ли сильный `Done` как способ заморозить deadline?
5. Должен ли SRE иметь больше уникальных действий кроме blast radius reduction?
6. Как лучше объяснить игроку, что QA превращает баги в rework?
7. Как часто Morning Briefing должен порождать fallout от risky, но не dirty, релизов?
8. Нужен ли туториал-подсказка первого дня или достаточно визуальных сигналов?
