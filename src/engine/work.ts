import {
  ANALYSIS_COMPLEXITY_STAMINA_DRAIN,
  ANALYSIS_PRESSURE_STAMINA_DRAIN,
  ANALYSIS_SPEED_MULTIPLIER,
  ANALYSIS_STAMINA_DRAIN_BASE,
  OFF_ROLE_STAMINA_DRAIN,
  WORK_COMPLEXITY_STAMINA_DRAIN,
  WORK_PRESSURE_STAMINA_DRAIN,
  WORK_SPEED_MULTIPLIER,
  WORK_STAMINA_DRAIN_BASE,
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
  task.stageProgress = Math.max(0, task.stageProgress - 8);
  if (subtask) subtask.progress = task.stageProgress;
  task.currentSubtaskId = null;
  task.stageComplete = false;
  task.lastNote = "Work was interrupted.";

  if (character) {
    character.assignedTaskId = null;
    character.stamina = clamp(character.stamina - 12, 0, 100);
    character.shockGameMinutes = Math.max(character.shockGameMinutes, 20);
    emit({
      type: "cancelled",
      title: `${task.id} interrupted`,
      body: `${character.name} was pulled off the task.`,
      effects: ["stamina -12", "context shock 20m", "stage progress -8"],
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

    const subtask = task.currentSubtaskId
      ? task.subtasks.find((candidate) => candidate.id === task.currentSubtaskId)
      : null;
    const stage: RtStage = subtask ? "todo" : "analysis";
    const roleFit = subtask ? character.specialty[subtask.role] : character.skill[stage];
    const offRole = Boolean(subtask && roleFit < 3);

    const clarityFactor = stage === "todo" ? 0.55 + task.clarity / 140 : 1;
    const staminaFactor = clamp(0.55 + character.stamina / 160, 0.55, 1.15);
    const shockFactor = character.shockGameMinutes > 0 ? 0.65 : 1;
    const offRoleFactor = offRole ? 0.62 : 1;
    const boostFactor = 1 + state.resources.processBoost / 100;
    const paceFactor = stage === "analysis" ? ANALYSIS_SPEED_MULTIPLIER : WORK_SPEED_MULTIPLIER;
    const speed =
      (4.2 + (stage === "todo" ? roleFit : character.skill[stage]) * 1.25) *
      clarityFactor *
      staminaFactor *
      shockFactor *
      offRoleFactor *
      boostFactor *
      paceFactor;
    task.stageProgress = clamp(
      task.stageProgress + (speed * tickSeconds) / (1 + task.complexity * 0.28),
      0,
      100,
    );
    const staminaDrainPerSecond =
      stage === "analysis"
        ? ANALYSIS_STAMINA_DRAIN_BASE +
          task.pressure * ANALYSIS_PRESSURE_STAMINA_DRAIN +
          task.complexity * ANALYSIS_COMPLEXITY_STAMINA_DRAIN
        : WORK_STAMINA_DRAIN_BASE +
          task.pressure * WORK_PRESSURE_STAMINA_DRAIN +
          task.complexity * WORK_COMPLEXITY_STAMINA_DRAIN +
          (offRole ? OFF_ROLE_STAMINA_DRAIN : 0);
    character.stamina = clamp(character.stamina - tickSeconds * staminaDrainPerSecond, 0, 100);
    if (subtask) subtask.progress = task.stageProgress;
    if (character.stamina < 20) {
      character.burnout = clamp(
        character.burnout + tickSeconds * (0.06 + task.pressure * 0.012 + (offRole ? 0.025 : 0)),
        0,
        100,
      );
    }

    if (task.stageProgress >= 100) {
      completeStage(state, task, character, stage, emit);
    } else if (character.stamina <= 0) {
      exhaustCharacterForDay(state, task, character, emit);
    }
  }
}

export function importanceWeight(importance: RtSubtaskImportance): number {
  if (importance === "critical") return 35;
  if (importance === "important") return 20;
  return 8;
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
    const gain = 18 + character.skill.analysis * 5 + randomInt(state, 0, 8);
    const revealed = revealSubtasksByAnalysis(state, task, gain);
    task.clarity = clamp(task.clarity + gain, 0, 100);
    task.quality = clamp(task.quality + Math.round(gain * 0.15), 0, 100);
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
    return;
  }

  if (stage === "todo") {
    const subtask = task.currentSubtaskId
      ? task.subtasks.find((candidate) => candidate.id === task.currentSubtaskId)
      : null;
    if (!subtask) return;
    const roleFit = character.specialty[subtask.role];
    const offRole = roleFit < 3;
    subtask.done = true;
    subtask.completedBy = character.id;
    subtask.offRole = offRole;
    subtask.progress = 100;
    character.xp[subtask.role] += offRole ? 3 : 1;
    if (character.xp[subtask.role] >= 10 && character.specialty[subtask.role] < 5) {
      character.xp[subtask.role] -= 10;
      character.specialty[subtask.role] += 1;
    }
    if (offRole) {
      task.offRolePenalty += subtask.importance === "critical" ? 10 : 6;
      character.stamina = clamp(character.stamina - 12, 0, 100);
      addPostmortemNote(task, `${character.name} completed ${subtask.role} work off-role.`);
    }

    if (subtask.role === "qa") {
      const coverageGain = Math.round(
        (22 + character.skill.test * 6 + roleFit * 4 + randomInt(state, 0, 8)) *
          (offRole ? 0.72 : 1),
      );
      task.testCoverage = clamp(task.testCoverage + coverageGain, 0, 100);
      task.changedAfterQa = false;
      const discoveredBugs = discoverBugsDuringQa(state, task);
      task.bugs += discoveredBugs;
      const triagedBugs = Math.min(
        task.bugs,
        Math.max(1, Math.floor((character.skill.test + roleFit) / 4) + randomInt(state, 0, 1)),
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
      return;
    }

    const importanceQuality =
      subtask.importance === "critical" ? 14 : subtask.importance === "important" ? 9 : 5;
    if (task.testCoverage > 0) {
      task.changedAfterQa = true;
      task.testCoverage = Math.min(task.testCoverage, 35);
      ensureQaRecheckSubtask(task);
      addPostmortemNote(
        task,
        "Implementation changed after QA, so prior test coverage became stale.",
      );
    }
    const rawQuality =
      task.clarity * 0.55 +
      roleFit * 9 +
      importanceQuality +
      randomInt(state, -10, 10) -
      (100 - character.stamina) * 0.12 -
      (offRole ? 18 : 0);
    const bugfixWork = isBugfixWork(subtask);
    const qualityGain = bugfixWork ? 16 + roleFit * 3 : Math.max(4, Math.round(rawQuality / 8));
    task.quality = clamp(Math.max(task.quality, Math.round(rawQuality)), 0, 100);
    let introducedBugs = 0;
    if (bugfixWork) {
      const fixed = Math.min(task.bugs, roleFit >= 4 && chance(state, 0.35) ? 2 : 1);
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
    return;
  }

  const coverageGain = 24 + character.skill.test * 8 + randomInt(state, 0, 8);
  task.testCoverage = clamp(task.testCoverage + coverageGain, 0, 100);
  task.changedAfterQa = false;
  const discoveredBugs = discoverBugsDuringQa(state, task);
  task.bugs += discoveredBugs;
  const triagedBugs = Math.min(
    task.bugs,
    Math.max(
      1,
      Math.floor((character.skill.test + character.specialty.qa) / 4) + randomInt(state, 0, 1),
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
        character.specialty[subtask.role] * 12 +
        importanceWeight(subtask.importance) +
        (roleMatchesSubtask(character.role, subtask.role) ? 10 : 0) -
        (preferredRoles.includes(subtask.role) ? 0 : 28) -
        subtask.progress * 0.15,
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
  const strongSkill = maxSkill >= 4 ? maxSkill - 1 : maxSkill;
  const roles = entries.filter(([, skill]) => skill >= strongSkill).map(([role]) => role);
  if (character.specialty.bugfix >= 3 && !roles.includes("bugfix")) {
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
  const revealCount = Math.min(hidden.length, clarityGain >= 38 ? 3 : clarityGain >= 28 ? 2 : 1);
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
