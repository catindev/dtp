import { useRef, type DragEvent } from "react";
import {
  assignCharacterToTask,
  canAssignCharacterToTask,
  canMoveRealtimeTask,
  formatGameTime,
  getOutsourceTaskWorkStatus,
  isWorkColumn,
  moveRealtimeTask,
  outsourceTaskWork,
  releaseReadiness,
  type RtCharacter,
  type RtColumn,
  type RtGameState,
  type RtOutsourceStatus,
  type RtTask,
} from "../realtime/simulation";
import {
  labelImportance,
  labelRole,
  localizeText,
  type Locale,
} from "../i18n";
import { logAction } from "../frontendLogging";

type ActiveDrag =
  | { type: "task"; taskId: string }
  | { type: "character"; characterId: string }
  | { type: "outsourcing" }
  | null;

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
    if (game.paused && isGameScreen && game.status === "running" && !morningReportActive) {
      event.preventDefault();
      shakePauseButton();
      return;
    }
    if (interactionBlocked || task.assignedCharacterId || task.released) {
      event.preventDefault();
      return;
    }
    activeDragRef.current = { type: "task", taskId: task.id };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/dtp-task", task.id);
    event.dataTransfer.setData("text/plain", task.id);
    logAction(sessionId, "task_drag_started", {
      taskId: task.id,
      fromColumn: task.column,
      gameTime: formatGameTime(game),
    });
  }

  function beginCharacterDrag(event: DragEvent<HTMLElement>, character: RtCharacter) {
    if (game.paused && isGameScreen && game.status === "running" && !morningReportActive) {
      event.preventDefault();
      shakePauseButton();
      return;
    }
    if (interactionBlocked || character.assignedTaskId || character.exhaustedToday) {
      event.preventDefault();
      return;
    }
    activeDragRef.current = { type: "character", characterId: character.id };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/dtp-character", character.id);
    setDragGhost(event, character, locale);
    logAction(sessionId, "character_drag_started", {
      characterId: character.id,
      characterName: character.name,
      role: character.role,
      gameTime: formatGameTime(game),
    });
  }

  function beginOutsourceDrag(event: DragEvent<HTMLElement>) {
    if (game.paused && isGameScreen && game.status === "running" && !morningReportActive) {
      event.preventDefault();
      shakePauseButton();
      return;
    }
    if (interactionBlocked || game.resources.budget <= 0) {
      event.preventDefault();
      return;
    }
    activeDragRef.current = { type: "outsourcing" };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/dtp-outsourcing", "outsourcing");
    event.dataTransfer.setData("text/plain", "outsourcing");
    logAction(sessionId, "outsourcing_drag_started", {
      budget: game.resources.budget,
      gameTime: formatGameTime(game),
    });
  }

  function allowDrop(event: DragEvent<HTMLElement>) {
    if (interactionBlocked) return;
    if (
      activeDragRef.current ||
      event.dataTransfer.types.includes("application/dtp-task") ||
      event.dataTransfer.types.includes("application/dtp-character") ||
      event.dataTransfer.types.includes("application/dtp-outsourcing")
    ) {
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
    const taskId =
      event.dataTransfer.getData("application/dtp-task") ||
      (activeDrag?.type === "task" ? activeDrag.taskId : "");
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
    const draggedTaskId =
      event.dataTransfer.getData("application/dtp-task") ||
      (activeDrag?.type === "task" ? activeDrag.taskId : "");
    if (draggedTaskId) {
      moveDroppedTask(draggedTaskId, task.column, task.id);
      return;
    }

    const outsourcePayload =
      event.dataTransfer.getData("application/dtp-outsourcing") ||
      (activeDrag?.type === "outsourcing" ? "outsourcing" : "");
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

    const characterId =
      event.dataTransfer.getData("application/dtp-character") ||
      (activeDrag?.type === "character" ? activeDrag.characterId : "");
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

function characterDropRejectReason(
  game: RtGameState,
  characterId: string,
  task: RtTask,
): string {
  const character = game.characters[characterId];
  if (!character) return "character missing";
  if (character.assignedTaskId) return "character already busy";
  if (character.exhaustedToday) return "character exhausted";
  if (!isWorkColumn(task.column)) return "wrong column";
  if (task.assignedCharacterId || task.outsourcing) return "task already in work";
  return "no matching visible work";
}

function outsourceStatusText(status: RtOutsourceStatus, locale: Locale): string {
  const subtask = status.subtask;
  const work = subtask
    ? `${labelRole(locale, subtask.role)} ${labelImportance(locale, subtask.importance)}`
    : localizeText("known work", locale);
  switch (status.reason) {
    case "ready":
      return locale === "ru"
        ? `Можно взять ${work} за Budget ${status.cost}.`
        : `Can take ${work} for Budget ${status.cost}.`;
    case "insufficient_budget":
      return locale === "ru"
        ? `Нужно Budget ${status.neededBudget} для ${work}; сейчас ${status.currentBudget}.`
        : `Need Budget ${status.neededBudget} for ${work}; current ${status.currentBudget}.`;
    case "needs_analysis":
      return localizeText("Needs analysis first: no visible open work.", locale);
    case "no_open_work":
      return localizeText("No visible open work for outsourcing.", locale);
    case "task_busy":
      return localizeText("Task is already in work.", locale);
    case "task_released":
      return localizeText("Task is already released.", locale);
    case "wrong_column":
      return localizeText("Move task to In Progress first.", locale);
    case "task_missing":
      return localizeText("Task is no longer on the board.", locale);
  }
}

function setDragGhost(event: DragEvent<HTMLElement>, character: RtCharacter, locale: Locale) {
  const ghost = document.createElement("div");
  ghost.className = "drag-ghost";
  ghost.textContent = locale === "ru" ? `${character.name} -> задача` : `${character.name} -> task`;
  document.body.appendChild(ghost);
  event.dataTransfer.setDragImage(ghost, 24, 18);
  window.setTimeout(() => document.body.removeChild(ghost), 0);
}
