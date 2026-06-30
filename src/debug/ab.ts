import {
  RELEASE_TRAIN_GAME_MINUTE,
  createRealtimeState,
  moveRealtimeTask,
  tickRealtime,
  type RtGameState,
  type RtTask,
} from "../realtime/simulation";

type Scenario = "clean" | "mildDirty" | "heavyDirty";

const seedArg = Number(process.argv[2]);
const seed = Number.isFinite(seedArg) ? seedArg : 4242;
const scenarios: Scenario[] = ["clean", "mildDirty", "heavyDirty"];

const results = scenarios.map((scenario) => runScenario(seed, scenario));

console.log(JSON.stringify({ seed, results, verdict: evaluate(results) }, null, 2));

function runScenario(seedValue: number, scenario: Scenario) {
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
    readiness: report?.shippedTaskIds.includes(task.id)
      ? releasedTask.releaseScore
      : null,
    resources: state.resources,
    consequences: report?.consequences.map((consequence) => ({
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

function evaluate(results: ReturnType<typeof runScenario>[]) {
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
