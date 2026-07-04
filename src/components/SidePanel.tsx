import { localizeTaskTitle, t, type Locale } from "../i18n";
import { type RtCharacter, type RtGameState, type RtTask } from "../realtime/simulation";
import { LossReport } from "./LossReport";
import { TaskInspector } from "./TaskInspector";
import { TinyBar } from "./TinyBar";

interface SidePanelProps {
  canCancelWork: boolean;
  cancelDisabled: boolean;
  game: RtGameState;
  hasContent: boolean;
  locale: Locale;
  onCancelWork: () => void;
  onClearSelection: () => void;
  onOpenLinkedTask: (taskId: string) => void;
  selectedCharacter: RtCharacter | null;
  selectedTask: RtTask | null;
}

export function SidePanel({
  canCancelWork,
  cancelDisabled,
  game,
  hasContent,
  locale,
  onCancelWork,
  onClearSelection,
  onOpenLinkedTask,
  selectedCharacter,
  selectedTask,
}: SidePanelProps) {
  const assigned = selectedTask?.assignedCharacterId
    ? game.characters[selectedTask.assignedCharacterId]
    : null;
  const showTutorialQuest = game.runMode === "tutorial" && game.tutorial;

  return (
    <aside className={["side-stack", hasContent || showTutorialQuest ? "" : "empty"].join(" ")}>
      {showTutorialQuest ? <TutorialQuest game={game} locale={locale} /> : null}

      {selectedTask || selectedCharacter ? (
        <section className="panel inspector side-panel-slide">
          <div className="inspector-panel-header">
            <h2>{selectedTask ? t(locale, "inspector.title") : t(locale, "characterInspector.title")}</h2>
            <button
              aria-label={t(locale, "inspector.close")}
              className="inspector-close-button"
              onClick={onClearSelection}
              type="button"
            >
              ×
            </button>
          </div>
          {selectedTask ? (
          <TaskInspector
            assigned={assigned}
            canCancelWork={canCancelWork}
            cancelDisabled={cancelDisabled}
            game={game}
            locale={locale}
            onCancelWork={onCancelWork}
            onOpenLinkedTask={onOpenLinkedTask}
            task={selectedTask}
          />
          ) : selectedCharacter ? (
            <CharacterInspector
              character={selectedCharacter}
              game={game}
              locale={locale}
              onOpenLinkedTask={onOpenLinkedTask}
            />
          ) : null}
        </section>
      ) : null}

      {game.lossReport ? <LossReport locale={locale} report={game.lossReport} /> : null}
    </aside>
  );
}

function TutorialQuest({
  game,
  locale,
}: {
  game: RtGameState;
  locale: Locale;
}) {
  const tutorial = game.tutorial;
  if (!tutorial) return null;
  const steps = tutorial.steps.length > 0
    ? tutorial.steps
    : [
        { id: "move-task-to-work", completed: tutorial.completedStepIds.includes("move-task-to-work") },
        { id: "assign-qa", completed: tutorial.completedStepIds.includes("assign-qa") },
        { id: "wait-task-complete", completed: tutorial.completedStepIds.includes("wait-task-complete") },
        { id: "move-task-to-done", completed: tutorial.completedStepIds.includes("move-task-to-done") },
      ];

  return (
    <section className="panel tutorial-quest-panel side-panel-slide">
      <span className="tutorial-quest-kicker">{t(locale, "tutorial.kicker")}</span>
      <h2>{t(locale, "tutorial.stage.teamBasics")}</h2>
      <ol className="tutorial-step-list">
        {steps.map((step) => (
          <li
            className={[
              step.completed ? "completed" : "",
              tutorial.stepId === step.id ? "current" : "",
            ].join(" ")}
            key={step.id}
          >
            <span>{step.completed ? "✓" : tutorial.stepId === step.id ? "→" : "·"}</span>
            <strong>{t(locale, `tutorial.step.${step.id}`)}</strong>
          </li>
        ))}
      </ol>
      {tutorial.stepId === "stage-1-complete" ? (
        <p>{t(locale, "tutorial.stageComplete")}</p>
      ) : (
        <p>{t(locale, "tutorial.currentHint")}</p>
      )}
    </section>
  );
}

function CharacterInspector({
  character,
  game,
  locale,
  onOpenLinkedTask,
}: {
  character: RtCharacter;
  game: RtGameState;
  locale: Locale;
  onOpenLinkedTask: (taskId: string) => void;
}) {
  const assignedTask = character.assignedTaskId ? game.tasks[character.assignedTaskId] : null;
  const status = character.exhaustedToday
    ? t(locale, "team.exhausted")
    : assignedTask
      ? t(locale, "team.onTask", { taskId: assignedTask.id })
      : t(locale, "team.available");

  return (
    <div className="character-inspector">
      <strong>{character.name}</strong>
      <div className="inspector-grid">
        <span>{t(locale, "characterInspector.role", { value: characterRoleLabel(character.role, locale) })}</span>
        <span>{t(locale, "characterInspector.status", { value: status })}</span>
        <span>{t(locale, "characterInspector.stamina", { value: Math.round(character.stamina) })}</span>
        <span>{t(locale, "characterInspector.burnout", { value: Math.round(character.burnout) })}</span>
        {character.shockGameMinutes > 0 ? (
          <span>{t(locale, "team.shock", { minutes: Math.ceil(character.shockGameMinutes) })}</span>
        ) : null}
      </div>
      <TinyBar label={t(locale, "team.stamina")} ratio={character.stamina / 100} tone="progress" />
      {assignedTask ? (
        <div className="current-work">
          <span>{t(locale, "characterInspector.currentTask")}</span>
          <button className="task-link-chip" onClick={() => onOpenLinkedTask(assignedTask.id)} type="button">
            {assignedTask.id}: {localizeTaskTitle(assignedTask.title, locale)}
          </button>
          <TinyBar label={t(locale, "work.progress")} ratio={assignedTask.stageProgress / 100} tone="progress" />
        </div>
      ) : (
        <p>{t(locale, "characterInspector.idle")}</p>
      )}
    </div>
  );
}

function characterRoleLabel(role: RtCharacter["role"], locale: Locale): string {
  return t(locale, `characterRoles.${role}`);
}
