export interface FrontendLogEntry {
  id: string;
  clientCreatedAt: string;
  sessionId: string;
  source: "dtp2-frontend";
  kind: "action" | "game_event" | "snapshot";
  name: string;
  payload: unknown;
}

export interface BackendLogQueue {
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
