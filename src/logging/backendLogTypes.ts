export const LOG_SCHEMA_VERSION = "log-v1";

export type FrontendLogKind = "event" | "snapshot" | "summary" | "error";

export interface FrontendLogEntry {
  schema: typeof LOG_SCHEMA_VERSION;
  id: string;
  seq: number;
  clientCreatedAt: string;
  sessionId: string;
  source: "dtp2-frontend";
  kind: FrontendLogKind;
  type: string;
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
