import { clamp } from "./math";
import type { RtGameState, RtResources } from "./types";

export function copyResources(resources: RtResources): RtResources {
  return { ...resources };
}

export function emptyResourceDelta(): RtResources {
  return {
    trust: 0,
    debt: 0,
    value: 0,
    clients: 0,
    budget: 0,
    processBoost: 0,
  };
}

export function diffResources(before: RtResources, after: RtResources): RtResources {
  return {
    trust: after.trust - before.trust,
    debt: after.debt - before.debt,
    value: after.value - before.value,
    clients: after.clients - before.clients,
    budget: after.budget - before.budget,
    processBoost: after.processBoost - before.processBoost,
  };
}

export function morningReportEffects(delta: RtResources): string[] {
  const effects = [
    delta.value !== 0 ? `value ${formatDelta(delta.value)}` : null,
    delta.budget !== 0 ? `budget ${formatDelta(delta.budget)}` : null,
    delta.trust !== 0 ? `trust ${formatDelta(delta.trust)}` : null,
    delta.clients !== 0 ? `clients ${formatDelta(delta.clients)}` : null,
    delta.debt !== 0 ? `debt ${formatDelta(delta.debt)}` : null,
    delta.processBoost !== 0 ? `boost ${formatDelta(delta.processBoost)}` : null,
  ].filter((effect): effect is string => Boolean(effect));
  return effects.length > 0 ? effects : ["no business effects"];
}

export function applyResourceDelta(
  state: RtGameState,
  delta: Partial<RtResources>,
): Partial<RtResources> {
  const applied: Partial<RtResources> = {};
  for (const key of ["trust", "clients", "debt", "value", "budget", "processBoost"] as const) {
    const value = delta[key];
    if (!value) continue;
    const before = state.resources[key];
    const after =
      key === "value" || key === "budget"
        ? Math.max(0, before + value)
        : clamp(before + value, 0, key === "processBoost" ? 25 : 100);
    state.resources[key] = after;
    const actual = after - before;
    if (actual !== 0) applied[key] = actual;
  }
  return applied;
}

export function resourceDeltaEffects(delta: Partial<RtResources>): string[] {
  return (["trust", "clients", "debt", "value", "budget", "processBoost"] as const)
    .map((key) => {
      const value = delta[key];
      if (!value) return null;
      const label = key === "processBoost" ? "boost" : key;
      return `${label} ${formatDelta(value)}`;
    })
    .filter((effect): effect is string => Boolean(effect));
}

export function formatDelta(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}
