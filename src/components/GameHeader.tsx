import { formatReleaseCountdown } from "../formatting";
import { t, type Locale } from "../i18n";
import {
  formatGameTime,
  type RtGameState,
  type RtHorizonGoal,
  type RtHorizonKind,
  type RtMorningReport,
} from "../realtime/simulation";

interface GameHeaderProps {
  game: RtGameState;
  locale: Locale;
  morningReport: RtMorningReport | null;
  onOpenMenu: () => void;
  onTogglePause: () => void;
  pauseShake: boolean;
}

export function GameHeader({
  game,
  locale,
  morningReport,
  onOpenMenu,
  onTogglePause,
  pauseShake,
}: GameHeaderProps) {
  const releaseCountdown = formatReleaseCountdown(game);
  const clockText = morningReport ? "08:00" : formatGameTime(game);
  const activeGoal = pickHeaderGoal(game);
  const horizonLabel = activeGoal ? t(locale, `horizon.${activeGoal.kind}`) : "";
  const reviewText = activeGoal ? horizonReviewLabel(locale, game, activeGoal) : "";

  return (
    <header className="game-header">
      <div className="brand-block">
        <strong>Don&apos;t Touch Prod</strong>
        <span>
          {t(locale, "header.calendar", {
            week: game.calendar.week,
            dayInWeek: game.calendar.dayInWeek,
            daysPerWeek: game.calendar.daysPerWeek,
            month: game.calendar.month,
            quarter: game.calendar.quarter,
          })}
        </span>
        <span>{t(locale, "header.campaignProgress", {
          day: game.calendar.campaignDay,
          daysPerYear: game.calendar.daysPerYear,
        })}</span>
      </div>
      <div className="clock-block">
        <span className="clock">{clockText}</span>
        <span>
          {activeGoal
            ? t(locale, "header.horizonGoal", {
                horizon: horizonLabel,
                id: activeGoal.id,
                value: activeGoal.currentValue,
                goal: activeGoal.expectedValue,
                trust: game.resources.trust,
                trustGoal: activeGoal.targetTrust,
              })
            : t(locale, "header.goal", {
                value: game.quarterValue,
                goal: game.quarterGoal.value,
                trust: game.resources.trust,
                trustGoal: game.quarterGoal.trust,
              })}
        </span>
        <span>{reviewText}</span>
        <span>
          {morningReport
            ? t(locale, "header.morningLine", { count: morningReport.consequences.length })
            : t(locale, "header.releaseLine", { time: releaseCountdown, done: game.board.done.length })}
        </span>
      </div>
      <div className="stat-strip">
        <span className={`status-pill ${morningReport ? "morning-report" : game.status}`}>
          {morningReport
            ? t(locale, "status.morning")
            : game.status === "running" && game.paused
              ? t(locale, "status.paused")
              : t(locale, `status.${game.status}`)}
        </span>
        <span className="stat-pill primary">{t(locale, "header.trust", { value: game.resources.trust })}</span>
        <span className="stat-pill primary">{t(locale, "header.clients", { value: game.resources.clients })}</span>
        <span className="stat-pill value">{t(locale, "header.value", { value: game.resources.value })}</span>
        <span className="stat-pill muted">{t(locale, "header.debt", { value: game.resources.debt })}</span>
        <span className="stat-pill muted">{t(locale, "header.budget", { value: game.resources.budget })}</span>
        <span className="stat-pill muted">{t(locale, "header.boost", { value: game.resources.processBoost })}</span>
      </div>
      <div className="header-actions">
        <button
          className={`pause-button ${pauseShake ? "reject-shake" : ""}`}
          disabled={game.status !== "running" || Boolean(morningReport)}
          onClick={onTogglePause}
          type="button"
        >
          {game.status !== "running"
            ? t(locale, "header.stopped")
            : morningReport
              ? t(locale, "header.paused")
              : game.paused
                ? t(locale, "header.resume")
                : t(locale, "header.pause")}
        </button>
        <button className="ghost-button" onClick={onOpenMenu} type="button">
          {t(locale, "header.menu")}
        </button>
      </div>
    </header>
  );
}

function pickHeaderGoal(game: RtGameState): RtHorizonGoal | null {
  const priority: RtHorizonKind[] = ["week", "month", "quarter", "year"];
  for (const kind of priority) {
    const goal = game.horizonGoals[kind];
    if (goal && game.day <= goal.endsOnDay) return goal;
  }
  return game.horizonGoals.year ?? game.horizonGoals.quarter ?? game.horizonGoals.month ?? game.horizonGoals.week;
}

function horizonReviewLabel(locale: Locale, game: RtGameState, goal: RtHorizonGoal): string {
  const horizon = t(locale, `horizon.${goal.kind}`);
  const daysLeft = Math.max(0, goal.endsOnDay - game.calendar.campaignDay);
  if (daysLeft === 0) return t(locale, "header.horizonReviewTomorrow", { horizon });
  return t(locale, "header.horizonReviewInDays", { horizon, days: daysLeft });
}
