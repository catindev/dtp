import {
  normalizeRealtimeState,
  type RtGameState,
} from "./realtime/simulation";

export const SAVE_SCHEMA_VERSION = "rt-board-v2";
export const AUTOSAVE_KEY = "dtp.autosave.rt-board";
export const APP_COMMIT = __DTP_COMMIT__;

interface AutosaveEnvelope {
  version: 1;
  schemaVersion: string;
  appCommit: string;
  savedAt: string;
  sessionId: string;
  game: RtGameState;
}

export interface LoadedAutosave {
  game: RtGameState;
  sessionId: string;
  savedAt: string;
  appCommit: string;
}

export type AutosaveLoadResult =
  | { status: "loaded"; save: LoadedAutosave; normalized: boolean }
  | { status: "empty"; reason: "missing" | "storage_unavailable" }
  | {
      status: "reset";
      reason: "schema_mismatch" | "invalid_json" | "invalid_shape" | "storage_error";
      previousSchemaVersion?: string;
      previousCommit?: string;
    };

export function saveRun(game: RtGameState, sessionId: string): void {
  const storage = getStorage();
  if (!storage) return;

  const envelope: AutosaveEnvelope = {
    version: 1,
    schemaVersion: SAVE_SCHEMA_VERSION,
    appCommit: APP_COMMIT,
    savedAt: new Date().toISOString(),
    sessionId,
    game,
  };

  try {
    storage.setItem(AUTOSAVE_KEY, JSON.stringify(envelope));
  } catch {
    // Browsers can reject localStorage writes in private mode or when quota is full.
  }
}

export function loadSavedRun(): AutosaveLoadResult {
  const storage = getStorage();
  if (!storage) return { status: "empty", reason: "storage_unavailable" };

  const raw = storage.getItem(AUTOSAVE_KEY);
  if (!raw) return { status: "empty", reason: "missing" };

  let envelope: Partial<AutosaveEnvelope>;
  try {
    envelope = JSON.parse(raw) as Partial<AutosaveEnvelope>;
  } catch {
    clearSavedRun();
    return { status: "reset", reason: "invalid_json" };
  }

  if (envelope.schemaVersion !== SAVE_SCHEMA_VERSION) {
    clearSavedRun();
    return {
      status: "reset",
      reason: "schema_mismatch",
      previousSchemaVersion: envelope.schemaVersion,
      previousCommit: envelope.appCommit,
    };
  }

  if (
    envelope.version !== 1 ||
    typeof envelope.sessionId !== "string" ||
    typeof envelope.savedAt !== "string" ||
    !isProbablyGameState(envelope.game)
  ) {
    clearSavedRun();
    return {
      status: "reset",
      reason: "invalid_shape",
      previousCommit: envelope.appCommit,
    };
  }

  try {
    const normalized = normalizeRealtimeState(envelope.game);
    if (normalized) {
      saveRun(envelope.game, envelope.sessionId);
    }

    return {
      status: "loaded",
      normalized,
      save: {
        game: envelope.game,
        sessionId: envelope.sessionId,
        savedAt: envelope.savedAt,
        appCommit: envelope.appCommit ?? "unknown",
      },
    };
  } catch {
    clearSavedRun();
    return {
      status: "reset",
      reason: "storage_error",
      previousCommit: envelope.appCommit,
    };
  }
}

export function clearSavedRun(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(AUTOSAVE_KEY);
  } catch {
    // Ignore storage errors. The next save attempt can recover.
  }
}

function getStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isProbablyGameState(value: unknown): value is RtGameState {
  if (!isRecord(value)) return false;
  return (
    typeof value.seed === "number" &&
    isRecord(value.board) &&
    isRecord(value.tasks) &&
    isRecord(value.characters) &&
    isRecord(value.resources) &&
    Array.isArray(value.log)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
