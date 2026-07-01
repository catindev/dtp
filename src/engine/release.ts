import { removeTaskFromBoard } from "./board";
import { clamp } from "./math";
import { formatDelta } from "./resources";
import {
  formatOverdueGameTime,
  lateReleaseReport,
  releaseReadiness,
  releaseScore,
} from "./readiness";
import type {
  RtEvent,
  RtGameState,
  RtReleaseReadiness,
  RtTask,
} from "./types";

type ReleaseEventSink = (event: Omit<RtEvent, "at">) => void;

export function releaseRealtimeTask(
  state: RtGameState,
  taskId: string,
  emit: ReleaseEventSink,
): boolean {
  const task = state.tasks[taskId];
  if (!task || task.released || task.assignedCharacterId) return false;

  const postmortem = buildReleasePostmortem(task);
  const readiness = releaseReadiness(task);
  const score = releaseScore(state, task);
  const late = lateReleaseReport(task);
  const baseValueGain = Math.max(0, Math.round(task.value * (score / 100)));
  const valueGain = Math.max(0, Math.round(baseValueGain * late.valueMultiplier));
  const budgetGain = releaseBudgetGain(valueGain, score);
  const sreSafety = task.subtasks.some((subtask) => subtask.role === "sre" && subtask.done);
  const blastMultiplier = sreSafety ? 0.65 : 1.15;
  const trustDelta = releaseTrustDelta(readiness.readiness, score, blastMultiplier, state.resources.trust);
  const clientDelta = releaseClientDelta(readiness.readiness, score, blastMultiplier, state.resources.trust);
  const debtDelta =
    score >= 75 ? -1 : Math.ceil(((75 - score) / 12 + task.bugs) * blastMultiplier);

  state.resources.value += valueGain;
  state.resources.budget += budgetGain;
  state.quarterValue += valueGain;
  state.resources.trust = clamp(state.resources.trust + trustDelta, 0, 100);
  state.resources.clients = clamp(state.resources.clients + clientDelta, 0, 100);
  state.resources.debt = clamp(state.resources.debt + debtDelta, 0, 100);

  task.releaseScore = score;
  task.postmortem = postmortem;
  task.released = true;
  task.column = "released";
  task.stageComplete = true;
  task.assignedCharacterId = null;
  task.lastNote = releaseNote(score);
  removeTaskFromBoard(state, taskId);
  state.board.released.unshift(taskId);

  emit({
    type: "release",
    title: `${task.id} released`,
    body: releaseNote(score),
    effects: [
      `${readiness.readiness} release`,
      `value +${valueGain}`,
      ...(late.valuePenaltyPercent > 0 ? [`late value -${late.valuePenaltyPercent}%`] : []),
      ...(budgetGain > 0 ? [`budget +${budgetGain}`] : []),
      `trust ${formatDelta(trustDelta)}`,
      `clients ${formatDelta(clientDelta)}`,
      `debt ${formatDelta(debtDelta)}`,
      ...(sreSafety ? ["SRE blast radius reduced"] : ["no SRE safety"]),
    ],
  });

  return true;
}

export function runDailyReleaseTrain(state: RtGameState, emit: ReleaseEventSink): string[] {
  const taskIds = [...state.board.done].filter((taskId) => {
    const task = state.tasks[taskId];
    return task && !task.released && !task.assignedCharacterId;
  });

  if (taskIds.length === 0) {
    emit({
      type: "release_train_empty",
      title: "Release train departed empty",
      body: "No tasks were queued in Done.",
      effects: ["no business effects"],
    });
    return [];
  }

  const shipped: string[] = [];
  for (const taskId of taskIds.slice().reverse()) {
    if (releaseRealtimeTask(state, taskId, emit)) shipped.unshift(taskId);
  }

  emit({
    type: "release_train",
    title: `Release train shipped ${shipped.length}`,
    body: `${shipped.length} task(s) moved from Done to Released.`,
    effects: shipped.slice(0, 4),
  });

  return shipped;
}

function buildReleasePostmortem(task: RtTask): string[] {
  const notes = uniqueStrings(task.postmortem);
  const late = lateReleaseReport(task);
  if (late.valuePenaltyPercent > 0) {
    notes.push(
      `Release missed the business window by ${formatOverdueGameTime(late.overdueMs)}, reducing value by ${late.valuePenaltyPercent}%.`,
    );
  }
  const openCritical = task.subtasks.filter(
    (subtask) => subtask.importance === "critical" && !subtask.done,
  );
  const openImportant = task.subtasks.filter(
    (subtask) => subtask.importance === "important" && !subtask.done,
  );
  const hiddenOpen = task.subtasks.filter((subtask) => !subtask.revealed && !subtask.done);
  const sreSubtasks = task.subtasks.filter((subtask) => subtask.role === "sre");
  const sreDone = sreSubtasks.some((subtask) => subtask.done);

  for (const subtask of openCritical) {
    notes.push(`Critical ${subtask.role} work was not finished: ${subtask.title}.`);
  }
  if (openImportant.length > 0) {
    notes.push(`${openImportant.length} important subtask(s) were still open.`);
  }
  if (hiddenOpen.length > 0) {
    notes.push("Analysis was incomplete; some work was never discovered.");
  }
  if (task.bugs > 0) {
    notes.push(`${task.bugs} known bug(s) shipped.`);
  }
  if (task.testCoverage < 45) {
    notes.push("QA coverage was low.");
  }
  if (sreSubtasks.length > 0 && !sreDone) {
    notes.push("SRE safety was missing, so blast radius was higher.");
  }
  if (notes.length === 0) {
    notes.push("Release was clean: critical work was done and no known bugs shipped.");
  }
  return notes;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function releaseNote(score: number): string {
  if (score >= 80) return "Strong release. Customers got what they needed.";
  if (score >= 60) return "Acceptable release. Some rough edges remain.";
  if (score >= 40) return "Risky release. Support will feel this.";
  return "Bad release. Customers are frustrated.";
}

function releaseTrustDelta(
  readiness: RtReleaseReadiness,
  score: number,
  blastMultiplier: number,
  currentTrust: number,
): number {
  const pressureMultiplier = currentTrust < 45 ? 1.45 : currentTrust < 60 ? 1.15 : 1;

  if (readiness === "clean") {
    if (score >= 80) return currentTrust < 45 ? 2 : 3;
    if (score >= 65) return 1;
    return -Math.ceil(3 * blastMultiplier * pressureMultiplier);
  }

  if (readiness === "risky") {
    if (score >= 75) return 1;
    if (score >= 60) return 0;
    if (score >= 45) return -Math.ceil(4 * blastMultiplier * pressureMultiplier);
    return -Math.ceil(8 * blastMultiplier * pressureMultiplier);
  }

  if (score >= 70) return -Math.ceil(1 * blastMultiplier * pressureMultiplier);
  if (score >= 55) return -Math.ceil(5 * blastMultiplier * pressureMultiplier);
  if (score >= 40) return -Math.ceil(8 * blastMultiplier * pressureMultiplier);
  return -Math.ceil(12 * blastMultiplier * pressureMultiplier);
}

function releaseClientDelta(
  readiness: RtReleaseReadiness,
  score: number,
  blastMultiplier: number,
  currentTrust: number,
): number {
  const pressureMultiplier = currentTrust < 45 ? 1.25 : 1;
  if (readiness === "clean" && score >= 75) return 2;
  if (readiness === "risky" && score >= 75) return 1;
  if (readiness !== "dirty" && score >= 60) return 0;
  if (readiness === "dirty" && score >= 60) return currentTrust < 45 ? -1 : 0;
  if (score >= 50) return -Math.ceil(1 * blastMultiplier * pressureMultiplier);
  return -Math.ceil(((60 - score) / 5) * blastMultiplier * pressureMultiplier);
}

function releaseBudgetGain(valueGain: number, score: number): number {
  if (score < 55) return 0;
  return Math.max(0, Math.floor(valueGain / 15));
}
