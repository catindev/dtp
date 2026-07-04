import type { RtColumn } from "../realtime/simulation";
import {
  CHARACTER_DND_TYPE,
  COLUMN_DND_TYPE,
  OUTSOURCE_DND_TYPE,
  TASK_DND_TYPE,
} from "./types";

export function taskDndId(taskId: string): string {
  return `${TASK_DND_TYPE}:${taskId}`;
}

export function columnDndId(column: RtColumn): string {
  return `${COLUMN_DND_TYPE}:${column}`;
}

export function characterDndId(characterId: string): string {
  return `${CHARACTER_DND_TYPE}:${characterId}`;
}

export function outsourceDndId(): string {
  return OUTSOURCE_DND_TYPE;
}
