import type { RtBlastRadius, RtTaskKind } from "./types";

export const TICK_MS = 500;
export const GAME_MINUTES_PER_REAL_SECOND = 1;
export const GAME_MINUTES_PER_TICK = 0.5;
export const GAME_DAY_START_MINUTE = 8 * 60;
export const RELEASE_TRAIN_GAME_MINUTE = 18 * 60;
export const GAME_DAY_MINUTES = RELEASE_TRAIN_GAME_MINUTE - GAME_DAY_START_MINUTE;
export const DAYS_PER_QUARTER = 5;
export const DONE_REWORK_TRUST_COST = 4;

export const OUTSOURCE_COST_BY_IMPORTANCE = {
  optional: 3,
  important: 4,
  critical: 6,
} as const;

export const NIGHT_STAMINA_MIN_RECOVERY = 55;
export const NIGHT_STAMINA_RECOVERY_RATIO = 0.8;

export const FIRST_SPAWN_MIN_MS = 80000;
export const FIRST_SPAWN_MAX_MS = 120000;
export const SPAWN_INTERVAL_MIN_MS = 90000;
export const SPAWN_INTERVAL_MAX_MS = 150000;
export const LOW_WORK_SPAWN_MIN_MS = 25000;
export const LOW_WORK_SPAWN_MAX_MS = 45000;
export const BURST_INTERVAL_MIN_MS = 420000;
export const BURST_INTERVAL_MAX_MS = 660000;

export const WORK_SPEED_MULTIPLIER = 0.38;
export const ANALYSIS_SPEED_MULTIPLIER = 0.24;
export const WORK_STAMINA_DRAIN_BASE = 0.28;
export const WORK_PRESSURE_STAMINA_DRAIN = 0.045;
export const WORK_COMPLEXITY_STAMINA_DRAIN = 0.02;
export const OFF_ROLE_STAMINA_DRAIN = 0.12;
export const ANALYSIS_STAMINA_DRAIN_BASE = 0.23;
export const ANALYSIS_PRESSURE_STAMINA_DRAIN = 0.025;
export const ANALYSIS_COMPLEXITY_STAMINA_DRAIN = 0.012;

export const BACKLOG_LIMIT = 5;
export const FALLOUT_BACKLOG_EXTRA_SLOTS = 2;
export const MAX_FALLOUT_CHAIN_DEPTH = 2;
export const LATE_RELEASE_GRACE_MS = 30000;
export const LATE_RELEASE_FIRST_HALF_HOUR_PENALTY_PER_HOUR = 0.1;
export const LATE_RELEASE_AFTER_HALF_HOUR_PENALTY_PER_HOUR = 0.16;
export const LATE_RELEASE_PRESSURE_BASELINE = 3;
export const LATE_RELEASE_PRESSURE_PENALTY = 0.025;
export const LATE_RELEASE_KIND_SENSITIVITY: Record<RtTaskKind, number> = {
  feature: 1,
  bug: 0.9,
  techDebt: 0.45,
  integration: 1.2,
  incident: 1.25,
  performance: 0.9,
  compliance: 1.2,
};
export const LATE_RELEASE_BLAST_SENSITIVITY: Record<RtBlastRadius, number> = {
  low: 0,
  medium: 0.05,
  high: 0.12,
};
export const LATE_RELEASE_MAX_VALUE_PENALTY: Record<RtTaskKind, number> = {
  feature: 0.55,
  bug: 0.45,
  techDebt: 0.25,
  integration: 0.65,
  incident: 0.65,
  performance: 0.45,
  compliance: 0.65,
};
export const LATE_RELEASE_SCORE_PENALTY_WHEN_ON_TIME = 8;
export const LATE_RELEASE_SCORE_PENALTY_BASE = 6;
export const LATE_RELEASE_SCORE_PENALTY_PER_VALUE_PERCENT = 0.12;
export const LATE_RELEASE_SCORE_PENALTY_MIN = 8;
export const LATE_RELEASE_SCORE_PENALTY_MAX = 14;

export const FRONTEND_GUARDRAIL_WINDOW = 7;
export const FRONTEND_GUARDRAIL_MIN_MAJOR_WORK = 1;
