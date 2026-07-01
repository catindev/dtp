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
  CHARACTER_NAMES,
} from "./catalog";
import { randomBetween } from "./rng";
import { generateTask } from "./taskFactory";
import type {
  RtCharacter,
  RtEvent,
  RtGameState,
  RtRole,
  RtSpawnState,
  RtTask,
} from "./types";

type SpawnEventSink = (event: Omit<RtEvent, "at">) => void;

export const STARTING_ROLES: RtRole[] = ["analyst", "backend", "frontend", "qa", "sre"];

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
  for (const role of STARTING_ROLES) {
    const character = createCharacter(state, role);
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
  emit({
    type: "task_spawned",
    title: `${task.id} arrived`,
    body: task.title,
    effects: [`clarity ${task.clarity}`, `deadline ${Math.round(task.deadlineMs / 1000)}s`],
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

function createCharacter(state: RtGameState, role: RtRole): RtCharacter {
  return {
    id: `C-${state.nextCharacterId++}`,
    name:
      CHARACTER_NAMES[
        (state.nextCharacterId + Object.keys(state.characters).length) % CHARACTER_NAMES.length
      ],
    role,
    skill: { ...BASE_SKILLS[role] },
    specialty: { ...BASE_SPECIALTIES[role] },
    xp: { backend: 0, frontend: 0, design: 0, qa: 0, sre: 0, bugfix: 0 },
    stamina: 100,
    burnout: 0,
    assignedTaskId: null,
    shockGameMinutes: 0,
    exhaustedToday: false,
  };
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
