import {
  DEFAULT_LOCALE,
  type Locale,
} from "../i18n";
import {
  DAYS_PER_QUARTER,
  GAME_DAY_START_MINUTE,
  GAME_MINUTES_PER_REAL_SECOND,
  RELEASE_TRAIN_GAME_MINUTE,
  TICK_MS,
} from "../engine/balance";
import {
  canMoveTaskOnBoard,
  createBoard,
  moveTaskOnBoard,
} from "../engine/board";
import {
  checkRunState as checkRunStateInternal,
} from "../engine/loss";
import {
  collectMissedTaskIds,
  generateMorningConsequences as generateMorningConsequencesInternal,
} from "../engine/consequences";
import {
  normalizeRealtimeState as normalizeRealtimeStateInternal,
} from "../engine/migration";
import {
  canOutsourceTaskWork as canOutsourceTaskWorkInternal,
  outsourceTaskWork as outsourceTaskWorkInternal,
  updateOutsourcing,
} from "../engine/outsourcing";
import {
  addTaskToBacklog,
  createInitialSpawnState,
  seedInitialTasks,
  seedInitialTeam,
  updateSpawner,
} from "../engine/spawn";
import {
  assignCharacterToTaskWork,
  canAssignCharacterToTaskWork,
  cancelTaskWorkInternal,
  updateAssignments,
} from "../engine/work";
import {
  copyResources,
  diffResources,
  morningReportEffects,
} from "../engine/resources";
import {
  releaseRealtimeTask as releaseRealtimeTaskInternal,
  runDailyReleaseTrain as runDailyReleaseTrainInternal,
} from "../engine/release";
import {
  releaseReadiness,
} from "../engine/readiness";
import {
  advanceDay as advanceDayInternal,
  crossedReleaseTrain,
  updateShock,
  updateTaskTimers,
} from "../engine/time";
import {
  type RtColumn,
  type RtDaySummary,
  type RtEvent,
  type RtFalloutWarning,
  type RtGameState,
  type RtLateReleaseReport,
  type RtMorningReport,
  type RtMoveBlockReason,
  type RtMoveCheck,
  type RtOutsourceBlockReason,
  type RtOutsourceStatus,
  type RtOutsourcingWork,
  type RtQuarterReviewReport,
  type RtReadinessReport,
  type RtReleaseConsequence,
  type RtReleaseReadiness,
  type RtResources,
  type RtRole,
  type RtRunStatus,
  type RtStage,
  type RtSubtask,
  type RtTask,
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
  getOutsourceTaskWorkStatus,
} from "../engine/outsourcing";
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
    spawn: createInitialSpawnState(seed),
    log: [],
  };

  seedInitialTeam(state);
  seedInitialTasks(state, 2, (event) => pushEvent(state, event));

  pushEvent(state, {
    type: "run_started",
    title: "Run started",
    body: "Realtime flow is live.",
    effects: ["trust 70", "clients 100", "day starts at 08:00"],
  });

  return state;
}

export function normalizeRealtimeState(state: RtGameState): boolean {
  return normalizeRealtimeStateInternal(state);
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
    checkRunStateInternal(state, (event) => pushEvent(state, event));
    return;
  }

  updateShock(state, gameMinutes);
  updateTaskTimers(state, tickMs);
  updateOutsourcing(state, tickMs, (event) => pushEvent(state, event));
  updateAssignments(state, tickMs, (event) => pushEvent(state, event));
  updateSpawner(state, tickMs, (event) => pushEvent(state, event));
  checkRunStateInternal(state, (event) => pushEvent(state, event));
}

export function startDayAfterMorningReport(state: RtGameState): boolean {
  normalizeRealtimeState(state);
  if (!state.morningReport || state.status !== "running") return false;

  state.morningReport = null;
  state.paused = false;
  checkRunStateInternal(state, (event) => pushEvent(state, event));
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
  return canOutsourceTaskWorkInternal(state, taskId);
}

export function outsourceTaskWork(state: RtGameState, taskId: string): boolean {
  return outsourceTaskWorkInternal(state, taskId, (event) => pushEvent(state, event));
}

export function cancelTaskWork(state: RtGameState, taskId: string): boolean {
  return cancelTaskWorkInternal(state, taskId, (event) => pushEvent(state, event));
}

export function releaseRealtimeTask(state: RtGameState, taskId: string): boolean {
  return releaseRealtimeTaskInternal(state, taskId, (event) => pushEvent(state, event));
}

export function runDailyReleaseTrain(state: RtGameState): string[] {
  return runDailyReleaseTrainInternal(state, (event) => pushEvent(state, event));
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
  const quarterReview = advanceDayInternal(state, (event) => pushEvent(state, event));
  const resourceAfterQuarter = copyResources(state.resources);
  state.gameMinuteOfDay = GAME_DAY_START_MINUTE;
  const consequences = generateMorningConsequencesInternal(state, shippedTaskIds, missedTaskIds, {
    addTask: (task, backlogLimit) =>
      addTaskToBacklog(state, task, (event) => pushEvent(state, event), backlogLimit),
    emit: (event) => pushEvent(state, event),
  });
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

function pushEvent(state: RtGameState, event: Omit<RtEvent, "at">): void {
  state.log.unshift({ at: formatGameTime(state), ...event });
  if (state.log.length > 500) state.log.length = 500;
}
