import {
  WORK_ANALYSIS_CLARITY_GAIN_BASE,
  WORK_ANALYSIS_CLARITY_GAIN_PER_SKILL,
  WORK_ANALYSIS_CLARITY_GAIN_RANDOM_MAX,
  WORK_ANALYSIS_QUALITY_GAIN_RATIO,
  WORK_ANALYSIS_REVEAL_HIGH_COUNT,
  WORK_ANALYSIS_REVEAL_HIGH_GAIN,
  WORK_ANALYSIS_REVEAL_LOW_COUNT,
  WORK_ANALYSIS_REVEAL_MEDIUM_COUNT,
  WORK_ANALYSIS_REVEAL_MEDIUM_GAIN,
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
  WORK_OFF_ROLE_CRITICAL_PENALTY,
  WORK_OFF_ROLE_DEFAULT_PENALTY,
  WORK_OFF_ROLE_SKILL_THRESHOLD,
  WORK_OFF_ROLE_STAMINA_PENALTY,
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
  WORK_SUBTASK_SPECIALTY_GAIN,
  WORK_SUBTASK_SPECIALTY_MAX,
  WORK_SUBTASK_XP_OFF_ROLE,
  WORK_SUBTASK_XP_ON_ROLE,
  WORK_SUBTASK_XP_TO_SPECIALTY,
  WORK_TEST_COVERAGE_BASE,
  WORK_TEST_COVERAGE_RANDOM_MAX,
  WORK_TEST_COVERAGE_SKILL_FACTOR,
} from "./balance";
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
  RtCharacter,
  RtEvent,
  RtGameState,
  RtStage,
  RtSubtask,
  RtTask,
} from "./types";
import {
  addPostmortemNote,
  importanceWeight,
} from "./workRules";

type WorkStageEventSink = (event: Omit<RtEvent, "at">) => void;

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

function completeAnalysisStage(
  state: RtGameState,
  task: RtTask,
  character: RtCharacter,
  emit: WorkStageEventSink,
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
  emit: WorkStageEventSink,
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
