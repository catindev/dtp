import {
  DAYS_PER_QUARTER,
  GAME_DAY_START_MINUTE,
} from "./balance";
import { createBacklogDecayDayStats } from "./backlogOpportunity";
import { removeTaskFromBoard } from "./board";
import {
  type EngineLocale,
  normalizeEngineLocale,
} from "./locale";
import { clamp } from "./math";
import { normalizeMorningReportState } from "./migrationReports";
import { normalizeTaskForCurrentSchema } from "./migrationTasks";
import {
  RT_COLUMNS,
  type RtCharacter,
  type RtGameState,
  type RtMorningReport,
} from "./types";

export function normalizeRealtimeState(state: RtGameState): boolean {
  let changed = false;
  const board = state.board as Record<string, string[] | undefined>;
  const legacyState = state as RtGameState & {
    releaseReview?: RtMorningReport | null;
    morningReport?: RtMorningReport | null;
    locale?: EngineLocale;
    backlogDecayToday?: RtGameState["backlogDecayToday"];
  };

  const normalizedLocale = normalizeEngineLocale(legacyState.locale);
  if (state.locale !== normalizedLocale) {
    state.locale = normalizedLocale;
    changed = true;
  }

  changed = normalizeMorningReportState(state, legacyState) || changed;
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
  if (!legacyState.backlogDecayToday) {
    state.backlogDecayToday = createBacklogDecayDayStats();
    changed = true;
  } else {
    const stats = state.backlogDecayToday;
    if (typeof stats.valueLost !== "number" || !Number.isFinite(stats.valueLost)) {
      stats.valueLost = 0;
      changed = true;
    }
    if (typeof stats.expiredCount !== "number" || !Number.isFinite(stats.expiredCount)) {
      stats.expiredCount = 0;
      changed = true;
    }
    if (typeof stats.debtAdded !== "number" || !Number.isFinite(stats.debtAdded)) {
      stats.debtAdded = 0;
      changed = true;
    }
    if (!Array.isArray(stats.expiredTaskIds)) {
      stats.expiredTaskIds = [];
      changed = true;
    }
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
    changed = normalizeTaskForCurrentSchema(state, task) || changed;
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
