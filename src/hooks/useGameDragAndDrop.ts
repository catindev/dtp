import { useRef, type DragEvent } from "react";
import {
  assignCharacterToTask,
  canAssignCharacterToTask,
  canMoveRealtimeTask,
  formatGameTime,
  getOutsourceTaskWorkStatus,
  moveRealtimeTask,
  outsourceTaskWork,
  releaseReadiness,
  type RtCharacter,
  type RtColumn,
  type RtGameState,
  type RtTask,
} from "../realtime/simulation";
import { type Locale } from "../i18n";
import { logAction } from "../frontendLogging";
import {
  acceptsDtpDrop,
  characterDropRejectReason,
  dragBlockedByPause,
  outsourceStatusText,
  readCharacterDragId,
  readOutsourceDrag,
  readTaskDragId,
  type ActiveDrag,
  writeCharacterDragData,
  writeOutsourceDragData,
  writeTaskDragData,
} from "./dragAndDropHelpers";

interface UseGameDragAndDropArgs {
  game: RtGameState;
  interactionBlocked: boolean;
  isGameScreen: boolean;
  locale: Locale;
  morningReportActive: boolean;
  sessionId: string;
  mutate: (updater: (draft: RtGameState) => void) => void;
  setSelectedTaskId: (taskId: string) => void;
  flashTask: (taskId: string) => void;
  shakeTask: (taskId: string) => void;
  shakeColumn: (column: RtColumn) => void;
  shakePauseButton: () => void;
}

export function useGameDragAndDrop({
  game,
  interactionBlocked,
  isGameScreen,
  locale,
  morningReportActive,
  sessionId,
  mutate,
  setSelectedTaskId,
  flashTask,
  shakeTask,
  shakeColumn,
  shakePauseButton,
}: UseGameDragAndDropArgs) {
  const activeDragRef = useRef<ActiveDrag>(null);

  function beginTaskDrag(event: DragEvent<HTMLElement>, task: RtTask) {
    if (dragBlockedByPause(game, isGameScreen, morningReportActive)) {
      event.preventDefault();
      shakePauseButton();
      return;
    }
    if (interactionBlocked || task.assignedCharacterId || task.released) {
      event.preventDefault();
      return;
    }
    activeDragRef.current = { type: "task", taskId: task.id };
    writeTaskDragData(event, task.id);
    logAction(sessionId, "task_drag_started", {
      taskId: task.id,
      fromColumn: task.column,
      gameTime: formatGameTime(game),
    });
  }

  function beginCharacterDrag(event: DragEvent<HTMLElement>, character: RtCharacter) {
    if (dragBlockedByPause(game, isGameScreen, morningReportActive)) {
      event.preventDefault();
      shakePauseButton();
      return;
    }
    if (interactionBlocked || character.assignedTaskId || character.exhaustedToday) {
      event.preventDefault();
      return;
    }
    activeDragRef.current = { type: "character", characterId: character.id };
    writeCharacterDragData(event, character, locale);
    logAction(sessionId, "character_drag_started", {
      characterId: character.id,
      characterName: character.name,
      role: character.role,
      gameTime: formatGameTime(game),
    });
  }

  function beginOutsourceDrag(event: DragEvent<HTMLElement>) {
    if (dragBlockedByPause(game, isGameScreen, morningReportActive)) {
      event.preventDefault();
      shakePauseButton();
      return;
    }
    if (interactionBlocked || game.resources.budget <= 0) {
      event.preventDefault();
      return;
    }
    activeDragRef.current = { type: "outsourcing" };
    writeOutsourceDragData(event);
    logAction(sessionId, "outsourcing_drag_started", {
      budget: game.resources.budget,
      gameTime: formatGameTime(game),
    });
  }

  function allowDrop(event: DragEvent<HTMLElement>) {
    if (interactionBlocked) return;
    if (acceptsDtpDrop(event, activeDragRef.current)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    }
  }

  function dropOnColumn(event: DragEvent<HTMLElement>, column: RtColumn) {
    event.preventDefault();
    event.stopPropagation();
    if (interactionBlocked) return;
    const activeDrag = activeDragRef.current;
    if (column === "released") {
      shakeColumn(column);
      activeDragRef.current = null;
      return;
    }
    const taskId = readTaskDragId(event, activeDrag);
    if (!taskId) {
      if (activeDrag) shakeColumn(column);
      activeDragRef.current = null;
      return;
    }
    moveDroppedTask(taskId, column);
  }

  function dropOnTask(event: DragEvent<HTMLElement>, task: RtTask) {
    event.preventDefault();
    event.stopPropagation();
    if (interactionBlocked) return;
    const activeDrag = activeDragRef.current;
    const draggedTaskId = readTaskDragId(event, activeDrag);
    if (draggedTaskId) {
      moveDroppedTask(draggedTaskId, task.column, task.id);
      return;
    }

    const outsourcePayload = readOutsourceDrag(event, activeDrag);
    if (outsourcePayload) {
      const outsourceStatus = getOutsourceTaskWorkStatus(game, task.id);
      const canOutsource = outsourceStatus.allowed;
      if (canOutsource) {
        mutate((draft) => {
          if (outsourceTaskWork(draft, task.id)) {
            setSelectedTaskId(task.id);
          }
        });
      } else {
        shakeTask(task.id);
      }
      logAction(
        sessionId,
        canOutsource ? "outsourcing_dropped_on_task" : "outsourcing_drop_rejected",
        {
          taskId: task.id,
          taskTitle: task.title,
          column: task.column,
          budget: game.resources.budget,
          reason: outsourceStatusText(outsourceStatus, locale),
          blocker: outsourceStatus.reason,
          neededBudget: outsourceStatus.neededBudget,
          subtaskRole: outsourceStatus.subtask?.role,
          subtaskImportance: outsourceStatus.subtask?.importance,
          gameTime: formatGameTime(game),
        },
      );
      if (canOutsource) flashTask(task.id);
      activeDragRef.current = null;
      return;
    }

    const characterId = readCharacterDragId(event, activeDrag);
    if (!characterId) return;
    const character = game.characters[characterId];
    const canAssign = canAssignCharacterToTask(game, characterId, task.id);

    if (canAssign) {
      mutate((draft) => {
        if (assignCharacterToTask(draft, characterId, task.id)) {
          setSelectedTaskId(task.id);
        }
      });
    } else {
      shakeTask(task.id);
    }
    logAction(
      sessionId,
      canAssign ? "character_dropped_on_task" : "character_drop_rejected",
      {
        characterId,
        characterName: character?.name,
        role: character?.role,
        taskId: task.id,
        taskTitle: task.title,
        column: task.column,
        reason: canAssign ? "assigned" : characterDropRejectReason(game, characterId, task),
        gameTime: formatGameTime(game),
      },
    );
    if (canAssign) flashTask(task.id);
    activeDragRef.current = null;
  }

  function moveDroppedTask(taskId: string, column: RtColumn, rejectTargetTaskId?: string) {
    const fromColumn = game.tasks[taskId]?.column;
    const task = game.tasks[taskId];
    const moveCheck = canMoveRealtimeTask(game, taskId, column);

    if (!moveCheck.allowed) {
      if (rejectTargetTaskId) {
        shakeTask(rejectTargetTaskId);
      } else {
        shakeColumn(column);
      }
      logAction(sessionId, "task_drop_rejected", {
        taskId,
        fromColumn,
        toColumn: column,
        reason: moveCheck.reason,
        gameTime: formatGameTime(game),
      });
      activeDragRef.current = null;
      return;
    }

    mutate((draft) => {
      const moved = moveRealtimeTask(draft, taskId, column);
      if (moved) setSelectedTaskId(taskId);
    });
    logAction(sessionId, "task_dropped_on_column", {
      taskId,
      fromColumn,
      toColumn: column,
      ...(task && column === "done"
        ? { releaseReadiness: releaseReadiness(task) }
        : {}),
      gameTime: formatGameTime(game),
    });
    flashTask(taskId);
    activeDragRef.current = null;
  }

  function finishDrag() {
    activeDragRef.current = null;
  }

  function resetDrag() {
    activeDragRef.current = null;
  }

  return {
    beginTaskDrag,
    beginCharacterDrag,
    beginOutsourceDrag,
    allowDrop,
    dropOnColumn,
    dropOnTask,
    finishDrag,
    resetDrag,
  };
}
