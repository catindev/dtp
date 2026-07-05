import {
  RELEASE_TRAIN_GAME_MINUTE,
  assignCharacterToTask,
  canAssignCharacterToTask,
  createCampaignCalendar,
  createRealtimeState,
  createTutorialRealtimeState,
  getOutsourceTaskWorkStatus,
  moveRealtimeTask,
  normalizeRealtimeState,
  outsourceTaskWork,
  releaseReadiness,
  renderTaskNarrative,
  resolveDueHorizonReviews,
  RT_COLUMNS,
  runDailyReleaseTrain,
  startDayAfterMorningReport,
  tickRealtime,
  type RtGameState,
  type RtTask,
} from "../realtime/simulation";
import {
  buildBackendSnapshot,
  buildDebugSnapshot,
} from "../logging/debugSnapshot";
import { createLogEntry } from "../logging/backendLog";
import { buildGameEventTelemetry } from "../logging/gameEventTelemetry";
import { buildDaySummaryTelemetry } from "../logging/summaryTelemetry";
import { characterDropRejectReason } from "../hooks/dragAndDropHelpers";
import {
  TASK_NARRATIVE_ARCHETYPE_IDS_BY_KIND,
  TASK_NARRATIVE_ARCHETYPES,
  createTaskNarrativeRef,
  renderTaskComment,
} from "../engine/narrative";
import { DOMAINS } from "../engine/catalog";
import { SIM_TEXT, TASK_TITLES } from "../engine/content";
import { isWorkPassCompletedEvent } from "../engine/eventData";
import { generateTask } from "../engine/taskFactory";
import { loadTutorialCompleted } from "../tutorial/tutorialProgress";
import {
  TUTORIAL_STEP_ASSIGN_QA,
  TUTORIAL_STAGE_DAY_END,
  TUTORIAL_STAGE_MULTI_WORK,
  TUTORIAL_STEP_CHOOSE_DEADLINE,
  TUTORIAL_STEP_MOVE_DONE,
  TUTORIAL_STEP_MOVE_TASK,
  TUTORIAL_STEP_REPORT_READY,
  TUTORIAL_STEP_WAIT_DAY_END,
  TUTORIAL_STEP_WAIT_WORK,
  advanceTutorialForCharacterAssignment,
  advanceTutorialForTaskMove,
  canDropTutorialCharacter,
  canDropTutorialTask,
  tutorialFocusCharacterId,
  tutorialFocusTaskId,
} from "../tutorial/tutorialDirector";

const RU_PLAYER_COPY_BANLIST = [
  { label: "internal slang хвост", pattern: /\bхвост\w*/iu },
  { label: "internal slang фоллаут", pattern: /\bфоллаут\w*/iu },
  { label: "agreement-prone verb закрывал", pattern: /\bзакрывал\b/iu },
  { label: "awkward generated phrase породить", pattern: /\bпородить\b/iu },
  { label: "translationese зона", pattern: /\bзон[аеуы]\b/iu },
  { label: "vague feature filler", pattern: /новый ежедневный сценарий/iu },
  { label: "raw English production", pattern: /\bproduction\b/iu },
  { label: "raw English performance", pattern: /\bperformance\b/iu },
  { label: "raw English compliance", pattern: /\bcompliance\b/iu },
];

const RU_GENERATOR_COPY_BANLIST = [
  ...RU_PLAYER_COPY_BANLIST,
  { label: "raw English auth flow", pattern: /auth flow/iu },
  { label: "raw English webhook receiver", pattern: /webhook receiver/iu },
  { label: "raw English audit log", pattern: /audit log/iu },
  { label: "raw English retention policy", pattern: /retention policy/iu },
  { label: "raw English happy path", pattern: /happy path/iu },
  { label: "raw English edge cases", pattern: /edge cases/iu },
  { label: "raw English rollout", pattern: /\brollout\b/iu },
  { label: "raw English fix", pattern: /\bfix\b/iu },
  { label: "raw English alert", pattern: /\balert\b/iu },
  { label: "raw English retries", pattern: /\bretries\b/iu },
  { label: "raw English failure modes", pattern: /failure modes/iu },
  { label: "raw English operational config", pattern: /operational config/iu },
  { label: "raw English hot path", pattern: /hot path/iu },
  { label: "raw English policy enforcement", pattern: /policy enforcement/iu },
  { label: "raw English compliant UI copy", pattern: /compliant UI copy/iu },
];

const EN_PLAYER_COPY_BANLIST = [
  { label: "internal slang fallout", pattern: /\bfallout\b/iu },
];

const seedArg = Number(process.argv[2]);
const seed = Number.isFinite(seedArg) ? seedArg : 184;
const state = createRealtimeState(seed);
assertQuarterCadence(state);
const smoke = [
  runHorizonBoundarySmoke(),
  runBacklogValueDecaySmoke(),
  runBacklogOpportunityExpirationSmoke(),
  runTechDebtReleaseSinkSmoke(),
  runMissedWorkSmoke(),
  runDeadlinePressureReadinessSmoke(),
  runHorizonReviewCapSmoke(),
  runWinContractSmoke(),
  runTutorialFoundationSmoke(),
  runTutorialEntrySmoke(),
  runTutorialStageOneSmoke(),
  runTutorialFullFlowSmoke(),
  runNarrativeContractSmoke(),
  runNarrativeCatalogSmoke(),
  runTaskGeneratorCopySmoke(),
  runNarrativeFlavorBudgetSmoke(),
  runMigrationNormalizationSmoke(),
  runDebugSnapshotSmoke(),
  runOutsourceSmoke(),
  runOutsourcedQaCoverageSmoke(),
  runPartialQaCoverageSmoke(),
  runQaRecheckSmoke(),
  runCharacterEventPayloadSmoke(),
  runDragRejectHelperSmoke(),
  runLogSizeBudgetSmoke(),
];

const taskId = state.board.backlog[0];
const analystId = Object.values(state.characters).find((character) => character.role === "analyst")?.id;

moveRealtimeTask(state, taskId, "inProgress");
if (analystId) assignCharacterToTask(state, analystId, taskId);
tickUntilTaskIdle(taskId, 500);

for (let index = 0; index < 8; index += 1) {
  const task = state.tasks[taskId];
  if (!task || isTaskReadyForDone(taskId)) break;
  const worker = pickWorkerForTask(taskId);
  if (!worker) break;
  assignCharacterToTask(state, worker, taskId);
  tickUntilTaskIdle(taskId, 700);
}

moveRealtimeTask(state, taskId, "done");
const shipped = runDailyReleaseTrain(state);

console.log(
  JSON.stringify(
    {
      seed,
      status: state.status,
      time: state.gameMinuteOfDay,
      released: state.tasks[taskId]?.released,
      shipped,
      releaseScore: state.tasks[taskId]?.releaseScore,
      trust: state.resources.trust,
      clients: state.resources.clients,
      debt: state.resources.debt,
      value: state.resources.value,
      tasks: Object.keys(state.tasks).length,
      backlog: state.board.backlog.length,
      smoke,
      log: state.log.slice(0, 8).map((event) => event.title),
    },
    null,
    2,
  ),
);

function tickUntilTaskIdle(taskId: string, limit: number): void {
  tickUntilTaskIdleInState(state, taskId, limit);
}

function tickUntilTaskIdleInState(currentState: RtGameState, taskId: string, limit: number): void {
  for (let index = 0; index < limit; index += 1) {
    const task = currentState.tasks[taskId];
    if (!task?.assignedCharacterId) return;
    tickRealtime(currentState, 500);
  }
}

function assertQuarterCadence(currentState: typeof state): void {
  if (currentState.daysPerQuarter < 5) {
    throw new Error(`Expected daysPerQuarter >= 5, got ${currentState.daysPerQuarter}.`);
  }
}

function runHorizonBoundarySmoke() {
  const currentState = createRealtimeState(777);
  assertQuarterCadence(currentState);
  currentState.day = currentState.daysPerQuarter;
  currentState.dayInQuarter = currentState.daysPerQuarter;
  currentState.quarterValue = currentState.quarterGoal.value;
  currentState.resources.trust = currentState.quarterGoal.trust + 5;

  const controlledTaskId = currentState.board.backlog[0];
  const controlledTask = currentState.tasks[controlledTaskId];
  assert(Boolean(controlledTask), "Horizon smoke expected an initial task.");
  configureCleanReleaseTask(controlledTask);
  assert(releaseReadiness(controlledTask).readiness === "clean", "Horizon smoke task should be clean.");
  assert(moveRealtimeTask(currentState, controlledTask.id, "inProgress"), "Horizon smoke move to work failed.");
  assert(moveRealtimeTask(currentState, controlledTask.id, "done"), "Horizon smoke move to Done failed.");

  tickToMorningReport(currentState);
  const report = currentState.morningReport;
  assert(report !== null, "Horizon smoke expected morning report.");
  assert(report.shippedTaskIds.includes(controlledTask.id), "Horizon smoke expected shipped task.");
  assert(report.horizonReviews.length >= 3, "Horizon smoke expected stacked horizon reviews.");
  assert(Boolean(report.quarterReview), "Horizon smoke expected legacy quarter projection.");
  assert(currentState.dayInQuarter === 1, "Horizon smoke expected new quarter day 1.");
  assert(startDayAfterMorningReport(currentState), "Horizon smoke expected briefing continue.");

  return {
    name: "horizon-boundary",
    shipped: report.shippedTaskIds.length,
    reviews: report.horizonReviews.map((review) => `${review.kind}:${review.hitGoal ? "met" : "missed"}`),
    dayInQuarter: currentState.dayInQuarter,
  };
}

function runMissedWorkSmoke() {
  const currentState = createRealtimeState(888);
  assertQuarterCadence(currentState);

  const controlledTaskId = currentState.board.backlog[0];
  const controlledTask = currentState.tasks[controlledTaskId];
  assert(Boolean(controlledTask), "Missed-work smoke expected an initial task.");
  configureMissedMajorTask(controlledTask);
  assert(moveRealtimeTask(currentState, controlledTask.id, "inProgress"), "Missed-work smoke move failed.");

  tickToMorningReport(currentState);
  const report = currentState.morningReport;
  assert(report !== null, "Missed-work smoke expected morning report.");
  const fallout = report.consequences.find(
    (consequence) =>
      consequence.source === "missed_in_progress" &&
      consequence.sourceTaskId === controlledTask.id &&
      consequence.cause === "missed_deadline",
  );
  assert(Boolean(fallout), "Missed-work smoke expected missed in-progress fallout.");
  if (!fallout) throw new Error("Missed-work smoke missing fallout.");
  assert(controlledTask.resolved, "Missed-work smoke expected source task resolved.");
  assert(report.daySummary.missedInProgress >= 1, "Missed-work smoke expected missed progress summary.");
  const falloutTask = fallout?.generatedTaskId ? currentState.tasks[fallout.generatedTaskId] : null;
  assert(Boolean(falloutTask), "Missed-work smoke expected generated fallout task.");
  if (!falloutTask) throw new Error("Missed-work smoke missing generated fallout task.");
  assert(
    falloutTask.narrativeRef.tags.includes("fallout"),
    "Missed-work smoke expected fallout narrative tag.",
  );
  assert(
    falloutTask.narrativeRef.variableValueIds.sourceTaskId === controlledTask.id,
    "Missed-work smoke expected structured source task id.",
  );
  assert(
    falloutTask.narrativeRef.variableValueIds.cause === "missed_deadline",
    "Missed-work smoke expected structured fallout cause.",
  );
  assert(
    !falloutTask.title.includes("after"),
    "Missed-work smoke expected no noisy source wording in debug title.",
  );
  assert(
    renderTaskNarrative(falloutTask, "en").core.problem.includes(controlledTask.id),
    "Missed-work smoke expected rendered fallout problem to mention source id.",
  );

  return {
    name: "missed-work",
    missedInProgress: report.daySummary.missedInProgress,
    fallout: fallout.generatedTaskId ?? fallout.effects.join(", "),
    resolution: controlledTask.resolution,
    archetypeId: falloutTask.narrativeRef.archetypeId,
  };
}

function runDeadlinePressureReadinessSmoke() {
  const currentState = createRealtimeState(889);
  assertQuarterCadence(currentState);

  const controlledTaskId = currentState.board.backlog[0];
  const controlledTask = currentState.tasks[controlledTaskId];
  assert(Boolean(controlledTask), "Deadline-pressure smoke expected an initial task.");
  configureCleanReleaseTask(controlledTask);
  controlledTask.deadlineMs = 1000;
  controlledTask.deadlineMaxMs = 300000;

  const workReadiness = releaseReadiness(controlledTask);
  assert(workReadiness.readiness === "clean", "Deadline pressure should not make clean work risky.");
  assert(workReadiness.reasons.length === 0, "Deadline pressure should not add readiness reasons.");
  assert(
    moveRealtimeTask(currentState, controlledTask.id, "inProgress"),
    "Deadline-pressure smoke move to work failed.",
  );
  assert(moveRealtimeTask(currentState, controlledTask.id, "done"), "Deadline-pressure smoke move to Done failed.");

  const doneReadiness = releaseReadiness(controlledTask);
  assert(doneReadiness.readiness === "clean", "Done task under deadline pressure should stay clean.");
  assert(doneReadiness.reasons.length === 0, "Done task should not show deadline pressure as a risk.");

  return {
    name: "deadline-pressure-readiness",
    readiness: doneReadiness.readiness,
    reasons: doneReadiness.reasons.length,
  };
}

function runHorizonReviewCapSmoke() {
  const currentState = createRealtimeState(890);
  currentState.day = 10;
  currentState.calendar = createCampaignCalendar(10);
  currentState.resources.trust = 70;
  const baseGoal = currentState.horizonGoals.week;
  assert(Boolean(baseGoal), "Horizon cap smoke expected a week goal.");
  if (!baseGoal) throw new Error("Horizon cap smoke expected a week goal.");
  currentState.horizonGoals.week = {
    ...baseGoal,
    kind: "week",
    id: 2,
    endsOnDay: 10,
    currentValue: 0,
    expectedValue: 999,
    missedTrustPenalty: 4,
  };
  currentState.horizonGoals.month = {
    ...baseGoal,
    kind: "month",
    id: 1,
    endsOnDay: 10,
    currentValue: 0,
    expectedValue: 999,
    targetTrust: 90,
    missedTrustPenalty: 6,
  };
  currentState.horizonGoals.quarter = {
    ...baseGoal,
    kind: "quarter",
    id: 1,
    endsOnDay: 10,
    currentValue: 0,
    expectedValue: 999,
    targetTrust: 90,
    missedTrustPenalty: 8,
  };

  const emitted: string[] = [];
  const reviews = resolveDueHorizonReviews(currentState, (event) => emitted.push(event.type));
  const rawDamage = reviews.reduce((sum, review) => sum + review.rawTrustDamage, 0);
  const cappedDamage = reviews.reduce((sum, review) => sum + review.cappedTrustDamage, 0);
  assert(reviews.length === 3, "Horizon cap smoke expected three reviews.");
  assert(rawDamage === 18, "Horizon cap smoke expected raw damage 18.");
  assert(cappedDamage === 10, "Horizon cap smoke expected capped damage 10.");
  assert(currentState.resources.trust === 60, "Horizon cap smoke expected trust to drop by cap only.");
  assert(emitted.length === 3, "Horizon cap smoke expected review events.");

  return {
    name: "horizon-review-cap",
    reviews: reviews.length,
    rawDamage,
    cappedDamage,
    trust: currentState.resources.trust,
  };
}

function runWinContractSmoke() {
  const currentState = createRealtimeState(891);
  currentState.day = currentState.calendar.daysPerYear;
  currentState.calendar = createCampaignCalendar(currentState.day);
  currentState.resources.trust = 80;
  currentState.resources.clients = 100;
  currentState.resources.debt = 20;
  currentState.gameMinuteOfDay = RELEASE_TRAIN_GAME_MINUTE - 1;

  tickRealtime(currentState, 120000);
  assert(currentState.morningReport !== null, "Win smoke expected final morning report.");
  assert(currentState.status === "won", "Win smoke expected won status.");
  assert(currentState.victoryReport !== null, "Win smoke expected victory report.");
  assert(currentState.victoryReport.score > 0, "Win smoke expected positive victory score.");
  assert(
    currentState.log.some((event) => event.type === "run_won"),
    "Win smoke expected run_won event.",
  );

  return {
    name: "win-contract",
    status: currentState.status,
    grade: currentState.victoryReport?.grade,
    score: currentState.victoryReport?.score,
    day: currentState.day,
    hasMorningReport: Boolean(currentState.morningReport),
  };
}

function runTutorialFoundationSmoke() {
  const currentState = createRealtimeState(4104);
  assert(currentState.runMode === "campaign", "Tutorial smoke expected default run mode campaign.");
  assert(currentState.tutorial === null, "Tutorial smoke expected no tutorial state in a campaign run.");
  assert(loadTutorialCompleted() === false, "Tutorial smoke expected completion flag to fail closed without storage.");

  const legacyState = currentState as unknown as {
    runMode?: RtGameState["runMode"];
    tutorial?: RtGameState["tutorial"];
  };
  delete legacyState.runMode;
  delete legacyState.tutorial;
  const changed = normalizeRealtimeState(currentState);
  assert(changed, "Tutorial smoke expected legacy run fields to normalize.");
  assert(currentState.runMode === "campaign", "Tutorial smoke expected legacy run mode backfill.");
  assert(currentState.tutorial === null, "Tutorial smoke expected legacy tutorial backfill.");

  currentState.runMode = "tutorial";
  currentState.tutorial = null;
  normalizeRealtimeState(currentState);
  const repairedTutorial = currentState.tutorial as NonNullable<RtGameState["tutorial"]> | null;
  assert(repairedTutorial !== null, "Tutorial smoke expected missing tutorial state repair.");
  assert(repairedTutorial.stageId === "boot", "Tutorial smoke expected boot tutorial repair state.");
  assert(
    Array.isArray(repairedTutorial.completedStepIds),
    "Tutorial smoke expected tutorial completed step list.",
  );

  return {
    name: "tutorial-foundation",
    runMode: currentState.runMode,
    repairedStage: repairedTutorial.stageId,
  };
}

function runTutorialEntrySmoke() {
  const currentState = createTutorialRealtimeState(4204);
  assert(currentState.runMode === "tutorial", "Tutorial entry smoke expected tutorial run mode.");
  assert(currentState.tutorial !== null, "Tutorial entry smoke expected tutorial director state.");
  assert(currentState.tutorial?.stageId === "team-basics", "Tutorial entry smoke expected first stage.");
  assert(currentState.tutorial?.stepId === "move-task-to-work", "Tutorial entry smoke expected first step.");
  assert(
    RT_COLUMNS.every((column) => currentState.board[column].length === 0),
    "Tutorial entry smoke expected empty guided board.",
  );
  assert(Object.keys(currentState.tasks).length === 0, "Tutorial entry smoke expected no normal seed tasks.");
  assert(
    currentState.spawn.nextInMs === Number.MAX_SAFE_INTEGER,
    "Tutorial entry smoke expected normal spawner disabled.",
  );
  assert(
    currentState.log.some((event) => event.type === "tutorial_started"),
    "Tutorial entry smoke expected tutorial_started event.",
  );

  return {
    name: "tutorial-entry",
    runMode: currentState.runMode,
    stageId: currentState.tutorial?.stageId,
    stepId: currentState.tutorial?.stepId,
  };
}

function runNarrativeContractSmoke() {
  const currentState = createRealtimeState(4304, "en");
  const taskId = currentState.board.backlog[0];
  const task = currentState.tasks[taskId];
  assert(Boolean(task), "Narrative smoke expected a generated task.");
  assert(Boolean(task.narrativeRef), "Narrative smoke expected narrativeRef.");
  assert(Array.isArray(task.comments), "Narrative smoke expected comments scaffold.");
  assert(task.lastCommentId === null, "Narrative smoke expected empty lastCommentId.");

  const en = renderTaskNarrative(task, "en");
  const ru = renderTaskNarrative(task, "ru");
  assert(en.headline.length > 0, "Narrative smoke expected EN headline.");
  assert(ru.headline.length > 0, "Narrative smoke expected RU headline.");
  assert(en.headline !== ru.headline, "Narrative smoke expected localized text.");
  assert(
    !en.title.includes(task.narrativeRef.archetypeId),
    "Narrative smoke expected rendered title, not archetype debug id.",
  );
  assert(
    task.title.includes(task.narrativeRef.archetypeId),
    "Narrative smoke expected legacy title to be a debug archetype marker.",
  );

  return {
    name: "narrative-contract",
    taskId: task.id,
    archetypeId: task.narrativeRef.archetypeId,
    en: en.headline,
    ru: ru.headline,
  };
}

function runNarrativeCatalogSmoke() {
  const coreArchetypes = Object.values(TASK_NARRATIVE_ARCHETYPES).filter(
    (archetype) => archetype.id.startsWith("core."),
  );
  let renderedCopySamples = 0;
  assert(coreArchetypes.length >= 14, "Narrative catalog smoke expected at least 14 core archetypes.");
  for (const [kind, ids] of Object.entries(TASK_NARRATIVE_ARCHETYPE_IDS_BY_KIND)) {
    assert(ids.length >= 2, `Narrative catalog smoke expected at least 2 archetypes for ${kind}.`);
  }
  for (const archetype of coreArchetypes) {
    assert(archetype.meaning.length >= 3, `Narrative catalog smoke expected meaning for ${archetype.id}.`);
    const branches = Object.values(archetype.branches);
    assert(branches.length > 0, `Narrative catalog smoke expected branches for ${archetype.id}.`);
    for (const branch of branches) {
      for (const locale of ["en", "ru"] as const) {
        const core = branch.core[locale];
        assert(Boolean(core), `Narrative catalog smoke expected ${locale} core for ${archetype.id}.`);
        assert(core.headline.length > 0, `Narrative catalog smoke expected ${locale} headline for ${archetype.id}.`);
        assert(core.problem.length > 0, `Narrative catalog smoke expected ${locale} problem for ${archetype.id}.`);
        assert(core.stakes.length > 0, `Narrative catalog smoke expected ${locale} stakes for ${archetype.id}.`);
        assert(
          core.failurePreview.length > 0,
          `Narrative catalog smoke expected ${locale} failure preview for ${archetype.id}.`,
        );
      }
    }
  }
  for (const archetype of Object.values(TASK_NARRATIVE_ARCHETYPES)) {
    const domains = archetype.domains ?? DOMAINS;
    for (const domain of domains) {
      const task = createNarrativeCopySmokeTask(archetype, domain);
      for (const locale of ["en", "ru"] as const) {
        const rendered = renderTaskNarrative(task, locale);
        assertNarrativeCopySafe(archetype.id, locale, {
          ...rendered.core,
          ...(rendered.flavor ?? {}),
        });
        renderedCopySamples += 1;
      }
    }
  }

  return {
    name: "narrative-catalog",
    coreArchetypes: coreArchetypes.length,
    renderedCopySamples,
    kinds: Object.fromEntries(
      Object.entries(TASK_NARRATIVE_ARCHETYPE_IDS_BY_KIND).map(([kind, ids]) => [kind, ids.length]),
    ),
  };
}

function createNarrativeCopySmokeTask(
  archetype: (typeof TASK_NARRATIVE_ARCHETYPES)[string],
  domain: RtTask["domain"],
): RtTask {
  const variableValueIds: Record<string, string> = {};
  for (const key of [
    "area",
    "areaAcc",
    "areaGen",
    "areaPrep",
    "areaDat",
    "featureWorkflowHeadline",
    "featureWorkflowProblem",
    "savedViewHeadline",
    "savedViewProblem",
  ]) {
    if (archetype.variables[key]) variableValueIds[key] = domain;
  }
  if (archetype.variables.cause) variableValueIds.cause = "no_qa";
  if (archetype.id.startsWith("fallout.")) variableValueIds.sourceTaskId = "PAY-001";

  return {
    id: "SMOKE-001",
    title: "SMOKE-001",
    kind: archetype.kind,
    domain,
    narrativeRef: {
      archetypeId: archetype.id,
      branchId: "default",
      variantSeed: 1,
      variableValueIds,
      tags: [...archetype.tags],
      tone: archetype.tags.includes("fallout") ? "tense" : "neutral",
      density: "flavor",
    },
    comments: [],
    lastCommentId: null,
  } as unknown as RtTask;
}

function assertNarrativeCopySafe(
  archetypeId: string,
  locale: "en" | "ru",
  fields: Record<string, string | undefined>,
): void {
  const text = Object.values(fields).filter(Boolean).join(" ");
  assert(
    !/\{[a-zA-Z0-9_]+\}/u.test(text),
    `Narrative catalog smoke found unresolved template placeholder in ${locale} player copy for ${archetypeId}: ${text}`,
  );
  const banlist = locale === "ru" ? RU_PLAYER_COPY_BANLIST : EN_PLAYER_COPY_BANLIST;
  for (const rule of banlist) {
    assert(
      !rule.pattern.test(text),
      `Narrative catalog smoke found ${rule.label} in ${locale} player copy for ${archetypeId}: ${text}`,
    );
  }
}

function runNarrativeFlavorBudgetSmoke() {
  const currentState = createRealtimeState(4404, "en");
  currentState.tasks = {};
  currentState.board.backlog = [];
  currentState.board.inProgress = [];
  currentState.board.done = [];
  currentState.board.released = [];
  currentState.narrativeBudget.flavorWindowTaskIds = [];

  const generated: RtTask[] = [];
  for (let index = 0; index < 80; index += 1) {
    const task = generateTask(currentState);
    currentState.tasks[task.id] = task;
    generated.push(task);
  }
  const flavorTasks = generated.filter((task) => task.narrativeRef.density === "flavor");
  assert(flavorTasks.length >= 4, "Narrative flavor smoke expected some flavor tasks.");
  assert(flavorTasks.length <= 22, "Narrative flavor smoke expected flavor to stay rare.");
  for (const task of flavorTasks) {
    const rendered = renderTaskNarrative(task, "en");
    assert(Boolean(rendered.flavor?.aside), "Narrative flavor smoke expected rendered flavor aside.");
  }

  return {
    name: "narrative-flavor-budget",
    generated: generated.length,
    flavor: flavorTasks.length,
    ratio: Number((flavorTasks.length / generated.length).toFixed(2)),
  };
}

function runTaskGeneratorCopySmoke() {
  const checked: Array<{ scope: string; text: string }> = [];
  for (const [kind, titles] of Object.entries(TASK_TITLES.ru)) {
    for (const title of titles) checked.push({ scope: `title:${kind}`, text: title });
  }
  for (const [key, label] of Object.entries(SIM_TEXT.ru.subtasks)) {
    checked.push({ scope: `subtask:${key}`, text: label });
  }

  for (const sample of checked) {
    assertGeneratorCopySafe(sample.scope, sample.text);
  }

  return {
    name: "task-generator-copy",
    checked: checked.length,
  };
}

function assertGeneratorCopySafe(scope: string, text: string): void {
  for (const rule of RU_GENERATOR_COPY_BANLIST) {
    assert(
      !rule.pattern.test(text),
      `Task generator copy smoke found ${rule.label} in ${scope}: ${text}`,
    );
  }
}

function runTutorialStageOneSmoke() {
  const currentState = createTutorialRealtimeState(4205);
  tickRealtime(currentState, 1500);
  assert(currentState.board.backlog.length === 0, "Tutorial stage smoke expected delayed task spawn.");
  tickRealtime(currentState, 600);

  const focusTaskId = currentState.tutorial?.focusTaskId;
  assert(typeof focusTaskId === "string", "Tutorial stage smoke expected focus task.");
  if (typeof focusTaskId !== "string") throw new Error("Tutorial stage smoke missing focus task.");
  const taskId = focusTaskId;
  assert(currentState.board.backlog.includes(taskId), "Tutorial stage smoke expected task in backlog.");
  assert(
    tutorialFocusTaskId(currentState) === taskId,
    "Tutorial stage smoke expected task focus on task move step.",
  );
  assert(
    tutorialFocusCharacterId(currentState) === null,
    "Tutorial stage smoke expected no character focus on task move step.",
  );
  assert(
    (currentState.tutorial?.stepId as string | undefined) === TUTORIAL_STEP_MOVE_TASK,
    "Tutorial stage smoke expected move step.",
  );
  assert(
    canDropTutorialTask(currentState, taskId, "inProgress").allowed,
    "Tutorial stage smoke expected allowed task move.",
  );

  moveRealtimeTask(currentState, taskId, "inProgress");
  advanceTutorialForTaskMove(currentState, taskId, "inProgress");
  assert(
    (currentState.tutorial?.stepId as string | undefined) === TUTORIAL_STEP_ASSIGN_QA,
    "Tutorial stage smoke expected QA step.",
  );
  assert(tutorialFocusTaskId(currentState) === null, "Tutorial stage smoke expected no task focus on QA step.");

  const qaCandidate = Object.values(currentState.characters).find((character) => character.role === "qa");
  assert(Boolean(qaCandidate), "Tutorial stage smoke expected QA character.");
  if (!qaCandidate) throw new Error("Tutorial stage smoke missing QA character.");
  const qa = qaCandidate;
  assert(
    tutorialFocusCharacterId(currentState) === qa.id,
    "Tutorial stage smoke expected QA character focus on QA step.",
  );
  assert(
    canDropTutorialCharacter(currentState, qa.id, taskId).allowed,
    "Tutorial stage smoke expected allowed QA drop.",
  );
  assignCharacterToTask(currentState, qa.id, taskId);
  advanceTutorialForCharacterAssignment(currentState, qa.id, taskId);
  assert(
    (currentState.tutorial?.stepId as string | undefined) === TUTORIAL_STEP_WAIT_WORK,
    "Tutorial stage smoke expected wait step.",
  );

  for (
    let guard = 0;
    guard < 80 && (currentState.tutorial?.stepId as string | undefined) === TUTORIAL_STEP_WAIT_WORK;
    guard += 1
  ) {
    tickRealtime(currentState, 5000);
  }
  assert(
    (currentState.tutorial?.stepId as string | undefined) === TUTORIAL_STEP_MOVE_DONE,
    "Tutorial stage smoke expected done move step.",
  );
  assert(currentState.tasks[taskId]?.stageComplete, "Tutorial stage smoke expected completed task work.");
  const completedTask = currentState.tasks[taskId];
  assert(completedTask.subtasks.length === 1, "Tutorial stage smoke expected no rework subtask.");
  assert(completedTask.subtasks[0]?.role === "qa", "Tutorial stage smoke expected only QA subtask.");
  assert(completedTask.subtasks[0]?.done, "Tutorial stage smoke expected scripted QA subtask done.");
  assert(completedTask.bugs === 0, "Tutorial stage smoke expected no bugs after first QA task.");
  assert(
    !completedTask.subtasks.some((subtask) => subtask.role === "design"),
    "Tutorial stage smoke expected no design subtask in first task.",
  );
  assert(
    tutorialFocusTaskId(currentState) === taskId,
    "Tutorial stage smoke expected task focus on done move step.",
  );

  moveRealtimeTask(currentState, taskId, "done");
  advanceTutorialForTaskMove(currentState, taskId, "done");
  assert(
    currentState.tutorial?.stageId === TUTORIAL_STAGE_MULTI_WORK,
    "Tutorial stage smoke expected transition to multi-work.",
  );
  assert(currentState.tutorial?.focusTaskId !== taskId, "Tutorial stage smoke expected a new focus task.");

  return {
    name: "tutorial-stage-one",
    taskId,
    completed: currentState.tutorial?.completedStepIds.length,
    stageId: currentState.tutorial?.stageId,
    stepId: currentState.tutorial?.stepId,
  };
}

function runTutorialFullFlowSmoke() {
  const shipLateState = createTutorialRealtimeState(4305);
  progressTutorialToDeadlineChoice(shipLateState);
  const lateTaskId = shipLateState.tutorial?.focusTaskId;
  assert(typeof lateTaskId === "string", "Tutorial full smoke expected deadline task.");
  moveRealtimeTask(shipLateState, lateTaskId, "done");
  advanceTutorialForTaskMove(shipLateState, lateTaskId, "done");
  assert(shipLateState.tutorial?.stageId === TUTORIAL_STAGE_DAY_END, "Tutorial full smoke expected day-end stage.");
  assert(shipLateState.tutorial?.activeBranchId === "ship_late", "Tutorial full smoke expected late branch.");
  tickRealtime(shipLateState, 10000);
  assert(shipLateState.morningReport !== null, "Tutorial full smoke expected morning report after late branch.");
  assert(shipLateState.tutorial?.completed, "Tutorial full smoke expected tutorial completion.");
  assert(
    (shipLateState.tutorial?.stepId as string | undefined) === TUTORIAL_STEP_REPORT_READY,
    "Tutorial full smoke expected report-ready step.",
  );

  const waitState = createTutorialRealtimeState(4306);
  progressTutorialToDeadlineChoice(waitState);
  tickRealtime(waitState, 3000);
  assert(waitState.tutorial?.stageId === TUTORIAL_STAGE_DAY_END, "Tutorial full smoke expected wait day-end stage.");
  assert(waitState.tutorial?.activeBranchId === "wait_missed", "Tutorial full smoke expected wait branch.");
  assert(
    (waitState.tutorial?.stepId as string | undefined) === TUTORIAL_STEP_WAIT_DAY_END,
    "Tutorial full smoke expected wait-day-end step.",
  );

  return {
    name: "tutorial-full-flow",
    lateBranch: shipLateState.tutorial?.activeBranchId,
    waitBranch: waitState.tutorial?.activeBranchId,
    reportReady: shipLateState.tutorial?.stepId,
  };
}

function progressTutorialToDeadlineChoice(currentState: RtGameState): void {
  tickRealtime(currentState, 2500);
  completeTutorialTaskMove(currentState, "inProgress");
  completeTutorialAssignment(currentState, "qa");
  tickUntilTutorialStepChanges(currentState, TUTORIAL_STEP_WAIT_WORK);
  completeTutorialTaskMove(currentState, "done");

  completeTutorialTaskMove(currentState, "inProgress");
  completeTutorialAssignment(currentState, "backend");
  tickUntilTutorialStepChanges(currentState, "wait-backend");
  completeTutorialAssignment(currentState, "frontend");
  tickUntilTutorialStepChanges(currentState, "wait-frontend");
  completeTutorialAssignment(currentState, "qa");
  tickUntilTutorialStepChanges(currentState, "wait-qa-multi");
  completeTutorialTaskMove(currentState, "done");

  completeTutorialTaskMove(currentState, "inProgress");
  completeTutorialAssignment(currentState, "backend");
  tickUntilTutorialStepChanges(currentState, "wait-compromise-work");
  completeTutorialTaskMove(currentState, "done");

  completeTutorialTaskMove(currentState, "inProgress");
  completeTutorialAssignment(currentState, "sre");
  tickUntilTutorialStepChanges(currentState, "wait-deadline-work");
  assert(
    (currentState.tutorial?.stepId as string | undefined) === TUTORIAL_STEP_CHOOSE_DEADLINE,
    "Tutorial full smoke expected deadline choice.",
  );
}

function completeTutorialTaskMove(currentState: RtGameState, column: "inProgress" | "done"): void {
  const taskId = currentState.tutorial?.focusTaskId;
  assert(typeof taskId === "string", "Tutorial helper expected focus task.");
  if (typeof taskId !== "string") throw new Error("Tutorial helper missing focus task.");
  assert(canDropTutorialTask(currentState, taskId, column).allowed, `Tutorial helper expected ${column} move.`);
  moveRealtimeTask(currentState, taskId, column);
  advanceTutorialForTaskMove(currentState, taskId, column);
}

function completeTutorialAssignment(currentState: RtGameState, role: "backend" | "frontend" | "qa" | "sre"): void {
  const taskId = currentState.tutorial?.focusTaskId;
  assert(typeof taskId === "string", "Tutorial helper expected focus task for assignment.");
  if (typeof taskId !== "string") throw new Error("Tutorial helper missing focus task for assignment.");
  const character = Object.values(currentState.characters).find((candidate) => candidate.role === role);
  assert(Boolean(character), `Tutorial helper expected ${role}.`);
  if (!character) throw new Error(`Tutorial helper missing ${role}.`);
  assert(canDropTutorialCharacter(currentState, character.id, taskId).allowed, `Tutorial helper expected ${role} drop.`);
  assignCharacterToTask(currentState, character.id, taskId);
  advanceTutorialForCharacterAssignment(currentState, character.id, taskId);
}

function tickUntilTutorialStepChanges(currentState: RtGameState, stepId: string): void {
  for (
    let guard = 0;
    guard < 100 && (currentState.tutorial?.stepId as string | undefined) === stepId;
    guard += 1
  ) {
    tickRealtime(currentState, 5000);
  }
  assert(
    (currentState.tutorial?.stepId as string | undefined) !== stepId,
    `Tutorial helper expected step ${stepId} to advance.`,
  );
}

function runBacklogValueDecaySmoke() {
  const currentState = createRealtimeState(4242);
  assertQuarterCadence(currentState);

  const controlledTaskId = currentState.board.backlog[0];
  const controlledTask = currentState.tasks[controlledTaskId];
  assert(Boolean(controlledTask), "Backlog decay smoke expected an initial task.");
  controlledTask.baseValue = 40;
  controlledTask.value = 40;
  controlledTask.backlogValue = 40;
  controlledTask.backlogDecayElapsedMs = 0;
  controlledTask.backlogDecayDurationMs = 300000;
  controlledTask.deadlineMs = 300000;
  controlledTask.deadlineMaxMs = 300000;

  tickRealtime(currentState, 120000);
  assert(controlledTask.deadlineMs === 300000, "Untouched backlog task deadline should not tick.");
  assert(controlledTask.backlogValue < 40, "Untouched backlog task value should decay.");

  const committedValue = Math.max(1, Math.round(controlledTask.backlogValue));
  assert(moveRealtimeTask(currentState, controlledTask.id, "inProgress"), "Backlog decay smoke move failed.");
  assert(controlledTask.engagedOnce, "Backlog decay smoke expected task committed.");
  assert(controlledTask.value === committedValue, "Backlog decay smoke expected value fixed on commit.");
  assert(controlledTask.deadlineMs === 300000, "Backlog decay smoke expected full deadline on commit.");

  return {
    name: "backlog-value-decay",
    committedValue: controlledTask.value,
    baseValue: controlledTask.baseValue,
  };
}

function runBacklogOpportunityExpirationSmoke() {
  const currentState = createRealtimeState(4343);
  assertQuarterCadence(currentState);
  const initialDebt = currentState.resources.debt;
  const expiringTaskIds = currentState.board.backlog.slice(0, 2);
  assert(expiringTaskIds.length >= 2, "Backlog expiration smoke expected two initial backlog tasks.");

  for (const taskId of expiringTaskIds) {
    const task = currentState.tasks[taskId];
    assert(Boolean(task), "Backlog expiration smoke expected task.");
    task.baseValue = 120;
    task.value = 120;
    task.backlogValue = 120;
    task.backlogDecayElapsedMs = 0;
    task.backlogDecayDurationMs = 1000;
  }

  tickRealtime(currentState, 1500);
  const expiredTasks = expiringTaskIds.map((taskId) => currentState.tasks[taskId]);
  assert(
    expiredTasks.every((task) => task.resolved && task.resolution === "backlog_opportunity_expired"),
    "Backlog expiration smoke expected resolved expired tasks.",
  );
  assert(currentState.backlogDecayToday.expiredCount === 2, "Backlog expiration smoke expected two expirations.");
  assert(currentState.backlogDecayToday.debtAdded === 6, "Backlog expiration smoke expected daily debt cap.");
  assert(currentState.resources.debt === initialDebt + 6, "Backlog expiration smoke expected capped debt applied.");
  assert(
    expiringTaskIds.every((taskId) => !currentState.board.backlog.includes(taskId)),
    "Backlog expiration smoke expected tasks removed from backlog.",
  );

  tickToMorningReport(currentState);
  const report = currentState.morningReport;
  assert(report !== null, "Backlog expiration smoke expected morning report.");
  assert(report.daySummary.backlogExpiredCount === 2, "Backlog expiration smoke expected report expirations.");
  assert(report.daySummary.backlogDebtAdded === 6, "Backlog expiration smoke expected report debt.");
  assert(report.consequences.length === 0, "Backlog expiration smoke expected no fallout consequences.");

  return {
    name: "backlog-opportunity-expiration",
    expired: report.daySummary.backlogExpiredCount,
    debtAdded: report.daySummary.backlogDebtAdded,
  };
}

function runTechDebtReleaseSinkSmoke() {
  const currentState = createRealtimeState(4444);
  assertQuarterCadence(currentState);
  currentState.resources.debt = 80;

  const controlledTaskId = currentState.board.backlog[0];
  const controlledTask = currentState.tasks[controlledTaskId];
  assert(Boolean(controlledTask), "Tech debt sink smoke expected an initial task.");
  configureCleanReleaseTask(controlledTask);
  setSmokeTaskKind(currentState, controlledTask, "techDebt");
  controlledTask.value = 32;
  controlledTask.baseValue = 32;
  controlledTask.backlogValue = 32;

  assert(moveRealtimeTask(currentState, controlledTask.id, "inProgress"), "Tech debt sink smoke move failed.");
  assert(moveRealtimeTask(currentState, controlledTask.id, "done"), "Tech debt sink smoke done move failed.");
  runDailyReleaseTrain(currentState);

  assert(controlledTask.released, "Tech debt sink smoke expected released task.");
  assert(currentState.resources.debt <= 72, "Tech debt sink smoke expected meaningful debt reduction.");

  return {
    name: "tech-debt-release-sink",
    debt: currentState.resources.debt,
    releaseScore: controlledTask.releaseScore,
  };
}

function runMigrationNormalizationSmoke() {
  const currentState = createRealtimeState(999);
  const legacyState = currentState as unknown as {
    locale: unknown;
    daysPerQuarter: number;
    backlogDecayToday?: RtGameState["backlogDecayToday"];
    narrativeBudget?: RtGameState["narrativeBudget"];
    morningReport?: RtGameState["morningReport"];
  };
  const controlledTaskId = currentState.board.backlog[0];
  const controlledTask = currentState.tasks[controlledTaskId];
  assert(Boolean(controlledTask), "Migration smoke expected an initial task.");

  legacyState.locale = "de";
  legacyState.daysPerQuarter = 1;
  delete legacyState.backlogDecayToday;
  delete legacyState.narrativeBudget;
  delete legacyState.morningReport;
  controlledTask.overdueMs = -120;
  controlledTask.postmortem = [
    "Source task: PAY-001.",
    "Root cause: PAY-001.",
    "Keep this note.",
    "Keep this note.",
  ];

  const changed = normalizeRealtimeState(currentState);
  assert(changed, "Migration smoke expected state changes.");
  assert(currentState.locale === "en", "Migration smoke expected invalid locale to normalize.");
  assertQuarterCadence(currentState);
  assert(currentState.morningReport === null, "Migration smoke expected missing morning report to normalize.");
  assert(currentState.backlogDecayToday.expiredCount === 0, "Migration smoke expected backlog stats backfill.");
  assert(currentState.narrativeBudget.flavorWindowTaskIds.length === 0, "Migration smoke expected narrative budget.");
  assert(controlledTask.overdueMs === 0, "Migration smoke expected overdue clamp.");
  assert(Boolean(controlledTask.narrativeRef), "Migration smoke expected current narrative ref to remain intact.");
  assert(
    controlledTask.postmortem.length === 1 && controlledTask.postmortem[0] === "Keep this note.",
    "Migration smoke expected postmortem cleanup.",
  );

  return {
    name: "migration-normalization",
    locale: currentState.locale,
    daysPerQuarter: currentState.daysPerQuarter,
    narrativeWindow: currentState.narrativeBudget.flavorWindowTaskIds.length,
  };
}

function runDebugSnapshotSmoke() {
  const currentState = createRealtimeState(1001, "ru");
  const snapshot = buildDebugSnapshot(currentState, "debug-session");
  const backendSnapshot = buildBackendSnapshot(snapshot);

  assert(snapshot.sessionId === "debug-session", "Snapshot smoke expected session id.");
  assert(snapshot.locale === "ru", "Snapshot smoke expected locale.");
  assert(snapshot.logger.backendUrl.includes("/api/log"), "Snapshot smoke expected backend url.");
  assert(snapshot.logger.queuedEntries === 0, "Snapshot smoke expected empty backend queue in Node.");
  assert(backendSnapshot.sessionId === snapshot.sessionId, "Backend snapshot smoke expected session id.");
  assert(Array.isArray(backendSnapshot.recentEvents), "Backend snapshot smoke expected recent events.");
  for (const column of RT_COLUMNS) {
    assert(
      backendSnapshot.boardCounts[column] === currentState.board[column].length,
      `Backend snapshot smoke expected ${column} count.`,
    );
    assert(
      backendSnapshot.visibleTasks[column].length === currentState.board[column].length,
      `Backend snapshot smoke expected ${column} visible tasks.`,
    );
  }

  return {
    name: "debug-snapshot",
    status: backendSnapshot.status,
    loggerQueued: backendSnapshot.logger.queuedEntries,
    boardCounts: backendSnapshot.boardCounts,
  };
}

function runLogSizeBudgetSmoke() {
  const currentState = createRealtimeState(8301);
  const event = currentState.log[0];
  assert(event !== undefined, "Log size smoke expected an initial event.");

  const eventEntry = createLogEntry(
    "log-size-smoke",
    "event",
    event.type,
    buildGameEventTelemetry(currentState, event),
  );
  const eventBytes = byteLength(eventEntry);
  assert(eventBytes < 2500, `Log size smoke expected compact event, got ${eventBytes} bytes.`);

  for (let guard = 0; guard < 160 && !currentState.morningReport; guard += 1) {
    tickRealtime(currentState, 5000);
  }
  assert(currentState.morningReport !== null, "Log size smoke expected a morning report.");

  const summaryEntry = createLogEntry(
    "log-size-smoke",
    "summary",
    "day_summary",
    buildDaySummaryTelemetry(currentState, currentState.morningReport),
  );
  const summaryBytes = byteLength(summaryEntry);
  assert(summaryBytes < 8000, `Log size smoke expected compact summary, got ${summaryBytes} bytes.`);

  const snapshotEntry = createLogEntry(
    "log-size-smoke",
    "snapshot",
    "debug_snapshot",
    buildBackendSnapshot(buildDebugSnapshot(currentState, "log-size-smoke")),
  );
  const snapshotBytes = byteLength(snapshotEntry);
  assert(snapshotBytes > eventBytes, "Log size smoke expected snapshot to remain separate from events.");

  return {
    name: "log-size-budget",
    eventBytes,
    summaryBytes,
    snapshotBytes,
  };
}

function byteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function runOutsourceSmoke() {
  const currentState = createRealtimeState(2002);
  const controlledTaskId = currentState.board.backlog[0];
  const controlledTask = currentState.tasks[controlledTaskId];
  assert(Boolean(controlledTask), "Outsource smoke expected an initial task.");
  currentState.resources.budget = 6;
  configureOutsourceTask(controlledTask);
  assert(moveRealtimeTask(currentState, controlledTask.id, "inProgress"), "Outsource smoke move failed.");

  const status = getOutsourceTaskWorkStatus(currentState, controlledTask.id);
  assert(status.allowed, `Outsource smoke expected ready status, got ${status.reason}.`);
  assert(status.cost === 4, "Outsource smoke expected important work cost.");
  assert(status.subtask?.role === "backend", "Outsource smoke expected backend subtask.");
  assert(outsourceTaskWork(currentState, controlledTask.id), "Outsource smoke expected work to start.");
  assert(currentState.resources.budget === 2, "Outsource smoke expected budget payment.");
  assert(controlledTask.outsourcing?.subtaskId === status.subtask.id, "Outsource smoke expected active outsourcing.");
  assert(controlledTask.currentSubtaskId === status.subtask.id, "Outsource smoke expected current subtask.");
  const busyStatus = getOutsourceTaskWorkStatus(currentState, controlledTask.id);
  assert(!busyStatus.allowed && busyStatus.reason === "task_busy", "Outsource smoke expected busy blocker.");
  tickUntilOutsourcingIdleInState(currentState, controlledTask.id, 900);
  const completedEvent = currentState.log.find(
    (event) =>
      isWorkPassCompletedEvent(event) &&
      event.data?.actorType === "outsource" &&
      event.data.taskId === controlledTask.id,
  );
  assert(completedEvent !== undefined, "Outsource smoke expected completed work event.");
  assert(completedEvent.type === "subtask_done", "Outsource smoke expected outsourced subtask_done event.");
  assert(completedEvent.data?.subtaskId === status.subtask.id, "Outsource smoke expected subtask id in event.");
  assert(completedEvent.data?.subtaskRole === "backend", "Outsource smoke expected subtask role in event.");
  assert(controlledTask.outsourcing === null, "Outsource smoke expected outsourcing cleared after completion.");
  assert(status.subtask.done, "Outsource smoke expected subtask done after completion.");

  return {
    name: "outsource-status",
    budget: currentState.resources.budget,
    blockerAfterStart: busyStatus.reason,
    subtaskRole: status.subtask.role,
    completedActor: completedEvent.data?.actorType,
  };
}

function runOutsourcedQaCoverageSmoke() {
  const currentState = createRealtimeState(2102);
  const controlledTaskId = currentState.board.backlog[0];
  const controlledTask = currentState.tasks[controlledTaskId];
  assert(Boolean(controlledTask), "Outsourced QA smoke expected an initial task.");
  currentState.resources.budget = 4;
  configureOutsourcedQaTask(controlledTask);
  assert(moveRealtimeTask(currentState, controlledTask.id, "inProgress"), "Outsourced QA smoke move failed.");

  const status = getOutsourceTaskWorkStatus(currentState, controlledTask.id);
  assert(status.allowed, `Outsourced QA smoke expected ready status, got ${status.reason}.`);
  assert(status.subtask?.role === "qa", "Outsourced QA smoke expected QA subtask.");
  assert(outsourceTaskWork(currentState, controlledTask.id), "Outsourced QA smoke expected work to start.");
  tickUntilOutsourcingIdleInState(currentState, controlledTask.id, 900);

  const qaSubtask = controlledTask.subtasks.find((subtask) => subtask.role === "qa");
  const readiness = releaseReadiness(controlledTask);
  assert(qaSubtask !== undefined, "Outsourced QA smoke expected QA subtask.");
  assert(qaSubtask.done, "Outsourced QA smoke expected QA subtask done.");
  assert(qaSubtask.completedBy === "outsourcing", "Outsourced QA smoke expected outsourced completion.");
  assert(controlledTask.testCoverage >= 45, "Outsourced QA smoke expected real test coverage.");
  assert(!readiness.reasons.includes("no_qa"), "Outsourced QA smoke expected no_qa cleared.");
  const completedEvent = currentState.log.find(
    (event) =>
      isWorkPassCompletedEvent(event) &&
      event.data?.actorType === "outsource" &&
      event.data.taskId === controlledTask.id &&
      event.data.subtaskRole === "qa",
  );
  assert(completedEvent !== undefined, "Outsourced QA smoke expected completed work event.");
  assert(completedEvent.type === "qa_done", "Outsourced QA smoke expected qa_done event.");
  assert(completedEvent.data?.workType === "qa", "Outsourced QA smoke expected qa work type.");

  return {
    name: "outsourced-qa-coverage",
    testCoverage: controlledTask.testCoverage,
    readiness: readiness.readiness,
    completedActor: completedEvent.data?.actorType,
  };
}

function runPartialQaCoverageSmoke() {
  const currentState = createRealtimeState(2301);
  const controlledTaskId = currentState.board.backlog[0];
  const controlledTask = currentState.tasks[controlledTaskId];
  assert(Boolean(controlledTask), "Partial QA smoke expected an initial task.");
  configurePartialQaTask(controlledTask);
  assert(moveRealtimeTask(currentState, controlledTask.id, "inProgress"), "Partial QA smoke move failed.");

  const frontend = Object.values(currentState.characters).find((character) => character.role === "frontend");
  const qa = Object.values(currentState.characters).find((character) => character.role === "qa");
  assert(frontend !== undefined, "Partial QA smoke expected frontend character.");
  assert(qa !== undefined, "Partial QA smoke expected QA character.");
  assert(assignCharacterToTask(currentState, frontend.id, controlledTask.id), "Partial QA smoke assign failed.");
  tickUntilTaskIdleInState(currentState, controlledTask.id, 900);

  const qaSubtask = controlledTask.subtasks.find((subtask) => subtask.role === "qa");
  const readiness = releaseReadiness(controlledTask);
  assert(qaSubtask !== undefined, "Partial QA smoke expected QA subtask.");
  assert(!qaSubtask.done, "Partial QA smoke expected QA subtask to remain open.");
  assert(controlledTask.testCoverage < 45, "Partial QA smoke expected coverage below threshold.");
  assert(readiness.reasons.includes("no_qa"), "Partial QA smoke expected no_qa to remain.");
  assert(canAssignCharacterToTask(currentState, qa.id, controlledTask.id), "Partial QA smoke expected QA reassignment.");
  assert(/QA coverage is partial/.test(controlledTask.lastNote), "Partial QA smoke expected partial coverage note.");
  const partialQaComment = controlledTask.comments.find(
    (comment) => comment.narrativeId === "signal.partial-qa-coverage",
  );
  assert(Boolean(partialQaComment), "Partial QA smoke expected signal comment.");
  if (!partialQaComment) throw new Error("Partial QA smoke missing signal comment.");
  assert(
    renderTaskComment(partialQaComment, "ru").includes("QA-покрытие частичное"),
    "Partial QA smoke expected localized comment render.",
  );

  return {
    name: "partial-qa-coverage",
    testCoverage: controlledTask.testCoverage,
    qaSubtaskDone: qaSubtask.done,
    qaSubtaskProgress: qaSubtask.progress,
    canReassignQa: true,
    comments: controlledTask.comments.length,
  };
}

function runQaRecheckSmoke() {
  const currentState = createRealtimeState(3003);
  const controlledTaskId = currentState.board.backlog[0];
  const controlledTask = currentState.tasks[controlledTaskId];
  assert(Boolean(controlledTask), "QA recheck smoke expected an initial task.");
  configureImplementationAfterQaTask(controlledTask);
  assert(moveRealtimeTask(currentState, controlledTask.id, "inProgress"), "QA recheck smoke move failed.");
  const backend = Object.values(currentState.characters).find((character) => character.role === "backend");
  assert(backend !== undefined, "QA recheck smoke expected backend character.");
  assert(assignCharacterToTask(currentState, backend.id, controlledTask.id), "QA recheck smoke assign failed.");
  tickUntilTaskIdleInState(currentState, controlledTask.id, 900);

  const recheck = controlledTask.subtasks.find(
    (subtask) => subtask.role === "qa" && subtask.revealed && !subtask.done,
  );
  assert(controlledTask.changedAfterQa, "QA recheck smoke expected changedAfterQa.");
  assert(controlledTask.testCoverage <= 35, "QA recheck smoke expected stale coverage cap.");
  assert(Boolean(recheck), "QA recheck smoke expected open QA recheck subtask.");
  assert(
    currentState.log.some((event) => event.effects.includes("QA recheck required")),
    "QA recheck smoke expected event marker.",
  );
  assert(
    controlledTask.comments.some((comment) => comment.narrativeId === "signal.changed-after-qa"),
    "QA recheck smoke expected changed-after-QA signal comment.",
  );

  return {
    name: "qa-recheck",
    changedAfterQa: controlledTask.changedAfterQa,
    testCoverage: controlledTask.testCoverage,
    recheckId: recheck?.id,
    comments: controlledTask.comments.length,
  };
}

function runCharacterEventPayloadSmoke() {
  const currentState = createRealtimeState(3103);
  const controlledTaskId = currentState.board.backlog[0];
  const controlledTask = currentState.tasks[controlledTaskId];
  assert(Boolean(controlledTask), "Character event payload smoke expected an initial task.");
  configureOutsourceTask(controlledTask);
  assert(moveRealtimeTask(currentState, controlledTask.id, "inProgress"), "Character payload smoke move failed.");

  const backend = Object.values(currentState.characters).find((character) => character.role === "backend");
  assert(backend !== undefined, "Character payload smoke expected backend character.");
  assert(assignCharacterToTask(currentState, backend.id, controlledTask.id), "Character payload smoke assign failed.");
  tickUntilTaskIdleInState(currentState, controlledTask.id, 900);

  const assignedEvent = currentState.log.find((event) => event.type === "assigned");
  const completedEvent = currentState.log.find((event) => event.type === "subtask_done");
  assert(assignedEvent?.data?.characterId === backend.id, "Assigned event should include characterId.");
  assert(completedEvent?.data?.characterId === backend.id, "Completion event should include characterId.");
  assert(completedEvent.data.taskId === controlledTask.id, "Completion event should include taskId.");
  assert(completedEvent.data.subtaskRole === "backend", "Completion event should include subtaskRole.");
  assert(completedEvent.data.workPassCompleted === true, "Completion event should mark work pass completed.");
  assert(completedEvent.data.actorType === "character", "Completion event should include character actor type.");
  assert(completedEvent.data.actorId === backend.id, "Completion event should include actor id.");

  return {
    name: "character-event-payload",
    characterId: completedEvent.data.characterId,
    actorType: completedEvent.data.actorType,
    taskId: completedEvent.data.taskId,
    subtaskRole: completedEvent.data.subtaskRole,
  };
}

function runDragRejectHelperSmoke() {
  const currentState = createRealtimeState(4004);
  const controlledTaskId = currentState.board.backlog[0];
  const controlledTask = currentState.tasks[controlledTaskId];
  const character = Object.values(currentState.characters)[0];
  assert(Boolean(controlledTask), "Drag reject smoke expected an initial task.");
  assert(Boolean(character), "Drag reject smoke expected an initial character.");

  assert(
    characterDropRejectReason(currentState, "missing-character", controlledTask) === "character missing",
    "Drag reject smoke expected missing character reason.",
  );
  assert(
    characterDropRejectReason(currentState, character.id, controlledTask) === "wrong column",
    "Drag reject smoke expected wrong column reason.",
  );

  controlledTask.column = "inProgress";
  controlledTask.subtasks = [];
  currentState.board.backlog = currentState.board.backlog.filter((taskId) => taskId !== controlledTask.id);
  currentState.board.inProgress.push(controlledTask.id);
  assert(
    characterDropRejectReason(currentState, character.id, controlledTask) === "no matching visible work",
    "Drag reject smoke expected no visible work reason.",
  );

  character.assignedTaskId = controlledTask.id;
  assert(
    characterDropRejectReason(currentState, character.id, controlledTask) === "character already busy",
    "Drag reject smoke expected busy character reason.",
  );

  character.assignedTaskId = null;
  character.exhaustedToday = true;
  assert(
    characterDropRejectReason(currentState, character.id, controlledTask) === "character exhausted",
    "Drag reject smoke expected exhausted character reason.",
  );

  character.exhaustedToday = false;
  controlledTask.assignedCharacterId = character.id;
  assert(
    characterDropRejectReason(currentState, character.id, controlledTask) === "task already in work",
    "Drag reject smoke expected busy task reason.",
  );

  return {
    name: "drag-reject-helper",
    checked: 5,
  };
}

function tickToMorningReport(currentState: RtGameState): void {
  currentState.gameMinuteOfDay = RELEASE_TRAIN_GAME_MINUTE - 0.5;
  tickRealtime(currentState, 1000);
  assert(Boolean(currentState.morningReport), "Expected release train to open morning report.");
  assert(currentState.paused, "Expected morning report to pause the run.");
}

function tickUntilOutsourcingIdleInState(currentState: RtGameState, taskId: string, limit: number): void {
  for (let index = 0; index < limit; index += 1) {
    const task = currentState.tasks[taskId];
    if (!task?.outsourcing) return;
    tickRealtime(currentState, 500);
  }
}

function setSmokeTaskKind(currentState: RtGameState, task: RtTask, kind: RtTask["kind"]): void {
  task.kind = kind;
  task.narrativeRef = createTaskNarrativeRef(currentState, kind, task.domain);
  task.title = `${task.id}: ${task.narrativeRef.archetypeId}`;
}

function configureCleanReleaseTask(task: RtTask): void {
  task.domain = "payments";
  setSmokeTaskKind(state, task, "integration");
  task.blastRadius = "low";
  task.pressure = 1;
  task.complexity = 1;
  task.value = 20;
  task.clarity = 100;
  task.quality = 100;
  task.testCoverage = 100;
  task.bugs = 0;
  task.changedAfterQa = false;
  task.workDone = true;
  task.deadlineMs = 300000;
  task.deadlineMaxMs = 300000;
  task.subtasks = [
    completeSubtask(task, "backend", "critical", "Implement integration contract"),
    completeSubtask(task, "qa", "important", "Validate failure modes"),
    completeSubtask(task, "sre", "important", "Handle timeouts and retries"),
  ];
}

function configureMissedMajorTask(task: RtTask): void {
  task.domain = "payments";
  setSmokeTaskKind(state, task, "integration");
  task.blastRadius = "high";
  task.pressure = 5;
  task.complexity = 4;
  task.value = 42;
  task.clarity = 70;
  task.quality = 40;
  task.testCoverage = 0;
  task.bugs = 1;
  task.changedAfterQa = false;
  task.workDone = false;
  task.deadlineMs = 0;
  task.deadlineMaxMs = 300000;
}

function configureOutsourceTask(task: RtTask): void {
  task.domain = "payments";
  setSmokeTaskKind(state, task, "integration");
  task.blastRadius = "medium";
  task.pressure = 2;
  task.complexity = 2;
  task.value = 24;
  task.clarity = 80;
  task.quality = 50;
  task.testCoverage = 0;
  task.bugs = 0;
  task.changedAfterQa = false;
  task.workDone = false;
  task.assignedCharacterId = null;
  task.outsourcing = null;
  task.currentSubtaskId = null;
  task.stageProgress = 0;
  task.stageComplete = false;
  task.subtasks = [
    openSubtask(task, "backend", "important", "Implement integration contract"),
  ];
}

function configureImplementationAfterQaTask(task: RtTask): void {
  task.domain = "admin";
  setSmokeTaskKind(state, task, "feature");
  task.blastRadius = "medium";
  task.pressure = 1;
  task.complexity = 1;
  task.value = 18;
  task.clarity = 100;
  task.quality = 88;
  task.testCoverage = 82;
  task.bugs = 0;
  task.changedAfterQa = false;
  task.workDone = false;
  task.assignedCharacterId = null;
  task.outsourcing = null;
  task.currentSubtaskId = null;
  task.stageProgress = 0;
  task.stageComplete = false;
  task.subtasks = [
    openSubtask(task, "backend", "important", "Patch service behavior"),
  ];
}

function configureOutsourcedQaTask(task: RtTask): void {
  task.domain = "admin";
  setSmokeTaskKind(state, task, "bug");
  task.blastRadius = "low";
  task.pressure = 1;
  task.complexity = 2;
  task.value = 18;
  task.clarity = 80;
  task.quality = 94;
  task.testCoverage = 0;
  task.bugs = 0;
  task.changedAfterQa = false;
  task.workDone = true;
  task.assignedCharacterId = null;
  task.outsourcing = null;
  task.currentSubtaskId = null;
  task.stageProgress = 0;
  task.stageComplete = false;
  task.subtasks = [
    completeSubtask(task, "frontend", "critical", "Fix root cause"),
    openSubtask(task, "qa", "important", "Reproduce and verify fix"),
  ];
}

function configurePartialQaTask(task: RtTask): void {
  task.domain = "payments";
  setSmokeTaskKind(state, task, "feature");
  task.blastRadius = "low";
  task.pressure = 1;
  task.complexity = 1;
  task.value = 18;
  task.clarity = 100;
  task.quality = 100;
  task.testCoverage = 0;
  task.bugs = 0;
  task.changedAfterQa = false;
  task.workDone = true;
  task.assignedCharacterId = null;
  task.outsourcing = null;
  task.currentSubtaskId = null;
  task.stageProgress = 0;
  task.stageComplete = false;
  task.subtasks = [
    completeSubtask(task, "backend", "critical", "Implement integration contract"),
    openSubtask(task, "qa", "important", "Validate happy path and edge cases"),
  ];
}

function completeSubtask(
  task: RtTask,
  role: RtTask["subtasks"][number]["role"],
  importance: RtTask["subtasks"][number]["importance"],
  title: string,
): RtTask["subtasks"][number] {
  return {
    id: `${task.id}-${role}-debug`,
    title,
    role,
    importance,
    revealed: true,
    done: true,
    progress: 100,
    completedBy: "debug",
    offRole: false,
  };
}

function openSubtask(
  task: RtTask,
  role: RtTask["subtasks"][number]["role"],
  importance: RtTask["subtasks"][number]["importance"],
  title: string,
): RtTask["subtasks"][number] {
  return {
    id: `${task.id}-${role}-debug-open`,
    title,
    role,
    importance,
    revealed: true,
    done: false,
    progress: 0,
    completedBy: null,
    offRole: false,
  };
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function pickWorkerForTask(taskId: string): string | null {
  const task = state.tasks[taskId];
  if (!task) return null;
  const open = task.subtasks.filter((subtask) => subtask.revealed && !subtask.done);
  const implementation = open.filter((subtask) => subtask.role !== "qa");
  const target =
    task.bugs > 0
      ? open.find((subtask) => subtask.role === "qa") ?? open[0]
      : (task.workDone && implementation.length === 0 ? open : implementation)[0];
  const available = Object.values(state.characters).filter((character) => !character.assignedTaskId);
  const eligible = available.filter((character) => canAssignCharacterToTask(state, character.id, taskId));
  if (!target) return eligible[0]?.id ?? null;
  const matchingRole = target.role === "design" ? "designer" : target.role === "bugfix" ? "backend" : target.role;
  return (
    eligible.find((character) => character.role === matchingRole)?.id ??
    eligible.sort((a, b) => b.specialty[target.role] - a.specialty[target.role])[0]?.id ??
    null
  );
}

function isTaskReadyForDone(taskId: string): boolean {
  const task = state.tasks[taskId];
  if (!task) return false;
  return (
    task.workDone &&
    task.bugs === 0 &&
    task.subtasks.filter((subtask) => subtask.revealed && !subtask.done).length === 0
  );
}
