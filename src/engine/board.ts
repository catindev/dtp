import { DONE_REWORK_TRUST_COST } from "./balance";
import { commitBacklogOpportunity } from "./backlogOpportunity";
import { clamp } from "./math";
import {
  formatRiskReason,
  lateReleaseReport,
  releaseReadiness,
} from "./readiness";
import {
  RT_COLUMNS,
  type RtColumn,
  type RtEvent,
  type RtGameState,
  type RtMoveCheck,
  type RtSubtask,
  type RtTask,
} from "./types";

type BoardEventSink = (event: Omit<RtEvent, "at">) => void;

export function createBoard(): Record<RtColumn, string[]> {
  return {
    backlog: [],
    inProgress: [],
    done: [],
    released: [],
  };
}

export function moveTaskOnBoard(
  state: RtGameState,
  taskId: string,
  targetColumn: RtColumn,
  emit: BoardEventSink,
  targetIndex?: number,
): boolean {
  const moveCheck = canMoveTaskOnBoard(state, taskId, targetColumn);
  if (!moveCheck.allowed && moveCheck.reason !== "same_column") return false;
  const task = state.tasks[taskId];
  if (task.column === targetColumn) {
    reorderTaskInColumn(state, taskId, targetColumn, targetIndex);
    return true;
  }

  if (task.column === "done") {
    state.resources.trust = clamp(state.resources.trust - DONE_REWORK_TRUST_COST, 0, 100);
    removeTaskFromBoard(state, taskId);
    task.column = "inProgress";
    task.stageProgress = 0;
    task.currentSubtaskId = null;
    task.stageComplete = taskReadyForDone(task);
    task.queuedDeadlineMs = null;
    task.lastNote = "Pulled back from Done for rework.";
    insertTaskId(state.board.inProgress, taskId, targetIndex);
    emit({
      type: "done_reopened",
      title: `${task.id} reopened`,
      body: `${task.title} was pulled back from the release queue.`,
      effects: [`trust -${DONE_REWORK_TRUST_COST}`, "deadline resumes"],
    });
    return true;
  }

  if (targetColumn === "done") {
    const readiness = releaseReadiness(task);
    const late = lateReleaseReport(task);
    removeTaskFromBoard(state, taskId);
    task.column = "done";
    task.stageProgress = 0;
    task.currentSubtaskId = null;
    task.stageComplete = true;
    task.queuedDeadlineMs = Math.max(0, task.deadlineMs);
    task.lastNote =
      late.valuePenaltyPercent > 0
        ? `Queued late for release. Value reduced by ${late.valuePenaltyPercent}%.`
        : "Queued for the daily release train.";
    insertTaskId(state.board.done, taskId, targetIndex ?? 0);
    emit({
      type: "queued_for_release",
      title: `${task.id} queued`,
      body: `${task.title} will ship with the daily release train.`,
      effects: [
        `${readiness.readiness} release`,
        ...(late.valuePenaltyPercent > 0 ? [`late value -${late.valuePenaltyPercent}%`] : []),
        ...readiness.reasons.slice(0, 4).map(formatRiskReason),
        "deadline locked",
        "business effects pending",
      ],
    });
    return true;
  }

  const committedFromBacklog = task.column === "backlog" && targetColumn === "inProgress";
  if (committedFromBacklog) {
    commitBacklogOpportunity(task, emit);
  }

  removeTaskFromBoard(state, taskId);
  task.column = targetColumn;
  task.stageProgress = 0;
  task.currentSubtaskId = null;
  task.stageComplete = false;
  task.queuedDeadlineMs = null;
  task.lastNote = committedFromBacklog ? task.lastNote : stageNote(targetColumn);
  insertTaskId(state.board[targetColumn], taskId, targetIndex);
  return true;
}

export function canMoveTaskOnBoard(
  state: RtGameState,
  taskId: string,
  targetColumn: RtColumn,
): RtMoveCheck {
  const task = state.tasks[taskId];
  if (!task) return { allowed: false, reason: "task_missing" };
  if (task.released) return { allowed: false, reason: "task_released" };
  if (taskBusy(task)) return { allowed: false, reason: "task_busy" };
  if (task.column === targetColumn) return { allowed: true, reason: "same_column" };
  if (targetColumn === "released") return { allowed: false, reason: "released_locked" };
  if (task.column === "done" && targetColumn !== "inProgress") {
    return { allowed: false, reason: "done_reopen_only_to_work" };
  }
  if (task.column === "backlog" && targetColumn === "done") {
    return { allowed: false, reason: "backlog_to_done_forbidden" };
  }
  if (targetColumn === "backlog" && task.engagedOnce) {
    return { allowed: false, reason: "engaged_backlog_forbidden" };
  }
  return { allowed: true };
}

export function removeTaskFromBoard(state: RtGameState, taskId: string): void {
  for (const column of RT_COLUMNS) {
    const index = state.board[column].indexOf(taskId);
    if (index >= 0) {
      state.board[column].splice(index, 1);
      return;
    }
  }
}

function reorderTaskInColumn(
  state: RtGameState,
  taskId: string,
  column: RtColumn,
  targetIndex?: number,
): void {
  if (targetIndex === undefined) return;

  const taskIds = state.board[column];
  const fromIndex = taskIds.indexOf(taskId);
  if (fromIndex < 0) return;

  taskIds.splice(fromIndex, 1);
  const adjustedIndex = fromIndex < targetIndex ? targetIndex - 1 : targetIndex;
  insertTaskId(taskIds, taskId, adjustedIndex);
}

function insertTaskId(taskIds: string[], taskId: string, targetIndex?: number): void {
  taskIds.splice(clampInsertIndex(taskIds, targetIndex), 0, taskId);
}

function clampInsertIndex(taskIds: string[], targetIndex?: number): number {
  if (targetIndex === undefined || !Number.isFinite(targetIndex)) return taskIds.length;
  return Math.max(0, Math.min(Math.trunc(targetIndex), taskIds.length));
}

export function taskReadyForDone(task: RtTask): boolean {
  return task.workDone && getOpenTodoSubtasks(task).length === 0 && task.bugs === 0;
}

export function taskBusy(task: RtTask): boolean {
  return Boolean(task.assignedCharacterId || task.outsourcing);
}

export function getOpenTodoSubtasks(task: RtTask): RtSubtask[] {
  return task.subtasks.filter((subtask) => subtask.revealed && !subtask.done);
}

function stageNote(column: RtColumn): string {
  if (column === "inProgress") return "Ready for analysis, implementation, or QA.";
  if (column === "backlog") return "Waiting in backlog.";
  if (column === "done") return "Queued for the daily release train.";
  return "Released to business.";
}
