import {
  renderTaskNarrative,
  releaseReadiness,
  type RtGameState,
  type RtTask,
} from "../realtime/simulation";
import {
  labelTaskKind,
  localizeEffect,
  localizeText,
  t,
  type Locale,
} from "../i18n";
import { ReadinessBadge } from "./ReadinessBadge";
import {
  effectTone,
  releaseEffectsForTask,
} from "./MorningReportFormat";

export function MorningShipmentList({
  game,
  locale,
  shippedTasks,
}: {
  game: RtGameState;
  locale: Locale;
  shippedTasks: RtTask[];
}) {
  return (
    <section className="morning-report-section">
      <h2>{t(locale, "morning.shipments")}</h2>
      {shippedTasks.length === 0 ? (
        <p className="empty">{t(locale, "morning.noShipments")}</p>
      ) : (
        <div className="release-task-list">
          {shippedTasks.map((task) => {
            const releaseEvent = game.log.find(
              (event) => event.type === "release" && event.title === `${task.id} released`,
            );
            const readiness = releaseReadiness(task);
            const releaseEffects = releaseEffectsForTask(task, releaseEvent, readiness);
            const narrative = renderTaskNarrative(task, locale);
            return (
              <article className="release-task-row" key={task.id}>
                <header>
                  <div>
                    <span>{task.id}</span>
                    <strong>{narrative.headline}</strong>
                  </div>
                  <b>{labelTaskKind(locale, task.kind)}</b>
                </header>
                <ReadinessBadge locale={locale} report={readiness} />
                <div className="release-effect-strip">
                  {releaseEffects.map((effect) => (
                    <span className={`release-effect ${effectTone(effect)}`} key={effect}>
                      {localizeEffect(effect, locale)}
                    </span>
                  ))}
                </div>
                {task.postmortem.length > 0 ? (
                  <div className="release-postmortem">
                    {task.postmortem.slice(0, 4).map((note) => (
                      <p key={note}>{localizeText(note, locale)}</p>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
