import type { RtNarrativeBudgetState } from "../types";

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
