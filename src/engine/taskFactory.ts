import { DOMAINS, DOMAIN_PREFIXES } from "./catalog";
import { TASK_TITLES } from "./content";
import { normalizeEngineLocale } from "./locale";
import { clamp } from "./math";
import {
  pickOne,
  randomBetween,
  randomInt,
} from "./rng";
import {
  chooseBlastRadius,
  chooseTaskKind,
  kindValueMultiplier,
} from "./taskKind";
import {
  generateSubtasks,
  revealInitialSubtasks,
  shouldBiasFrontendWork,
} from "./taskSubtasks";
import type {
  RtGameState,
  RtTask,
  RtTaskKind,
} from "./types";

export { inferBlastRadius } from "./taskKind";

export function generateTask(state: RtGameState, forcedKind?: RtTaskKind): RtTask {
  const kind = forcedKind ?? chooseTaskKind(state);
  const domain = pickOne(state, DOMAINS);
  const id = `${DOMAIN_PREFIXES[domain]}-${String(state.nextTaskId++).padStart(3, "0")}`;
  const pressure = kind === "incident" ? randomInt(state, 4, 6) : randomInt(state, 1, 5);
  const complexity = randomInt(state, 1, 5);
  const blastRadius = chooseBlastRadius(state, kind, complexity, pressure);
  const trustNoise = (100 - state.resources.trust) * 0.45;
  const debtNoise = state.resources.debt * 0.1;
  const clarity = clamp(randomInt(state, 48, 88) - trustNoise - debtNoise, 8, 92);
  const deadlineMs = Math.round(
    randomBetween(state, 520000, 780000) + complexity * 45000 - pressure * 15000,
  );
  const value = Math.round((8 + complexity * 4 + pressure * 3) * kindValueMultiplier(kind));
  const locale = normalizeEngineLocale(state.locale);
  const subtasks = generateSubtasks(
    state,
    id,
    domain,
    kind,
    complexity,
    blastRadius,
    forcedKind ? false : shouldBiasFrontendWork(state),
  );
  revealInitialSubtasks(state, subtasks, Math.round(clarity));

  return {
    id,
    title: `${id}: ${pickOne(state, TASK_TITLES[locale][kind])}`,
    kind,
    domain,
    blastRadius,
    column: "backlog",
    pressure,
    complexity,
    value,
    clarity: Math.round(clarity),
    quality: Math.max(0, Math.round(clarity * 0.25)),
    testCoverage: 0,
    bugs: 0,
    changedAfterQa: false,
    workDone: false,
    subtasks,
    currentSubtaskId: null,
    offRolePenalty: 0,
    postmortem: [],
    deadlineMs: Math.max(420000, deadlineMs),
    deadlineMaxMs: Math.max(420000, deadlineMs),
    overdueMs: 0,
    stageProgress: 0,
    stageComplete: false,
    assignedCharacterId: null,
    outsourcing: null,
    released: false,
    rootCauseTaskId: null,
    sourceTaskId: null,
    chainDepth: 0,
    resolved: false,
    resolution: null,
    resolutionDay: null,
    releaseScore: null,
    queuedDeadlineMs: null,
    lastNote: "Waiting in backlog.",
  };
}
