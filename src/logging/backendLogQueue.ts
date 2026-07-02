import {
  BACKEND_LOG_QUEUE_KEY,
  BACKEND_LOG_QUEUE_LIMIT,
} from "./backendLogConfig";
import type {
  BackendLogQueue,
  FrontendLogEntry,
} from "./backendLogTypes";

export function enqueueBackendLog(entries: FrontendLogEntry[]): void {
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

export function removeBackendLogEntries(sentIds: Set<string>): void {
  const queue = readBackendLogQueue();
  const entries = queue.entries.filter((entry) => !sentIds.has(entry.id));
  writeBackendLogQueue({
    ...queue,
    updatedAt: new Date().toISOString(),
    entries,
  });
}

export function readBackendLogQueue(): BackendLogQueue {
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
