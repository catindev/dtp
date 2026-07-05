import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type LogKind = "event" | "summary" | "error" | "snapshot";

interface LogEntry {
  seq?: number;
  receivedAt?: string;
  clientCreatedAt?: string;
  kind?: LogKind;
  type?: string;
  payload?: Record<string, unknown>;
}

interface SessionMeta {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  entries: number;
  lastSeq?: number;
  counts?: Record<string, number>;
  files?: Record<string, string>;
}

const command = process.argv[2] ?? "summary";
const sessionId = process.argv[3] ?? "";
const backendLogDir = process.env.DTP_BACKEND_LOG_DIR ?? "/Users/vladimirtitskiy/Dev/dtp-backend/logs";

if (!sessionId) {
  printUsage();
  process.exit(0);
}

const sessionDir = path.join(backendLogDir, "sessions", sessionId);
const meta = readJsonOrNull<SessionMeta>(path.join(sessionDir, "meta.json"));

if (!meta) {
  console.log(`Session not found: ${sessionId}`);
  console.log(`Checked: ${sessionDir}`);
  process.exit(0);
}

if (command === "session" || command === "summary") {
  printSessionSummary(meta);
} else if (command === "events") {
  printEvents(readAllEntries(), readTypeFilter());
} else if (command === "timeline") {
  printTimeline(readAllEntries());
} else {
  printUsage();
}

function printSessionSummary(currentMeta: SessionMeta): void {
  const entries = readAllEntries();
  const countsByType = countBy(entries, (entry) => entry.type ?? "unknown");
  const countsByKind = countBy(entries, (entry) => entry.kind ?? "unknown");
  const daySummaries = entries.filter((entry) => entry.kind === "summary" && entry.type === "day_summary");
  const runtimeErrors = entries.filter((entry) => entry.kind === "error");

  console.log(JSON.stringify({
    sessionId: currentMeta.sessionId,
    createdAt: currentMeta.createdAt,
    updatedAt: currentMeta.updatedAt,
    entries: currentMeta.entries,
    lastSeq: currentMeta.lastSeq ?? null,
    counts: currentMeta.counts ?? countsByKind,
    files: currentMeta.files,
    parsedEntries: entries.length,
    daySummaries: daySummaries.length,
    runtimeErrors: runtimeErrors.length,
    topTypes: topCounts(countsByType, 12),
  }, null, 2));
}

function printEvents(entries: LogEntry[], typeFilter: string | null): void {
  const filtered = typeFilter ? entries.filter((entry) => entry.type === typeFilter) : entries;
  for (const entry of filtered) {
    console.log(JSON.stringify(entry));
  }
}

function printTimeline(entries: LogEntry[]): void {
  for (const entry of entries.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))) {
    const payload = entry.payload ?? {};
    const taskId = typeof payload.taskId === "string" ? payload.taskId : "";
    const characterId = typeof payload.characterId === "string" ? payload.characterId : "";
    console.log([
      String(entry.seq ?? "?").padStart(5, " "),
      entry.kind ?? "unknown",
      entry.type ?? "unknown",
      taskId,
      characterId,
    ].filter(Boolean).join(" "));
  }
}

function readAllEntries(): LogEntry[] {
  return [
    ...readJsonl(path.join(sessionDir, "events.jsonl")),
    ...readJsonl(path.join(sessionDir, "summaries.jsonl")),
    ...readJsonl(path.join(sessionDir, "errors.jsonl")),
    ...readLatestSnapshot(),
  ];
}

function readLatestSnapshot(): LogEntry[] {
  const snapshot = readJsonOrNull<LogEntry>(path.join(sessionDir, "snapshots", "latest.json"));
  return snapshot ? [snapshot] : [];
}

function readJsonl(filePath: string): LogEntry[] {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as LogEntry];
      } catch {
        return [];
      }
    });
}

function readJsonOrNull<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function readTypeFilter(): string | null {
  const index = process.argv.indexOf("--type");
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function countBy<T>(values: T[], key: (value: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const nextKey = key(value);
    counts[nextKey] = (counts[nextKey] ?? 0) + 1;
  }
  return counts;
}

function topCounts(counts: Record<string, number>, limit: number): Array<{ key: string; count: number }> {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function printUsage(): void {
  console.log("Usage:");
  console.log("  npm run logs:session -- <sessionId>");
  console.log("  npm run logs:summary -- <sessionId>");
  console.log("  npm run logs:events -- <sessionId> [--type task_spawned]");
  console.log("  npm run logs:timeline -- <sessionId>");
  console.log("");
  console.log(`Default log dir: ${backendLogDir}`);
}
