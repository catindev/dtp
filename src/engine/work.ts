import {
  ANALYSIS_COMPLEXITY_STAMINA_DRAIN,
  ANALYSIS_PRESSURE_STAMINA_DRAIN,
  ANALYSIS_SPEED_MULTIPLIER,
  ANALYSIS_STAMINA_DRAIN_BASE,
  OFF_ROLE_STAMINA_DRAIN,
  WORK_ASSIGNMENT_CANCEL_PROGRESS_PENALTY,
  WORK_ASSIGNMENT_CANCEL_SHOCK_MINUTES,
  WORK_ASSIGNMENT_CANCEL_STAMINA_PENALTY,
  WORK_ASSIGNMENT_NON_PREFERRED_PENALTY,
  WORK_ASSIGNMENT_PROGRESS_PENALTY,
  WORK_ASSIGNMENT_ROLE_MATCH_BONUS,
  WORK_ASSIGNMENT_ROLE_SCORE_FACTOR,
  WORK_BASE_SPEED,
  WORK_BUGFIX_PREFERRED_SKILL_THRESHOLD,
  WORK_BURNOUT_DRAIN_BASE,
  WORK_BURNOUT_OFF_ROLE_DRAIN,
  WORK_BURNOUT_PRESSURE_DRAIN,
  WORK_CLARITY_FACTOR_BASE,
  WORK_CLARITY_FACTOR_DIVISOR,
  WORK_COMPLEXITY_STAMINA_DRAIN,
  WORK_COMPLEXITY_SPEED_FACTOR,
  WORK_LOW_STAMINA_BURNOUT_THRESHOLD,
  WORK_OFF_ROLE_SKILL_THRESHOLD,
  WORK_OFF_ROLE_SPEED_FACTOR,
  WORK_PREFERRED_STRONG_SKILL_DELTA,
  WORK_PREFERRED_STRONG_SKILL_THRESHOLD,
  WORK_PRESSURE_STAMINA_DRAIN,
  WORK_SHOCK_SPEED_FACTOR,
  WORK_SKILL_SPEED_FACTOR,
  WORK_SPEED_MULTIPLIER,
  WORK_STAMINA_FACTOR_BASE,
  WORK_STAMINA_FACTOR_DIVISOR,
  WORK_STAMINA_FACTOR_MAX,
  WORK_STAMINA_FACTOR_MIN,
  WORK_STAMINA_DRAIN_BASE,
} from "./balance";
import { getOpenTodoSubtasks, taskBusy } from "./board";
import { clamp } from "./math";
import type {
  RtAssignmentPlan,
  RtCharacter,
  RtEvent,
  RtGameState,
  RtRole,
  RtStage,
  RtSubtask,
  RtSubtaskRole,
  RtTask,
} from "./types";
import { completeStage } from "./workStages";
import { importanceWeight } from "./workRules";

type WorkEventSink = (event: Omit<RtEvent, "at">) => void;

type ActiveWorkContext = {
  subtask: RtSubtask | null;
  stage: RtStage;
  roleFit: number;
  offRole: boolean;
};

export function assignCharacterToTaskWork(
  state: RtGameState,
  characterId: string,
  taskId: string,
  emit: WorkEventSink,
): boolean {
  const plan = getAssignmentPlan(state, characterId, taskId);
  if (!plan) return false;
  const { character, task, subtask } = plan;

  character.assignedTaskId = task.id;
  task.assignedCharacterId = character.id;
  task.currentSubtaskId = subtask?.id ?? null;
  task.stageProgress = subtask?.progress ?? 0;
  task.stageComplete = false;
  task.lastNote = subtask
    ? `${character.name} is working on ${subtask.role}: ${subtask.title}.`
    : `${character.name} is clarifying the task.`;
  emit({
    type: "assigned",
    title: `${character.name} started ${task.id}`,
    body: subtask ? `${task.title}: ${subtask.title}.` : `${task.title}: analysis pass.`,
    effects: [
      subtask ? "task work" : "clarity work",
      ...(subtask ? [`subtask ${subtask.role}`, subtask.importance] : []),
    ],
  });
  return true;
}

export function canAssignCharacterToTaskWork(
  state: RtGameState,
  characterId: string,
  taskId: string,
): boolean {
  return Boolean(getAssignmentPlan(state, characterId, taskId));
}

export function cancelTaskWorkInternal(
  state: RtGameState,
  taskId: string,
  emit: WorkEventSink,
): boolean {
  const task = state.tasks[taskId];
  if (!task?.assignedCharacterId) return false;
  const character = state.characters[task.assignedCharacterId];
  const subtask = task.currentSubtaskId
    ? task.subtasks.find((candidate) => candidate.id === task.currentSubtaskId)
    : null;
  task.assignedCharacterId = null;
  task.stageProgress = Math.max(0, task.stageProgress - WORK_ASSIGNMENT_CANCEL_PROGRESS_PENALTY);
  if (subtask) subtask.progress = task.stageProgress;
  task.currentSubtaskId = null;
  task.stageComplete = false;
  task.lastNote = "Work was interrupted.";

  if (character) {
    character.assignedTaskId = null;
    character.stamina = clamp(
      character.stamina - WORK_ASSIGNMENT_CANCEL_STAMINA_PENALTY,
      0,
      100,
    );
    character.shockGameMinutes = Math.max(
      character.shockGameMinutes,
      WORK_ASSIGNMENT_CANCEL_SHOCK_MINUTES,
    );
    emit({
      type: "cancelled",
      title: `${task.id} interrupted`,
      body: `${character.name} was pulled off the task.`,
      effects: [
        `stamina -${WORK_ASSIGNMENT_CANCEL_STAMINA_PENALTY}`,
        `context shock ${WORK_ASSIGNMENT_CANCEL_SHOCK_MINUTES}m`,
        `stage progress -${WORK_ASSIGNMENT_CANCEL_PROGRESS_PENALTY}`,
      ],
    });
  }
  return true;
}

export function updateAssignments(
  state: RtGameState,
  tickMs: number,
  emit: WorkEventSink,
): void {
  const tickSeconds = tickMs / 1000;
  for (const task of Object.values(state.tasks)) {
    if (!task.assignedCharacterId || task.column !== "inProgress") continue;
    const character = state.characters[task.assignedCharacterId];
    if (!character) {
      task.assignedCharacterId = null;
      continue;
    }

    const context = getActiveWorkContext(task, character);
    task.stageProgress = advanceTaskProgress(state, task, character, context, tickSeconds);
    character.stamina = drainCharacterStamina(task, character, context, tickSeconds);
    if (context.subtask) context.subtask.progress = task.stageProgress;
    applyLowStaminaBurnout(task, character, context, tickSeconds);

    if (task.stageProgress >= 100) {
      completeStage(state, task, character, context.stage, emit);
    } else if (character.stamina <= 0) {
      exhaustCharacterForDay(state, task, character, emit);
    }
  }
}

function getActiveWorkContext(task: RtTask, character: RtCharacter): ActiveWorkContext {
  const subtask = task.currentSubtaskId
    ? task.subtasks.find((candidate) => candidate.id === task.currentSubtaskId) ?? null
    : null;
  const stage: RtStage = subtask ? "todo" : "analysis";
  const roleFit = subtask ? character.specialty[subtask.role] : character.skill[stage];
  const offRole = Boolean(subtask && roleFit < WORK_OFF_ROLE_SKILL_THRESHOLD);
  return { subtask, stage, roleFit, offRole };
}

function advanceTaskProgress(
  state: RtGameState,
  task: RtTask,
  character: RtCharacter,
  context: ActiveWorkContext,
  tickSeconds: number,
): number {
  const speed = calculateWorkSpeed(state, task, character, context);
  return clamp(
    task.stageProgress + (speed * tickSeconds) / (1 + task.complexity * WORK_COMPLEXITY_SPEED_FACTOR),
    0,
    100,
  );
}

function calculateWorkSpeed(
  state: RtGameState,
  task: RtTask,
  character: RtCharacter,
  { stage, roleFit, offRole }: ActiveWorkContext,
): number {
  const clarityFactor =
    stage === "todo" ? WORK_CLARITY_FACTOR_BASE + task.clarity / WORK_CLARITY_FACTOR_DIVISOR : 1;
  const staminaFactor = clamp(
    WORK_STAMINA_FACTOR_BASE + character.stamina / WORK_STAMINA_FACTOR_DIVISOR,
    WORK_STAMINA_FACTOR_MIN,
    WORK_STAMINA_FACTOR_MAX,
  );
  const shockFactor = character.shockGameMinutes > 0 ? WORK_SHOCK_SPEED_FACTOR : 1;
  const offRoleFactor = offRole ? WORK_OFF_ROLE_SPEED_FACTOR : 1;
  const boostFactor = 1 + state.resources.processBoost / 100;
  const paceFactor = stage === "analysis" ? ANALYSIS_SPEED_MULTIPLIER : WORK_SPEED_MULTIPLIER;
  return (
    (WORK_BASE_SPEED + (stage === "todo" ? roleFit : character.skill[stage]) * WORK_SKILL_SPEED_FACTOR) *
    clarityFactor *
    staminaFactor *
    shockFactor *
    offRoleFactor *
    boostFactor *
    paceFactor
  );
}

function drainCharacterStamina(
  task: RtTask,
  character: RtCharacter,
  context: ActiveWorkContext,
  tickSeconds: number,
): number {
  return clamp(character.stamina - tickSeconds * calculateStaminaDrainPerSecond(task, context), 0, 100);
}

function calculateStaminaDrainPerSecond(
  task: RtTask,
  { stage, offRole }: ActiveWorkContext,
): number {
  if (stage === "analysis") {
    return (
      ANALYSIS_STAMINA_DRAIN_BASE +
      task.pressure * ANALYSIS_PRESSURE_STAMINA_DRAIN +
      task.complexity * ANALYSIS_COMPLEXITY_STAMINA_DRAIN
    );
  }
  return (
    WORK_STAMINA_DRAIN_BASE +
    task.pressure * WORK_PRESSURE_STAMINA_DRAIN +
    task.complexity * WORK_COMPLEXITY_STAMINA_DRAIN +
    (offRole ? OFF_ROLE_STAMINA_DRAIN : 0)
  );
}

function applyLowStaminaBurnout(
  task: RtTask,
  character: RtCharacter,
  { offRole }: ActiveWorkContext,
  tickSeconds: number,
): void {
  if (character.stamina >= WORK_LOW_STAMINA_BURNOUT_THRESHOLD) return;
  character.burnout = clamp(
    character.burnout +
      tickSeconds *
        (WORK_BURNOUT_DRAIN_BASE +
          task.pressure * WORK_BURNOUT_PRESSURE_DRAIN +
          (offRole ? WORK_BURNOUT_OFF_ROLE_DRAIN : 0)),
    0,
    100,
  );
}

function getAssignmentPlan(
  state: RtGameState,
  characterId: string,
  taskId: string,
): RtAssignmentPlan | null {
  const character = state.characters[characterId];
  const task = state.tasks[taskId];
  if (!character || !task) return null;
  if (character.assignedTaskId || character.exhaustedToday || taskBusy(task)) return null;
  if (task.column !== "inProgress" || task.released) return null;

  const subtask = chooseSubtaskForAssignment(task, character);
  const willAnalyze = !subtask && shouldAnalyzeTask(task, character);
  if (!subtask && !willAnalyze) return null;

  return { character, task, subtask, willAnalyze };
}

function exhaustCharacterForDay(
  state: RtGameState,
  task: RtTask,
  character: RtCharacter,
  emit: WorkEventSink,
): void {
  character.exhaustedToday = true;
  character.assignedTaskId = null;
  task.assignedCharacterId = null;
  task.stageComplete = false;
  task.lastNote = `${character.name} is exhausted and cannot continue today.`;
  emit({
    type: "character_exhausted",
    title: `${character.name} exhausted`,
    body: `${character.name} hit zero stamina while working on ${task.title}.`,
    effects: ["blocked until tomorrow", `task ${task.id}`],
  });
}

function chooseSubtaskForAssignment(task: RtTask, character: RtCharacter): RtSubtask | null {
  if (task.column !== "inProgress") return null;
  if (character.role === "analyst" && shouldAnalyzeTask(task, character)) return null;

  const preferredRoles = preferredSubtaskRoles(character);
  const openSubtasks = getOpenTodoSubtasks(task);
  const preferred = openSubtasks.filter((subtask) => preferredRoles.includes(subtask.role));
  const open =
    preferred.length > 0
      ? preferred
      : openSubtasks.filter((subtask) => canTakeOffRoleSubtask(character, subtask));
  if (open.length === 0) return null;
  return open
    .map((subtask) => ({
      subtask,
      score:
        character.specialty[subtask.role] * WORK_ASSIGNMENT_ROLE_SCORE_FACTOR +
        importanceWeight(subtask.importance) +
        (roleMatchesSubtask(character.role, subtask.role) ? WORK_ASSIGNMENT_ROLE_MATCH_BONUS : 0) -
        (preferredRoles.includes(subtask.role) ? 0 : WORK_ASSIGNMENT_NON_PREFERRED_PENALTY) -
        subtask.progress * WORK_ASSIGNMENT_PROGRESS_PENALTY,
    }))
    .sort((a, b) => b.score - a.score)[0].subtask;
}

function canTakeOffRoleSubtask(character: RtCharacter, subtask: RtSubtask): boolean {
  if (subtask.role === "bugfix") return character.specialty.bugfix > 0;
  return character.specialty[subtask.role] > 0;
}

function shouldAnalyzeTask(task: RtTask, character: RtCharacter): boolean {
  if (task.column !== "inProgress" || task.released) return false;
  if (character.role !== "analyst") return false;
  const hiddenOpen = task.subtasks.some((subtask) => !subtask.revealed && !subtask.done);
  return hiddenOpen || task.clarity < 100;
}

function preferredSubtaskRoles(character: RtCharacter): RtSubtaskRole[] {
  const entries = Object.entries(character.specialty) as Array<[RtSubtaskRole, number]>;
  const maxSkill = Math.max(...entries.map(([, skill]) => skill));
  const strongSkill =
    maxSkill >= WORK_PREFERRED_STRONG_SKILL_THRESHOLD
      ? maxSkill - WORK_PREFERRED_STRONG_SKILL_DELTA
      : maxSkill;
  const roles = entries.filter(([, skill]) => skill >= strongSkill).map(([role]) => role);
  if (character.specialty.bugfix >= WORK_BUGFIX_PREFERRED_SKILL_THRESHOLD && !roles.includes("bugfix")) {
    roles.push("bugfix");
  }
  return roles;
}

function roleMatchesSubtask(role: RtRole, subtaskRole: RtSubtaskRole): boolean {
  if (role === subtaskRole) return true;
  if (role === "designer" && subtaskRole === "design") return true;
  if ((role === "backend" || role === "frontend" || role === "sre") && subtaskRole === "bugfix") {
    return true;
  }
  return false;
}
