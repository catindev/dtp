import { removeTaskFromBoard } from "./board";
import type {
  RtGameState,
  RtResources,
  RtTask,
  RtTaskResolution,
} from "./types";

export function missedTaskIsMinor(task: RtTask): boolean {
  if (task.rootCauseTaskId) return false;
  if (task.kind === "integration" || task.kind === "incident" || task.kind === "compliance") {
    return false;
  }
  if (task.kind === "performance" && task.pressure >= 3) return false;
  if (task.blastRadius === "high") return false;
  if (task.pressure >= 4 || task.value >= 34) return false;
  return task.kind === "bug" || task.kind === "techDebt" || task.pressure <= 2;
}

export function missedMinorResourceDelta(task: RtTask): Partial<RtResources> {
  if (task.kind === "techDebt" || task.kind === "bug" || task.kind === "performance") {
    return { debt: 1 };
  }
  return { trust: -1 };
}

export function terminalResourceDelta(task: RtTask): Partial<RtResources> {
  const blast = task.blastRadius === "high" ? 2 : task.blastRadius === "medium" ? 1 : 0;
  return {
    trust: -(3 + blast),
    clients: task.kind === "incident" || task.blastRadius === "high" ? -2 : -1,
    debt: 3 + blast,
  };
}

export function blockedTailResourceDelta(task: RtTask): Partial<RtResources> {
  return {
    trust: task.blastRadius === "high" ? -3 : -2,
    debt: task.kind === "techDebt" ? 3 : 2,
  };
}

export function markTaskResolved(
  state: RtGameState,
  task: RtTask,
  resolution: RtTaskResolution,
): void {
  const characterId = task.assignedCharacterId;
  if (characterId && state.characters[characterId]) {
    state.characters[characterId].assignedTaskId = null;
  }
  task.assignedCharacterId = null;
  task.outsourcing = null;
  task.currentSubtaskId = null;
  task.stageProgress = 0;
  task.stageComplete = false;
  task.resolved = true;
  task.resolution = resolution;
  task.resolutionDay = state.day;
  task.lastNote = `Missed work resolved as ${resolution.replace("_", " ")}.`;
  removeTaskFromBoard(state, task.id);
}
