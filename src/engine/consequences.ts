import {
  consequenceCauseText,
  missedConsequenceSymptom,
  releaseConsequenceSymptom,
} from "./consequenceText";
import { isUntouchedBacklogTask } from "./backlogOpportunity";
import {
  markTaskResolved,
  missedMinorResourceDelta,
  missedTaskIsMinor,
} from "./consequenceResolution";
import {
  createTailConsequence,
  type ConsequenceRuntime,
} from "./consequenceTail";
import { chance } from "./rng";
import {
  applyResourceDelta,
  resourceDeltaEffects,
} from "./resources";
import {
  releaseReadiness,
  releaseScore,
} from "./readiness";
import type {
  RtConsequenceSource,
  RtGameState,
  RtReleaseConsequence,
  RtReleaseConsequenceCause,
  RtReleaseReadiness,
  RtRiskReason,
  RtTask,
} from "./types";

export type { ConsequenceRuntime } from "./consequenceTail";
export { normalizeConsequenceTaskTitle } from "./consequenceText";

export function collectMissedTaskIds(state: RtGameState): string[] {
  return [...state.board.backlog, ...state.board.inProgress].filter((taskId) => {
    const task = state.tasks[taskId];
    return Boolean(
      task &&
        !task.released &&
        !task.resolved &&
        task.column !== "done" &&
        !isUntouchedBacklogTask(task) &&
        task.deadlineMs <= 0,
    );
  });
}

export function generateMorningConsequences(
  state: RtGameState,
  shippedTaskIds: string[],
  missedTaskIds: string[],
  runtime: ConsequenceRuntime,
): RtReleaseConsequence[] {
  const consequences: RtReleaseConsequence[] = [];
  for (const taskId of shippedTaskIds) {
    const task = state.tasks[taskId];
    if (!task) continue;
    const readiness = releaseReadiness(task);
    const score = task.releaseScore ?? releaseScore(state, task);
    if (!shouldCreateReleaseConsequence(state, readiness.readiness, score)) continue;

    const cause = primaryConsequenceCause(readiness.reasons);
    consequences.push(
      createTailConsequence(state, runtime, {
        cause,
        consequenceIndex: consequences.length,
        source: "release",
        sourceTask: task,
        symptom: releaseConsequenceSymptom(task, cause),
      }),
    );
  }

  for (const taskId of missedTaskIds) {
    const task = state.tasks[taskId];
    if (!task || task.released || task.resolved) continue;
    consequences.push(resolveMissedTask(state, runtime, task, consequences.length));
  }

  return consequences;
}

function resolveMissedTask(
  state: RtGameState,
  runtime: ConsequenceRuntime,
  task: RtTask,
  consequenceIndex: number,
): RtReleaseConsequence {
  const source: RtConsequenceSource =
    task.column === "backlog" ? "missed_backlog" : "missed_in_progress";
  const cause: RtReleaseConsequenceCause =
    source === "missed_backlog" ? "ignored_work" : "missed_deadline";

  if (missedTaskIsMinor(task)) {
    const resourceDelta = applyResourceDelta(state, missedMinorResourceDelta(task));
    const effects = [
      `source ${task.id}`,
      `cause ${consequenceCauseText(cause)}`,
      "minor hit",
      ...resourceDeltaEffects(resourceDelta),
    ];
    markTaskResolved(state, task, "missed_minor");
    const consequence: RtReleaseConsequence = {
      id: `${task.id}-minor-${state.day}-${consequenceIndex + 1}`,
      source,
      sourceTaskId: task.id,
      sourceTitle: task.title,
      rootCauseTaskId: task.rootCauseTaskId ?? task.id,
      chainDepth: task.chainDepth,
      cause,
      symptom: missedConsequenceSymptom(task, source, false),
      generatedTaskId: null,
      terminal: false,
      resourceDelta,
      effects,
    };
    runtime.emit({
      type: "missed_minor_hit",
      title: `${task.id} missed`,
      body: `${task.title} missed the day and resolved as a small operational hit.`,
      effects,
    });
    return consequence;
  }

  const consequence = createTailConsequence(state, runtime, {
    cause,
    consequenceIndex,
    source,
    sourceTask: task,
    symptom: missedConsequenceSymptom(task, source, true),
  });
  markTaskResolved(state, task, consequence.terminal ? "missed_terminal" : "missed_tail");
  runtime.emit({
    type: "missed_task_resolved",
    title: `${task.id} missed`,
    body: `${task.title} missed the daily release window and left the board.`,
    effects: consequence.effects,
  });
  return consequence;
}

function shouldCreateReleaseConsequence(
  state: RtGameState,
  readiness: RtReleaseReadiness,
  score: number,
): boolean {
  if (score < 55 || readiness === "dirty") return true;
  if (score < 70 || readiness === "risky") return chance(state, 0.55);
  return false;
}

function primaryConsequenceCause(reasons: RtRiskReason[]): RtReleaseConsequenceCause {
  if (reasons.includes("known_bug")) return "known_bug";
  if (reasons.includes("changed_after_qa")) return "changed_after_qa";
  if (reasons.includes("no_qa")) return "no_qa";
  if (reasons.includes("blast_radius_uncovered") || reasons.includes("no_sre")) return "no_sre";
  if (reasons.includes("critical_open")) return "critical_open";
  if (reasons.includes("important_open")) return "important_open";
  if (reasons.includes("low_clarity")) return "low_clarity";
  return "no_qa";
}
