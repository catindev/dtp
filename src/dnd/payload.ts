import type { RtColumn } from "../realtime/simulation";
import {
  CHARACTER_DND_TYPE,
  COLUMN_DND_TYPE,
  OUTSOURCE_DND_TYPE,
  TASK_DND_TYPE,
} from "./types";

interface TaskDndPayload {
  type?: string;
  taskId?: string;
}

interface CharacterDndPayload {
  type?: string;
  characterId?: string;
}

interface ColumnDndPayload {
  type?: string;
  column?: RtColumn;
}

export function readTaskDndId(data: Record<string, unknown> | undefined): string {
  const payload = data as TaskDndPayload | undefined;
  return payload?.type === TASK_DND_TYPE && payload.taskId ? payload.taskId : "";
}

export function readCharacterDndId(data: Record<string, unknown> | undefined): string {
  const payload = data as CharacterDndPayload | undefined;
  return payload?.type === CHARACTER_DND_TYPE && payload.characterId ? payload.characterId : "";
}

export function readOutsourceDnd(data: Record<string, unknown> | undefined): boolean {
  const payload = data as { type?: string } | undefined;
  return payload?.type === OUTSOURCE_DND_TYPE;
}

export function readColumnDndId(data: Record<string, unknown> | undefined): RtColumn | null {
  const payload = data as ColumnDndPayload | undefined;
  return payload?.type === COLUMN_DND_TYPE && payload.column ? payload.column : null;
}

export function readTaskDropTargetDndId(data: Record<string, unknown> | undefined): string {
  return readTaskDndId(data);
}
