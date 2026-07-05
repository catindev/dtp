import {
  RELEASE_QA_COVERAGE_THRESHOLD,
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
import { characterEventData } from "./eventData";
import { clamp } from "./math";
import { addTaskComment } from "./narrative";
import { randomInt } from "./rng";
import type {
  RtCharacter,
  RtGameState,
  RtSubtask,
  RtTask,
} from "./types";
import type { WorkStageEventSink } from "./workStageTypes";

export interface QaPassResult {
  coverageGain: number;
  coverageComplete: boolean;
  discoveredBugs: number;
  triagedBugs: number;
  bugfixes: RtSubtask[];
}

export function completeQaSubtaskStage(
  state: RtGameState,
  task: RtTask,
  character: RtCharacter,
  subtask: RtSubtask,
  roleFit: number,
  offRole: boolean,
  emit: WorkStageEventSink,
): void {
  const qaResult = completeQaSubtaskPass(state, task, subtask, {
    offRole,
    roleFit,
    testSkill: character.skill.test,
  });
  emitQaDoneEvent(
    task,
    character,
    emit,
    qaResult.bugfixes.length,
    [
      subtask.importance,
      offRole ? "off-role" : "on-role",
      `qa +${qaResult.coverageGain}`,
      ...(qaResult.coverageComplete
        ? []
        : [`qa coverage ${task.testCoverage}/${RELEASE_QA_COVERAGE_THRESHOLD}`, "QA recheck required"]),
      ...(qaResult.discoveredBugs > 0 ? [`found +${qaResult.discoveredBugs}`] : []),
      ...(qaResult.triagedBugs > 0 ? [`bugs -${qaResult.triagedBugs}`] : ["bugs 0"]),
      ...(qaResult.bugfixes.length > 0 ? [`rework +${qaResult.bugfixes.length}`] : []),
      ...(task.bugs > 0 ? [`bugs left ${task.bugs}`] : []),
    ],
    {
      subtaskId: subtask.id,
      subtaskRole: subtask.role,
      subtaskImportance: subtask.importance,
      offRole,
      coverageGain: qaResult.coverageGain,
      coverageComplete: qaResult.coverageComplete,
      testCoverage: task.testCoverage,
      coverageThreshold: RELEASE_QA_COVERAGE_THRESHOLD,
      discoveredBugs: qaResult.discoveredBugs,
      triagedBugs: qaResult.triagedBugs,
      reworkCount: qaResult.bugfixes.length,
      bugs: task.bugs,
    },
  );
}

export function completeQaSubtaskPass(
  state: RtGameState,
  task: RtTask,
  subtask: RtSubtask,
  {
    offRole,
    roleFit,
    testSkill,
  }: {
    offRole: boolean;
    roleFit: number;
    testSkill: number;
  },
): QaPassResult {
  const coverageGain = Math.round(
    (WORK_QA_SUBTASK_COVERAGE_BASE +
      testSkill * WORK_QA_SUBTASK_SKILL_FACTOR +
      roleFit * WORK_QA_SUBTASK_ROLE_FACTOR +
      randomInt(state, 0, WORK_QA_SUBTASK_RANDOM_MAX)) *
      (offRole ? WORK_QA_OFF_ROLE_COVERAGE_FACTOR : 1),
  );
  task.testCoverage = clamp(task.testCoverage + coverageGain, 0, 100);
  task.changedAfterQa = false;
  const qaResult = applyQaResult(state, task, testSkill, roleFit);
  const coverageComplete = task.testCoverage >= RELEASE_QA_COVERAGE_THRESHOLD;
  if (coverageComplete) {
    subtask.done = true;
    subtask.progress = 100;
  } else {
    subtask.done = false;
    subtask.completedBy = null;
    subtask.progress = qaCoverageProgress(task.testCoverage);
  }
  task.currentSubtaskId = null;
  task.stageComplete = true;
  task.lastNote =
    qaResult.bugfixes.length > 0
      ? `QA converted ${qaResult.bugfixes.length} bug(s) into rework.`
      : coverageComplete
        ? "QA pass complete."
        : `QA coverage is partial (${task.testCoverage}/${RELEASE_QA_COVERAGE_THRESHOLD}). Assign QA again to clear release risk.`;
  if (qaResult.bugfixes.length > 0) {
    addTaskComment(state, task, "signal", "signal.bugs-to-rework", {
      count: String(qaResult.bugfixes.length),
    });
  } else if (!coverageComplete) {
    addTaskComment(state, task, "signal", "signal.partial-qa-coverage", {
      actual: String(task.testCoverage),
      target: String(RELEASE_QA_COVERAGE_THRESHOLD),
    });
  }
  return {
    coverageGain,
    coverageComplete,
    ...qaResult,
  };
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
  const qaResult = applyQaResult(state, task, character.skill.test, character.specialty.qa);
  const coverageComplete = task.testCoverage >= RELEASE_QA_COVERAGE_THRESHOLD;
  const qaSubtask = task.subtasks.find(
    (subtask) => subtask.revealed && !subtask.done && subtask.role === "qa",
  );
  if (qaSubtask) {
    if (coverageComplete) {
      qaSubtask.done = true;
      qaSubtask.progress = 100;
      qaSubtask.completedBy = character.id;
    } else {
      qaSubtask.done = false;
      qaSubtask.progress = qaCoverageProgress(task.testCoverage);
      qaSubtask.completedBy = null;
    }
  }
  task.currentSubtaskId = null;
  task.lastNote =
    qaResult.bugfixes.length > 0
      ? `QA converted ${qaResult.bugfixes.length} bug(s) into rework.`
      : coverageComplete
        ? "QA pass complete."
        : `QA coverage is partial (${task.testCoverage}/${RELEASE_QA_COVERAGE_THRESHOLD}). Assign QA again to clear release risk.`;
  if (qaResult.bugfixes.length > 0) {
    addTaskComment(state, task, "signal", "signal.bugs-to-rework", {
      count: String(qaResult.bugfixes.length),
    });
  } else if (!coverageComplete) {
    addTaskComment(state, task, "signal", "signal.partial-qa-coverage", {
      actual: String(task.testCoverage),
      target: String(RELEASE_QA_COVERAGE_THRESHOLD),
    });
  }
  emitQaDoneEvent(
    task,
    character,
    emit,
    qaResult.bugfixes.length,
    [
      `qa +${coverageGain}`,
      ...(coverageComplete
        ? []
        : [`qa coverage ${task.testCoverage}/${RELEASE_QA_COVERAGE_THRESHOLD}`, "QA recheck required"]),
      ...(qaResult.discoveredBugs > 0 ? [`found +${qaResult.discoveredBugs}`] : []),
      ...(qaResult.triagedBugs > 0 ? [`bugs -${qaResult.triagedBugs}`] : ["bugs 0"]),
      ...(qaResult.bugfixes.length > 0 ? [`rework +${qaResult.bugfixes.length}`] : []),
      ...(task.bugs > 0 ? [`bugs left ${task.bugs}`] : []),
    ],
    {
      subtaskId: qaSubtask?.id ?? null,
      subtaskRole: qaSubtask?.role ?? "qa",
      subtaskImportance: qaSubtask?.importance ?? null,
      coverageGain,
      coverageComplete,
      testCoverage: task.testCoverage,
      coverageThreshold: RELEASE_QA_COVERAGE_THRESHOLD,
      discoveredBugs: qaResult.discoveredBugs,
      triagedBugs: qaResult.triagedBugs,
      reworkCount: qaResult.bugfixes.length,
      bugs: task.bugs,
    },
  );
}

function applyQaResult(
  state: RtGameState,
  task: RtTask,
  testSkill: number,
  roleFit: number,
) {
  const discoveredBugs = discoverBugsDuringQa(state, task);
  task.bugs += discoveredBugs;
  const triagedBugs = Math.min(
    task.bugs,
    Math.max(
      WORK_QA_TRIAGE_MIN,
      Math.floor((testSkill + roleFit) / WORK_QA_TRIAGE_SKILL_DIVISOR) +
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
  data: Record<string, string | number | boolean | null>,
): void {
  const coverageComplete = data.coverageComplete !== false;
  emit({
    type: "qa_done",
    title: coverageComplete ? `${task.id} QA pass done` : `${task.id} QA coverage partial`,
    body:
      bugfixCount > 0
        ? `${character.name} triaged ${bugfixCount} bug(s) into rework.`
        : coverageComplete
          ? `${character.name} found no blocking bugs.`
          : `${character.name} added partial QA coverage.`,
    data: characterEventData(character, {
      taskId: task.id,
      ...data,
    }),
    effects,
  });
}

function qaCoverageProgress(testCoverage: number): number {
  return clamp(Math.round((testCoverage / RELEASE_QA_COVERAGE_THRESHOLD) * 100), 0, 95);
}
