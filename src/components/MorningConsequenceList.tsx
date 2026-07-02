import type { RtMorningReport } from "../realtime/simulation";
import {
  localizeEffect,
  localizeText,
  t,
  type Locale,
} from "../i18n";
import {
  consequenceFallbackLabel,
  consequenceText,
  effectTone,
} from "./MorningReportFormat";

export function MorningConsequenceList({
  locale,
  report,
}: {
  locale: Locale;
  report: RtMorningReport;
}) {
  return (
    <section className="morning-report-section">
      <h2>{t(locale, "morning.consequences")}</h2>
      {report.consequences.length === 0 ? (
        <p className="empty">{t(locale, "morning.noFallout")}</p>
      ) : (
        <div className="morning-consequence-list">
          {report.consequences.map((consequence) => (
            <article className="morning-consequence-row" key={consequence.id}>
              <header>
                <div>
                  <span>{consequence.sourceTaskId}</span>
                  <strong>{localizeText(consequence.symptom, locale)}</strong>
                </div>
                <b>
                  {consequence.terminal
                    ? localizeEffect("terminal", locale)
                    : consequence.generatedTaskId ?? consequenceFallbackLabel(consequence, locale)}
                </b>
              </header>
              <p>{consequenceText(consequence, locale)}</p>
              <div className="release-effect-strip">
                {consequence.effects.map((effect) => (
                  <span className={`release-effect ${effectTone(effect)}`} key={effect}>
                    {localizeEffect(effect, locale)}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
