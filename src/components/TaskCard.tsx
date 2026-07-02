import { type DragEvent } from "react";
import {
  backlogValueRatio,
  DONE_REWORK_TRUST_COST,
  isUntouchedBacklogTask,
  lateReleaseReport,
  releaseReadiness,
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
  localizeTaskName,
  t,
  type Locale,
} from "../i18n";
import { ReadinessBadge } from "./ReadinessBadge";
import { TinyBar } from "./TinyBar";

interface TaskCardProps {
  attention: boolean;
  flash: boolean;
  game: RtGameState;
  locale: Locale;
  onClick: () => void;
  onDragEnd: () => void;
  onDragStart: (event: DragEvent<HTMLElement>, task: RtTask) => void;
  onDropCharacter: (event: DragEvent<HTMLElement>, task: RtTask) => void;
  reject: boolean;
  selected: boolean;
  task: RtTask;
}

export function TaskCard({
  attention,
  flash,
  game,
  locale,
  onClick,
  onDragEnd,
  onDragStart,
  onDropCharacter,
  reject,
  selected,
  task,
}: TaskCardProps) {
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
  const urgent =
    !untouchedBacklog && !task.resolved && !task.released && task.column !== "done" && deadlineRatio <= 0.18;
  const dragBlocked =
    Boolean(task.assignedCharacterId) ||
    Boolean(task.outsourcing) ||
    game.status !== "running" ||
    task.resolved ||
    task.released;
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
  const neededRoles = taskNeededRoleChips(task, locale);
  const readinessClass = taskCardReadinessClass(task, readiness, readyForDone);
  const title = localizeTaskName(task.title, locale);

  return (
    <article
      className={[
        "task-card",
        selected ? "selected" : "",
        selected && task.column === "inProgress" ? "selected-work" : "",
        urgent ? "urgent" : "",
        locked ? "locked" : "",
        readinessClass,
        attention ? "work-pass-bounce" : "",
        flash ? "drop-flash" : "",
        reject ? "reject-shake" : "",
      ].join(" ")}
      data-task-card-id={task.id}
      draggable={!dragBlocked}
      onClick={onClick}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        const hasDropPayload =
          event.dataTransfer.types.includes("application/dtp-task") ||
          event.dataTransfer.types.includes("application/dtp-character") ||
          event.dataTransfer.types.includes("application/dtp-outsourcing");
        if (!game.paused && game.status === "running" && hasDropPayload) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }
      }}
      onDragStart={(event) => onDragStart(event, task)}
      onDrop={(event) => onDropCharacter(event, task)}
    >
      <header className="task-card-top">
        <div>
          <span>{task.id}</span>
          <b>{labelTaskKind(locale, task.kind)}</b>
        </div>
        <i
          aria-label={t(locale, "task.impact", { value: blastRadiusLabel(task.blastRadius, locale) })}
          className={`impact-dot ${task.blastRadius}`}
          title={t(locale, "task.impact", { value: blastRadiusLabel(task.blastRadius, locale) })}
        />
      </header>
      <strong className="task-title">{title}</strong>
      <div className="task-scan-row">
        <ReadinessBadge locale={locale} report={readiness} compact />
        {late.valuePenaltyPercent > 0 ? (
          <span className="late-chip">{t(locale, "task.lateChip", { value: late.valuePenaltyPercent })}</span>
        ) : null}
      </div>
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
      {task.column === "done" && !task.released ? (
        <span className="queue-note">{t(locale, "task.reopenCost", { cost: DONE_REWORK_TRUST_COST })}</span>
      ) : null}
      {assigned ? (
        <div className="work-chip">
          <span>{assigned.name} {currentWorkLabel(task, locale)}</span>
          <div className="work-track">
            <i style={{ width: `${task.stageProgress}%` }} />
          </div>
        </div>
      ) : null}
      {task.outsourcing ? (
        <div className="work-chip outsourcing-work">
          <span>
            {t(locale, "task.outsource")}{" "}
            {outsourcingSubtask ? `-> ${subtaskRoleLabel(outsourcingSubtask.role, locale)}` : ""}
          </span>
          <div className="work-track">
            <i style={{ width: `${task.outsourcing.progress}%` }} />
          </div>
        </div>
      ) : null}
    </article>
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
  if (subtask) return `-> ${subtaskRoleLabel(subtask.role, locale)}`;
  return task.assignedCharacterId ? (locale === "ru" ? "-> анализ" : "-> analysis") : "";
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
