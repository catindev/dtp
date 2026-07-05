import { normalizeEngineLocale, type EngineLocale } from "../locale";
import type {
  RtGameState,
  RtTask,
  RtTaskComment,
  RtTaskCommentClass,
} from "../types";

const MAX_TASK_COMMENTS = 8;

interface TaskCommentTemplate {
  class: RtTaskCommentClass;
  text: Record<EngineLocale, string>;
}

export const TASK_COMMENT_TEMPLATES: Record<string, TaskCommentTemplate> = {
  "signal.partial-qa-coverage": {
    class: "signal",
    text: {
      en: "QA coverage is partial ({actual}/{target}). Assign QA again to clear the release risk.",
      ru: "QA-покрытие частичное ({actual}/{target}). Назначь QA еще раз, чтобы убрать риск релиза.",
    },
  },
  "signal.bugs-to-rework": {
    class: "signal",
    text: {
      en: "QA turned reported bugs into rework: {count}.",
      ru: "QA превратил баги в доработки: {count}.",
    },
  },
  "signal.changed-after-qa": {
    class: "signal",
    text: {
      en: "Implementation changed after QA. Add another QA pass before release.",
      ru: "Реализация менялась после QA. Перед релизом нужен еще один QA-проход.",
    },
  },
};

export function addTaskComment(
  state: RtGameState,
  task: RtTask,
  commentClass: RtTaskCommentClass,
  narrativeId: string,
  variableValueIds: Record<string, string> = {},
): RtTaskComment {
  const previous = task.comments[0];
  if (
    previous?.narrativeId === narrativeId &&
    JSON.stringify(previous.variableValueIds) === JSON.stringify(variableValueIds)
  ) {
    return previous;
  }
  const comment: RtTaskComment = {
    id: `${task.id}-comment-${state.day}-${Math.round(state.gameMinuteOfDay)}-${task.comments.length + 1}`,
    class: commentClass,
    narrativeId,
    createdAtDay: state.day,
    createdAtMinute: Math.round(state.gameMinuteOfDay),
    variableValueIds,
  };
  task.comments.unshift(comment);
  if (task.comments.length > MAX_TASK_COMMENTS) task.comments.length = MAX_TASK_COMMENTS;
  task.lastCommentId = comment.id;
  return comment;
}

export function renderTaskComment(comment: RtTaskComment, locale: EngineLocale): string {
  const normalizedLocale = normalizeEngineLocale(locale);
  const template = TASK_COMMENT_TEMPLATES[comment.narrativeId];
  const text = template?.text[normalizedLocale] ?? template?.text.en ?? comment.narrativeId;
  return text.replace(/\{(?<key>[a-zA-Z0-9_]+)\}/g, (match, key: string) => {
    return comment.variableValueIds[key] ?? match;
  });
}
