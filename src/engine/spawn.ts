import {
  BACKLOG_LIMIT,
  BURST_INTERVAL_MAX_MS,
  BURST_INTERVAL_MIN_MS,
  FIRST_SPAWN_MAX_MS,
  FIRST_SPAWN_MIN_MS,
  LOW_WORK_SPAWN_MAX_MS,
  LOW_WORK_SPAWN_MIN_MS,
  SPAWN_INTERVAL_MAX_MS,
  SPAWN_INTERVAL_MIN_MS,
} from "./balance";
import {
  BASE_SKILLS,
  BASE_SPECIALTIES,
} from "./catalog";
import { renderTaskNarrative } from "./narrative";
import {
  randomBetween,
  randomInt,
  shuffle,
} from "./rng";
import { generateTask } from "./taskFactory";
import type {
  RtCharacter,
  RtEvent,
  RtGameState,
  RtRole,
  RtSpawnState,
  RtStage,
  RtSubtaskRole,
  RtTask,
} from "./types";

type SpawnEventSink = (event: Omit<RtEvent, "at">) => void;

export const STARTING_ROLES: RtRole[] = ["analyst", "backend", "frontend", "qa", "sre"];

const CHARACTER_NAME_POOL = [
  "Ari",
  "Dina",
  "Egor",
  "Ilya",
  "Inga",
  "Ira",
  "Kai",
  "Kirill",
  "Lena",
  "Maks",
  "Mila",
  "Mira",
  "Nadia",
  "Nika",
  "Nina",
  "Oleg",
  "Pavel",
  "Rada",
  "Roma",
  "Sasha",
  "Sema",
  "Tanya",
  "Tim",
  "Vadim",
  "Vera",
  "Yana",
  "Zhenya",
] as const;

const ROLE_PRIMARY_STAGE: Record<RtRole, RtStage> = {
  analyst: "analysis",
  designer: "todo",
  backend: "todo",
  frontend: "todo",
  qa: "test",
  sre: "test",
};

const ROLE_PRIMARY_SUBTASKS: Record<RtRole, RtSubtaskRole[]> = {
  analyst: [],
  designer: ["design"],
  backend: ["backend", "bugfix"],
  frontend: ["frontend", "bugfix"],
  qa: ["qa"],
  sre: ["sre"],
};

export function createInitialSpawnState(seed: number): RtSpawnState {
  const normalizedSeed = seed >>> 0 || 1;
  return {
    nextInMs: randomBetween(
      { rngState: normalizedSeed },
      FIRST_SPAWN_MIN_MS,
      FIRST_SPAWN_MAX_MS,
    ),
    nextBurstInMs: randomBetween(
      { rngState: normalizedSeed },
      BURST_INTERVAL_MIN_MS,
      BURST_INTERVAL_MAX_MS,
    ),
  };
}

export function seedInitialTeam(state: RtGameState): void {
  const names = shuffle(state, CHARACTER_NAME_POOL);
  for (const [index, role] of STARTING_ROLES.entries()) {
    const character = createCharacter(state, role, names[index] ?? `Teammate ${index + 1}`);
    state.characters[character.id] = character;
  }
}

export function seedInitialTasks(
  state: RtGameState,
  count: number,
  emit: SpawnEventSink,
): void {
  for (let index = 0; index < count; index += 1) {
    addTaskToBacklog(state, generateTask(state), emit);
  }
}

export function addTaskToBacklog(
  state: RtGameState,
  task: RtTask,
  emit: SpawnEventSink,
  backlogLimit = BACKLOG_LIMIT,
): boolean {
  if (state.board.backlog.length >= backlogLimit) return false;
  state.tasks[task.id] = task;
  state.board.backlog.unshift(task.id);
  const narrative = renderTaskNarrative(task, state.locale);
  emit({
    type: "task_spawned",
    title: `${task.id} arrived`,
    body: narrative.title,
    effects: [
      `clarity ${task.clarity}`,
      `value ${Math.round(task.baseValue)}`,
      `backlog decay ${Math.round(task.backlogDecayDurationMs / 1000)}s`,
    ],
  });
  return true;
}

export function updateSpawner(
  state: RtGameState,
  tickMs: number,
  emit: SpawnEventSink,
): void {
  if (state.board.backlog.length >= BACKLOG_LIMIT) return;

  state.spawn.nextInMs -= tickMs;
  state.spawn.nextBurstInMs -= tickMs;

  const activeWorkCount = state.board.backlog.length + state.board.inProgress.length;
  if (activeWorkCount <= 1 && state.spawn.nextInMs > LOW_WORK_SPAWN_MAX_MS) {
    state.spawn.nextInMs = randomBetween(state, LOW_WORK_SPAWN_MIN_MS, LOW_WORK_SPAWN_MAX_MS);
  }

  if (state.spawn.nextBurstInMs <= 0) {
    const count = Math.min(1, 5 - state.board.backlog.length);
    for (let index = 0; index < count; index += 1) {
      if (state.board.backlog.length < 5) addTaskToBacklog(state, generateTask(state), emit);
    }
    state.spawn.nextBurstInMs = randomBetween(
      state,
      state.resources.trust < 40 ? 480000 : BURST_INTERVAL_MIN_MS,
      state.resources.trust < 40 ? 600000 : BURST_INTERVAL_MAX_MS,
    );
    state.spawn.nextInMs = randomSpawnInterval(state);
    return;
  }

  if (state.spawn.nextInMs <= 0) {
    addTaskToBacklog(state, generateTask(state), emit);
    state.spawn.nextInMs = randomSpawnInterval(state);
  }
}

function createCharacter(state: RtGameState, role: RtRole, name: string): RtCharacter {
  return {
    id: `C-${state.nextCharacterId++}`,
    name,
    role,
    skill: createCharacterSkills(state, role),
    specialty: createCharacterSpecialties(state, role),
    xp: { backend: 0, frontend: 0, design: 0, qa: 0, sre: 0, bugfix: 0 },
    stamina: 100,
    burnout: 0,
    assignedTaskId: null,
    shockGameMinutes: 0,
    exhaustedToday: false,
  };
}

function createCharacterSkills(state: RtGameState, role: RtRole): Record<RtStage, number> {
  const base = BASE_SKILLS[role];
  const primaryStage = ROLE_PRIMARY_STAGE[role];
  return {
    analysis: variedSkillValue(state, base.analysis, primaryStage === "analysis"),
    todo: variedSkillValue(state, base.todo, primaryStage === "todo"),
    test: variedSkillValue(state, base.test, primaryStage === "test"),
  };
}

function createCharacterSpecialties(
  state: RtGameState,
  role: RtRole,
): Record<RtSubtaskRole, number> {
  const base = BASE_SPECIALTIES[role];
  const primarySubtasks = ROLE_PRIMARY_SUBTASKS[role];
  return {
    backend: variedSpecialtyValue(state, base.backend, primarySubtasks.includes("backend")),
    frontend: variedSpecialtyValue(state, base.frontend, primarySubtasks.includes("frontend")),
    design: variedSpecialtyValue(state, base.design, primarySubtasks.includes("design")),
    qa: variedSpecialtyValue(state, base.qa, primarySubtasks.includes("qa")),
    sre: variedSpecialtyValue(state, base.sre, primarySubtasks.includes("sre")),
    bugfix: variedSpecialtyValue(state, base.bugfix, primarySubtasks.includes("bugfix")),
  };
}

function variedSkillValue(state: RtGameState, base: number, primary: boolean): number {
  const jitter = randomInt(state, -1, 1);
  const primaryBonus = primary ? randomInt(state, 0, 1) : 0;
  const minimum = primary ? 4 : 1;
  return clampStat(base + jitter + primaryBonus, minimum, 6);
}

function variedSpecialtyValue(state: RtGameState, base: number, primary: boolean): number {
  if (base <= 0) {
    return primary || randomInt(state, 1, 100) <= 20 ? 1 : 0;
  }
  const jitter = randomInt(state, -1, 1);
  const primaryBonus = primary ? randomInt(state, 0, 1) : 0;
  const minimum = primary ? 4 : 1;
  return clampStat(base + jitter + primaryBonus, minimum, 6);
}

function clampStat(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function randomSpawnInterval(state: RtGameState): number {
  const trustPressure = state.resources.trust < 40 ? 0.85 : state.resources.trust < 60 ? 0.95 : 1;
  const debtPressure = state.resources.debt > 60 ? 0.9 : 1;
  const backlogRelief = state.board.backlog.length >= 4 ? 1.6 : state.board.backlog.length >= 3 ? 1.25 : 1;
  const activeWorkCount = state.board.backlog.length + state.board.inProgress.length;
  if (activeWorkCount <= 1) {
    return Math.round(randomBetween(state, LOW_WORK_SPAWN_MIN_MS, LOW_WORK_SPAWN_MAX_MS));
  }
  return Math.round(
    randomBetween(state, SPAWN_INTERVAL_MIN_MS, SPAWN_INTERVAL_MAX_MS) *
      trustPressure *
      debtPressure *
      backlogRelief,
  );
}
