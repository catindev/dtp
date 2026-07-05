import type { EngineLocale } from "../locale";
import type {
  RtNarrativeBranchId,
  RtNarrativeLayer,
  RtTaskDomain,
  RtTaskKind,
} from "../types";

export interface TaskNarrativeText {
  headline: string;
  problem: string;
  stakes: string;
  failurePreview: string;
}

export interface TaskNarrativeFlavorText {
  aside?: string;
  extraDetail?: string;
}

export interface TaskNarrativeBranch {
  id: RtNarrativeBranchId;
  layer: RtNarrativeLayer;
  core: Record<EngineLocale, TaskNarrativeText>;
  flavor?: Record<EngineLocale, TaskNarrativeFlavorText>;
}

export interface TaskNarrativeVariable {
  values: Record<string, Record<EngineLocale, string>>;
}

export interface TaskNarrativeArchetype {
  id: string;
  kind: RtTaskKind;
  domains?: readonly RtTaskDomain[];
  weight?: number;
  tags: string[];
  meaning: string[];
  variables: Record<string, TaskNarrativeVariable>;
  branches: Record<RtNarrativeBranchId, TaskNarrativeBranch>;
}

export const DOMAIN_AREA_VALUES: Record<RtTaskDomain, Record<EngineLocale, string>> = {
  payments: {
    en: "partner payouts",
    ru: "партнерские выплаты",
  },
  auth: {
    en: "login flow",
    ru: "логин",
  },
  admin: {
    en: "admin workflow",
    ru: "админский сценарий",
  },
  search: {
    en: "search results",
    ru: "поиск",
  },
  reports: {
    en: "report export",
    ru: "экспорт отчетов",
  },
  notifications: {
    en: "customer notifications",
    ru: "уведомления клиентов",
  },
};

export const FALLOUT_CAUSE_VALUES: Record<string, Record<EngineLocale, string>> = {
  known_bug: {
    en: "known bugs",
    ru: "известных багов",
  },
  changed_after_qa: {
    en: "changes after QA",
    ru: "изменений после QA",
  },
  no_qa: {
    en: "no QA pass",
    ru: "отсутствия QA-прохода",
  },
  no_sre: {
    en: "missing SRE safety",
    ru: "отсутствия SRE-защиты",
  },
  critical_open: {
    en: "open critical work",
    ru: "открытой критичной работы",
  },
  important_open: {
    en: "open important work",
    ru: "открытой важной работы",
  },
  low_clarity: {
    en: "low clarity",
    ru: "низкой понятности",
  },
  missed_deadline: {
    en: "missed deadline",
    ru: "сорванного дедлайна",
  },
  ignored_work: {
    en: "ignored work",
    ru: "проигнорированной работы",
  },
  terminal_chain: {
    en: "terminal fallout",
    ru: "завершенного хвоста",
  },
};

const areaVariable: TaskNarrativeVariable = {
  values: DOMAIN_AREA_VALUES,
};

const causeVariable: TaskNarrativeVariable = {
  values: FALLOUT_CAUSE_VALUES,
};

export const TASK_NARRATIVE_ARCHETYPES: Record<string, TaskNarrativeArchetype> = {
  "core.feature.workflow": {
    id: "core.feature.workflow",
    kind: "feature",
    tags: ["core", "delivery", "value"],
    meaning: [
      "Business wants a visible improvement.",
      "The work should create value if shipped cleanly.",
      "Ignoring or rushing it can disappoint users.",
    ],
    variables: { area: areaVariable },
    branches: {
      default: {
        id: "default",
        layer: "core",
        core: {
          en: {
            headline: "Improve {area} workflow",
            problem: "Business users want the {area} to handle a new daily case.",
            stakes: "A clean release adds product value and keeps trust stable.",
            failurePreview: "A rushed release can confuse users and create follow-up work.",
          },
          ru: {
            headline: "Улучшить {area}",
            problem: "Бизнесу нужно, чтобы {area} закрывал новый ежедневный сценарий.",
            stakes: "Чистый релиз добавит ценность продукту и сохранит доверие.",
            failurePreview: "Поспешный релиз может запутать пользователей и породить хвосты.",
          },
        },
        flavor: {
          en: {
            aside: "The request came after someone asked why a spreadsheet still knew more than the product.",
          },
          ru: {
            aside: "Запрос пришел после вопроса, почему таблица по-прежнему знает больше продукта.",
          },
        },
      },
    },
  },
  "core.feature.saved-view": {
    id: "core.feature.saved-view",
    kind: "feature",
    tags: ["core", "delivery", "workflow"],
    meaning: [
      "Business wants a small workflow improvement.",
      "The task is valuable when the user-facing path is clear.",
      "It can become waste if shipped without enough clarity or QA.",
    ],
    variables: { area: areaVariable },
    branches: {
      default: {
        id: "default",
        layer: "core",
        core: {
          en: {
            headline: "Add a saved view for {area}",
            problem: "A team keeps repeating the same setup in the {area} and wants it saved.",
            stakes: "Clean delivery saves time for real users and adds product value.",
            failurePreview: "If the flow is unclear, users get another confusing switch instead of relief.",
          },
          ru: {
            headline: "Добавить сохраненный вид для зоны: {area}",
            problem: "Команда каждый день повторяет одну настройку в зоне: {area}, и просит ее сохранять.",
            stakes: "Чистая поставка экономит время реальным пользователям и добавляет ценность.",
            failurePreview: "Если сценарий непонятен, пользователи получат не облегчение, а еще один мутный переключатель.",
          },
        },
        flavor: {
          en: {
            aside: "Support can reproduce it with two clicks and a resigned look.",
          },
          ru: {
            aside: "Поддержка воспроизводит это в два клика и с обреченным видом.",
          },
        },
      },
    },
  },
  "core.bug.visible": {
    id: "core.bug.visible",
    kind: "bug",
    tags: ["core", "defect", "quality"],
    meaning: [
      "A visible defect already exists.",
      "Fixing it protects trust and reduces future noise.",
      "Shipping without QA risks another defect.",
    ],
    variables: { area: areaVariable },
    branches: {
      default: {
        id: "default",
        layer: "core",
        core: {
          en: {
            headline: "Fix broken {area}",
            problem: "Users hit a broken path in the {area}.",
            stakes: "A verified fix prevents repeated support noise.",
            failurePreview: "If it goes out half-fixed, QA can find more rework or customers can notice again.",
          },
          ru: {
            headline: "Починить {area}",
            problem: "Пользователи упираются в поломанный путь в зоне: {area}.",
            stakes: "Проверенный фикс снижает шум поддержки и повторные обращения.",
            failurePreview: "Если выпустить наполовину, QA найдет доработки или клиенты снова заметят баг.",
          },
        },
        flavor: {
          en: {
            aside: "Everyone agrees the code is temporary; the commit history disagrees.",
          },
          ru: {
            aside: "Все согласны, что код временный; история коммитов не согласна.",
          },
        },
      },
    },
  },
  "core.bug.duplicate-action": {
    id: "core.bug.duplicate-action",
    kind: "bug",
    tags: ["core", "defect", "workflow"],
    meaning: [
      "The system performs a visible action incorrectly.",
      "The task needs implementation and verification.",
      "A partial fix can create repeated user-facing damage.",
    ],
    variables: { area: areaVariable },
    branches: {
      default: {
        id: "default",
        layer: "core",
        core: {
          en: {
            headline: "Stop duplicate action in {area}",
            problem: "The {area} sometimes applies the same user action twice.",
            stakes: "A verified fix prevents visible mistakes and support churn.",
            failurePreview: "If released dirty, the duplicate action can come back as a customer-facing bug.",
          },
          ru: {
            headline: "Убрать двойное действие в зоне: {area}",
            problem: "{area} иногда применяет одно действие пользователя дважды.",
            stakes: "Проверенный фикс убирает заметные ошибки и шум поддержки.",
            failurePreview: "Если выпустить грязно, двойное действие вернется клиентским багом.",
          },
        },
        flavor: {
          en: {
            aside: "The partner says their side is ready, which usually means the contract changed yesterday.",
          },
          ru: {
            aside: "Партнер говорит, что у них все готово, что обычно значит: контракт поменялся вчера.",
          },
        },
      },
    },
  },
  "core.techDebt.fragile": {
    id: "core.techDebt.fragile",
    kind: "techDebt",
    tags: ["core", "debt", "stability"],
    meaning: [
      "The task reduces fragility, not just adds value.",
      "Clean tech debt work should lower product debt.",
      "Ignoring it keeps future delivery slower and riskier.",
    ],
    variables: { area: areaVariable },
    branches: {
      default: {
        id: "default",
        layer: "core",
        core: {
          en: {
            headline: "Reduce fragile {area} implementation",
            problem: "The {area} is held together by brittle code paths.",
            stakes: "Clean work should lower technical debt and make later tasks safer.",
            failurePreview: "If skipped, future changes in this area stay slower and noisier.",
          },
          ru: {
            headline: "Уменьшить хрупкость в зоне: {area}",
            problem: "{area} держится на ломких технических решениях.",
            stakes: "Чистая работа должна снизить технический долг и упростить будущие задачи.",
            failurePreview: "Если отложить, следующие изменения здесь останутся медленными и рискованными.",
          },
        },
        flavor: {
          en: {
            aside: "The alert is technically quiet now because someone muted the wrong channel.",
          },
          ru: {
            aside: "Алерт технически уже тихий, потому что кто-то замьютил не тот канал.",
          },
        },
      },
    },
  },
  "core.techDebt.split-module": {
    id: "core.techDebt.split-module",
    kind: "techDebt",
    tags: ["core", "debt", "maintainability"],
    meaning: [
      "The task is maintenance work with future payoff.",
      "Clean release should reduce debt rather than only add value.",
      "Skipping it leaves future tasks more expensive.",
    ],
    variables: { area: areaVariable },
    branches: {
      default: {
        id: "default",
        layer: "core",
        core: {
          en: {
            headline: "Untangle the {area} module",
            problem: "Several unrelated behaviors are mixed inside the {area} implementation.",
            stakes: "Clean tech debt work lowers debt and makes future fixes cheaper.",
            failurePreview: "If ignored, ordinary changes keep dragging extra risk behind them.",
          },
          ru: {
            headline: "Распутать модуль зоны: {area}",
            problem: "В реализации зоны {area} смешаны несколько несвязанных поведений.",
            stakes: "Чистая работа по техдолгу снижает долг и удешевляет будущие фиксы.",
            failurePreview: "Если игнорировать, обычные изменения продолжат тащить за собой лишний риск.",
          },
        },
        flavor: {
          en: {
            aside: "The dashboard loads slowly enough for people to start narrating it.",
          },
          ru: {
            aside: "Дашборд грузится так медленно, что люди уже начали комментировать процесс вслух.",
          },
        },
      },
    },
  },
  "core.integration.flow": {
    id: "core.integration.flow",
    kind: "integration",
    tags: ["core", "dependency", "data-flow"],
    meaning: [
      "The task connects a product flow with another system.",
      "SRE and QA matter more when blast radius is high.",
      "Poor integration work can create partner-facing fallout.",
    ],
    variables: { area: areaVariable },
    branches: {
      default: {
        id: "default",
        layer: "core",
        core: {
          en: {
            headline: "Connect {area} data flow",
            problem: "Another system needs reliable data from the {area}.",
            stakes: "A clean integration keeps partner workflows moving.",
            failurePreview: "A weak release can break handoffs and return as an incident.",
          },
          ru: {
            headline: "Подключить поток данных: {area}",
            problem: "Другой системе нужны надежные данные из зоны: {area}.",
            stakes: "Чистая интеграция поддержит партнерский процесс без ручных обходов.",
            failurePreview: "Слабый релиз может сломать передачу данных и вернуться инцидентом.",
          },
        },
        flavor: {
          en: {
            aside: "Legal did not write in caps, which somehow makes it feel more serious.",
          },
          ru: {
            aside: "Юристы не писали капсом, и от этого почему-то стало тревожнее.",
          },
        },
      },
    },
  },
  "core.integration.partner-sync": {
    id: "core.integration.partner-sync",
    kind: "integration",
    tags: ["core", "dependency", "partner"],
    meaning: [
      "The task connects an internal flow to a partner-facing dependency.",
      "Bad integration work can create high-impact fallout.",
      "QA and SRE coverage are important when impact is high.",
    ],
    variables: { area: areaVariable },
    branches: {
      default: {
        id: "default",
        layer: "core",
        core: {
          en: {
            headline: "Sync {area} with partner system",
            problem: "A partner system expects the {area} data to arrive in a reliable format.",
            stakes: "Clean integration keeps external commitments predictable.",
            failurePreview: "A weak handoff can break the partner flow and return as an escalation.",
          },
          ru: {
            headline: "Синхронизировать {area} с партнерской системой",
            problem: "Партнерская система ждет данные из зоны {area} в надежном формате.",
            stakes: "Чистая интеграция делает внешние обязательства предсказуемыми.",
            failurePreview: "Слабая передача данных может сломать партнерский процесс и вернуться эскалацией.",
          },
        },
      },
    },
  },
  "core.incident.stabilize": {
    id: "core.incident.stabilize",
    kind: "incident",
    tags: ["core", "incident", "trust"],
    meaning: [
      "Production is already unstable.",
      "The task is urgent and trust-sensitive.",
      "Incomplete work can escalate into follow-up fallout.",
    ],
    variables: { area: areaVariable },
    branches: {
      default: {
        id: "default",
        layer: "core",
        core: {
          en: {
            headline: "Stabilize {area} incident",
            problem: "The {area} is already causing visible production trouble.",
            stakes: "A clean response protects trust before the damage spreads.",
            failurePreview: "If the team misses it, the problem can escalate tomorrow.",
          },
          ru: {
            headline: "Стабилизировать инцидент: {area}",
            problem: "{area} уже создает заметную production-проблему.",
            stakes: "Чистая реакция защищает доверие до того, как ущерб расползется.",
            failurePreview: "Если команда не успеет, завтра проблема может стать эскалацией.",
          },
        },
      },
    },
  },
  "core.incident.restore-path": {
    id: "core.incident.restore-path",
    kind: "incident",
    tags: ["core", "incident", "production"],
    meaning: [
      "Something important is already failing in production.",
      "The player should treat it as urgent and trust-sensitive.",
      "Incomplete work can create another morning fallout card.",
    ],
    variables: { area: areaVariable },
    branches: {
      default: {
        id: "default",
        layer: "core",
        core: {
          en: {
            headline: "Restore failing {area} path",
            problem: "A production path in the {area} is failing often enough for business to notice.",
            stakes: "Clean stabilization protects trust and reduces follow-up pressure.",
            failurePreview: "If the fix is late or unfinished, the failure can escalate tomorrow.",
          },
          ru: {
            headline: "Восстановить падающий путь в зоне: {area}",
            problem: "Production-путь в зоне {area} падает достаточно часто, чтобы бизнес это заметил.",
            stakes: "Чистая стабилизация защищает доверие и снижает давление хвостов.",
            failurePreview: "Если фикс опоздает или останется незавершенным, завтра проблема эскалируется.",
          },
        },
      },
    },
  },
  "core.performance.slow": {
    id: "core.performance.slow",
    kind: "performance",
    tags: ["core", "performance", "quality"],
    meaning: [
      "The product works, but too slowly.",
      "Performance work protects users and future delivery.",
      "Rushed performance changes can create regressions.",
    ],
    variables: { area: areaVariable },
    branches: {
      default: {
        id: "default",
        layer: "core",
        core: {
          en: {
            headline: "Speed up {area}",
            problem: "The {area} is slow enough that users are changing their behavior.",
            stakes: "A clean fix improves value without destabilizing the flow.",
            failurePreview: "Untested optimizations can create new failures under load.",
          },
          ru: {
            headline: "Ускорить {area}",
            problem: "{area} работает настолько медленно, что пользователи меняют поведение.",
            stakes: "Чистый фикс добавит ценность и не раскачает стабильность.",
            failurePreview: "Непроверенная оптимизация может сломаться под нагрузкой.",
          },
        },
      },
    },
  },
  "core.performance.cache": {
    id: "core.performance.cache",
    kind: "performance",
    tags: ["core", "performance", "load"],
    meaning: [
      "The flow is slow and needs a technical performance fix.",
      "Clean work improves value without adding instability.",
      "Untested optimization can create production fallout.",
    ],
    variables: { area: areaVariable },
    branches: {
      default: {
        id: "default",
        layer: "core",
        core: {
          en: {
            headline: "Cache slow {area} response",
            problem: "The {area} waits on the same expensive response too often.",
            stakes: "A clean performance fix makes the product feel faster without hiding bugs.",
            failurePreview: "A rushed cache can show stale data or fail under load.",
          },
          ru: {
            headline: "Закешировать медленный ответ: {area}",
            problem: "{area} слишком часто ждет один и тот же дорогой ответ.",
            stakes: "Чистый performance-фикс ускоряет продукт и не прячет баги.",
            failurePreview: "Поспешный кеш может показать устаревшие данные или сломаться под нагрузкой.",
          },
        },
      },
    },
  },
  "core.compliance.sensitive": {
    id: "core.compliance.sensitive",
    kind: "compliance",
    tags: ["core", "compliance", "trust"],
    meaning: [
      "The task protects sensitive or regulated behavior.",
      "Clean QA/SRE coverage matters because trust damage can be high.",
      "Skipping work can produce compliance fallout.",
    ],
    variables: { area: areaVariable },
    branches: {
      default: {
        id: "default",
        layer: "core",
        core: {
          en: {
            headline: "Protect sensitive {area} data",
            problem: "The {area} handles sensitive data in a way the business wants tightened.",
            stakes: "A clean release reduces compliance risk and preserves trust.",
            failurePreview: "If rushed, the task can return as a visible policy problem.",
          },
          ru: {
            headline: "Защитить чувствительные данные: {area}",
            problem: "{area} работает с чувствительными данными, и бизнес просит усилить защиту.",
            stakes: "Чистый релиз снижает compliance-риск и сохраняет доверие.",
            failurePreview: "Если поспешить, задача может вернуться заметной политической проблемой.",
          },
        },
      },
    },
  },
  "core.compliance.masking": {
    id: "core.compliance.masking",
    kind: "compliance",
    tags: ["core", "compliance", "privacy"],
    meaning: [
      "The task is about protecting sensitive information.",
      "The player should recognize high trust risk if shipped dirty.",
      "QA/SRE coverage helps prevent policy fallout.",
    ],
    variables: { area: areaVariable },
    branches: {
      default: {
        id: "default",
        layer: "core",
        core: {
          en: {
            headline: "Mask sensitive fields in {area}",
            problem: "The {area} exposes fields that should be hidden from everyday users.",
            stakes: "Clean compliance work prevents trust damage before anyone escalates it.",
            failurePreview: "A dirty release can become a visible policy problem tomorrow.",
          },
          ru: {
            headline: "Скрыть чувствительные поля в зоне: {area}",
            problem: "{area} показывает поля, которые обычные пользователи видеть не должны.",
            stakes: "Чистая compliance-работа предотвращает удар по доверию до эскалации.",
            failurePreview: "Грязный релиз может завтра стать заметной политической проблемой.",
          },
        },
      },
    },
  },
  "tutorial.stage-one.qa": {
    id: "tutorial.stage-one.qa",
    kind: "bug",
    tags: ["tutorial", "qa", "core"],
    meaning: [
      "The first tutorial task teaches moving a card and assigning QA.",
      "It must have exactly one QA subtask.",
      "It should complete quickly and cleanly.",
    ],
    variables: { area: areaVariable },
    branches: {
      default: {
        id: "default",
        layer: "core",
        core: {
          en: {
            headline: "Test yesterday's changes",
            problem: "A small change from yesterday needs a QA pass before release.",
            stakes: "You learn how to move a task into work and assign a specialist.",
            failurePreview: "In a real run, skipping QA can leave release risk on the card.",
          },
          ru: {
            headline: "Протестировать вчерашние доработки",
            problem: "Небольшое вчерашнее изменение нужно провести через QA перед релизом.",
            stakes: "Ты учишься переносить задачу в работу и назначать специалиста.",
            failurePreview: "В обычной игре пропуск QA может оставить риск релиза на карточке.",
          },
        },
      },
    },
  },
  "tutorial.multi-work.note": {
    id: "tutorial.multi-work.note",
    kind: "feature",
    tags: ["tutorial", "multi-work", "core"],
    meaning: [
      "The second tutorial task teaches several sequential subtasks.",
      "It should require backend, frontend, and QA.",
      "It should complete cleanly when all specialists are used.",
    ],
    variables: { area: areaVariable },
    branches: {
      default: {
        id: "default",
        layer: "core",
        core: {
          en: {
            headline: "Add a small customer note",
            problem: "Support wants a tiny note visible in the customer flow.",
            stakes: "The task shows how one card can need several roles.",
            failurePreview: "If you skip a role, the card remains risky or unfinished.",
          },
          ru: {
            headline: "Добавить короткую заметку клиента",
            problem: "Поддержка просит показать короткую заметку в клиентском сценарии.",
            stakes: "Задача показывает, что одной карточке могут понадобиться разные роли.",
            failurePreview: "Если пропустить роль, карточка останется рискованной или незавершенной.",
          },
        },
      },
    },
  },
  "tutorial.compromise.login": {
    id: "tutorial.compromise.login",
    kind: "bug",
    tags: ["tutorial", "compromise", "core"],
    meaning: [
      "The compromise task teaches shipping with known risk.",
      "QA is unavailable by script.",
      "The player should understand that Done can still be risky.",
    ],
    variables: { area: areaVariable },
    branches: {
      default: {
        id: "default",
        layer: "core",
        core: {
          en: {
            headline: "Patch urgent login error",
            problem: "A login fix is needed while QA is already exhausted.",
            stakes: "You learn that sometimes release quality is a tradeoff.",
            failurePreview: "Shipping without QA can create a morning consequence.",
          },
          ru: {
            headline: "Починить срочную ошибку логина",
            problem: "Нужен фикс логина, но QA уже выдохся.",
            stakes: "Ты учишься, что качество релиза иногда становится компромиссом.",
            failurePreview: "Релиз без QA может создать последствие утром.",
          },
        },
      },
    },
  },
  "tutorial.deadline.export": {
    id: "tutorial.deadline.export",
    kind: "incident",
    tags: ["tutorial", "deadline", "core"],
    meaning: [
      "The deadline task teaches late release versus missed work.",
      "The director controls the deadline so no long wait is required.",
      "The player chooses between shipping late or letting the card miss.",
    ],
    variables: { area: areaVariable },
    branches: {
      default: {
        id: "default",
        layer: "core",
        core: {
          en: {
            headline: "Stabilize partner export",
            problem: "A partner export needs stabilization right before the release window closes.",
            stakes: "You learn how deadline pressure changes the release decision.",
            failurePreview: "Shipping late loses value; ignoring it creates missed-work fallout.",
          },
          ru: {
            headline: "Стабилизировать партнерский экспорт",
            problem: "Партнерский экспорт нужно стабилизировать прямо перед закрытием окна релиза.",
            stakes: "Ты учишься принимать решение под давлением дедлайна.",
            failurePreview: "Поздний релиз теряет value; игнорирование создает последствия сорванной работы.",
          },
        },
      },
    },
  },
  "fallout.bug.regression": {
    id: "fallout.bug.regression",
    kind: "bug",
    tags: ["fallout", "core", "defect"],
    meaning: [
      "This bug exists because an earlier task created fallout.",
      "The source task id and cause must remain structured.",
      "The player should recognize the consequence without reading a noisy title.",
    ],
    variables: {
      area: areaVariable,
      cause: causeVariable,
    },
    branches: {
      default: {
        id: "default",
        layer: "core",
        core: {
          en: {
            headline: "Fix fallout in {area}",
            problem: "The {area} regressed after {sourceTaskId} because of {cause}.",
            stakes: "Closing the follow-up prevents yesterday's compromise from becoming normal work.",
            failurePreview: "If ignored, the fallout chain can keep consuming team capacity.",
          },
          ru: {
            headline: "Починить хвост в зоне: {area}",
            problem: "{area} сломалось после {sourceTaskId} из-за {cause}.",
            stakes: "Закрытый хвост не дает вчерашнему компромиссу стать постоянной работой.",
            failurePreview: "Если игнорировать, цепочка хвостов продолжит съедать capacity команды.",
          },
        },
      },
    },
  },
  "fallout.incident.escalation": {
    id: "fallout.incident.escalation",
    kind: "incident",
    tags: ["fallout", "core", "incident"],
    meaning: [
      "This incident is a consequence of earlier dirty, late, or missed work.",
      "It should feel like a named escalation, not a random new task.",
      "The source task id and cause must be available for logs and UI links.",
    ],
    variables: {
      area: areaVariable,
      cause: causeVariable,
    },
    branches: {
      default: {
        id: "default",
        layer: "core",
        core: {
          en: {
            headline: "Handle fallout escalation in {area}",
            problem: "A problem from {sourceTaskId} reached production because of {cause}.",
            stakes: "Stabilizing it protects trust and closes a visible consequence chain.",
            failurePreview: "If it misses again, the chain can terminate as direct business damage.",
          },
          ru: {
            headline: "Разобрать эскалацию в зоне: {area}",
            problem: "Проблема из {sourceTaskId} дошла до production из-за {cause}.",
            stakes: "Стабилизация защищает доверие и закрывает видимую цепочку последствий.",
            failurePreview: "Если снова пропустить, цепочка может закрыться прямым бизнес-уроном.",
          },
        },
      },
    },
  },
  "fallout.integration.escalation": {
    id: "fallout.integration.escalation",
    kind: "integration",
    tags: ["fallout", "core", "partner"],
    meaning: [
      "This is partner-facing follow-up work caused by an earlier task.",
      "The source task remains structured for inspector links and telemetry.",
      "It should read as consequence work, not a fresh opportunity.",
    ],
    variables: {
      area: areaVariable,
      cause: causeVariable,
    },
    branches: {
      default: {
        id: "default",
        layer: "core",
        core: {
          en: {
            headline: "Repair partner fallout in {area}",
            problem: "Partner work around {area} came back after {sourceTaskId} because of {cause}.",
            stakes: "A clean fix turns the follow-up back into controlled delivery.",
            failurePreview: "If ignored, the partner issue can become another escalation.",
          },
          ru: {
            headline: "Починить партнерский хвост: {area}",
            problem: "Партнерская работа вокруг {area} вернулась после {sourceTaskId} из-за {cause}.",
            stakes: "Чистый фикс возвращает хвост в управляемую доставку.",
            failurePreview: "Если игнорировать, партнерская проблема может стать новой эскалацией.",
          },
        },
      },
    },
  },
  "fallout.feature.rework": {
    id: "fallout.feature.rework",
    kind: "feature",
    tags: ["fallout", "core", "rework"],
    meaning: [
      "This feature work is rework caused by a previous compromise.",
      "The card should explain the consequence without bloating the headline.",
      "The source task id and cause remain structured.",
    ],
    variables: {
      area: areaVariable,
      cause: causeVariable,
    },
    branches: {
      default: {
        id: "default",
        layer: "core",
        core: {
          en: {
            headline: "Rework fallout in {area}",
            problem: "The request around {area} came back after {sourceTaskId} because of {cause}.",
            stakes: "Doing the rework cleanly stops the old compromise from leaking into new work.",
            failurePreview: "If skipped, the same confusion can return as another follow-up.",
          },
          ru: {
            headline: "Переделать хвост в зоне: {area}",
            problem: "Запрос вокруг {area} вернулся после {sourceTaskId} из-за {cause}.",
            stakes: "Чистая переделка не дает старому компромиссу протечь в новую работу.",
            failurePreview: "Если пропустить, та же путаница может вернуться новым хвостом.",
          },
        },
      },
    },
  },
};

export const TASK_NARRATIVE_ARCHETYPE_IDS_BY_KIND: Record<RtTaskKind, readonly string[]> = {
  feature: ["core.feature.workflow", "core.feature.saved-view"],
  bug: ["core.bug.visible", "core.bug.duplicate-action"],
  techDebt: ["core.techDebt.fragile", "core.techDebt.split-module"],
  integration: ["core.integration.flow", "core.integration.partner-sync"],
  incident: ["core.incident.stabilize", "core.incident.restore-path"],
  performance: ["core.performance.slow", "core.performance.cache"],
  compliance: ["core.compliance.sensitive", "core.compliance.masking"],
};
