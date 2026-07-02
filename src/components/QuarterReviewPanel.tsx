import type { RtQuarterReviewReport } from "../realtime/simulation";
import {
  localizeEffect,
  t,
  type Locale,
} from "../i18n";
import { effectTone } from "./MorningReportFormat";

export function QuarterReviewPanel({
  locale,
  review,
}: {
  locale: Locale;
  review: RtQuarterReviewReport;
}) {
  return (
    <section className={`quarter-review-card ${review.hitGoal ? "met" : "missed"}`}>
      <header>
        <div>
          <span>{t(locale, "quarterReview.title", { quarter: review.quarter })}</span>
          <strong>
            {review.hitGoal
              ? t(locale, "quarterReview.met")
              : t(locale, "quarterReview.missed")}
          </strong>
        </div>
        <div className="quarter-review-goals">
          <span className={review.valueMet ? "met" : "missed"}>
            {t(locale, review.valueMet ? "quarterReview.valueMet" : "quarterReview.valueMissed", {
              actual: review.valueActual,
              target: review.valueTarget,
            })}
          </span>
          <span className={review.trustMet ? "met" : "missed"}>
            {t(locale, review.trustMet ? "quarterReview.trustMet" : "quarterReview.trustMissed", {
              actual: review.trustActual,
              target: review.trustTarget,
            })}
          </span>
        </div>
      </header>
      <div className="release-effect-strip">
        <span className="release-effect neutral">{t(locale, "quarterReview.effect")}</span>
        {review.effects.map((effect) => (
          <span className={`release-effect ${effectTone(effect)}`} key={effect}>
            {localizeEffect(effect, locale)}
          </span>
        ))}
      </div>
    </section>
  );
}
