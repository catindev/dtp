import {
  ANALYSIS_COMPLEXITY_STAMINA_DRAIN,
  ANALYSIS_PRESSURE_STAMINA_DRAIN,
  ANALYSIS_SPEED_MULTIPLIER,
  ANALYSIS_STAMINA_DRAIN_BASE,
  OFF_ROLE_STAMINA_DRAIN,
  WORK_ANALYSIS_CLARITY_GAIN_BASE,
  WORK_ANALYSIS_CLARITY_GAIN_PER_SKILL,
  WORK_ANALYSIS_CLARITY_GAIN_RANDOM_MAX,
  WORK_ANALYSIS_QUALITY_GAIN_RATIO,
  WORK_ANALYSIS_REVEAL_HIGH_COUNT,
  WORK_ANALYSIS_REVEAL_HIGH_GAIN,
  WORK_ANALYSIS_REVEAL_LOW_COUNT,
  WORK_ANALYSIS_REVEAL_MEDIUM_COUNT,
  WORK_ANALYSIS_REVEAL_MEDIUM_GAIN,
  WORK_ASSIGNMENT_CANCEL_PROGRESS_PENALTY,
  WORK_ASSIGNMENT_CANCEL_SHOCK_MINUTES,
  WORK_ASSIGNMENT_CANCEL_STAMINA_PENALTY,
  WORK_ASSIGNMENT_NON_PREFERRED_PENALTY,
  WORK_ASSIGNMENT_PROGRESS_PENALTY,
  WORK_ASSIGNMENT_ROLE_MATCH_BONUS,
  WORK_ASSIGNMENT_ROLE_SCORE_FACTOR,
  WORK_BASE_SPEED,
  WORK_BUGFIX_DEFAULT_FIX_COUNT,
  WORK_BUGFIX_MULTI_FIX_CHANCE,
  WORK_BUGFIX_MULTI_FIX_COUNT,
  WORK_BUGFIX_MULTI_FIX_ROLE_THRESHOLD,
  WORK_BUGFIX_PREFERRED_SKILL_THRESHOLD,
  WORK_BUGFIX_QUALITY_BASE,
  WORK_BUGFIX_QUALITY_ROLE_FACTOR,
  WORK_BURNOUT_DRAIN_BASE,
  WORK_BURNOUT_OFF_ROLE_DRAIN,
  WORK_BURNOUT_PRESSURE_DRAIN,
  WORK_CHANGED_AFTER_QA_COVERAGE_CAP,
  WORK_CLARITY_FACTOR_BASE,
  WORK_CLARITY_FACTOR_DIVISOR,
  WORK_COMPLEXITY_STAMINA_DRAIN,
  WORK_COMPLEXITY_SPEED_FACTOR,
  WORK_IMPLEMENTATION_MIN_QUALITY_GAIN,
  WORK_IMPLEMENTATION_QUALITY_CRITICAL,
  WORK_IMPLEMENTATION_QUALITY_GAIN_DIVISOR,
  WORK_IMPLEMENTATION_QUALITY_IMPORTANT,
  WORK_IMPLEMENTATION_QUALITY_OPTIONAL,
  WORK_IMPORTANCE_WEIGHT_CRITICAL,
  WORK_IMPORTANCE_WEIGHT_IMPORTANT,
  WORK_IMPORTANCE_WEIGHT_OPTIONAL,
  WORK_LOW_STAMINA_BURNOUT_THRESHOLD,
  WORK_OFF_ROLE_CRITICAL_PENALTY,
  WORK_OFF_ROLE_DEFAULT_PENALTY,
  WORK_OFF_ROLE_SKILL_THRESHOLD,
  WORK_OFF_ROLE_SPEED_FACTOR,
  WORK_OFF_ROLE_STAMINA_PENALTY,
  WORK_PREFERRED_STRONG_SKILL_DELTA,
  WORK_PREFERRED_STRONG_SKILL_THRESHOLD,
  WORK_PRESSURE_STAMINA_DRAIN,
  WORK_QA_OFF_ROLE_COVERAGE_FACTOR,
  WORK_QA_SUBTASK_COVERAGE_BASE,
  WORK_QA_SUBTASK_RANDOM_MAX,
  WORK_QA_SUBTASK_ROLE_FACTOR,
  WORK_QA_SUBTASK_SKILL_FACTOR,
  WORK_QA_TRIAGE_MIN,
  WORK_QA_TRIAGE_RANDOM_MAX,
  WORK_QA_TRIAGE_SKILL_DIVISOR,
  WORK_RAW_QUALITY_CLARITY_FACTOR,
  WORK_RAW_QUALITY_OFF_ROLE_PENALTY,
  WORK_RAW_QUALITY_RANDOM_MAX,
  WORK_RAW_QUALITY_RANDOM_MIN,
  WORK_RAW_QUALITY_ROLE_FACTOR,
  WORK_RAW_QUALITY_STAMINA_PENALTY,
  WORK_SHOCK_SPEED_FACTOR,
  WORK_SKILL_SPEED_FACTOR,
  WORK_SPEED_MULTIPLIER,
  WORK_STAMINA_FACTOR_BASE,
  WORK_STAMINA_FACTOR_DIVISOR,
  WORK_STAMINA_FACTOR_MAX,
  WORK_STAMINA_FACTOR_MIN,
  WORK_STAMINA_DRAIN_BASE,
  WORK_SUBTASK_SPECIALTY_GAIN,
  WORK_SUBTASK_SPECIALTY_MAX,
  WORK_SUBTASK_XP_OFF_ROLE,
  WORK_SUBTASK_XP_ON_ROLE,
  WORK_SUBTASK_XP_TO_SPECIALTY,
  WORK_TEST_COVERAGE_BASE,
  WORK_TEST_COVERAGE_RANDOM_MAX,
  WORK_TEST_COVERAGE_SKILL_FACTOR,
} from "./balance";
import { getOpenTodoSubtasks, taskBusy } from "./board";
import {
  addBugfixSubtasks,
  discoverBugsDuringQa,
  ensureBugReviewSubtask,
  ensureQaRecheckSubtask,
  introduceImplementationBugs,
  isBugfixWork,
} from "./bugs";
import { clamp } from "./math";
import { chance, randomInt, shuffle } from "./rng";
import type {
  RtAssignmentPlan,
  RtCharacter,
  RtEvent,
  RtGameState,
  RtRole,
  RtStage,
  RtSubtask,
  RtSubtaskImportance,
  RtSubtaskRole,
  RtTask,
} from "./types";

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

export function importanceWeight(importance: RtSubtaskImportance): number {
  if (importance === "critical") return WORK_IMPORTANCE_WEIGHT_CRITICAL;
  if (importance === "important") return WORK_IMPORTANCE_WEIGHT_IMPORTANT;
  return WORK_IMPORTANCE_WEIGHT_OPTIONAL;
}

export function addPostmortemNote(task: RtTask, note: string): void {
  if (!task.postmortem.includes(note)) {
    task.postmortem.push(note);
  }
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

function completeStage(
  state: RtGameState,
  task: RtTask,
  character: RtCharacter,
  stage: RtStage,
  emit: WorkEventSink,
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

function completeAnalysisStage(
  state: RtGameState,
  task: RtTask,
  character: RtCharacter,
  emit: WorkEventSink,
): void {
  const gain =
    WORK_ANALYSIS_CLARITY_GAIN_BASE +
    character.skill.analysis * WORK_ANALYSIS_CLARITY_GAIN_PER_SKILL +
    randomInt(state, 0, WORK_ANALYSIS_CLARITY_GAIN_RANDOM_MAX);
  const revealed = revealSubtasksByAnalysis(state, task, gain);
  task.clarity = clamp(task.clarity + gain, 0, 100);
  task.quality = clamp(task.quality + Math.round(gain * WORK_ANALYSIS_QUALITY_GAIN_RATIO), 0, 100);
  task.currentSubtaskId = null;
  task.stageComplete = true;
  task.lastNote =
    revealed.length > 0
      ? `Analysis complete. Revealed ${revealed.length} subtask(s).`
      : "Analysis complete. No new subtasks found.";
  emit({
    type: "analysis_done",
    title: `${task.id} clarified`,
    body: `${character.name} improved task clarity.`,
    effects: [`clarity +${gain}`, ...revealed.map((subtask) => `revealed ${subtask.role}`)],
  });
}

function completeTodoStage(
  state: RtGameState,
  task: RtTask,
  character: RtCharacter,
  emit: WorkEventSink,
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

function completeAssignedSubtask(
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

function completeQaSubtaskStage(
  state: RtGameState,
  task: RtTask,
  character: RtCharacter,
  subtask: RtSubtask,
  roleFit: number,
  offRole: boolean,
  emit: WorkEventSink,
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
  task.currentSubtaskId = null;
  task.stageComplete = true;
  task.lastNote =
    bugfixes.length > 0
      ? `QA converted ${bugfixes.length} bug(s) into rework.`
      : "QA pass complete.";
  emit({
    type: "qa_done",
    title: `${task.id} QA pass done`,
    body:
      bugfixes.length > 0
        ? `${character.name} triaged ${bugfixes.length} bug(s) into rework.`
        : `${character.name} found no blocking bugs.`,
    effects: [
      subtask.importance,
      offRole ? "off-role" : "on-role",
      `qa +${coverageGain}`,
      ...(discoveredBugs > 0 ? [`found +${discoveredBugs}`] : []),
      ...(triagedBugs > 0 ? [`bugs -${triagedBugs}`] : ["bugs 0"]),
      ...(bugfixes.length > 0 ? [`rework +${bugfixes.length}`] : []),
      ...(task.bugs > 0 ? [`bugs left ${task.bugs}`] : []),
    ],
  });
}

function completeImplementationSubtaskStage(
  state: RtGameState,
  task: RtTask,
  character: RtCharacter,
  subtask: RtSubtask,
  roleFit: number,
  offRole: boolean,
  emit: WorkEventSink,
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

function completeTestStage(
  state: RtGameState,
  task: RtTask,
  character: RtCharacter,
  emit: WorkEventSink,
): void {
  const coverageGain =
    WORK_TEST_COVERAGE_BASE +
    character.skill.test * WORK_TEST_COVERAGE_SKILL_FACTOR +
    randomInt(state, 0, WORK_TEST_COVERAGE_RANDOM_MAX);
  task.testCoverage = clamp(task.testCoverage + coverageGain, 0, 100);
  task.changedAfterQa = false;
  const discoveredBugs = discoverBugsDuringQa(state, task);
  task.bugs += discoveredBugs;
  const triagedBugs = Math.min(
    task.bugs,
    Math.max(
      WORK_QA_TRIAGE_MIN,
      Math.floor((character.skill.test + character.specialty.qa) / WORK_QA_TRIAGE_SKILL_DIVISOR) +
        randomInt(state, 0, WORK_QA_TRIAGE_RANDOM_MAX),
    ),
  );
  task.bugs = Math.max(0, task.bugs - triagedBugs);
  const qaSubtask = task.subtasks.find(
    (subtask) => subtask.revealed && !subtask.done && subtask.role === "qa",
  );
  if (qaSubtask) {
    qaSubtask.done = true;
    qaSubtask.progress = 100;
    qaSubtask.completedBy = character.id;
  }
  const bugfixes = addBugfixSubtasks(state, task, triagedBugs);
  ensureBugReviewSubtask(task);
  task.currentSubtaskId = null;
  task.lastNote =
    bugfixes.length > 0 ? `QA converted ${bugfixes.length} bug(s) into rework.` : "QA pass complete.";
  emit({
    type: "qa_done",
    title: `${task.id} QA pass done`,
    body:
      bugfixes.length > 0
        ? `${character.name} triaged ${bugfixes.length} bug(s) into rework.`
        : `${character.name} found no blocking bugs.`,
    effects: [
      `qa +${coverageGain}`,
      ...(discoveredBugs > 0 ? [`found +${discoveredBugs}`] : []),
      ...(triagedBugs > 0 ? [`bugs -${triagedBugs}`] : ["bugs 0"]),
      ...(bugfixes.length > 0 ? [`rework +${bugfixes.length}`] : []),
      ...(task.bugs > 0 ? [`bugs left ${task.bugs}`] : []),
    ],
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

function revealSubtasksByAnalysis(
  state: RtGameState,
  task: RtTask,
  clarityGain: number,
): RtSubtask[] {
  const hidden = task.subtasks.filter((subtask) => !subtask.revealed);
  const revealCount = Math.min(
    hidden.length,
    clarityGain >= WORK_ANALYSIS_REVEAL_HIGH_GAIN
      ? WORK_ANALYSIS_REVEAL_HIGH_COUNT
      : clarityGain >= WORK_ANALYSIS_REVEAL_MEDIUM_GAIN
        ? WORK_ANALYSIS_REVEAL_MEDIUM_COUNT
        : WORK_ANALYSIS_REVEAL_LOW_COUNT,
  );
  const revealed = shuffle(state, hidden)
    .sort((a, b) => importanceWeight(b.importance) - importanceWeight(a.importance))
    .slice(0, revealCount);
  for (const subtask of revealed) {
    subtask.revealed = true;
  }
  return revealed;
}

function roleMatchesSubtask(role: RtRole, subtaskRole: RtSubtaskRole): boolean {
  if (role === subtaskRole) return true;
  if (role === "designer" && subtaskRole === "design") return true;
  if ((role === "backend" || role === "frontend" || role === "sre") && subtaskRole === "bugfix") {
    return true;
  }
  return false;
}
