export const SOUND_CATALOG = {
  mainTheme: new URL("../../sounds/main-theme.mp3", import.meta.url).href,
  backlogEnd: [new URL("../../sounds/on-backlog-end.ogg", import.meta.url).href],
  buttonClick: [
    new URL("../../sounds/on-button-click-1.ogg", import.meta.url).href,
    new URL("../../sounds/on-button-click-2.ogg", import.meta.url).href,
    new URL("../../sounds/on-button-click-3.ogg", import.meta.url).href,
    new URL("../../sounds/on-button-click-4.ogg", import.meta.url).href,
    new URL("../../sounds/on-button-click-5.ogg", import.meta.url).href,
    new URL("../../sounds/on-button-click-6.ogg", import.meta.url).href,
  ],
  click: [
    new URL("../../sounds/on-click-1.ogg", import.meta.url).href,
    new URL("../../sounds/on-click-2.ogg", import.meta.url).href,
  ],
  dayEnd: [new URL("../../sounds/on-day-end.ogg", import.meta.url).href],
  drag: [
    new URL("../../sounds/on-drag-2.ogg", import.meta.url).href,
    new URL("../../sounds/on-drag-3.ogg", import.meta.url).href,
  ],
  drop: [new URL("../../sounds/on-drop-1.ogg", import.meta.url).href],
  error: [new URL("../../sounds/on-error.ogg", import.meta.url).href],
  newTask: [
    new URL("../../sounds/on-new-task-1.ogg", import.meta.url).href,
    new URL("../../sounds/on-new-task-2.ogg", import.meta.url).href,
    new URL("../../sounds/on-new-task-3.ogg", import.meta.url).href,
    new URL("../../sounds/on-new-task-4.ogg", import.meta.url).href,
  ],
  quarterEnd: [new URL("../../sounds/on-quarter-end.ogg", import.meta.url).href],
  subtaskCompleted: [new URL("../../sounds/on-subtask-completed.ogg", import.meta.url).href],
  taskCancel: [new URL("../../sounds/on-task-cancel.ogg", import.meta.url).href],
} as const;

export type SoundEffectName = Exclude<keyof typeof SOUND_CATALOG, "mainTheme">;

export const SOUND_EFFECT_NAMES: readonly SoundEffectName[] = [
  "buttonClick",
  "backlogEnd",
  "click",
  "dayEnd",
  "drag",
  "drop",
  "error",
  "newTask",
  "quarterEnd",
  "subtaskCompleted",
  "taskCancel",
];
