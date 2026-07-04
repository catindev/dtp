import {
  type DragCancelEvent,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useEffect, useRef, useState } from "react";
import {
  canMoveRealtimeTask,
  formatGameTime,
  type RtColumn,
  type RtGameState,
} from "../realtime/simulation";
import { type Locale } from "../i18n";
import { logAction } from "../frontendLogging";
import { playSoundEffect } from "../audio/audioManager";
import { dragBlockedByPause } from "./dragAndDropHelpers";
import type { ActiveDrag } from "../dnd/types";
import { taskDropTargetIndex } from "../dnd/dropIndex";
import {
  readCharacterDndId,
  readColumnDndId,
  readOutsourceDnd,
  readTaskDndId,
  readTaskDropTargetDndId,
} from "../dnd/payload";
import { useDndSensors } from "../dnd/useDndSensors";
import {
  dropCharacterOnTaskIntent,
  dropOutsourceOnTaskIntent,
  dropTaskOnColumnIntent,
  type GameDropContext,
} from "./gameDropHandlers";

interface UseGameDragAndDropArgs {
  game: RtGameState;
  interactionBlocked: boolean;
  isGameScreen: boolean;
  locale: Locale;
  morningReportActive: boolean;
  sessionId: string;
  mutate: (updater: (draft: RtGameState) => void) => void;
  clearSelection: () => void;
  flashTask: (taskId: string) => void;
  shakeTask: (taskId: string) => void;
  shakeColumn: (column: RtColumn) => void;
  shakePauseButton: () => void;
}

export interface CharacterDropAnimation {
  targetRect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  targetTaskId: string;
}

export function useGameDragAndDrop({
  game,
  interactionBlocked,
  isGameScreen,
  locale,
  morningReportActive,
  sessionId,
  mutate,
  clearSelection,
  flashTask,
  shakeTask,
  shakeColumn,
  shakePauseButton,
}: UseGameDragAndDropArgs) {
  const activeDragRef = useRef<ActiveDrag>(null);
  const characterDropAnimationTimerRef = useRef<number | null>(null);
  const [activeDrag, setActiveDragState] = useState<ActiveDrag>(null);
  const [characterDropAnimation, setCharacterDropAnimation] =
    useState<CharacterDropAnimation | null>(null);
  const dndSensors = useDndSensors();
  const dropContext: GameDropContext = {
    activeDragRef,
    game,
    interactionBlocked,
    locale,
    sessionId,
    mutate,
    clearSelection,
    flashTask,
    shakeTask,
    shakeColumn,
  };

  useEffect(() => {
    return () => {
      if (characterDropAnimationTimerRef.current !== null) {
        window.clearTimeout(characterDropAnimationTimerRef.current);
      }
    };
  }, []);

  function beginDndDrag(event: DragStartEvent) {
    clearCharacterDropAnimation();
    resetActiveDrag();
    const data = event.active.data.current;
    const taskId = readTaskDndId(data);
    if (taskId) {
      beginTaskDndDrag(taskId);
      return;
    }

    const characterId = readCharacterDndId(data);
    if (characterId) {
      beginCharacterDndDrag(characterId);
      return;
    }

    if (readOutsourceDnd(data)) {
      beginOutsourceDndDrag();
    }
  }

  function beginTaskDndDrag(taskId: string) {
    if (!taskId) return;
    const task = game.tasks[taskId];
    if (!task) return;

    if (dragBlockedByPause(game, isGameScreen, morningReportActive)) {
      playSoundEffect("error");
      shakePauseButton();
      resetDndDrag();
      return;
    }

    if (interactionBlocked || task.assignedCharacterId || task.outsourcing || task.resolved || task.released) {
      playSoundEffect("error");
      resetDndDrag();
      return;
    }

    setActiveDrag({ type: "task", taskId });
    clearSelection();
    playSoundEffect("drag");
    logAction(sessionId, "task_drag_started", {
      taskId,
      fromColumn: task.column,
      gameTime: formatGameTime(game),
    });
  }

  function beginCharacterDndDrag(characterId: string) {
    const character = game.characters[characterId];
    if (!character) return;

    if (dragBlockedByPause(game, isGameScreen, morningReportActive)) {
      playSoundEffect("error");
      shakePauseButton();
      resetDndDrag();
      return;
    }

    if (interactionBlocked || character.assignedTaskId || character.exhaustedToday) {
      playSoundEffect("error");
      resetDndDrag();
      return;
    }

    setActiveDrag({ type: "character", characterId: character.id });
    clearSelection();
    playSoundEffect("drag");
    logAction(sessionId, "character_drag_started", {
      characterId: character.id,
      characterName: character.name,
      role: character.role,
      gameTime: formatGameTime(game),
    });
  }

  function beginOutsourceDndDrag() {
    if (dragBlockedByPause(game, isGameScreen, morningReportActive)) {
      playSoundEffect("error");
      shakePauseButton();
      resetDndDrag();
      return;
    }

    if (interactionBlocked || game.resources.budget <= 0) {
      playSoundEffect("error");
      resetDndDrag();
      return;
    }

    setActiveDrag({ type: "outsourcing" });
    clearSelection();
    playSoundEffect("drag");
    logAction(sessionId, "outsourcing_drag_started", {
      budget: game.resources.budget,
      gameTime: formatGameTime(game),
    });
  }

  function finishDndDrag(event: DragEndEvent) {
    const active = activeDragRef.current;
    if (!active) {
      resetDndDrag();
      return;
    }

    if (active.type === "task") {
      finishTaskDndDrag(event, active.taskId);
      return;
    }

    const targetTaskId = readTaskDropTargetDndId(event.over?.data.current);
    const column = readColumnDndId(event.over?.data.current);
    if (!targetTaskId) {
      if (column) {
        shakeColumn(column);
      }
      playSoundEffect("error");
      logAction(sessionId, `${active.type}_drop_rejected`, {
        reason: column ? "column_target" : "no_drop_target",
        toColumn: column,
        gameTime: formatGameTime(game),
      });
      resetDndDrag();
      return;
    }

    if (active.type === "character") {
      const assignedTargetRect = getTaskCardRect(targetTaskId);
      const assigned = dropCharacterOnTaskIntent(dropContext, active.characterId, targetTaskId);
      if (assigned && assignedTargetRect) {
        animateCharacterDropIntoTask(targetTaskId, assignedTargetRect);
      }
      resetDndDrag();
      return;
    }

    dropOutsourceOnTaskIntent(dropContext, targetTaskId);
    resetDndDrag();
  }

  function finishTaskDndDrag(event: DragEndEvent, taskId: string) {
    const targetTaskId = readTaskDropTargetDndId(event.over?.data.current);
    const targetTask = targetTaskId ? game.tasks[targetTaskId] : null;
    const column = targetTask?.column ?? readColumnDndId(event.over?.data.current);
    const targetIndex = column
      ? taskDropTargetIndex(event, game, taskId, targetTaskId, column)
      : undefined;
    if (!taskId) {
      resetDndDrag();
      return;
    }

    if (!column) {
      playSoundEffect("error");
      logAction(sessionId, "task_drop_rejected", {
        taskId,
        fromColumn: game.tasks[taskId]?.column,
        reason: "no_drop_target",
        gameTime: formatGameTime(game),
      });
      resetDndDrag();
      return;
    }

    if (column === "released") {
      shakeColumn(column);
      playSoundEffect("error");
      logAction(sessionId, "task_drop_rejected", {
        taskId,
        fromColumn: game.tasks[taskId]?.column,
        toColumn: column,
        reason: "released_column",
        gameTime: formatGameTime(game),
      });
      resetDndDrag();
      return;
    }

    const task = game.tasks[taskId];
    if (task?.column === column && (!targetTaskId || targetTaskId === taskId)) {
      resetDndDrag();
      return;
    }

    const moveCheck = canMoveRealtimeTask(game, taskId, column);
    if (!moveCheck.allowed) {
      dropTaskOnColumnIntent(dropContext, taskId, column, targetTaskId || undefined, targetIndex);
      resetDndDrag();
      return;
    }

    dropTaskOnColumnIntent(dropContext, taskId, column, targetTaskId || undefined, targetIndex);
    resetDndDrag();
  }

  function cancelDndDrag(_event?: DragCancelEvent) {
    resetDndDrag();
  }

  function resetDndDrag() {
    setActiveDrag(null);
  }

  function setActiveDrag(next: ActiveDrag) {
    activeDragRef.current = next;
    setActiveDragState(next);
  }

  function resetActiveDrag() {
    activeDragRef.current = null;
    setActiveDragState(null);
  }

  function resetDrag() {
    resetActiveDrag();
    clearCharacterDropAnimation();
  }

  function animateCharacterDropIntoTask(
    targetTaskId: string,
    targetRect: CharacterDropAnimation["targetRect"],
  ) {
    if (characterDropAnimationTimerRef.current !== null) {
      window.clearTimeout(characterDropAnimationTimerRef.current);
    }
    setCharacterDropAnimation({ targetRect, targetTaskId });
    characterDropAnimationTimerRef.current = window.setTimeout(() => {
      setCharacterDropAnimation(null);
      characterDropAnimationTimerRef.current = null;
    }, 420);
  }

  function clearCharacterDropAnimation() {
    if (characterDropAnimationTimerRef.current !== null) {
      window.clearTimeout(characterDropAnimationTimerRef.current);
      characterDropAnimationTimerRef.current = null;
    }
    setCharacterDropAnimation(null);
  }

  return {
    activeCharacterDragId: activeDrag?.type === "character" ? activeDrag.characterId : null,
    characterDropAnimation,
    activeOutsourceDrag: activeDrag?.type === "outsourcing",
    activeTaskDragId: activeDrag?.type === "task" ? activeDrag.taskId : null,
    dndSensors,
    beginDndDrag,
    finishDndDrag,
    cancelDndDrag,
    resetDrag,
  };
}

function getTaskCardRect(taskId: string): CharacterDropAnimation["targetRect"] | null {
  const element = Array.from(document.querySelectorAll<HTMLElement>("[data-task-card-id]")).find(
    (candidate) => candidate.dataset.taskCardId === taskId,
  );
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}
