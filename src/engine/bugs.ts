import { SIM_TEXT, normalizeLocale } from "../i18n";
import { clamp } from "./math";
import { chance, randomInt, shuffle } from "./rng";
import type {
  RtCharacter,
  RtGameState,
  RtSubtask,
  RtSubtaskRole,
  RtTask,
} from "./types";

export function ensureBugReviewSubtask(task: RtTask): RtSubtask | null {
  if (task.bugs <= 0) return null;
  const openQa = task.subtasks.find(
    (subtask) => subtask.role === "qa" && subtask.revealed && !subtask.done,
  );
  if (openQa) return null;

  const subtask: RtSubtask = {
    id: `${task.id}-Q${task.subtasks.length + 1}`,
    title: "Triage reported bugs",
    role: "qa",
    importance: task.bugs >= 2 ? "critical" : "important",
    revealed: true,
    done: false,
    progress: 0,
    completedBy: null,
    offRole: false,
  };
  task.subtasks.push(subtask);
  return subtask;
}

export function ensureQaRecheckSubtask(task: RtTask): RtSubtask | null {
  if (!task.changedAfterQa) return null;
  const openQa = task.subtasks.find(
    (subtask) => subtask.role === "qa" && subtask.revealed && !subtask.done,
  );
  if (openQa) return null;

  const subtask: RtSubtask = {
    id: `${task.id}-Q${task.subtasks.length + 1}`,
    title: "Re-test changes after rework",
    role: "qa",
    importance: "important",
    revealed: true,
    done: false,
    progress: 0,
    completedBy: null,
    offRole: false,
  };
  task.subtasks.push(subtask);
  return subtask;
}

export function isBugfixWork(subtask: RtSubtask): boolean {
  return subtask.role === "bugfix" || subtask.id.includes("-B");
}

export function introduceImplementationBugs(
  state: RtGameState,
  task: RtTask,
  character: RtCharacter,
  subtask: RtSubtask,
  roleFit: number,
  offRole: boolean,
  rawQuality: number,
): number {
  const clarityRisk = (100 - task.clarity) * 0.003;
  const staminaRisk = (100 - character.stamina) * 0.0025;
  const qualityRisk = rawQuality < 65 ? (65 - rawQuality) * 0.005 : 0;
  const importanceRisk =
    subtask.importance === "critical" ? 0.08 : subtask.importance === "important" ? 0.04 : 0;
  const probability = clamp(
    0.24 +
      clarityRisk +
      staminaRisk +
      qualityRisk +
      task.pressure * 0.035 +
      task.complexity * 0.025 +
      importanceRisk +
      (offRole ? 0.28 : 0) -
      roleFit * 0.075,
    0.06,
    0.86,
  );

  let bugs = chance(state, probability) ? 1 : 0;
  const severeFollowUpChance =
    probability * 0.45 + (offRole ? 0.15 : 0) + (task.complexity >= 4 ? 0.08 : 0);
  if (bugs > 0 && chance(state, clamp(severeFollowUpChance, 0, 0.62))) {
    bugs += 1;
  }

  if (bugs > 0) {
    task.bugs += bugs;
    ensureBugReviewSubtask(task);
  }

  return bugs;
}

export function discoverBugsDuringQa(state: RtGameState, task: RtTask): number {
  const openCritical = task.subtasks.filter(
    (subtask) => subtask.importance === "critical" && !subtask.done && subtask.role !== "qa",
  ).length;
  if (openCritical > 0 && chance(state, 0.45)) return 1;
  if (task.quality < 45) return randomInt(state, 0, 1);
  if (task.quality < 70 && chance(state, 0.25)) return 1;
  return 0;
}

export function addBugfixSubtasks(state: RtGameState, task: RtTask, count: number): RtSubtask[] {
  const added: RtSubtask[] = [];
  const rolePool = shuffle(state, bugfixRoleCandidates(task));
  const text = SIM_TEXT[normalizeLocale(state.locale)].subtasks;
  for (let index = 0; index < count; index += 1) {
    const role = rolePool[index % rolePool.length];
    const subtask: RtSubtask = {
      id: `${task.id}-B${task.subtasks.length + 1}`,
      title:
        role === "sre"
          ? text.stabilizeProductionFailureMode
          : role === "design"
            ? text.fixProductInteractionDefect
            : normalizeLocale(state.locale) === "ru"
              ? `Починить ${role}-дефект, найденный QA`
              : `Fix ${role} defect found by QA`,
      role,
      importance: "important",
      revealed: true,
      done: false,
      progress: 0,
      completedBy: null,
      offRole: false,
    };
    task.subtasks.push(subtask);
    added.push(subtask);
  }
  return added;
}

function bugfixRoleCandidates(
  task: RtTask,
): Array<Exclude<RtSubtaskRole, "qa" | "bugfix">> {
  const candidates = task.subtasks
    .filter(
      (
        subtask,
      ): subtask is RtSubtask & { role: Exclude<RtSubtaskRole, "qa" | "bugfix"> } =>
        subtask.role !== "qa" && subtask.role !== "bugfix" && (subtask.done || subtask.revealed),
    )
    .map((subtask) => subtask.role);

  return candidates.length > 0 ? [...new Set(candidates)] : ["backend", "frontend", "sre", "design"];
}
