import { pickOne, randomInt } from "../rng";
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
  const archetypeId = pickOne(state, TASK_NARRATIVE_ARCHETYPE_IDS_BY_KIND[kind]);
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
