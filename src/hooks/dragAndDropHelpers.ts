import {
  isWorkColumn,
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
export type { ActiveDrag } from "../dnd/types";

export function dragBlockedByPause(
  game: RtGameState,
  isGameScreen: boolean,
  morningReportActive: boolean,
): boolean {
  return game.paused && isGameScreen && game.status === "running" && !morningReportActive;
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
