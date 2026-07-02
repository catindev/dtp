import { WORK_OFF_ROLE_SKILL_THRESHOLD } from "./balance";
import type {
  RtCharacter,
  RtGameState,
  RtStage,
  RtTask,
} from "./types";
import { completeAnalysisStage } from "./workAnalysisStage";
import { completeImplementationSubtaskStage } from "./workImplementationStage";
import {
  completeQaSubtaskStage,
  completeTestStage,
} from "./workQaStage";
import type { WorkStageEventSink } from "./workStageTypes";
import { completeAssignedSubtask } from "./workSubtaskProgress";

export function completeStage(
  state: RtGameState,
  task: RtTask,
  character: RtCharacter,
  stage: RtStage,
  emit: WorkStageEventSink,
): void {
  task.stageProgress = 100;
  task.stageComplete = true;
  task.assignedCharacterId = null;
  character.assignedTaskId = null;

  if (stage === "analysis") {
    completeAnalysisStage(state, task, character, emit);
    return;
  }

  if (stage === "todo") {
    completeTodoStage(state, task, character, emit);
    return;
  }

  completeTestStage(state, task, character, emit);
}

function completeTodoStage(
  state: RtGameState,
  task: RtTask,
  character: RtCharacter,
  emit: WorkStageEventSink,
): void {
  const subtask = task.currentSubtaskId
    ? task.subtasks.find((candidate) => candidate.id === task.currentSubtaskId)
    : null;
  if (!subtask) return;

  const roleFit = character.specialty[subtask.role];
  const offRole = roleFit < WORK_OFF_ROLE_SKILL_THRESHOLD;
  completeAssignedSubtask(task, character, subtask, offRole);

  if (subtask.role === "qa") {
    completeQaSubtaskStage(state, task, character, subtask, roleFit, offRole, emit);
    return;
  }

  completeImplementationSubtaskStage(state, task, character, subtask, roleFit, offRole, emit);
}
