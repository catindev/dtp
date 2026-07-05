import {
  WORK_BUGFIX_DEFAULT_FIX_COUNT,
  WORK_BUGFIX_MULTI_FIX_CHANCE,
  WORK_BUGFIX_MULTI_FIX_COUNT,
  WORK_BUGFIX_MULTI_FIX_ROLE_THRESHOLD,
  WORK_BUGFIX_QUALITY_BASE,
  WORK_BUGFIX_QUALITY_ROLE_FACTOR,
  WORK_CHANGED_AFTER_QA_COVERAGE_CAP,
  WORK_IMPLEMENTATION_MIN_QUALITY_GAIN,
  WORK_IMPLEMENTATION_QUALITY_CRITICAL,
  WORK_IMPLEMENTATION_QUALITY_GAIN_DIVISOR,
  WORK_IMPLEMENTATION_QUALITY_IMPORTANT,
  WORK_IMPLEMENTATION_QUALITY_OPTIONAL,
  WORK_RAW_QUALITY_CLARITY_FACTOR,
  WORK_RAW_QUALITY_OFF_ROLE_PENALTY,
  WORK_RAW_QUALITY_RANDOM_MAX,
  WORK_RAW_QUALITY_RANDOM_MIN,
  WORK_RAW_QUALITY_ROLE_FACTOR,
  WORK_RAW_QUALITY_STAMINA_PENALTY,
} from "./balance";
import {
  ensureQaRecheckSubtask,
  introduceImplementationBugs,
  isBugfixWork,
} from "./bugs";
import { characterEventData } from "./eventData";
import { clamp } from "./math";
import { addTaskComment } from "./narrative";
import {
  chance,
  randomInt,
} from "./rng";
import type {
  RtCharacter,
  RtGameState,
  RtSubtask,
  RtTask,
} from "./types";
import { addPostmortemNote } from "./workRules";
import type { WorkStageEventSink } from "./workStageTypes";

export function completeImplementationSubtaskStage(
  state: RtGameState,
  task: RtTask,
  character: RtCharacter,
  subtask: RtSubtask,
  roleFit: number,
  offRole: boolean,
  emit: WorkStageEventSink,
): void {
  const importanceQuality =
    subtask.importance === "critical"
      ? WORK_IMPLEMENTATION_QUALITY_CRITICAL
      : subtask.importance === "important"
        ? WORK_IMPLEMENTATION_QUALITY_IMPORTANT
        : WORK_IMPLEMENTATION_QUALITY_OPTIONAL;
  if (task.testCoverage > 0) {
    task.changedAfterQa = true;
    task.testCoverage = Math.min(task.testCoverage, WORK_CHANGED_AFTER_QA_COVERAGE_CAP);
    ensureQaRecheckSubtask(task);
    addPostmortemNote(
      task,
      "Implementation changed after QA, so prior test coverage became stale.",
    );
    addTaskComment(state, task, "signal", "signal.changed-after-qa");
  }
  const rawQuality =
    task.clarity * WORK_RAW_QUALITY_CLARITY_FACTOR +
    roleFit * WORK_RAW_QUALITY_ROLE_FACTOR +
    importanceQuality +
    randomInt(state, WORK_RAW_QUALITY_RANDOM_MIN, WORK_RAW_QUALITY_RANDOM_MAX) -
    (100 - character.stamina) * WORK_RAW_QUALITY_STAMINA_PENALTY -
    (offRole ? WORK_RAW_QUALITY_OFF_ROLE_PENALTY : 0);
  const bugfixWork = isBugfixWork(subtask);
  const qualityGain = bugfixWork
    ? WORK_BUGFIX_QUALITY_BASE + roleFit * WORK_BUGFIX_QUALITY_ROLE_FACTOR
    : Math.max(
        WORK_IMPLEMENTATION_MIN_QUALITY_GAIN,
        Math.round(rawQuality / WORK_IMPLEMENTATION_QUALITY_GAIN_DIVISOR),
      );
  task.quality = clamp(Math.max(task.quality, Math.round(rawQuality)), 0, 100);
  let introducedBugs = 0;
  if (bugfixWork) {
    const fixed = Math.min(
      task.bugs,
      roleFit >= WORK_BUGFIX_MULTI_FIX_ROLE_THRESHOLD && chance(state, WORK_BUGFIX_MULTI_FIX_CHANCE)
        ? WORK_BUGFIX_MULTI_FIX_COUNT
        : WORK_BUGFIX_DEFAULT_FIX_COUNT,
    );
    task.bugs = Math.max(0, task.bugs - fixed);
    task.quality = clamp(task.quality + qualityGain, 0, 100);
  } else {
    introducedBugs = introduceImplementationBugs(
      state,
      task,
      character,
      subtask,
      roleFit,
      offRole,
      rawQuality,
    );
  }
  task.workDone = task.subtasks.some((candidate) => candidate.done && candidate.role !== "qa");
  task.currentSubtaskId = null;
  task.stageComplete = true;
  task.lastNote =
    introducedBugs > 0
      ? `${subtask.role} subtask complete. ${introducedBugs} bug(s) appeared.`
      : `${subtask.role} subtask complete.`;
  emit({
    type: bugfixWork ? "bugfix_done" : "subtask_done",
    title: `${task.id} ${subtask.role} done`,
    body: `${character.name} completed ${subtask.title}.`,
    data: characterEventData(character, {
      taskId: task.id,
      subtaskId: subtask.id,
      subtaskRole: subtask.role,
      subtaskImportance: subtask.importance,
      offRole,
      quality: task.quality,
      bugs: task.bugs,
      introducedBugs,
    }),
    effects: [
      subtask.importance,
      offRole ? "off-role" : "on-role",
      `quality ${task.quality}`,
      `bugs ${task.bugs}`,
      ...(introducedBugs > 0 ? [`bugs +${introducedBugs}`] : []),
      ...(task.changedAfterQa ? ["QA recheck required"] : []),
    ],
  });
}
