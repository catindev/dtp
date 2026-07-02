import {
  DONE_REWORK_TRUST_COST,
  formatOverdueGameTime,
  lateReleaseReport,
  releaseReadiness,
  taskDeadlineRatio,
  type RtCharacter,
  type RtColumn,
  type RtGameState,
  type RtSubtask,
  type RtTask,
} from "../realtime/simulation";
import {
  labelBlastRadius,
  labelImportance,
  labelRole,
  localizeSubtaskTitle,
  localizeTaskTitle,
  localizeText,
  t,
  type Locale,
} from "../i18n";
import { ReadinessBadge } from "./ReadinessBadge";
import { TinyBar } from "./TinyBar";

interface TaskInspectorProps {
  assigned: RtCharacter | null;
  canCancelWork: boolean;
  cancelDisabled: boolean;
  game: RtGameState;
  locale: Locale;
  onCancelWork: () => void;
  onOpenLinkedTask: (taskId: string) => void;
  task: RtTask;
}

export function TaskInspector({
  assigned,
  canCancelWork,
  cancelDisabled,
  game,
  locale,
  onCancelWork,
  onOpenLinkedTask,
  task,
}: TaskInspectorProps) {
  const readiness = releaseReadiness(task);
  const late = lateReleaseReport(task);
  const sourceTask = task.sourceTaskId ? game.tasks[task.sourceTaskId] : null;
  const consequenceTasks = Object.values(game.tasks)
    .filter((candidate) => candidate.sourceTaskId === task.id)
    .sort((left, right) => right.id.localeCompare(left.id));
  const visiblePostmortem = task.postmortem.filter(
    (note) => !/^Source task:/.test(note) && !/^Root cause:/.test(note),
  );
  return (
    <div className="task-inspector">
      <strong>{localizeTaskTitle(task.title, locale)}</strong>
      <div className="inspector-grid">
        <span>{t(locale, "inspector.column", { column: columnLabel(locale, task.column) })}</span>
        <span>{t(locale, "inspector.pressure", { value: task.pressure })}</span>
        <span>{t(locale, "inspector.complexity", { value: task.complexity })}</span>
        <span>{t(locale, "inspector.value", { value: task.value })}</span>
        <span>{t(locale, "inspector.clarity", { value: task.clarity })}</span>
        <span>{t(locale, "inspector.quality", { value: task.quality })}</span>
        <span>{t(locale, "inspector.qa", { value: task.testCoverage })}</span>
        <span>{t(locale, "inspector.bugs", { value: task.bugs })}</span>
        <span>{t(locale, "inspector.impact", { value: blastRadiusLabel(task.blastRadius, locale) })}</span>
        {late.valuePenaltyPercent > 0 ? (
          <span>
            {t(locale, "inspector.late", {
              time: formatOverdueGameTime(late.overdueMs),
              value: late.valuePenaltyPercent,
            })}
          </span>
        ) : null}
      </div>
      <ReadinessBadge locale={locale} report={readiness} />
      <SubtaskList locale={locale} task={task} />
      {task.column === "done" && !task.released ? (
        <p>{t(locale, "inspector.queued", { cost: DONE_REWORK_TRUST_COST })}</p>
      ) : (
        <TinyBar label={t(locale, "task.deadline")} ratio={taskDeadlineRatio(task)} tone="deadline" />
      )}
      {assigned ? (
        <div className="current-work">
          <span>{t(locale, "work.character", { name: assigned.name })}</span>
          <TinyBar label={t(locale, "work.progress")} ratio={task.stageProgress / 100} tone="progress" />
        </div>
      ) : null}
      {task.outsourcing ? (
        <div className="current-work">
          <span>{t(locale, "work.outsource")}</span>
          <TinyBar label={t(locale, "work.progress")} ratio={task.outsourcing.progress / 100} tone="progress" />
        </div>
      ) : null}
      {canCancelWork ? (
        <button
          className="cancel-button inspector-cancel-button"
          data-sound-effect="taskCancel"
          disabled={cancelDisabled}
          onClick={onCancelWork}
          type="button"
        >
          {t(locale, "inspector.cancel")}
        </button>
      ) : null}
      <p>{localizeText(task.lastNote, locale)}</p>
      {task.sourceTaskId ? (
        <div className="source-link-panel">
          <h3>{t(locale, "inspector.causedBy")}</h3>
          {sourceTask ? (
            <button
              className="task-link-chip"
              onClick={() => onOpenLinkedTask(sourceTask.id)}
              type="button"
            >
              {localizeTaskTitle(sourceTask.title, locale)}
            </button>
          ) : (
            <span className="task-link-chip disabled">
              {t(locale, "inspector.missingSource", { id: task.sourceTaskId })}
            </span>
          )}
        </div>
      ) : null}
      {consequenceTasks.length > 0 ? (
        <div className="source-link-panel">
          <h3>{t(locale, "inspector.consequences")}</h3>
          <div className="task-link-list">
            {consequenceTasks.map((consequenceTask) => (
              <button
                className="task-link-chip"
                key={consequenceTask.id}
                onClick={() => onOpenLinkedTask(consequenceTask.id)}
                type="button"
              >
                {localizeTaskTitle(consequenceTask.title, locale)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {visiblePostmortem.length > 0 ? (
        <div className="postmortem">
          <h3>{t(locale, "inspector.postmortem")}</h3>
          {visiblePostmortem.map((note) => (
            <p key={note}>{localizeText(note, locale)}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SubtaskList({ locale, task }: { locale: Locale; task: RtTask }) {
  const revealedSubtasks = task.subtasks.filter((subtask) => subtask.revealed);
  const hasHiddenWork = task.subtasks.some((subtask) => !subtask.revealed && !subtask.done);
  return (
    <div className="subtask-list">
      <h3>{t(locale, "subtasks.title")}</h3>
      {revealedSubtasks.map((subtask) => (
        <div
          className={[
            "subtask-row",
            subtask.done ? "done" : "",
            !subtask.revealed ? "hidden" : "",
          ].join(" ")}
          key={subtask.id}
        >
          <span>{subtask.done ? "✓" : subtask.revealed ? "□" : "?"}</span>
          <strong>{subtask.revealed ? localizeSubtaskTitle(subtask.title, locale) : t(locale, "subtasks.unknown")}</strong>
          <em>{subtaskRoleLabel(subtask.role, locale)}</em>
          <b>{labelImportance(locale, subtask.importance)}</b>
        </div>
      ))}
      {hasHiddenWork ? (
        <div className="subtask-row hidden">
          <span>?</span>
          <strong>{t(locale, "subtasks.unknown")}</strong>
          <em>{t(locale, "subtasks.analysisNeeded")}</em>
          <b>{t(locale, "subtasks.unknownImportance")}</b>
        </div>
      ) : null}
    </div>
  );
}

function columnLabel(locale: Locale, column: RtColumn): string {
  return t(locale, `columns.${column}`);
}

function blastRadiusLabel(blastRadius: RtTask["blastRadius"], locale: Locale): string {
  return labelBlastRadius(locale, blastRadius);
}

function subtaskRoleLabel(role: RtSubtask["role"], locale: Locale): string {
  return labelRole(locale, role);
}
