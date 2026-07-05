import type { RtMorningReport } from "../realtime/simulation";
import {
  t,
  type Locale,
} from "../i18n";

export function MorningFlowStrip({
  locale,
  summary,
}: {
  locale: Locale;
  summary: RtMorningReport["daySummary"];
}) {
  return (
    <div className="morning-flow-strip">
      <span>{t(locale, "morning.clean", { value: summary.releasedClean })}</span>
      <span>{t(locale, "morning.risky", { value: summary.releasedRisky })}</span>
      <span>{t(locale, "morning.dirty", { value: summary.releasedDirty })}</span>
      <span>{t(locale, "morning.missed", { value: summary.missedBacklog + summary.missedInProgress })}</span>
      <span>
        {t(locale, "morning.opportunities", {
          debt: summary.backlogDebtAdded,
          value: summary.backlogValueLost,
        })}
      </span>
      <span>{t(locale, "morning.fallout", { value: summary.falloutCreated })}</span>
      <span>{t(locale, "morning.unresolved", { value: summary.unresolvedFallout })}</span>
    </div>
  );
}
