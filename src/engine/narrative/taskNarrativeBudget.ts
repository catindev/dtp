import { chance } from "../rng";
import type {
  RtGameState,
  RtNarrativeBudgetState,
  RtNarrativeDensity,
  RtTask,
} from "../types";

export const NARRATIVE_FLAVOR_WINDOW_SIZE = 10;
export const NARRATIVE_FLAVOR_TARGET_RATIO = 0.2;

export function createNarrativeBudgetState(): RtNarrativeBudgetState {
  return {
    flavorWindowTaskIds: [],
    flavorWindowSize: NARRATIVE_FLAVOR_WINDOW_SIZE,
    flavorTargetRatio: NARRATIVE_FLAVOR_TARGET_RATIO,
  };
}

export function resetNarrativeBudget(state: RtNarrativeBudgetState): void {
  state.flavorWindowTaskIds = [];
}

export function chooseNarrativeDensity(
  state: RtGameState,
  hasFlavorLayer: boolean,
): RtNarrativeDensity {
  if (!hasFlavorLayer) return "core";
  const budget = normalizeNarrativeBudgetState(state.narrativeBudget);
  const recentTasks = budget.flavorWindowTaskIds
    .map((taskId) => state.tasks[taskId])
    .filter((task): task is RtTask => Boolean(task));
  const flavorCount = recentTasks.filter((task) => task.narrativeRef.density === "flavor").length;
  const nextWindowSize = Math.min(budget.flavorWindowSize, recentTasks.length + 1);
  const targetFlavorCount = Math.floor(nextWindowSize * budget.flavorTargetRatio);
  if (flavorCount < targetFlavorCount) return "flavor";
  return chance(state, budget.flavorTargetRatio * 0.18) && flavorCount < Math.ceil(budget.flavorWindowSize * budget.flavorTargetRatio)
    ? "flavor"
    : "core";
}

export function recordTaskNarrativeBudget(state: RtGameState, task: RtTask): void {
  const budget = normalizeNarrativeBudgetState(state.narrativeBudget);
  budget.flavorWindowTaskIds.unshift(task.id);
  if (budget.flavorWindowTaskIds.length > budget.flavorWindowSize) {
    budget.flavorWindowTaskIds.length = budget.flavorWindowSize;
  }
}

export function normalizeNarrativeBudgetState(value: RtNarrativeBudgetState | undefined): RtNarrativeBudgetState {
  const next = value ?? createNarrativeBudgetState();
  if (!Array.isArray(next.flavorWindowTaskIds)) next.flavorWindowTaskIds = [];
  if (typeof next.flavorWindowSize !== "number" || !Number.isFinite(next.flavorWindowSize)) {
    next.flavorWindowSize = NARRATIVE_FLAVOR_WINDOW_SIZE;
  }
  if (typeof next.flavorTargetRatio !== "number" || !Number.isFinite(next.flavorTargetRatio)) {
    next.flavorTargetRatio = NARRATIVE_FLAVOR_TARGET_RATIO;
  }
  return next;
}
