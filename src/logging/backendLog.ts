import {
  BACKEND_LOG_BATCH_SIZE,
  BACKEND_LOG_FLUSH_INTERVAL_MS,
  BACKEND_LOG_URL,
  BACKEND_RESET_URL,
} from "./backendLogConfig";
import {
  enqueueBackendLog,
  readBackendLogQueue,
  removeBackendLogEntries,
} from "./backendLogQueue";
import type {
  BackendLogStatus,
  FrontendLogEntry,
} from "./backendLogTypes";

export { BACKEND_LOG_FLUSH_INTERVAL_MS } from "./backendLogConfig";
export type {
  BackendLogStatus,
  FrontendLogEntry,
} from "./backendLogTypes";

let backendFlushInFlight = false;
let backendFlushAgain = false;

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
