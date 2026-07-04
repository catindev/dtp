import {
  type RtEvent,
  type RtGameState,
} from "./realtime/simulation";
import {
  createLogEntry,
  postBackendLog,
} from "./logging/backendLog";
import {
  buildBackendSnapshot,
  buildDebugSnapshot,
} from "./logging/debugSnapshot";

export {
  BACKEND_LOG_FLUSH_INTERVAL_MS,
  createLogEntry,
  createSessionId,
  flushBackendLogQueue,
  logAction,
  postBackendLog,
  resetBackendLog,
  type FrontendLogEntry,
} from "./logging/backendLog";
export { buildDebugSnapshot } from "./logging/debugSnapshot";

export const DEBUG_SNAPSHOT_INTERVAL_MS = 60_000;
export const DEBUG_SNAPSHOT_POSTER_ENABLED = import.meta.env?.VITE_DTP_DEBUG_SNAPSHOTS === "1";

export function gameEventKey(event: RtEvent): string {
  return `${event.at}|${event.type}|${event.title}|${event.body}|${event.effects.join(";")}`;
}

export function postDebugSnapshot(game: RtGameState, sessionId?: string, trigger = "manual"): void {
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
    postBackendLog([createLogEntry(sessionId, "snapshot", "debug_snapshot", {
      trigger,
      ...buildBackendSnapshot(snapshot),
    })]);
  }
}

export function copyDebugSnapshot(game: RtGameState): void {
  navigator.clipboard?.writeText(JSON.stringify(buildDebugSnapshot(game), null, 2));
}
