import { chance, weightedPick } from "./rng";
import type {
  RtBlastRadius,
  RtGameState,
  RtTask,
  RtTaskKind,
} from "./types";

export function inferBlastRadius(task: RtTask): RtBlastRadius {
  if (
    task.kind === "incident" ||
    task.kind === "performance" ||
    task.kind === "compliance" ||
    task.pressure >= 5 ||
    task.complexity >= 5
  ) {
    return "high";
  }
  if (task.kind === "integration" || task.kind === "techDebt" || task.pressure >= 3) {
    return "medium";
  }
  return "low";
}

export function chooseBlastRadius(
  state: RtGameState,
  kind: RtTaskKind,
  complexity: number,
  pressure: number,
): RtBlastRadius {
  const base =
    kind === "incident" || kind === "performance" || kind === "compliance"
      ? 2
      : kind === "integration" || kind === "techDebt"
        ? 1
        : 0;
  const score =
    base +
    (complexity >= 4 ? 1 : 0) +
    (pressure >= 4 ? 1 : 0) +
    (chance(state, 0.24) ? 1 : 0);
  if (score >= 3) return "high";
  if (score >= 1) return "medium";
  return "low";
}

export function chooseTaskKind(state: RtGameState): RtTaskKind {
  const weights: Array<{ item: RtTaskKind; weight: number }> = [
    { item: "feature", weight: 30 },
    { item: "bug", weight: 14 },
    { item: "techDebt", weight: 8 },
    { item: "integration", weight: 14 },
    { item: "incident", weight: 5 },
    { item: "performance", weight: 10 },
    { item: "compliance", weight: 9 },
  ];
  for (const entry of weights) {
    if (state.resources.debt > 55 && entry.item === "bug") entry.weight += 14;
    if (state.resources.debt > 55 && entry.item === "techDebt") entry.weight += 10;
    if (state.resources.debt > 55 && entry.item === "performance") entry.weight += 10;
    if (state.resources.trust < 40 && entry.item === "incident") entry.weight += 12;
  }
  return weightedPick(state, weights);
}

export function kindValueMultiplier(kind: RtTaskKind): number {
  if (kind === "feature") return 1.25;
  if (kind === "incident") return 0.75;
  if (kind === "techDebt") return 0.9;
  if (kind === "compliance") return 1.1;
  return 1;
}
