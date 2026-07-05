import {
  BACKLOG_LIMIT,
  FALLOUT_BACKLOG_EXTRA_SLOTS,
  MAX_FALLOUT_CHAIN_DEPTH,
} from "./balance";
import { DOMAIN_PREFIXES } from "./catalog";
import {
  consequenceCauseText,
  consequenceTaskKind,
} from "./consequenceText";
import {
  blockedTailResourceDelta,
  terminalResourceDelta,
} from "./consequenceResolution";
import { clamp } from "./math";
import {
  applyResourceDelta,
  resourceDeltaEffects,
} from "./resources";
import { generateTask } from "./taskFactory";
import type {
  RtConsequenceSource,
  RtEvent,
  RtGameState,
  RtReleaseConsequence,
  RtReleaseConsequenceCause,
  RtTask,
} from "./types";

type ConsequenceEventSink = (event: Omit<RtEvent, "at">) => void;
type ConsequenceTaskAdder = (task: RtTask, backlogLimit?: number) => boolean;

export interface ConsequenceRuntime {
  addTask: ConsequenceTaskAdder;
  emit: ConsequenceEventSink;
}

export function createTailConsequence(
  state: RtGameState,
  runtime: ConsequenceRuntime,
  {
    cause,
    consequenceIndex,
    source,
    sourceTask,
    symptom,
  }: {
    cause: RtReleaseConsequenceCause;
    consequenceIndex: number;
    source: RtConsequenceSource;
    sourceTask: RtTask;
    symptom: string;
  },
): RtReleaseConsequence {
  const rootCauseTaskId = sourceTask.rootCauseTaskId ?? sourceTask.id;
  const nextDepth = sourceTask.chainDepth + 1;
  const shouldTerminate = nextDepth > MAX_FALLOUT_CHAIN_DEPTH;

  if (shouldTerminate) {
    const resourceDelta = applyResourceDelta(state, terminalResourceDelta(sourceTask));
    const effects = [
      `source ${sourceTask.id}`,
      `cause ${consequenceCauseText(cause)}`,
      "chain terminated",
      ...resourceDeltaEffects(resourceDelta),
    ];
    const consequence: RtReleaseConsequence = {
      id: `${sourceTask.id}-terminal-${state.day}-${consequenceIndex + 1}`,
      source: "terminal",
      sourceTaskId: sourceTask.id,
      sourceTitle: sourceTask.title,
      rootCauseTaskId,
      chainDepth: nextDepth,
      cause: "terminal_chain",
      symptom,
      generatedTaskId: null,
      terminal: true,
      resourceDelta,
      effects,
    };

    runtime.emit({
      type: "tail_chain_terminated",
      title: `${sourceTask.id} chain closed`,
      body: `${symptom}. The fallout chain reached its cap and resolved as business damage.`,
      effects,
    });
    return consequence;
  }

  const followUp = generateTask(state, consequenceTaskKind(cause, sourceTask.releaseScore ?? 50));
  const originalFollowUpId = followUp.id;
  const sequence =
    originalFollowUpId.match(/\d+$/)?.[0] ?? String(state.nextTaskId - 1).padStart(3, "0");
  followUp.domain = sourceTask.domain;
  followUp.id = `${DOMAIN_PREFIXES[sourceTask.domain] ?? "INC"}-${sequence}`;
  followUp.narrativeRef.variableValueIds.area = sourceTask.domain;
  followUp.narrativeRef.tags = Array.from(new Set([...followUp.narrativeRef.tags, "fallout"]));
  followUp.title = `${followUp.id}: ${followUp.narrativeRef.archetypeId}`;
  for (const subtask of followUp.subtasks) {
    subtask.id = subtask.id.replace(originalFollowUpId, followUp.id);
  }
  followUp.rootCauseTaskId = rootCauseTaskId;
  followUp.sourceTaskId = sourceTask.id;
  followUp.chainDepth = nextDepth;
  followUp.pressure = clamp(sourceTask.pressure + 1, 1, 6);
  followUp.complexity =
    source === "missed_in_progress"
      ? clamp(Math.ceil((sourceTask.complexity + 1) / 2), 1, 6)
      : clamp(Math.ceil((sourceTask.complexity + 2) / 2), 1, 6);
  followUp.value = Math.max(4, Math.round(sourceTask.value * 0.35));
  followUp.clarity = clamp(
    source === "missed_in_progress"
      ? Math.max(55, Math.round(sourceTask.clarity * 0.75))
      : 72 - consequenceIndex * 4,
    45,
    92,
  );
  followUp.quality =
    source === "missed_in_progress"
      ? clamp(Math.round(sourceTask.quality * 0.6), 8, 72)
      : Math.max(8, Math.round(followUp.clarity * 0.22));
  followUp.testCoverage =
    source === "missed_in_progress" ? Math.min(sourceTask.testCoverage, 35) : 0;
  followUp.blastRadius = sourceTask.blastRadius === "high" ? "high" : "medium";
  followUp.lastNote = `Caused by yesterday's ${sourceTask.id}: ${consequenceCauseText(cause)}.`;
  followUp.postmortem = [
    `Cause: ${consequenceCauseText(cause)}.`,
    ...(source === "missed_in_progress" ? ["Some prior work carried forward as context."] : []),
  ];

  const added = runtime.addTask(followUp, BACKLOG_LIMIT + FALLOUT_BACKLOG_EXTRA_SLOTS);
  const generatedTaskId = added ? followUp.id : null;
  const resourceDelta = added ? {} : applyResourceDelta(state, blockedTailResourceDelta(sourceTask));
  const effects = [
    `source ${sourceTask.id}`,
    `root ${rootCauseTaskId}`,
    `cause ${consequenceCauseText(cause)}`,
    `depth ${nextDepth}/${MAX_FALLOUT_CHAIN_DEPTH}`,
    ...(generatedTaskId ? [`created ${generatedTaskId}`] : ["backlog full", ...resourceDeltaEffects(resourceDelta)]),
  ];

  const consequence: RtReleaseConsequence = {
    id: `${sourceTask.id}-fallout-${state.day}-${consequenceIndex + 1}`,
    source,
    sourceTaskId: sourceTask.id,
    sourceTitle: sourceTask.title,
    rootCauseTaskId,
    chainDepth: nextDepth,
    cause,
    symptom,
    generatedTaskId,
    terminal: false,
    resourceDelta,
    effects,
  };

  runtime.emit({
    type:
      source === "release"
        ? "release_consequence_spawned"
        : generatedTaskId
          ? "missed_tail_spawned"
          : "missed_tail_blocked",
    title: generatedTaskId
      ? `${sourceTask.id} caused ${generatedTaskId}`
      : `${sourceTask.id} fallout delayed`,
    body: `${symptom} because yesterday's ${sourceTask.id} had ${consequenceCauseText(cause)}.`,
    effects,
  });

  return consequence;
}
