import type { EngineLocale } from "./locale";

export const RT_COLUMNS = ["backlog", "inProgress", "done", "released"] as const;
export type RtColumn = (typeof RT_COLUMNS)[number];

export type RtTaskKind =
  | "feature"
  | "bug"
  | "techDebt"
  | "integration"
  | "incident"
  | "performance"
  | "compliance";

export type RtRole = "analyst" | "designer" | "backend" | "frontend" | "qa" | "sre";
export type RtStage = "analysis" | "todo" | "test";
export type RtWorkColumn = Extract<RtColumn, "inProgress">;
export type RtRunStatus = "running" | "won" | "lost";
export type RtSubtaskRole = "backend" | "frontend" | "design" | "qa" | "sre" | "bugfix";
export type RtSubtaskImportance = "critical" | "important" | "optional";
export type RtBlastRadius = "low" | "medium" | "high";
export type RtReleaseReadiness = "clean" | "risky" | "dirty";
export type RtHorizonKind = "week" | "month" | "quarter" | "year";
export type RtRiskReason =
  | "no_qa"
  | "no_sre"
  | "known_bug"
  | "low_clarity"
  | "critical_open"
  | "important_open"
  | "blast_radius_high"
  | "blast_radius_uncovered"
  | "changed_after_qa"
  | "not_implemented";

export interface RtReadinessReport {
  readiness: RtReleaseReadiness;
  reasons: RtRiskReason[];
  blastRadius: RtBlastRadius;
  knownCriticalOpen: number;
  knownImportantOpen: number;
  qaCovered: boolean;
  sreCovered: boolean;
}

export type RtMoveBlockReason =
  | "task_missing"
  | "task_released"
  | "task_busy"
  | "released_locked"
  | "same_column"
  | "done_reopen_only_to_work"
  | "backlog_to_done_forbidden"
  | "engaged_backlog_forbidden";

export interface RtMoveCheck {
  allowed: boolean;
  reason?: RtMoveBlockReason;
}

export interface RtSubtask {
  id: string;
  title: string;
  role: RtSubtaskRole;
  importance: RtSubtaskImportance;
  revealed: boolean;
  done: boolean;
  progress: number;
  completedBy: string | null;
  offRole: boolean;
}

export interface RtResources {
  trust: number;
  debt: number;
  value: number;
  clients: number;
  budget: number;
  processBoost: number;
}

export type RtReleaseConsequenceCause =
  | "known_bug"
  | "changed_after_qa"
  | "no_qa"
  | "no_sre"
  | "critical_open"
  | "important_open"
  | "low_clarity"
  | "deadline_pressure"
  | "ignored_work"
  | "missed_deadline"
  | "terminal_chain";

export type RtConsequenceSource =
  | "release"
  | "missed_backlog"
  | "missed_in_progress"
  | "terminal";

export type RtTaskResolution =
  | "missed_minor"
  | "missed_tail"
  | "missed_terminal"
  | "backlog_opportunity_expired";

export interface RtReleaseConsequence {
  id: string;
  source: RtConsequenceSource;
  sourceTaskId: string;
  sourceTitle: string;
  rootCauseTaskId: string;
  chainDepth: number;
  cause: RtReleaseConsequenceCause;
  symptom: string;
  generatedTaskId: string | null;
  terminal: boolean;
  resourceDelta: Partial<RtResources>;
  effects: string[];
}

export interface RtDaySummary {
  day: number;
  campaignDay: number;
  weekId: number;
  monthId: number;
  quarterId: number;
  shipped: number;
  releasedClean: number;
  releasedRisky: number;
  releasedDirty: number;
  missedBacklog: number;
  missedInProgress: number;
  missedMinor: number;
  backlogValueLost: number;
  backlogExpiredCount: number;
  backlogDebtAdded: number;
  falloutCreated: number;
  falloutResolved: number;
  unresolvedFallout: number;
  terminalConsequences: number;
}

export interface RtBacklogDecayDayStats {
  valueLost: number;
  expiredCount: number;
  debtAdded: number;
  expiredTaskIds: string[];
}

export interface RtQuarterReviewReport {
  quarter: number;
  hitGoal: boolean;
  valueActual: number;
  valueTarget: number;
  valueMet: boolean;
  trustActual: number;
  trustTarget: number;
  trustMet: boolean;
  resourceBefore: RtResources;
  resourceAfter: RtResources;
  resourceDelta: RtResources;
  effects: string[];
}

export interface RtMorningReport {
  id: string;
  quarter: number;
  day: number;
  previousDay: number;
  at: string;
  shippedTaskIds: string[];
  resourceBefore: RtResources;
  resourceAfter: RtResources;
  resourceDelta: RtResources;
  releaseDelta: RtResources;
  consequenceDelta: RtResources;
  quarterReview: RtQuarterReviewReport | null;
  empty: boolean;
  effects: string[];
  missedTaskIds: string[];
  consequences: RtReleaseConsequence[];
  daySummary: RtDaySummary;
}

export interface RtTask {
  id: string;
  title: string;
  kind: RtTaskKind;
  domain: string;
  blastRadius: RtBlastRadius;
  column: RtColumn;
  pressure: number;
  complexity: number;
  baseValue: number;
  backlogValue: number;
  backlogDecayElapsedMs: number;
  backlogDecayDurationMs: number;
  engagedOnce: boolean;
  value: number;
  clarity: number;
  quality: number;
  testCoverage: number;
  bugs: number;
  changedAfterQa: boolean;
  workDone: boolean;
  subtasks: RtSubtask[];
  currentSubtaskId: string | null;
  offRolePenalty: number;
  postmortem: string[];
  deadlineMs: number;
  deadlineMaxMs: number;
  overdueMs: number;
  stageProgress: number;
  stageComplete: boolean;
  assignedCharacterId: string | null;
  outsourcing: RtOutsourcingWork | null;
  released: boolean;
  rootCauseTaskId: string | null;
  sourceTaskId: string | null;
  chainDepth: number;
  resolved: boolean;
  resolution: RtTaskResolution | null;
  resolutionDay: number | null;
  releaseScore: number | null;
  queuedDeadlineMs: number | null;
  lastNote: string;
}

export interface RtLateReleaseReport {
  overdueMs: number;
  overdueGameMinutes: number;
  valueMultiplier: number;
  valuePenaltyPercent: number;
}

export interface RtOutsourcingWork {
  subtaskId: string;
  cost: number;
  progress: number;
}

export interface RtCharacter {
  id: string;
  name: string;
  role: RtRole;
  skill: Record<RtStage, number>;
  specialty: Record<RtSubtaskRole, number>;
  xp: Record<RtSubtaskRole, number>;
  stamina: number;
  burnout: number;
  assignedTaskId: string | null;
  shockGameMinutes: number;
  exhaustedToday: boolean;
}

export type RtEventDataValue = string | number | boolean | null;
export type RtEventData = Record<string, RtEventDataValue>;

export interface RtEvent {
  at: string;
  type: string;
  title: string;
  body: string;
  effects: string[];
  data?: RtEventData;
}

export interface RtFalloutWarning {
  level: "possible" | "likely";
  label: string;
  reasons: string[];
}

export interface RtAssignmentPlan {
  character: RtCharacter;
  task: RtTask;
  subtask: RtSubtask | null;
  willAnalyze: boolean;
}

export interface RtOutsourcePlan {
  task: RtTask;
  subtask: RtSubtask;
  cost: number;
}

export type RtOutsourceBlockReason =
  | "ready"
  | "task_missing"
  | "task_busy"
  | "task_released"
  | "wrong_column"
  | "needs_analysis"
  | "no_open_work"
  | "insufficient_budget";

export interface RtOutsourceStatus {
  allowed: boolean;
  reason: RtOutsourceBlockReason;
  currentBudget: number;
  cost: number | null;
  neededBudget: number | null;
  subtask: RtSubtask | null;
}

export interface RtLossReport {
  reason: string;
  headline: string;
  explanation: string;
  primaryMetric: "trust" | "clients" | "debt";
  resourceSnapshot: RtResources;
  lastMissedTasks: Array<{ at: string; title: string; effects: string[] }>;
  lastBadReleases: Array<{ at: string; title: string; effects: string[] }>;
  activePressure: Array<{
    id: string;
    title: string;
    column: RtColumn;
    deadlineMs: number;
    assignedCharacterId: string | null;
  }>;
  suggestion: string;
}

export interface RtQuarterGoal {
  value: number;
  trust: number;
  rewardBudget: number;
}

export interface RtHorizonGoal {
  kind: RtHorizonKind;
  id: number;
  openedOnDay: number;
  endsOnDay: number;
  startValue: number;
  expectedValue: number;
  targetValue: number;
  currentValue: number;
  targetTrust: number;
  rewardBudget: number;
  rewardProcessBoost: number;
  missedTrustPenalty: number;
}

export type RtHorizonGoals = Record<RtHorizonKind, RtHorizonGoal | null>;

export interface RtCampaignCalendar {
  campaignDay: number;
  year: number;
  week: number;
  dayInWeek: number;
  month: number;
  weekInMonth: number;
  quarter: number;
  dayInQuarter: number;
  monthInQuarter: number;
  daysPerWeek: number;
  weeksPerMonth: number;
  daysPerMonth: number;
  monthsPerQuarter: number;
  daysPerQuarter: number;
  quartersPerYear: number;
  daysPerYear: number;
  unlockedHorizons: RtHorizonKind[];
}

export interface RtSpawnState {
  nextInMs: number;
  nextBurstInMs: number;
}

export interface RtGameState {
  seed: number;
  rngState: number;
  locale: EngineLocale;
  paused: boolean;
  status: RtRunStatus;
  lossReason: string | null;
  lossReport: RtLossReport | null;
  elapsedRealMs: number;
  elapsedGameMinutes: number;
  gameMinuteOfDay: number;
  day: number;
  calendar: RtCampaignCalendar;
  quarter: number;
  dayInQuarter: number;
  daysPerQuarter: number;
  resources: RtResources;
  horizonGoals: RtHorizonGoals;
  quarterGoal: RtQuarterGoal;
  quarterValue: number;
  backlogDecayToday: RtBacklogDecayDayStats;
  morningReport: RtMorningReport | null;
  board: Record<RtColumn, string[]>;
  tasks: Record<string, RtTask>;
  characters: Record<string, RtCharacter>;
  nextTaskId: number;
  nextCharacterId: number;
  spawn: RtSpawnState;
  log: RtEvent[];
}
