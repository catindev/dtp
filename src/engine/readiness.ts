import {
  LATE_RELEASE_AFTER_HALF_HOUR_PENALTY_PER_HOUR,
  LATE_RELEASE_BLAST_SENSITIVITY,
  LATE_RELEASE_FIRST_HALF_HOUR_PENALTY_PER_HOUR,
  LATE_RELEASE_GRACE_MS,
  LATE_RELEASE_KIND_SENSITIVITY,
  LATE_RELEASE_MAX_VALUE_PENALTY,
  LATE_RELEASE_PRESSURE_BASELINE,
  LATE_RELEASE_PRESSURE_PENALTY,
  LATE_RELEASE_SCORE_PENALTY_BASE,
  LATE_RELEASE_SCORE_PENALTY_MAX,
  LATE_RELEASE_SCORE_PENALTY_MIN,
  LATE_RELEASE_SCORE_PENALTY_PER_VALUE_PERCENT,
  LATE_RELEASE_SCORE_PENALTY_WHEN_ON_TIME,
  RELEASE_DEADLINE_PRESSURE_RATIO,
  RELEASE_LOW_CLARITY_THRESHOLD,
  RELEASE_QA_COVERAGE_THRESHOLD,
  RELEASE_SCORE_BUG_PENALTY,
  RELEASE_SCORE_CLARITY_WEIGHT,
  RELEASE_SCORE_COMPLETED_RATIO_WEIGHT,
  RELEASE_SCORE_DEADLINE_PRESSURE_PENALTY,
  RELEASE_SCORE_DEADLINE_PRESSURE_RATIO,
  RELEASE_SCORE_DEBT_PENALTY_PER_DEBT,
  RELEASE_SCORE_HIDDEN_OPEN_PENALTY,
  RELEASE_SCORE_OPEN_CRITICAL_PENALTY,
  RELEASE_SCORE_OPEN_IMPORTANT_PENALTY,
  RELEASE_SCORE_QA_WEIGHT,
  RELEASE_SCORE_QUALITY_WEIGHT,
  RELEASE_SCORE_WORK_DONE_BONUS,
  RELEASE_SCORE_WORK_NOT_DONE_PENALTY,
} from "./balance";
import { clamp } from "./math";
import type {
  RtFalloutWarning,
  RtGameState,
  RtLateReleaseReport,
  RtReadinessReport,
  RtRiskReason,
  RtTask,
} from "./types";

export function falloutWarningForTask(task: RtTask): RtFalloutWarning | null {
  if (task.resolved || task.released) return null;
  const readiness = releaseReadiness(task);
  const reasons = readiness.reasons.slice(0, 3).map(formatRiskReason);

  if (task.column === "done") {
    if (readiness.readiness === "dirty") {
      return {
        level: "likely",
        label: "Likely follow-up tomorrow",
        reasons,
      };
    }
    if (readiness.readiness === "risky") {
      return {
        level: "possible",
        label: "May create follow-up tomorrow",
        reasons,
      };
    }
  }
  if (task.column === "backlog" || task.column === "inProgress") {
    if (task.deadlineMs <= 0) {
      return {
        level: "likely",
        label: "Will resolve as missed work",
        reasons: ["missed deadline"],
      };
    }
    if (taskDeadlineRatio(task) <= RELEASE_DEADLINE_PRESSURE_RATIO) {
      return {
        level: "possible",
        label: "Can become missed work",
        reasons: ["deadline pressure"],
      };
    }
  }
  return null;
}

export function taskDeadlineRatio(task: RtTask): number {
  return task.deadlineMaxMs <= 0 ? 0 : task.deadlineMs / task.deadlineMaxMs;
}

export function lateReleaseReport(task: RtTask): RtLateReleaseReport {
  const overdueMs = Math.max(0, Math.round(task.overdueMs));
  if (overdueMs <= LATE_RELEASE_GRACE_MS) {
    return {
      overdueMs,
      overdueGameMinutes: Math.round(overdueMs / 1000),
      valueMultiplier: 1,
      valuePenaltyPercent: 0,
    };
  }

  const overdueGameMinutes = overdueMs / 1000;
  const overdueHours = overdueGameMinutes / 60;
  const firstHalfHourPenalty =
    Math.min(overdueHours, 0.5) * LATE_RELEASE_FIRST_HALF_HOUR_PENALTY_PER_HOUR;
  const latePenalty =
    Math.max(0, overdueHours - 0.5) * LATE_RELEASE_AFTER_HALF_HOUR_PENALTY_PER_HOUR;
  const pressurePenalty =
    Math.max(0, task.pressure - LATE_RELEASE_PRESSURE_BASELINE) *
    LATE_RELEASE_PRESSURE_PENALTY;
  const sensitivity = lateSensitivity(task);
  const maxPenalty = lateMaxPenalty(task);
  const penalty = clamp(
    (firstHalfHourPenalty + latePenalty + pressurePenalty) * sensitivity,
    0,
    maxPenalty,
  );
  const valueMultiplier = clamp(1 - penalty, 0, 1);

  return {
    overdueMs,
    overdueGameMinutes: Math.round(overdueGameMinutes),
    valueMultiplier,
    valuePenaltyPercent: Math.round((1 - valueMultiplier) * 100),
  };
}

export function formatOverdueGameTime(overdueMs: number): string {
  const totalMinutes = Math.max(0, Math.round(overdueMs / 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export function releaseReadiness(task: RtTask): RtReadinessReport {
  const knownCriticalOpen = task.subtasks.filter(
    (subtask) => subtask.revealed && subtask.importance === "critical" && !subtask.done,
  ).length;
  const knownImportantOpen = task.subtasks.filter(
    (subtask) => subtask.revealed && subtask.importance === "important" && !subtask.done,
  ).length;
  const qaCovered = task.testCoverage >= RELEASE_QA_COVERAGE_THRESHOLD;
  const sreCovered = task.subtasks.some(
    (subtask) => subtask.revealed && subtask.role === "sre" && subtask.done,
  );
  const deadlineRatio = taskDeadlineRatio(task);
  const reasons = uniqueReasons([
    !task.workDone ? "not_implemented" : null,
    knownCriticalOpen > 0 ? "critical_open" : null,
    knownImportantOpen > 0 ? "important_open" : null,
    task.bugs > 0 ? "known_bug" : null,
    !qaCovered ? "no_qa" : null,
    task.clarity < RELEASE_LOW_CLARITY_THRESHOLD ? "low_clarity" : null,
    deadlineRatio <= RELEASE_DEADLINE_PRESSURE_RATIO ? "deadline_pressure" : null,
    task.blastRadius === "high" && !sreCovered ? "blast_radius_uncovered" : null,
    task.changedAfterQa ? "changed_after_qa" : null,
    task.subtasks.some((subtask) => subtask.revealed && subtask.role === "sre") && !sreCovered
      ? "no_sre"
      : null,
  ]);

  const readiness =
    !task.workDone ||
    knownCriticalOpen > 0 ||
    task.bugs > 0 ||
    task.changedAfterQa ||
    (task.blastRadius === "high" && !sreCovered && !qaCovered)
      ? "dirty"
      : reasons.length > 0
        ? "risky"
        : "clean";

  return {
    readiness,
    reasons,
    blastRadius: task.blastRadius,
    knownCriticalOpen,
    knownImportantOpen,
    qaCovered,
    sreCovered,
  };
}

export function releaseScore(state: RtGameState, task: RtTask): number {
  const deadlineMsForScore = task.queuedDeadlineMs ?? task.deadlineMs;
  const deadlineRatioForScore =
    task.deadlineMaxMs <= 0 ? 0 : deadlineMsForScore / task.deadlineMaxMs;
  const deadlinePenalty =
    deadlineMsForScore <= 0
      ? lateReleaseScorePenalty(task)
      : deadlineRatioForScore < RELEASE_SCORE_DEADLINE_PRESSURE_RATIO
        ? RELEASE_SCORE_DEADLINE_PRESSURE_PENALTY
        : 0;
  const bugPenalty = task.bugs * RELEASE_SCORE_BUG_PENALTY;
  const debtPenalty = state.resources.debt * RELEASE_SCORE_DEBT_PENALTY_PER_DEBT;
  const openCritical = task.subtasks.filter(
    (subtask) => subtask.importance === "critical" && !subtask.done,
  ).length;
  const openImportant = task.subtasks.filter(
    (subtask) => subtask.importance === "important" && !subtask.done,
  ).length;
  const hiddenOpen = task.subtasks.filter((subtask) => !subtask.revealed && !subtask.done).length;
  const completedRatio =
    task.subtasks.length === 0
      ? 0
      : task.subtasks.filter((subtask) => subtask.done).length / task.subtasks.length;
  const score =
    task.quality * RELEASE_SCORE_QUALITY_WEIGHT +
    task.clarity * RELEASE_SCORE_CLARITY_WEIGHT +
    task.testCoverage * RELEASE_SCORE_QA_WEIGHT +
    completedRatio * RELEASE_SCORE_COMPLETED_RATIO_WEIGHT +
    (task.workDone ? RELEASE_SCORE_WORK_DONE_BONUS : -RELEASE_SCORE_WORK_NOT_DONE_PENALTY) -
    openCritical * RELEASE_SCORE_OPEN_CRITICAL_PENALTY -
    openImportant * RELEASE_SCORE_OPEN_IMPORTANT_PENALTY -
    hiddenOpen * RELEASE_SCORE_HIDDEN_OPEN_PENALTY -
    task.offRolePenalty -
    deadlinePenalty -
    bugPenalty -
    debtPenalty;
  return Math.round(clamp(score, 0, 100));
}

export function formatRiskReason(reason: RtRiskReason): string {
  switch (reason) {
    case "no_qa":
      return "no QA pass";
    case "no_sre":
      return "SRE safety missing";
    case "known_bug":
      return "known bugs";
    case "low_clarity":
      return "low clarity";
    case "critical_open":
      return "known critical work open";
    case "important_open":
      return "known important work open";
    case "deadline_pressure":
      return "deadline pressure";
    case "blast_radius_high":
      return "high blast radius";
    case "blast_radius_uncovered":
      return "failure impact high";
    case "changed_after_qa":
      return "changed after QA";
    case "not_implemented":
      return "implementation incomplete";
  }
}

function lateSensitivity(task: RtTask): number {
  return (
    LATE_RELEASE_KIND_SENSITIVITY[task.kind] +
    LATE_RELEASE_BLAST_SENSITIVITY[task.blastRadius]
  );
}

function lateMaxPenalty(task: RtTask): number {
  return LATE_RELEASE_MAX_VALUE_PENALTY[task.kind];
}

function lateReleaseScorePenalty(task: RtTask): number {
  const late = lateReleaseReport(task);
  if (late.valuePenaltyPercent === 0) return LATE_RELEASE_SCORE_PENALTY_WHEN_ON_TIME;
  return Math.round(
    clamp(
      LATE_RELEASE_SCORE_PENALTY_BASE +
        late.valuePenaltyPercent * LATE_RELEASE_SCORE_PENALTY_PER_VALUE_PERCENT,
      LATE_RELEASE_SCORE_PENALTY_MIN,
      LATE_RELEASE_SCORE_PENALTY_MAX,
    ),
  );
}

function uniqueReasons(reasons: Array<RtRiskReason | null>): RtRiskReason[] {
  return Array.from(new Set(reasons.filter((reason): reason is RtRiskReason => Boolean(reason))));
}
