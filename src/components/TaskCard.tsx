import { forwardRef, type CSSProperties, type HTMLAttributes } from "react";
import {
  backlogValueRatio,
  isUntouchedBacklogTask,
  lateReleaseReport,
  releaseReadiness,
  renderTaskNarrative,
  taskDeadlineRatio,
  type RtGameState,
  type RtReadinessReport,
  type RtSubtask,
  type RtTask,
} from "../realtime/simulation";
import {
  labelBlastRadius,
  labelRole,
  labelTaskKind,
  t,
  type Locale,
} from "../i18n";
import { ReadinessBadge } from "./ReadinessBadge";
import { TinyBar } from "./TinyBar";
import { WorkProgressCircle } from "./WorkProgressCircle";

interface TaskCardProps {
  attention: boolean;
  dragHandleProps?: HTMLAttributes<HTMLElement>;
  dragging?: boolean;
  dropTargetActive?: boolean;
  entering?: boolean;
  exiting?: boolean;
  flash: boolean;
  game: RtGameState;
  locale: Locale;
  onClick: () => void;
  reject: boolean;
  selected: boolean;
  style?: CSSProperties;
  task: RtTask;
  tutorialFocus?: boolean;
}

export const TaskCard = forwardRef<HTMLElement, TaskCardProps>(function TaskCard({
  attention,
  dragHandleProps,
  dragging = false,
  dropTargetActive = false,
  entering = false,
  exiting = false,
  flash,
  game,
  locale,
  onClick,
  reject,
  selected,
  style,
  task,
  tutorialFocus = false,
}: TaskCardProps, ref) {
  const deadlineRatio = taskDeadlineRatio(task);
  const untouchedBacklog = isUntouchedBacklogTask(task);
  const readiness = releaseReadiness(task);
  const urgent =
    !untouchedBacklog && !task.resolved && !task.released && task.column !== "done" && deadlineRatio <= 0.18;
  const locked =
    Boolean(task.assignedCharacterId) ||
    Boolean(task.outsourcing) ||
    game.paused ||
    game.status !== "running" ||
    task.resolved ||
    task.released;
  const needsAttention =
    task.stageComplete && task.column === "inProgress" && !task.assignedCharacterId && !task.released;
  const readyForDone = needsAttention && taskReadyForDone(task);
  const readinessClass = taskCardReadinessClass(task, readiness, readyForDone);

  return (
    <article
      className={[
        "task-card",
        selected ? "selected" : "",
        selected && task.column === "inProgress" ? "selected-work" : "",
        task.assignedCharacterId || task.outsourcing ? "task-active-work" : "",
        urgent ? "urgent" : "",
        locked ? "locked" : "",
        readinessClass,
        dragging ? "drag-placeholder" : "",
        entering ? "backlog-enter" : "",
        exiting ? "backlog-exit" : "",
        attention ? "work-pass-bounce" : "",
        tutorialFocus && !dragging ? "tutorial-focus" : "",
        flash ? "drop-flash" : "",
        reject ? "reject-shake" : "",
        dropTargetActive ? "dnd-task-target" : "",
      ].join(" ")}
      data-task-card-id={task.id}
      draggable={false}
      onClick={dragging ? undefined : onClick}
      ref={ref}
      style={style}
      {...dragHandleProps}
    >
      <TaskCardFace game={game} locale={locale} task={task} />
    </article>
  );
});

export function TaskCardFace({
  game,
  locale,
  task,
}: {
  game: RtGameState;
  locale: Locale;
  task: RtTask;
}) {
  const assigned = task.assignedCharacterId
    ? game.characters[task.assignedCharacterId]
    : null;
  const outsourcingSubtask = task.outsourcing
    ? task.subtasks.find((subtask) => subtask.id === task.outsourcing?.subtaskId)
    : null;
  const deadlineRatio = taskDeadlineRatio(task);
  const untouchedBacklog = isUntouchedBacklogTask(task);
  const readiness = releaseReadiness(task);
  const late = lateReleaseReport(task);
  const neededRoles = taskNeededRoleChips(task, locale);
  const showImpactDot = shouldShowImpactDot(task, readiness);
  const showCompactReadiness = readiness.readiness !== "clean";
  const narrative = renderTaskNarrative(task, locale);

  return (
    <div className="task-card-face">
      <header className="task-card-top">
        <div>
          <span>{task.id}</span>
          <b>{labelTaskKind(locale, task.kind)}</b>
        </div>
        {showImpactDot ? (
          <i
            aria-label={t(locale, "task.impact", { value: blastRadiusLabel(task.blastRadius, locale) })}
            className={`impact-dot ${task.blastRadius}`}
            title={t(locale, "task.impact", { value: blastRadiusLabel(task.blastRadius, locale) })}
          />
        ) : null}
      </header>
      <strong className="task-title">{narrative.headline}</strong>
      <p className="task-problem">{narrative.core.problem}</p>
      {showCompactReadiness || late.valuePenaltyPercent > 0 ? (
        <div className="task-scan-row">
          {showCompactReadiness ? <ReadinessBadge locale={locale} report={readiness} compact /> : null}
          {late.valuePenaltyPercent > 0 ? (
            <span className="late-chip">{t(locale, "task.lateChip", { value: late.valuePenaltyPercent })}</span>
          ) : null}
        </div>
      ) : null}
      {neededRoles.length > 0 ? (
        <div className="role-chip-row" aria-label={t(locale, "task.neededRoles")}>
          {neededRoles.map((role) => (
            <span className={`role-chip ${role.kind}`} key={role.key}>
              {role.label}
            </span>
          ))}
        </div>
      ) : null}
      {untouchedBacklog ? (
        <TinyBar
          label={t(locale, "task.opportunity")}
          ratio={backlogValueRatio(task)}
          tone={opportunityTone(backlogValueRatio(task))}
        />
      ) : !task.released && task.column !== "done" ? (
        <TinyBar label={t(locale, "task.deadline")} ratio={deadlineRatio} tone={deadlineTone(deadlineRatio)} />
      ) : null}
      {assigned ? (
        <div className="work-chip">
          <div className="work-chip-main">
            <span>{assigned.name}</span>
            <span className="work-role-label">{currentWorkLabel(task, locale)}</span>
            <WorkProgressCircle label={t(locale, "work.progress")} value={task.stageProgress} />
          </div>
        </div>
      ) : null}
      {task.outsourcing ? (
        <div className="work-chip outsourcing-work">
          <div className="work-chip-main">
            <span>{t(locale, "task.outsource")}</span>
            <span className="work-role-label">
              {outsourcingSubtask ? subtaskRoleLabel(outsourcingSubtask.role, locale) : ""}
            </span>
            <WorkProgressCircle label={t(locale, "work.progress")} value={task.outsourcing.progress} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function taskReadyForDone(task: RtTask): boolean {
  return (
    task.workDone &&
    task.subtasks.filter((subtask) => subtask.revealed && !subtask.done).length === 0 &&
    task.bugs === 0
  );
}

function taskCardReadinessClass(
  task: RtTask,
  readiness: RtReadinessReport,
  readyForDone: boolean,
): "ready-clean" | "ready-risky" | "needs-work" {
  const queuedOrReleased = task.column === "done" || task.released;
  const canResolveNow = readyForDone || queuedOrReleased;
  if (!canResolveNow) return "needs-work";
  if (readiness.readiness === "clean") return "ready-clean";
  if (readiness.readiness === "risky") return "ready-risky";
  return "needs-work";
}

function shouldShowImpactDot(task: RtTask, readiness: RtReadinessReport): boolean {
  const committedColumn = task.column === "done" || task.released;
  if (!committedColumn) return true;
  if (readiness.readiness !== "clean") return true;
  return task.blastRadius === "high";
}

function taskNeededRoleChips(task: RtTask, locale: Locale): Array<{
  key: string;
  kind: "known" | "unknown";
  label: string;
}> {
  if (task.released) return [];
  const roles = new Set<RtSubtask["role"]>();
  for (const subtask of task.subtasks) {
    if (!subtask.revealed || subtask.done) continue;
    roles.add(subtask.role);
  }
  const chips: Array<{
    key: string;
    kind: "known" | "unknown";
    label: string;
  }> = Array.from(roles).map((role) => ({
    key: role,
    kind: "known",
    label: subtaskRoleLabel(role, locale),
  }));
  const hasHiddenOpenWork = task.subtasks.some((subtask) => !subtask.revealed && !subtask.done);
  if (hasHiddenOpenWork) {
    chips.push({
      key: "unknown",
      kind: "unknown",
      label: t(locale, "subtasks.unknownImportance"),
    });
  }
  return chips;
}

function currentWorkLabel(task: RtTask, locale: Locale): string {
  const subtask = task.currentSubtaskId
    ? task.subtasks.find((candidate) => candidate.id === task.currentSubtaskId)
    : null;
  if (subtask) return subtaskRoleLabel(subtask.role, locale);
  return task.assignedCharacterId ? (locale === "ru" ? "анализ" : "analysis") : "";
}

function subtaskRoleLabel(role: RtSubtask["role"], locale: Locale): string {
  return labelRole(locale, role);
}

function blastRadiusLabel(blastRadius: RtTask["blastRadius"], locale: Locale): string {
  return labelBlastRadius(locale, blastRadius);
}

function deadlineTone(ratio: number): "deadline-safe" | "deadline-warning" | "deadline-urgent" {
  if (ratio <= 0.18) return "deadline-urgent";
  if (ratio <= 0.42) return "deadline-warning";
  return "deadline-safe";
}

function opportunityTone(ratio: number): "deadline-safe" | "deadline-warning" | "deadline-urgent" {
  if (ratio <= 0.42) return "deadline-warning";
  return "deadline-safe";
}
