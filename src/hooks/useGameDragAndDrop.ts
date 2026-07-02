import { useRef, type DragEvent } from "react";
import {
  formatGameTime,
  type RtCharacter,
  type RtColumn,
  type RtGameState,
  type RtTask,
} from "../realtime/simulation";
import { type Locale } from "../i18n";
import { logAction } from "../frontendLogging";
import { playSoundEffect } from "../audio/audioManager";
import {
  acceptsDtpDrop,
  dragBlockedByPause,
  type ActiveDrag,
  writeCharacterDragData,
  writeOutsourceDragData,
  writeTaskDragData,
} from "./dragAndDropHelpers";
import {
  dropOnColumnWithContext,
  dropOnTaskWithContext,
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
  const dropContext: GameDropContext = {
    activeDragRef,
    game,
    interactionBlocked,
    locale,
    sessionId,
    mutate,
    setSelectedTaskId,
    flashTask,
    shakeTask,
    shakeColumn,
  };

  function beginTaskDrag(event: DragEvent<HTMLElement>, task: RtTask) {
    if (dragBlockedByPause(game, isGameScreen, morningReportActive)) {
      event.preventDefault();
      playSoundEffect("error");
      shakePauseButton();
      return;
    }
    if (interactionBlocked || task.assignedCharacterId || task.released) {
      event.preventDefault();
      playSoundEffect("error");
      return;
    }
    activeDragRef.current = { type: "task", taskId: task.id };
    writeTaskDragData(event, task.id);
    playSoundEffect("drag");
    logAction(sessionId, "task_drag_started", {
      taskId: task.id,
      fromColumn: task.column,
      gameTime: formatGameTime(game),
    });
  }

  function beginCharacterDrag(event: DragEvent<HTMLElement>, character: RtCharacter) {
    if (dragBlockedByPause(game, isGameScreen, morningReportActive)) {
      event.preventDefault();
      playSoundEffect("error");
      shakePauseButton();
      return;
    }
    if (interactionBlocked || character.assignedTaskId || character.exhaustedToday) {
      event.preventDefault();
      playSoundEffect("error");
      return;
    }
    activeDragRef.current = { type: "character", characterId: character.id };
    writeCharacterDragData(event, character, locale);
    playSoundEffect("drag");
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
      playSoundEffect("error");
      shakePauseButton();
      return;
    }
    if (interactionBlocked || game.resources.budget <= 0) {
      event.preventDefault();
      playSoundEffect("error");
      return;
    }
    activeDragRef.current = { type: "outsourcing" };
    writeOutsourceDragData(event);
    playSoundEffect("drag");
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
    dropOnColumnWithContext(dropContext, event, column);
  }

  function dropOnTask(event: DragEvent<HTMLElement>, task: RtTask) {
    dropOnTaskWithContext(dropContext, event, task);
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
