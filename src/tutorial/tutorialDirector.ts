import { generateTask } from "../engine/taskFactory";
import { formatGameTime } from "../engine/time";
import { RELEASE_TRAIN_GAME_MINUTE } from "../engine/balance";
import type {
  RtCharacter,
  RtColumn,
  RtEvent,
  RtGameState,
  RtTask,
  RtTutorialState,
} from "../engine/types";
import { createInitialTutorialState } from "./tutorialState";

type TutorialEventSink = (event: Omit<RtEvent, "at">) => void;

export const TUTORIAL_STAGE_TEAM_BASICS = "team-basics";
export const TUTORIAL_STEP_MOVE_TASK = "move-task-to-work";
export const TUTORIAL_STEP_ASSIGN_QA = "assign-qa";
export const TUTORIAL_STEP_WAIT_WORK = "wait-task-complete";
export const TUTORIAL_STEP_MOVE_DONE = "move-task-to-done";
export const TUTORIAL_STEP_STAGE_COMPLETE = "stage-1-complete";
export const TUTORIAL_STAGE_MULTI_WORK = "multi-work";
export const TUTORIAL_STEP_MOVE_MULTI_TASK = "move-multi-task";
export const TUTORIAL_STEP_ASSIGN_BACKEND = "assign-backend";
export const TUTORIAL_STEP_WAIT_BACKEND = "wait-backend";
export const TUTORIAL_STEP_ASSIGN_FRONTEND = "assign-frontend";
export const TUTORIAL_STEP_WAIT_FRONTEND = "wait-frontend";
export const TUTORIAL_STEP_ASSIGN_QA_MULTI = "assign-qa-multi";
export const TUTORIAL_STEP_WAIT_QA_MULTI = "wait-qa-multi";
export const TUTORIAL_STEP_MOVE_MULTI_DONE = "move-multi-done";
export const TUTORIAL_STAGE_COMPROMISE = "compromise";
export const TUTORIAL_STEP_MOVE_COMPROMISE_TASK = "move-compromise-task";
export const TUTORIAL_STEP_ASSIGN_BACKEND_COMPROMISE = "assign-backend-compromise";
export const TUTORIAL_STEP_WAIT_COMPROMISE_WORK = "wait-compromise-work";
export const TUTORIAL_STEP_MOVE_RISKY_DONE = "move-risky-done";
export const TUTORIAL_STAGE_DEADLINE = "deadline-choice";
export const TUTORIAL_STEP_MOVE_DEADLINE_TASK = "move-deadline-task";
export const TUTORIAL_STEP_ASSIGN_SRE_DEADLINE = "assign-sre-deadline";
export const TUTORIAL_STEP_WAIT_DEADLINE_WORK = "wait-deadline-work";
export const TUTORIAL_STEP_CHOOSE_DEADLINE = "choose-deadline-outcome";
export const TUTORIAL_STAGE_DAY_END = "day-end";
export const TUTORIAL_STEP_WAIT_DAY_END = "wait-day-end";
export const TUTORIAL_STEP_REPORT_READY = "report-ready";

const STAGE1_SPAWN_TIMER = "teamBasics.spawnDelayMs";
const STAGE1_SPAWN_DELAY_MS = 2000;
const DEADLINE_CHOICE_WAIT_TIMER = "deadlineChoice.waitMs";
const DEADLINE_CHOICE_WAIT_MS = 2500;

export interface TutorialGateResult {
  allowed: boolean;
  reason: string;
}

export function updateTutorialDirector(
  state: RtGameState,
  tickMs: number,
  emit: TutorialEventSink,
): void {
  const tutorial = getTutorialState(state);
  if (!tutorial || tutorial.completed) return;

  ensureTutorialSteps(tutorial);

  if (!tutorial.focusTaskId && tutorial.stageId === TUTORIAL_STAGE_TEAM_BASICS) {
    tutorial.timers[STAGE1_SPAWN_TIMER] = (tutorial.timers[STAGE1_SPAWN_TIMER] ?? 0) + tickMs;
    if (tutorial.timers[STAGE1_SPAWN_TIMER] >= STAGE1_SPAWN_DELAY_MS) {
      spawnTutorialTask(state, createStageOneTask(state), emit);
    }
    return;
  }

  const task = tutorial.focusTaskId ? state.tasks[tutorial.focusTaskId] : null;
  if (!task) return;

  if (tutorial.stepId === TUTORIAL_STEP_WAIT_WORK && task.stageComplete && taskIsIdle(task)) {
    completeTutorialStep(state, TUTORIAL_STEP_WAIT_WORK, null, emit);
    tutorial.stepId = TUTORIAL_STEP_MOVE_DONE;
  } else if (tutorial.stepId === TUTORIAL_STEP_WAIT_BACKEND && subtaskDone(task, "backend") && taskIsIdle(task)) {
    completeTutorialStep(state, TUTORIAL_STEP_WAIT_BACKEND, null, emit);
    tutorial.stepId = TUTORIAL_STEP_ASSIGN_FRONTEND;
  } else if (tutorial.stepId === TUTORIAL_STEP_WAIT_FRONTEND && subtaskDone(task, "frontend") && taskIsIdle(task)) {
    completeTutorialStep(state, TUTORIAL_STEP_WAIT_FRONTEND, null, emit);
    tutorial.stepId = TUTORIAL_STEP_ASSIGN_QA_MULTI;
  } else if (tutorial.stepId === TUTORIAL_STEP_WAIT_QA_MULTI && subtaskDone(task, "qa") && taskIsIdle(task)) {
    completeTutorialStep(state, TUTORIAL_STEP_WAIT_QA_MULTI, null, emit);
    tutorial.stepId = TUTORIAL_STEP_MOVE_MULTI_DONE;
  } else if (tutorial.stepId === TUTORIAL_STEP_WAIT_COMPROMISE_WORK && subtaskDone(task, "backend") && taskIsIdle(task)) {
    completeTutorialStep(state, TUTORIAL_STEP_WAIT_COMPROMISE_WORK, null, emit);
    tutorial.stepId = TUTORIAL_STEP_MOVE_RISKY_DONE;
  } else if (tutorial.stepId === TUTORIAL_STEP_WAIT_DEADLINE_WORK && subtaskDone(task, "sre") && taskIsIdle(task)) {
    task.deadlineMs = 0;
    task.overdueMs = Math.max(task.overdueMs, 90000);
    completeTutorialStep(state, TUTORIAL_STEP_WAIT_DEADLINE_WORK, null, emit);
    tutorial.stepId = TUTORIAL_STEP_CHOOSE_DEADLINE;
  } else if (tutorial.stepId === TUTORIAL_STEP_CHOOSE_DEADLINE) {
    tutorial.timers[DEADLINE_CHOICE_WAIT_TIMER] = (tutorial.timers[DEADLINE_CHOICE_WAIT_TIMER] ?? 0) + tickMs;
    if (tutorial.timers[DEADLINE_CHOICE_WAIT_TIMER] >= DEADLINE_CHOICE_WAIT_MS) {
      completeTutorialStep(state, TUTORIAL_STEP_CHOOSE_DEADLINE, "wait_missed", emit);
      startTutorialStage(state, TUTORIAL_STAGE_DAY_END, emit);
    }
  }
}

export function advanceTutorialForTaskMove(
  state: RtGameState,
  taskId: string,
  toColumn: RtColumn,
  emit?: TutorialEventSink,
): void {
  const tutorial = getTutorialState(state);
  if (!tutorial || tutorial.focusTaskId !== taskId) return;

  if (tutorial.stepId === TUTORIAL_STEP_MOVE_TASK && toColumn === "inProgress") {
    completeTutorialStep(state, TUTORIAL_STEP_MOVE_TASK, null, emit);
    tutorial.stepId = TUTORIAL_STEP_ASSIGN_QA;
    return;
  }

  if (tutorial.stepId === TUTORIAL_STEP_MOVE_DONE && toColumn === "done") {
    completeTutorialStep(state, TUTORIAL_STEP_MOVE_DONE, null, emit);
    startTutorialStage(state, TUTORIAL_STAGE_MULTI_WORK, emit);
    return;
  }

  if (tutorial.stepId === TUTORIAL_STEP_MOVE_MULTI_TASK && toColumn === "inProgress") {
    completeTutorialStep(state, TUTORIAL_STEP_MOVE_MULTI_TASK, null, emit);
    tutorial.stepId = TUTORIAL_STEP_ASSIGN_BACKEND;
    return;
  }

  if (tutorial.stepId === TUTORIAL_STEP_MOVE_MULTI_DONE && toColumn === "done") {
    completeTutorialStep(state, TUTORIAL_STEP_MOVE_MULTI_DONE, null, emit);
    startTutorialStage(state, TUTORIAL_STAGE_COMPROMISE, emit);
    return;
  }

  if (tutorial.stepId === TUTORIAL_STEP_MOVE_COMPROMISE_TASK && toColumn === "inProgress") {
    completeTutorialStep(state, TUTORIAL_STEP_MOVE_COMPROMISE_TASK, null, emit);
    tutorial.stepId = TUTORIAL_STEP_ASSIGN_BACKEND_COMPROMISE;
    return;
  }

  if (tutorial.stepId === TUTORIAL_STEP_MOVE_RISKY_DONE && toColumn === "done") {
    completeTutorialStep(state, TUTORIAL_STEP_MOVE_RISKY_DONE, "ship_without_qa", emit);
    startTutorialStage(state, TUTORIAL_STAGE_DEADLINE, emit);
    return;
  }

  if (tutorial.stepId === TUTORIAL_STEP_MOVE_DEADLINE_TASK && toColumn === "inProgress") {
    completeTutorialStep(state, TUTORIAL_STEP_MOVE_DEADLINE_TASK, null, emit);
    tutorial.stepId = TUTORIAL_STEP_ASSIGN_SRE_DEADLINE;
    return;
  }

  if (tutorial.stepId === TUTORIAL_STEP_CHOOSE_DEADLINE && toColumn === "done") {
    completeTutorialStep(state, TUTORIAL_STEP_CHOOSE_DEADLINE, "ship_late", emit);
    startTutorialStage(state, TUTORIAL_STAGE_DAY_END, emit);
  }
}

export function advanceTutorialForCharacterAssignment(
  state: RtGameState,
  characterId: string,
  taskId: string,
  emit?: TutorialEventSink,
): void {
  const tutorial = getTutorialState(state);
  if (!tutorial || tutorial.focusTaskId !== taskId) return;
  const character = state.characters[characterId];
  const expectedRole = expectedCharacterRoleForStep(tutorial.stepId);
  if (!expectedRole || character?.role !== expectedRole) return;

  tutorial.focusCharacterId = characterId;
  completeTutorialStep(state, tutorial.stepId, null, emit);
  tutorial.stepId = nextWaitStepAfterAssignment(tutorial.stepId);
}

export function canBeginTutorialTaskDrag(state: RtGameState, taskId: string): TutorialGateResult {
  const tutorial = getTutorialState(state);
  if (!tutorial) return { allowed: true, reason: "campaign" };
  if (
    tutorial.focusTaskId === taskId &&
    (expectedTaskDropColumnForStep(tutorial.stepId) !== null)
  ) {
    return { allowed: true, reason: "current_step" };
  }
  return { allowed: false, reason: tutorial.stepId };
}

export function canBeginTutorialCharacterDrag(
  state: RtGameState,
  characterId: string,
): TutorialGateResult {
  const tutorial = getTutorialState(state);
  if (!tutorial) return { allowed: true, reason: "campaign" };
  const character = state.characters[characterId];
  const expectedRole = expectedCharacterRoleForStep(tutorial.stepId);
  if (expectedRole && character?.role === expectedRole) {
    return { allowed: true, reason: "current_step" };
  }
  return { allowed: false, reason: tutorial.stepId };
}

export function canBeginTutorialOutsourceDrag(state: RtGameState): TutorialGateResult {
  const tutorial = getTutorialState(state);
  if (!tutorial) return { allowed: true, reason: "campaign" };
  return { allowed: false, reason: tutorial.stepId };
}

export function canDropTutorialTask(
  state: RtGameState,
  taskId: string,
  column: RtColumn,
): TutorialGateResult {
  const tutorial = getTutorialState(state);
  if (!tutorial) return { allowed: true, reason: "campaign" };
  const expectedColumn = expectedTaskDropColumnForStep(tutorial.stepId);
  if (tutorial.focusTaskId !== taskId) return { allowed: false, reason: "wrong_task" };
  if (expectedColumn === column) {
    return { allowed: true, reason: "current_step" };
  }
  return { allowed: false, reason: tutorial.stepId };
}

export function canDropTutorialCharacter(
  state: RtGameState,
  characterId: string,
  taskId: string,
): TutorialGateResult {
  const tutorial = getTutorialState(state);
  if (!tutorial) return { allowed: true, reason: "campaign" };
  const character = state.characters[characterId];
  const expectedRole = expectedCharacterRoleForStep(tutorial.stepId);
  if (expectedRole && tutorial.focusTaskId === taskId && character?.role === expectedRole) {
    return { allowed: true, reason: "current_step" };
  }
  return { allowed: false, reason: tutorial.stepId };
}

export function canDropTutorialOutsource(state: RtGameState): TutorialGateResult {
  const tutorial = getTutorialState(state);
  if (!tutorial) return { allowed: true, reason: "campaign" };
  return { allowed: false, reason: tutorial.stepId };
}

export function tutorialFocusTaskId(state: RtGameState): string | null {
  return getTutorialState(state)?.focusTaskId ?? null;
}

export function tutorialAllowsReleaseTrain(state: RtGameState): boolean {
  return getTutorialState(state)?.stepId === TUTORIAL_STEP_WAIT_DAY_END;
}

export function completeTutorialAfterMorningReport(state: RtGameState): void {
  const tutorial = getTutorialState(state);
  if (!tutorial) return;
  tutorial.completed = true;
  tutorial.stepId = TUTORIAL_STEP_REPORT_READY;
  if (!tutorial.completedStepIds.includes(TUTORIAL_STEP_WAIT_DAY_END)) {
    tutorial.completedStepIds.push(TUTORIAL_STEP_WAIT_DAY_END);
  }
  emitTutorialEvent(state, {
    type: "tutorial_completed",
    title: "Tutorial completed",
    body: "The guided tutorial reached the morning report.",
    effects: ["start normal campaign next"],
    data: {
      stageId: tutorial.stageId,
      stepId: tutorial.stepId,
      branchId: tutorial.activeBranchId,
      taskId: tutorial.focusTaskId,
      characterId: tutorial.focusCharacterId,
    },
  });
}

function getTutorialState(state: RtGameState): RtTutorialState | null {
  if (state.runMode !== "tutorial") return null;
  if (!state.tutorial) {
    state.tutorial = createInitialTutorialState();
  }
  ensureTutorialSteps(state.tutorial);
  return state.tutorial;
}

function ensureTutorialSteps(tutorial: RtTutorialState): void {
  if (tutorial.steps.length > 0) return;
  if (tutorial.stageId === TUTORIAL_STAGE_TEAM_BASICS) {
    tutorial.steps = buildSteps(tutorial, [
      TUTORIAL_STEP_MOVE_TASK,
      TUTORIAL_STEP_ASSIGN_QA,
      TUTORIAL_STEP_WAIT_WORK,
      TUTORIAL_STEP_MOVE_DONE,
    ], ["directive", "directive", "wait", "directive"]);
  } else if (tutorial.stageId === TUTORIAL_STAGE_MULTI_WORK) {
    tutorial.steps = buildSteps(tutorial, [
      TUTORIAL_STEP_MOVE_MULTI_TASK,
      TUTORIAL_STEP_ASSIGN_BACKEND,
      TUTORIAL_STEP_WAIT_BACKEND,
      TUTORIAL_STEP_ASSIGN_FRONTEND,
      TUTORIAL_STEP_WAIT_FRONTEND,
      TUTORIAL_STEP_ASSIGN_QA_MULTI,
      TUTORIAL_STEP_WAIT_QA_MULTI,
      TUTORIAL_STEP_MOVE_MULTI_DONE,
    ], ["directive", "directive", "wait", "directive", "wait", "directive", "wait", "directive"]);
  } else if (tutorial.stageId === TUTORIAL_STAGE_COMPROMISE) {
    tutorial.steps = buildSteps(tutorial, [
      TUTORIAL_STEP_MOVE_COMPROMISE_TASK,
      TUTORIAL_STEP_ASSIGN_BACKEND_COMPROMISE,
      TUTORIAL_STEP_WAIT_COMPROMISE_WORK,
      TUTORIAL_STEP_MOVE_RISKY_DONE,
    ], ["directive", "directive", "wait", "choice"]);
  } else if (tutorial.stageId === TUTORIAL_STAGE_DEADLINE) {
    tutorial.steps = buildSteps(tutorial, [
      TUTORIAL_STEP_MOVE_DEADLINE_TASK,
      TUTORIAL_STEP_ASSIGN_SRE_DEADLINE,
      TUTORIAL_STEP_WAIT_DEADLINE_WORK,
      TUTORIAL_STEP_CHOOSE_DEADLINE,
    ], ["directive", "directive", "wait", "choice"]);
  } else if (tutorial.stageId === TUTORIAL_STAGE_DAY_END) {
    tutorial.steps = buildSteps(tutorial, [TUTORIAL_STEP_WAIT_DAY_END], ["wait"]);
  }
}

function buildSteps(
  tutorial: RtTutorialState,
  stepIds: string[],
  kinds: Array<RtTutorialState["steps"][number]["kind"]>,
): RtTutorialState["steps"] {
  return stepIds.map((id, index) => ({
    id,
    stageId: tutorial.stageId,
    kind: kinds[index] ?? "directive",
    completed: tutorial.completedStepIds.includes(id),
    branchId: null,
  }));
}

function startTutorialStage(
  state: RtGameState,
  stageId: string,
  emit?: TutorialEventSink,
): void {
  const tutorial = getTutorialState(state);
  if (!tutorial) return;
  const previousBranchId = tutorial.activeBranchId;
  tutorial.stageId = stageId;
  tutorial.completedStepIds = [];
  tutorial.timers = {};
  tutorial.activeBranchId = stageId === TUTORIAL_STAGE_DAY_END ? previousBranchId : null;
  tutorial.focusCharacterId = null;
  tutorial.steps = [];

  if (stageId === TUTORIAL_STAGE_MULTI_WORK) {
    restoreTutorialTeam(state);
    tutorial.stepId = TUTORIAL_STEP_MOVE_MULTI_TASK;
    spawnTutorialTask(state, createStageTwoTask(state), emit);
  } else if (stageId === TUTORIAL_STAGE_COMPROMISE) {
    restoreTutorialTeam(state);
    exhaustQaForCompromise(state);
    tutorial.stepId = TUTORIAL_STEP_MOVE_COMPROMISE_TASK;
    spawnTutorialTask(state, createCompromiseTask(state), emit);
  } else if (stageId === TUTORIAL_STAGE_DEADLINE) {
    restoreTutorialTeam(state);
    tutorial.stepId = TUTORIAL_STEP_MOVE_DEADLINE_TASK;
    spawnTutorialTask(state, createDeadlineTask(state), emit);
  } else if (stageId === TUTORIAL_STAGE_DAY_END) {
    tutorial.stepId = TUTORIAL_STEP_WAIT_DAY_END;
    tutorial.focusTaskId = null;
    state.gameMinuteOfDay = RELEASE_TRAIN_GAME_MINUTE - 1;
    state.elapsedGameMinutes = state.gameMinuteOfDay;
    emitTutorialEvent(state, {
      type: "tutorial_stage_started",
      title: "Tutorial day end",
      body: "The tutorial is waiting for the daily release train.",
      effects: ["clock near release"],
      data: {
        stageId,
        stepId: tutorial.stepId,
        branchId: tutorial.activeBranchId,
        taskId: null,
        characterId: null,
      },
    }, emit);
  }
  ensureTutorialSteps(tutorial);
}

function spawnTutorialTask(
  state: RtGameState,
  task: RtTask,
  emit?: TutorialEventSink,
): void {
  const tutorial = getTutorialState(state);
  if (!tutorial) return;
  state.tasks[task.id] = task;
  state.board.backlog.unshift(task.id);
  tutorial.focusTaskId = task.id;
  ensureTutorialSteps(tutorial);
  emitTutorialEvent(state, {
    type: "tutorial_task_spawned",
    title: `${task.id} tutorial task`,
    body: task.title,
    effects: [`stage ${tutorial.stageId}`, `step ${tutorial.stepId}`],
    data: {
      taskId: task.id,
      stageId: tutorial.stageId,
      stepId: tutorial.stepId,
    },
  }, emit);
}

function expectedTaskDropColumnForStep(stepId: string): RtColumn | null {
  if (
    stepId === TUTORIAL_STEP_MOVE_TASK ||
    stepId === TUTORIAL_STEP_MOVE_MULTI_TASK ||
    stepId === TUTORIAL_STEP_MOVE_COMPROMISE_TASK ||
    stepId === TUTORIAL_STEP_MOVE_DEADLINE_TASK
  ) {
    return "inProgress";
  }
  if (
    stepId === TUTORIAL_STEP_MOVE_DONE ||
    stepId === TUTORIAL_STEP_MOVE_MULTI_DONE ||
    stepId === TUTORIAL_STEP_MOVE_RISKY_DONE ||
    stepId === TUTORIAL_STEP_CHOOSE_DEADLINE
  ) {
    return "done";
  }
  return null;
}

function expectedCharacterRoleForStep(stepId: string): RtCharacter["role"] | null {
  if (stepId === TUTORIAL_STEP_ASSIGN_QA || stepId === TUTORIAL_STEP_ASSIGN_QA_MULTI) return "qa";
  if (stepId === TUTORIAL_STEP_ASSIGN_BACKEND || stepId === TUTORIAL_STEP_ASSIGN_BACKEND_COMPROMISE) {
    return "backend";
  }
  if (stepId === TUTORIAL_STEP_ASSIGN_FRONTEND) return "frontend";
  if (stepId === TUTORIAL_STEP_ASSIGN_SRE_DEADLINE) return "sre";
  return null;
}

function nextWaitStepAfterAssignment(stepId: string): string {
  if (stepId === TUTORIAL_STEP_ASSIGN_QA) return TUTORIAL_STEP_WAIT_WORK;
  if (stepId === TUTORIAL_STEP_ASSIGN_BACKEND) return TUTORIAL_STEP_WAIT_BACKEND;
  if (stepId === TUTORIAL_STEP_ASSIGN_FRONTEND) return TUTORIAL_STEP_WAIT_FRONTEND;
  if (stepId === TUTORIAL_STEP_ASSIGN_QA_MULTI) return TUTORIAL_STEP_WAIT_QA_MULTI;
  if (stepId === TUTORIAL_STEP_ASSIGN_BACKEND_COMPROMISE) return TUTORIAL_STEP_WAIT_COMPROMISE_WORK;
  if (stepId === TUTORIAL_STEP_ASSIGN_SRE_DEADLINE) return TUTORIAL_STEP_WAIT_DEADLINE_WORK;
  return TUTORIAL_STEP_WAIT_WORK;
}

function taskIsIdle(task: RtTask): boolean {
  return !task.assignedCharacterId && !task.outsourcing;
}

function subtaskDone(task: RtTask, role: RtTask["subtasks"][number]["role"]): boolean {
  return task.subtasks.some((subtask) => subtask.role === role && subtask.done);
}

function exhaustQaForCompromise(state: RtGameState): void {
  const qa = Object.values(state.characters).find((character) => character.role === "qa");
  if (!qa) return;
  qa.stamina = 0;
  qa.exhaustedToday = true;
  qa.burnout = Math.max(qa.burnout, 5);
}

function restoreTutorialTeam(state: RtGameState): void {
  for (const character of Object.values(state.characters)) {
    character.assignedTaskId = null;
    character.stamina = 100;
    character.shockGameMinutes = 0;
    character.exhaustedToday = false;
  }
}

function baseTutorialTask(state: RtGameState, kind: RtTask["kind"], title: string): RtTask {
  const task = generateTask(state, kind);
  task.title = `${task.id}: ${title}`;
  task.domain = "auth";
  task.pressure = 1;
  task.complexity = 1;
  task.blastRadius = "low";
  task.baseValue = 8;
  task.backlogValue = 8;
  task.backlogDecayElapsedMs = 0;
  task.backlogDecayDurationMs = 900000;
  task.engagedOnce = false;
  task.value = 8;
  task.clarity = 100;
  task.quality = 100;
  task.testCoverage = 0;
  task.bugs = 0;
  task.changedAfterQa = false;
  task.workDone = false;
  task.subtasks = [];
  task.currentSubtaskId = null;
  task.offRolePenalty = 0;
  task.postmortem = [];
  task.deadlineMs = 900000;
  task.deadlineMaxMs = 900000;
  task.overdueMs = 0;
  task.stageProgress = 0;
  task.stageComplete = false;
  task.assignedCharacterId = null;
  task.outsourcing = null;
  task.released = false;
  task.rootCauseTaskId = null;
  task.sourceTaskId = null;
  task.chainDepth = 0;
  task.resolved = false;
  task.resolution = null;
  task.resolutionDay = null;
  task.releaseScore = null;
  task.queuedDeadlineMs = null;
  task.lastNote = "Tutorial task.";
  return task;
}

function createTutorialSubtask(
  task: RtTask,
  suffix: string,
  title: string,
  role: RtTask["subtasks"][number]["role"],
  importance: RtTask["subtasks"][number]["importance"] = "important",
): RtTask["subtasks"][number] {
  return {
    id: `${task.id}-${suffix}`,
    title,
    role,
    importance,
    revealed: true,
    done: false,
    progress: 0,
    completedBy: null,
    offRole: false,
  };
}

function createStageTwoTask(state: RtGameState): RtTask {
  const task = baseTutorialTask(state, "feature", "Add a small customer note");
  task.subtasks = [
    {
      ...createTutorialSubtask(task, "B1", "Implement backend change", "backend", "critical"),
    },
    createTutorialSubtask(task, "F1", "Update visible UI state", "frontend"),
    createTutorialSubtask(task, "Q1", "Check the finished change", "qa"),
  ];
  return task;
}

function createCompromiseTask(state: RtGameState): RtTask {
  const task = baseTutorialTask(state, "bug", "Patch urgent login error");
  task.quality = 65;
  task.subtasks = [
    createTutorialSubtask(task, "B1", "Patch backend behavior", "backend", "critical"),
    createTutorialSubtask(task, "Q1", "Verify the urgent fix", "qa"),
  ];
  return task;
}

function createDeadlineTask(state: RtGameState): RtTask {
  const task = baseTutorialTask(state, "incident", "Stabilize partner export");
  task.subtasks = [
    createTutorialSubtask(task, "S1", "Stabilize production path", "sre", "critical"),
  ];
  return task;
}

function completeTutorialStep(
  state: RtGameState,
  stepId: string,
  branchId: string | null,
  emit: TutorialEventSink | undefined,
): void {
  const tutorial = getTutorialState(state);
  if (!tutorial || tutorial.completedStepIds.includes(stepId)) return;
  tutorial.completedStepIds.push(stepId);
  tutorial.activeBranchId = branchId;
  for (const step of tutorial.steps) {
    if (step.id === stepId) {
      step.completed = true;
      step.branchId = branchId;
    }
  }
  emitTutorialEvent(state, {
    type: "tutorial_step_completed",
    title: `${stepId} completed`,
    body: `Tutorial step ${stepId} completed.`,
    effects: [],
    data: {
      stageId: tutorial.stageId,
      stepId,
      branchId,
      taskId: tutorial.focusTaskId,
      characterId: tutorial.focusCharacterId,
    },
  }, emit);
}

function emitTutorialEvent(
  state: RtGameState,
  event: Omit<RtEvent, "at">,
  emit?: TutorialEventSink,
): void {
  if (emit) {
    emit(event);
    return;
  }
  state.log.unshift({ at: formatGameTime(state), ...event });
  if (state.log.length > 500) state.log.length = 500;
}

function createStageOneTask(state: RtGameState): RtTask {
  const task = generateTask(state, "bug");
  task.title = `${task.id}: Test yesterday's changes`;
  task.domain = "auth";
  task.pressure = 1;
  task.complexity = 1;
  task.blastRadius = "low";
  task.baseValue = 8;
  task.backlogValue = 8;
  task.backlogDecayElapsedMs = 0;
  task.backlogDecayDurationMs = 900000;
  task.engagedOnce = false;
  task.value = 8;
  task.clarity = 100;
  task.quality = 70;
  task.testCoverage = 0;
  task.bugs = 1;
  task.changedAfterQa = false;
  task.workDone = false;
  task.subtasks = [
    {
      id: `${task.id}-QA1`,
      title: "Test yesterday's changes",
      role: "qa",
      importance: "important",
      revealed: true,
      done: false,
      progress: 0,
      completedBy: null,
      offRole: false,
    },
  ];
  task.currentSubtaskId = null;
  task.offRolePenalty = 0;
  task.postmortem = [];
  task.deadlineMs = 900000;
  task.deadlineMaxMs = 900000;
  task.overdueMs = 0;
  task.stageProgress = 0;
  task.stageComplete = false;
  task.assignedCharacterId = null;
  task.outsourcing = null;
  task.released = false;
  task.rootCauseTaskId = null;
  task.sourceTaskId = null;
  task.chainDepth = 0;
  task.resolved = false;
  task.resolution = null;
  task.resolutionDay = null;
  task.releaseScore = null;
  task.queuedDeadlineMs = null;
  task.lastNote = "Tutorial task.";
  return task;
}
