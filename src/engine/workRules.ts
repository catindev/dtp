import {
  WORK_IMPORTANCE_WEIGHT_CRITICAL,
  WORK_IMPORTANCE_WEIGHT_IMPORTANT,
  WORK_IMPORTANCE_WEIGHT_OPTIONAL,
} from "./balance";
import type {
  RtSubtaskImportance,
  RtTask,
} from "./types";

export function importanceWeight(importance: RtSubtaskImportance): number {
  if (importance === "critical") return WORK_IMPORTANCE_WEIGHT_CRITICAL;
  if (importance === "important") return WORK_IMPORTANCE_WEIGHT_IMPORTANT;
  return WORK_IMPORTANCE_WEIGHT_OPTIONAL;
}

export function addPostmortemNote(task: RtTask, note: string): void {
  if (!task.postmortem.includes(note)) {
    task.postmortem.push(note);
  }
}
