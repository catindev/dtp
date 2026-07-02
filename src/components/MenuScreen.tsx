import { t, type Locale } from "../i18n";
import type { RtGameState } from "../realtime/simulation";
import { formatReleaseCountdown, formatSessionId } from "../formatting";
import { SAVE_SCHEMA_VERSION, type AutosaveLoadResult } from "../save";
import { LanguageSwitch } from "./LanguageSwitch";

export function MenuScreen({
  game,
  hasResumeCard,
  locale,
  musicEnabled,
  onContinueRun,
  onLocaleChange,
  onMusicEnabledChange,
  onOpenDocs,
  onStartRun,
  saveReset,
  sessionId,
}: {
  game: RtGameState;
  hasResumeCard: boolean;
  locale: Locale;
  musicEnabled: boolean;
  onContinueRun: () => void;
  onLocaleChange: (locale: Locale) => void;
  onMusicEnabledChange: (enabled: boolean) => void;
  onOpenDocs: () => void;
  onStartRun: (actionName?: string) => void;
  saveReset: Extract<AutosaveLoadResult, { status: "reset" }> | null;
  sessionId: string;
}) {
  return (
    <main className="shell menu-shell">
      <section className="main-menu">
        <div className="menu-title">
          <strong>Don&apos;t Touch Prod</strong>
          <span>{hasResumeCard ? t(locale, "menu.pauseSubtitle") : t(locale, "menu.subtitle")}</span>
        </div>
        <div className="menu-settings">
          <span>{t(locale, "menu.language")}</span>
          <LanguageSwitch locale={locale} onChange={onLocaleChange} />
        </div>
        <label className="menu-toggle">
          <span>{t(locale, "menu.music")}</span>
          <input
            checked={musicEnabled}
            onChange={(event) => onMusicEnabledChange(event.currentTarget.checked)}
            type="checkbox"
          />
        </label>
        <button className="rtfm-button" onClick={onOpenDocs} type="button">
          <strong>{t(locale, "menu.rtfm")}</strong>
          <span>{t(locale, "menu.rtfmDescription")}</span>
        </button>
        {hasResumeCard ? (
          <ResumeCard game={game} locale={locale} sessionId={sessionId} />
        ) : null}
        {!hasResumeCard && saveReset ? (
          <ResetSaveCard locale={locale} reset={saveReset} />
        ) : null}
        <div className="menu-actions">
          {hasResumeCard ? (
            <>
              <button className="start-button" onClick={onContinueRun} type="button">
                {t(locale, "menu.continue")}
              </button>
              <button className="ghost-button" onClick={() => onStartRun("menu_new_run_clicked")} type="button">
                {t(locale, "menu.newRun")}
              </button>
            </>
          ) : (
            <button className="start-button" onClick={() => onStartRun()} type="button">
              {t(locale, "menu.start")}
            </button>
          )}
        </div>
      </section>
    </main>
  );
}

function ResetSaveCard({
  locale,
  reset,
}: {
  locale: Locale;
  reset: Extract<AutosaveLoadResult, { status: "reset" }>;
}) {
  const previousSchema = reset.previousSchemaVersion ?? t(locale, "menu.saveSchemaUnknown");
  return (
    <section className="resume-card reset-save-card">
      <header>
        <span>{t(locale, "menu.saveUnavailable")}</span>
        <strong>{saveResetReasonLabel(locale, reset.reason)}</strong>
      </header>
      <p>
        {reset.reason === "schema_mismatch"
          ? t(locale, "menu.saveIncompatible")
          : t(locale, "menu.saveInvalid")}
      </p>
      <div className="resume-facts">
        <span>
          {t(locale, "menu.saveSchemaDebug", {
            previous: previousSchema,
            current: SAVE_SCHEMA_VERSION,
          })}
        </span>
        {reset.previousCommit ? (
          <span>{t(locale, "menu.saveCommitDebug", { value: reset.previousCommit })}</span>
        ) : null}
      </div>
    </section>
  );
}

function saveResetReasonLabel(
  locale: Locale,
  reason: Extract<AutosaveLoadResult, { status: "reset" }>["reason"],
): string {
  return t(locale, `menu.saveReset.${reason}`);
}

function ResumeCard({
  game,
  locale,
  sessionId,
}: {
  game: RtGameState;
  locale: Locale;
  sessionId: string;
}) {
  const report = game.morningReport;
  const quarter = report?.quarter ?? game.quarter;
  const day = report?.day ?? game.day;
  const releaseLine = report
    ? t(locale, "header.morningLine", { count: report.consequences.length })
    : t(locale, "header.releaseLine", {
      time: formatReleaseCountdown(game),
      done: game.board.done.length,
    });
  const statusLabel =
    game.status !== "running"
      ? t(locale, "header.stopped")
      : report
        ? t(locale, "status.morning")
        : game.paused
          ? t(locale, "status.paused")
          : t(locale, "status.running");

  return (
    <section className="resume-card">
      <header>
        <span>{t(locale, "menu.savedRun")}</span>
        <strong>{t(locale, "header.day", { quarter, day, daysPerQuarter: game.daysPerQuarter })}</strong>
      </header>
      <div className="resume-facts">
        <span>{statusLabel}</span>
        <span>{t(locale, "header.goal", {
          value: game.quarterValue,
          goal: game.quarterGoal.value,
          trust: game.resources.trust,
          trustGoal: game.quarterGoal.trust,
        })}</span>
        <span>{releaseLine}</span>
        <span>{t(locale, "header.clients", { value: game.resources.clients })}</span>
        <span>{t(locale, "header.debt", { value: game.resources.debt })}</span>
        <span>{t(locale, "header.budget", { value: game.resources.budget })}</span>
        <span title={sessionId}>{t(locale, "menu.session", { value: formatSessionId(sessionId) })}</span>
      </div>
    </section>
  );
}
