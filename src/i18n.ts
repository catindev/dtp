import {
  SIM_TEXT,
  TASK_TITLES,
} from "./engine/content";

export {
  SIM_TEXT,
  TASK_TITLES,
};

export type Locale = "en" | "ru";

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_STORAGE_KEY = "dtp.locale.v1";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "EN",
  ru: "RU",
};

export type LocalizedTaskKind =
  | "feature"
  | "bug"
  | "techDebt"
  | "integration"
  | "incident"
  | "performance"
  | "compliance";

export type LocalizedSubtaskRole = "backend" | "frontend" | "design" | "qa" | "sre" | "bugfix";
export type LocalizedImportance = "critical" | "important" | "optional";
export type LocalizedBlastRadius = "low" | "medium" | "high";
export type LocalizedReadiness = "clean" | "risky" | "dirty";

const UI: Record<Locale, Record<string, string>> = {
  en: {
    "menu.subtitle": "Q1 / Day 1",
    "menu.pauseSubtitle": "Paused run",
    "menu.start": "Start run",
    "menu.continue": "Continue",
    "menu.newRun": "New run",
    "menu.language": "Language",
    "menu.music": "Music",
    "menu.savedRun": "Saved game",
    "menu.session": "Session {value}",
    "menu.rtfm": "RTFM",
    "menu.rtfmDescription": "Read the short player wiki",
    "menu.saveUnavailable": "Saved game unavailable",
    "menu.saveIncompatible": "The saved game is incompatible with this build. Start a new run.",
    "menu.saveInvalid": "The saved game could not be read. Start a new run.",
    "menu.saveSchemaDebug": "Save {previous} -> current {current}",
    "menu.saveCommitDebug": "Saved build {value}",
    "menu.saveSchemaUnknown": "unknown",
    "menu.saveReset.schema_mismatch": "Schema mismatch",
    "menu.saveReset.invalid_json": "Invalid JSON",
    "menu.saveReset.invalid_shape": "Invalid save",
    "menu.saveReset.storage_error": "Storage error",
    "docs.title": "RTFM",
    "docs.subtitle": "Short player wiki",
    "docs.back": "Back",
    "docs.nav": "Wiki pages",
    "header.day": "Q{quarter} / Day {day} of {daysPerQuarter}",
    "header.goal": "Goal {value}/{goal} · Trust {trust}/{trustGoal}",
    "header.goalMet": "Goal met",
    "header.quarterReviewTomorrow": "Quarter review tomorrow morning",
    "header.quarterReviewInDays": "Quarter review in {days} days",
    "header.morningLine": "Morning briefing / Fallout {count}",
    "header.releaseLine": "Release in {time} / Done {done}",
    "header.trust": "Trust {value}",
    "header.clients": "Clients {value}",
    "header.value": "Value {value}",
    "header.debt": "Debt {value}",
    "header.budget": "Budget {value}",
    "header.boost": "Boost {value}%",
    "header.stopped": "Stopped",
    "header.paused": "Paused",
    "header.resume": "Resume",
    "header.pause": "Pause",
    "header.menu": "Menu",
    "header.language": "Language",
    "footer.label": "Game version and session",
    "footer.version": "Version {value}",
    "footer.commit": "Build {value}",
    "footer.schema": "Save {value}",
    "footer.session": "Session {value}",
    "status.morning": "MORNING",
    "status.paused": "PAUSED",
    "status.running": "RUNNING",
    "status.won": "WON",
    "status.lost": "LOST",
    "run.stopped": "Run stopped",
    "victory.bannerTitle": "Year survived",
    "victory.bannerText": "Grade {grade} · Score {score}",
    "victory.kicker": "Year-end postmortem",
    "victory.title": "You survived the year",
    "victory.summary": "Grade {grade} with score {score}.",
    "victory.newRun": "New run",
    "victory.score": "Score {score}/100",
    "victory.peakDebt": "Peak debt {value}",
    "victory.burnout": "Burnout {value}",
    "victory.releases": "Releases",
    "victory.clean": "Clean {value}",
    "victory.risky": "Risky {value}",
    "victory.dirty": "Dirty {value}",
    "victory.fallout": "Fallout",
    "victory.falloutCreated": "Created {value}",
    "victory.falloutResolved": "Resolved {value}",
    "victory.unresolved": "Unresolved {value}",
    "victory.misses": "Misses",
    "victory.missedTasks": "Missed tasks {value}",
    "victory.missedOpportunities": "Missed opportunities {value}",
    "victory.notes": "Notes",
    "team.title": "Team",
    "team.exhausted": "Exhausted",
    "team.onTask": "On {taskId}",
    "team.busy": "Busy",
    "team.available": "Available",
    "team.shock": "Shock {minutes}m",
    "team.stamina": "Stamina",
    "team.burnout": "Burnout {value}",
    "characterRoles.analyst": "analyst",
    "characterRoles.backend": "backend",
    "characterRoles.frontend": "frontend",
    "characterRoles.qa": "qa",
    "characterRoles.sre": "sre",
    "outsourcing.title": "Outsource",
    "outsourcing.role": "contractor",
    "outsourcing.description": "Expensive fallback for missing competence.",
    "outsourcing.optional": "Опционально {cost}",
    "outsourcing.important": "Важно {cost}",
    "outsourcing.critical": "Критично {cost}",
    "outsourcing.budget": "Team Budget {budget}",
    "columns.backlog": "Backlog",
    "columns.inProgress": "In Progress",
    "columns.done": "Готово",
    "columns.released": "Prod",
    "prodView.label": "Prod view",
    "prodView.released": "Released",
    "prodView.unfinished": "Unfinished",
    "inspector.title": "Selected Task",
    "inspector.empty": "No task selected.",
    "inspector.close": "Close inspector",
    "inspector.column": "Column {column}",
    "inspector.pressure": "Pressure {value}",
    "inspector.complexity": "Complexity {value}",
    "inspector.value": "Value {value}",
    "inspector.clarity": "Clarity {value}",
    "inspector.quality": "Quality {value}",
    "inspector.qa": "QA {value}",
    "inspector.bugs": "Bugs {value}",
    "inspector.impact": "Impact {value}",
    "inspector.late": "Late {time} / Value -{value}%",
    "inspector.queued": "Queued for release. Reopening costs Trust -{cost}.",
    "inspector.cancel": "Cancel task",
    "inspector.causedBy": "Triggered by",
    "inspector.consequences": "Consequences",
    "inspector.missingSource": "Source {id}",
    "inspector.postmortem": "Postmortem",
    "characterInspector.title": "Selected Character",
    "characterInspector.role": "Role {value}",
    "characterInspector.status": "Status {value}",
    "characterInspector.stamina": "Stamina {value}",
    "characterInspector.burnout": "Burnout {value}",
    "characterInspector.currentTask": "Current task",
    "characterInspector.idle": "Available for new work.",
    "work.character": "{name} is working",
    "work.outsource": "Outsource is working",
    "work.progress": "Progress",
    "log.title": "Event Log",
    "debug.title": "Debug Trace",
    "debug.status": "Status {value}",
    "debug.events": "Events {value}",
    "debug.tasks": "Tasks {value}",
    "debug.save": "Save {value}",
    "debug.commit": "Commit {value}",
    "debug.session": "Session {value}",
    "debug.copy": "Copy snapshot",
    "debug.autosave": "Autosave uses {key}. Snapshot writes to {path}.",
    "debug.stopReason": "Stop reason: {reason}",
    "morning.title": "Morning Briefing",
    "morning.empty": "Nothing shipped or expired yesterday. Today's work starts from the existing backlog.",
    "morning.summary": "{shipped} shipped, {missed} missed, {expired} opportunities expired. Today's backlog reflects the consequences.",
    "morning.startDay": "Start day",
    "morning.clean": "Clean {value}",
    "morning.risky": "Risky {value}",
    "morning.dirty": "Dirty {value}",
    "morning.missed": "Missed {value}",
    "morning.opportunities": "Opportunities -{value} / Debt +{debt}",
    "morning.fallout": "Fallout +{value}",
    "morning.unresolved": "Unresolved {value}",
    "morning.consequences": "Consequences",
    "morning.noFallout": "No visible release or missed-work fallout hit the team this morning.",
    "morning.shipments": "Yesterday's Shipments",
    "morning.noShipments": "No cards were queued in Done before the release train.",
    "morning.runStopped": "Run stopped after this release. Start a new run from the header.",
    "quarterReview.title": "Quarter {quarter} Review",
    "quarterReview.met": "Goals met",
    "quarterReview.missed": "Goals missed",
    "quarterReview.valueMet": "Value {actual}/{target} met",
    "quarterReview.valueMissed": "Value {actual}/{target} missed",
    "quarterReview.trustMet": "Trust {actual}/{target} met",
    "quarterReview.trustMissed": "Trust {actual}/{target} missed",
    "quarterReview.effect": "Quarter effect",
    "releaseMetric.from": "{delta} from {before}",
    "task.impact": "Impact {value}",
    "task.neededRoles": "Needed roles",
    "task.deadline": "Deadline",
    "task.opportunity": "Opportunity",
    "task.reopenCost": "Reopen costs Trust -{cost}",
    "task.outsource": "Outsource",
    "task.lateChip": "Late -{value}%",
    "subtasks.title": "Subtasks",
    "subtasks.unknown": "Unknown work",
    "subtasks.analysisNeeded": "analysis needed",
    "subtasks.unknownImportance": "unknown",
    "readiness.noRisks": "No visible release risks",
    "loss.title": "Why You Lost",
    "loss.recentMisses": "Recent misses",
    "loss.badReleases": "Bad releases",
    "loss.read": "Read",
  },
  ru: {
    "menu.subtitle": "Q1 / День 1",
    "menu.pauseSubtitle": "Игра на паузе",
    "menu.start": "Начать игру",
    "menu.continue": "Продолжить",
    "menu.newRun": "Новая игра",
    "menu.language": "Язык",
    "menu.music": "Музыка",
    "menu.savedRun": "Сохраненная игра",
    "menu.session": "Сессия {value}",
    "menu.rtfm": "RTFM",
    "menu.rtfmDescription": "Короткая wiki по игре",
    "menu.saveUnavailable": "Сохранение недоступно",
    "menu.saveIncompatible": "Сохранение несовместимо с текущей версией. Нужно начать новый забег.",
    "menu.saveInvalid": "Сохранение не удалось прочитать. Нужно начать новый забег.",
    "menu.saveSchemaDebug": "Сейв {previous} -> текущий {current}",
    "menu.saveCommitDebug": "Билд сейва {value}",
    "menu.saveSchemaUnknown": "неизвестно",
    "menu.saveReset.schema_mismatch": "Несовместимая схема",
    "menu.saveReset.invalid_json": "Поврежденный JSON",
    "menu.saveReset.invalid_shape": "Некорректный сейв",
    "menu.saveReset.storage_error": "Ошибка хранилища",
    "docs.title": "RTFM",
    "docs.subtitle": "Короткая wiki для игрока",
    "docs.back": "Назад",
    "docs.nav": "Страницы wiki",
    "header.day": "Q{quarter} / День {day} из {daysPerQuarter}",
    "header.goal": "Value {value}/{goal} · Доверие {trust}/{trustGoal}",
    "header.goalMet": "Цель закрыта",
    "header.quarterReviewTomorrow": "Ревью квартала завтра утром",
    "header.quarterReviewInDays": "Ревью квартала через {days} дн.",
    "header.morningLine": "Утренний разбор / Хвосты {count}",
    "header.releaseLine": "Релиз через {time} / Готово {done}",
    "header.trust": "Доверие {value}",
    "header.clients": "Клиенты {value}",
    "header.value": "Value {value}",
    "header.debt": "Долг {value}",
    "header.budget": "Бюджет {value}",
    "header.boost": "Буст {value}%",
    "header.stopped": "Остановлено",
    "header.paused": "Пауза",
    "header.resume": "Продолжить",
    "header.pause": "Пауза",
    "header.menu": "Меню",
    "header.language": "Язык",
    "footer.label": "Версия игры и сессия",
    "footer.version": "Версия {value}",
    "footer.commit": "Билд {value}",
    "footer.schema": "Сейв {value}",
    "footer.session": "Сессия {value}",
    "status.morning": "УТРО",
    "status.paused": "ПАУЗА",
    "status.running": "ИДЕТ",
    "status.won": "ПОБЕДА",
    "status.lost": "ПРОИГРЫШ",
    "run.stopped": "Игра остановилась",
    "victory.bannerTitle": "Год пережили",
    "victory.bannerText": "Оценка {grade} · Счёт {score}",
    "victory.kicker": "Годовой постмортем",
    "victory.title": "Вы пережили год",
    "victory.summary": "Оценка {grade}, счёт {score}.",
    "victory.newRun": "Новый забег",
    "victory.score": "Счёт {score}/100",
    "victory.peakDebt": "Пиковый долг {value}",
    "victory.burnout": "Бернаут {value}",
    "victory.releases": "Релизы",
    "victory.clean": "Чистые {value}",
    "victory.risky": "Рискованные {value}",
    "victory.dirty": "Грязные {value}",
    "victory.fallout": "Хвосты",
    "victory.falloutCreated": "Создано {value}",
    "victory.falloutResolved": "Закрыто {value}",
    "victory.unresolved": "Осталось {value}",
    "victory.misses": "Промахи",
    "victory.missedTasks": "Сорванные задачи {value}",
    "victory.missedOpportunities": "Упущенные возможности {value}",
    "victory.notes": "Заметки",
    "team.title": "Команда",
    "team.exhausted": "Выдохся",
    "team.onTask": "На {taskId}",
    "team.busy": "Занят",
    "team.available": "Свободен",
    "team.shock": "Шок {minutes}м",
    "team.stamina": "Стамина",
    "team.burnout": "Бернаут {value}",
    "characterRoles.analyst": "аналитик",
    "characterRoles.backend": "бэкенд",
    "characterRoles.frontend": "фронт",
    "characterRoles.qa": "QA",
    "characterRoles.sre": "SRE",
    "outsourcing.title": "Аутсорс",
    "outsourcing.role": "контрактор",
    "outsourcing.description": "Дорогой запасной способ закрыть недостающую компетенцию.",
    "outsourcing.optional": "Опционально {cost}",
    "outsourcing.important": "Важно {cost}",
    "outsourcing.critical": "Критично {cost}",
    "outsourcing.budget": "Бюджет команды {budget}",
    "columns.backlog": "Бэклог",
    "columns.inProgress": "В работе",
    "columns.done": "Готово",
    "columns.released": "Прод",
    "prodView.label": "Вид прода",
    "prodView.released": "Релизы",
    "prodView.unfinished": "Невыполненные",
    "inspector.title": "Выбранная задача",
    "inspector.empty": "Задача не выбрана.",
    "inspector.close": "Закрыть инспектор",
    "inspector.column": "Колонка {column}",
    "inspector.pressure": "Давление {value}",
    "inspector.complexity": "Сложность {value}",
    "inspector.value": "Value {value}",
    "inspector.clarity": "Понятность {value}",
    "inspector.quality": "Качество {value}",
    "inspector.qa": "QA {value}",
    "inspector.bugs": "Баги {value}",
    "inspector.impact": "Влияние {value}",
    "inspector.late": "Просрочка {time} / Value -{value}%",
    "inspector.queued": "В очереди на релиз. Вернуть в работу стоит Trust -{cost}.",
    "inspector.cancel": "Отменить задачу",
    "inspector.causedBy": "Спровоцировано задачей",
    "inspector.consequences": "Последствия",
    "inspector.missingSource": "Источник {id}",
    "inspector.postmortem": "Постмортем",
    "characterInspector.title": "Выбранный персонаж",
    "characterInspector.role": "Роль {value}",
    "characterInspector.status": "Статус {value}",
    "characterInspector.stamina": "Стамина {value}",
    "characterInspector.burnout": "Бернаут {value}",
    "characterInspector.currentTask": "Текущая задача",
    "characterInspector.idle": "Свободен для новой работы.",
    "work.character": "{name} работает",
    "work.outsource": "Аутсорс работает",
    "work.progress": "Прогресс",
    "log.title": "Лог событий",
    "debug.title": "Отладка",
    "debug.status": "Статус {value}",
    "debug.events": "События {value}",
    "debug.tasks": "Задачи {value}",
    "debug.save": "Сейв {value}",
    "debug.commit": "Коммит {value}",
    "debug.session": "Сессия {value}",
    "debug.copy": "Скопировать snapshot",
    "debug.autosave": "Автосейв использует {key}. Снимок пишется в {path}.",
    "debug.stopReason": "Причина остановки: {reason}",
    "morning.title": "Утренний разбор",
    "morning.empty": "Вчера ничего не уехало и не сгорело. Работа продолжается с текущего бэклога.",
    "morning.summary": "{shipped} уехало, {missed} пропущено, {expired} возможностей упущено. Сегодняшний бэклог учитывает последствия.",
    "morning.startDay": "Начать день",
    "morning.clean": "Чисто {value}",
    "morning.risky": "Риск {value}",
    "morning.dirty": "Грязно {value}",
    "morning.missed": "Пропущено {value}",
    "morning.opportunities": "Возможности -{value} / Долг +{debt}",
    "morning.fallout": "Хвосты +{value}",
    "morning.unresolved": "Нерешено {value}",
    "morning.consequences": "Последствия",
    "morning.noFallout": "Сегодня утром нет видимых последствий релиза или пропущенной работы.",
    "morning.shipments": "Вчерашние релизы",
    "morning.noShipments": "Перед релизом в колонке Готово не было карточек.",
    "morning.runStopped": "Игра остановилась после релиза. Начни новую игру из хедера.",
    "quarterReview.title": "Ревью квартала {quarter}",
    "quarterReview.met": "Цели закрыты",
    "quarterReview.missed": "Цели не закрыты",
    "quarterReview.valueMet": "Value {actual}/{target} закрыт",
    "quarterReview.valueMissed": "Value {actual}/{target} не закрыт",
    "quarterReview.trustMet": "Доверие {actual}/{target} закрыто",
    "quarterReview.trustMissed": "Доверие {actual}/{target} не закрыто",
    "quarterReview.effect": "Эффект квартала",
    "releaseMetric.from": "{delta} от {before}",
    "task.impact": "Влияние {value}",
    "task.neededRoles": "Нужные роли",
    "task.deadline": "Дедлайн",
    "task.opportunity": "Возможность",
    "task.reopenCost": "Вернуть в работу: Trust -{cost}",
    "task.outsource": "Аутсорс",
    "task.lateChip": "Просрочка -{value}%",
    "subtasks.title": "Подзадачи",
    "subtasks.unknown": "Скрытая работа",
    "subtasks.analysisNeeded": "нужен анализ",
    "subtasks.unknownImportance": "скрыто",
    "readiness.noRisks": "Видимых рисков релиза нет",
    "loss.title": "Почему ты проиграл",
    "loss.recentMisses": "Недавние пропуски",
    "loss.badReleases": "Плохие релизы",
    "loss.read": "Что делать",
  },
};

const TASK_KIND_LABELS: Record<Locale, Record<LocalizedTaskKind, string>> = {
  en: {
    feature: "feature",
    bug: "bug",
    techDebt: "tech debt",
    integration: "integration",
    incident: "incident",
    performance: "performance",
    compliance: "compliance",
  },
  ru: {
    feature: "фича",
    bug: "баг",
    techDebt: "техдолг",
    integration: "интеграция",
    incident: "инцидент",
    performance: "производительность",
    compliance: "комплаенс",
  },
};

const ROLE_LABELS: Record<Locale, Record<LocalizedSubtaskRole, string>> = {
  en: {
    backend: "backend",
    frontend: "frontend",
    design: "design",
    qa: "qa",
    sre: "sre",
    bugfix: "bugfix",
  },
  ru: {
    backend: "бэк",
    frontend: "фронт",
    design: "дизайн",
    qa: "qa",
    sre: "sre",
    bugfix: "багфикс",
  },
};

const IMPORTANCE_LABELS: Record<Locale, Record<LocalizedImportance, string>> = {
  en: { critical: "critical", important: "important", optional: "optional" },
  ru: { critical: "критично", important: "важно", optional: "опционально" },
};

const BLAST_RADIUS_LABELS: Record<Locale, Record<LocalizedBlastRadius, string>> = {
  en: { high: "High", medium: "Medium", low: "Low" },
  ru: { high: "Высокое", medium: "Среднее", low: "Низкое" },
};

const READINESS_LABELS: Record<Locale, Record<LocalizedReadiness, string>> = {
  en: { clean: "Clean", risky: "Risky", dirty: "Dirty" },
  ru: { clean: "Чисто", risky: "Риск", dirty: "Грязно" },
};

const EXACT_TEXTS: Record<Locale, Record<string, string>> = {
  en: {},
  ru: {
    "Waiting in backlog.": "Ждет в бэклоге.",
    "Ready for analysis, implementation, or QA.": "Готово к анализу, реализации или QA.",
    "Queued for the daily release train.": "В очереди на дневной релиз.",
    "Strong release. Customers got what they needed.": "Сильный релиз. Клиенты получили то, что им нужно.",
    "Acceptable release. Some rough edges remain.": "Нормальный релиз. Остались шероховатости.",
    "Risky release. Support will feel this.": "Рискованный релиз. Поддержка это почувствует.",
    "Bad release. Customers are frustrated.": "Плохой релиз. Клиенты недовольны.",
    "Pulled back from Done for rework.": "Возвращено из Готово на доработку.",
    "Committed after opportunity decay.": "Задача взята в работу после потери части ценности.",
    "Committed to delivery. Deadline started.": "Задача взята в работу. Дедлайн стартовал.",
    "Opportunity expired in backlog.": "Возможность истекла в бэклоге.",
    "Task is already committed to delivery.": "Задача уже взята в работу.",
    "Work was interrupted.": "Работа была прервана.",
    "QA pass complete.": "QA-проход завершен.",
    "Task is already in work.": "Задача уже в работе.",
    "Task is already released.": "Задача уже зарелизена.",
    "Task is no longer on the board.": "Задачи больше нет на доске.",
    "Move task to In Progress first.": "Сначала перенеси задачу в работу.",
    "Needs analysis first: no visible open work.": "Сначала нужен анализ: нет видимой открытой работы.",
    "No visible open work for outsourcing.": "Нет видимой открытой работы для аутсорса.",
    "known work": "видимая работа",
    "no business effects": "нет бизнес-эффектов",
    "business effects pending": "бизнес-эффекты позже",
    "deadline locked": "дедлайн зафиксирован",
    "deadline resumes": "дедлайн снова идет",
    "deadline started": "дедлайн стартовал",
    "full value preserved": "полная ценность сохранена",
    "debt cap reached": "лимит долга достигнут",
    "QA recheck required": "нужна перепроверка QA",
    "SRE blast radius reduced": "SRE снизил влияние поломки",
    "no SRE safety": "нет SRE-защиты",
    "Implementation changed after QA, so prior test coverage became stale.":
      "Реализацию меняли после QA, поэтому старое тестовое покрытие устарело.",
    "Analysis was incomplete; some work was never discovered.":
      "Анализ не был завершен: часть работы так и не открыли.",
    "QA coverage was low.": "QA-покрытие было низким.",
    "SRE safety was missing, so blast radius was higher.":
      "SRE-защиты не было, поэтому влияние поломки было выше.",
    "Some prior work carried forward as context.": "Часть предыдущей работы перешла как контекст.",
    "blocked until tomorrow": "заблокирован до завтра",
    "context shock 20m": "контекстный шок 20м",
    "stage progress -8": "прогресс этапа -8",
    "chain terminated": "цепочка закрыта",
    "minor hit": "малый удар",
    "backlog full": "бэклог заполнен",
    "terminal": "терминал",
    "hit": "удар",
    "blocked": "заблокировано",
    "clean release": "чистый релиз",
    "risky release": "рискованный релиз",
    "dirty release": "грязный релиз",
    "critical": "критично",
    "important": "важно",
    "optional": "опционально",
    "on-role": "по роли",
    "off-role": "не по роли",
  },
};

const RISK_REASON_LABELS: Record<Locale, Record<string, string>> = {
  en: {
    no_qa: "No QA pass",
    no_sre: "SRE safety missing",
    known_bug: "Known bugs",
    low_clarity: "Low clarity",
    critical_open: "Critical work open",
    important_open: "Important work open",
    blast_radius_high: "High impact area",
    blast_radius_uncovered: "High impact not protected",
    changed_after_qa: "Changed after QA",
    not_implemented: "Implementation incomplete",
  },
  ru: {
    no_qa: "Нет QA-прохода",
    no_sre: "Нет SRE-защиты",
    known_bug: "Известные баги",
    low_clarity: "Низкая понятность",
    critical_open: "Открыта критичная работа",
    important_open: "Открыта важная работа",
    blast_radius_high: "Высокое влияние",
    blast_radius_uncovered: "Высокое влияние не закрыто",
    changed_after_qa: "Меняли после QA",
    not_implemented: "Реализация не закончена",
  },
};

const CONSEQUENCE_CAUSE_LABELS: Record<Locale, Record<string, string>> = {
  en: {
    known_bug: "known bugs",
    changed_after_qa: "changes after QA",
    no_qa: "no QA pass",
    no_sre: "missing SRE safety",
    critical_open: "open critical work",
    important_open: "open important work",
    low_clarity: "low clarity",
    deadline_pressure: "deadline pressure",
    ignored_work: "ignored work",
    missed_deadline: "missed deadline",
    terminal_chain: "terminal fallout",
  },
  ru: {
    known_bug: "известные баги",
    changed_after_qa: "изменения после QA",
    no_qa: "нет QA-прохода",
    no_sre: "нет SRE-защиты",
    critical_open: "открытая критичная работа",
    important_open: "открытая важная работа",
    low_clarity: "низкая понятность",
    deadline_pressure: "давление дедлайна",
    ignored_work: "проигнорированная работа",
    missed_deadline: "сорванный дедлайн",
    terminal_chain: "финальное последствие",
  },
};

const taskTitleMap = buildBidirectionalMap(TASK_TITLES);
const subtaskTitleMap = buildBidirectionalMap({
  en: Object.values(SIM_TEXT.en.subtasks),
  ru: Object.values(SIM_TEXT.ru.subtasks),
});

export function normalizeLocale(value: unknown): Locale {
  return value === "ru" || value === "en" ? value : DEFAULT_LOCALE;
}

export function t(
  locale: Locale,
  key: string,
  values: Record<string, string | number> = {},
): string {
  const template = UI[locale][key] ?? UI.en[key] ?? key;
  return formatTemplate(template, values);
}

export function labelTaskKind(locale: Locale, kind: LocalizedTaskKind): string {
  return TASK_KIND_LABELS[locale][kind] ?? kind;
}

export function labelRole(locale: Locale, role: LocalizedSubtaskRole): string {
  return ROLE_LABELS[locale][role] ?? role;
}

export function labelImportance(locale: Locale, importance: LocalizedImportance): string {
  return IMPORTANCE_LABELS[locale][importance] ?? importance;
}

export function labelBlastRadius(locale: Locale, value: LocalizedBlastRadius): string {
  return BLAST_RADIUS_LABELS[locale][value] ?? value;
}

export function labelReadiness(locale: Locale, readiness: LocalizedReadiness): string {
  return READINESS_LABELS[locale][readiness] ?? readiness;
}

export function labelRiskReason(locale: Locale, reason: string): string {
  return RISK_REASON_LABELS[locale][reason] ?? RISK_REASON_LABELS.en[reason] ?? reason;
}

export function labelConsequenceCause(locale: Locale, cause: string): string {
  return CONSEQUENCE_CAUSE_LABELS[locale][cause] ?? CONSEQUENCE_CAUSE_LABELS.en[cause] ?? cause;
}

export function localizeTaskTitle(raw: string, locale: Locale): string {
  const match = raw.match(/^([A-Z]+-\d+):\s(.+)$/);
  if (!match) return localizeText(raw, locale);
  const [, id, title] = match;
  const translated = translateKnownText(title, locale, taskTitleMap);
  return `${id}: ${translated === title ? localizeText(title, locale) : translated}`;
}

export function localizeTaskName(raw: string, locale: Locale): string {
  const withoutId = raw.replace(/^[A-Z]+-\d+:\s/, "");
  const translated = translateKnownText(withoutId, locale, taskTitleMap);
  return translated === withoutId ? localizeText(withoutId, locale) : translated;
}

export function localizeSubtaskTitle(raw: string, locale: Locale): string {
  const translated = translateKnownText(raw, locale, subtaskTitleMap);
  if (translated !== raw) return translated;

  const fixMatch = raw.match(/^Fix (backend|frontend|sre|design) defect found by QA$/);
  if (fixMatch) {
    const role = labelRole(locale, fixMatch[1] as LocalizedSubtaskRole);
    return locale === "ru" ? `Починить ${role}-дефект, найденный QA` : raw;
  }
  return raw;
}

export function localizeText(raw: string | null | undefined, locale: Locale): string {
  if (!raw) return "";
  const exact = EXACT_TEXTS[locale][raw];
  if (exact) return exact;

  const mappedTaskTitle = localizeMaybeTaskTitle(raw, locale);
  if (mappedTaskTitle !== raw) return mappedTaskTitle;

  if (locale === "en") return raw;

  const replacements: Array<[RegExp, (...groups: string[]) => string]> = [
    [/^Goal (?<value>\d+)\/(?<goal>\d+)$/, (_all, value, goal) => `Цель ${value}/${goal}`],
    [/^Release in (?<time>.+) \/ Done (?<done>\d+)$/, (_all, time, done) => `Релиз через ${time} / Done ${done}`],
    [/^Queued late for release\. Value reduced by (?<value>\d+)%\.$/, (_all, value) => `В очереди на релиз с просрочкой. Value снижено на ${value}%.`],
    [/^Release missed the business window by (?<time>.+), reducing value by (?<value>\d+)%\.$/, (_all, time, value) => `Релиз опоздал на ${localizeCompactTime(time)}, поэтому value снижено на ${value}%.`],
    [/^(?<count>\d+) important subtask\(s\) were still open\.$/, (_all, count) => `Осталось важных подзадач: ${count}.`],
    [/^(?<count>\d+) critical subtask\(s\) were still open\.$/, (_all, count) => `Осталось критичных подзадач: ${count}.`],
    [/^(?<count>\d+) known bug\(s\) shipped\.$/, (_all, count) => `В релиз уехало известных багов: ${count}.`],
    [/^Analysis complete\. Revealed (?<count>\d+) subtask\(s\)\.$/, (_all, count) => `Анализ завершен. Открыто подзадач: ${count}.`],
    [/^Analysis complete\. No new subtasks found\.$/, () => "Анализ завершен. Новых подзадач нет."],
    [/^QA converted (?<count>\d+) bug\(s\) into rework\.$/, (_all, count) => `QA превратил баги в доработки: ${count}.`],
    [/^(?<role>\w+) subtask complete\. (?<count>\d+) bug\(s\) appeared\.$/, (_all, role, count) => `${labelRole(locale, role as LocalizedSubtaskRole)}-подзадача завершена. Появилось багов: ${count}.`],
    [/^(?<role>\w+) subtask complete\.$/, (_all, role) => `${labelRole(locale, role as LocalizedSubtaskRole)}-подзадача завершена.`],
    [/^Outsourcing completed (?<role>\w+) work\.$/, (_all, role) => `Аутсорс завершил ${labelRole(locale, role as LocalizedSubtaskRole)}-работу.`],
    [/^Outsource is working on (?<role>\w+): (?<title>.+)\.$/, (_all, role, title) => `Аутсорс делает ${labelRole(locale, role as LocalizedSubtaskRole)}: ${localizeSubtaskTitle(title, locale)}.`],
    [/^The team survived the production year with grade (?<grade>[A-D])\.$/, (_all, grade) => `Команда пережила production-год с оценкой ${grade}.`],
    [/^Grade (?<grade>[A-D]) reflects the state of the product after day 80\.$/, (_all, grade) => `Оценка ${grade} отражает состояние продукта после 80-го дня.`],
    [/^Debt stayed high; the team survived, but future work is fragile\.$/, () => "Долг остался высоким: команда выжила, но будущая работа хрупкая."],
    [/^(?<count>\d+) fallout task\(s\) remained unresolved\.$/, (_all, count) => `Нерешенных хвостов осталось: ${count}.`],
    [/^The team carried noticeable burnout into the next year\.$/, () => "Команда вошла в следующий год с заметным бернаутом."],
    [/^The year ended in stable shape\.$/, () => "Год закончился в стабильном состоянии."],
    [/^(?<name>.+) is exhausted and cannot continue today\.$/, (_all, name) => `${name} выдохся и сегодня больше не может продолжать.`],
    [/^Missed work resolved as (?<resolution>.+)\.$/, (_all, resolution) => `Пропущенная работа закрыта как ${resolution}.`],
    [/^Cause: (?<cause>.+)\.$/, (_all, cause) => `Причина: ${translateCauseText(cause, locale)}.`],
    [/^Caused by yesterday's (?<id>[A-Z]+-\d+): (?<cause>.+)\.$/, (_all, id, cause) => `Спровоцировано вчерашней ${id}: ${translateCauseText(cause, locale)}.`],
    [/^(?<area>.+): (?<failure>.+) after (?<id>[A-Z]+-\d+)$/, (_all, area, failure, id) => `${translateConsequenceArea(area)}: ${translateConsequenceFailure(failure)} после ${id}`],
    [/^(?<area>.+): (?<failure>known bug is still visible|regressed after untested late changes|started failing without QA coverage|created production instability|does not match the business request|broke after unfinished release work)$/, (_all, area, failure) => `${translateConsequenceArea(area)}: ${translateConsequenceFailure(failure)}`],
    [/^(?<area>.+): escalation after unfinished work on (?<id>[A-Z]+-\d+)$/, (_all, area, id) => `${translateConsequenceArea(area)}: эскалация после незавершенной работы по ${id}`],
    [/^(?<area>.+): escalation after unfinished work$/, (_all, area) => `${translateConsequenceArea(area)}: эскалация после незавершенной работы`],
    [/^(?<area>.+): escalation after (?<id>[A-Z]+-\d+) missed release$/, (_all, area, id) => `${translateConsequenceArea(area)}: эскалация после сорванного релиза ${id}`],
    [/^(?<area>.+): missed commitment escalated$/, (_all, area) => `${translateConsequenceArea(area)}: эскалация сорванного обязательства`],
    [/^(?<area>.+): small slip after (?<id>[A-Z]+-\d+)$/, (_all, area, id) => `${translateConsequenceArea(area)}: небольшой срыв после ${id}`],
    [/^(?<area>.+): small slip$/, (_all, area) => `${translateConsequenceArea(area)}: небольшой срыв`],
  ];

  return applyRegexReplacements(raw, replacements);
}

export function localizeEffect(raw: string, locale: Locale): string {
  const exact = EXACT_TEXTS[locale][raw];
  if (exact) return exact;
  if (locale === "en") return raw;

  const replacements: Array<[RegExp, (...groups: string[]) => string]> = [
    [/^(value|budget|trust|clients|debt|boost) ([+-]\d+)$/, (_all, key, value) => `${metricLabel(locale, key)} ${value}`],
    [/^deadline (?<seconds>\d+)s$/, (_all, seconds) => `дедлайн ${seconds}с`],
    [/^clarity (?<value>[+-]?\d+)$/, (_all, value) => `понятность ${value}`],
    [/^quality (?<value>\d+)$/, (_all, value) => `качество ${value}`],
    [/^bugs (?<value>[+-]?\d+)$/, (_all, value) => `баги ${value}`],
    [/^bugs left (?<value>\d+)$/, (_all, value) => `багов осталось ${value}`],
    [/^found \+(?<value>\d+)$/, (_all, value) => `найдено +${value}`],
    [/^rework \+(?<value>\d+)$/, (_all, value) => `доработки +${value}`],
    [/^qa \+(?<value>\d+)$/, (_all, value) => `qa +${value}`],
    [/^revealed (?<role>\w+)$/, (_all, role) => `открыто ${labelRole(locale, role as LocalizedSubtaskRole)}`],
    [/^subtask (?<role>\w+)$/, (_all, role) => `подзадача ${labelRole(locale, role as LocalizedSubtaskRole)}`],
    [/^source (?<id>[A-Z]+-\d+)$/, (_all, id) => `источник ${id}`],
    [/^root (?<id>[A-Z]+-\d+)$/, (_all, id) => `корень ${id}`],
    [/^task (?<id>[A-Z]+-\d+)$/, (_all, id) => `задача ${id}`],
    [/^created (?<id>[A-Z]+-\d+)$/, (_all, id) => `создано ${id}`],
    [/^cause (?<cause>.+)$/, (_all, cause) => `причина ${translateCauseText(cause, locale)}`],
    [/^depth (?<value>.+)$/, (_all, value) => `глубина ${value}`],
    [/^late value -(?<value>\d+)%$/, (_all, value) => `просрочка value -${value}%`],
    [/^consequences (?<value>\d+)$/, (_all, value) => `последствия ${value}`],
    [/^unresolved fallout (?<value>\d+)$/, (_all, value) => `нерешенные хвосты ${value}`],
    [/^clean (?<value>\d+)$/, (_all, value) => `clean ${value}`],
    [/^risky (?<value>\d+)$/, (_all, value) => `risky ${value}`],
    [/^dirty (?<value>\d+)$/, (_all, value) => `dirty ${value}`],
    [/^missed backlog (?<value>\d+)$/, (_all, value) => `пропущено в бэклоге ${value}`],
    [/^missed progress (?<value>\d+)$/, (_all, value) => `пропущено в работе ${value}`],
    [/^fallout \+(?<value>\d+)$/, (_all, value) => `хвосты +${value}`],
    [/^resolved (?<value>\d+)$/, (_all, value) => `закрыто ${value}`],
    [/^unresolved (?<value>\d+)$/, (_all, value) => `нерешено ${value}`],
    [/^terminal (?<value>\d+)$/, (_all, value) => `терминал ${value}`],
  ];

  return applyRegexReplacements(raw, replacements);
}

export function localizeEventTitle(raw: string, locale: Locale): string {
  const taskTitle = localizeMaybeTaskTitle(raw, locale);
  if (taskTitle !== raw) return taskTitle;
  if (locale === "en") return raw;

  const replacements: Array<[RegExp, (...groups: string[]) => string]> = [
    [/^Run started$/, () => "Игра началась"],
    [/^(?<id>[A-Z]+-\d+) arrived$/, (_all, id) => `${id} появилась`],
    [/^(?<id>[A-Z]+-\d+) queued$/, (_all, id) => `${id} в очереди на релиз`],
    [/^(?<id>[A-Z]+-\d+) released$/, (_all, id) => `${id} зарелизена`],
    [/^(?<id>[A-Z]+-\d+) reopened$/, (_all, id) => `${id} возвращена в работу`],
    [/^(?<id>[A-Z]+-\d+) interrupted$/, (_all, id) => `${id} прервана`],
    [/^(?<id>[A-Z]+-\d+) clarified$/, (_all, id) => `${id} прояснена`],
    [/^(?<name>.+) started (?<id>[A-Z]+-\d+)$/, (_all, name, id) => `${name} начал(а) ${id}`],
    [/^(?<id>[A-Z]+-\d+) (?<role>\w+) done$/, (_all, id, role) => `${id}: ${labelRole(locale, role as LocalizedSubtaskRole)} готово`],
    [/^(?<id>[A-Z]+-\d+) (?<role>\w+) bugfix done$/, (_all, id, role) => `${id}: ${labelRole(locale, role as LocalizedSubtaskRole)} багфикс готов`],
    [/^(?<id>[A-Z]+-\d+) QA pass done$/, (_all, id) => `${id}: QA-проход готов`],
    [/^(?<id>[A-Z]+-\d+) outsourced$/, (_all, id) => `${id}: аутсорс`],
    [/^Release train departed empty$/, () => "Release train ушел пустым"],
    [/^Release train shipped (?<count>\d+)$/, (_all, count) => `Release train увез задач: ${count}`],
    [/^Day (?<day>\d+) summary$/, (_all, day) => `Итог дня ${day}`],
    [/^Morning briefing Day (?<day>\d+)$/, (_all, day) => `Утренний разбор дня ${day}`],
    [/^(?<id>[A-Z]+-\d+) caused (?<tail>[A-Z]+-\d+)$/, (_all, id, tail) => `${id} породила ${tail}`],
    [/^(?<id>[A-Z]+-\d+) missed$/, (_all, id) => `${id} пропущена`],
    [/^(?<id>[A-Z]+-\d+) chain closed$/, (_all, id) => `${id}: цепочка закрыта`],
    [/^Quarter (?<quarter>\d+) review$/, (_all, quarter) => `Ревью квартала ${quarter}`],
    [/^Run lost$/, () => "Игра проиграна"],
    [/^Run won$/, () => "Год пережили"],
  ];

  return applyRegexReplacements(raw, replacements);
}

export function localizeEventBody(raw: string, locale: Locale): string {
  const text = localizeText(raw, locale);
  if (text !== raw || locale === "en") return text;

  const replacements: Array<[RegExp, (...groups: string[]) => string]> = [
    [/^(?<title>[A-Z]+-\d+: .+) will ship with the daily release train\.$/, (_all, title) => `${localizeTaskTitle(title, locale)} уедет дневным релизом.`],
    [/^(?<title>[A-Z]+-\d+: .+) was pulled back from the release queue\.$/, (_all, title) => `${localizeTaskTitle(title, locale)} вернули из очереди релиза.`],
    [/^(?<name>.+) was pulled off the task\.$/, (_all, name) => `${name} снят(а) с задачи.`],
    [/^(?<name>.+) improved task clarity\.$/, (_all, name) => `${name} повысил(а) понятность задачи.`],
    [/^(?<name>.+) completed (?<subtask>.+)\.$/, (_all, name, subtask) => `${name} завершил(а): ${localizeSubtaskTitle(subtask, locale)}.`],
    [/^(?<name>.+) found no blocking bugs\.$/, (_all, name) => `${name} не нашел(ла) блокирующих багов.`],
    [/^(?<name>.+) triaged (?<count>\d+) bug\(s\) into rework\.$/, (_all, name, count) => `${name} превратил(а) баги в доработки: ${count}.`],
    [/^External contractor started (?<subtask>.+)\.$/, (_all, subtask) => `Контрактор начал: ${localizeSubtaskTitle(subtask, locale)}.`],
    [/^External contractor completed (?<subtask>.+)\.$/, (_all, subtask) => `Контрактор завершил: ${localizeSubtaskTitle(subtask, locale)}.`],
    [/^(?<count>\d+) task\(s\) moved from Done to Released\.$/, (_all, count) => `Задач переехало из Done в Released: ${count}.`],
    [/^No tasks were queued in Done\.$/, () => "В Готово не было задач для релиза."],
    [/^(?<shipped>\d+) shipped, (?<missed>\d+) missed, (?<unresolved>\d+) unresolved fallout\.$/, (_all, shipped, missed, unresolved) => `${shipped} уехало, ${missed} пропущено, нерешенных хвостов: ${unresolved}.`],
  ];

  return applyRegexReplacements(raw, replacements);
}

export function localizeLossHeadline(raw: string, locale: Locale): string {
  if (locale === "en") return raw;
  return (
    {
      "Business trust hit zero.": "Доверие бизнеса упало до нуля.",
      "Customers left the product.": "Клиенты ушли из продукта.",
      "Technical debt overwhelmed the product.": "Технический долг задавил продукт.",
    }[raw] ?? raw
  );
}

export function localizeLossSuggestion(raw: string, locale: Locale): string {
  if (locale === "en") return raw;
  return (
    {
      "Do more Analysis, assign QA in To Do, and fix bugfix subtasks before moving cards to Done.":
        "Делай больше анализа, назначай QA и закрывай багфикс-подзадачи перед переносом в Готово.",
      "Watch the deadline bars. Releasing late or low-quality work will drain trust.":
        "Следи за дедлайнами. Поздние или низкокачественные релизы будут сливать доверие.",
    }[raw] ?? raw
  );
}

export function localizeLossExplanation(raw: string, locale: Locale): string {
  if (locale === "en") return raw;
  return raw
    .replace(/^Trust fell to 0\./, "Доверие упало до 0.")
    .replace(/^Clients fell to 0\./, "Клиенты упали до 0.")
    .replace(/^Debt reached 100\./, "Долг дошел до 100.")
    .replace("Recent low-quality releases and missed work made customers leave.", "Недавние некачественные релизы и пропущенная работа заставили клиентов уйти.")
    .replace("Recent releases shipped with too much risk, bugs, or unfinished work.", "Недавние релизы уехали со слишком большим риском, багами или незакрытой работой.")
    .replace(/The latest run had (\d+) recent release\(s\) that hurt trust or clients\./, "В последнем ране было недавних релизов, ударивших по доверию или клиентам: $1.");
}

function localizeMaybeTaskTitle(raw: string, locale: Locale): string {
  const match = raw.match(/^([A-Z]+-\d+):\s(.+)$/);
  if (!match) return raw;
  const [, id, title] = match;
  return `${id}: ${translateKnownText(title, locale, taskTitleMap)}`;
}

function translateCauseText(raw: string, locale: Locale): string {
  const causeMap = {
    "known bugs": "known_bug",
    "changes after QA": "changed_after_qa",
    "no QA pass": "no_qa",
    "missing SRE safety": "no_sre",
    "open critical work": "critical_open",
    "open important work": "important_open",
    "low clarity": "low_clarity",
    "deadline pressure": "deadline_pressure",
    "ignored work": "ignored_work",
    "missed deadline": "missed_deadline",
    "terminal fallout": "terminal_chain",
  } as const;
  const key = causeMap[raw as keyof typeof causeMap];
  return key ? labelConsequenceCause(locale, key) : raw;
}

function metricLabel(locale: Locale, key: string): string {
  if (locale === "en") return key;
  return (
    {
      value: "value",
      budget: "бюджет",
      trust: "доверие",
      clients: "клиенты",
      debt: "долг",
      boost: "буст",
    }[key] ?? key
  );
}

function localizeCompactTime(raw: string): string {
  return raw.replace(/(\d+)h/g, "$1ч").replace(/(\d+)m/g, "$1м");
}

function translateConsequenceArea(area: string): string {
  return (
    {
      "Partner payouts": "Партнерские выплаты",
      "Partner login": "Партнерский логин",
      "Admin workflow": "Админский сценарий",
      "Search results": "Результаты поиска",
      "Partner report export": "Экспорт партнерского отчета",
      "Customer notifications": "Клиентские уведомления",
      "Partner commitment": "Партнерское обязательство",
      "Login commitment": "Обязательство по логину",
      "Admin team request": "Запрос admin-команды",
      "Search request": "Запрос поиска",
      "Reporting request": "Запрос отчетности",
      "Notification request": "Запрос уведомлений",
    }[area] ?? area
  );
}

function translateConsequenceFailure(failure: string): string {
  return (
    {
      "known bug is still visible": "известный баг все еще виден",
      "regressed after untested late changes": "сломалось после непроверенных поздних изменений",
      "started failing without QA coverage": "начало падать без QA-покрытия",
      "created production instability": "создало production-нестабильность",
      "does not match the business request": "не совпадает с бизнес-запросом",
      "broke after unfinished release work": "сломалось после незавершенной релизной работы",
    }[failure] ?? failure
  );
}

function formatTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : `{${key}}`,
  );
}

function applyRegexReplacements(
  raw: string,
  replacements: Array<[RegExp, (...groups: string[]) => string]>,
): string {
  for (const [pattern, format] of replacements) {
    const match = raw.match(pattern);
    if (match) return format(...match);
  }
  return raw;
}

function translateKnownText(
  raw: string,
  locale: Locale,
  map: Map<string, Record<Locale, string>>,
): string {
  return map.get(raw)?.[locale] ?? raw;
}

function buildBidirectionalMap(
  values: Record<Locale, Record<string, string[]> | string[]>,
): Map<string, Record<Locale, string>> {
  const map = new Map<string, Record<Locale, string>>();
  const enValues = flattenLocalizedValues(values.en);
  const ruValues = flattenLocalizedValues(values.ru);
  for (let index = 0; index < Math.min(enValues.length, ruValues.length); index += 1) {
    const record = { en: enValues[index], ru: ruValues[index] };
    map.set(record.en, record);
    map.set(record.ru, record);
  }
  return map;
}

function flattenLocalizedValues(value: Record<string, string[]> | string[]): string[] {
  return Array.isArray(value) ? value : Object.values(value).flat();
}
