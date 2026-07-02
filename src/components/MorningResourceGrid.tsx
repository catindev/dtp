import type { RtMorningReport } from "../realtime/simulation";
import {
  t,
  type Locale,
} from "../i18n";
import { formatSignedNumber } from "./MorningReportFormat";

export function MorningResourceGrid({
  locale,
  report,
}: {
  locale: Locale;
  report: RtMorningReport;
}) {
  return (
    <div className="morning-summary-grid">
      <ReleaseMetric
        after={report.resourceAfter.value}
        before={report.resourceBefore.value}
        delta={report.resourceDelta.value}
        label={t(locale, "header.value", { value: "" }).trim()}
        locale={locale}
      />
      <ReleaseMetric
        after={report.resourceAfter.budget}
        before={report.resourceBefore.budget}
        delta={report.resourceDelta.budget}
        label={t(locale, "outsourcing.budget", { budget: "" }).trim()}
        locale={locale}
      />
      <ReleaseMetric
        after={report.resourceAfter.trust}
        before={report.resourceBefore.trust}
        delta={report.resourceDelta.trust}
        label={t(locale, "header.trust", { value: "" }).trim()}
        locale={locale}
      />
      <ReleaseMetric
        after={report.resourceAfter.clients}
        before={report.resourceBefore.clients}
        delta={report.resourceDelta.clients}
        label={t(locale, "header.clients", { value: "" }).trim()}
        locale={locale}
      />
      <ReleaseMetric
        after={report.resourceAfter.debt}
        before={report.resourceBefore.debt}
        delta={report.resourceDelta.debt}
        label={t(locale, "header.debt", { value: "" }).trim()}
        locale={locale}
        reverseTone
      />
    </div>
  );
}

function ReleaseMetric({
  after,
  before,
  delta,
  label,
  locale,
  reverseTone = false,
}: {
  after: number;
  before: number;
  delta: number;
  label: string;
  locale: Locale;
  reverseTone?: boolean;
}) {
  const tone =
    delta === 0
      ? "neutral"
      : reverseTone
        ? delta > 0
          ? "negative"
          : "positive"
        : delta > 0
          ? "positive"
          : "negative";

  return (
    <article className={`release-metric ${tone}`}>
      <span>{label}</span>
      <strong>{after}</strong>
      <em>
        {t(locale, "releaseMetric.from", { delta: formatSignedNumber(delta), before })}
      </em>
    </article>
  );
}
