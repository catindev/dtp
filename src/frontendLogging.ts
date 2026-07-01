import {
  RT_COLUMNS,
  formatGameTime,
  lateReleaseReport,
  releaseReadiness,
  type RtEvent,
  type RtGameState,
  type RtTask,
} from "./realtime/simulation";

const BACKEND_BASE_URL = import.meta.env.VITE_DTP_BACKEND_URL ?? "http://127.0.0.1:8787";
const BACKEND_LOG_URL = `${BACKEND_BASE_URL}/api/log`;
const BACKEND_RESET_URL = `${BACKEND_BASE_URL}/api/reset`;
const BACKEND_LOG_QUEUE_KEY = "dtp.backendLogQueue.v1";
const BACKEND_LOG_QUEUE_LIMIT = 1200;
const BACKEND_LOG_BATCH_SIZE = 80;
export const BACKEND_LOG_FLUSH_INTERVAL_MS = 2500;

let backendFlushInFlight = false;
let backendFlushAgain = false;

export interface FrontendLogEntry {
  id: string;
  clientCreatedAt: string;
  sessionId: string;
  source: "dtp2-frontend";
  kind: "action" | "game_event" | "snapshot";
  name: string;
  payload: unknown;
}

interface BackendLogQueue {
  version: 1;
  updatedAt: string;
  compactedEntries: number;
  droppedEntries: number;
  entries: FrontendLogEntry[];
}

export function createSessionId(): string {
  return `dtp-${Date.now()}-${crypto.randomUUID?.() ?? Math.random().toString(16).slice(2)}`;
}

export function createLogEntry(
  sessionId: string,
  kind: FrontendLogEntry["kind"],
  name: string,
  payload: unknown,
): FrontendLogEntry {
  return {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    clientCreatedAt: new Date().toISOString(),
    sessionId,
    source: "dtp2-frontend",
    kind,
    name,
    payload,
  };
}

export function logAction(sessionId: string, name: string, payload: unknown): void {
  postBackendLog([createLogEntry(sessionId, "action", name, payload)]);
}

export function gameEventKey(event: RtEvent): string {
  return `${event.at}|${event.type}|${event.title}|${event.body}|${event.effects.join(";")}`;
}

export function postBackendLog(entries: FrontendLogEntry[]): void {
  enqueueBackendLog(entries);
  flushBackendLogQueue();
}

export function flushBackendLogQueue(): void {
  if (backendFlushInFlight) {
    backendFlushAgain = true;
    return;
  }

  const queue = readBackendLogQueue();
  if (queue.entries.length === 0) return;

  const batch = queue.entries.slice(0, BACKEND_LOG_BATCH_SIZE);
  const sentIds = new Set(batch.map((entry) => entry.id));
  backendFlushInFlight = true;

  fetch(BACKEND_LOG_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entries: batch }),
  })
    .then((response) => {
      if (!response.ok) throw new Error(`backend log rejected: ${response.status}`);
      removeBackendLogEntries(sentIds);
    })
    .catch(() => {
      // Keep the local queue. The next interval or online event will retry.
    })
    .finally(() => {
      backendFlushInFlight = false;
      const hasMore = readBackendLogQueue().entries.length > 0;
      if (backendFlushAgain || hasMore) {
        backendFlushAgain = false;
        window.setTimeout(flushBackendLogQueue, hasMore ? 120 : BACKEND_LOG_FLUSH_INTERVAL_MS);
      }
    });
}

export function resetBackendLog(sessionId: string): void {
  fetch(BACKEND_RESET_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  }).catch(() => {
    // Backend is optional during UI-only work.
  });
}

export function postDebugSnapshot(game: RtGameState, sessionId?: string): void {
  const snapshot = buildDebugSnapshot(game, sessionId);
  const body = JSON.stringify(snapshot, null, 2);
  window.localStorage.setItem("dtp.latestRun", body);
  fetch("/__dtp-debug-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  }).catch(() => {
    // The endpoint exists only in the local Vite dev server.
  });
  if (sessionId) {
    postBackendLog([createLogEntry(sessionId, "snapshot", "debug_snapshot", buildBackendSnapshot(snapshot))]);
  }
}

export function copyDebugSnapshot(game: RtGameState): void {
  navigator.clipboard?.writeText(JSON.stringify(buildDebugSnapshot(game), null, 2));
}

export function buildDebugSnapshot(game: RtGameState, sessionId?: string) {
  const tasks = Object.values(game.tasks);
  const backendQueue = readBackendLogQueue();
  return {
    savedAt: new Date().toISOString(),
    sessionId: sessionId ?? null,
    seed: game.seed,
    locale: game.locale,
    status: game.paused && game.status === "running" ? "paused" : game.status,
    lossReason: game.lossReason,
    time: {
      clock: formatGameTime(game),
      elapsedRealMs: game.elapsedRealMs,
      elapsedGameMinutes: game.elapsedGameMinutes,
      day: game.day,
      quarter: game.quarter,
      dayInQuarter: game.dayInQuarter,
    },
    resources: game.resources,
    morningReport: game.morningReport,
    quarter: {
      value: game.quarterValue,
      goal: game.quarterGoal,
    },
    lossReport: game.lossReport,
    spawn: game.spawn,
    taskCount: tasks.length,
    board: Object.fromEntries(
      RT_COLUMNS.map((column) => [
        column,
        game.board[column].map((taskId) => summarizeTask(game.tasks[taskId])),
      ]),
    ),
    characters: Object.values(game.characters).map((character) => ({
      id: character.id,
      name: character.name,
      role: character.role,
      assignedTaskId: character.assignedTaskId,
      stamina: Math.round(character.stamina),
      burnout: Math.round(character.burnout),
      shockGameMinutes: Math.round(character.shockGameMinutes),
      exhaustedToday: character.exhaustedToday,
      specialty: character.specialty,
    })),
    activeAssignments: tasks
      .filter((task) => task.assignedCharacterId)
      .map((task) => ({
        taskId: task.id,
        taskTitle: task.title,
        column: task.column,
        characterId: task.assignedCharacterId,
        progress: Math.round(task.stageProgress),
      })),
    logger: {
      backendUrl: BACKEND_LOG_URL,
      queuedEntries: backendQueue.entries.length,
      compactedEntries: backendQueue.compactedEntries,
      droppedEntries: backendQueue.droppedEntries,
    },
    events: game.log,
  };
}

function summarizeTask(task: RtTask | undefined) {
  if (!task) return null;
  return {
    id: task.id,
    title: task.title,
    kind: task.kind,
    column: task.column,
    blastRadius: task.blastRadius,
    releaseReadiness: releaseReadiness(task),
    pressure: task.pressure,
    complexity: task.complexity,
    value: task.value,
    clarity: task.clarity,
    quality: task.quality,
    testCoverage: task.testCoverage,
    bugs: task.bugs,
    changedAfterQa: task.changedAfterQa,
    workDone: task.workDone,
    subtasks: task.subtasks,
    currentSubtaskId: task.currentSubtaskId,
    outsourcing: task.outsourcing,
    offRolePenalty: task.offRolePenalty,
    deadlineMs: Math.round(task.deadlineMs),
    overdueMs: Math.round(task.overdueMs),
    lateRelease: lateReleaseReport(task),
    stageProgress: Math.round(task.stageProgress),
    stageComplete: task.stageComplete,
    assignedCharacterId: task.assignedCharacterId,
    released: task.released,
    rootCauseTaskId: task.rootCauseTaskId,
    sourceTaskId: task.sourceTaskId,
    chainDepth: task.chainDepth,
    resolved: task.resolved,
    resolution: task.resolution,
    resolutionDay: task.resolutionDay,
    releaseScore: task.releaseScore,
    queuedDeadlineMs: task.queuedDeadlineMs,
    postmortem: task.postmortem,
    lastNote: task.lastNote,
  };
}

function buildBackendSnapshot(snapshot: ReturnType<typeof buildDebugSnapshot>) {
  return {
    savedAt: snapshot.savedAt,
    sessionId: snapshot.sessionId,
    seed: snapshot.seed,
    locale: snapshot.locale,
    status: snapshot.status,
    lossReason: snapshot.lossReason,
    time: snapshot.time,
    resources: snapshot.resources,
    morningReport: snapshot.morningReport,
    daySummary: snapshot.morningReport?.daySummary ?? null,
    quarter: snapshot.quarter,
    spawn: snapshot.spawn,
    taskCount: snapshot.taskCount,
    logger: snapshot.logger,
    boardCounts: Object.fromEntries(
      Object.entries(snapshot.board).map(([column, tasks]) => [
        column,
        tasks.filter(Boolean).length,
      ]),
    ),
    activeAssignments: snapshot.activeAssignments,
    characters: snapshot.characters.map((character) => ({
      id: character.id,
      name: character.name,
      role: character.role,
      assignedTaskId: character.assignedTaskId,
      stamina: character.stamina,
      burnout: character.burnout,
      exhaustedToday: character.exhaustedToday,
    })),
    visibleTasks: Object.fromEntries(
      Object.entries(snapshot.board).map(([column, tasks]) => [
        column,
        tasks.filter(Boolean).map((task) => ({
          id: task?.id,
          kind: task?.kind,
          blastRadius: task?.blastRadius,
          releaseReadiness: task?.releaseReadiness,
          rootCauseTaskId: task?.rootCauseTaskId,
          chainDepth: task?.chainDepth,
          resolved: task?.resolved,
          resolution: task?.resolution,
          deadlineMs: task?.deadlineMs,
          overdueMs: task?.overdueMs,
          stageProgress: task?.stageProgress,
          assignedCharacterId: task?.assignedCharacterId,
          outsourcing: task?.outsourcing,
        })),
      ]),
    ),
    recentEvents: snapshot.events.slice(0, 12),
  };
}

function enqueueBackendLog(entries: FrontendLogEntry[]): void {
  if (entries.length === 0) return;
  const queue = readBackendLogQueue();
  const compacted = compactBackendQueueEntries([...queue.entries, ...entries]);
  writeBackendLogQueue({
    version: 1,
    updatedAt: new Date().toISOString(),
    compactedEntries: queue.compactedEntries + compacted.compactedEntries,
    droppedEntries: queue.droppedEntries + compacted.droppedEntries,
    entries: compacted.entries,
  });
}

function removeBackendLogEntries(sentIds: Set<string>): void {
  const queue = readBackendLogQueue();
  const entries = queue.entries.filter((entry) => !sentIds.has(entry.id));
  writeBackendLogQueue({
    ...queue,
    updatedAt: new Date().toISOString(),
    entries,
  });
}

function compactBackendQueueEntries(entries: FrontendLogEntry[]): {
  entries: FrontendLogEntry[];
  compactedEntries: number;
  droppedEntries: number;
} {
  const nonSnapshots: FrontendLogEntry[] = [];
  const latestSnapshotBySession = new Map<string, FrontendLogEntry>();
  const seenIds = new Set<string>();
  let duplicateEntries = 0;
  let snapshotEntries = 0;

  for (const entry of entries) {
    if (seenIds.has(entry.id)) {
      duplicateEntries += 1;
      continue;
    }
    seenIds.add(entry.id);

    if (entry.kind === "snapshot") {
      snapshotEntries += 1;
      latestSnapshotBySession.set(entry.sessionId, entry);
    } else {
      nonSnapshots.push(entry);
    }
  }

  const snapshots = Array.from(latestSnapshotBySession.values());
  const maxNonSnapshots = Math.max(0, BACKEND_LOG_QUEUE_LIMIT - snapshots.length);
  const keptNonSnapshots = nonSnapshots.slice(-maxNonSnapshots);
  const droppedNonSnapshots = Math.max(0, nonSnapshots.length - keptNonSnapshots.length);
  const droppedSnapshots = Math.max(0, snapshotEntries - snapshots.length);

  return {
    entries: [...keptNonSnapshots, ...snapshots],
    compactedEntries: duplicateEntries + droppedSnapshots,
    droppedEntries: droppedNonSnapshots,
  };
}

function readBackendLogQueue(): BackendLogQueue {
  const storage = getBrowserStorage();
  if (!storage) return emptyBackendLogQueue();
  const raw = storage.getItem(BACKEND_LOG_QUEUE_KEY);
  if (!raw) return emptyBackendLogQueue();

  try {
    const parsed = JSON.parse(raw) as Partial<BackendLogQueue>;
    if (
      parsed.version !== 1 ||
      typeof parsed.updatedAt !== "string" ||
      typeof parsed.droppedEntries !== "number" ||
      !Array.isArray(parsed.entries)
    ) {
      storage.removeItem(BACKEND_LOG_QUEUE_KEY);
      return emptyBackendLogQueue();
    }

    return {
      version: 1,
      updatedAt: parsed.updatedAt,
      compactedEntries:
        typeof parsed.compactedEntries === "number" ? parsed.compactedEntries : 0,
      droppedEntries: parsed.droppedEntries,
      entries: parsed.entries.filter(isFrontendLogEntry),
    };
  } catch {
    storage.removeItem(BACKEND_LOG_QUEUE_KEY);
    return emptyBackendLogQueue();
  }
}

function writeBackendLogQueue(queue: BackendLogQueue): void {
  const storage = getBrowserStorage();
  if (!storage) return;

  try {
    storage.setItem(BACKEND_LOG_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    const compacted = compactBackendQueueEntries(queue.entries.slice(-Math.floor(BACKEND_LOG_QUEUE_LIMIT / 2)));
    const halfQueueDrop = Math.max(0, queue.entries.length - Math.floor(BACKEND_LOG_QUEUE_LIMIT / 2));
    try {
      storage.setItem(
        BACKEND_LOG_QUEUE_KEY,
        JSON.stringify({
          ...queue,
          updatedAt: new Date().toISOString(),
          compactedEntries: queue.compactedEntries + compacted.compactedEntries,
          droppedEntries: queue.droppedEntries + halfQueueDrop + compacted.droppedEntries,
          entries: compacted.entries,
        }),
      );
    } catch {
      // If localStorage is full or unavailable, diagnostics cannot be persisted.
    }
  }
}

function emptyBackendLogQueue(): BackendLogQueue {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    compactedEntries: 0,
    droppedEntries: 0,
    entries: [],
  };
}

function isFrontendLogEntry(value: unknown): value is FrontendLogEntry {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<FrontendLogEntry>;
  return (
    typeof record.id === "string" &&
    typeof record.clientCreatedAt === "string" &&
    typeof record.sessionId === "string" &&
    record.source === "dtp2-frontend" &&
    (record.kind === "action" || record.kind === "game_event" || record.kind === "snapshot") &&
    typeof record.name === "string"
  );
}

function getBrowserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
