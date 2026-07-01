import {
  DEFAULT_LOCALE,
  normalizeLocale,
  type Locale,
} from "../i18n";
import {
  BACKLOG_LIMIT,
  BURST_INTERVAL_MAX_MS,
  BURST_INTERVAL_MIN_MS,
  DAYS_PER_QUARTER,
  FALLOUT_BACKLOG_EXTRA_SLOTS,
  FIRST_SPAWN_MAX_MS,
  FIRST_SPAWN_MIN_MS,
  GAME_DAY_START_MINUTE,
  GAME_MINUTES_PER_REAL_SECOND,
  LOW_WORK_SPAWN_MAX_MS,
  LOW_WORK_SPAWN_MIN_MS,
  MAX_FALLOUT_CHAIN_DEPTH,
  NIGHT_STAMINA_MIN_RECOVERY,
  NIGHT_STAMINA_RECOVERY_RATIO,
  OUTSOURCE_COST_BY_IMPORTANCE,
  RELEASE_TRAIN_GAME_MINUTE,
  SPAWN_INTERVAL_MAX_MS,
  SPAWN_INTERVAL_MIN_MS,
  TICK_MS,
  WORK_SPEED_MULTIPLIER,
} from "../engine/balance";
import {
  canMoveTaskOnBoard,
  createBoard,
  getOpenTodoSubtasks,
  moveTaskOnBoard,
  removeTaskFromBoard,
  taskBusy,
} from "../engine/board";
import {
  BASE_SKILLS,
  BASE_SPECIALTIES,
  CHARACTER_NAMES,
  DOMAIN_PREFIXES,
} from "../engine/catalog";
import { clamp } from "../engine/math";
import {
  chance,
  randomBetween,
} from "../engine/rng";
import { generateTask, inferBlastRadius } from "../engine/taskFactory";
import {
  addPostmortemNote,
  assignCharacterToTaskWork,
  canAssignCharacterToTaskWork,
  cancelTaskWorkInternal,
  ensureBugReviewSubtask,
  ensureQaRecheckSubtask,
  importanceWeight,
  isBugfixWork,
  updateAssignments,
} from "../engine/work";
import {
  applyResourceDelta,
  copyResources,
  diffResources,
  emptyResourceDelta,
  formatDelta,
  morningReportEffects,
  resourceDeltaEffects,
} from "../engine/resources";
import {
  falloutWarningForTask,
  formatOverdueGameTime,
  formatRiskReason,
  lateReleaseReport,
  releaseReadiness,
  releaseScore,
  taskDeadlineRatio,
} from "../engine/readiness";
import {
  RT_COLUMNS,
  type RtBlastRadius,
  type RtCharacter,
  type RtColumn,
  type RtConsequenceSource,
  type RtDaySummary,
  type RtEvent,
  type RtFalloutWarning,
  type RtGameState,
  type RtLateReleaseReport,
  type RtLossReport,
  type RtMorningReport,
  type RtMoveBlockReason,
  type RtMoveCheck,
  type RtOutsourceBlockReason,
  type RtOutsourcePlan,
  type RtOutsourceStatus,
  type RtOutsourcingWork,
  type RtQuarterReviewReport,
  type RtReadinessReport,
  type RtReleaseConsequence,
  type RtReleaseConsequenceCause,
  type RtReleaseReadiness,
  type RtResources,
  type RtRiskReason,
  type RtRole,
  type RtRunStatus,
  type RtStage,
  type RtSubtask,
  type RtTask,
  type RtTaskKind,
  type RtTaskResolution,
  type RtWorkColumn,
} from "../engine/types";
export {
  DAYS_PER_QUARTER,
  DONE_REWORK_TRUST_COST,
  GAME_DAY_MINUTES,
  GAME_DAY_START_MINUTE,
  GAME_MINUTES_PER_REAL_SECOND,
  GAME_MINUTES_PER_TICK,
  OUTSOURCE_COST_BY_IMPORTANCE,
  RELEASE_TRAIN_GAME_MINUTE,
  TICK_MS,
} from "../engine/balance";
export { RT_COLUMNS } from "../engine/types";
export {
  falloutWarningForTask,
  formatOverdueGameTime,
  formatRiskReason,
  lateReleaseReport,
  releaseReadiness,
  releaseScore,
  taskDeadlineRatio,
} from "../engine/readiness";
export type {
  RtBlastRadius,
  RtCharacter,
  RtColumn,
  RtConsequenceSource,
  RtDaySummary,
  RtEvent,
  RtFalloutWarning,
  RtGameState,
  RtLateReleaseReport,
  RtLossReport,
  RtMorningReport,
  RtMoveBlockReason,
  RtMoveCheck,
  RtOutsourceBlockReason,
  RtOutsourceStatus,
  RtOutsourcingWork,
  RtQuarterReviewReport,
  RtReadinessReport,
  RtReleaseConsequence,
  RtReleaseConsequenceCause,
  RtReleaseReadiness,
  RtResources,
  RtRiskReason,
  RtRole,
  RtRunStatus,
  RtStage,
  RtSubtask,
  RtSubtaskImportance,
  RtSubtaskRole,
  RtTask,
  RtTaskKind,
  RtTaskResolution,
  RtWorkColumn,
} from "../engine/types";

export function createRealtimeState(seed = Date.now(), locale: Locale = DEFAULT_LOCALE): RtGameState {
  const state: RtGameState = {
    seed: seed >>> 0 || 1,
    rngState: seed >>> 0 || 1,
    locale,
    paused: false,
    status: "running",
    lossReason: null,
    lossReport: null,
    elapsedRealMs: 0,
    elapsedGameMinutes: GAME_DAY_START_MINUTE,
    gameMinuteOfDay: GAME_DAY_START_MINUTE,
    day: 1,
    quarter: 1,
    dayInQuarter: 1,
    daysPerQuarter: DAYS_PER_QUARTER,
    resources: {
      trust: 70,
      debt: 20,
      value: 0,
      clients: 100,
      budget: 4,
      processBoost: 0,
    },
    quarterGoal: {
      value: 75,
      trust: 45,
      rewardBudget: 2,
    },
    quarterValue: 0,
    morningReport: null,
    board: createBoard(),
    tasks: {},
    characters: {},
    nextTaskId: 1,
    nextCharacterId: 1,
    spawn: {
      nextInMs: randomBetween(
        { rngState: seed >>> 0 || 1 },
        FIRST_SPAWN_MIN_MS,
        FIRST_SPAWN_MAX_MS,
      ),
      nextBurstInMs: randomBetween(
        { rngState: seed >>> 0 || 1 },
        BURST_INTERVAL_MIN_MS,
        BURST_INTERVAL_MAX_MS,
      ),
    },
    log: [],
  };

  for (const role of ["analyst", "backend", "frontend", "qa", "sre"] as RtRole[]) {
    const character = createCharacter(state, role);
    state.characters[character.id] = character;
  }

  for (let index = 0; index < 2; index += 1) {
    addTask(state, generateTask(state));
  }

  pushEvent(state, {
    type: "run_started",
    title: "Run started",
    body: "Realtime flow is live.",
    effects: ["trust 70", "clients 100", "day starts at 08:00"],
  });

  return state;
}

export function normalizeRealtimeState(state: RtGameState): boolean {
  let changed = false;
  const board = state.board as Record<string, string[] | undefined>;
  const legacyState = state as RtGameState & {
    releaseReview?: RtMorningReport | null;
    morningReport?: RtMorningReport | null;
    locale?: Locale;
  };

  const normalizedLocale = normalizeLocale(legacyState.locale);
  if (state.locale !== normalizedLocale) {
    state.locale = normalizedLocale;
    changed = true;
  }

  if (!("morningReport" in legacyState)) {
    state.morningReport = null;
    changed = true;
  }
  if (legacyState.releaseReview && !state.morningReport) {
    state.morningReport = {
      ...legacyState.releaseReview,
      previousDay: legacyState.releaseReview.previousDay ?? legacyState.releaseReview.day,
      at: "08:00",
      releaseDelta:
        (legacyState.releaseReview as RtMorningReport & { releaseDelta?: RtResources })
          .releaseDelta ?? emptyResourceDelta(),
      consequenceDelta:
        (legacyState.releaseReview as RtMorningReport & { consequenceDelta?: RtResources })
          .consequenceDelta ?? emptyResourceDelta(),
      quarterReview:
        (legacyState.releaseReview as RtMorningReport & {
          quarterReview?: RtQuarterReviewReport | null;
        }).quarterReview ?? null,
      missedTaskIds: legacyState.releaseReview.missedTaskIds ?? [],
      consequences: legacyState.releaseReview.consequences ?? [],
      daySummary:
        legacyState.releaseReview.daySummary ??
        emptyDaySummary(legacyState.releaseReview.day ?? state.day),
    };
    changed = true;
  }
  if (state.morningReport) {
    const legacyMorningReport = state.morningReport as RtMorningReport & {
      releaseDelta?: RtResources;
      consequenceDelta?: RtResources;
      quarterReview?: RtQuarterReviewReport | null;
    };
    if (!Array.isArray(state.morningReport.missedTaskIds)) {
      state.morningReport.missedTaskIds = [];
      changed = true;
    }
    if (!state.morningReport.daySummary) {
      state.morningReport.daySummary = emptyDaySummary(state.morningReport.previousDay);
      changed = true;
    }
    if (!legacyMorningReport.releaseDelta) {
      legacyMorningReport.releaseDelta = emptyResourceDelta();
      changed = true;
    }
    if (!legacyMorningReport.consequenceDelta) {
      legacyMorningReport.consequenceDelta = emptyResourceDelta();
      changed = true;
    }
    if (legacyMorningReport.quarterReview === undefined) {
      legacyMorningReport.quarterReview = null;
      changed = true;
    }
    for (const consequence of state.morningReport.consequences) {
      const legacyConsequence = consequence as RtReleaseConsequence & {
        source?: RtConsequenceSource;
        terminal?: boolean;
        resourceDelta?: Partial<RtResources>;
        rootCauseTaskId?: string;
        chainDepth?: number;
      };
      if (!legacyConsequence.source) {
        consequence.source = "release";
        changed = true;
      }
      if (typeof legacyConsequence.terminal !== "boolean") {
        consequence.terminal = false;
        changed = true;
      }
      if (!legacyConsequence.resourceDelta) {
        consequence.resourceDelta = {};
        changed = true;
      }
      if (!legacyConsequence.rootCauseTaskId) {
        consequence.rootCauseTaskId = consequence.sourceTaskId;
        changed = true;
      }
      if (typeof legacyConsequence.chainDepth !== "number") {
        consequence.chainDepth = 0;
        changed = true;
      }
    }
  }
  if (state.morningReport) {
    if (!state.paused) {
      state.paused = true;
      changed = true;
    }
    if (state.gameMinuteOfDay !== GAME_DAY_START_MINUTE) {
      state.gameMinuteOfDay = GAME_DAY_START_MINUTE;
      changed = true;
    }
  }
  if (
    typeof state.daysPerQuarter !== "number" ||
    !Number.isFinite(state.daysPerQuarter) ||
    state.daysPerQuarter < DAYS_PER_QUARTER
  ) {
    state.daysPerQuarter = DAYS_PER_QUARTER;
    changed = true;
  }

  for (const column of RT_COLUMNS) {
    if (!board[column]) {
      board[column] = [];
      changed = true;
    }
  }

  const legacyWorkIds = [
    ...(board.analysis ?? []),
    ...(board.todo ?? []),
    ...(board.test ?? []),
  ];
  if (legacyWorkIds.length > 0) {
    for (const taskId of legacyWorkIds) {
      const task = state.tasks[taskId];
      if (!task || task.released) continue;
      task.column = "inProgress";
      task.stageComplete = false;
      task.lastNote = "Ready for analysis, implementation, or QA.";
      if (!state.board.inProgress.includes(taskId)) {
        state.board.inProgress.push(taskId);
      }
    }
    board.analysis = [];
    board.todo = [];
    board.test = [];
    changed = true;
  }

  for (const task of Object.values(state.tasks)) {
    const legacyColumn = (task as unknown as { column: string }).column;
    const queueFields = task as RtTask & { queuedDeadlineMs?: number | null };
    const lateFields = task as RtTask & { overdueMs?: number };
    const taskWithBlast = task as RtTask & { blastRadius?: RtBlastRadius };
    const taskWithOutsourcing = task as RtTask & { outsourcing?: RtOutsourcingWork | null };
    const taskWithChain = task as RtTask & {
      rootCauseTaskId?: string | null;
      sourceTaskId?: string | null;
      chainDepth?: number;
      resolved?: boolean;
      resolution?: RtTaskResolution | null;
      resolutionDay?: number | null;
    };
    if (!taskWithBlast.blastRadius) {
      task.blastRadius = inferBlastRadius(task);
      changed = true;
    }
    if (!("outsourcing" in taskWithOutsourcing)) {
      task.outsourcing = null;
      changed = true;
    }
    if (typeof (task as RtTask & { changedAfterQa?: boolean }).changedAfterQa !== "boolean") {
      task.changedAfterQa = false;
      changed = true;
    }
    if (!("queuedDeadlineMs" in queueFields)) {
      task.queuedDeadlineMs =
        task.column === "done" || task.released ? Math.max(0, task.deadlineMs) : null;
      changed = true;
    }
    if (typeof lateFields.overdueMs !== "number" || !Number.isFinite(lateFields.overdueMs)) {
      task.overdueMs = 0;
      changed = true;
    } else if (task.overdueMs < 0) {
      task.overdueMs = 0;
      changed = true;
    }
    if (!("rootCauseTaskId" in taskWithChain)) {
      task.rootCauseTaskId = null;
      changed = true;
    }
    if (!("sourceTaskId" in taskWithChain)) {
      task.sourceTaskId = null;
      changed = true;
    }
    if (task.sourceTaskId) {
      const normalizedTitle = normalizeConsequenceTaskTitle(task.title, task.sourceTaskId);
      if (normalizedTitle !== task.title) {
        task.title = normalizedTitle;
        changed = true;
      }
    }
    if (typeof taskWithChain.chainDepth !== "number") {
      task.chainDepth = 0;
      changed = true;
    }
    if (typeof taskWithChain.resolved !== "boolean") {
      task.resolved = false;
      changed = true;
    }
    if (!("resolution" in taskWithChain)) {
      task.resolution = null;
      changed = true;
    }
    if (!("resolutionDay" in taskWithChain)) {
      task.resolutionDay = null;
      changed = true;
    }
    if (!Array.isArray(task.postmortem)) {
      task.postmortem = [];
      changed = true;
    } else {
      const postmortem = uniqueStrings(task.postmortem).filter(
        (note) => !/^Source task:/.test(note) && !/^Root cause:/.test(note),
      );
      if (postmortem.length !== task.postmortem.length) {
        task.postmortem = postmortem;
        changed = true;
      }
    }
    if (legacyColumn === "analysis" || legacyColumn === "todo" || legacyColumn === "test") {
      task.column = "inProgress";
      task.stageComplete = false;
      task.lastNote = "Ready for analysis, implementation, or QA.";
      task.queuedDeadlineMs = null;
      if (!state.board.inProgress.includes(task.id)) {
        state.board.inProgress.push(task.id);
      }
      changed = true;
    }
    if (task.released && task.column !== "released") {
      task.column = "released";
      if (!state.board.released.includes(task.id)) {
        state.board.released.unshift(task.id);
      }
      changed = true;
    }
    if (!task.released && task.bugs > 0 && ensureBugReviewSubtask(task)) {
      changed = true;
    }
    if (!task.released && task.changedAfterQa && ensureQaRecheckSubtask(task)) {
      changed = true;
    }
  }

  for (const character of Object.values(state.characters)) {
    const legacy = character as RtCharacter & {
      exhaustedToday?: boolean;
      fatigue?: number;
      morale?: number;
    };
    if (typeof character.stamina !== "number") {
      const fatigue = typeof legacy.fatigue === "number" ? legacy.fatigue : 0;
      const morale = typeof legacy.morale === "number" ? legacy.morale : 75;
      character.stamina = clamp(100 - fatigue * 0.7 + (morale - 75) * 0.25, 0, 100);
      changed = true;
    }
    if (typeof legacy.exhaustedToday !== "boolean") {
      character.exhaustedToday = false;
      changed = true;
    }
  }

  if (typeof state.resources.budget !== "number") {
    state.resources.budget = 4;
    changed = true;
  }

  for (const task of Object.values(state.tasks)) {
    if (task.resolved) {
      removeTaskFromBoard(state, task.id);
      continue;
    }
    for (const [column, taskIds] of Object.entries(board)) {
      if (!Array.isArray(taskIds) || column === task.column) continue;
      const nextIds = taskIds.filter((taskId) => taskId !== task.id);
      if (nextIds.length !== taskIds.length) {
        board[column] = nextIds;
        changed = true;
      }
    }
    if (!state.board[task.column].includes(task.id)) {
      state.board[task.column].push(task.id);
      changed = true;
    }
  }

  return changed;
}

export function tickRealtime(state: RtGameState, tickMs = TICK_MS): void {
  normalizeRealtimeState(state);
  if (state.morningReport || state.paused || state.status !== "running") return;

  state.elapsedRealMs += tickMs;
  const gameMinutes = (tickMs / 1000) * GAME_MINUTES_PER_REAL_SECOND;
  state.elapsedGameMinutes += gameMinutes;
  const previousGameMinuteOfDay = state.gameMinuteOfDay;
  state.gameMinuteOfDay += gameMinutes;

  if (crossedReleaseTrain(previousGameMinuteOfDay, state.gameMinuteOfDay)) {
    openMorningReport(state);
    checkRunState(state);
    return;
  }

  updateShock(state, gameMinutes);
  updateTaskTimers(state, tickMs);
  updateOutsourcing(state, tickMs);
  updateAssignments(state, tickMs, (event) => pushEvent(state, event));
  updateSpawner(state, tickMs);
  checkRunState(state);
}

export function startDayAfterMorningReport(state: RtGameState): boolean {
  normalizeRealtimeState(state);
  if (!state.morningReport || state.status !== "running") return false;

  state.morningReport = null;
  state.paused = false;
  checkRunState(state);
  return true;
}

export function moveRealtimeTask(
  state: RtGameState,
  taskId: string,
  targetColumn: RtColumn,
): boolean {
  return moveTaskOnBoard(state, taskId, targetColumn, (event) => pushEvent(state, event));
}

export function canMoveRealtimeTask(
  state: RtGameState,
  taskId: string,
  targetColumn: RtColumn,
): RtMoveCheck {
  return canMoveTaskOnBoard(state, taskId, targetColumn);
}

export function getOutsourceTaskWorkStatus(state: RtGameState, taskId: string): RtOutsourceStatus {
  const task = state.tasks[taskId];
  const currentBudget = state.resources.budget;
  if (!task) {
    return {
      allowed: false,
      reason: "task_missing",
      currentBudget,
      cost: null,
      neededBudget: null,
      subtask: null,
    };
  }
  if (taskBusy(task)) {
    return {
      allowed: false,
      reason: "task_busy",
      currentBudget,
      cost: null,
      neededBudget: null,
      subtask: null,
    };
  }
  if (task.released) {
    return {
      allowed: false,
      reason: "task_released",
      currentBudget,
      cost: null,
      neededBudget: null,
      subtask: null,
    };
  }
  if (!isWorkColumn(task.column)) {
    return {
      allowed: false,
      reason: "wrong_column",
      currentBudget,
      cost: null,
      neededBudget: null,
      subtask: null,
    };
  }

  const open = getOpenTodoSubtasks(task);
  if (open.length === 0) {
    return {
      allowed: false,
      reason: task.subtasks.some((subtask) => !subtask.revealed && !subtask.done)
        ? "needs_analysis"
        : "no_open_work",
      currentBudget,
      cost: null,
      neededBudget: null,
      subtask: null,
    };
  }

  const subtask = chooseSubtaskForOutsource(state, task, currentBudget);
  if (!subtask) {
    const cheapest = open
      .map((candidate) => ({
        subtask: candidate,
        cost: OUTSOURCE_COST_BY_IMPORTANCE[candidate.importance],
      }))
      .sort((a, b) => a.cost - b.cost)[0];
    return {
      allowed: false,
      reason: "insufficient_budget",
      currentBudget,
      cost: cheapest.cost,
      neededBudget: cheapest.cost,
      subtask: cheapest.subtask,
    };
  }

  const cost = OUTSOURCE_COST_BY_IMPORTANCE[subtask.importance];
  return {
    allowed: true,
    reason: "ready",
    currentBudget,
    cost,
    neededBudget: cost,
    subtask,
  };
}

function getOutsourcePlan(state: RtGameState, taskId: string): RtOutsourcePlan | null {
  const task = state.tasks[taskId];
  const status = getOutsourceTaskWorkStatus(state, taskId);
  if (!task || !status.allowed || !status.subtask || status.cost === null) return null;
  return {
    task,
    subtask: status.subtask,
    cost: status.cost,
  };
}

export function assignCharacterToTask(
  state: RtGameState,
  characterId: string,
  taskId: string,
): boolean {
  return assignCharacterToTaskWork(state, characterId, taskId, (event) => pushEvent(state, event));
}

export function canAssignCharacterToTask(
  state: RtGameState,
  characterId: string,
  taskId: string,
): boolean {
  return canAssignCharacterToTaskWork(state, characterId, taskId);
}

export function canOutsourceTaskWork(state: RtGameState, taskId: string): boolean {
  return getOutsourceTaskWorkStatus(state, taskId).allowed;
}

export function outsourceTaskWork(state: RtGameState, taskId: string): boolean {
  const plan = getOutsourcePlan(state, taskId);
  if (!plan || state.resources.budget < plan.cost) return false;
  const { task, subtask, cost } = plan;

  state.resources.budget = Math.max(0, state.resources.budget - cost);
  task.outsourcing = {
    subtaskId: subtask.id,
    cost,
    progress: subtask.progress,
  };
  task.currentSubtaskId = subtask.id;
  task.stageProgress = subtask.progress;
  task.stageComplete = false;
  task.lastNote = `Outsource is working on ${subtask.role}: ${subtask.title}.`;

  pushEvent(state, {
    type: "outsourcing_started",
    title: `${task.id} outsourced`,
    body: `External contractor started ${subtask.title}.`,
    effects: [
      `budget -${cost}`,
      `subtask ${subtask.role}`,
      subtask.importance,
    ],
  });

  return true;
}

export function cancelTaskWork(state: RtGameState, taskId: string): boolean {
  return cancelTaskWorkInternal(state, taskId, (event) => pushEvent(state, event));
}

export function releaseRealtimeTask(state: RtGameState, taskId: string): boolean {
  const task = state.tasks[taskId];
  if (!task || task.released || task.assignedCharacterId) return false;

  const postmortem = buildReleasePostmortem(task);
  const readiness = releaseReadiness(task);
  const score = releaseScore(state, task);
  const late = lateReleaseReport(task);
  const baseValueGain = Math.max(0, Math.round(task.value * (score / 100)));
  const valueGain = Math.max(0, Math.round(baseValueGain * late.valueMultiplier));
  const budgetGain = releaseBudgetGain(valueGain, score);
  const sreSafety = task.subtasks.some((subtask) => subtask.role === "sre" && subtask.done);
  const blastMultiplier = sreSafety ? 0.65 : 1.15;
  const trustDelta = releaseTrustDelta(readiness.readiness, score, blastMultiplier, state.resources.trust);
  const clientDelta = releaseClientDelta(readiness.readiness, score, blastMultiplier, state.resources.trust);
  const debtDelta =
    score >= 75 ? -1 : Math.ceil(((75 - score) / 12 + task.bugs) * blastMultiplier);

  state.resources.value += valueGain;
  state.resources.budget += budgetGain;
  state.quarterValue += valueGain;
  state.resources.trust = clamp(state.resources.trust + trustDelta, 0, 100);
  state.resources.clients = clamp(state.resources.clients + clientDelta, 0, 100);
  state.resources.debt = clamp(state.resources.debt + debtDelta, 0, 100);

  task.releaseScore = score;
  task.postmortem = postmortem;
  task.released = true;
  task.column = "released";
  task.stageComplete = true;
  task.assignedCharacterId = null;
  task.lastNote = releaseNote(score);
  removeTaskFromBoard(state, taskId);
  state.board.released.unshift(taskId);

  pushEvent(state, {
    type: "release",
    title: `${task.id} released`,
    body: releaseNote(score),
    effects: [
      `${readiness.readiness} release`,
      `value +${valueGain}`,
      ...(late.valuePenaltyPercent > 0 ? [`late value -${late.valuePenaltyPercent}%`] : []),
      ...(budgetGain > 0 ? [`budget +${budgetGain}`] : []),
      `trust ${formatDelta(trustDelta)}`,
      `clients ${formatDelta(clientDelta)}`,
      `debt ${formatDelta(debtDelta)}`,
      ...(sreSafety ? ["SRE blast radius reduced"] : ["no SRE safety"]),
    ],
  });

  return true;
}

export function runDailyReleaseTrain(state: RtGameState): string[] {
  const taskIds = [...state.board.done].filter((taskId) => {
    const task = state.tasks[taskId];
    return task && !task.released && !task.assignedCharacterId;
  });

  if (taskIds.length === 0) {
    pushEvent(state, {
      type: "release_train_empty",
      title: "Release train departed empty",
      body: "No tasks were queued in Done.",
      effects: ["no business effects"],
    });
    return [];
  }

  const shipped: string[] = [];
  for (const taskId of taskIds.slice().reverse()) {
    if (releaseRealtimeTask(state, taskId)) shipped.unshift(taskId);
  }

  pushEvent(state, {
    type: "release_train",
    title: `Release train shipped ${shipped.length}`,
    body: `${shipped.length} task(s) moved from Done to Released.`,
    effects: shipped.slice(0, 4),
  });

  return shipped;
}

function openMorningReport(state: RtGameState): void {
  state.gameMinuteOfDay = RELEASE_TRAIN_GAME_MINUTE;

  const releaseQuarter = state.quarter;
  const releaseDay = state.day;
  const resourceBefore = copyResources(state.resources);
  const shippedTaskIds = runDailyReleaseTrain(state);
  const resourceAfterRelease = copyResources(state.resources);
  const releaseDelta = diffResources(resourceBefore, resourceAfterRelease);
  const missedTaskIds = collectMissedTaskIds(state);
  const quarterReview = advanceDay(state);
  const resourceAfterQuarter = copyResources(state.resources);
  state.gameMinuteOfDay = GAME_DAY_START_MINUTE;
  const consequences = generateMorningConsequences(state, shippedTaskIds, missedTaskIds);
  const resourceAfter = copyResources(state.resources);
  const resourceDelta = diffResources(resourceBefore, resourceAfter);
  const consequenceDelta = diffResources(resourceAfterQuarter, resourceAfter);
  const effects = morningReportEffects(resourceDelta);
  const daySummary = buildDaySummary(
    state,
    releaseDay,
    shippedTaskIds,
    missedTaskIds,
    consequences,
  );

  state.morningReport = {
    id: `morning-${releaseQuarter}-${releaseDay}-${state.elapsedRealMs}`,
    quarter: state.quarter,
    day: state.day,
    previousDay: releaseDay,
    at: formatGameTime(state),
    shippedTaskIds,
    resourceBefore,
    resourceAfter,
    resourceDelta,
    releaseDelta,
    consequenceDelta,
    quarterReview,
    empty: shippedTaskIds.length === 0 && missedTaskIds.length === 0,
    effects,
    missedTaskIds,
    consequences,
    daySummary,
  };
  state.paused = true;

  pushEvent(state, {
    type: "day_summary",
    title: `Day ${releaseDay} summary`,
    body: `${daySummary.shipped} shipped, ${daySummary.missedBacklog + daySummary.missedInProgress} missed, ${daySummary.unresolvedFallout} unresolved fallout.`,
    effects: [
      `clean ${daySummary.releasedClean}`,
      `risky ${daySummary.releasedRisky}`,
      `dirty ${daySummary.releasedDirty}`,
      `missed backlog ${daySummary.missedBacklog}`,
      `missed progress ${daySummary.missedInProgress}`,
      `fallout +${daySummary.falloutCreated}`,
      `resolved ${daySummary.falloutResolved}`,
      `unresolved ${daySummary.unresolvedFallout}`,
      `terminal ${daySummary.terminalConsequences}`,
    ],
  });

  pushEvent(state, {
    type: "morning_report_opened",
    title: `Morning briefing Day ${state.day}`,
    body:
      shippedTaskIds.length > 0 || missedTaskIds.length > 0
        ? `${shippedTaskIds.length} shipped, ${missedTaskIds.length} missed. ${consequences.length} consequence(s) shaped today's backlog.`
        : "No tasks shipped or expired yesterday. The team starts with the existing backlog.",
    effects: [
      ...effects,
      ...(consequences.length > 0 ? [`consequences ${consequences.length}`] : ["no fallout"]),
      `unresolved fallout ${daySummary.unresolvedFallout}`,
    ],
  });
}

function collectMissedTaskIds(state: RtGameState): string[] {
  return [...state.board.backlog, ...state.board.inProgress].filter((taskId) => {
    const task = state.tasks[taskId];
    return Boolean(
      task &&
        !task.released &&
        !task.resolved &&
        task.column !== "done" &&
        task.deadlineMs <= 0,
    );
  });
}

function generateMorningConsequences(
  state: RtGameState,
  shippedTaskIds: string[],
  missedTaskIds: string[],
): RtReleaseConsequence[] {
  const consequences: RtReleaseConsequence[] = [];
  for (const taskId of shippedTaskIds) {
    const task = state.tasks[taskId];
    if (!task) continue;
    const readiness = releaseReadiness(task);
    const score = task.releaseScore ?? releaseScore(state, task);
    if (!shouldCreateReleaseConsequence(state, readiness.readiness, score)) continue;

    const cause = primaryConsequenceCause(readiness.reasons);
    consequences.push(
      createTailConsequence(state, {
        cause,
        consequenceIndex: consequences.length,
        source: "release",
        sourceTask: task,
        symptom: releaseConsequenceSymptom(task, cause),
      }),
    );
  }

  for (const taskId of missedTaskIds) {
    const task = state.tasks[taskId];
    if (!task || task.released || task.resolved) continue;
    consequences.push(resolveMissedTask(state, task, consequences.length));
  }

  return consequences;
}

function createTailConsequence(
  state: RtGameState,
  {
    cause,
    consequenceIndex,
    source,
    sourceTask,
    symptom,
  }: {
    cause: RtReleaseConsequenceCause;
    consequenceIndex: number;
    source: RtConsequenceSource;
    sourceTask: RtTask;
    symptom: string;
  },
): RtReleaseConsequence {
  const rootCauseTaskId = sourceTask.rootCauseTaskId ?? sourceTask.id;
  const nextDepth = sourceTask.chainDepth + 1;
  const shouldTerminate = nextDepth > MAX_FALLOUT_CHAIN_DEPTH;

  if (shouldTerminate) {
    const resourceDelta = applyResourceDelta(state, terminalResourceDelta(sourceTask));
    const effects = [
      `source ${sourceTask.id}`,
      `cause ${consequenceCauseText(cause)}`,
      "chain terminated",
      ...resourceDeltaEffects(resourceDelta),
    ];
    const consequence: RtReleaseConsequence = {
      id: `${sourceTask.id}-terminal-${state.day}-${consequenceIndex + 1}`,
      source: "terminal",
      sourceTaskId: sourceTask.id,
      sourceTitle: sourceTask.title,
      rootCauseTaskId,
      chainDepth: nextDepth,
      cause: "terminal_chain",
      symptom,
      generatedTaskId: null,
      terminal: true,
      resourceDelta,
      effects,
    };

    pushEvent(state, {
      type: "tail_chain_terminated",
      title: `${sourceTask.id} chain closed`,
      body: `${symptom}. The fallout chain reached its cap and resolved as business damage.`,
      effects,
    });
    return consequence;
  }

  const followUp = generateTask(state, consequenceTaskKind(cause, sourceTask.releaseScore ?? 50));
  const originalFollowUpId = followUp.id;
  const sequence =
    originalFollowUpId.match(/\d+$/)?.[0] ?? String(state.nextTaskId - 1).padStart(3, "0");
  followUp.domain = sourceTask.domain;
  followUp.id = `${DOMAIN_PREFIXES[sourceTask.domain] ?? "INC"}-${sequence}`;
  followUp.title = `${followUp.id}: ${symptom}`;
  for (const subtask of followUp.subtasks) {
    subtask.id = subtask.id.replace(originalFollowUpId, followUp.id);
  }
  followUp.rootCauseTaskId = rootCauseTaskId;
  followUp.sourceTaskId = sourceTask.id;
  followUp.chainDepth = nextDepth;
  followUp.pressure = clamp(sourceTask.pressure + 1, 1, 6);
  followUp.complexity =
    source === "missed_in_progress"
      ? clamp(Math.ceil((sourceTask.complexity + 1) / 2), 1, 6)
      : clamp(Math.ceil((sourceTask.complexity + 2) / 2), 1, 6);
  followUp.value = Math.max(4, Math.round(sourceTask.value * 0.35));
  followUp.clarity = clamp(
    source === "missed_in_progress"
      ? Math.max(55, Math.round(sourceTask.clarity * 0.75))
      : 72 - consequenceIndex * 4,
    45,
    92,
  );
  followUp.quality =
    source === "missed_in_progress"
      ? clamp(Math.round(sourceTask.quality * 0.6), 8, 72)
      : Math.max(8, Math.round(followUp.clarity * 0.22));
  followUp.testCoverage =
    source === "missed_in_progress" ? Math.min(sourceTask.testCoverage, 35) : 0;
  followUp.blastRadius = sourceTask.blastRadius === "high" ? "high" : "medium";
  followUp.lastNote = `Caused by yesterday's ${sourceTask.id}: ${consequenceCauseText(cause)}.`;
  followUp.postmortem = [
    `Cause: ${consequenceCauseText(cause)}.`,
    ...(source === "missed_in_progress" ? ["Some prior work carried forward as context."] : []),
  ];

  const added = addTask(state, followUp, BACKLOG_LIMIT + FALLOUT_BACKLOG_EXTRA_SLOTS);
  const generatedTaskId = added ? followUp.id : null;
  const resourceDelta = added ? {} : applyResourceDelta(state, blockedTailResourceDelta(sourceTask));
  const effects = [
    `source ${sourceTask.id}`,
    `root ${rootCauseTaskId}`,
    `cause ${consequenceCauseText(cause)}`,
    `depth ${nextDepth}/${MAX_FALLOUT_CHAIN_DEPTH}`,
    ...(generatedTaskId ? [`created ${generatedTaskId}`] : ["backlog full", ...resourceDeltaEffects(resourceDelta)]),
  ];

  const consequence: RtReleaseConsequence = {
    id: `${sourceTask.id}-fallout-${state.day}-${consequenceIndex + 1}`,
    source,
    sourceTaskId: sourceTask.id,
    sourceTitle: sourceTask.title,
    rootCauseTaskId,
    chainDepth: nextDepth,
    cause,
    symptom,
    generatedTaskId,
    terminal: false,
    resourceDelta,
    effects,
  };

  pushEvent(state, {
    type:
      source === "release"
        ? "release_consequence_spawned"
        : generatedTaskId
          ? "missed_tail_spawned"
          : "missed_tail_blocked",
    title: generatedTaskId
      ? `${sourceTask.id} caused ${generatedTaskId}`
      : `${sourceTask.id} fallout delayed`,
    body: `${symptom} because yesterday's ${sourceTask.id} had ${consequenceCauseText(cause)}.`,
    effects,
  });

  return consequence;
}

function resolveMissedTask(
  state: RtGameState,
  task: RtTask,
  consequenceIndex: number,
): RtReleaseConsequence {
  const source: RtConsequenceSource =
    task.column === "backlog" ? "missed_backlog" : "missed_in_progress";
  const cause: RtReleaseConsequenceCause =
    source === "missed_backlog" ? "ignored_work" : "missed_deadline";

  if (missedTaskIsMinor(task)) {
    const resourceDelta = applyResourceDelta(state, missedMinorResourceDelta(task));
    const effects = [
      `source ${task.id}`,
      `cause ${consequenceCauseText(cause)}`,
      "minor hit",
      ...resourceDeltaEffects(resourceDelta),
    ];
    markTaskResolved(state, task, "missed_minor");
    const consequence: RtReleaseConsequence = {
      id: `${task.id}-minor-${state.day}-${consequenceIndex + 1}`,
      source,
      sourceTaskId: task.id,
      sourceTitle: task.title,
      rootCauseTaskId: task.rootCauseTaskId ?? task.id,
      chainDepth: task.chainDepth,
      cause,
      symptom: missedConsequenceSymptom(task, source, false),
      generatedTaskId: null,
      terminal: false,
      resourceDelta,
      effects,
    };
    pushEvent(state, {
      type: "missed_minor_hit",
      title: `${task.id} missed`,
      body: `${task.title} missed the day and resolved as a small operational hit.`,
      effects,
    });
    return consequence;
  }

  const consequence = createTailConsequence(state, {
    cause,
    consequenceIndex,
    source,
    sourceTask: task,
    symptom: missedConsequenceSymptom(task, source, true),
  });
  markTaskResolved(state, task, consequence.terminal ? "missed_terminal" : "missed_tail");
  pushEvent(state, {
    type: "missed_task_resolved",
    title: `${task.id} missed`,
    body: `${task.title} missed the daily release window and left the board.`,
    effects: consequence.effects,
  });
  return consequence;
}

function shouldCreateReleaseConsequence(
  state: RtGameState,
  readiness: RtReleaseReadiness,
  score: number,
): boolean {
  if (score < 55 || readiness === "dirty") return true;
  if (score < 70 || readiness === "risky") return chance(state, 0.55);
  return false;
}

function missedTaskIsMinor(task: RtTask): boolean {
  if (task.rootCauseTaskId) return false;
  if (task.kind === "integration" || task.kind === "incident" || task.kind === "compliance") {
    return false;
  }
  if (task.kind === "performance" && task.pressure >= 3) return false;
  if (task.blastRadius === "high") return false;
  if (task.pressure >= 4 || task.value >= 34) return false;
  return task.kind === "bug" || task.kind === "techDebt" || task.pressure <= 2;
}

function missedMinorResourceDelta(task: RtTask): Partial<RtResources> {
  if (task.kind === "techDebt" || task.kind === "bug" || task.kind === "performance") {
    return { debt: 1 };
  }
  return { trust: -1 };
}

function terminalResourceDelta(task: RtTask): Partial<RtResources> {
  const blast = task.blastRadius === "high" ? 2 : task.blastRadius === "medium" ? 1 : 0;
  return {
    trust: -(3 + blast),
    clients: task.kind === "incident" || task.blastRadius === "high" ? -2 : -1,
    debt: 3 + blast,
  };
}

function blockedTailResourceDelta(task: RtTask): Partial<RtResources> {
  return {
    trust: task.blastRadius === "high" ? -3 : -2,
    debt: task.kind === "techDebt" ? 3 : 2,
  };
}

function markTaskResolved(
  state: RtGameState,
  task: RtTask,
  resolution: RtTaskResolution,
): void {
  const characterId = task.assignedCharacterId;
  if (characterId && state.characters[characterId]) {
    state.characters[characterId].assignedTaskId = null;
  }
  task.assignedCharacterId = null;
  task.outsourcing = null;
  task.currentSubtaskId = null;
  task.stageProgress = 0;
  task.stageComplete = false;
  task.resolved = true;
  task.resolution = resolution;
  task.resolutionDay = state.day;
  task.lastNote = `Missed work resolved as ${resolution.replace("_", " ")}.`;
  removeTaskFromBoard(state, task.id);
}

function primaryConsequenceCause(reasons: RtRiskReason[]): RtReleaseConsequenceCause {
  if (reasons.includes("known_bug")) return "known_bug";
  if (reasons.includes("changed_after_qa")) return "changed_after_qa";
  if (reasons.includes("no_qa")) return "no_qa";
  if (reasons.includes("blast_radius_uncovered") || reasons.includes("no_sre")) return "no_sre";
  if (reasons.includes("critical_open")) return "critical_open";
  if (reasons.includes("important_open")) return "important_open";
  if (reasons.includes("low_clarity")) return "low_clarity";
  if (reasons.includes("deadline_pressure")) return "deadline_pressure";
  return "no_qa";
}

function consequenceTaskKind(
  cause: RtReleaseConsequenceCause,
  score: number,
): RtTaskKind {
  if (cause === "known_bug" || cause === "changed_after_qa") return "bug";
  if (cause === "ignored_work") return score < 45 ? "incident" : "integration";
  if (cause === "missed_deadline") return "incident";
  if (cause === "terminal_chain") return "incident";
  if (cause === "no_sre" || score < 45) return "incident";
  if (cause === "low_clarity") return "feature";
  return "incident";
}

function releaseConsequenceSymptom(
  task: RtTask,
  cause: RtReleaseConsequenceCause,
): string {
  const area =
    task.domain === "payments"
      ? "Partner payouts"
      : task.domain === "auth"
        ? "Partner login"
        : task.domain === "admin"
          ? "Admin workflow"
          : task.domain === "search"
            ? "Search results"
            : task.domain === "reports"
              ? "Partner report export"
              : "Customer notifications";
  const failure =
    cause === "known_bug"
      ? "known bug is still visible"
      : cause === "changed_after_qa"
        ? "regressed after untested late changes"
        : cause === "no_qa"
          ? "started failing without QA coverage"
          : cause === "no_sre"
            ? "created production instability"
            : cause === "low_clarity"
              ? "does not match the business request"
              : "broke after unfinished release work";
  return `${area}: ${failure}`;
}

function missedConsequenceSymptom(
  task: RtTask,
  source: RtConsequenceSource,
  createsWork: boolean,
): string {
  const area =
    task.domain === "payments"
      ? "Partner commitment"
      : task.domain === "auth"
        ? "Login commitment"
        : task.domain === "admin"
          ? "Admin team request"
          : task.domain === "search"
            ? "Search request"
            : task.domain === "reports"
              ? "Reporting request"
              : "Notification request";
  if (!createsWork) return `${area}: small slip`;
  if (source === "missed_in_progress") {
    return `${area}: escalation after unfinished work`;
  }
  return `${area}: missed commitment escalated`;
}

function consequenceCauseText(cause: RtReleaseConsequenceCause): string {
  switch (cause) {
    case "known_bug":
      return "known bugs";
    case "changed_after_qa":
      return "changes after QA";
    case "no_qa":
      return "no QA pass";
    case "no_sre":
      return "missing SRE safety";
    case "critical_open":
      return "open critical work";
    case "important_open":
      return "open important work";
    case "low_clarity":
      return "low clarity";
    case "deadline_pressure":
      return "deadline pressure";
    case "ignored_work":
      return "ignored work";
    case "missed_deadline":
      return "missed deadline";
    case "terminal_chain":
      return "terminal fallout";
  }
}

function emptyDaySummary(day: number): RtDaySummary {
  return {
    day,
    shipped: 0,
    releasedClean: 0,
    releasedRisky: 0,
    releasedDirty: 0,
    missedBacklog: 0,
    missedInProgress: 0,
    missedMinor: 0,
    falloutCreated: 0,
    falloutResolved: 0,
    unresolvedFallout: 0,
    terminalConsequences: 0,
  };
}

function buildDaySummary(
  state: RtGameState,
  day: number,
  shippedTaskIds: string[],
  missedTaskIds: string[],
  consequences: RtReleaseConsequence[],
): RtDaySummary {
  const shippedReports = shippedTaskIds
    .map((taskId) => state.tasks[taskId])
    .filter((task): task is RtTask => Boolean(task))
    .map((task) => releaseReadiness(task).readiness);
  const missedTasks = missedTaskIds
    .map((taskId) => state.tasks[taskId])
    .filter((task): task is RtTask => Boolean(task));

  return {
    day,
    shipped: shippedTaskIds.length,
    releasedClean: shippedReports.filter((readiness) => readiness === "clean").length,
    releasedRisky: shippedReports.filter((readiness) => readiness === "risky").length,
    releasedDirty: shippedReports.filter((readiness) => readiness === "dirty").length,
    missedBacklog: consequences.filter((consequence) => consequence.source === "missed_backlog").length,
    missedInProgress: consequences.filter((consequence) => consequence.source === "missed_in_progress").length,
    missedMinor: missedTasks.filter((task) => task.resolution === "missed_minor").length,
    falloutCreated: consequences.filter((consequence) => consequence.generatedTaskId).length,
    falloutResolved:
      shippedTaskIds.filter((taskId) => Boolean(state.tasks[taskId]?.rootCauseTaskId)).length +
      missedTasks.filter((task) => Boolean(task.rootCauseTaskId)).length,
    unresolvedFallout: Object.values(state.tasks).filter(
      (task) => Boolean(task.rootCauseTaskId) && !task.released && !task.resolved,
    ).length,
    terminalConsequences: consequences.filter((consequence) => consequence.terminal).length,
  };
}

export function formatGameTime(state: RtGameState): string {
  const hour = Math.floor(state.gameMinuteOfDay / 60);
  const minute = Math.floor(state.gameMinuteOfDay % 60);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function stageForColumn(column: RtColumn): RtStage | null {
  if (column === "inProgress") return "todo";
  return null;
}

export function isWorkColumn(column: RtColumn): column is RtWorkColumn {
  return column === "inProgress";
}

function createCharacter(state: RtGameState, role: RtRole): RtCharacter {
  return {
    id: `C-${state.nextCharacterId++}`,
    name:
      CHARACTER_NAMES[
        (state.nextCharacterId + Object.keys(state.characters).length) % CHARACTER_NAMES.length
      ],
    role,
    skill: { ...BASE_SKILLS[role] },
    specialty: { ...BASE_SPECIALTIES[role] },
    xp: { backend: 0, frontend: 0, design: 0, qa: 0, sre: 0, bugfix: 0 },
    stamina: 100,
    burnout: 0,
    assignedTaskId: null,
    shockGameMinutes: 0,
    exhaustedToday: false,
  };
}

function addTask(state: RtGameState, task: RtTask, backlogLimit = BACKLOG_LIMIT): boolean {
  if (state.board.backlog.length >= backlogLimit) return false;
  state.tasks[task.id] = task;
  state.board.backlog.unshift(task.id);
  pushEvent(state, {
    type: "task_spawned",
    title: `${task.id} arrived`,
    body: task.title,
    effects: [`clarity ${task.clarity}`, `deadline ${Math.round(task.deadlineMs / 1000)}s`],
  });
  return true;
}

function updateTaskTimers(state: RtGameState, tickMs: number): void {
  for (const task of Object.values(state.tasks)) {
    if (task.released || task.column === "done") continue;
    if (task.deadlineMs > 0) {
      const nextDeadlineMs = task.deadlineMs - tickMs;
      if (nextDeadlineMs < 0) {
        task.overdueMs += Math.abs(nextDeadlineMs);
      }
      task.deadlineMs = Math.max(0, nextDeadlineMs);
    } else {
      task.overdueMs += tickMs;
    }
  }
}

function updateOutsourcing(state: RtGameState, tickMs: number): void {
  const tickSeconds = tickMs / 1000;
  for (const task of Object.values(state.tasks)) {
    if (!task.outsourcing || !isWorkColumn(task.column)) continue;
    const subtask = task.subtasks.find((candidate) => candidate.id === task.outsourcing?.subtaskId);
    if (!subtask || subtask.done) {
      task.outsourcing = null;
      task.currentSubtaskId = null;
      task.stageProgress = 0;
      continue;
    }

    const costFactor = 1 + task.outsourcing.cost * 0.08;
    const importanceFactor =
      subtask.importance === "critical" ? 0.88 : subtask.importance === "important" ? 1 : 1.12;
    const speed =
      (3.8 + OUTSOURCE_COST_BY_IMPORTANCE[subtask.importance] * 0.6) *
      costFactor *
      importanceFactor *
      WORK_SPEED_MULTIPLIER;
    const nextProgress = clamp(
      task.outsourcing.progress + (speed * tickSeconds) / (1 + task.complexity * 0.26),
      0,
      100,
    );
    task.outsourcing.progress = nextProgress;
    task.stageProgress = nextProgress;
    subtask.progress = nextProgress;

    if (nextProgress >= 100) {
      completeOutsourcedWork(state, task, subtask, task.outsourcing.cost);
    }
  }
}

function completeOutsourcedWork(
  state: RtGameState,
  task: RtTask,
  subtask: RtSubtask,
  cost: number,
): void {
  subtask.done = true;
  subtask.progress = 100;
  subtask.completedBy = "outsourcing";
  subtask.offRole = false;

  const bugfixWork = isBugfixWork(subtask);
  if (task.testCoverage > 0 && subtask.role !== "qa") {
    task.changedAfterQa = true;
    task.testCoverage = Math.min(task.testCoverage, 35);
    ensureQaRecheckSubtask(task);
    addPostmortemNote(
      task,
      "Outsourced work changed the task after QA, so prior test coverage became stale.",
    );
  }
  const qualityGain = bugfixWork ? 18 : subtask.importance === "critical" ? 16 : 11;
  if (bugfixWork) {
    task.bugs = Math.max(0, task.bugs - 1);
  }
  task.quality = clamp(task.quality + qualityGain, 0, 100);
  task.workDone = task.subtasks.some((candidate) => candidate.done && candidate.role !== "qa");
  task.currentSubtaskId = null;
  task.outsourcing = null;
  task.stageProgress = 100;
  task.stageComplete = true;
  task.lastNote = `Outsourcing completed ${subtask.role} work.`;

  pushEvent(state, {
    type: "outsourced",
    title: `${task.id} outsourced`,
    body: `External contractor completed ${subtask.title}.`,
    effects: [
      `budget -${cost}`,
      `subtask ${subtask.role}`,
      subtask.importance,
      `quality ${task.quality}`,
      `bugs ${task.bugs}`,
      ...(task.changedAfterQa ? ["QA recheck required"] : []),
    ],
  });
}

function chooseSubtaskForOutsource(
  state: RtGameState,
  task: RtTask,
  availableBudget: number,
): RtSubtask | null {
  const open = getOpenTodoSubtasks(task).filter(
    (subtask) => OUTSOURCE_COST_BY_IMPORTANCE[subtask.importance] <= availableBudget,
  );
  if (open.length === 0) return null;
  return open
    .map((subtask) => ({
      subtask,
      score:
        missingTeamCompetencyScore(state, subtask) +
        importanceWeight(subtask.importance) +
        (subtask.role === "qa" ? -18 : 0) -
        subtask.progress * 0.1,
    }))
    .sort((a, b) => b.score - a.score)[0].subtask;
}

function missingTeamCompetencyScore(state: RtGameState, subtask: RtSubtask): number {
  const bestSkill = Math.max(
    0,
    ...Object.values(state.characters).map((character) => character.specialty[subtask.role] ?? 0),
  );
  if (bestSkill <= 1) return 42;
  if (bestSkill === 2) return 30;
  if (bestSkill === 3) return 16;
  return 0;
}

function buildReleasePostmortem(task: RtTask): string[] {
  const notes = uniqueStrings(task.postmortem);
  const late = lateReleaseReport(task);
  if (late.valuePenaltyPercent > 0) {
    notes.push(
      `Release missed the business window by ${formatOverdueGameTime(late.overdueMs)}, reducing value by ${late.valuePenaltyPercent}%.`,
    );
  }
  const openCritical = task.subtasks.filter(
    (subtask) => subtask.importance === "critical" && !subtask.done,
  );
  const openImportant = task.subtasks.filter(
    (subtask) => subtask.importance === "important" && !subtask.done,
  );
  const hiddenOpen = task.subtasks.filter((subtask) => !subtask.revealed && !subtask.done);
  const sreSubtasks = task.subtasks.filter((subtask) => subtask.role === "sre");
  const sreDone = sreSubtasks.some((subtask) => subtask.done);

  for (const subtask of openCritical) {
    notes.push(`Critical ${subtask.role} work was not finished: ${subtask.title}.`);
  }
  if (openImportant.length > 0) {
    notes.push(`${openImportant.length} important subtask(s) were still open.`);
  }
  if (hiddenOpen.length > 0) {
    notes.push("Analysis was incomplete; some work was never discovered.");
  }
  if (task.bugs > 0) {
    notes.push(`${task.bugs} known bug(s) shipped.`);
  }
  if (task.testCoverage < 45) {
    notes.push("QA coverage was low.");
  }
  if (sreSubtasks.length > 0 && !sreDone) {
    notes.push("SRE safety was missing, so blast radius was higher.");
  }
  if (notes.length === 0) {
    notes.push("Release was clean: critical work was done and no known bugs shipped.");
  }
  return notes;
}

function updateSpawner(state: RtGameState, tickMs: number): void {
  if (state.board.backlog.length >= BACKLOG_LIMIT) return;

  state.spawn.nextInMs -= tickMs;
  state.spawn.nextBurstInMs -= tickMs;

  const activeWorkCount = state.board.backlog.length + state.board.inProgress.length;
  if (activeWorkCount <= 1 && state.spawn.nextInMs > LOW_WORK_SPAWN_MAX_MS) {
    state.spawn.nextInMs = randomBetween(state, LOW_WORK_SPAWN_MIN_MS, LOW_WORK_SPAWN_MAX_MS);
  }

  if (state.spawn.nextBurstInMs <= 0) {
    const count = Math.min(1, 5 - state.board.backlog.length);
    for (let index = 0; index < count; index += 1) {
      if (state.board.backlog.length < 5) addTask(state, generateTask(state));
    }
    state.spawn.nextBurstInMs = randomBetween(
      state,
      state.resources.trust < 40 ? 480000 : BURST_INTERVAL_MIN_MS,
      state.resources.trust < 40 ? 600000 : BURST_INTERVAL_MAX_MS,
    );
    state.spawn.nextInMs = randomSpawnInterval(state);
    return;
  }

  if (state.spawn.nextInMs <= 0) {
    addTask(state, generateTask(state));
    state.spawn.nextInMs = randomSpawnInterval(state);
  }
}

function updateShock(state: RtGameState, gameMinutes: number): void {
  for (const character of Object.values(state.characters)) {
    character.shockGameMinutes = Math.max(0, character.shockGameMinutes - gameMinutes);
    if (!character.assignedTaskId && !character.exhaustedToday) {
      character.stamina = clamp(character.stamina + gameMinutes * 0.12, 0, 100);
    }
  }
}

function crossedReleaseTrain(previousMinute: number, nextMinute: number): boolean {
  return previousMinute < RELEASE_TRAIN_GAME_MINUTE && nextMinute >= RELEASE_TRAIN_GAME_MINUTE;
}

function advanceDay(state: RtGameState): RtQuarterReviewReport | null {
  restTeamForNewDay(state);
  state.day += 1;
  state.dayInQuarter += 1;
  pushEvent(state, {
    type: "day_started",
    title: `Day ${state.day}`,
    body: "A new production day starts. The team had overnight rest.",
    effects: ["stamina restored overnight", "context shock cleared", "clock reset to 08:00"],
  });

  if (state.dayInQuarter > state.daysPerQuarter) {
    return resolveQuarter(state);
  }
  return null;
}

function restTeamForNewDay(state: RtGameState): void {
  for (const character of Object.values(state.characters)) {
    const missingStamina = 100 - character.stamina;
    const overnightRecovery = Math.max(
      NIGHT_STAMINA_MIN_RECOVERY,
      missingStamina * NIGHT_STAMINA_RECOVERY_RATIO,
    );
    character.stamina = clamp(character.stamina + overnightRecovery, 0, 100);
    character.shockGameMinutes = 0;
    character.exhaustedToday = false;
  }
}

function resolveQuarter(state: RtGameState): RtQuarterReviewReport {
  const reviewedQuarter = state.quarter;
  const valueActual = state.quarterValue;
  const valueTarget = state.quarterGoal.value;
  const trustActual = state.resources.trust;
  const trustTarget = state.quarterGoal.trust;
  const valueMet = valueActual >= valueTarget;
  const trustMet = trustActual >= trustTarget;
  const resourceBefore = copyResources(state.resources);
  const hitGoal =
    valueMet &&
    trustMet;
  if (hitGoal) {
    state.resources.budget += state.quarterGoal.rewardBudget;
    state.resources.processBoost = clamp(state.resources.processBoost + 5, 0, 25);
  } else {
    state.resources.trust = clamp(state.resources.trust - 8, 0, 100);
  }
  const resourceAfter = copyResources(state.resources);
  const resourceDelta = diffResources(resourceBefore, resourceAfter);
  const effects = morningReportEffects(resourceDelta);

  pushEvent(state, {
    type: "quarter_review",
    title: `Quarter ${reviewedQuarter} review`,
    body: hitGoal ? "Business goals were met." : "Business goals were missed.",
    effects,
  });

  const report: RtQuarterReviewReport = {
    quarter: reviewedQuarter,
    hitGoal,
    valueActual,
    valueTarget,
    valueMet,
    trustActual,
    trustTarget,
    trustMet,
    resourceBefore,
    resourceAfter,
    resourceDelta,
    effects,
  };

  state.quarter += 1;
  state.dayInQuarter = 1;
  state.quarterValue = 0;
  state.quarterGoal = {
    value: Math.round(state.quarterGoal.value * 1.18 + 20),
    trust: Math.min(70, state.quarterGoal.trust + 3),
    rewardBudget: state.quarterGoal.rewardBudget,
  };

  return report;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function normalizeConsequenceTaskTitle(title: string, sourceTaskId: string): string {
  const source = escapeRegExp(sourceTaskId);
  return title
    .replace(new RegExp(`: escalation after ${source} missed release$`), ": missed commitment escalated")
    .replace(new RegExp(`: small slip after ${source}$`), ": small slip")
    .replace(new RegExp(` after unfinished work on ${source}$`), " after unfinished work")
    .replace(new RegExp(` after ${source}$`), "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function checkRunState(state: RtGameState): void {
  if (state.resources.trust <= 0) {
    loseRun(state, "business trust reached 0", "trust");
  }
  if (state.resources.clients <= 0) {
    loseRun(state, "clients left the product", "clients");
  }
  if (state.resources.debt >= 100) {
    loseRun(state, "technical debt reached 100", "debt");
  }
}

function loseRun(
  state: RtGameState,
  reason: string,
  primaryMetric: RtLossReport["primaryMetric"],
): void {
  if (state.status === "lost") return;
  state.status = "lost";
  state.lossReason = reason;
  state.lossReport = buildLossReport(state, reason, primaryMetric);
  pushEvent(state, {
    type: "run_lost",
    title: "Run lost",
    body: state.lossReport.explanation,
    effects: [
      `trust ${state.resources.trust}`,
      `clients ${state.resources.clients}`,
      `debt ${state.resources.debt}`,
    ],
  });
}

function buildLossReport(
  state: RtGameState,
  reason: string,
  primaryMetric: RtLossReport["primaryMetric"],
): RtLossReport {
  const lastMissedTasks = state.log
    .filter(
      (event) =>
        event.type === "missed_task_resolved" ||
        event.type === "missed_minor_hit" ||
        event.type === "missed_tail_blocked",
    )
    .slice(0, 5)
    .map((event) => ({
      at: event.at,
      title: event.title,
      effects: event.effects,
    }));
  const lastBadReleases = state.log
    .filter(
      (event) =>
        event.type === "release" &&
        event.effects.some((effect) => effect.startsWith("trust -") || effect.startsWith("clients -")),
    )
    .slice(0, 5)
    .map((event) => ({
      at: event.at,
      title: event.title,
      effects: event.effects,
    }));
  const activePressure = Object.values(state.tasks)
    .filter((task) => !task.released)
    .sort((a, b) => a.deadlineMs - b.deadlineMs)
    .slice(0, 6)
    .map((task) => ({
      id: task.id,
      title: task.title,
      column: task.column,
      deadlineMs: Math.round(task.deadlineMs),
      assignedCharacterId: task.assignedCharacterId,
    }));

  const headline =
    primaryMetric === "trust"
      ? "Business trust hit zero."
      : primaryMetric === "clients"
        ? "Customers left the product."
        : "Technical debt overwhelmed the product.";
  const badReleaseCount = lastBadReleases.length;
  const explanation =
    primaryMetric === "trust"
      ? `Trust fell to 0. The latest run had ${badReleaseCount} recent release(s) that hurt trust or clients.`
      : primaryMetric === "clients"
        ? `Clients fell to 0. Recent low-quality releases and missed work made customers leave.`
        : `Debt reached 100. Recent releases shipped with too much risk, bugs, or unfinished work.`;
  const suggestion =
    badReleaseCount > 0
      ? "Do more Analysis, assign QA in To Do, and fix bugfix subtasks before moving cards to Done."
      : "Watch the deadline bars. Releasing late or low-quality work will drain trust.";

  return {
    reason,
    headline,
    explanation,
    primaryMetric,
    resourceSnapshot: { ...state.resources },
    lastMissedTasks,
    lastBadReleases,
    activePressure,
    suggestion,
  };
}

function randomSpawnInterval(state: RtGameState): number {
  const trustPressure = state.resources.trust < 40 ? 0.85 : state.resources.trust < 60 ? 0.95 : 1;
  const debtPressure = state.resources.debt > 60 ? 0.9 : 1;
  const backlogRelief = state.board.backlog.length >= 4 ? 1.6 : state.board.backlog.length >= 3 ? 1.25 : 1;
  const activeWorkCount = state.board.backlog.length + state.board.inProgress.length;
  if (activeWorkCount <= 1) {
    return Math.round(randomBetween(state, LOW_WORK_SPAWN_MIN_MS, LOW_WORK_SPAWN_MAX_MS));
  }
  return Math.round(
    randomBetween(state, SPAWN_INTERVAL_MIN_MS, SPAWN_INTERVAL_MAX_MS) *
      trustPressure *
      debtPressure *
      backlogRelief,
  );
}

function releaseNote(score: number): string {
  if (score >= 80) return "Strong release. Customers got what they needed.";
  if (score >= 60) return "Acceptable release. Some rough edges remain.";
  if (score >= 40) return "Risky release. Support will feel this.";
  return "Bad release. Customers are frustrated.";
}

function releaseTrustDelta(
  readiness: RtReleaseReadiness,
  score: number,
  blastMultiplier: number,
  currentTrust: number,
): number {
  const pressureMultiplier = currentTrust < 45 ? 1.45 : currentTrust < 60 ? 1.15 : 1;

  if (readiness === "clean") {
    if (score >= 80) return currentTrust < 45 ? 2 : 3;
    if (score >= 65) return 1;
    return -Math.ceil(3 * blastMultiplier * pressureMultiplier);
  }

  if (readiness === "risky") {
    if (score >= 75) return 1;
    if (score >= 60) return 0;
    if (score >= 45) return -Math.ceil(4 * blastMultiplier * pressureMultiplier);
    return -Math.ceil(8 * blastMultiplier * pressureMultiplier);
  }

  if (score >= 70) return -Math.ceil(1 * blastMultiplier * pressureMultiplier);
  if (score >= 55) return -Math.ceil(5 * blastMultiplier * pressureMultiplier);
  if (score >= 40) return -Math.ceil(8 * blastMultiplier * pressureMultiplier);
  return -Math.ceil(12 * blastMultiplier * pressureMultiplier);
}

function releaseClientDelta(
  readiness: RtReleaseReadiness,
  score: number,
  blastMultiplier: number,
  currentTrust: number,
): number {
  const pressureMultiplier = currentTrust < 45 ? 1.25 : 1;
  if (readiness === "clean" && score >= 75) return 2;
  if (readiness === "risky" && score >= 75) return 1;
  if (readiness !== "dirty" && score >= 60) return 0;
  if (readiness === "dirty" && score >= 60) return currentTrust < 45 ? -1 : 0;
  if (score >= 50) return -Math.ceil(1 * blastMultiplier * pressureMultiplier);
  return -Math.ceil(((60 - score) / 5) * blastMultiplier * pressureMultiplier);
}

function releaseBudgetGain(valueGain: number, score: number): number {
  if (score < 55) return 0;
  return Math.max(0, Math.floor(valueGain / 15));
}

function pushEvent(state: RtGameState, event: Omit<RtEvent, "at">): void {
  state.log.unshift({ at: formatGameTime(state), ...event });
  if (state.log.length > 500) state.log.length = 500;
}
