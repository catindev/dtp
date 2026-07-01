import {
  localizeEffect,
  localizeEventTitle,
  localizeLossExplanation,
  localizeLossHeadline,
  localizeLossSuggestion,
  t,
  type Locale,
} from "../i18n";
import { type RtGameState } from "../realtime/simulation";

interface LossReportProps {
  locale: Locale;
  report: NonNullable<RtGameState["lossReport"]>;
}

export function LossReport({ locale, report }: LossReportProps) {
  return (
    <section className="panel loss-report">
      <h2>{t(locale, "loss.title")}</h2>
      <strong>{localizeLossHeadline(report.headline, locale)}</strong>
      <p>{localizeLossExplanation(report.explanation, locale)}</p>
      <div className="loss-grid">
        <span>{t(locale, "header.trust", { value: report.resourceSnapshot.trust })}</span>
        <span>{t(locale, "header.clients", { value: report.resourceSnapshot.clients })}</span>
        <span>{t(locale, "header.debt", { value: report.resourceSnapshot.debt })}</span>
      </div>
      {report.lastMissedTasks.length > 0 ? (
        <>
          <h3>{t(locale, "loss.recentMisses")}</h3>
          {report.lastMissedTasks.slice(0, 4).map((event) => (
            <p key={`${event.at}-${event.title}`}>
              {event.at} {localizeEventTitle(event.title, locale)} (
              {event.effects.map((effect) => localizeEffect(effect, locale)).join(", ")})
            </p>
          ))}
        </>
      ) : null}
      {report.lastBadReleases.length > 0 ? (
        <>
          <h3>{t(locale, "loss.badReleases")}</h3>
          {report.lastBadReleases.slice(0, 3).map((event) => (
            <p key={`${event.at}-${event.title}`}>
              {event.at} {localizeEventTitle(event.title, locale)} (
              {event.effects.map((effect) => localizeEffect(effect, locale)).join(", ")})
            </p>
          ))}
        </>
      ) : null}
      <h3>{t(locale, "loss.read")}</h3>
      <p>{localizeLossSuggestion(report.suggestion, locale)}</p>
    </section>
  );
}
