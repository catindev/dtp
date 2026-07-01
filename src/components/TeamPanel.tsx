import { type DragEvent } from "react";
import {
  OUTSOURCE_COST_BY_IMPORTANCE,
  type RtCharacter,
  type RtGameState,
  type RtSubtask,
  type RtTask,
} from "../realtime/simulation";
import { labelRole, t, type Locale } from "../i18n";

interface TeamPanelProps {
  game: RtGameState;
  interactionBlocked: boolean;
  isGameScreen: boolean;
  locale: Locale;
  morningReportActive: boolean;
  onCharacterDragStart: (event: DragEvent<HTMLElement>, character: RtCharacter) => void;
  onDragEnd: () => void;
  onOutsourceDragStart: (event: DragEvent<HTMLElement>) => void;
}

export function TeamPanel({
  game,
  interactionBlocked,
  isGameScreen,
  locale,
  morningReportActive,
  onCharacterDragStart,
  onDragEnd,
  onOutsourceDragStart,
}: TeamPanelProps) {
  return (
    <aside className="team-panel panel">
      <h2>{t(locale, "team.title")}</h2>
      <div className="team-scroll">
        {Object.values(game.characters).map((character) => {
          const assignedTask = character.assignedTaskId
            ? game.tasks[character.assignedTaskId]
            : null;
          return (
            <article
              className={[
                "character",
                character.assignedTaskId ? "busy" : "",
                character.exhaustedToday ? "exhausted" : "",
              ].join(" ")}
              draggable={
                (game.paused || !interactionBlocked) &&
                isGameScreen &&
                game.status === "running" &&
                !morningReportActive &&
                !character.assignedTaskId &&
                !character.exhaustedToday
              }
              key={character.id}
              onDragEnd={onDragEnd}
              onDragStart={(event) => onCharacterDragStart(event, character)}
            >
              <div>
                <strong>{character.name}</strong>
                <span>{character.role}</span>
              </div>
              <div className="character-state">
                {character.exhaustedToday ? (
                  <span>{t(locale, "team.exhausted")}</span>
                ) : character.assignedTaskId ? (
                  <span>{t(locale, "team.onTask", { taskId: character.assignedTaskId })}</span>
                ) : (
                  <span>{t(locale, "team.available")}</span>
                )}
                {character.shockGameMinutes > 0 ? (
                  <span>{t(locale, "team.shock", { minutes: Math.ceil(character.shockGameMinutes) })}</span>
                ) : null}
              </div>
              {assignedTask ? (
                <div className="character-work">
                  <div>
                    <span>
                      {assignedTask.id} {currentWorkLabel(assignedTask, locale)}
                    </span>
                    <b>{Math.round(assignedTask.stageProgress)}%</b>
                  </div>
                  <div className="work-track">
                    <i style={{ width: `${assignedTask.stageProgress}%` }} />
                  </div>
                </div>
              ) : null}
              <MetricBar label={t(locale, "team.stamina")} tone="stamina" value={character.stamina} />
              {character.burnout > 0 ? (
                <span className="burnout-badge">
                  {t(locale, "team.burnout", { value: Math.round(character.burnout) })}
                </span>
              ) : null}
            </article>
          );
        })}
        <article
          className={[
            "outsourcing-card",
            interactionBlocked || game.resources.budget <= 0 ? "disabled" : "",
          ].join(" ")}
          draggable={
            (game.paused || !interactionBlocked) &&
            isGameScreen &&
            game.status === "running" &&
            !morningReportActive &&
            game.resources.budget > 0
          }
          onDragEnd={onDragEnd}
          onDragStart={onOutsourceDragStart}
        >
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
        </article>
      </div>
    </aside>
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
  if (subtask) return `-> ${subtaskRoleLabel(subtask.role, locale)}`;
  return task.assignedCharacterId ? (locale === "ru" ? "-> анализ" : "-> analysis") : "";
}

function subtaskRoleLabel(role: RtSubtask["role"], locale: Locale): string {
  return labelRole(locale, role);
}
