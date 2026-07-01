import {
  RELEASE_TRAIN_GAME_MINUTE,
  assignCharacterToTask,
  canAssignCharacterToTask,
  createRealtimeState,
  moveRealtimeTask,
  releaseReadiness,
  runDailyReleaseTrain,
  startDayAfterMorningReport,
  tickRealtime,
  type RtGameState,
  type RtTask,
} from "../realtime/simulation";

const seedArg = Number(process.argv[2]);
const seed = Number.isFinite(seedArg) ? seedArg : 184;
const state = createRealtimeState(seed);
assertQuarterCadence(state);
const smoke = [runQuarterBoundarySmoke(), runMissedWorkSmoke()];

const taskId = state.board.backlog[0];
const analystId = Object.values(state.characters).find((character) => character.role === "analyst")?.id;

moveRealtimeTask(state, taskId, "inProgress");
if (analystId) assignCharacterToTask(state, analystId, taskId);
tickUntilTaskIdle(taskId, 500);

for (let index = 0; index < 8; index += 1) {
  const task = state.tasks[taskId];
  if (!task || isTaskReadyForDone(taskId)) break;
  const worker = pickWorkerForTask(taskId);
  if (!worker) break;
  assignCharacterToTask(state, worker, taskId);
  tickUntilTaskIdle(taskId, 700);
}

moveRealtimeTask(state, taskId, "done");
const shipped = runDailyReleaseTrain(state);

console.log(
  JSON.stringify(
    {
      seed,
      status: state.status,
      time: state.gameMinuteOfDay,
      released: state.tasks[taskId]?.released,
      shipped,
      releaseScore: state.tasks[taskId]?.releaseScore,
      trust: state.resources.trust,
      clients: state.resources.clients,
      debt: state.resources.debt,
      value: state.resources.value,
      tasks: Object.keys(state.tasks).length,
      backlog: state.board.backlog.length,
      smoke,
      log: state.log.slice(0, 8).map((event) => event.title),
    },
    null,
    2,
  ),
);

function tickUntilTaskIdle(taskId: string, limit: number): void {
  for (let index = 0; index < limit; index += 1) {
    const task = state.tasks[taskId];
    if (!task?.assignedCharacterId) return;
    tickRealtime(state, 500);
  }
}

function assertQuarterCadence(currentState: typeof state): void {
  if (currentState.daysPerQuarter < 5) {
    throw new Error(`Expected daysPerQuarter >= 5, got ${currentState.daysPerQuarter}.`);
  }
}

function runQuarterBoundarySmoke() {
  const currentState = createRealtimeState(777);
  assertQuarterCadence(currentState);
  currentState.day = currentState.daysPerQuarter;
  currentState.dayInQuarter = currentState.daysPerQuarter;
  currentState.quarterValue = currentState.quarterGoal.value;
  currentState.resources.trust = currentState.quarterGoal.trust + 5;

  const controlledTaskId = currentState.board.backlog[0];
  const controlledTask = currentState.tasks[controlledTaskId];
  assert(Boolean(controlledTask), "Quarter smoke expected an initial task.");
  configureCleanReleaseTask(controlledTask);
  assert(releaseReadiness(controlledTask).readiness === "clean", "Quarter smoke task should be clean.");
  assert(moveRealtimeTask(currentState, controlledTask.id, "inProgress"), "Quarter smoke move to work failed.");
  assert(moveRealtimeTask(currentState, controlledTask.id, "done"), "Quarter smoke move to Done failed.");

  tickToMorningReport(currentState);
  const report = currentState.morningReport;
  assert(report !== null, "Quarter smoke expected morning report.");
  assert(report.shippedTaskIds.includes(controlledTask.id), "Quarter smoke expected shipped task.");
  assert(Boolean(report.quarterReview), "Quarter smoke expected quarter review.");
  assert(report.quarterReview?.hitGoal === true, "Quarter smoke expected goals met.");
  assert(currentState.dayInQuarter === 1, "Quarter smoke expected new quarter day 1.");
  assert(startDayAfterMorningReport(currentState), "Quarter smoke expected briefing continue.");

  return {
    name: "quarter-boundary",
    shipped: report.shippedTaskIds.length,
    quarterReview: report.quarterReview?.hitGoal ? "met" : "missed",
    dayInQuarter: currentState.dayInQuarter,
  };
}

function runMissedWorkSmoke() {
  const currentState = createRealtimeState(888);
  assertQuarterCadence(currentState);

  const controlledTaskId = currentState.board.backlog[0];
  const controlledTask = currentState.tasks[controlledTaskId];
  assert(Boolean(controlledTask), "Missed-work smoke expected an initial task.");
  configureMissedMajorTask(controlledTask);
  assert(moveRealtimeTask(currentState, controlledTask.id, "inProgress"), "Missed-work smoke move failed.");

  tickToMorningReport(currentState);
  const report = currentState.morningReport;
  assert(report !== null, "Missed-work smoke expected morning report.");
  const fallout = report.consequences.find(
    (consequence) =>
      consequence.source === "missed_in_progress" &&
      consequence.sourceTaskId === controlledTask.id &&
      consequence.cause === "missed_deadline",
  );
  assert(Boolean(fallout), "Missed-work smoke expected missed in-progress fallout.");
  assert(controlledTask.resolved, "Missed-work smoke expected source task resolved.");
  assert(report.daySummary.missedInProgress >= 1, "Missed-work smoke expected missed progress summary.");

  return {
    name: "missed-work",
    missedInProgress: report.daySummary.missedInProgress,
    fallout: fallout?.generatedTaskId ?? fallout?.effects.join(", "),
    resolution: controlledTask.resolution,
  };
}

function tickToMorningReport(currentState: RtGameState): void {
  currentState.gameMinuteOfDay = RELEASE_TRAIN_GAME_MINUTE - 0.5;
  tickRealtime(currentState, 1000);
  assert(Boolean(currentState.morningReport), "Expected release train to open morning report.");
  assert(currentState.paused, "Expected morning report to pause the run.");
}

function configureCleanReleaseTask(task: RtTask): void {
  task.kind = "integration";
  task.domain = "payments";
  task.blastRadius = "low";
  task.pressure = 1;
  task.complexity = 1;
  task.value = 20;
  task.clarity = 100;
  task.quality = 100;
  task.testCoverage = 100;
  task.bugs = 0;
  task.changedAfterQa = false;
  task.workDone = true;
  task.deadlineMs = 300000;
  task.deadlineMaxMs = 300000;
  task.subtasks = [
    completeSubtask(task, "backend", "critical", "Implement integration contract"),
    completeSubtask(task, "qa", "important", "Validate failure modes"),
    completeSubtask(task, "sre", "important", "Handle timeouts and retries"),
  ];
}

function configureMissedMajorTask(task: RtTask): void {
  task.kind = "integration";
  task.domain = "payments";
  task.blastRadius = "high";
  task.pressure = 5;
  task.complexity = 4;
  task.value = 42;
  task.clarity = 70;
  task.quality = 40;
  task.testCoverage = 0;
  task.bugs = 1;
  task.changedAfterQa = false;
  task.workDone = false;
  task.deadlineMs = 0;
  task.deadlineMaxMs = 300000;
}

function completeSubtask(
  task: RtTask,
  role: RtTask["subtasks"][number]["role"],
  importance: RtTask["subtasks"][number]["importance"],
  title: string,
): RtTask["subtasks"][number] {
  return {
    id: `${task.id}-${role}-debug`,
    title,
    role,
    importance,
    revealed: true,
    done: true,
    progress: 100,
    completedBy: "debug",
    offRole: false,
  };
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function pickWorkerForTask(taskId: string): string | null {
  const task = state.tasks[taskId];
  if (!task) return null;
  const open = task.subtasks.filter((subtask) => subtask.revealed && !subtask.done);
  const implementation = open.filter((subtask) => subtask.role !== "qa");
  const target =
    task.bugs > 0
      ? open.find((subtask) => subtask.role === "qa") ?? open[0]
      : (task.workDone && implementation.length === 0 ? open : implementation)[0];
  const available = Object.values(state.characters).filter((character) => !character.assignedTaskId);
  const eligible = available.filter((character) => canAssignCharacterToTask(state, character.id, taskId));
  if (!target) return eligible[0]?.id ?? null;
  const matchingRole = target.role === "design" ? "designer" : target.role === "bugfix" ? "backend" : target.role;
  return (
    eligible.find((character) => character.role === matchingRole)?.id ??
    eligible.sort((a, b) => b.specialty[target.role] - a.specialty[target.role])[0]?.id ??
    null
  );
}

function isTaskReadyForDone(taskId: string): boolean {
  const task = state.tasks[taskId];
  if (!task) return false;
  return (
    task.workDone &&
    task.bugs === 0 &&
    task.subtasks.filter((subtask) => subtask.revealed && !subtask.done).length === 0
  );
}
