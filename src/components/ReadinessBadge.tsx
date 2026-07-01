import {
  labelReadiness,
  labelRiskReason,
  t,
  type Locale,
} from "../i18n";
import { type RtReadinessReport, type RtRiskReason } from "../realtime/simulation";

interface ReadinessBadgeProps {
  compact?: boolean;
  locale: Locale;
  report: RtReadinessReport;
}

export function ReadinessBadge({
  compact = false,
  locale,
  report,
}: ReadinessBadgeProps) {
  const reasons = compact ? report.reasons.slice(0, 2) : report.reasons;
  return (
    <div className={`readiness-box ${report.readiness} ${compact ? "compact" : ""}`}>
      <strong>{readinessLabel(report.readiness, locale)}</strong>
      {!compact && reasons.length > 0 ? (
        <div>
          {reasons.map((reason) => (
            <span key={reason}>{riskReasonLabel(reason, locale)}</span>
          ))}
        </div>
      ) : !compact ? (
        <div>
          <span>{t(locale, "readiness.noRisks")}</span>
        </div>
      ) : null}
    </div>
  );
}

function readinessLabel(readiness: RtReadinessReport["readiness"], locale: Locale): string {
  return labelReadiness(locale, readiness);
}

function riskReasonLabel(reason: RtRiskReason, locale: Locale): string {
  return labelRiskReason(locale, reason);
}
