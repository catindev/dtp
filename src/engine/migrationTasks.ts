import {
  ensureBugReviewSubtask,
  ensureQaRecheckSubtask,
} from "./bugs";
import { normalizeConsequenceTaskTitle } from "./consequences";
import { inferBlastRadius } from "./taskFactory";
import type {
  RtBlastRadius,
  RtGameState,
  RtOutsourcingWork,
  RtTask,
  RtTaskResolution,
} from "./types";

export function normalizeTaskForCurrentSchema(
  state: RtGameState,
  task: RtTask,
): boolean {
  let changed = false;
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
  return changed;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}
