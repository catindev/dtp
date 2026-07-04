import {
  DAYS_PER_YEAR,
  GAME_DAY_MINUTES,
  RELEASE_TRAIN_GAME_MINUTE,
  assignCharacterToTask,
  canAssignCharacterToTask,
  canOutsourceTaskWork,
  createRealtimeState,
  moveRealtimeTask,
  outsourceTaskWork,
  releaseReadiness,
  startDayAfterMorningReport,
  tickRealtime,
  type RtGameState,
  type RtHorizonKind,
  type RtReleaseReadiness,
  type RtTask,
} from "../realtime/simulation";

type Scenario = "clean" | "mildDirty" | "heavyDirty";
type BotStyle = "competent" | "reckless";

const seedArg = Number(process.argv[2]);
const seed = Number.isFinite(seedArg) ? seedArg : 4242;
const batchSize = Number.isFinite(Number(process.env.DTP_AB_SEEDS))
  ? Math.max(1, Number(process.env.DTP_AB_SEEDS))
  : 12;

const oneCardResults = (["clean", "mildDirty", "heavyDirty"] as Scenario[]).map((scenario) =>
  runOneCardScenario(seed, scenario),
);
const longRunResults = (["competent", "reckless"] as BotStyle[]).map((style) =>
  runLongRunBatch(seed, style, batchSize),
);

console.log(
  JSON.stringify(
    {
      seed,
      batchSize,
      oneCard: {
        results: oneCardResults,
        verdict: evaluateOneCard(oneCardResults),
      },
      longRun: {
        results: longRunResults,
        verdict: evaluateLongRun(longRunResults),
      },
    },
    null,
    2,
  ),
);

function runOneCardScenario(seedValue: number, scenario: Scenario) {
  const state = createRealtimeState(seedValue);
  const taskId = state.board.backlog[0];
  const task = state.tasks[taskId];
  if (!task) throw new Error("No initial task to configure.");

  configureTask(task, scenario);
  moveRealtimeTask(state, task.id, "inProgress");
  moveRealtimeTask(state, task.id, "done");
  state.gameMinuteOfDay = RELEASE_TRAIN_GAME_MINUTE - 1;
  tickRealtime(state, 120000);

  const releasedTask = state.tasks[task.id];
  const report = state.morningReport;
  return {
    scenario,
    readiness: report?.shippedTaskIds.includes(task.id) ? releasedTask.releaseScore : null,
    resources: state.resources,
    consequences:
      report?.consequences.map((consequence) => ({
        source: consequence.source,
        cause: consequence.cause,
        generatedTaskId: consequence.generatedTaskId,
        terminal: consequence.terminal,
        effects: consequence.effects,
      })) ?? [],
    daySummary: report?.daySummary,
    log: state.log.slice(0, 8).map((event) => `${event.type}: ${event.title}`),
  };
}

function runLongRunBatch(baseSeed: number, style: BotStyle, count: number) {
  const runs = Array.from({ length: count }, (_value, index) =>
    runLongRun(baseSeed + index * 9973, style),
  );
  const survived = runs.filter((run) => run.survivedToDay80).length;
  const lost = runs.filter((run) => run.status === "lost").length;
  const averageDay = average(runs.map((run) => run.day));
  const averageTrust = average(runs.map((run) => run.resources.trust));
  const averageValue = average(runs.map((run) => run.resources.value));
  const averageDirty = average(runs.map((run) => run.releaseMix.dirty));
  const averageClean = average(runs.map((run) => run.releaseMix.clean));

  return {
    style,
    count,
    survived,
    survivalRate: round(survived / count),
    lost,
    averageDay,
    averageTrust,
    averageValue,
    averageClean,
    averageDirty,
    samples: runs.slice(0, 5),
  };
}

function runLongRun(seedValue: number, style: BotStyle) {
  const state = createRealtimeState(seedValue);
  const maxTicks = DAYS_PER_YEAR * GAME_DAY_MINUTES * 2 + 400;
  for (let index = 0; index < maxTicks; index += 1) {
    if (state.morningReport) {
      startDayAfterMorningReport(state);
    }
    if (state.status !== "running" || state.day > DAYS_PER_YEAR) break;
    runBotActions(state, style);
    tickRealtime(state, 5000);
  }

  const releaseMix = countReleaseMix(state);
  return {
    seed: seedValue,
    style,
    status: state.status,
    day: state.day,
    survivedToDay80: state.day > DAYS_PER_YEAR || (state.day === DAYS_PER_YEAR && state.status === "running"),
    resources: state.resources,
    releaseMix,
    activeGoals: summarizeGoals(state),
    unresolvedFallout: Object.values(state.tasks).filter(
      (task) => Boolean(task.rootCauseTaskId) && !task.resolved && !task.released,
    ).length,
  };
}

function runBotActions(state: RtGameState, style: BotStyle): void {
  moveBacklogIntoWork(state, style);
  moveFinishedWorkToDone(state, style);
  assignAvailableCharacters(state, style);
  tryOutsourceBlockedWork(state, style);
}

function moveBacklogIntoWork(state: RtGameState, style: BotStyle): void {
  const inProgressLimit = style === "competent" ? 3 : 8;
  const backlogIds = [...state.board.backlog];
  for (const taskId of backlogIds) {
    if (state.board.inProgress.length >= inProgressLimit) return;
    moveRealtimeTask(state, taskId, "inProgress");
  }
}

function moveFinishedWorkToDone(state: RtGameState, style: BotStyle): void {
  for (const taskId of [...state.board.inProgress]) {
    const task = state.tasks[taskId];
    if (!task || task.assignedCharacterId || task.outsourcing) continue;
    const readiness = releaseReadiness(task).readiness;
    if (style === "reckless") {
      if (task.workDone || task.stageComplete || readiness !== "dirty") moveRealtimeTask(state, taskId, "done");
      continue;
    }
    if (readiness === "clean" || shouldAcceptRisk(task, readiness)) {
      moveRealtimeTask(state, taskId, "done");
    }
  }
}

function assignAvailableCharacters(state: RtGameState, style: BotStyle): void {
  const minimumStamina = style === "competent" ? 32 : 1;
  const characters = Object.values(state.characters)
    .filter((character) => !character.assignedTaskId && !character.exhaustedToday && character.stamina >= minimumStamina)
    .sort((left, right) => right.stamina - left.stamina);

  for (const character of characters) {
    const task = pickTaskForCharacter(state, character.id, style);
    if (task) assignCharacterToTask(state, character.id, task.id);
  }
}

function tryOutsourceBlockedWork(state: RtGameState, style: BotStyle): void {
  if (style !== "competent" || state.resources.budget < 4) return;
  for (const taskId of state.board.inProgress) {
    const task = state.tasks[taskId];
    if (!task || task.assignedCharacterId || task.outsourcing) continue;
    if (releaseReadiness(task).readiness === "dirty" && canOutsourceTaskWork(state, taskId)) {
      outsourceTaskWork(state, taskId);
      return;
    }
  }
}

function pickTaskForCharacter(state: RtGameState, characterId: string, style: BotStyle): RtTask | null {
  const candidates = state.board.inProgress
    .map((taskId) => state.tasks[taskId])
    .filter((task): task is RtTask => Boolean(task) && !task.assignedCharacterId && !task.outsourcing)
    .filter((task) => canAssignCharacterToTask(state, characterId, task.id));
  if (candidates.length === 0) return null;
  candidates.sort((left, right) => taskPriority(right, style) - taskPriority(left, style));
  return candidates[0];
}

function taskPriority(task: RtTask, style: BotStyle): number {
  const readiness = releaseReadiness(task).readiness;
  const readinessWeight: Record<RtReleaseReadiness, number> = {
    dirty: style === "competent" ? 40 : 12,
    risky: 20,
    clean: 4,
  };
  const deadlinePressure = task.deadlineMaxMs > 0 ? 1 - task.deadlineMs / task.deadlineMaxMs : 1;
  const valueWeight = task.value / 10;
  return readinessWeight[readiness] + deadlinePressure * 20 + valueWeight + task.pressure * 2;
}

function shouldAcceptRisk(task: RtTask, readiness: RtReleaseReadiness): boolean {
  if (readiness === "dirty") return false;
  const deadlineRatio = task.deadlineMaxMs > 0 ? task.deadlineMs / task.deadlineMaxMs : 1;
  return task.overdueMs > 900000 && deadlineRatio < 0.02;
}

function countReleaseMix(state: RtGameState) {
  const released = Object.values(state.tasks).filter((task) => task.released);
  return {
    clean: released.filter((task) => releaseReadiness(task).readiness === "clean").length,
    risky: released.filter((task) => releaseReadiness(task).readiness === "risky").length,
    dirty: released.filter((task) => releaseReadiness(task).readiness === "dirty").length,
  };
}

function summarizeGoals(state: RtGameState) {
  return Object.fromEntries(
    (["week", "month", "quarter", "year"] as RtHorizonKind[]).map((kind) => {
      const goal = state.horizonGoals[kind];
      return [
        kind,
        goal
          ? {
              id: goal.id,
              openedOnDay: goal.openedOnDay,
              endsOnDay: goal.endsOnDay,
              currentValue: goal.currentValue,
              expectedValue: goal.expectedValue,
              trust: state.resources.trust,
              targetTrust: goal.targetTrust,
            }
          : null,
      ];
    }),
  );
}

function configureTask(task: RtTask, scenario: Scenario): void {
  task.domain = "payments";
  task.kind = "integration";
  task.pressure = scenario === "heavyDirty" ? 5 : 2;
  task.complexity = scenario === "heavyDirty" ? 5 : 2;
  task.value = scenario === "heavyDirty" ? 42 : 24;
  task.blastRadius = scenario === "heavyDirty" ? "high" : "low";
  task.deadlineMs = scenario === "heavyDirty" ? 20000 : 260000;
  task.deadlineMaxMs = 420000;
  task.clarity = scenario === "heavyDirty" ? 35 : 92;
  task.quality = scenario === "heavyDirty" ? 35 : 96;
  task.bugs = scenario === "heavyDirty" ? 2 : 0;
  task.workDone = scenario !== "heavyDirty";
  task.testCoverage = scenario === "clean" ? 88 : scenario === "mildDirty" ? 35 : 0;
  task.changedAfterQa = scenario === "mildDirty";
  task.subtasks = [
    {
      id: `${task.id}-A`,
      title: "Implement integration contract",
      role: "backend",
      importance: "critical",
      revealed: true,
      done: scenario !== "heavyDirty",
      progress: scenario === "heavyDirty" ? 0 : 100,
      completedBy: scenario === "heavyDirty" ? null : "debug",
      offRole: false,
    },
    {
      id: `${task.id}-B`,
      title: "Validate failure modes",
      role: "qa",
      importance: "important",
      revealed: true,
      done: scenario !== "heavyDirty",
      progress: scenario === "heavyDirty" ? 0 : 100,
      completedBy: scenario === "heavyDirty" ? null : "debug",
      offRole: false,
    },
  ];
}

function evaluateOneCard(results: ReturnType<typeof runOneCardScenario>[]) {
  const clean = results.find((result) => result.scenario === "clean");
  const mildDirty = results.find((result) => result.scenario === "mildDirty");
  const heavyDirty = results.find((result) => result.scenario === "heavyDirty");
  const mildHasNowReward =
    Boolean(clean && mildDirty) && mildDirty!.resources.value > 0 && mildDirty!.resources.trust >= clean!.resources.trust - 5;
  const mildHasTail = Boolean(mildDirty?.consequences.length);
  const heavyIsDangerous =
    Boolean(heavyDirty) &&
    (heavyDirty!.resources.trust < (mildDirty?.resources.trust ?? 100) ||
      heavyDirty!.resources.debt > (mildDirty?.resources.debt ?? 0));
  return {
    mildDirtyStillTempting: mildHasNowReward,
    mildDirtyHasTomorrowCost: mildHasTail,
    heavyDirtyWorseThanMild: heavyIsDangerous,
    pass: mildHasNowReward && mildHasTail && heavyIsDangerous,
  };
}

function evaluateLongRun(results: ReturnType<typeof runLongRunBatch>[]) {
  const competent = results.find((result) => result.style === "competent");
  const reckless = results.find((result) => result.style === "reckless");
  return {
    competentSurvivalRate: competent?.survivalRate ?? 0,
    recklessSurvivalRate: reckless?.survivalRate ?? 0,
    separation: round((competent?.survivalRate ?? 0) - (reckless?.survivalRate ?? 0)),
    needsTuning:
      !competent ||
      !reckless ||
      competent.survivalRate < 0.35 ||
      competent.survivalRate > 0.95 ||
      reckless.survivalRate > 0.55,
  };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
