import {
  localizeLossExplanation,
  localizeLossHeadline,
  localizeText,
  t,
  type Locale,
} from "../i18n";
import { type RtGameState } from "../realtime/simulation";

interface RunBannerProps {
  game: RtGameState;
  locale: Locale;
}

export function RunBanner({ game, locale }: RunBannerProps) {
  const isWon = game.status === "won" && game.victoryReport;
  return (
    <section className="run-banner">
      <strong>
        {game.lossReport
          ? localizeLossHeadline(game.lossReport.headline, locale)
          : isWon
            ? t(locale, "victory.bannerTitle")
            : t(locale, "run.stopped")}
      </strong>
      <span>
        {game.lossReport
          ? localizeLossExplanation(game.lossReport.explanation, locale)
          : isWon
            ? t(locale, "victory.bannerText", {
                grade: game.victoryReport?.grade ?? "D",
                score: game.victoryReport?.score ?? 0,
              })
          : localizeText(game.lossReason, locale)}
      </span>
    </section>
  );
}
