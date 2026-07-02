import type { DragEvent } from "react";
import {
  isWorkColumn,
  type RtCharacter,
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

const TASK_DRAG_TYPE = "application/dtp-task";
const CHARACTER_DRAG_TYPE = "application/dtp-character";
const OUTSOURCING_DRAG_TYPE = "application/dtp-outsourcing";
const OUTSOURCING_DRAG_VALUE = "outsourcing";

export type ActiveDrag =
  | { type: "task"; taskId: string }
  | { type: "character"; characterId: string }
  | { type: "outsourcing" }
  | null;

export function dragBlockedByPause(
  game: RtGameState,
  isGameScreen: boolean,
  morningReportActive: boolean,
): boolean {
  return game.paused && isGameScreen && game.status === "running" && !morningReportActive;
}

export function writeTaskDragData(event: DragEvent<HTMLElement>, taskId: string): void {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(TASK_DRAG_TYPE, taskId);
  event.dataTransfer.setData("text/plain", taskId);
}

export function writeCharacterDragData(
  event: DragEvent<HTMLElement>,
  character: RtCharacter,
  locale: Locale,
): void {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(CHARACTER_DRAG_TYPE, character.id);
  setDragGhost(event, character, locale);
}

export function writeOutsourceDragData(event: DragEvent<HTMLElement>): void {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(OUTSOURCING_DRAG_TYPE, OUTSOURCING_DRAG_VALUE);
  event.dataTransfer.setData("text/plain", OUTSOURCING_DRAG_VALUE);
}

export function acceptsDtpDrop(event: DragEvent<HTMLElement>, activeDrag: ActiveDrag): boolean {
  return (
    Boolean(activeDrag) ||
    event.dataTransfer.types.includes(TASK_DRAG_TYPE) ||
    event.dataTransfer.types.includes(CHARACTER_DRAG_TYPE) ||
    event.dataTransfer.types.includes(OUTSOURCING_DRAG_TYPE)
  );
}

export function readTaskDragId(event: DragEvent<HTMLElement>, activeDrag: ActiveDrag): string {
  return event.dataTransfer.getData(TASK_DRAG_TYPE) || (activeDrag?.type === "task" ? activeDrag.taskId : "");
}

export function readCharacterDragId(event: DragEvent<HTMLElement>, activeDrag: ActiveDrag): string {
  return (
    event.dataTransfer.getData(CHARACTER_DRAG_TYPE) ||
    (activeDrag?.type === "character" ? activeDrag.characterId : "")
  );
}

export function readOutsourceDrag(event: DragEvent<HTMLElement>, activeDrag: ActiveDrag): string {
  return (
    event.dataTransfer.getData(OUTSOURCING_DRAG_TYPE) ||
    (activeDrag?.type === "outsourcing" ? OUTSOURCING_DRAG_VALUE : "")
  );
}

export function characterDropRejectReason(
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

export function outsourceStatusText(status: RtOutsourceStatus, locale: Locale): string {
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

function setDragGhost(event: DragEvent<HTMLElement>, character: RtCharacter, locale: Locale): void {
  const ghost = document.createElement("div");
  ghost.className = "drag-ghost";
  ghost.textContent = locale === "ru" ? `${character.name} -> задача` : `${character.name} -> task`;
  document.body.appendChild(ghost);
  event.dataTransfer.setDragImage(ghost, 24, 18);
  window.setTimeout(() => document.body.removeChild(ghost), 0);
}
