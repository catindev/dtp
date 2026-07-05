import type { DragEndEvent } from "@dnd-kit/core";
import type { RtColumn, RtGameState } from "../realtime/simulation";

export function taskDropTargetIndex(
  event: DragEndEvent,
  game: RtGameState,
  draggedTaskId: string,
  targetTaskId: string,
  column: RtColumn,
): number | undefined {
  if (!targetTaskId || targetTaskId === draggedTaskId) return undefined;

  const targetTaskIds = game.board[column];
  const targetIndex = targetTaskIds.indexOf(targetTaskId);
  if (targetIndex < 0) return undefined;

  return targetIndex + (taskDroppedAfterTarget(event) ? 1 : 0);
}

function taskDroppedAfterTarget(event: DragEndEvent): boolean {
  const overRect = event.over?.rect;
  const activeRect = event.active.rect.current.translated ?? event.active.rect.current.initial;
  if (!overRect || !activeRect) return false;

  const activeCenterY = activeRect.top + activeRect.height / 2;
  const overCenterY = overRect.top + overRect.height / 2;
  return activeCenterY > overCenterY;
}
