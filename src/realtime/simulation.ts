export const TICK_MS = 500;
export const GAME_MINUTES_PER_REAL_SECOND = 1;
export const GAME_MINUTES_PER_TICK = 0.5;
export const GAME_DAY_START_MINUTE = 8 * 60;
export const RELEASE_TRAIN_GAME_MINUTE = 18 * 60;
export const GAME_DAY_MINUTES = RELEASE_TRAIN_GAME_MINUTE - GAME_DAY_START_MINUTE;
export const DONE_REWORK_TRUST_COST = 4;
export const OUTSOURCE_COST_BY_IMPORTANCE: Record<RtSubtaskImportance, number> = {
  optional: 3,
  important: 4,
  critical: 6,
};
const DAY_REST_STAMINA_BOOST = 35;
const FIRST_SPAWN_MIN_MS = 110000;
const FIRST_SPAWN_MAX_MS = 160000;
const SPAWN_INTERVAL_MIN_MS = 135000;
const SPAWN_INTERVAL_MAX_MS = 215000;
const BURST_INTERVAL_MIN_MS = 600000;
const BURST_INTERVAL_MAX_MS = 840000;
const WORK_SPEED_MULTIPLIER = 0.38;
const ANALYSIS_SPEED_MULTIPLIER = 0.46;

export const RT_COLUMNS = ["backlog", "inProgress", "done", "released"] as const;
export type RtColumn = (typeof RT_COLUMNS)[number];

export type RtTaskKind =
  | "feature"
  | "bug"
  | "techDebt"
  | "integration"
  | "incident"
  | "performance"
  | "compliance";

export type RtRole = "analyst" | "designer" | "backend" | "frontend" | "qa" | "sre";
export type RtStage = "analysis" | "todo" | "test";
export type RtWorkColumn = Extract<RtColumn, "inProgress">;
export type RtRunStatus = "running" | "won" | "lost";
export type RtSubtaskRole = "backend" | "frontend" | "design" | "qa" | "sre" | "bugfix";
export type RtSubtaskImportance = "critical" | "important" | "optional";

export interface RtSubtask {
  id: string;
  title: string;
  role: RtSubtaskRole;
  importance: RtSubtaskImportance;
  revealed: boolean;
  done: boolean;
  progress: number;
  completedBy: string | null;
  offRole: boolean;
}

export interface RtResources {
  trust: number;
  debt: number;
  value: number;
  clients: number;
  budget: number;
  processBoost: number;
}

export interface RtTask {
  id: string;
  title: string;
  kind: RtTaskKind;
  domain: string;
  column: RtColumn;
  pressure: number;
  complexity: number;
  value: number;
  clarity: number;
  quality: number;
  testCoverage: number;
  bugs: number;
  workDone: boolean;
  subtasks: RtSubtask[];
  currentSubtaskId: string | null;
  offRolePenalty: number;
  postmortem: string[];
  backlogTtlMs: number;
  backlogTtlMaxMs: number;
  deadlineMs: number;
  deadlineMaxMs: number;
  stageProgress: number;
  stageComplete: boolean;
  assignedCharacterId: string | null;
  released: boolean;
  releaseScore: number | null;
  queuedDeadlineMs: number | null;
  lastNote: string;
}

export interface RtCharacter {
  id: string;
  name: string;
  role: RtRole;
  skill: Record<RtStage, number>;
  specialty: Record<RtSubtaskRole, number>;
  xp: Record<RtSubtaskRole, number>;
  stamina: number;
  burnout: number;
  assignedTaskId: string | null;
  shockGameMinutes: number;
}

export interface RtEvent {
  at: string;
  type: string;
  title: string;
  body: string;
  effects: string[];
}

interface RtAssignmentPlan {
  character: RtCharacter;
  task: RtTask;
  subtask: RtSubtask | null;
  willAnalyze: boolean;
}

interface RtOutsourcePlan {
  task: RtTask;
  subtask: RtSubtask;
  cost: number;
}

export interface RtLossReport {
  reason: string;
  headline: string;
  explanation: string;
  primaryMetric: "trust" | "clients" | "debt";
  resourceSnapshot: RtResources;
  lastMissedTasks: Array<{ at: string; title: string; effects: string[] }>;
  lastBadReleases: Array<{ at: string; title: string; effects: string[] }>;
  activePressure: Array<{
    id: string;
    title: string;
    column: RtColumn;
    deadlineMs: number;
    assignedCharacterId: string | null;
  }>;
  suggestion: string;
}

export interface RtQuarterGoal {
  value: number;
  trust: number;
  rewardBudget: number;
}

export interface RtSpawnState {
  nextInMs: number;
  nextBurstInMs: number;
}

export interface RtGameState {
  seed: number;
  rngState: number;
  paused: boolean;
  status: RtRunStatus;
  lossReason: string | null;
  lossReport: RtLossReport | null;
  elapsedRealMs: number;
  elapsedGameMinutes: number;
  gameMinuteOfDay: number;
  day: number;
  quarter: number;
  dayInQuarter: number;
  daysPerQuarter: number;
  resources: RtResources;
  quarterGoal: RtQuarterGoal;
  quarterValue: number;
  board: Record<RtColumn, string[]>;
  tasks: Record<string, RtTask>;
  characters: Record<string, RtCharacter>;
  nextTaskId: number;
  nextCharacterId: number;
  spawn: RtSpawnState;
  log: RtEvent[];
}

const domains = ["payments", "auth", "admin", "search", "reports", "notifications"];

const titles: Record<RtTaskKind, string[]> = {
  feature: [
    "Add bonus payments",
    "Add CSV export",
    "Add user roles",
    "Add weekly report",
    "Add saved search",
    "Add notification preferences",
  ],
  bug: [
    "Fix login loop",
    "Fix duplicate charge",
    "Fix broken export",
    "Fix missing email",
    "Fix search timeout",
    "Fix permission error",
  ],
  techDebt: [
    "Refactor legacy payment module",
    "Clean old admin API",
    "Remove deprecated auth flow",
    "Improve test coverage",
    "Split report service",
    "Reduce frontend state hacks",
  ],
  integration: [
    "Connect billing provider",
    "Sync CRM contacts",
    "Import partner catalog",
    "Connect email gateway",
    "Add webhook receiver",
    "Sync analytics events",
  ],
  incident: [
    "Payment failures spike",
    "Login errors spike",
    "Emails stuck in queue",
    "Reports timeout in production",
    "Admin panel unavailable",
    "Search latency incident",
  ],
  performance: [
    "Optimize payment history query",
    "Reduce search latency",
    "Speed up report generation",
    "Cache admin dashboard",
    "Optimize notification worker",
    "Reduce auth DB load",
  ],
  compliance: [
    "Add audit log",
    "Export user data by request",
    "Mask sensitive fields",
    "Add permission review",
    "Add retention policy",
    "Add admin action history",
  ],
};

const domainPrefixes: Record<string, string> = {
  payments: "PAY",
  auth: "AUTH",
  admin: "ADM",
  search: "SRCH",
  reports: "REP",
  notifications: "NTF",
};

const names = ["Nina", "Oleg", "Mira", "Anton", "Lena", "Max"];

const baseSkills: Record<RtRole, Record<RtStage, number>> = {
  analyst: { analysis: 5, todo: 2, test: 2 },
  designer: { analysis: 3, todo: 3, test: 1 },
  backend: { analysis: 1, todo: 5, test: 2 },
  frontend: { analysis: 1, todo: 5, test: 2 },
  qa: { analysis: 2, todo: 1, test: 5 },
  sre: { analysis: 2, todo: 3, test: 4 },
};

const baseSpecialties: Record<RtRole, Record<RtSubtaskRole, number>> = {
  analyst: { backend: 1, frontend: 1, design: 2, qa: 2, sre: 1, bugfix: 1 },
  designer: { backend: 0, frontend: 3, design: 5, qa: 1, sre: 0, bugfix: 1 },
  backend: { backend: 5, frontend: 2, design: 0, qa: 1, sre: 2, bugfix: 4 },
  frontend: { backend: 2, frontend: 5, design: 2, qa: 1, sre: 0, bugfix: 3 },
  qa: { backend: 1, frontend: 1, design: 1, qa: 5, sre: 1, bugfix: 1 },
  sre: { backend: 3, frontend: 0, design: 0, qa: 3, sre: 5, bugfix: 3 },
};

export function createRealtimeState(seed = Date.now()): RtGameState {
  const state: RtGameState = {
    seed: seed >>> 0 || 1,
    rngState: seed >>> 0 || 1,
    paused: false,
    status: "running",
    lossReason: null,
    lossReport: null,
    elapsedRealMs: 0,
    elapsedGameMinutes: GAME_DAY_START_MINUTE,
    gameMinuteOfDay: GAME_DAY_START_MINUTE,
    day: 1,
    quarter: 1,
    dayInQuarter: 1,
    daysPerQuarter: 1,
    resources: {
      trust: 70,
      debt: 20,
      value: 0,
      clients: 100,
      budget: 4,
      processBoost: 0,
    },
    quarterGoal: {
      value: 75,
      trust: 45,
      rewardBudget: 2,
    },
    quarterValue: 0,
    board: createBoard(),
    tasks: {},
    characters: {},
    nextTaskId: 1,
    nextCharacterId: 1,
    spawn: {
      nextInMs: randomBetween(
        { rngState: seed >>> 0 || 1 },
        FIRST_SPAWN_MIN_MS,
        FIRST_SPAWN_MAX_MS,
      ),
      nextBurstInMs: randomBetween(
        { rngState: seed >>> 0 || 1 },
        BURST_INTERVAL_MIN_MS,
        BURST_INTERVAL_MAX_MS,
      ),
    },
    log: [],
  };

  for (const role of ["analyst", "backend", "frontend", "qa", "sre"] as RtRole[]) {
    const character = createCharacter(state, role);
    state.characters[character.id] = character;
  }

  for (let index = 0; index < 2; index += 1) {
    addTask(state, generateTask(state));
  }

  pushEvent(state, {
    type: "run_started",
    title: "Run started",
    body: "Realtime flow is live.",
    effects: ["trust 70", "clients 100", "day starts at 08:00"],
  });

  return state;
}

export function normalizeRealtimeState(state: RtGameState): boolean {
  let changed = false;
  const board = state.board as Record<string, string[] | undefined>;

  for (const column of RT_COLUMNS) {
    if (!board[column]) {
      board[column] = [];
      changed = true;
    }
  }

  const legacyWorkIds = [
    ...(board.analysis ?? []),
    ...(board.todo ?? []),
    ...(board.test ?? []),
  ];
  if (legacyWorkIds.length > 0) {
    for (const taskId of legacyWorkIds) {
      const task = state.tasks[taskId];
      if (!task || task.released) continue;
      task.column = "inProgress";
      task.stageComplete = false;
      task.lastNote = "Ready for analysis, implementation, or QA.";
      if (!state.board.inProgress.includes(taskId)) {
        state.board.inProgress.push(taskId);
      }
    }
    board.analysis = [];
    board.todo = [];
    board.test = [];
    changed = true;
  }

  for (const task of Object.values(state.tasks)) {
    const legacyColumn = (task as unknown as { column: string }).column;
    const queueFields = task as RtTask & { queuedDeadlineMs?: number | null };
    if (!("queuedDeadlineMs" in queueFields)) {
      task.queuedDeadlineMs =
        task.column === "done" || task.released ? Math.max(0, task.deadlineMs) : null;
      changed = true;
    }
    if (legacyColumn === "analysis" || legacyColumn === "todo" || legacyColumn === "test") {
      task.column = "inProgress";
      task.stageComplete = false;
      task.lastNote = "Ready for analysis, implementation, or QA.";
      task.queuedDeadlineMs = null;
      if (!state.board.inProgress.includes(task.id)) {
        state.board.inProgress.push(task.id);
      }
      changed = true;
    }
    if (task.released && task.column !== "released") {
      task.column = "released";
      if (!state.board.released.includes(task.id)) {
        state.board.released.unshift(task.id);
      }
      changed = true;
    }
    if (!task.released && task.bugs > 0 && ensureBugReviewSubtask(task)) {
      changed = true;
    }
  }

  for (const character of Object.values(state.characters)) {
    const legacy = character as RtCharacter & { fatigue?: number; morale?: number };
    if (typeof character.stamina !== "number") {
      const fatigue = typeof legacy.fatigue === "number" ? legacy.fatigue : 0;
      const morale = typeof legacy.morale === "number" ? legacy.morale : 75;
      character.stamina = clamp(100 - fatigue * 0.7 + (morale - 75) * 0.25, 0, 100);
      changed = true;
    }
  }

  if (typeof state.resources.budget !== "number") {
    state.resources.budget = 4;
    changed = true;
  }

  for (const task of Object.values(state.tasks)) {
    for (const [column, taskIds] of Object.entries(board)) {
      if (!Array.isArray(taskIds) || column === task.column) continue;
      const nextIds = taskIds.filter((taskId) => taskId !== task.id);
      if (nextIds.length !== taskIds.length) {
        board[column] = nextIds;
        changed = true;
      }
    }
    if (!state.board[task.column].includes(task.id)) {
      state.board[task.column].push(task.id);
      changed = true;
    }
  }

  return changed;
}

export function tickRealtime(state: RtGameState, tickMs = TICK_MS): void {
  normalizeRealtimeState(state);
  if (state.paused || state.status !== "running") return;

  state.elapsedRealMs += tickMs;
  const gameMinutes = (tickMs / 1000) * GAME_MINUTES_PER_REAL_SECOND;
  state.elapsedGameMinutes += gameMinutes;
  const previousGameMinuteOfDay = state.gameMinuteOfDay;
  state.gameMinuteOfDay += gameMinutes;

  if (crossedReleaseTrain(previousGameMinuteOfDay, state.gameMinuteOfDay)) {
    runDailyReleaseTrain(state);
    state.gameMinuteOfDay = GAME_DAY_START_MINUTE;
    advanceDay(state);
  }

  updateShock(state, gameMinutes);
  updateTaskTimers(state, tickMs);
  updateAssignments(state, tickMs);
  updateSpawner(state, tickMs);
  checkRunState(state);
}

export function moveRealtimeTask(
  state: RtGameState,
  taskId: string,
  targetColumn: RtColumn,
): boolean {
  const task = state.tasks[taskId];
  if (!task || task.released || task.assignedCharacterId) return false;
  if (task.column === targetColumn) return true;
  if (targetColumn === "released") return false;

  if (task.column === "done") {
    if (targetColumn !== "inProgress") return false;
    state.resources.trust = clamp(state.resources.trust - DONE_REWORK_TRUST_COST, 0, 100);
    removeTaskFromBoard(state, taskId);
    task.column = "inProgress";
    task.stageProgress = 0;
    task.currentSubtaskId = null;
    task.stageComplete = taskReadyForDone(task);
    task.queuedDeadlineMs = null;
    task.lastNote = "Pulled back from Done for rework.";
    state.board.inProgress.push(taskId);
    pushEvent(state, {
      type: "done_reopened",
      title: `${task.id} reopened`,
      body: `${task.title} was pulled back from the release queue.`,
      effects: [`trust -${DONE_REWORK_TRUST_COST}`, "deadline resumes"],
    });
    return true;
  }

  if (targetColumn === "done") {
    removeTaskFromBoard(state, taskId);
    task.column = "done";
    task.stageProgress = 0;
    task.currentSubtaskId = null;
    task.stageComplete = true;
    task.queuedDeadlineMs = Math.max(0, task.deadlineMs);
    task.lastNote = "Queued for the daily release train.";
    state.board.done.unshift(taskId);
    pushEvent(state, {
      type: "queued_for_release",
      title: `${task.id} queued`,
      body: `${task.title} will ship with the daily release train.`,
      effects: [`score ${releaseScore(state, task)}`, "deadline locked", "business effects pending"],
    });
    return true;
  }

  removeTaskFromBoard(state, taskId);
  task.column = targetColumn;
  task.stageProgress = 0;
  task.currentSubtaskId = null;
  task.stageComplete = false;
  task.queuedDeadlineMs = null;
  task.lastNote = stageNote(targetColumn);
  state.board[targetColumn].push(taskId);
  return true;
}

function getAssignmentPlan(
  state: RtGameState,
  characterId: string,
  taskId: string,
): RtAssignmentPlan | null {
  const character = state.characters[characterId];
  const task = state.tasks[taskId];
  if (!character || !task) return null;
  if (character.assignedTaskId || task.assignedCharacterId) return null;
  if (!isWorkColumn(task.column) || task.released) return null;

  const subtask = chooseSubtaskForAssignment(task, character);
  const willAnalyze = !subtask && shouldAnalyzeTask(task, character);
  if (!subtask && !willAnalyze) return null;

  return { character, task, subtask, willAnalyze };
}

function getOutsourcePlan(state: RtGameState, taskId: string): RtOutsourcePlan | null {
  const task = state.tasks[taskId];
  if (!task || task.assignedCharacterId || task.released || !isWorkColumn(task.column)) {
    return null;
  }
  const subtask = chooseSubtaskForOutsource(state, task, state.resources.budget);
  if (!subtask) return null;
  return {
    task,
    subtask,
    cost: OUTSOURCE_COST_BY_IMPORTANCE[subtask.importance],
  };
}

export function assignCharacterToTask(
  state: RtGameState,
  characterId: string,
  taskId: string,
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
  pushEvent(state, {
    type: "assigned",
    title: `${character.name} started ${task.id}`,
    body: subtask
      ? `${task.title}: ${subtask.title}.`
      : `${task.title}: analysis pass.`,
    effects: [
      subtask ? "task work" : "clarity work",
      ...(subtask ? [`subtask ${subtask.role}`, subtask.importance] : []),
    ],
  });
  return true;
}

export function canAssignCharacterToTask(
  state: RtGameState,
  characterId: string,
  taskId: string,
): boolean {
  return Boolean(getAssignmentPlan(state, characterId, taskId));
}

export function canOutsourceTaskWork(state: RtGameState, taskId: string): boolean {
  const plan = getOutsourcePlan(state, taskId);
  return Boolean(plan && state.resources.budget >= plan.cost);
}

export function outsourceTaskWork(state: RtGameState, taskId: string): boolean {
  const plan = getOutsourcePlan(state, taskId);
  if (!plan || state.resources.budget < plan.cost) return false;
  const { task, subtask, cost } = plan;

  state.resources.budget = Math.max(0, state.resources.budget - cost);
  subtask.done = true;
  subtask.progress = 100;
  subtask.completedBy = "outsourcing";
  subtask.offRole = false;

  const bugfixWork = isBugfixWork(subtask);
  const qualityGain = bugfixWork ? 18 : subtask.importance === "critical" ? 16 : 11;
  if (bugfixWork) {
    task.bugs = Math.max(0, task.bugs - 1);
  }
  task.quality = clamp(task.quality + qualityGain, 0, 100);
  task.workDone = task.subtasks.some((candidate) => candidate.done && candidate.role !== "qa");
  task.currentSubtaskId = null;
  task.stageProgress = 100;
  task.stageComplete = true;
  task.lastNote = `Outsourcing completed ${subtask.role} work.`;

  pushEvent(state, {
    type: "outsourced",
    title: `${task.id} outsourced`,
    body: `External contractor completed ${subtask.title}.`,
    effects: [
      `budget -${cost}`,
      `subtask ${subtask.role}`,
      subtask.importance,
      `quality ${task.quality}`,
      `bugs ${task.bugs}`,
    ],
  });

  return true;
}

export function cancelTaskWork(state: RtGameState, taskId: string): boolean {
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
    pushEvent(state, {
      type: "cancelled",
      title: `${task.id} interrupted`,
      body: `${character.name} was pulled off the task.`,
      effects: ["stamina -12", "context shock 20m", "stage progress -8"],
    });
  }
  return true;
}

export function releaseRealtimeTask(state: RtGameState, taskId: string): boolean {
  const task = state.tasks[taskId];
  if (!task || task.released || task.assignedCharacterId) return false;

  const postmortem = buildReleasePostmortem(task);
  const score = releaseScore(state, task);
  const valueGain = Math.max(0, Math.round(task.value * (score / 100)));
  const budgetGain = releaseBudgetGain(valueGain, score);
  const sreSafety = task.subtasks.some((subtask) => subtask.role === "sre" && subtask.done);
  const blastMultiplier = sreSafety ? 0.65 : 1.15;
  const trustDelta =
    score >= 80 ? 5 : score >= 60 ? 2 : score >= 40 ? -Math.ceil(5 * blastMultiplier) : -Math.ceil(12 * blastMultiplier);
  const clientDelta =
    score >= 75 ? 2 : score >= 50 ? 0 : -Math.ceil(((55 - score) / 5) * blastMultiplier);
  const debtDelta =
    score >= 75 ? -1 : Math.ceil(((75 - score) / 12 + task.bugs) * blastMultiplier);

  state.resources.value += valueGain;
  state.resources.budget += budgetGain;
  state.quarterValue += valueGain;
  state.resources.trust = clamp(state.resources.trust + trustDelta, 0, 100);
  state.resources.clients = clamp(state.resources.clients + clientDelta, 0, 100);
  state.resources.debt = clamp(state.resources.debt + debtDelta, 0, 100);

  task.releaseScore = score;
  task.postmortem = postmortem;
  task.released = true;
  task.column = "released";
  task.stageComplete = true;
  task.assignedCharacterId = null;
  task.lastNote = releaseNote(score);
  removeTaskFromBoard(state, taskId);
  state.board.released.unshift(taskId);

  pushEvent(state, {
    type: "release",
    title: `${task.id} released`,
    body: releaseNote(score),
    effects: [
      `score ${score}`,
      `value +${valueGain}`,
      ...(budgetGain > 0 ? [`budget +${budgetGain}`] : []),
      `trust ${formatDelta(trustDelta)}`,
      `clients ${formatDelta(clientDelta)}`,
      `debt ${formatDelta(debtDelta)}`,
      ...(sreSafety ? ["SRE blast radius reduced"] : ["no SRE safety"]),
    ],
  });

  if (score < 55) {
    scheduleBadFollowUp(state, task);
  }

  return true;
}

export function runDailyReleaseTrain(state: RtGameState): string[] {
  const taskIds = [...state.board.done].filter((taskId) => {
    const task = state.tasks[taskId];
    return task && !task.released && !task.assignedCharacterId;
  });

  if (taskIds.length === 0) {
    pushEvent(state, {
      type: "release_train_empty",
      title: "Release train departed empty",
      body: "No tasks were queued in Done.",
      effects: ["no business effects"],
    });
    return [];
  }

  const shipped: string[] = [];
  for (const taskId of taskIds.slice().reverse()) {
    if (releaseRealtimeTask(state, taskId)) shipped.unshift(taskId);
  }

  pushEvent(state, {
    type: "release_train",
    title: `Release train shipped ${shipped.length}`,
    body: `${shipped.length} task(s) moved from Done to Released.`,
    effects: shipped.slice(0, 4),
  });

  return shipped;
}

export function formatGameTime(state: RtGameState): string {
  const hour = Math.floor(state.gameMinuteOfDay / 60);
  const minute = Math.floor(state.gameMinuteOfDay % 60);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function stageForColumn(column: RtColumn): RtStage | null {
  if (column === "inProgress") return "todo";
  return null;
}

export function isWorkColumn(column: RtColumn): column is RtWorkColumn {
  return column === "inProgress";
}

export function taskDeadlineRatio(task: RtTask): number {
  return task.deadlineMaxMs <= 0 ? 0 : task.deadlineMs / task.deadlineMaxMs;
}

export function releaseScore(state: RtGameState, task: RtTask): number {
  const deadlineMsForScore = task.queuedDeadlineMs ?? task.deadlineMs;
  const deadlineRatioForScore =
    task.deadlineMaxMs <= 0 ? 0 : deadlineMsForScore / task.deadlineMaxMs;
  const deadlinePenalty =
    deadlineMsForScore <= 0 ? 18 : deadlineRatioForScore < 0.2 ? 8 : 0;
  const bugPenalty = task.bugs * 12;
  const debtPenalty = state.resources.debt * 0.12;
  const openCritical = task.subtasks.filter(
    (subtask) => subtask.importance === "critical" && !subtask.done,
  ).length;
  const openImportant = task.subtasks.filter(
    (subtask) => subtask.importance === "important" && !subtask.done,
  ).length;
  const hiddenOpen = task.subtasks.filter((subtask) => !subtask.revealed && !subtask.done).length;
  const completedRatio =
    task.subtasks.length === 0
      ? 0
      : task.subtasks.filter((subtask) => subtask.done).length / task.subtasks.length;
  const score =
    task.quality * 0.45 +
    task.clarity * 0.25 +
    task.testCoverage * 0.25 +
    completedRatio * 25 +
    (task.workDone ? 8 : -18) -
    openCritical * 22 -
    openImportant * 9 -
    hiddenOpen * 10 -
    task.offRolePenalty -
    deadlinePenalty -
    bugPenalty -
    debtPenalty;
  return Math.round(clamp(score, 0, 100));
}

function createCharacter(state: RtGameState, role: RtRole): RtCharacter {
  return {
    id: `C-${state.nextCharacterId++}`,
    name: names[(state.nextCharacterId + Object.keys(state.characters).length) % names.length],
    role,
    skill: { ...baseSkills[role] },
    specialty: { ...baseSpecialties[role] },
    xp: { backend: 0, frontend: 0, design: 0, qa: 0, sre: 0, bugfix: 0 },
    stamina: 100,
    burnout: 0,
    assignedTaskId: null,
    shockGameMinutes: 0,
  };
}

function generateTask(state: RtGameState, forcedKind?: RtTaskKind): RtTask {
  const kind = forcedKind ?? chooseTaskKind(state);
  const domain = pickOne(state, domains);
  const id = `${domainPrefixes[domain]}-${String(state.nextTaskId++).padStart(3, "0")}`;
  const pressure = kind === "incident" ? randomInt(state, 4, 6) : randomInt(state, 1, 5);
  const complexity = randomInt(state, 1, 5);
  const trustNoise = (100 - state.resources.trust) * 0.45;
  const debtNoise = state.resources.debt * 0.1;
  const clarity = clamp(randomInt(state, 48, 88) - trustNoise - debtNoise, 8, 92);
  const deadlineMs = Math.round(
    randomBetween(state, 520000, 780000) + complexity * 45000 - pressure * 15000,
  );
  const value = Math.round((8 + complexity * 4 + pressure * 3) * kindValueMultiplier(kind));
  const subtasks = generateSubtasks(state, id, kind, complexity);
  revealInitialSubtasks(state, subtasks, Math.round(clarity));

  return {
    id,
    title: `${id}: ${pickOne(state, titles[kind])}`,
    kind,
    domain,
    column: "backlog",
    pressure,
    complexity,
    value,
    clarity: Math.round(clarity),
    quality: Math.max(0, Math.round(clarity * 0.25)),
    testCoverage: 0,
    bugs: 0,
    workDone: false,
    subtasks,
    currentSubtaskId: null,
    offRolePenalty: 0,
    postmortem: [],
    backlogTtlMs: 0,
    backlogTtlMaxMs: 0,
    deadlineMs: Math.max(420000, deadlineMs),
    deadlineMaxMs: Math.max(420000, deadlineMs),
    stageProgress: 0,
    stageComplete: false,
    assignedCharacterId: null,
    released: false,
    releaseScore: null,
    queuedDeadlineMs: null,
    lastNote: "Waiting in backlog.",
  };
}

function generateSubtasks(
  state: RtGameState,
  taskId: string,
  kind: RtTaskKind,
  complexity: number,
): RtSubtask[] {
  const specs: Array<{
    role: RtSubtaskRole;
    importance: RtSubtaskImportance;
    title: string;
  }> = [];

  const add = (
    role: RtSubtaskRole,
    importance: RtSubtaskImportance,
    title: string,
  ) => specs.push({ role, importance, title });

  if (kind === "feature") {
    add("backend", "critical", "Build server-side behavior");
    add("frontend", "important", "Wire UI state");
    add("qa", "important", "Validate happy path and edge cases");
    if (complexity >= 3) add("design", "important", "Clarify product interaction");
    if (complexity >= 4 || chance(state, 0.35)) add("sre", "optional", "Prepare rollout safety");
  }

  if (kind === "bug") {
    add(chance(state, 0.5) ? "backend" : "frontend", "critical", "Fix root cause");
    add("qa", "important", "Reproduce and verify fix");
    if (chance(state, 0.35)) add("sre", "optional", "Add alert for recurrence");
  }

  if (kind === "techDebt") {
    add("backend", "critical", "Refactor risky module");
    add("qa", complexity >= 3 ? "important" : "optional", "Run regression pass");
    if (chance(state, 0.45)) add("sre", "optional", "Clean operational config");
  }

  if (kind === "integration") {
    add("backend", "critical", "Implement integration contract");
    add("sre", "important", "Handle timeouts and retries");
    add("qa", "important", "Validate failure modes");
    if (chance(state, 0.4)) add("frontend", "optional", "Expose integration status");
  }

  if (kind === "incident") {
    add("sre", "critical", "Stabilize production path");
    add("backend", "important", "Patch service behavior");
    add("qa", "optional", "Smoke test recovery");
  }

  if (kind === "performance") {
    add("sre", "critical", "Reduce production pressure");
    add("backend", "important", "Optimize hot path");
    add("qa", "important", "Load-test critical scenario");
  }

  if (kind === "compliance") {
    add("qa", "critical", "Verify compliance scenario");
    add("backend", "important", "Implement policy enforcement");
    add("sre", "important", "Add audit/retention safety");
    if (chance(state, 0.35)) add("frontend", "optional", "Show compliant UI copy");
  }

  return specs.map((spec, index) => ({
    id: `${taskId}-S${index + 1}`,
    title: spec.title,
    role: spec.role,
    importance: spec.importance,
    revealed: false,
    done: false,
    progress: 0,
    completedBy: null,
    offRole: false,
  }));
}

function revealInitialSubtasks(
  state: RtGameState,
  subtasks: RtSubtask[],
  clarity: number,
): void {
  const critical = subtasks.find((subtask) => subtask.importance === "critical");
  if (critical) critical.revealed = true;

  const visibleCount = clarity >= 70 ? 3 : clarity >= 45 ? 2 : 1;
  for (const subtask of shuffle(state, subtasks).slice(0, visibleCount)) {
    subtask.revealed = true;
  }
}

function addTask(state: RtGameState, task: RtTask): boolean {
  if (state.board.backlog.length >= 5) return false;
  state.tasks[task.id] = task;
  state.board.backlog.unshift(task.id);
  pushEvent(state, {
    type: "task_spawned",
    title: `${task.id} arrived`,
    body: task.title,
    effects: [`clarity ${task.clarity}`, `deadline ${Math.round(task.deadlineMs / 1000)}s`],
  });
  return true;
}

function updateTaskTimers(state: RtGameState, tickMs: number): void {
  for (const task of Object.values(state.tasks)) {
    if (task.released || task.column === "done") continue;
    task.deadlineMs = Math.max(0, task.deadlineMs - tickMs);
  }
}

function updateAssignments(state: RtGameState, tickMs: number): void {
  const tickSeconds = tickMs / 1000;
  for (const task of Object.values(state.tasks)) {
    if (!task.assignedCharacterId || !isWorkColumn(task.column)) continue;
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
    character.stamina = clamp(
      character.stamina -
        tickSeconds *
          (0.28 + task.pressure * 0.045 + task.complexity * 0.02 + (offRole ? 0.12 : 0)),
      0,
      100,
    );
    if (subtask) subtask.progress = task.stageProgress;
    if (character.stamina < 20) {
      character.burnout = clamp(
        character.burnout + tickSeconds * (0.06 + task.pressure * 0.012 + (offRole ? 0.025 : 0)),
        0,
        100,
      );
    }

    if (task.stageProgress >= 100) {
      completeStage(state, task, character, stage);
    }
  }
}

function completeStage(
  state: RtGameState,
  task: RtTask,
  character: RtCharacter,
  stage: RtStage,
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
    pushEvent(state, {
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
      task.postmortem.push(`${character.name} completed ${subtask.role} work off-role.`);
    }

    if (subtask.role === "qa") {
      const coverageGain = Math.round(
        (22 + character.skill.test * 6 + roleFit * 4 + randomInt(state, 0, 8)) *
          (offRole ? 0.72 : 1),
      );
      task.testCoverage = clamp(task.testCoverage + coverageGain, 0, 100);
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
      pushEvent(state, {
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

    const importanceQuality = subtask.importance === "critical" ? 14 : subtask.importance === "important" ? 9 : 5;
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
    pushEvent(state, {
      type: bugfixWork ? "bugfix_done" : "subtask_done",
      title: `${task.id} ${subtask.role} done`,
      body: `${character.name} completed ${subtask.title}.`,
      effects: [
        subtask.importance,
        offRole ? "off-role" : "on-role",
        `quality ${task.quality}`,
        `bugs ${task.bugs}`,
        ...(introducedBugs > 0 ? [`bugs +${introducedBugs}`] : []),
      ],
    });
    return;
  }

  const coverageGain = 24 + character.skill.test * 8 + randomInt(state, 0, 8);
  task.testCoverage = clamp(task.testCoverage + coverageGain, 0, 100);
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
  pushEvent(state, {
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

function chooseSubtaskForAssignment(
  task: RtTask,
  character: RtCharacter,
): RtSubtask | null {
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

function chooseSubtaskForOutsource(
  state: RtGameState,
  task: RtTask,
  availableBudget: number,
): RtSubtask | null {
  const open = getOpenTodoSubtasks(task).filter(
    (subtask) => OUTSOURCE_COST_BY_IMPORTANCE[subtask.importance] <= availableBudget,
  );
  if (open.length === 0) return null;
  return open
    .map((subtask) => ({
      subtask,
      score:
        missingTeamCompetencyScore(state, subtask) +
        importanceWeight(subtask.importance) +
        (subtask.role === "qa" ? -18 : 0) -
        subtask.progress * 0.1,
    }))
    .sort((a, b) => b.score - a.score)[0].subtask;
}

function canTakeOffRoleSubtask(character: RtCharacter, subtask: RtSubtask): boolean {
  if (subtask.role === "bugfix") return character.specialty.bugfix > 0;
  return character.specialty[subtask.role] > 0;
}

function missingTeamCompetencyScore(state: RtGameState, subtask: RtSubtask): number {
  const bestSkill = Math.max(
    0,
    ...Object.values(state.characters).map((character) => character.specialty[subtask.role] ?? 0),
  );
  if (bestSkill <= 1) return 42;
  if (bestSkill === 2) return 30;
  if (bestSkill === 3) return 16;
  return 0;
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
  const roles = entries
    .filter(([, skill]) => skill >= strongSkill)
    .map(([role]) => role);
  if (character.specialty.bugfix >= 3 && !roles.includes("bugfix")) {
    roles.push("bugfix");
  }
  return roles;
}

function taskReadyForDone(task: RtTask): boolean {
  return task.workDone && getOpenTodoSubtasks(task).length === 0 && task.bugs === 0;
}

function getOpenTodoSubtasks(task: RtTask): RtSubtask[] {
  return task.subtasks.filter((subtask) => subtask.revealed && !subtask.done);
}

function introduceImplementationBugs(
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

function discoverBugsDuringQa(state: RtGameState, task: RtTask): number {
  const openCritical = task.subtasks.filter(
    (subtask) => subtask.importance === "critical" && !subtask.done && subtask.role !== "qa",
  ).length;
  if (openCritical > 0 && chance(state, 0.45)) return 1;
  if (task.quality < 45) return randomInt(state, 0, 1);
  if (task.quality < 70 && chance(state, 0.25)) return 1;
  return 0;
}

function ensureBugReviewSubtask(task: RtTask): RtSubtask | null {
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

function revealSubtasksByAnalysis(
  state: RtGameState,
  task: RtTask,
  clarityGain: number,
): RtSubtask[] {
  const hidden = task.subtasks.filter((subtask) => !subtask.revealed);
  const revealCount = Math.min(
    hidden.length,
    clarityGain >= 38 ? 3 : clarityGain >= 28 ? 2 : 1,
  );
  const revealed = shuffle(state, hidden)
    .sort((a, b) => importanceWeight(b.importance) - importanceWeight(a.importance))
    .slice(0, revealCount);
  for (const subtask of revealed) {
    subtask.revealed = true;
  }
  return revealed;
}

function addBugfixSubtasks(
  state: RtGameState,
  task: RtTask,
  count: number,
): RtSubtask[] {
  const added: RtSubtask[] = [];
  const rolePool = shuffle(state, bugfixRoleCandidates(task));
  for (let index = 0; index < count; index += 1) {
    const role = rolePool[index % rolePool.length];
    const subtask: RtSubtask = {
      id: `${task.id}-B${task.subtasks.length + 1}`,
      title:
        role === "sre"
          ? "Stabilize production failure mode"
          : role === "design"
            ? "Fix product interaction defect"
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

function isBugfixWork(subtask: RtSubtask): boolean {
  return subtask.role === "bugfix" || subtask.id.includes("-B");
}

function importanceWeight(importance: RtSubtaskImportance): number {
  if (importance === "critical") return 35;
  if (importance === "important") return 20;
  return 8;
}

function roleMatchesSubtask(role: RtRole, subtaskRole: RtSubtaskRole): boolean {
  if (role === subtaskRole) return true;
  if (role === "designer" && subtaskRole === "design") return true;
  if ((role === "backend" || role === "frontend" || role === "sre") && subtaskRole === "bugfix") {
    return true;
  }
  return false;
}

function buildReleasePostmortem(task: RtTask): string[] {
  const notes = [...task.postmortem];
  const openCritical = task.subtasks.filter(
    (subtask) => subtask.importance === "critical" && !subtask.done,
  );
  const openImportant = task.subtasks.filter(
    (subtask) => subtask.importance === "important" && !subtask.done,
  );
  const hiddenOpen = task.subtasks.filter((subtask) => !subtask.revealed && !subtask.done);
  const sreSubtasks = task.subtasks.filter((subtask) => subtask.role === "sre");
  const sreDone = sreSubtasks.some((subtask) => subtask.done);

  for (const subtask of openCritical) {
    notes.push(`Critical ${subtask.role} work was not finished: ${subtask.title}.`);
  }
  if (openImportant.length > 0) {
    notes.push(`${openImportant.length} important subtask(s) were still open.`);
  }
  if (hiddenOpen.length > 0) {
    notes.push(`${hiddenOpen.length} hidden subtask(s) were never discovered by analysis.`);
  }
  if (task.bugs > 0) {
    notes.push(`${task.bugs} known bug(s) shipped.`);
  }
  if (task.testCoverage < 45) {
    notes.push("QA coverage was low.");
  }
  if (sreSubtasks.length > 0 && !sreDone) {
    notes.push("SRE safety was missing, so blast radius was higher.");
  }
  if (notes.length === 0) {
    notes.push("Release was clean: critical work was done and no known bugs shipped.");
  }
  return notes;
}

function updateSpawner(state: RtGameState, tickMs: number): void {
  if (state.board.backlog.length >= 5) return;

  state.spawn.nextInMs -= tickMs;
  state.spawn.nextBurstInMs -= tickMs;

  if (state.spawn.nextBurstInMs <= 0) {
    const count = Math.min(1, 5 - state.board.backlog.length);
    for (let index = 0; index < count; index += 1) {
      if (state.board.backlog.length < 5) addTask(state, generateTask(state));
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
    addTask(state, generateTask(state));
    state.spawn.nextInMs = randomSpawnInterval(state);
  }
}

function updateShock(state: RtGameState, gameMinutes: number): void {
  for (const character of Object.values(state.characters)) {
    character.shockGameMinutes = Math.max(0, character.shockGameMinutes - gameMinutes);
    if (!character.assignedTaskId) {
      character.stamina = clamp(character.stamina + gameMinutes * 0.12, 0, 100);
    }
  }
}

function crossedReleaseTrain(previousMinute: number, nextMinute: number): boolean {
  return previousMinute < RELEASE_TRAIN_GAME_MINUTE && nextMinute >= RELEASE_TRAIN_GAME_MINUTE;
}

function advanceDay(state: RtGameState): void {
  restTeamForNewDay(state);
  state.day += 1;
  state.dayInQuarter += 1;
  pushEvent(state, {
    type: "day_started",
    title: `Day ${state.day}`,
    body: "A new production day starts. The team had overnight rest.",
    effects: [`stamina +${DAY_REST_STAMINA_BOOST}`, "context shock cleared", "clock reset to 08:00"],
  });

  if (state.dayInQuarter > state.daysPerQuarter) {
    resolveQuarter(state);
  }
}

function restTeamForNewDay(state: RtGameState): void {
  for (const character of Object.values(state.characters)) {
    character.stamina = clamp(character.stamina + DAY_REST_STAMINA_BOOST, 0, 100);
    character.shockGameMinutes = 0;
  }
}

function resolveQuarter(state: RtGameState): void {
  const hitGoal =
    state.quarterValue >= state.quarterGoal.value &&
    state.resources.trust >= state.quarterGoal.trust;
  if (hitGoal) {
    state.resources.budget += state.quarterGoal.rewardBudget;
    state.resources.processBoost = clamp(state.resources.processBoost + 5, 0, 25);
  } else {
    state.resources.trust = clamp(state.resources.trust - 8, 0, 100);
  }

  pushEvent(state, {
    type: "quarter_review",
    title: `Quarter ${state.quarter} review`,
    body: hitGoal ? "Business goals were met." : "Business goals were missed.",
    effects: hitGoal
      ? [`budget +${state.quarterGoal.rewardBudget}`, "process boost +5%"]
      : ["trust -8"],
  });

  state.quarter += 1;
  state.dayInQuarter = 1;
  state.quarterValue = 0;
  state.quarterGoal = {
    value: Math.round(state.quarterGoal.value * 1.18 + 20),
    trust: Math.min(70, state.quarterGoal.trust + 3),
    rewardBudget: state.quarterGoal.rewardBudget,
  };
}

function scheduleBadFollowUp(state: RtGameState, source: RtTask): void {
  if (!chance(state, 0.65)) return;
  const followUp = generateTask(state, source.bugs > 1 ? "bug" : "incident");
  followUp.title = `${followUp.id}: Follow up ${source.id}`;
  followUp.pressure = clamp(source.pressure + 1, 1, 6);
  followUp.clarity = clamp(followUp.clarity - 20, 5, 100);
  addTask(state, followUp);
}

function checkRunState(state: RtGameState): void {
  if (state.resources.trust <= 0) {
    loseRun(state, "business trust reached 0", "trust");
  }
  if (state.resources.clients <= 0) {
    loseRun(state, "clients left the product", "clients");
  }
  if (state.resources.debt >= 100) {
    loseRun(state, "technical debt reached 100", "debt");
  }
}

function loseRun(
  state: RtGameState,
  reason: string,
  primaryMetric: RtLossReport["primaryMetric"],
): void {
  if (state.status === "lost") return;
  state.status = "lost";
  state.lossReason = reason;
  state.lossReport = buildLossReport(state, reason, primaryMetric);
  pushEvent(state, {
    type: "run_lost",
    title: "Run lost",
    body: state.lossReport.explanation,
    effects: [
      `trust ${state.resources.trust}`,
      `clients ${state.resources.clients}`,
      `debt ${state.resources.debt}`,
    ],
  });
}

function buildLossReport(
  state: RtGameState,
  reason: string,
  primaryMetric: RtLossReport["primaryMetric"],
): RtLossReport {
  const lastMissedTasks: RtLossReport["lastMissedTasks"] = [];
  const lastBadReleases = state.log
    .filter(
      (event) =>
        event.type === "release" &&
        event.effects.some((effect) => effect.startsWith("trust -") || effect.startsWith("clients -")),
    )
    .slice(0, 5)
    .map((event) => ({
      at: event.at,
      title: event.title,
      effects: event.effects,
    }));
  const activePressure = Object.values(state.tasks)
    .filter((task) => !task.released)
    .sort((a, b) => a.deadlineMs - b.deadlineMs)
    .slice(0, 6)
    .map((task) => ({
      id: task.id,
      title: task.title,
      column: task.column,
      deadlineMs: Math.round(task.deadlineMs),
      assignedCharacterId: task.assignedCharacterId,
    }));

  const headline =
    primaryMetric === "trust"
      ? "Business trust hit zero."
      : primaryMetric === "clients"
        ? "Customers left the product."
        : "Technical debt overwhelmed the product.";
  const badReleaseCount = lastBadReleases.length;
  const explanation =
    primaryMetric === "trust"
      ? `Trust fell to 0. The latest run had ${badReleaseCount} recent release(s) that hurt trust or clients.`
      : primaryMetric === "clients"
        ? `Clients fell to 0. Recent low-quality releases and missed work made customers leave.`
        : `Debt reached 100. Recent releases shipped with too much risk, bugs, or unfinished work.`;
  const suggestion =
    badReleaseCount > 0
      ? "Do more Analysis, assign QA in To Do, and fix bugfix subtasks before moving cards to Done."
      : "Watch the deadline bars. Releasing late or low-quality work will drain trust.";

  return {
    reason,
    headline,
    explanation,
    primaryMetric,
    resourceSnapshot: { ...state.resources },
    lastMissedTasks,
    lastBadReleases,
    activePressure,
    suggestion,
  };
}

function chooseTaskKind(state: RtGameState): RtTaskKind {
  const weights: Array<{ item: RtTaskKind; weight: number }> = [
    { item: "feature", weight: 30 },
    { item: "bug", weight: 14 },
    { item: "techDebt", weight: 8 },
    { item: "integration", weight: 14 },
    { item: "incident", weight: 5 },
    { item: "performance", weight: 10 },
    { item: "compliance", weight: 9 },
  ];
  for (const entry of weights) {
    if (state.resources.debt > 55 && entry.item === "bug") entry.weight += 14;
    if (state.resources.debt > 55 && entry.item === "techDebt") entry.weight += 10;
    if (state.resources.debt > 55 && entry.item === "performance") entry.weight += 10;
    if (state.resources.trust < 40 && entry.item === "incident") entry.weight += 12;
  }
  return weightedPick(state, weights);
}

function randomSpawnInterval(state: RtGameState): number {
  const trustPressure = state.resources.trust < 40 ? 0.85 : state.resources.trust < 60 ? 0.95 : 1;
  const debtPressure = state.resources.debt > 60 ? 0.9 : 1;
  const backlogRelief = state.board.backlog.length >= 4 ? 1.6 : state.board.backlog.length >= 3 ? 1.25 : 1;
  return Math.round(
    randomBetween(state, SPAWN_INTERVAL_MIN_MS, SPAWN_INTERVAL_MAX_MS) *
      trustPressure *
      debtPressure *
      backlogRelief,
  );
}

function createBoard(): Record<RtColumn, string[]> {
  return {
    backlog: [],
    inProgress: [],
    done: [],
    released: [],
  };
}

function stageNote(column: RtColumn): string {
  if (column === "inProgress") return "Ready for analysis, implementation, or QA.";
  if (column === "backlog") return "Waiting in backlog.";
  if (column === "done") return "Queued for the daily release train.";
  return "Released to business.";
}

function stageEffect(column: RtColumn): string {
  if (column === "inProgress") return "task work";
  return "work";
}

function columnLabel(column: RtColumn): string {
  if (column === "inProgress") return "In Progress";
  return column[0].toUpperCase() + column.slice(1);
}

function releaseNote(score: number): string {
  if (score >= 80) return "Strong release. Customers got what they needed.";
  if (score >= 60) return "Acceptable release. Some rough edges remain.";
  if (score >= 40) return "Risky release. Support will feel this.";
  return "Bad release. Customers are frustrated.";
}

function releaseBudgetGain(valueGain: number, score: number): number {
  if (score < 55) return 0;
  return Math.max(0, Math.floor(valueGain / 15));
}

function kindValueMultiplier(kind: RtTaskKind): number {
  if (kind === "feature") return 1.25;
  if (kind === "incident") return 0.75;
  if (kind === "techDebt") return 0.9;
  if (kind === "compliance") return 1.1;
  return 1;
}

function removeTaskFromBoard(state: RtGameState, taskId: string): void {
  for (const column of RT_COLUMNS) {
    const index = state.board[column].indexOf(taskId);
    if (index >= 0) {
      state.board[column].splice(index, 1);
      return;
    }
  }
}

function pushEvent(state: RtGameState, event: Omit<RtEvent, "at">): void {
  state.log.unshift({ at: formatGameTime(state), ...event });
  if (state.log.length > 500) state.log.length = 500;
}

function normalizeRandomHost(host: { rngState: number }): { rngState: number } {
  host.rngState = host.rngState >>> 0 || 1;
  return host;
}

function nextRandom(host: { rngState: number }): number {
  normalizeRandomHost(host);
  let value = host.rngState >>> 0;
  value += 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  host.rngState = value >>> 0;
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function randomBetween(host: { rngState: number }, min: number, max: number): number {
  return min + nextRandom(host) * (max - min);
}

function randomInt(host: { rngState: number }, min: number, max: number): number {
  return Math.floor(randomBetween(host, min, max + 1));
}

function chance(host: { rngState: number }, probability: number): boolean {
  return nextRandom(host) < probability;
}

function pickOne<T>(host: { rngState: number }, items: readonly T[]): T {
  return items[randomInt(host, 0, items.length - 1)];
}

function shuffle<T>(host: { rngState: number }, items: readonly T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(host, 0, index);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function weightedPick<T>(
  host: { rngState: number },
  entries: Array<{ item: T; weight: number }>,
): T {
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  let cursor = nextRandom(host) * total;
  for (const entry of entries) {
    cursor -= Math.max(0, entry.weight);
    if (cursor <= 0) return entry.item;
  }
  return entries[entries.length - 1].item;
}

function formatDelta(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
