import {
  DAYS_PER_YEAR,
  GAME_DAY_MINUTES,
  RELEASE_TRAIN_GAME_MINUTE,
  assignCharacterToTask,
  backlogValueRatio,
  canAssignCharacterToTask,
  createRealtimeState,
  getOutsourceTaskWorkStatus,
  moveRealtimeTask,
  outsourceTaskWork,
  releaseReadiness,
  startDayAfterMorningReport,
  tickRealtime,
  type RtCharacter,
  type RtGameState,
  type RtReleaseReadiness,
  type RtRiskReason,
  type RtRole,
  type RtSubtask,
  type RtSubtaskImportance,
  type RtSubtaskRole,
  type RtTask,
} from "../realtime/simulation";
import { RELEASE_QA_COVERAGE_THRESHOLD } from "../engine/balance";

type VolodyaCounters = {
  committed: number;
  queued: Record<RtReleaseReadiness, number>;
  assigned: Record<RtRole, number>;
  outsourced: Record<string, number>;
};

const seedArg = Number(process.argv[2]);
const baseSeed = Number.isFinite(seedArg) ? seedArg : 515151;
const batchSize = Number.isFinite(Number(process.env.DTP_VOLODYA_SEEDS))
  ? Math.max(1, Number(process.env.DTP_VOLODYA_SEEDS))
  : 8;

const runs = Array.from({ length: batchSize }, (_value, index) =>
  runVolodyaLongRun(baseSeed + index * 9973),
);

console.log(
  JSON.stringify(
    {
      bot: "volodya",
      baseSeed,
      batchSize,
      sourcePatterns: {
        wip: "keeps roughly 2-4 active tasks, commits backlog quickly when capacity exists",
        quality: "targets clean releases, accepts risky when deadline/value pressure is real",
        qa: "uses QA heavily, rechecks after bugfixes, protects QA stamina until pressure rises",
        analysis: "uses analysis often but not on every task before development starts",
        outsourcing: "spends budget mostly on missing competence, QA rechecks, and deadline blockers",
      },
      aggregate: summarizeRuns(runs),
      samples: runs.slice(0, 5),
    },
    null,
    2,
  ),
);

function runVolodyaLongRun(seed: number) {
  const state = createRealtimeState(seed);
  const counters = createCounters();
  const maxTicks = DAYS_PER_YEAR * GAME_DAY_MINUTES * 2 + 1200;

  for (let index = 0; index < maxTicks; index += 1) {
    if (state.morningReport) {
      startDayAfterMorningReport(state);
    }
    if (state.status !== "running" || state.day > DAYS_PER_YEAR) break;

    runVolodyaActions(state, counters);
    tickRealtime(state, 5000);
  }

  return {
    seed,
    status: state.status,
    day: state.day,
    resources: state.resources,
    counters,
    board: {
      backlog: state.board.backlog.length,
      inProgress: state.board.inProgress.length,
      done: state.board.done.length,
      released: state.board.released.length,
    },
    releaseMix: countReleaseMix(state),
    fallout: {
      created: state.log.filter((event) => event.type === "release_consequence_spawned").length,
      unresolved: Object.values(state.tasks).filter(
        (task) => Boolean(task.rootCauseTaskId) && !task.resolved && !task.released,
      ).length,
    },
    team: Object.values(state.characters).map((character) => ({
      id: character.id,
      role: character.role,
      stamina: Math.round(character.stamina),
      burnout: Math.round(character.burnout),
      exhaustedToday: character.exhaustedToday,
    })),
  };
}

function runVolodyaActions(state: RtGameState, counters: VolodyaCounters): void {
  moveBacklogIntoWork(state, counters);
  assignAvailableCharacters(state, counters);
  tryOutsourceBlockedWork(state, counters);
  moveFinishedWorkToDone(state, counters);
}

function moveBacklogIntoWork(state: RtGameState, counters: VolodyaCounters): void {
  const targetWip = targetWorkInProgress(state);

  while (state.board.inProgress.length < targetWip && state.board.backlog.length > 0) {
    const task = [...state.board.backlog]
      .map((taskId) => state.tasks[taskId])
      .filter((candidate): candidate is RtTask => Boolean(candidate))
      .sort((left, right) => backlogPriority(right) - backlogPriority(left))[0];

    if (!task || !moveRealtimeTask(state, task.id, "inProgress")) return;
    counters.committed += 1;
  }
}

function moveFinishedWorkToDone(state: RtGameState, counters: VolodyaCounters): void {
  for (const taskId of [...state.board.inProgress]) {
    const task = state.tasks[taskId];
    if (!task || task.assignedCharacterId || task.outsourcing) continue;

    const report = releaseReadiness(task);
    if (!shouldQueueForRelease(state, task, report.readiness, report.reasons)) continue;

    if (moveRealtimeTask(state, task.id, "done")) {
      counters.queued[report.readiness] += 1;
    }
  }
}

function assignAvailableCharacters(state: RtGameState, counters: VolodyaCounters): void {
  const characters = Object.values(state.characters)
    .filter((character) => !character.assignedTaskId && !character.exhaustedToday)
    .sort(characterPriority);

  for (const character of characters) {
    const task = pickTaskForCharacter(state, character);
    if (!task) continue;

    const minStamina = minimumStaminaForAssignment(state, character, task);
    if (character.stamina < minStamina) continue;

    if (assignCharacterToTask(state, character.id, task.id)) {
      counters.assigned[character.role] += 1;
    }
  }
}

function tryOutsourceBlockedWork(state: RtGameState, counters: VolodyaCounters): void {
  if (state.resources.budget < 3) return;

  const candidates = state.board.inProgress
    .map((taskId) => state.tasks[taskId])
    .filter((task): task is RtTask => Boolean(task) && !task.assignedCharacterId && !task.outsourcing)
    .map((task) => ({
      task,
      status: getOutsourceTaskWorkStatus(state, task.id),
      score: outsourcePriority(state, task),
    }))
    .filter(({ status }) => status.allowed && status.subtask && status.cost !== null)
    .sort((left, right) => right.score - left.score);

  for (const { task, status, score } of candidates) {
    if (score < 35 || !status.subtask) continue;
    if (outsourceTaskWork(state, task.id)) {
      const key = `${status.subtask.role}:${status.subtask.importance}`;
      counters.outsourced[key] = (counters.outsourced[key] ?? 0) + 1;
      return;
    }
  }
}

function pickTaskForCharacter(state: RtGameState, character: RtCharacter): RtTask | null {
  const candidates = state.board.inProgress
    .map((taskId) => state.tasks[taskId])
    .filter((task): task is RtTask => Boolean(task) && !task.assignedCharacterId && !task.outsourcing)
    .filter((task) => canAssignCharacterToTask(state, character.id, task.id))
    .filter((task) => character.role !== "analyst" || shouldSpendAnalysis(task, character));

  if (candidates.length === 0) return null;
  candidates.sort(
    (left, right) =>
      taskPriorityForCharacter(state, right, character) -
      taskPriorityForCharacter(state, left, character),
  );
  return candidates[0];
}

function shouldQueueForRelease(
  state: RtGameState,
  task: RtTask,
  readiness: RtReleaseReadiness,
  reasons: RtRiskReason[],
): boolean {
  if (readiness === "clean") return true;

  const deadlineRatio = taskDeadlineRatio(task);
  const closeToRelease = state.gameMinuteOfDay >= RELEASE_TRAIN_GAME_MINUTE - 75;
  const overdue = task.overdueMs > 0 || task.deadlineMs <= 0;
  const valuePressure = task.value >= 24 || task.pressure >= 4 || task.blastRadius === "high";
  const trustCushion = state.resources.trust >= 68;
  const fixableNow = canStillImproveTask(state, task);

  if (readiness === "risky") {
    if (fixableNow && (!overdue || !closeToRelease)) return false;
    if (overdue) return true;
    if (deadlineRatio < 0.12 && valuePressure) return true;
    if (closeToRelease && trustCushion && !fixableNow && !reasons.includes("not_implemented")) return true;
    return false;
  }

  if (!trustCushion) return false;
  if (reasons.includes("not_implemented") || reasons.includes("critical_open")) return false;
  if (fixableNow && !closeToRelease) return false;
  return overdue && (closeToRelease || deadlineRatio < 0.02);
}

function canStillImproveTask(state: RtGameState, task: RtTask): boolean {
  if (task.assignedCharacterId || task.outsourcing) return true;
  if (
    Object.values(state.characters).some(
      (character) =>
        !character.assignedTaskId &&
        !character.exhaustedToday &&
        character.stamina >= minimumStaminaForAssignment(state, character, task) &&
        canAssignCharacterToTask(state, character.id, task.id) &&
        (character.role !== "analyst" || shouldSpendAnalysis(task, character)),
    )
  ) {
    return true;
  }
  const outsource = getOutsourceTaskWorkStatus(state, task.id);
  return outsource.allowed && outsource.cost !== null && state.resources.budget >= outsource.cost;
}

function targetWorkInProgress(state: RtGameState): number {
  const idleTeam = Object.values(state.characters).filter(
    (character) => !character.assignedTaskId && !character.exhaustedToday && character.stamina >= 28,
  ).length;
  const backlogPressure = state.board.backlog.length >= 4;
  const releaseWindow = state.gameMinuteOfDay >= RELEASE_TRAIN_GAME_MINUTE - 120;

  if (releaseWindow) return 2;
  if (backlogPressure) return 3;
  if (idleTeam >= 4) return 3;
  return 2;
}

function backlogPriority(task: RtTask): number {
  const lostOpportunity = 1 - backlogValueRatio(task);
  const falloutWeight = task.rootCauseTaskId ? 24 : 0;
  const impactWeight = task.blastRadius === "high" ? 14 : task.blastRadius === "medium" ? 7 : 0;

  return (
    falloutWeight +
    impactWeight +
    task.pressure * 8 +
    task.value / 3 +
    lostOpportunity * 36 +
    (task.kind === "incident" || task.kind === "compliance" ? 12 : 0)
  );
}

function taskPriorityForCharacter(
  state: RtGameState,
  task: RtTask,
  character: RtCharacter,
): number {
  const report = releaseReadiness(task);
  const urgency = urgencyScore(task);
  const readinessWeight: Record<RtReleaseReadiness, number> = {
    dirty: 44,
    risky: 28,
    clean: 4,
  };

  let score =
    readinessWeight[report.readiness] +
    urgency +
    task.pressure * 5 +
    task.value / 5 +
    (task.rootCauseTaskId ? 18 : 0);

  if (character.role === "analyst") {
    score += analysisPriority(task, report.reasons, urgency);
  } else if (character.role === "qa") {
    score += qaPriority(task, report.reasons);
  } else {
    score += implementationPriority(task, character);
  }

  if (task.stageComplete) score += 5;
  return score;
}

function shouldSpendAnalysis(task: RtTask, character: RtCharacter): boolean {
  const hiddenOpen = task.subtasks.some((subtask) => !subtask.revealed && !subtask.done);
  const report = releaseReadiness(task);
  const deadlineRatio = taskDeadlineRatio(task);
  const lowClarity = task.clarity < 72 || report.reasons.includes("low_clarity");
  const plentyOfStamina = character.stamina >= 55;

  if (hiddenOpen) return true;
  if (task.clarity < 58) return true;
  if (lowClarity && deadlineRatio > 0.18) return true;
  return plentyOfStamina && task.clarity < 86 && report.readiness !== "clean";
}

function analysisPriority(task: RtTask, reasons: RtRiskReason[], urgency: number): number {
  const hiddenOpen = task.subtasks.filter((subtask) => !subtask.revealed && !subtask.done).length;
  return (
    hiddenOpen * 28 +
    Math.max(0, 86 - task.clarity) * 0.8 +
    (reasons.includes("low_clarity") ? 24 : 0) -
    (urgency > 24 ? 10 : 0)
  );
}

function qaPriority(task: RtTask, reasons: RtRiskReason[]): number {
  return (
    (reasons.includes("changed_after_qa") ? 58 : 0) +
    (reasons.includes("no_qa") ? 48 : 0) +
    (reasons.includes("known_bug") ? 34 : 0) +
    Math.max(0, RELEASE_QA_COVERAGE_THRESHOLD - task.testCoverage) * 0.8 +
    task.bugs * 10 +
    openSubtasks(task).filter((subtask) => subtask.role === "qa").length * 18
  );
}

function implementationPriority(task: RtTask, character: RtCharacter): number {
  const open = openSubtasks(task);
  const matching = open.filter((subtask) => roleMatchesSubtask(character.role, subtask.role));
  const offRole = open.filter((subtask) => !roleMatchesSubtask(character.role, subtask.role));
  const work = matching.length > 0 ? matching : offRole;

  if (work.length === 0) return 0;
  const importance = Math.max(...work.map((subtask) => importanceScore(subtask.importance)));
  const roleFit = Math.max(...work.map((subtask) => character.specialty[subtask.role] ?? 0));
  const offRolePenalty = matching.length > 0 ? 0 : -18;
  return 24 + importance + roleFit * 6 + offRolePenalty;
}

function outsourcePriority(state: RtGameState, task: RtTask): number {
  const status = getOutsourceTaskWorkStatus(state, task.id);
  const subtask = status.subtask;
  if (!status.allowed || !subtask) return 0;

  const report = releaseReadiness(task);
  const urgency = urgencyScore(task);
  const qaUnavailable = !Object.values(state.characters).some(
    (character) =>
      character.role === "qa" &&
      !character.assignedTaskId &&
      !character.exhaustedToday &&
      character.stamina >= 22,
  );
  const missingCompetence = !Object.values(state.characters).some(
    (character) =>
      !character.assignedTaskId &&
      !character.exhaustedToday &&
      character.stamina >= 26 &&
      roleMatchesSubtask(character.role, subtask.role),
  );

  return (
    (subtask.role === "design" ? 60 : 0) +
    (subtask.role === "qa" && qaUnavailable ? 44 : 0) +
    (missingCompetence ? 24 : 0) +
    (report.readiness === "dirty" ? 20 : report.readiness === "risky" ? 10 : 0) +
    urgency +
    importanceScore(subtask.importance) -
    (state.resources.budget <= 4 && subtask.importance === "optional" ? 18 : 0)
  );
}

function minimumStaminaForAssignment(
  state: RtGameState,
  character: RtCharacter,
  task: RtTask,
): number {
  const urgent = task.deadlineMs <= 0 || taskDeadlineRatio(task) < 0.18;
  const closeToRelease = state.gameMinuteOfDay >= RELEASE_TRAIN_GAME_MINUTE - 90;
  const burnoutTax = Math.min(12, Math.floor(character.burnout * 0.8));
  const base: Record<RtRole, number> = {
    analyst: 38,
    designer: 30,
    backend: 24,
    frontend: 24,
    qa: 30,
    sre: 24,
  };

  if (urgent || closeToRelease) return Math.max(10, base[character.role] - 14 + burnoutTax);
  return base[character.role] + burnoutTax;
}

function characterPriority(left: RtCharacter, right: RtCharacter): number {
  const roleWeight: Record<RtRole, number> = {
    qa: 6,
    analyst: 5,
    backend: 4,
    frontend: 4,
    sre: 4,
    designer: 3,
  };
  return roleWeight[right.role] - roleWeight[left.role] || right.stamina - left.stamina;
}

function urgencyScore(task: RtTask): number {
  if (task.deadlineMs <= 0) return 40;
  return (1 - taskDeadlineRatio(task)) * 34;
}

function taskDeadlineRatio(task: RtTask): number {
  if (task.deadlineMaxMs <= 0) return 1;
  return Math.max(0, Math.min(1, task.deadlineMs / task.deadlineMaxMs));
}

function openSubtasks(task: RtTask): RtSubtask[] {
  return task.subtasks.filter((subtask) => subtask.revealed && !subtask.done);
}

function roleMatchesSubtask(role: RtRole, subtaskRole: RtSubtaskRole): boolean {
  if (role === subtaskRole) return true;
  if (role === "designer" && subtaskRole === "design") return true;
  if ((role === "backend" || role === "frontend" || role === "sre") && subtaskRole === "bugfix") {
    return true;
  }
  return false;
}

function importanceScore(importance: RtSubtaskImportance): number {
  if (importance === "critical") return 32;
  if (importance === "important") return 20;
  return 8;
}

function countReleaseMix(state: RtGameState): Record<RtReleaseReadiness, number> {
  const released = Object.values(state.tasks).filter((task) => task.released);
  return {
    clean: released.filter((task) => releaseReadiness(task).readiness === "clean").length,
    risky: released.filter((task) => releaseReadiness(task).readiness === "risky").length,
    dirty: released.filter((task) => releaseReadiness(task).readiness === "dirty").length,
  };
}

function summarizeRuns(runs: ReturnType<typeof runVolodyaLongRun>[]) {
  const count = Math.max(1, runs.length);
  const statuses = runs.reduce<Record<string, number>>((acc, run) => {
    acc[run.status] = (acc[run.status] ?? 0) + 1;
    return acc;
  }, {});

  return {
    statuses,
    averageDay: round(average(runs.map((run) => run.day))),
    averageTrust: round(average(runs.map((run) => run.resources.trust))),
    averageClients: round(average(runs.map((run) => run.resources.clients))),
    averageValue: round(average(runs.map((run) => run.resources.value))),
    averageDebt: round(average(runs.map((run) => run.resources.debt))),
    releaseMix: {
      clean: round(sum(runs.map((run) => run.releaseMix.clean)) / count),
      risky: round(sum(runs.map((run) => run.releaseMix.risky)) / count),
      dirty: round(sum(runs.map((run) => run.releaseMix.dirty)) / count),
    },
    queuedByBot: {
      clean: round(sum(runs.map((run) => run.counters.queued.clean)) / count),
      risky: round(sum(runs.map((run) => run.counters.queued.risky)) / count),
      dirty: round(sum(runs.map((run) => run.counters.queued.dirty)) / count),
    },
    assignments: mergeCounterAverage(runs.map((run) => run.counters.assigned), count),
    outsourced: mergeCounterAverage(runs.map((run) => run.counters.outsourced), count),
  };
}

function createCounters(): VolodyaCounters {
  return {
    committed: 0,
    queued: {
      clean: 0,
      risky: 0,
      dirty: 0,
    },
    assigned: {
      analyst: 0,
      designer: 0,
      backend: 0,
      frontend: 0,
      qa: 0,
      sre: 0,
    },
    outsourced: {},
  };
}

function mergeCounterAverage(
  counters: Array<Record<string, number>>,
  divisor: number,
): Record<string, number> {
  const merged: Record<string, number> = {};
  for (const counter of counters) {
    for (const [key, value] of Object.entries(counter)) {
      merged[key] = (merged[key] ?? 0) + value;
    }
  }
  return Object.fromEntries(
    Object.entries(merged)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, round(value / divisor)]),
  );
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return sum(values) / values.length;
}

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
