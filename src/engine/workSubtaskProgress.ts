import {
  WORK_OFF_ROLE_CRITICAL_PENALTY,
  WORK_OFF_ROLE_DEFAULT_PENALTY,
  WORK_OFF_ROLE_STAMINA_PENALTY,
  WORK_SUBTASK_SPECIALTY_GAIN,
  WORK_SUBTASK_SPECIALTY_MAX,
  WORK_SUBTASK_XP_OFF_ROLE,
  WORK_SUBTASK_XP_ON_ROLE,
  WORK_SUBTASK_XP_TO_SPECIALTY,
} from "./balance";
import { clamp } from "./math";
import type {
  RtCharacter,
  RtSubtask,
  RtTask,
} from "./types";
import { addPostmortemNote } from "./workRules";

export function completeAssignedSubtask(
  task: RtTask,
  character: RtCharacter,
  subtask: RtSubtask,
  offRole: boolean,
): void {
  subtask.done = true;
  subtask.completedBy = character.id;
  subtask.offRole = offRole;
  subtask.progress = 100;
  applySubtaskExperience(character, subtask, offRole);
  if (offRole) {
    applyOffRoleSubtaskPenalty(task, character, subtask);
  }
}

function applySubtaskExperience(
  character: RtCharacter,
  subtask: RtSubtask,
  offRole: boolean,
): void {
  character.xp[subtask.role] += offRole ? WORK_SUBTASK_XP_OFF_ROLE : WORK_SUBTASK_XP_ON_ROLE;
  if (
    character.xp[subtask.role] < WORK_SUBTASK_XP_TO_SPECIALTY ||
    character.specialty[subtask.role] >= WORK_SUBTASK_SPECIALTY_MAX
  ) {
    return;
  }
  character.xp[subtask.role] -= WORK_SUBTASK_XP_TO_SPECIALTY;
  character.specialty[subtask.role] += WORK_SUBTASK_SPECIALTY_GAIN;
}

function applyOffRoleSubtaskPenalty(
  task: RtTask,
  character: RtCharacter,
  subtask: RtSubtask,
): void {
  task.offRolePenalty +=
    subtask.importance === "critical" ? WORK_OFF_ROLE_CRITICAL_PENALTY : WORK_OFF_ROLE_DEFAULT_PENALTY;
  character.stamina = clamp(character.stamina - WORK_OFF_ROLE_STAMINA_PENALTY, 0, 100);
  addPostmortemNote(task, `${character.name} completed ${subtask.role} work off-role.`);
}
