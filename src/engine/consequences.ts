import {
  BACKLOG_LIMIT,
  FALLOUT_BACKLOG_EXTRA_SLOTS,
  MAX_FALLOUT_CHAIN_DEPTH,
} from "./balance";
import { removeTaskFromBoard } from "./board";
import { DOMAIN_PREFIXES } from "./catalog";
import { clamp } from "./math";
import { chance } from "./rng";
import {
  applyResourceDelta,
  resourceDeltaEffects,
} from "./resources";
import {
  releaseReadiness,
  releaseScore,
} from "./readiness";
import { generateTask } from "./taskFactory";
import type {
  RtConsequenceSource,
  RtEvent,
  RtGameState,
  RtReleaseConsequence,
  RtReleaseConsequenceCause,
  RtReleaseReadiness,
  RtResources,
  RtRiskReason,
  RtTask,
  RtTaskKind,
  RtTaskResolution,
} from "./types";

type ConsequenceEventSink = (event: Omit<RtEvent, "at">) => void;
type ConsequenceTaskAdder = (task: RtTask, backlogLimit?: number) => boolean;

export interface ConsequenceRuntime {
  addTask: ConsequenceTaskAdder;
  emit: ConsequenceEventSink;
}

export function collectMissedTaskIds(state: RtGameState): string[] {
  return [...state.board.backlog, ...state.board.inProgress].filter((taskId) => {
    const task = state.tasks[taskId];
    return Boolean(
      task &&
        !task.released &&
        !task.resolved &&
        task.column !== "done" &&
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

export function normalizeConsequenceTaskTitle(title: string, sourceTaskId: string): string {
  const source = escapeRegExp(sourceTaskId);
  return title
    .replace(new RegExp(`: escalation after ${source} missed release$`), ": missed commitment escalated")
    .replace(new RegExp(`: small slip after ${source}$`), ": small slip")
    .replace(new RegExp(` after unfinished work on ${source}$`), " after unfinished work")
    .replace(new RegExp(` after ${source}$`), "");
}

function createTailConsequence(
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
  followUp.title = `${followUp.id}: ${symptom}`;
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

function missedTaskIsMinor(task: RtTask): boolean {
  if (task.rootCauseTaskId) return false;
  if (task.kind === "integration" || task.kind === "incident" || task.kind === "compliance") {
    return false;
  }
  if (task.kind === "performance" && task.pressure >= 3) return false;
  if (task.blastRadius === "high") return false;
  if (task.pressure >= 4 || task.value >= 34) return false;
  return task.kind === "bug" || task.kind === "techDebt" || task.pressure <= 2;
}

function missedMinorResourceDelta(task: RtTask): Partial<RtResources> {
  if (task.kind === "techDebt" || task.kind === "bug" || task.kind === "performance") {
    return { debt: 1 };
  }
  return { trust: -1 };
}

function terminalResourceDelta(task: RtTask): Partial<RtResources> {
  const blast = task.blastRadius === "high" ? 2 : task.blastRadius === "medium" ? 1 : 0;
  return {
    trust: -(3 + blast),
    clients: task.kind === "incident" || task.blastRadius === "high" ? -2 : -1,
    debt: 3 + blast,
  };
}

function blockedTailResourceDelta(task: RtTask): Partial<RtResources> {
  return {
    trust: task.blastRadius === "high" ? -3 : -2,
    debt: task.kind === "techDebt" ? 3 : 2,
  };
}

function markTaskResolved(
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

function primaryConsequenceCause(reasons: RtRiskReason[]): RtReleaseConsequenceCause {
  if (reasons.includes("known_bug")) return "known_bug";
  if (reasons.includes("changed_after_qa")) return "changed_after_qa";
  if (reasons.includes("no_qa")) return "no_qa";
  if (reasons.includes("blast_radius_uncovered") || reasons.includes("no_sre")) return "no_sre";
  if (reasons.includes("critical_open")) return "critical_open";
  if (reasons.includes("important_open")) return "important_open";
  if (reasons.includes("low_clarity")) return "low_clarity";
  if (reasons.includes("deadline_pressure")) return "deadline_pressure";
  return "no_qa";
}

function consequenceTaskKind(cause: RtReleaseConsequenceCause, score: number): RtTaskKind {
  if (cause === "known_bug" || cause === "changed_after_qa") return "bug";
  if (cause === "ignored_work") return score < 45 ? "incident" : "integration";
  if (cause === "missed_deadline") return "incident";
  if (cause === "terminal_chain") return "incident";
  if (cause === "no_sre" || score < 45) return "incident";
  if (cause === "low_clarity") return "feature";
  return "incident";
}

function releaseConsequenceSymptom(task: RtTask, cause: RtReleaseConsequenceCause): string {
  const area =
    task.domain === "payments"
      ? "Partner payouts"
      : task.domain === "auth"
        ? "Partner login"
        : task.domain === "admin"
          ? "Admin workflow"
          : task.domain === "search"
            ? "Search results"
            : task.domain === "reports"
              ? "Partner report export"
              : "Customer notifications";
  const failure =
    cause === "known_bug"
      ? "known bug is still visible"
      : cause === "changed_after_qa"
        ? "regressed after untested late changes"
        : cause === "no_qa"
          ? "started failing without QA coverage"
          : cause === "no_sre"
            ? "created production instability"
            : cause === "low_clarity"
              ? "does not match the business request"
              : "broke after unfinished release work";
  return `${area}: ${failure}`;
}

function missedConsequenceSymptom(
  task: RtTask,
  source: RtConsequenceSource,
  createsWork: boolean,
): string {
  const area =
    task.domain === "payments"
      ? "Partner commitment"
      : task.domain === "auth"
        ? "Login commitment"
        : task.domain === "admin"
          ? "Admin team request"
          : task.domain === "search"
            ? "Search request"
            : task.domain === "reports"
              ? "Reporting request"
              : "Notification request";
  if (!createsWork) return `${area}: small slip`;
  if (source === "missed_in_progress") {
    return `${area}: escalation after unfinished work`;
  }
  return `${area}: missed commitment escalated`;
}

function consequenceCauseText(cause: RtReleaseConsequenceCause): string {
  switch (cause) {
    case "known_bug":
      return "known bugs";
    case "changed_after_qa":
      return "changes after QA";
    case "no_qa":
      return "no QA pass";
    case "no_sre":
      return "missing SRE safety";
    case "critical_open":
      return "open critical work";
    case "important_open":
      return "open important work";
    case "low_clarity":
      return "low clarity";
    case "deadline_pressure":
      return "deadline pressure";
    case "ignored_work":
      return "ignored work";
    case "missed_deadline":
      return "missed deadline";
    case "terminal_chain":
      return "terminal fallout";
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
