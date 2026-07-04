import {
  DEFAULT_LOCALE,
  type Locale,
} from "../i18n";
import {
  DAYS_PER_QUARTER,
  GAME_DAY_START_MINUTE,
  GAME_MINUTES_PER_REAL_SECOND,
  TICK_MS,
} from "../engine/balance";
import { createCampaignCalendar } from "../engine/calendar";
import { createInitialHorizonGoals } from "../engine/goals";
import {
  createBacklogDecayDayStats,
  resetBacklogDecayDayStats,
} from "../engine/backlogOpportunity";
import {
  canMoveTaskOnBoard,
  createBoard,
  moveTaskOnBoard,
} from "../engine/board";
import {
  checkRunState as checkRunStateInternal,
} from "../engine/loss";
import {
  normalizeRealtimeState as normalizeRealtimeStateInternal,
} from "../engine/migration";
import {
  openMorningReport as openMorningReportInternal,
} from "../engine/morning";
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
  releaseRealtimeTask as releaseRealtimeTaskInternal,
  runDailyReleaseTrain as runDailyReleaseTrainInternal,
} from "../engine/release";
import {
  crossedReleaseTrain,
  formatGameTime as formatGameTimeInternal,
  updateShock,
  updateTaskTimers,
} from "../engine/time";
import {
  type RtColumn,
  type RtEvent,
  type RtGameState,
  type RtMoveCheck,
  type RtStage,
  type RtWorkColumn,
} from "../engine/types";
export {
  DAYS_PER_QUARTER,
  DAYS_PER_MONTH,
  DAYS_PER_WEEK,
  DAYS_PER_YEAR,
  DONE_REWORK_TRUST_COST,
  GAME_DAY_MINUTES,
  GAME_DAY_START_MINUTE,
  GAME_MINUTES_PER_REAL_SECOND,
  GAME_MINUTES_PER_TICK,
  OUTSOURCE_COST_BY_IMPORTANCE,
  RELEASE_TRAIN_GAME_MINUTE,
  TICK_MS,
  WEEKS_PER_MONTH,
} from "../engine/balance";
export {
  createCampaignCalendar,
  daysLeftInHorizon,
  isHorizonEndDay,
  isHorizonStart,
} from "../engine/calendar";
export {
  applyValueGainToHorizonGoals,
  createInitialHorizonGoals,
  ensureUnlockedHorizonGoals,
} from "../engine/goals";
export { RT_COLUMNS } from "../engine/types";
export {
  backlogValueRatio,
  isUntouchedBacklogTask,
} from "../engine/backlogOpportunity";
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
  RtCampaignCalendar,
  RtCharacter,
  RtColumn,
  RtConsequenceSource,
  RtDaySummary,
  RtEvent,
  RtEventData,
  RtEventDataValue,
  RtFalloutWarning,
  RtGameState,
  RtHorizonGoal,
  RtHorizonGoals,
  RtHorizonKind,
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
  const calendar = createCampaignCalendar(1);
  const resources = {
    trust: 70,
    debt: 20,
    value: 0,
    clients: 100,
    budget: 4,
    processBoost: 0,
  };
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
    calendar,
    quarter: 1,
    dayInQuarter: 1,
    daysPerQuarter: DAYS_PER_QUARTER,
    resources,
    horizonGoals: createInitialHorizonGoals({ calendar, resources }),
    quarterGoal: {
      value: 75,
      trust: 45,
      rewardBudget: 2,
    },
    quarterValue: 0,
    backlogDecayToday: createBacklogDecayDayStats(),
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
    openMorningReportInternal(state, {
      addTask: (task, backlogLimit) =>
        addTaskToBacklog(state, task, (event) => pushEvent(state, event), backlogLimit),
      emit: (event) => pushEvent(state, event),
    });
    checkRunStateInternal(state, (event) => pushEvent(state, event));
    return;
  }

  updateShock(state, gameMinutes);
  updateTaskTimers(state, tickMs, (event) => pushEvent(state, event));
  updateOutsourcing(state, tickMs, (event) => pushEvent(state, event));
  updateAssignments(state, tickMs, (event) => pushEvent(state, event));
  updateSpawner(state, tickMs, (event) => pushEvent(state, event));
  checkRunStateInternal(state, (event) => pushEvent(state, event));
}

export function startDayAfterMorningReport(state: RtGameState): boolean {
  normalizeRealtimeState(state);
  if (!state.morningReport || state.status !== "running") return false;

  state.morningReport = null;
  resetBacklogDecayDayStats(state);
  state.paused = false;
  checkRunStateInternal(state, (event) => pushEvent(state, event));
  return true;
}

export function moveRealtimeTask(
  state: RtGameState,
  taskId: string,
  targetColumn: RtColumn,
  targetIndex?: number,
): boolean {
  return moveTaskOnBoard(state, taskId, targetColumn, (event) => pushEvent(state, event), targetIndex);
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

export function formatGameTime(state: RtGameState): string {
  return formatGameTimeInternal(state);
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
