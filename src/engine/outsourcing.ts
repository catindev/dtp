import {
  OUTSOURCE_COST_BY_IMPORTANCE,
  WORK_SPEED_MULTIPLIER,
} from "./balance";
import { getOpenTodoSubtasks, taskBusy } from "./board";
import {
  ensureQaRecheckSubtask,
  isBugfixWork,
} from "./bugs";
import { clamp } from "./math";
import {
  addPostmortemNote,
  importanceWeight,
} from "./work";
import type {
  RtEvent,
  RtGameState,
  RtOutsourcePlan,
  RtOutsourceStatus,
  RtSubtask,
  RtTask,
} from "./types";

type OutsourcingEventSink = (event: Omit<RtEvent, "at">) => void;

export function getOutsourceTaskWorkStatus(
  state: RtGameState,
  taskId: string,
): RtOutsourceStatus {
  const task = state.tasks[taskId];
  const currentBudget = state.resources.budget;
  if (!task) {
    return {
      allowed: false,
      reason: "task_missing",
      currentBudget,
      cost: null,
      neededBudget: null,
      subtask: null,
    };
  }
  if (taskBusy(task)) {
    return {
      allowed: false,
      reason: "task_busy",
      currentBudget,
      cost: null,
      neededBudget: null,
      subtask: null,
    };
  }
  if (task.released) {
    return {
      allowed: false,
      reason: "task_released",
      currentBudget,
      cost: null,
      neededBudget: null,
      subtask: null,
    };
  }
  if (task.column !== "inProgress") {
    return {
      allowed: false,
      reason: "wrong_column",
      currentBudget,
      cost: null,
      neededBudget: null,
      subtask: null,
    };
  }

  const open = getOpenTodoSubtasks(task);
  if (open.length === 0) {
    return {
      allowed: false,
      reason: task.subtasks.some((subtask) => !subtask.revealed && !subtask.done)
        ? "needs_analysis"
        : "no_open_work",
      currentBudget,
      cost: null,
      neededBudget: null,
      subtask: null,
    };
  }

  const subtask = chooseSubtaskForOutsource(state, task, currentBudget);
  if (!subtask) {
    const cheapest = open
      .map((candidate) => ({
        subtask: candidate,
        cost: OUTSOURCE_COST_BY_IMPORTANCE[candidate.importance],
      }))
      .sort((a, b) => a.cost - b.cost)[0];
    return {
      allowed: false,
      reason: "insufficient_budget",
      currentBudget,
      cost: cheapest.cost,
      neededBudget: cheapest.cost,
      subtask: cheapest.subtask,
    };
  }

  const cost = OUTSOURCE_COST_BY_IMPORTANCE[subtask.importance];
  return {
    allowed: true,
    reason: "ready",
    currentBudget,
    cost,
    neededBudget: cost,
    subtask,
  };
}

export function canOutsourceTaskWork(state: RtGameState, taskId: string): boolean {
  return getOutsourceTaskWorkStatus(state, taskId).allowed;
}

export function outsourceTaskWork(
  state: RtGameState,
  taskId: string,
  emit: OutsourcingEventSink,
): boolean {
  const plan = getOutsourcePlan(state, taskId);
  if (!plan || state.resources.budget < plan.cost) return false;
  const { task, subtask, cost } = plan;

  state.resources.budget = Math.max(0, state.resources.budget - cost);
  task.outsourcing = {
    subtaskId: subtask.id,
    cost,
    progress: subtask.progress,
  };
  task.currentSubtaskId = subtask.id;
  task.stageProgress = subtask.progress;
  task.stageComplete = false;
  task.lastNote = `Outsource is working on ${subtask.role}: ${subtask.title}.`;

  emit({
    type: "outsourcing_started",
    title: `${task.id} outsourced`,
    body: `External contractor started ${subtask.title}.`,
    effects: [`budget -${cost}`, `subtask ${subtask.role}`, subtask.importance],
  });

  return true;
}

export function updateOutsourcing(
  state: RtGameState,
  tickMs: number,
  emit: OutsourcingEventSink,
): void {
  const tickSeconds = tickMs / 1000;
  for (const task of Object.values(state.tasks)) {
    if (!task.outsourcing || task.column !== "inProgress") continue;
    const subtask = task.subtasks.find((candidate) => candidate.id === task.outsourcing?.subtaskId);
    if (!subtask || subtask.done) {
      task.outsourcing = null;
      task.currentSubtaskId = null;
      task.stageProgress = 0;
      continue;
    }

    const costFactor = 1 + task.outsourcing.cost * 0.08;
    const importanceFactor =
      subtask.importance === "critical" ? 0.88 : subtask.importance === "important" ? 1 : 1.12;
    const speed =
      (3.8 + OUTSOURCE_COST_BY_IMPORTANCE[subtask.importance] * 0.6) *
      costFactor *
      importanceFactor *
      WORK_SPEED_MULTIPLIER;
    const nextProgress = clamp(
      task.outsourcing.progress + (speed * tickSeconds) / (1 + task.complexity * 0.26),
      0,
      100,
    );
    task.outsourcing.progress = nextProgress;
    task.stageProgress = nextProgress;
    subtask.progress = nextProgress;

    if (nextProgress >= 100) {
      completeOutsourcedWork(state, task, subtask, task.outsourcing.cost, emit);
    }
  }
}

function getOutsourcePlan(state: RtGameState, taskId: string): RtOutsourcePlan | null {
  const task = state.tasks[taskId];
  const status = getOutsourceTaskWorkStatus(state, taskId);
  if (!task || !status.allowed || !status.subtask || status.cost === null) return null;
  return {
    task,
    subtask: status.subtask,
    cost: status.cost,
  };
}

function completeOutsourcedWork(
  state: RtGameState,
  task: RtTask,
  subtask: RtSubtask,
  cost: number,
  emit: OutsourcingEventSink,
): void {
  subtask.done = true;
  subtask.progress = 100;
  subtask.completedBy = "outsourcing";
  subtask.offRole = false;

  const bugfixWork = isBugfixWork(subtask);
  if (task.testCoverage > 0 && subtask.role !== "qa") {
    task.changedAfterQa = true;
    task.testCoverage = Math.min(task.testCoverage, 35);
    ensureQaRecheckSubtask(task);
    addPostmortemNote(
      task,
      "Outsourced work changed the task after QA, so prior test coverage became stale.",
    );
  }
  const qualityGain = bugfixWork ? 18 : subtask.importance === "critical" ? 16 : 11;
  if (bugfixWork) {
    task.bugs = Math.max(0, task.bugs - 1);
  }
  task.quality = clamp(task.quality + qualityGain, 0, 100);
  task.workDone = task.subtasks.some((candidate) => candidate.done && candidate.role !== "qa");
  task.currentSubtaskId = null;
  task.outsourcing = null;
  task.stageProgress = 100;
  task.stageComplete = true;
  task.lastNote = `Outsourcing completed ${subtask.role} work.`;

  emit({
    type: "outsourced",
    title: `${task.id} outsourced`,
    body: `External contractor completed ${subtask.title}.`,
    effects: [
      `budget -${cost}`,
      `subtask ${subtask.role}`,
      subtask.importance,
      `quality ${task.quality}`,
      `bugs ${task.bugs}`,
      ...(task.changedAfterQa ? ["QA recheck required"] : []),
    ],
  });
}

function chooseSubtaskForOutsource(
  state: RtGameState,
  task: RtTask,
  availableBudget: number,
): RtSubtask | null {
  const open = getOpenTodoSubtasks(task).filter(
    (subtask) => OUTSOURCE_COST_BY_IMPORTANCE[subtask.importance] <= availableBudget,
  );
  if (open.length === 0) return null;
  return open
    .map((subtask) => ({
      subtask,
      score:
        missingTeamCompetencyScore(state, subtask) +
        importanceWeight(subtask.importance) +
        (subtask.role === "qa" ? -18 : 0) -
        subtask.progress * 0.1,
    }))
    .sort((a, b) => b.score - a.score)[0].subtask;
}

function missingTeamCompetencyScore(state: RtGameState, subtask: RtSubtask): number {
  const bestSkill = Math.max(
    0,
    ...Object.values(state.characters).map((character) => character.specialty[subtask.role] ?? 0),
  );
  if (bestSkill <= 1) return 42;
  if (bestSkill === 2) return 30;
  if (bestSkill === 3) return 16;
  return 0;
}
