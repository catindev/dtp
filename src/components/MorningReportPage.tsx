import {
  type RtGameState,
  type RtMorningReport,
  type RtTask,
} from "../realtime/simulation";
import {
  t,
  type Locale,
} from "../i18n";
import {
  MorningConsequenceList,
  MorningFlowStrip,
  MorningResourceGrid,
  MorningShipmentList,
  QuarterReviewPanel,
} from "./MorningReportSections";

interface MorningReportPageProps {
  game: RtGameState;
  locale: Locale;
  onContinue: () => void;
  report: RtMorningReport;
}

export function MorningReportPage({
  game,
  locale,
  onContinue,
  report,
}: MorningReportPageProps) {
  const shippedTasks = report.shippedTaskIds
    .map((taskId) => game.tasks[taskId])
    .filter((task): task is RtTask => Boolean(task));
  const canContinue = game.status === "running";
  const summary = report.daySummary;

  return (
    <section className="morning-report-page">
      <div className="morning-report-hero">
        <div>
          <span>
            {t(locale, "header.day", {
              quarter: report.quarter,
              day: report.day,
              daysPerQuarter: game.daysPerQuarter,
            })}{" "}
            / {report.at}
          </span>
          <h1>{t(locale, "morning.title")}</h1>
          <p>
            {report.empty
              ? t(locale, "morning.empty")
              : t(locale, "morning.summary", {
                  shipped: report.shippedTaskIds.length,
                  missed: report.missedTaskIds.length,
                  expired: summary.backlogExpiredCount,
                })}
          </p>
        </div>
        <button
          className="start-button"
          disabled={!canContinue}
          onClick={onContinue}
          type="button"
        >
          {t(locale, "morning.startDay")}
        </button>
      </div>

      <MorningResourceGrid locale={locale} report={report} />

      <MorningFlowStrip locale={locale} summary={summary} />

      {report.quarterReview ? (
        <QuarterReviewPanel locale={locale} review={report.quarterReview} />
      ) : null}

      <MorningConsequenceList locale={locale} report={report} />

      <MorningShipmentList game={game} locale={locale} shippedTasks={shippedTasks} />

      {!canContinue ? (
        <p className="release-stop-note">
          {t(locale, "morning.runStopped")}
        </p>
      ) : null}
    </section>
  );
}
