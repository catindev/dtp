export type ActiveDrag =
  | { type: "task"; taskId: string }
  | { type: "character"; characterId: string }
  | { type: "outsourcing" }
  | null;

export const TASK_DND_TYPE = "task";
export const COLUMN_DND_TYPE = "column";
export const CHARACTER_DND_TYPE = "character";
export const OUTSOURCE_DND_TYPE = "outsourcing";
