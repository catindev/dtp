import { randomInt, weightedPick } from "../rng";
import type {
  RtGameState,
  RtTask,
  RtTaskDomain,
  RtTaskKind,
  RtTaskNarrativeRef,
} from "../types";
import {
  TASK_NARRATIVE_ARCHETYPE_IDS_BY_KIND,
  TASK_NARRATIVE_ARCHETYPES,
  type TaskNarrativeArchetype,
} from "./taskNarrativeCatalog";

export function createTaskNarrativeRef(
  state: RtGameState,
  kind: RtTaskKind,
  domain: RtTaskDomain,
): RtTaskNarrativeRef {
  const archetypeId = chooseTaskNarrativeArchetypeId(state, kind, domain);
  return {
    archetypeId,
    variantSeed: randomInt(state, 1, 999999),
    branchId: "default",
    variableValueIds: {
      area: domain,
    },
    tags: [...getTaskNarrativeArchetype(archetypeId).tags],
    tone: "neutral",
    density: "core",
  };
}

function chooseTaskNarrativeArchetypeId(
  state: RtGameState,
  kind: RtTaskKind,
  domain: RtTaskDomain,
): string {
  const candidates = TASK_NARRATIVE_ARCHETYPE_IDS_BY_KIND[kind]
    .map((archetypeId) => getTaskNarrativeArchetype(archetypeId))
    .filter((archetype) => !archetype.domains || archetype.domains.includes(domain));
  if (candidates.length === 0) {
    throw new Error(`No task narrative archetype for ${kind}/${domain}`);
  }
  return weightedPick(
    state,
    candidates.map((archetype) => ({
      item: archetype.id,
      weight: archetype.weight ?? 1,
    })),
  );
}

export function getTaskNarrativeArchetype(archetypeId: string): TaskNarrativeArchetype {
  const archetype = TASK_NARRATIVE_ARCHETYPES[archetypeId];
  if (!archetype) {
    throw new Error(`Unknown task narrative archetype: ${archetypeId}`);
  }
  return archetype;
}

export function assertTaskNarrative(task: RtTask): void {
  const archetype = getTaskNarrativeArchetype(task.narrativeRef.archetypeId);
  if (archetype.kind !== task.kind) {
    throw new Error(
      `Task ${task.id} narrative kind mismatch: ${task.kind} uses ${archetype.id}/${archetype.kind}`,
    );
  }
  if (!archetype.branches[task.narrativeRef.branchId]) {
    throw new Error(
      `Task ${task.id} narrative branch missing: ${task.narrativeRef.archetypeId}/${task.narrativeRef.branchId}`,
    );
  }
}
