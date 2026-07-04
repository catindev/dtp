import { generateTask } from "../engine/taskFactory";
import { formatGameTime } from "../engine/time";
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

const STAGE1_SPAWN_TIMER = "teamBasics.spawnDelayMs";
const STAGE1_SPAWN_DELAY_MS = 2000;

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

  ensureStageOneSteps(tutorial);

  if (tutorial.stageId !== TUTORIAL_STAGE_TEAM_BASICS) return;

  if (!tutorial.focusTaskId) {
    tutorial.timers[STAGE1_SPAWN_TIMER] = (tutorial.timers[STAGE1_SPAWN_TIMER] ?? 0) + tickMs;
    if (tutorial.timers[STAGE1_SPAWN_TIMER] >= STAGE1_SPAWN_DELAY_MS) {
      const task = createStageOneTask(state);
      state.tasks[task.id] = task;
      state.board.backlog.unshift(task.id);
      tutorial.focusTaskId = task.id;
      emit({
        type: "tutorial_task_spawned",
        title: `${task.id} tutorial task`,
        body: task.title,
        effects: ["stage team-basics", "step move-task-to-work"],
        data: {
          taskId: task.id,
          stageId: tutorial.stageId,
          stepId: tutorial.stepId,
        },
      });
    }
    return;
  }

  if (tutorial.stepId === TUTORIAL_STEP_WAIT_WORK) {
    const task = state.tasks[tutorial.focusTaskId];
    if (task?.stageComplete && !task.assignedCharacterId && !task.outsourcing) {
      completeTutorialStep(state, TUTORIAL_STEP_WAIT_WORK, null, emit);
      tutorial.stepId = TUTORIAL_STEP_MOVE_DONE;
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
    tutorial.stepId = TUTORIAL_STEP_STAGE_COMPLETE;
  }
}

export function advanceTutorialForCharacterAssignment(
  state: RtGameState,
  characterId: string,
  taskId: string,
  emit?: TutorialEventSink,
): void {
  const tutorial = getTutorialState(state);
  if (!tutorial || tutorial.focusTaskId !== taskId || tutorial.stepId !== TUTORIAL_STEP_ASSIGN_QA) return;
  const character = state.characters[characterId];
  if (character?.role !== "qa") return;

  tutorial.focusCharacterId = characterId;
  completeTutorialStep(state, TUTORIAL_STEP_ASSIGN_QA, null, emit);
  tutorial.stepId = TUTORIAL_STEP_WAIT_WORK;
}

export function canBeginTutorialTaskDrag(state: RtGameState, taskId: string): TutorialGateResult {
  const tutorial = getTutorialState(state);
  if (!tutorial) return { allowed: true, reason: "campaign" };
  if (
    tutorial.focusTaskId === taskId &&
    (tutorial.stepId === TUTORIAL_STEP_MOVE_TASK || tutorial.stepId === TUTORIAL_STEP_MOVE_DONE)
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
  if (tutorial.stepId === TUTORIAL_STEP_ASSIGN_QA && character?.role === "qa") {
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
  if (tutorial.focusTaskId !== taskId) return { allowed: false, reason: "wrong_task" };
  if (tutorial.stepId === TUTORIAL_STEP_MOVE_TASK && column === "inProgress") {
    return { allowed: true, reason: "current_step" };
  }
  if (tutorial.stepId === TUTORIAL_STEP_MOVE_DONE && column === "done") {
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
  if (tutorial.stepId === TUTORIAL_STEP_ASSIGN_QA && tutorial.focusTaskId === taskId && character?.role === "qa") {
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

function getTutorialState(state: RtGameState): RtTutorialState | null {
  if (state.runMode !== "tutorial") return null;
  if (!state.tutorial) {
    state.tutorial = createInitialTutorialState();
  }
  ensureStageOneSteps(state.tutorial);
  return state.tutorial;
}

function ensureStageOneSteps(tutorial: RtTutorialState): void {
  if (tutorial.stageId !== TUTORIAL_STAGE_TEAM_BASICS) return;
  if (tutorial.steps.length > 0) return;
  tutorial.steps = [
    {
      id: TUTORIAL_STEP_MOVE_TASK,
      stageId: TUTORIAL_STAGE_TEAM_BASICS,
      kind: "directive",
      completed: tutorial.completedStepIds.includes(TUTORIAL_STEP_MOVE_TASK),
      branchId: null,
    },
    {
      id: TUTORIAL_STEP_ASSIGN_QA,
      stageId: TUTORIAL_STAGE_TEAM_BASICS,
      kind: "directive",
      completed: tutorial.completedStepIds.includes(TUTORIAL_STEP_ASSIGN_QA),
      branchId: null,
    },
    {
      id: TUTORIAL_STEP_WAIT_WORK,
      stageId: TUTORIAL_STAGE_TEAM_BASICS,
      kind: "wait",
      completed: tutorial.completedStepIds.includes(TUTORIAL_STEP_WAIT_WORK),
      branchId: null,
    },
    {
      id: TUTORIAL_STEP_MOVE_DONE,
      stageId: TUTORIAL_STAGE_TEAM_BASICS,
      kind: "directive",
      completed: tutorial.completedStepIds.includes(TUTORIAL_STEP_MOVE_DONE),
      branchId: null,
    },
  ];
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
  });
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
