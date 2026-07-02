import type {
  RtConsequenceSource,
  RtReleaseConsequenceCause,
  RtTask,
  RtTaskKind,
} from "./types";

export function normalizeConsequenceTaskTitle(title: string, sourceTaskId: string): string {
  const source = escapeRegExp(sourceTaskId);
  return title
    .replace(new RegExp(`: escalation after ${source} missed release$`), ": missed commitment escalated")
    .replace(new RegExp(`: small slip after ${source}$`), ": small slip")
    .replace(new RegExp(` after unfinished work on ${source}$`), " after unfinished work")
    .replace(new RegExp(` after ${source}$`), "");
}

export function consequenceTaskKind(cause: RtReleaseConsequenceCause, score: number): RtTaskKind {
  if (cause === "known_bug" || cause === "changed_after_qa") return "bug";
  if (cause === "ignored_work") return score < 45 ? "incident" : "integration";
  if (cause === "missed_deadline") return "incident";
  if (cause === "terminal_chain") return "incident";
  if (cause === "no_sre" || score < 45) return "incident";
  if (cause === "low_clarity") return "feature";
  return "incident";
}

export function releaseConsequenceSymptom(task: RtTask, cause: RtReleaseConsequenceCause): string {
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

export function missedConsequenceSymptom(
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

export function consequenceCauseText(cause: RtReleaseConsequenceCause): string {
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
