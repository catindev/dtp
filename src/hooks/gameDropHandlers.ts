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
import { playSoundEffect } from "../audio/audioManager";
import {
  characterDropRejectReason,
  outsourceStatusText,
  type ActiveDrag,
} from "./dragAndDropHelpers";

export interface GameDropContext {
  activeDragRef: { current: ActiveDrag };
  game: RtGameState;
  interactionBlocked: boolean;
  locale: Locale;
  sessionId: string;
  mutate: (updater: (draft: RtGameState) => void) => void;
  clearSelection: () => void;
  flashTask: (taskId: string) => void;
  shakeTask: (taskId: string) => void;
  shakeColumn: (column: RtColumn) => void;
}

export function dropTaskOnColumnIntent(
  context: GameDropContext,
  taskId: string,
  column: RtColumn,
  rejectTargetTaskId?: string,
  targetIndex?: number,
): boolean {
  if (context.interactionBlocked) {
    playSoundEffect("error");
    context.activeDragRef.current = null;
    return false;
  }
  return moveDroppedTask(context, taskId, column, rejectTargetTaskId, targetIndex);
}

export function dropOutsourceOnTaskIntent(context: GameDropContext, taskId: string): void {
  if (context.interactionBlocked) {
    playSoundEffect("error");
    context.activeDragRef.current = null;
    return;
  }
  const task = context.game.tasks[taskId];
  if (!task) {
    playSoundEffect("error");
    context.activeDragRef.current = null;
    return;
  }
  dropOutsourceOnTask(context, task);
}

export function dropCharacterOnTaskIntent(
  context: GameDropContext,
  characterId: string,
  taskId: string,
): void {
  if (context.interactionBlocked) {
    playSoundEffect("error");
    context.activeDragRef.current = null;
    return;
  }
  const task = context.game.tasks[taskId];
  if (!task) {
    playSoundEffect("error");
    context.activeDragRef.current = null;
    return;
  }
  dropCharacterOnTask(context, characterId, task);
}

function dropOutsourceOnTask(context: GameDropContext, task: RtTask): void {
  const outsourceStatus = getOutsourceTaskWorkStatus(context.game, task.id);
  const canOutsource = outsourceStatus.allowed;
  if (canOutsource) {
    context.mutate((draft) => {
      outsourceTaskWork(draft, task.id);
    });
    context.clearSelection();
  } else {
    context.shakeTask(task.id);
    playSoundEffect("error");
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
  if (canOutsource) {
    playSoundEffect("drop");
    context.flashTask(task.id);
  }
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
      assignCharacterToTask(draft, characterId, task.id);
    });
    context.clearSelection();
  } else {
    context.shakeTask(task.id);
    playSoundEffect("error");
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
  if (canAssign) {
    playSoundEffect("drop");
    context.flashTask(task.id);
  }
  context.activeDragRef.current = null;
}

function moveDroppedTask(
  context: GameDropContext,
  taskId: string,
  column: RtColumn,
  rejectTargetTaskId?: string,
  targetIndex?: number,
): boolean {
  const fromColumn = context.game.tasks[taskId]?.column;
  const task = context.game.tasks[taskId];
  const moveCheck = canMoveRealtimeTask(context.game, taskId, column);

  if (!moveCheck.allowed) {
    if (rejectTargetTaskId) {
      context.shakeTask(rejectTargetTaskId);
    } else {
      context.shakeColumn(column);
    }
    playSoundEffect("error");
    logAction(context.sessionId, "task_drop_rejected", {
      taskId,
      fromColumn,
      toColumn: column,
      reason: moveCheck.reason,
      gameTime: formatGameTime(context.game),
    });
    context.activeDragRef.current = null;
    return false;
  }

  context.mutate((draft) => {
    moveRealtimeTask(draft, taskId, column, targetIndex);
  });
  context.clearSelection();
  logAction(context.sessionId, "task_dropped_on_column", {
    taskId,
    fromColumn,
    toColumn: column,
    targetIndex,
    ...(task && column === "done"
      ? { releaseReadiness: releaseReadiness(task) }
      : {}),
    gameTime: formatGameTime(context.game),
  });
  playSoundEffect("drop");
  context.flashTask(taskId);
  context.activeDragRef.current = null;
  return true;
}
