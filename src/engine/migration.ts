import {
  DAYS_PER_QUARTER,
  GAME_DAY_START_MINUTE,
} from "./balance";
import { removeTaskFromBoard } from "./board";
import {
  ensureBugReviewSubtask,
  ensureQaRecheckSubtask,
} from "./bugs";
import { normalizeConsequenceTaskTitle } from "./consequences";
import {
  type EngineLocale,
  normalizeEngineLocale,
} from "./locale";
import { clamp } from "./math";
import { emptyResourceDelta } from "./resources";
import { inferBlastRadius } from "./taskFactory";
import {
  RT_COLUMNS,
  type RtBlastRadius,
  type RtCharacter,
  type RtConsequenceSource,
  type RtDaySummary,
  type RtGameState,
  type RtMorningReport,
  type RtOutsourcingWork,
  type RtQuarterReviewReport,
  type RtReleaseConsequence,
  type RtResources,
  type RtTask,
  type RtTaskResolution,
} from "./types";

export function normalizeRealtimeState(state: RtGameState): boolean {
  let changed = false;
  const board = state.board as Record<string, string[] | undefined>;
  const legacyState = state as RtGameState & {
    releaseReview?: RtMorningReport | null;
    morningReport?: RtMorningReport | null;
    locale?: EngineLocale;
  };

  const normalizedLocale = normalizeEngineLocale(legacyState.locale);
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

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}
