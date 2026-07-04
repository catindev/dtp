import {
  RELEASE_TRAIN_GAME_MINUTE,
  assignCharacterToTask,
  canAssignCharacterToTask,
  createCampaignCalendar,
  createRealtimeState,
  getOutsourceTaskWorkStatus,
  moveRealtimeTask,
  normalizeRealtimeState,
  outsourceTaskWork,
  releaseReadiness,
  resolveDueHorizonReviews,
  RT_COLUMNS,
  runDailyReleaseTrain,
  startDayAfterMorningReport,
  tickRealtime,
  type RtGameState,
  type RtTask,
} from "../realtime/simulation";
import {
  buildBackendSnapshot,
  buildDebugSnapshot,
} from "../logging/debugSnapshot";
import { createLogEntry } from "../logging/backendLog";
import { buildGameEventTelemetry } from "../logging/gameEventTelemetry";
import { buildDaySummaryTelemetry } from "../logging/summaryTelemetry";
import { characterDropRejectReason } from "../hooks/dragAndDropHelpers";

const seedArg = Number(process.argv[2]);
const seed = Number.isFinite(seedArg) ? seedArg : 184;
const state = createRealtimeState(seed);
assertQuarterCadence(state);
const smoke = [
  runHorizonBoundarySmoke(),
  runBacklogValueDecaySmoke(),
  runBacklogOpportunityExpirationSmoke(),
  runMissedWorkSmoke(),
  runDeadlinePressureReadinessSmoke(),
  runHorizonReviewCapSmoke(),
  runWinContractSmoke(),
  runMigrationNormalizationSmoke(),
  runDebugSnapshotSmoke(),
  runOutsourceSmoke(),
  runOutsourcedQaCoverageSmoke(),
  runPartialQaCoverageSmoke(),
  runQaRecheckSmoke(),
  runCharacterEventPayloadSmoke(),
  runDragRejectHelperSmoke(),
  runLogSizeBudgetSmoke(),
];

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
  tickUntilTaskIdleInState(state, taskId, limit);
}

function tickUntilTaskIdleInState(currentState: RtGameState, taskId: string, limit: number): void {
  for (let index = 0; index < limit; index += 1) {
    const task = currentState.tasks[taskId];
    if (!task?.assignedCharacterId) return;
    tickRealtime(currentState, 500);
  }
}

function assertQuarterCadence(currentState: typeof state): void {
  if (currentState.daysPerQuarter < 5) {
    throw new Error(`Expected daysPerQuarter >= 5, got ${currentState.daysPerQuarter}.`);
  }
}

function runHorizonBoundarySmoke() {
  const currentState = createRealtimeState(777);
  assertQuarterCadence(currentState);
  currentState.day = currentState.daysPerQuarter;
  currentState.dayInQuarter = currentState.daysPerQuarter;
  currentState.quarterValue = currentState.quarterGoal.value;
  currentState.resources.trust = currentState.quarterGoal.trust + 5;

  const controlledTaskId = currentState.board.backlog[0];
  const controlledTask = currentState.tasks[controlledTaskId];
  assert(Boolean(controlledTask), "Horizon smoke expected an initial task.");
  configureCleanReleaseTask(controlledTask);
  assert(releaseReadiness(controlledTask).readiness === "clean", "Horizon smoke task should be clean.");
  assert(moveRealtimeTask(currentState, controlledTask.id, "inProgress"), "Horizon smoke move to work failed.");
  assert(moveRealtimeTask(currentState, controlledTask.id, "done"), "Horizon smoke move to Done failed.");

  tickToMorningReport(currentState);
  const report = currentState.morningReport;
  assert(report !== null, "Horizon smoke expected morning report.");
  assert(report.shippedTaskIds.includes(controlledTask.id), "Horizon smoke expected shipped task.");
  assert(report.horizonReviews.length >= 3, "Horizon smoke expected stacked horizon reviews.");
  assert(Boolean(report.quarterReview), "Horizon smoke expected legacy quarter projection.");
  assert(currentState.dayInQuarter === 1, "Horizon smoke expected new quarter day 1.");
  assert(startDayAfterMorningReport(currentState), "Horizon smoke expected briefing continue.");

  return {
    name: "horizon-boundary",
    shipped: report.shippedTaskIds.length,
    reviews: report.horizonReviews.map((review) => `${review.kind}:${review.hitGoal ? "met" : "missed"}`),
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

function runDeadlinePressureReadinessSmoke() {
  const currentState = createRealtimeState(889);
  assertQuarterCadence(currentState);

  const controlledTaskId = currentState.board.backlog[0];
  const controlledTask = currentState.tasks[controlledTaskId];
  assert(Boolean(controlledTask), "Deadline-pressure smoke expected an initial task.");
  configureCleanReleaseTask(controlledTask);
  controlledTask.deadlineMs = 1000;
  controlledTask.deadlineMaxMs = 300000;

  const workReadiness = releaseReadiness(controlledTask);
  assert(workReadiness.readiness === "clean", "Deadline pressure should not make clean work risky.");
  assert(workReadiness.reasons.length === 0, "Deadline pressure should not add readiness reasons.");
  assert(
    moveRealtimeTask(currentState, controlledTask.id, "inProgress"),
    "Deadline-pressure smoke move to work failed.",
  );
  assert(moveRealtimeTask(currentState, controlledTask.id, "done"), "Deadline-pressure smoke move to Done failed.");

  const doneReadiness = releaseReadiness(controlledTask);
  assert(doneReadiness.readiness === "clean", "Done task under deadline pressure should stay clean.");
  assert(doneReadiness.reasons.length === 0, "Done task should not show deadline pressure as a risk.");

  return {
    name: "deadline-pressure-readiness",
    readiness: doneReadiness.readiness,
    reasons: doneReadiness.reasons.length,
  };
}

function runHorizonReviewCapSmoke() {
  const currentState = createRealtimeState(890);
  currentState.day = 10;
  currentState.calendar = createCampaignCalendar(10);
  currentState.resources.trust = 70;
  const baseGoal = currentState.horizonGoals.week;
  assert(Boolean(baseGoal), "Horizon cap smoke expected a week goal.");
  if (!baseGoal) throw new Error("Horizon cap smoke expected a week goal.");
  currentState.horizonGoals.week = {
    ...baseGoal,
    kind: "week",
    id: 2,
    endsOnDay: 10,
    currentValue: 0,
    expectedValue: 999,
    missedTrustPenalty: 4,
  };
  currentState.horizonGoals.month = {
    ...baseGoal,
    kind: "month",
    id: 1,
    endsOnDay: 10,
    currentValue: 0,
    expectedValue: 999,
    targetTrust: 90,
    missedTrustPenalty: 6,
  };
  currentState.horizonGoals.quarter = {
    ...baseGoal,
    kind: "quarter",
    id: 1,
    endsOnDay: 10,
    currentValue: 0,
    expectedValue: 999,
    targetTrust: 90,
    missedTrustPenalty: 8,
  };

  const emitted: string[] = [];
  const reviews = resolveDueHorizonReviews(currentState, (event) => emitted.push(event.type));
  const rawDamage = reviews.reduce((sum, review) => sum + review.rawTrustDamage, 0);
  const cappedDamage = reviews.reduce((sum, review) => sum + review.cappedTrustDamage, 0);
  assert(reviews.length === 3, "Horizon cap smoke expected three reviews.");
  assert(rawDamage === 18, "Horizon cap smoke expected raw damage 18.");
  assert(cappedDamage === 10, "Horizon cap smoke expected capped damage 10.");
  assert(currentState.resources.trust === 60, "Horizon cap smoke expected trust to drop by cap only.");
  assert(emitted.length === 3, "Horizon cap smoke expected review events.");

  return {
    name: "horizon-review-cap",
    reviews: reviews.length,
    rawDamage,
    cappedDamage,
    trust: currentState.resources.trust,
  };
}

function runWinContractSmoke() {
  const currentState = createRealtimeState(891);
  currentState.day = currentState.calendar.daysPerYear;
  currentState.calendar = createCampaignCalendar(currentState.day);
  currentState.resources.trust = 80;
  currentState.resources.clients = 100;
  currentState.resources.debt = 20;
  currentState.gameMinuteOfDay = RELEASE_TRAIN_GAME_MINUTE - 1;

  tickRealtime(currentState, 120000);
  assert(currentState.morningReport !== null, "Win smoke expected final morning report.");
  assert(currentState.status === "won", "Win smoke expected won status.");
  assert(currentState.victoryReport !== null, "Win smoke expected victory report.");
  assert(currentState.victoryReport.score > 0, "Win smoke expected positive victory score.");
  assert(
    currentState.log.some((event) => event.type === "run_won"),
    "Win smoke expected run_won event.",
  );

  return {
    name: "win-contract",
    status: currentState.status,
    grade: currentState.victoryReport?.grade,
    score: currentState.victoryReport?.score,
    day: currentState.day,
    hasMorningReport: Boolean(currentState.morningReport),
  };
}

function runBacklogValueDecaySmoke() {
  const currentState = createRealtimeState(4242);
  assertQuarterCadence(currentState);

  const controlledTaskId = currentState.board.backlog[0];
  const controlledTask = currentState.tasks[controlledTaskId];
  assert(Boolean(controlledTask), "Backlog decay smoke expected an initial task.");
  controlledTask.baseValue = 40;
  controlledTask.value = 40;
  controlledTask.backlogValue = 40;
  controlledTask.backlogDecayElapsedMs = 0;
  controlledTask.backlogDecayDurationMs = 300000;
  controlledTask.deadlineMs = 300000;
  controlledTask.deadlineMaxMs = 300000;

  tickRealtime(currentState, 120000);
  assert(controlledTask.deadlineMs === 300000, "Untouched backlog task deadline should not tick.");
  assert(controlledTask.backlogValue < 40, "Untouched backlog task value should decay.");

  const committedValue = Math.max(1, Math.round(controlledTask.backlogValue));
  assert(moveRealtimeTask(currentState, controlledTask.id, "inProgress"), "Backlog decay smoke move failed.");
  assert(controlledTask.engagedOnce, "Backlog decay smoke expected task committed.");
  assert(controlledTask.value === committedValue, "Backlog decay smoke expected value fixed on commit.");
  assert(controlledTask.deadlineMs === 300000, "Backlog decay smoke expected full deadline on commit.");

  return {
    name: "backlog-value-decay",
    committedValue: controlledTask.value,
    baseValue: controlledTask.baseValue,
  };
}

function runBacklogOpportunityExpirationSmoke() {
  const currentState = createRealtimeState(4343);
  assertQuarterCadence(currentState);
  const initialDebt = currentState.resources.debt;
  const expiringTaskIds = currentState.board.backlog.slice(0, 2);
  assert(expiringTaskIds.length >= 2, "Backlog expiration smoke expected two initial backlog tasks.");

  for (const taskId of expiringTaskIds) {
    const task = currentState.tasks[taskId];
    assert(Boolean(task), "Backlog expiration smoke expected task.");
    task.baseValue = 120;
    task.value = 120;
    task.backlogValue = 120;
    task.backlogDecayElapsedMs = 0;
    task.backlogDecayDurationMs = 1000;
  }

  tickRealtime(currentState, 1500);
  const expiredTasks = expiringTaskIds.map((taskId) => currentState.tasks[taskId]);
  assert(
    expiredTasks.every((task) => task.resolved && task.resolution === "backlog_opportunity_expired"),
    "Backlog expiration smoke expected resolved expired tasks.",
  );
  assert(currentState.backlogDecayToday.expiredCount === 2, "Backlog expiration smoke expected two expirations.");
  assert(currentState.backlogDecayToday.debtAdded === 6, "Backlog expiration smoke expected daily debt cap.");
  assert(currentState.resources.debt === initialDebt + 6, "Backlog expiration smoke expected capped debt applied.");
  assert(
    expiringTaskIds.every((taskId) => !currentState.board.backlog.includes(taskId)),
    "Backlog expiration smoke expected tasks removed from backlog.",
  );

  tickToMorningReport(currentState);
  const report = currentState.morningReport;
  assert(report !== null, "Backlog expiration smoke expected morning report.");
  assert(report.daySummary.backlogExpiredCount === 2, "Backlog expiration smoke expected report expirations.");
  assert(report.daySummary.backlogDebtAdded === 6, "Backlog expiration smoke expected report debt.");
  assert(report.consequences.length === 0, "Backlog expiration smoke expected no fallout consequences.");

  return {
    name: "backlog-opportunity-expiration",
    expired: report.daySummary.backlogExpiredCount,
    debtAdded: report.daySummary.backlogDebtAdded,
  };
}

function runMigrationNormalizationSmoke() {
  const currentState = createRealtimeState(999);
  const legacyState = currentState as unknown as {
    locale: unknown;
    daysPerQuarter: number;
    board: Record<string, string[] | undefined>;
    backlogDecayToday?: RtGameState["backlogDecayToday"];
    morningReport?: RtGameState["morningReport"];
  };
  const controlledTaskId = currentState.board.backlog[0];
  const controlledTask = currentState.tasks[controlledTaskId];
  assert(Boolean(controlledTask), "Migration smoke expected an initial task.");

  legacyState.locale = "de";
  legacyState.daysPerQuarter = 1;
  delete legacyState.backlogDecayToday;
  delete legacyState.morningReport;
  currentState.board.backlog = currentState.board.backlog.filter((taskId) => taskId !== controlledTask.id);
  legacyState.board.analysis = [controlledTask.id];

  const legacyTask = controlledTask as unknown as Omit<Partial<RtTask>, "column"> & {
    column: string;
    sourceTaskId?: string | null;
  };
  legacyTask.column = "analysis";
  legacyTask.title = "Partner payouts: broke after PAY-001";
  legacyTask.sourceTaskId = "PAY-001";
  delete legacyTask.blastRadius;
  delete legacyTask.outsourcing;
  delete legacyTask.changedAfterQa;
  delete legacyTask.baseValue;
  delete legacyTask.backlogValue;
  delete legacyTask.backlogDecayElapsedMs;
  delete legacyTask.backlogDecayDurationMs;
  delete legacyTask.engagedOnce;
  delete legacyTask.queuedDeadlineMs;
  legacyTask.overdueMs = -120;
  delete legacyTask.rootCauseTaskId;
  delete legacyTask.chainDepth;
  delete legacyTask.resolved;
  delete legacyTask.resolution;
  delete legacyTask.resolutionDay;
  legacyTask.postmortem = [
    "Source task: PAY-001.",
    "Root cause: PAY-001.",
    "Keep this note.",
    "Keep this note.",
  ];

  const changed = normalizeRealtimeState(currentState);
  assert(changed, "Migration smoke expected state changes.");
  assert(currentState.locale === "en", "Migration smoke expected invalid locale to normalize.");
  assertQuarterCadence(currentState);
  assert(currentState.morningReport === null, "Migration smoke expected missing morning report to normalize.");
  assert(controlledTask.column === "inProgress", "Migration smoke expected legacy work to move to In Progress.");
  assert(currentState.board.inProgress.includes(controlledTask.id), "Migration smoke expected migrated task on board.");
  assert(!legacyState.board.analysis?.includes(controlledTask.id), "Migration smoke expected legacy analysis board cleared.");
  assert(controlledTask.blastRadius !== undefined, "Migration smoke expected blast radius backfill.");
  assert(controlledTask.outsourcing === null, "Migration smoke expected outsourcing backfill.");
  assert(controlledTask.changedAfterQa === false, "Migration smoke expected changedAfterQa backfill.");
  assert(controlledTask.baseValue === controlledTask.value, "Migration smoke expected base value backfill.");
  assert(controlledTask.backlogValue === controlledTask.value, "Migration smoke expected backlog value backfill.");
  assert(controlledTask.backlogDecayElapsedMs === 0, "Migration smoke expected backlog decay elapsed backfill.");
  assert(controlledTask.backlogDecayDurationMs > 0, "Migration smoke expected backlog decay duration backfill.");
  assert(controlledTask.engagedOnce, "Migration smoke expected migrated work task to be engaged.");
  assert(currentState.backlogDecayToday.expiredCount === 0, "Migration smoke expected backlog stats backfill.");
  assert(controlledTask.queuedDeadlineMs === null, "Migration smoke expected work task queued deadline reset.");
  assert(controlledTask.overdueMs === 0, "Migration smoke expected overdue clamp.");
  assert(controlledTask.rootCauseTaskId === null, "Migration smoke expected root cause backfill.");
  assert(controlledTask.chainDepth === 0, "Migration smoke expected chain depth backfill.");
  assert(controlledTask.resolved === false, "Migration smoke expected resolved backfill.");
  assert(controlledTask.resolution === null, "Migration smoke expected resolution backfill.");
  assert(controlledTask.resolutionDay === null, "Migration smoke expected resolution day backfill.");
  assert(!controlledTask.title.includes("PAY-001"), "Migration smoke expected consequence title cleanup.");
  assert(
    controlledTask.postmortem.length === 1 && controlledTask.postmortem[0] === "Keep this note.",
    "Migration smoke expected postmortem cleanup.",
  );

  return {
    name: "migration-normalization",
    locale: currentState.locale,
    daysPerQuarter: currentState.daysPerQuarter,
    migratedColumn: controlledTask.column,
  };
}

function runDebugSnapshotSmoke() {
  const currentState = createRealtimeState(1001, "ru");
  const snapshot = buildDebugSnapshot(currentState, "debug-session");
  const backendSnapshot = buildBackendSnapshot(snapshot);

  assert(snapshot.sessionId === "debug-session", "Snapshot smoke expected session id.");
  assert(snapshot.locale === "ru", "Snapshot smoke expected locale.");
  assert(snapshot.logger.backendUrl.includes("/api/log"), "Snapshot smoke expected backend url.");
  assert(snapshot.logger.queuedEntries === 0, "Snapshot smoke expected empty backend queue in Node.");
  assert(backendSnapshot.sessionId === snapshot.sessionId, "Backend snapshot smoke expected session id.");
  assert(Array.isArray(backendSnapshot.recentEvents), "Backend snapshot smoke expected recent events.");
  for (const column of RT_COLUMNS) {
    assert(
      backendSnapshot.boardCounts[column] === currentState.board[column].length,
      `Backend snapshot smoke expected ${column} count.`,
    );
    assert(
      backendSnapshot.visibleTasks[column].length === currentState.board[column].length,
      `Backend snapshot smoke expected ${column} visible tasks.`,
    );
  }

  return {
    name: "debug-snapshot",
    status: backendSnapshot.status,
    loggerQueued: backendSnapshot.logger.queuedEntries,
    boardCounts: backendSnapshot.boardCounts,
  };
}

function runLogSizeBudgetSmoke() {
  const currentState = createRealtimeState(8301);
  const event = currentState.log[0];
  assert(event !== undefined, "Log size smoke expected an initial event.");

  const eventEntry = createLogEntry(
    "log-size-smoke",
    "event",
    event.type,
    buildGameEventTelemetry(currentState, event),
  );
  const eventBytes = byteLength(eventEntry);
  assert(eventBytes < 2500, `Log size smoke expected compact event, got ${eventBytes} bytes.`);

  for (let guard = 0; guard < 160 && !currentState.morningReport; guard += 1) {
    tickRealtime(currentState, 5000);
  }
  assert(currentState.morningReport !== null, "Log size smoke expected a morning report.");

  const summaryEntry = createLogEntry(
    "log-size-smoke",
    "summary",
    "day_summary",
    buildDaySummaryTelemetry(currentState, currentState.morningReport),
  );
  const summaryBytes = byteLength(summaryEntry);
  assert(summaryBytes < 8000, `Log size smoke expected compact summary, got ${summaryBytes} bytes.`);

  const snapshotEntry = createLogEntry(
    "log-size-smoke",
    "snapshot",
    "debug_snapshot",
    buildBackendSnapshot(buildDebugSnapshot(currentState, "log-size-smoke")),
  );
  const snapshotBytes = byteLength(snapshotEntry);
  assert(snapshotBytes > eventBytes, "Log size smoke expected snapshot to remain separate from events.");

  return {
    name: "log-size-budget",
    eventBytes,
    summaryBytes,
    snapshotBytes,
  };
}

function byteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function runOutsourceSmoke() {
  const currentState = createRealtimeState(2002);
  const controlledTaskId = currentState.board.backlog[0];
  const controlledTask = currentState.tasks[controlledTaskId];
  assert(Boolean(controlledTask), "Outsource smoke expected an initial task.");
  currentState.resources.budget = 6;
  configureOutsourceTask(controlledTask);
  assert(moveRealtimeTask(currentState, controlledTask.id, "inProgress"), "Outsource smoke move failed.");

  const status = getOutsourceTaskWorkStatus(currentState, controlledTask.id);
  assert(status.allowed, `Outsource smoke expected ready status, got ${status.reason}.`);
  assert(status.cost === 4, "Outsource smoke expected important work cost.");
  assert(status.subtask?.role === "backend", "Outsource smoke expected backend subtask.");
  assert(outsourceTaskWork(currentState, controlledTask.id), "Outsource smoke expected work to start.");
  assert(currentState.resources.budget === 2, "Outsource smoke expected budget payment.");
  assert(controlledTask.outsourcing?.subtaskId === status.subtask.id, "Outsource smoke expected active outsourcing.");
  assert(controlledTask.currentSubtaskId === status.subtask.id, "Outsource smoke expected current subtask.");
  const busyStatus = getOutsourceTaskWorkStatus(currentState, controlledTask.id);
  assert(!busyStatus.allowed && busyStatus.reason === "task_busy", "Outsource smoke expected busy blocker.");

  return {
    name: "outsource-status",
    budget: currentState.resources.budget,
    blockerAfterStart: busyStatus.reason,
    subtaskRole: status.subtask.role,
  };
}

function runOutsourcedQaCoverageSmoke() {
  const currentState = createRealtimeState(2102);
  const controlledTaskId = currentState.board.backlog[0];
  const controlledTask = currentState.tasks[controlledTaskId];
  assert(Boolean(controlledTask), "Outsourced QA smoke expected an initial task.");
  currentState.resources.budget = 4;
  configureOutsourcedQaTask(controlledTask);
  assert(moveRealtimeTask(currentState, controlledTask.id, "inProgress"), "Outsourced QA smoke move failed.");

  const status = getOutsourceTaskWorkStatus(currentState, controlledTask.id);
  assert(status.allowed, `Outsourced QA smoke expected ready status, got ${status.reason}.`);
  assert(status.subtask?.role === "qa", "Outsourced QA smoke expected QA subtask.");
  assert(outsourceTaskWork(currentState, controlledTask.id), "Outsourced QA smoke expected work to start.");
  tickUntilOutsourcingIdleInState(currentState, controlledTask.id, 900);

  const qaSubtask = controlledTask.subtasks.find((subtask) => subtask.role === "qa");
  const readiness = releaseReadiness(controlledTask);
  assert(qaSubtask !== undefined, "Outsourced QA smoke expected QA subtask.");
  assert(qaSubtask.done, "Outsourced QA smoke expected QA subtask done.");
  assert(qaSubtask.completedBy === "outsourcing", "Outsourced QA smoke expected outsourced completion.");
  assert(controlledTask.testCoverage >= 45, "Outsourced QA smoke expected real test coverage.");
  assert(!readiness.reasons.includes("no_qa"), "Outsourced QA smoke expected no_qa cleared.");

  return {
    name: "outsourced-qa-coverage",
    testCoverage: controlledTask.testCoverage,
    readiness: readiness.readiness,
  };
}

function runPartialQaCoverageSmoke() {
  const currentState = createRealtimeState(2301);
  const controlledTaskId = currentState.board.backlog[0];
  const controlledTask = currentState.tasks[controlledTaskId];
  assert(Boolean(controlledTask), "Partial QA smoke expected an initial task.");
  configurePartialQaTask(controlledTask);
  assert(moveRealtimeTask(currentState, controlledTask.id, "inProgress"), "Partial QA smoke move failed.");

  const frontend = Object.values(currentState.characters).find((character) => character.role === "frontend");
  const qa = Object.values(currentState.characters).find((character) => character.role === "qa");
  assert(frontend !== undefined, "Partial QA smoke expected frontend character.");
  assert(qa !== undefined, "Partial QA smoke expected QA character.");
  assert(assignCharacterToTask(currentState, frontend.id, controlledTask.id), "Partial QA smoke assign failed.");
  tickUntilTaskIdleInState(currentState, controlledTask.id, 900);

  const qaSubtask = controlledTask.subtasks.find((subtask) => subtask.role === "qa");
  const readiness = releaseReadiness(controlledTask);
  assert(qaSubtask !== undefined, "Partial QA smoke expected QA subtask.");
  assert(!qaSubtask.done, "Partial QA smoke expected QA subtask to remain open.");
  assert(controlledTask.testCoverage < 45, "Partial QA smoke expected coverage below threshold.");
  assert(readiness.reasons.includes("no_qa"), "Partial QA smoke expected no_qa to remain.");
  assert(canAssignCharacterToTask(currentState, qa.id, controlledTask.id), "Partial QA smoke expected QA reassignment.");
  assert(/QA coverage is partial/.test(controlledTask.lastNote), "Partial QA smoke expected partial coverage note.");

  return {
    name: "partial-qa-coverage",
    testCoverage: controlledTask.testCoverage,
    qaSubtaskDone: qaSubtask.done,
    qaSubtaskProgress: qaSubtask.progress,
    canReassignQa: true,
  };
}

function runQaRecheckSmoke() {
  const currentState = createRealtimeState(3003);
  const controlledTaskId = currentState.board.backlog[0];
  const controlledTask = currentState.tasks[controlledTaskId];
  assert(Boolean(controlledTask), "QA recheck smoke expected an initial task.");
  configureImplementationAfterQaTask(controlledTask);
  assert(moveRealtimeTask(currentState, controlledTask.id, "inProgress"), "QA recheck smoke move failed.");
  const backend = Object.values(currentState.characters).find((character) => character.role === "backend");
  assert(backend !== undefined, "QA recheck smoke expected backend character.");
  assert(assignCharacterToTask(currentState, backend.id, controlledTask.id), "QA recheck smoke assign failed.");
  tickUntilTaskIdleInState(currentState, controlledTask.id, 900);

  const recheck = controlledTask.subtasks.find(
    (subtask) => subtask.role === "qa" && subtask.revealed && !subtask.done,
  );
  assert(controlledTask.changedAfterQa, "QA recheck smoke expected changedAfterQa.");
  assert(controlledTask.testCoverage <= 35, "QA recheck smoke expected stale coverage cap.");
  assert(Boolean(recheck), "QA recheck smoke expected open QA recheck subtask.");
  assert(
    currentState.log.some((event) => event.effects.includes("QA recheck required")),
    "QA recheck smoke expected event marker.",
  );

  return {
    name: "qa-recheck",
    changedAfterQa: controlledTask.changedAfterQa,
    testCoverage: controlledTask.testCoverage,
    recheckId: recheck?.id,
  };
}

function runCharacterEventPayloadSmoke() {
  const currentState = createRealtimeState(3103);
  const controlledTaskId = currentState.board.backlog[0];
  const controlledTask = currentState.tasks[controlledTaskId];
  assert(Boolean(controlledTask), "Character event payload smoke expected an initial task.");
  configureOutsourceTask(controlledTask);
  assert(moveRealtimeTask(currentState, controlledTask.id, "inProgress"), "Character payload smoke move failed.");

  const backend = Object.values(currentState.characters).find((character) => character.role === "backend");
  assert(backend !== undefined, "Character payload smoke expected backend character.");
  assert(assignCharacterToTask(currentState, backend.id, controlledTask.id), "Character payload smoke assign failed.");
  tickUntilTaskIdleInState(currentState, controlledTask.id, 900);

  const assignedEvent = currentState.log.find((event) => event.type === "assigned");
  const completedEvent = currentState.log.find((event) => event.type === "subtask_done");
  assert(assignedEvent?.data?.characterId === backend.id, "Assigned event should include characterId.");
  assert(completedEvent?.data?.characterId === backend.id, "Completion event should include characterId.");
  assert(completedEvent.data.taskId === controlledTask.id, "Completion event should include taskId.");
  assert(completedEvent.data.subtaskRole === "backend", "Completion event should include subtaskRole.");

  return {
    name: "character-event-payload",
    characterId: completedEvent.data.characterId,
    taskId: completedEvent.data.taskId,
    subtaskRole: completedEvent.data.subtaskRole,
  };
}

function runDragRejectHelperSmoke() {
  const currentState = createRealtimeState(4004);
  const controlledTaskId = currentState.board.backlog[0];
  const controlledTask = currentState.tasks[controlledTaskId];
  const character = Object.values(currentState.characters)[0];
  assert(Boolean(controlledTask), "Drag reject smoke expected an initial task.");
  assert(Boolean(character), "Drag reject smoke expected an initial character.");

  assert(
    characterDropRejectReason(currentState, "missing-character", controlledTask) === "character missing",
    "Drag reject smoke expected missing character reason.",
  );
  assert(
    characterDropRejectReason(currentState, character.id, controlledTask) === "wrong column",
    "Drag reject smoke expected wrong column reason.",
  );

  controlledTask.column = "inProgress";
  controlledTask.subtasks = [];
  currentState.board.backlog = currentState.board.backlog.filter((taskId) => taskId !== controlledTask.id);
  currentState.board.inProgress.push(controlledTask.id);
  assert(
    characterDropRejectReason(currentState, character.id, controlledTask) === "no matching visible work",
    "Drag reject smoke expected no visible work reason.",
  );

  character.assignedTaskId = controlledTask.id;
  assert(
    characterDropRejectReason(currentState, character.id, controlledTask) === "character already busy",
    "Drag reject smoke expected busy character reason.",
  );

  character.assignedTaskId = null;
  character.exhaustedToday = true;
  assert(
    characterDropRejectReason(currentState, character.id, controlledTask) === "character exhausted",
    "Drag reject smoke expected exhausted character reason.",
  );

  character.exhaustedToday = false;
  controlledTask.assignedCharacterId = character.id;
  assert(
    characterDropRejectReason(currentState, character.id, controlledTask) === "task already in work",
    "Drag reject smoke expected busy task reason.",
  );

  return {
    name: "drag-reject-helper",
    checked: 5,
  };
}

function tickToMorningReport(currentState: RtGameState): void {
  currentState.gameMinuteOfDay = RELEASE_TRAIN_GAME_MINUTE - 0.5;
  tickRealtime(currentState, 1000);
  assert(Boolean(currentState.morningReport), "Expected release train to open morning report.");
  assert(currentState.paused, "Expected morning report to pause the run.");
}

function tickUntilOutsourcingIdleInState(currentState: RtGameState, taskId: string, limit: number): void {
  for (let index = 0; index < limit; index += 1) {
    const task = currentState.tasks[taskId];
    if (!task?.outsourcing) return;
    tickRealtime(currentState, 500);
  }
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

function configureOutsourceTask(task: RtTask): void {
  task.kind = "integration";
  task.domain = "payments";
  task.blastRadius = "medium";
  task.pressure = 2;
  task.complexity = 2;
  task.value = 24;
  task.clarity = 80;
  task.quality = 50;
  task.testCoverage = 0;
  task.bugs = 0;
  task.changedAfterQa = false;
  task.workDone = false;
  task.assignedCharacterId = null;
  task.outsourcing = null;
  task.currentSubtaskId = null;
  task.stageProgress = 0;
  task.stageComplete = false;
  task.subtasks = [
    openSubtask(task, "backend", "important", "Implement integration contract"),
  ];
}

function configureImplementationAfterQaTask(task: RtTask): void {
  task.kind = "feature";
  task.domain = "admin";
  task.blastRadius = "medium";
  task.pressure = 1;
  task.complexity = 1;
  task.value = 18;
  task.clarity = 100;
  task.quality = 88;
  task.testCoverage = 82;
  task.bugs = 0;
  task.changedAfterQa = false;
  task.workDone = false;
  task.assignedCharacterId = null;
  task.outsourcing = null;
  task.currentSubtaskId = null;
  task.stageProgress = 0;
  task.stageComplete = false;
  task.subtasks = [
    openSubtask(task, "backend", "important", "Patch service behavior"),
  ];
}

function configureOutsourcedQaTask(task: RtTask): void {
  task.kind = "bug";
  task.domain = "admin";
  task.blastRadius = "low";
  task.pressure = 1;
  task.complexity = 2;
  task.value = 18;
  task.clarity = 80;
  task.quality = 94;
  task.testCoverage = 0;
  task.bugs = 0;
  task.changedAfterQa = false;
  task.workDone = true;
  task.assignedCharacterId = null;
  task.outsourcing = null;
  task.currentSubtaskId = null;
  task.stageProgress = 0;
  task.stageComplete = false;
  task.subtasks = [
    completeSubtask(task, "frontend", "critical", "Fix root cause"),
    openSubtask(task, "qa", "important", "Reproduce and verify fix"),
  ];
}

function configurePartialQaTask(task: RtTask): void {
  task.kind = "feature";
  task.domain = "payments";
  task.blastRadius = "low";
  task.pressure = 1;
  task.complexity = 1;
  task.value = 18;
  task.clarity = 100;
  task.quality = 100;
  task.testCoverage = 0;
  task.bugs = 0;
  task.changedAfterQa = false;
  task.workDone = true;
  task.assignedCharacterId = null;
  task.outsourcing = null;
  task.currentSubtaskId = null;
  task.stageProgress = 0;
  task.stageComplete = false;
  task.subtasks = [
    completeSubtask(task, "backend", "critical", "Implement integration contract"),
    openSubtask(task, "qa", "important", "Validate happy path and edge cases"),
  ];
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

function openSubtask(
  task: RtTask,
  role: RtTask["subtasks"][number]["role"],
  importance: RtTask["subtasks"][number]["importance"],
  title: string,
): RtTask["subtasks"][number] {
  return {
    id: `${task.id}-${role}-debug-open`,
    title,
    role,
    importance,
    revealed: true,
    done: false,
    progress: 0,
    completedBy: null,
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
