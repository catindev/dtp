import {
  localizeText,
  t,
  type Locale,
} from "../i18n";
import type { RtVictoryReport } from "../realtime/simulation";

interface VictoryReportProps {
  locale: Locale;
  onNewRun: () => void;
  report: RtVictoryReport;
}

export function VictoryReport({ locale, onNewRun, report }: VictoryReportProps) {
  return (
    <section className="victory-report-page">
      <div className="victory-hero">
        <div>
          <span>{t(locale, "victory.kicker")}</span>
          <h1>{t(locale, "victory.title")}</h1>
          <p>{t(locale, "victory.summary", { grade: report.grade, score: report.score })}</p>
        </div>
        <button className="start-button" onClick={onNewRun} type="button">
          {t(locale, "victory.newRun")}
        </button>
      </div>

      <div className="victory-grade">
        <strong>{report.grade}</strong>
        <span>{t(locale, "victory.score", { score: report.score })}</span>
      </div>

      <div className="victory-grid">
        <span>{t(locale, "header.trust", { value: report.resourceSnapshot.trust })}</span>
        <span>{t(locale, "header.clients", { value: report.resourceSnapshot.clients })}</span>
        <span>{t(locale, "header.debt", { value: report.resourceSnapshot.debt })}</span>
        <span>{t(locale, "header.value", { value: report.resourceSnapshot.value })}</span>
        <span>{t(locale, "victory.peakDebt", { value: report.stats.peakDebt })}</span>
        <span>{t(locale, "victory.burnout", { value: report.stats.totalBurnout })}</span>
      </div>

      <div className="victory-columns">
        <section>
          <h2>{t(locale, "victory.releases")}</h2>
          <p>{t(locale, "victory.clean", { value: report.stats.releasedClean })}</p>
          <p>{t(locale, "victory.risky", { value: report.stats.releasedRisky })}</p>
          <p>{t(locale, "victory.dirty", { value: report.stats.releasedDirty })}</p>
        </section>
        <section>
          <h2>{t(locale, "victory.fallout")}</h2>
          <p>{t(locale, "victory.falloutCreated", { value: report.stats.falloutCreated })}</p>
          <p>{t(locale, "victory.falloutResolved", { value: report.stats.falloutResolved })}</p>
          <p>{t(locale, "victory.unresolved", { value: report.stats.unresolvedFallout })}</p>
        </section>
        <section>
          <h2>{t(locale, "victory.misses")}</h2>
          <p>{t(locale, "victory.missedTasks", { value: report.stats.missedTasks })}</p>
          <p>{t(locale, "victory.missedOpportunities", { value: report.stats.missedOpportunities })}</p>
        </section>
      </div>

      <section className="victory-notes">
        <h2>{t(locale, "victory.notes")}</h2>
        {report.notes.map((note) => (
          <p key={note}>{localizeText(note, locale)}</p>
        ))}
      </section>
    </section>
  );
}
