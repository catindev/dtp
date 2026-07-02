import type { DragEvent } from "react";
import {
  assignCharacterToTask,
  canAssignCharacterToTask,
  canMoveRealtimeTask,
  formatGameTime,
  getOutsourceTaskWorkStatus,
  moveRealtimeTask,
  outsourceTaskWork,
  releaseReadiness,
  type RtColumn,
  type RtGameState,
  type RtTask,
} from "../realtime/simulation";
import type { Locale } from "../i18n";
import { logAction } from "../frontendLogging";
import {
  characterDropRejectReason,
  outsourceStatusText,
  readCharacterDragId,
  readOutsourceDrag,
  readTaskDragId,
  type ActiveDrag,
} from "./dragAndDropHelpers";

export interface GameDropContext {
  activeDragRef: { current: ActiveDrag };
  game: RtGameState;
  interactionBlocked: boolean;
  locale: Locale;
  sessionId: string;
  mutate: (updater: (draft: RtGameState) => void) => void;
  setSelectedTaskId: (taskId: string) => void;
  flashTask: (taskId: string) => void;
  shakeTask: (taskId: string) => void;
  shakeColumn: (column: RtColumn) => void;
}

export function dropOnColumnWithContext(
  context: GameDropContext,
  event: DragEvent<HTMLElement>,
  column: RtColumn,
): void {
  event.preventDefault();
  event.stopPropagation();
  if (context.interactionBlocked) return;
  const activeDrag = context.activeDragRef.current;
  if (column === "released") {
    context.shakeColumn(column);
    context.activeDragRef.current = null;
    return;
  }
  const taskId = readTaskDragId(event, activeDrag);
  if (!taskId) {
    if (activeDrag) context.shakeColumn(column);
    context.activeDragRef.current = null;
    return;
  }
  moveDroppedTask(context, taskId, column);
}

export function dropOnTaskWithContext(
  context: GameDropContext,
  event: DragEvent<HTMLElement>,
  task: RtTask,
): void {
  event.preventDefault();
  event.stopPropagation();
  if (context.interactionBlocked) return;
  const activeDrag = context.activeDragRef.current;
  const draggedTaskId = readTaskDragId(event, activeDrag);
  if (draggedTaskId) {
    moveDroppedTask(context, draggedTaskId, task.column, task.id);
    return;
  }

  const outsourcePayload = readOutsourceDrag(event, activeDrag);
  if (outsourcePayload) {
    dropOutsourceOnTask(context, task);
    return;
  }

  const characterId = readCharacterDragId(event, activeDrag);
  if (!characterId) return;
  dropCharacterOnTask(context, characterId, task);
}

function dropOutsourceOnTask(context: GameDropContext, task: RtTask): void {
  const outsourceStatus = getOutsourceTaskWorkStatus(context.game, task.id);
  const canOutsource = outsourceStatus.allowed;
  if (canOutsource) {
    context.mutate((draft) => {
      if (outsourceTaskWork(draft, task.id)) {
        context.setSelectedTaskId(task.id);
      }
    });
  } else {
    context.shakeTask(task.id);
  }
  logAction(
    context.sessionId,
    canOutsource ? "outsourcing_dropped_on_task" : "outsourcing_drop_rejected",
    {
      taskId: task.id,
      taskTitle: task.title,
      column: task.column,
      budget: context.game.resources.budget,
      reason: outsourceStatusText(outsourceStatus, context.locale),
      blocker: outsourceStatus.reason,
      neededBudget: outsourceStatus.neededBudget,
      subtaskRole: outsourceStatus.subtask?.role,
      subtaskImportance: outsourceStatus.subtask?.importance,
      gameTime: formatGameTime(context.game),
    },
  );
  if (canOutsource) context.flashTask(task.id);
  context.activeDragRef.current = null;
}

function dropCharacterOnTask(
  context: GameDropContext,
  characterId: string,
  task: RtTask,
): void {
  const character = context.game.characters[characterId];
  const canAssign = canAssignCharacterToTask(context.game, characterId, task.id);

  if (canAssign) {
    context.mutate((draft) => {
      if (assignCharacterToTask(draft, characterId, task.id)) {
        context.setSelectedTaskId(task.id);
      }
    });
  } else {
    context.shakeTask(task.id);
  }
  logAction(
    context.sessionId,
    canAssign ? "character_dropped_on_task" : "character_drop_rejected",
    {
      characterId,
      characterName: character?.name,
      role: character?.role,
      taskId: task.id,
      taskTitle: task.title,
      column: task.column,
      reason: canAssign ? "assigned" : characterDropRejectReason(context.game, characterId, task),
      gameTime: formatGameTime(context.game),
    },
  );
  if (canAssign) context.flashTask(task.id);
  context.activeDragRef.current = null;
}

function moveDroppedTask(
  context: GameDropContext,
  taskId: string,
  column: RtColumn,
  rejectTargetTaskId?: string,
): void {
  const fromColumn = context.game.tasks[taskId]?.column;
  const task = context.game.tasks[taskId];
  const moveCheck = canMoveRealtimeTask(context.game, taskId, column);

  if (!moveCheck.allowed) {
    if (rejectTargetTaskId) {
      context.shakeTask(rejectTargetTaskId);
    } else {
      context.shakeColumn(column);
    }
    logAction(context.sessionId, "task_drop_rejected", {
      taskId,
      fromColumn,
      toColumn: column,
      reason: moveCheck.reason,
      gameTime: formatGameTime(context.game),
    });
    context.activeDragRef.current = null;
    return;
  }

  context.mutate((draft) => {
    const moved = moveRealtimeTask(draft, taskId, column);
    if (moved) context.setSelectedTaskId(taskId);
  });
  logAction(context.sessionId, "task_dropped_on_column", {
    taskId,
    fromColumn,
    toColumn: column,
    ...(task && column === "done"
      ? { releaseReadiness: releaseReadiness(task) }
      : {}),
    gameTime: formatGameTime(context.game),
  });
  context.flashTask(taskId);
  context.activeDragRef.current = null;
}
