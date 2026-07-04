import type { RtHorizonReviewReport } from "../realtime/simulation";
import {
  localizeEffect,
  t,
  type Locale,
} from "../i18n";
import { effectTone } from "./MorningReportFormat";

export function HorizonReviewPanel({
  locale,
  review,
}: {
  locale: Locale;
  review: RtHorizonReviewReport;
}) {
  const horizon = t(locale, `horizon.${review.kind}`);

  return (
    <section className={`quarter-review-card ${review.hitGoal ? "met" : "missed"}`}>
      <header>
        <div>
          <span>{t(locale, "horizonReview.title", { horizon, id: review.id })}</span>
          <strong>
            {review.hitGoal
              ? t(locale, "horizonReview.met")
              : t(locale, "horizonReview.missed")}
          </strong>
        </div>
        <div className="quarter-review-goals">
          <span className={review.valueMet ? "met" : "missed"}>
            {t(locale, review.valueMet ? "horizonReview.valueMet" : "horizonReview.valueMissed", {
              actual: review.valueActual,
              target: review.valueTarget,
            })}
          </span>
          <span className={review.trustMet ? "met" : "missed"}>
            {t(locale, review.trustMet ? "horizonReview.trustMet" : "horizonReview.trustMissed", {
              actual: review.trustActual,
              target: review.trustTarget,
            })}
          </span>
          {!review.hitGoal && review.rawTrustDamage > review.cappedTrustDamage ? (
            <span className="met">
              {t(locale, "horizonReview.cap", {
                value: review.cappedTrustDamage,
                cap: review.dailyTrustDamageCap,
              })}
            </span>
          ) : null}
        </div>
      </header>
      <div className="release-effect-strip">
        <span className="release-effect neutral">{t(locale, "horizonReview.effect")}</span>
        {review.effects.map((effect) => (
          <span className={`release-effect ${effectTone(effect)}`} key={effect}>
            {localizeEffect(effect, locale)}
          </span>
        ))}
      </div>
    </section>
  );
}
