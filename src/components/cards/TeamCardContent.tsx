import {
  OUTSOURCE_COST_BY_IMPORTANCE,
  type RtCharacter,
  type RtGameState,
  type RtSubtask,
  type RtTask,
} from "../../realtime/simulation";
import { labelRole, t, type Locale } from "../../i18n";
import { WorkProgressCircle } from "../WorkProgressCircle";

export function CharacterCardContent({
  assignedTask,
  character,
  locale,
}: {
  assignedTask: RtTask | null;
  character: RtCharacter;
  locale: Locale;
}) {
  return (
    <>
      <div>
        <strong>{character.name}</strong>
        <span>{character.role}</span>
      </div>
      {character.exhaustedToday || character.shockGameMinutes > 0 ? (
        <div className="character-state">
          {character.exhaustedToday ? (
            <span>{t(locale, "team.exhausted")}</span>
          ) : null}
          {character.shockGameMinutes > 0 ? (
            <span>{t(locale, "team.shock", { minutes: Math.ceil(character.shockGameMinutes) })}</span>
          ) : null}
        </div>
      ) : null}
      {assignedTask ? (
        <div className="character-work">
          <div className="character-work-main">
            <span>{assignedTask.id}</span>
            <span>{currentWorkLabel(assignedTask, locale)}</span>
            <WorkProgressCircle label={t(locale, "work.progress")} value={assignedTask.stageProgress} />
          </div>
        </div>
      ) : null}
      <MetricBar label={t(locale, "team.stamina")} tone="stamina" value={character.stamina} />
      {character.burnout > 0 ? (
        <span className="burnout-badge">
          {t(locale, "team.burnout", { value: Math.round(character.burnout) })}
        </span>
      ) : null}
    </>
  );
}

export function OutsourceCardContent({
  game,
  locale,
}: {
  game: RtGameState;
  locale: Locale;
}) {
  return (
    <>
      <div>
        <strong>{t(locale, "outsourcing.title")}</strong>
        <span>{t(locale, "outsourcing.role")}</span>
      </div>
      <p>{t(locale, "outsourcing.description")}</p>
      <div className="outsourcing-costs">
        <span>{t(locale, "outsourcing.optional", { cost: OUTSOURCE_COST_BY_IMPORTANCE.optional })}</span>
        <span>{t(locale, "outsourcing.important", { cost: OUTSOURCE_COST_BY_IMPORTANCE.important })}</span>
        <span>{t(locale, "outsourcing.critical", { cost: OUTSOURCE_COST_BY_IMPORTANCE.critical })}</span>
      </div>
      <b>{t(locale, "outsourcing.budget", { budget: game.resources.budget })}</b>
    </>
  );
}

function MetricBar({
  label,
  tone = "default",
  value,
}: {
  label: string;
  tone?: "default" | "stamina";
  value: number;
}) {
  const safeValue = Math.max(0, Math.min(100, value));
  const staminaLevel =
    tone === "stamina" && safeValue <= 25
      ? "danger"
      : tone === "stamina" && safeValue <= 55
        ? "warning"
        : "";
  return (
    <div className={`metric ${tone} ${staminaLevel}`}>
      <span>{label}</span>
      <i style={{ width: `${safeValue}%` }} />
      <b>{Math.round(value)}</b>
    </div>
  );
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
