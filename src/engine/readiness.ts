import { LATE_RELEASE_GRACE_MS } from "./balance";
import { clamp } from "./math";
import type {
  RtFalloutWarning,
  RtGameState,
  RtLateReleaseReport,
  RtReadinessReport,
  RtRiskReason,
  RtTask,
  RtTaskKind,
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
    if (taskDeadlineRatio(task) <= 0.18) {
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
  const firstHalfHourPenalty = Math.min(overdueHours, 0.5) * 0.1;
  const latePenalty = Math.max(0, overdueHours - 0.5) * 0.16;
  const pressurePenalty = Math.max(0, task.pressure - 3) * 0.025;
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
  const qaCovered = task.testCoverage >= 45;
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
    task.clarity < 55 ? "low_clarity" : null,
    deadlineRatio <= 0.18 ? "deadline_pressure" : null,
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
      : deadlineRatioForScore < 0.2
        ? 8
        : 0;
  const bugPenalty = task.bugs * 12;
  const debtPenalty = state.resources.debt * 0.12;
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
    task.quality * 0.45 +
    task.clarity * 0.25 +
    task.testCoverage * 0.25 +
    completedRatio * 25 +
    (task.workDone ? 8 : -18) -
    openCritical * 22 -
    openImportant * 9 -
    hiddenOpen * 10 -
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
  const kindSensitivity: Record<RtTaskKind, number> = {
    feature: 1,
    bug: 0.9,
    techDebt: 0.45,
    integration: 1.2,
    incident: 1.25,
    performance: 0.9,
    compliance: 1.2,
  };
  const blastAdjustment =
    task.blastRadius === "high" ? 0.12 : task.blastRadius === "medium" ? 0.05 : 0;
  return kindSensitivity[task.kind] + blastAdjustment;
}

function lateMaxPenalty(task: RtTask): number {
  switch (task.kind) {
    case "techDebt":
      return 0.25;
    case "bug":
    case "performance":
      return 0.45;
    case "feature":
      return 0.55;
    case "integration":
    case "incident":
    case "compliance":
      return 0.65;
  }
}

function lateReleaseScorePenalty(task: RtTask): number {
  const late = lateReleaseReport(task);
  if (late.valuePenaltyPercent === 0) return 8;
  return Math.round(clamp(6 + late.valuePenaltyPercent * 0.12, 8, 14));
}

function uniqueReasons(reasons: Array<RtRiskReason | null>): RtRiskReason[] {
  return Array.from(new Set(reasons.filter((reason): reason is RtRiskReason => Boolean(reason))));
}
