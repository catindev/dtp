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
  return (
    <section className="run-banner">
      <strong>{game.lossReport ? localizeLossHeadline(game.lossReport.headline, locale) : t(locale, "run.stopped")}</strong>
      <span>
        {game.lossReport
          ? localizeLossExplanation(game.lossReport.explanation, locale)
          : localizeText(game.lossReason, locale)}
      </span>
    </section>
  );
}
