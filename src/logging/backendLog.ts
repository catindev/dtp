const BACKEND_BASE_URL = import.meta.env?.VITE_DTP_BACKEND_URL ?? "http://127.0.0.1:8787";
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

export interface BackendLogStatus {
  backendUrl: string;
  queuedEntries: number;
  compactedEntries: number;
  droppedEntries: number;
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

export function getBackendLogStatus(): BackendLogStatus {
  const queue = readBackendLogQueue();
  return {
    backendUrl: BACKEND_LOG_URL,
    queuedEntries: queue.entries.length,
    compactedEntries: queue.compactedEntries,
    droppedEntries: queue.droppedEntries,
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
