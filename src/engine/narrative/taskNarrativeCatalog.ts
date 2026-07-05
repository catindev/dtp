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

const areaVariable: TaskNarrativeVariable = {
  values: DOMAIN_AREA_VALUES,
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
};

export const TASK_NARRATIVE_ARCHETYPE_IDS_BY_KIND: Record<RtTaskKind, readonly string[]> = {
  feature: ["core.feature.workflow"],
  bug: ["core.bug.visible"],
  techDebt: ["core.techDebt.fragile"],
  integration: ["core.integration.flow"],
  incident: ["core.incident.stabilize"],
  performance: ["core.performance.slow"],
  compliance: ["core.compliance.sensitive"],
};
