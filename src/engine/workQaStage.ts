import {
  WORK_QA_OFF_ROLE_COVERAGE_FACTOR,
  WORK_QA_SUBTASK_COVERAGE_BASE,
  WORK_QA_SUBTASK_RANDOM_MAX,
  WORK_QA_SUBTASK_ROLE_FACTOR,
  WORK_QA_SUBTASK_SKILL_FACTOR,
  WORK_QA_TRIAGE_MIN,
  WORK_QA_TRIAGE_RANDOM_MAX,
  WORK_QA_TRIAGE_SKILL_DIVISOR,
  WORK_TEST_COVERAGE_BASE,
  WORK_TEST_COVERAGE_RANDOM_MAX,
  WORK_TEST_COVERAGE_SKILL_FACTOR,
} from "./balance";
import {
  addBugfixSubtasks,
  discoverBugsDuringQa,
  ensureBugReviewSubtask,
} from "./bugs";
import { clamp } from "./math";
import { randomInt } from "./rng";
import type {
  RtCharacter,
  RtGameState,
  RtSubtask,
  RtTask,
} from "./types";
import type { WorkStageEventSink } from "./workStageTypes";

export function completeQaSubtaskStage(
  state: RtGameState,
  task: RtTask,
  character: RtCharacter,
  subtask: RtSubtask,
  roleFit: number,
  offRole: boolean,
  emit: WorkStageEventSink,
): void {
  const coverageGain = Math.round(
    (WORK_QA_SUBTASK_COVERAGE_BASE +
      character.skill.test * WORK_QA_SUBTASK_SKILL_FACTOR +
      roleFit * WORK_QA_SUBTASK_ROLE_FACTOR +
      randomInt(state, 0, WORK_QA_SUBTASK_RANDOM_MAX)) *
      (offRole ? WORK_QA_OFF_ROLE_COVERAGE_FACTOR : 1),
  );
  task.testCoverage = clamp(task.testCoverage + coverageGain, 0, 100);
  task.changedAfterQa = false;
  const qaResult = applyQaResult(state, task, character, roleFit);
  task.currentSubtaskId = null;
  task.stageComplete = true;
  task.lastNote =
    qaResult.bugfixes.length > 0
      ? `QA converted ${qaResult.bugfixes.length} bug(s) into rework.`
      : "QA pass complete.";
  emitQaDoneEvent(task, character, emit, qaResult.bugfixes.length, [
    subtask.importance,
    offRole ? "off-role" : "on-role",
    `qa +${coverageGain}`,
    ...(qaResult.discoveredBugs > 0 ? [`found +${qaResult.discoveredBugs}`] : []),
    ...(qaResult.triagedBugs > 0 ? [`bugs -${qaResult.triagedBugs}`] : ["bugs 0"]),
    ...(qaResult.bugfixes.length > 0 ? [`rework +${qaResult.bugfixes.length}`] : []),
    ...(task.bugs > 0 ? [`bugs left ${task.bugs}`] : []),
  ]);
}

export function completeTestStage(
  state: RtGameState,
  task: RtTask,
  character: RtCharacter,
  emit: WorkStageEventSink,
): void {
  const coverageGain =
    WORK_TEST_COVERAGE_BASE +
    character.skill.test * WORK_TEST_COVERAGE_SKILL_FACTOR +
    randomInt(state, 0, WORK_TEST_COVERAGE_RANDOM_MAX);
  task.testCoverage = clamp(task.testCoverage + coverageGain, 0, 100);
  task.changedAfterQa = false;
  const qaResult = applyQaResult(state, task, character, character.specialty.qa);
  const qaSubtask = task.subtasks.find(
    (subtask) => subtask.revealed && !subtask.done && subtask.role === "qa",
  );
  if (qaSubtask) {
    qaSubtask.done = true;
    qaSubtask.progress = 100;
    qaSubtask.completedBy = character.id;
  }
  task.currentSubtaskId = null;
  task.lastNote =
    qaResult.bugfixes.length > 0 ? `QA converted ${qaResult.bugfixes.length} bug(s) into rework.` : "QA pass complete.";
  emitQaDoneEvent(task, character, emit, qaResult.bugfixes.length, [
    `qa +${coverageGain}`,
    ...(qaResult.discoveredBugs > 0 ? [`found +${qaResult.discoveredBugs}`] : []),
    ...(qaResult.triagedBugs > 0 ? [`bugs -${qaResult.triagedBugs}`] : ["bugs 0"]),
    ...(qaResult.bugfixes.length > 0 ? [`rework +${qaResult.bugfixes.length}`] : []),
    ...(task.bugs > 0 ? [`bugs left ${task.bugs}`] : []),
  ]);
}

function applyQaResult(
  state: RtGameState,
  task: RtTask,
  character: RtCharacter,
  roleFit: number,
) {
  const discoveredBugs = discoverBugsDuringQa(state, task);
  task.bugs += discoveredBugs;
  const triagedBugs = Math.min(
    task.bugs,
    Math.max(
      WORK_QA_TRIAGE_MIN,
      Math.floor((character.skill.test + roleFit) / WORK_QA_TRIAGE_SKILL_DIVISOR) +
        randomInt(state, 0, WORK_QA_TRIAGE_RANDOM_MAX),
    ),
  );
  task.bugs = Math.max(0, task.bugs - triagedBugs);
  const bugfixes = addBugfixSubtasks(state, task, triagedBugs);
  ensureBugReviewSubtask(task);
  return {
    bugfixes,
    discoveredBugs,
    triagedBugs,
  };
}

function emitQaDoneEvent(
  task: RtTask,
  character: RtCharacter,
  emit: WorkStageEventSink,
  bugfixCount: number,
  effects: string[],
): void {
  emit({
    type: "qa_done",
    title: `${task.id} QA pass done`,
    body: bugfixCount > 0
      ? `${character.name} triaged ${bugfixCount} bug(s) into rework.`
      : `${character.name} found no blocking bugs.`,
    effects,
  });
}
