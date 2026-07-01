import { useEffect, useRef, useState } from "react";
import { BoardPanel } from "./components/BoardPanel";
import { DocsScreen } from "./components/DocsScreen";
import { GameHeader } from "./components/GameHeader";
import { MenuScreen } from "./components/MenuScreen";
import { ReadinessBadge } from "./components/ReadinessBadge";
import { TeamPanel } from "./components/TeamPanel";
import { TaskInspector } from "./components/TaskInspector";
import { TinyBar } from "./components/TinyBar";
import {
  createRealtimeState,
  formatGameTime,
  normalizeRealtimeState,
  releaseReadiness,
  type RtEvent,
  type RtGameState,
  type RtMorningReport,
  type RtQuarterReviewReport,
  type RtReadinessReport,
  type RtTask,
} from "./realtime/simulation";
import {
  LOCALE_STORAGE_KEY,
  labelConsequenceCause,
  labelTaskKind,
  localizeEffect,
  localizeEventTitle,
  localizeLossExplanation,
  localizeLossHeadline,
  localizeLossSuggestion,
  localizeTaskName,
  localizeText,
  normalizeLocale,
  t,
  type Locale,
} from "./i18n";
import {
  APP_COMMIT,
  AUTOSAVE_KEY,
  SAVE_SCHEMA_VERSION,
  loadSavedRun,
} from "./save";
import { formatSessionId } from "./formatting";
import {
  buildDebugSnapshot,
  copyDebugSnapshot,
  createSessionId,
  gameEventKey,
} from "./frontendLogging";
import { useTaskFeedback } from "./hooks/useTaskFeedback";
import { useGameDragAndDrop } from "./hooks/useGameDragAndDrop";
import { useGameEventEffects } from "./hooks/useGameEventEffects";
import { initialSelectedTaskId, useGameActions } from "./hooks/useGameActions";
import {
  useAutosaveRun,
  useBackendLogPump,
  useDebugSnapshotPoster,
  useRealtimeTicker,
  useStatusDebugSnapshot,
} from "./hooks/useRuntimeEffects";
import { USER_DOCS } from "./userdocs";
import "./styles.css";

type AppScreen = "menu" | "game" | "docs";

type ProdView = "released" | "unfinished";

export function App() {
  const initialLocaleRef = useRef<Locale | null>(null);
  if (!initialLocaleRef.current) {
    initialLocaleRef.current = loadLocale();
  }
  const initialAutosaveRef = useRef<ReturnType<typeof loadSavedRun> | null>(null);
  if (!initialAutosaveRef.current) {
    initialAutosaveRef.current = loadSavedRun();
  }
  const restoredSave =
    initialAutosaveRef.current.status === "loaded" ? initialAutosaveRef.current.save : null;
  const bootGameRef = useRef<RtGameState | null>(null);
  if (!bootGameRef.current) {
    const initialGame = restoredSave?.game ?? createRealtimeState(184, initialLocaleRef.current);
    initialGame.locale = normalizeLocale(initialGame.locale ?? initialLocaleRef.current);
    if (restoredSave && initialGame.status === "running" && !initialGame.morningReport) {
      initialGame.paused = true;
    }
    bootGameRef.current = initialGame;
  }
  const bootGame = bootGameRef.current;

  const [locale, setLocale] = useState<Locale>(() => initialLocaleRef.current ?? "en");
  const [game, setGame] = useState<RtGameState>(() => bootGame);
  const [screen, setScreen] = useState<AppScreen>("menu");
  const [hasResumeCard, setHasResumeCard] = useState(Boolean(restoredSave));
  const [prodView, setProdView] = useState<ProdView>("released");
  const [selectedDocId, setSelectedDocId] = useState(USER_DOCS[0].id);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(
    initialSelectedTaskId(bootGame),
  );
  const {
    flashTaskId,
    bounceTaskIds,
    shakeTaskIds,
    shakeColumnIds,
    pauseShake,
    flashTask,
    bounceTask,
    shakeTask,
    shakeColumn,
    shakePauseButton,
    resetFeedback,
  } = useTaskFeedback();
  const latestGameRef = useRef(game);
  const sessionIdRef = useRef(restoredSave?.sessionId ?? createSessionId());
  const loggedEventKeysRef = useRef(
    new Set<string>(restoredSave?.game.log.map(gameEventKey) ?? []),
  );
  const animatedWorkEventKeysRef = useRef(
    new Set<string>(restoredSave?.game.log.map(gameEventKey) ?? []),
  );
  const selectedTask = selectedTaskId ? game.tasks[selectedTaskId] : null;
  const morningReport = game.morningReport;
  const interactionBlocked =
    screen !== "game" || game.paused || game.status !== "running" || Boolean(morningReport);
  const {
    beginTaskDrag,
    beginCharacterDrag,
    beginOutsourceDrag,
    allowDrop,
    dropOnColumn,
    dropOnTask,
    finishDrag,
    resetDrag,
  } = useGameDragAndDrop({
    game,
    interactionBlocked,
    isGameScreen: screen === "game",
    locale,
    morningReportActive: Boolean(morningReport),
    sessionId: sessionIdRef.current,
    mutate,
    setSelectedTaskId,
    flashTask,
    shakeTask,
    shakeColumn,
    shakePauseButton,
  });
  const {
    cancelSelectedTask,
    continueRun,
    openDocs,
    openLinkedTask,
    openMenu,
    startBriefedDay,
    startRun,
    togglePause,
  } = useGameActions({
    game,
    screen,
    locale,
    selectedDocId,
    hasResumeCard,
    selectedTaskId,
    selectedTask,
    latestGameRef,
    sessionIdRef,
    loggedEventKeysRef,
    animatedWorkEventKeysRef,
    mutate,
    setGame,
    setScreen,
    setHasResumeCard,
    setSelectedTaskId,
    setProdView,
    resetDrag,
    resetFeedback,
    flashTask,
  });

  useBackendLogPump();
  useRealtimeTicker(screen, setGame);
  useDebugSnapshotPoster(screen, latestGameRef, sessionIdRef);
  useAutosaveRun(game, screen, latestGameRef, sessionIdRef);
  useStatusDebugSnapshot(game, screen, sessionIdRef);
  useGameEventEffects({
    game,
    screen,
    initialAutosaveRef,
    sessionIdRef,
    loggedEventKeysRef,
    animatedWorkEventKeysRef,
    bounceTask,
  });

  useEffect(() => {
    latestGameRef.current = game;
  }, [game]);

  useEffect(() => {
    saveLocale(locale);
    setGame((current) => {
      if (current.locale === locale) return current;
      const next = { ...current, locale };
      latestGameRef.current = next;
      return next;
    });
  }, [locale]);

  useEffect(() => {
    setGame((current) => {
      const draft = structuredClone(current) as RtGameState;
      return normalizeRealtimeState(draft) ? draft : current;
    });
  }, []);

  useEffect(() => {
    if (selectedTaskId && !game.tasks[selectedTaskId]) {
      setSelectedTaskId(initialSelectedTaskId(game));
    }
  }, [game, selectedTaskId]);

  function mutate(updater: (draft: RtGameState) => void) {
    setGame((current) => {
      if (
        screen !== "game" ||
        current.paused ||
        current.status !== "running" ||
        current.morningReport
      ) {
        return current;
      }
      const draft = structuredClone(current) as RtGameState;
      normalizeRealtimeState(draft);
      updater(draft);
      return draft;
    });
  }

  const selectedAssigned = selectedTask?.assignedCharacterId
    ? game.characters[selectedTask.assignedCharacterId]
    : null;
  const selectedDoc = USER_DOCS.find((doc) => doc.id === selectedDocId) ?? USER_DOCS[0];

  if (screen === "docs") {
    return (
      <DocsScreen
        docs={USER_DOCS}
        locale={locale}
        onBack={() => setScreen("menu")}
        onLocaleChange={setLocale}
        onSelectDoc={setSelectedDocId}
        selectedDoc={selectedDoc}
      />
    );
  }

  if (screen === "menu") {
    return (
      <MenuScreen
        game={game}
        hasResumeCard={hasResumeCard}
        locale={locale}
        onContinueRun={continueRun}
        onLocaleChange={setLocale}
        onOpenDocs={openDocs}
        onStartRun={startRun}
        sessionId={sessionIdRef.current}
      />
    );
  }

  return (
    <main
      className={[
        "shell",
        game.paused ? "paused" : "",
        game.status === "lost" ? "lost" : "",
        morningReport ? "morning-reporting" : "",
      ].join(" ")}
    >
      <GameHeader
        game={game}
        locale={locale}
        morningReport={morningReport}
        onOpenMenu={openMenu}
        onTogglePause={togglePause}
        pauseShake={pauseShake}
      />

      {game.status !== "running" ? (
        <section className="run-banner">
          <strong>{game.lossReport ? localizeLossHeadline(game.lossReport.headline, locale) : t(locale, "run.stopped")}</strong>
          <span>
            {game.lossReport
              ? localizeLossExplanation(game.lossReport.explanation, locale)
              : localizeText(game.lossReason, locale)}
          </span>
        </section>
      ) : null}

      {morningReport ? (
        <MorningReportPage
          game={game}
          locale={locale}
          onContinue={startBriefedDay}
          report={morningReport}
        />
      ) : (
        <section className="playfield">
          <TeamPanel
            game={game}
            interactionBlocked={interactionBlocked}
            isGameScreen={screen === "game"}
            locale={locale}
            morningReportActive={Boolean(morningReport)}
            onCharacterDragStart={beginCharacterDrag}
            onDragEnd={finishDrag}
            onOutsourceDragStart={beginOutsourceDrag}
          />

          <BoardPanel
            attentionTaskIds={bounceTaskIds}
            flashTaskId={flashTaskId}
            game={game}
            locale={locale}
            onAllowDrop={allowDrop}
            onColumnDrop={dropOnColumn}
            onProdViewChange={setProdView}
            onTaskClick={setSelectedTaskId}
            onTaskDragEnd={finishDrag}
            onTaskDragStart={beginTaskDrag}
            onTaskDrop={dropOnTask}
            prodView={prodView}
            rejectColumnIds={shakeColumnIds}
            rejectTaskIds={shakeTaskIds}
            selectedTaskId={selectedTaskId}
          />

          <aside className="side-stack">
            <section className="panel inspector">
              <h2>{t(locale, "inspector.title")}</h2>
              {selectedTask ? (
                <TaskInspector
                  assigned={selectedAssigned}
                  canCancelWork={Boolean(selectedAssigned && !morningReport)}
                  cancelDisabled={interactionBlocked}
                  game={game}
                  locale={locale}
                  onCancelWork={cancelSelectedTask}
                  onOpenLinkedTask={openLinkedTask}
                  task={selectedTask}
                />
              ) : (
                <p className="empty">{t(locale, "inspector.empty")}</p>
              )}
            </section>

            {game.lossReport ? <LossReport locale={locale} report={game.lossReport} /> : null}
          </aside>
        </section>
      )}
    </main>
  );
}

function MorningReportPage({
  game,
  locale,
  onContinue,
  report,
}: {
  game: RtGameState;
  locale: Locale;
  onContinue: () => void;
  report: RtMorningReport;
}) {
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

      <div className="morning-flow-strip">
        <span>{t(locale, "morning.clean", { value: summary.releasedClean })}</span>
        <span>{t(locale, "morning.risky", { value: summary.releasedRisky })}</span>
        <span>{t(locale, "morning.dirty", { value: summary.releasedDirty })}</span>
        <span>{t(locale, "morning.missed", { value: summary.missedBacklog + summary.missedInProgress })}</span>
        <span>{t(locale, "morning.fallout", { value: summary.falloutCreated })}</span>
        <span>{t(locale, "morning.unresolved", { value: summary.unresolvedFallout })}</span>
      </div>

      {report.quarterReview ? (
        <QuarterReviewPanel locale={locale} review={report.quarterReview} />
      ) : null}

      <section className="morning-report-section">
        <h2>{t(locale, "morning.consequences")}</h2>
        {report.consequences.length === 0 ? (
          <p className="empty">{t(locale, "morning.noFallout")}</p>
        ) : (
          <div className="morning-consequence-list">
            {report.consequences.map((consequence) => (
              <article className="morning-consequence-row" key={consequence.id}>
                <header>
                  <div>
                    <span>{consequence.sourceTaskId}</span>
                    <strong>{localizeText(consequence.symptom, locale)}</strong>
                  </div>
                  <b>
                    {consequence.terminal
                      ? localizeEffect("terminal", locale)
                      : consequence.generatedTaskId ?? consequenceFallbackLabel(consequence, locale)}
                  </b>
                </header>
                <p>{consequenceText(consequence, locale)}</p>
                <div className="release-effect-strip">
                  {consequence.effects.map((effect) => (
                    <span className={`release-effect ${effectTone(effect)}`} key={effect}>
                      {localizeEffect(effect, locale)}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="morning-report-section">
        <h2>{t(locale, "morning.shipments")}</h2>
        {shippedTasks.length === 0 ? (
          <p className="empty">{t(locale, "morning.noShipments")}</p>
        ) : (
          <div className="release-task-list">
            {shippedTasks.map((task) => {
              const releaseEvent = game.log.find(
                (event) => event.type === "release" && event.title === `${task.id} released`,
              );
              const readiness = releaseReadiness(task);
              const releaseEffects = releaseEffectsForTask(task, releaseEvent, readiness);
              return (
                <article className="release-task-row" key={task.id}>
                  <header>
                    <div>
                      <span>{task.id}</span>
                      <strong>{localizeTaskName(task.title, locale)}</strong>
                    </div>
                    <b>{labelTaskKind(locale, task.kind)}</b>
                  </header>
                  <ReadinessBadge locale={locale} report={readiness} />
                  <div className="release-effect-strip">
                    {releaseEffects.map((effect) => (
                      <span className={`release-effect ${effectTone(effect)}`} key={effect}>
                        {localizeEffect(effect, locale)}
                      </span>
                    ))}
                  </div>
                  {task.postmortem.length > 0 ? (
                    <div className="release-postmortem">
                      {task.postmortem.slice(0, 4).map((note) => (
                        <p key={note}>{localizeText(note, locale)}</p>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {!canContinue ? (
        <p className="release-stop-note">
          {t(locale, "morning.runStopped")}
        </p>
      ) : null}
    </section>
  );
}

function QuarterReviewPanel({
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

function effectTone(effect: string): "positive" | "negative" | "neutral" {
  if (effect.startsWith("debt +")) return "negative";
  if (effect.startsWith("debt -")) return "positive";
  if (effect.startsWith("dirty release")) return "negative";
  if (effect.startsWith("clean release")) return "positive";
  if (/\s-[0-9]/.test(effect) || effect.startsWith("no ")) return "negative";
  if (/\s\+[0-9]/.test(effect) || effect.includes("reduced")) return "positive";
  return "neutral";
}

function releaseEffectsForTask(
  task: RtTask,
  releaseEvent: RtEvent | undefined,
  readiness: RtReadinessReport,
): string[] {
  const eventEffects = releaseEvent?.effects ?? [task.lastNote];
  const effectsWithoutOutcome = eventEffects.filter((effect) => !isReleaseOutcomeEffect(effect));
  return [`${readiness.readiness} release`, ...effectsWithoutOutcome];
}

function isReleaseOutcomeEffect(effect: string): boolean {
  return /^(clean|risky|dirty) release$/.test(effect);
}

function formatSignedNumber(value: number): string {
  if (value > 0) return `+${value}`;
  return `${value}`;
}

function consequenceText(
  consequence: RtMorningReport["consequences"][number],
  locale: Locale,
): string {
  if (locale === "ru") {
    if (consequence.source === "release") {
      return `Потому что вчерашняя ${consequence.sourceTaskId} уехала с проблемой: ${consequenceCauseLabel(
        consequence.cause,
        locale,
      )}.`;
    }
    if (consequence.source === "missed_backlog") {
      return `Потому что ${consequence.sourceTaskId} осталась в бэклоге после дедлайна.`;
    }
    if (consequence.source === "missed_in_progress") {
      return `Потому что ${consequence.sourceTaskId} была в работе, когда день закончился.`;
    }
    return `Потому что цепочка последствий от ${consequence.rootCauseTaskId} дошла до лимита.`;
  }
  if (consequence.source === "release") {
    return `Because yesterday's ${consequence.sourceTaskId} shipped with ${consequenceCauseLabel(
      consequence.cause,
      locale,
    )}.`;
  }
  if (consequence.source === "missed_backlog") {
    return `Because ${consequence.sourceTaskId} was left in Backlog past its deadline.`;
  }
  if (consequence.source === "missed_in_progress") {
    return `Because ${consequence.sourceTaskId} was still in progress when the day closed.`;
  }
  return `Because the fallout chain from ${consequence.rootCauseTaskId} reached its cap.`;
}

function consequenceFallbackLabel(
  consequence: RtMorningReport["consequences"][number],
  locale: Locale,
): string {
  if (consequence.effects.includes("minor hit")) return localizeEffect("hit", locale);
  return localizeEffect("blocked", locale);
}

function consequenceCauseLabel(
  cause: RtMorningReport["consequences"][number]["cause"],
  locale: Locale,
): string {
  return labelConsequenceCause(locale, cause);
}

function LossReport({
  locale,
  report,
}: {
  locale: Locale;
  report: NonNullable<RtGameState["lossReport"]>;
}) {
  return (
    <section className="panel loss-report">
      <h2>{t(locale, "loss.title")}</h2>
      <strong>{localizeLossHeadline(report.headline, locale)}</strong>
      <p>{localizeLossExplanation(report.explanation, locale)}</p>
      <div className="loss-grid">
        <span>{t(locale, "header.trust", { value: report.resourceSnapshot.trust })}</span>
        <span>{t(locale, "header.clients", { value: report.resourceSnapshot.clients })}</span>
        <span>{t(locale, "header.debt", { value: report.resourceSnapshot.debt })}</span>
      </div>
      {report.lastMissedTasks.length > 0 ? (
        <>
          <h3>{t(locale, "loss.recentMisses")}</h3>
          {report.lastMissedTasks.slice(0, 4).map((event) => (
            <p key={`${event.at}-${event.title}`}>
              {event.at} {localizeEventTitle(event.title, locale)} (
              {event.effects.map((effect) => localizeEffect(effect, locale)).join(", ")})
            </p>
          ))}
        </>
      ) : null}
      {report.lastBadReleases.length > 0 ? (
        <>
          <h3>{t(locale, "loss.badReleases")}</h3>
          {report.lastBadReleases.slice(0, 3).map((event) => (
            <p key={`${event.at}-${event.title}`}>
              {event.at} {localizeEventTitle(event.title, locale)} (
              {event.effects.map((effect) => localizeEffect(effect, locale)).join(", ")})
            </p>
          ))}
        </>
      ) : null}
      <h3>{t(locale, "loss.read")}</h3>
      <p>{localizeLossSuggestion(report.suggestion, locale)}</p>
    </section>
  );
}

function DebugPanel({
  game,
  locale,
  sessionId,
}: {
  game: RtGameState;
  locale: Locale;
  sessionId: string;
}) {
  const snapshot = buildDebugSnapshot(game);
  return (
    <section className="panel debug-panel">
      <h2>{t(locale, "debug.title")}</h2>
      <div className="debug-facts">
        <span>{t(locale, "debug.status", { value: snapshot.status })}</span>
        <span>{t(locale, "debug.events", { value: snapshot.events.length })}</span>
        <span>{t(locale, "debug.tasks", { value: snapshot.taskCount })}</span>
        <span>{t(locale, "debug.save", { value: SAVE_SCHEMA_VERSION })}</span>
        <span>{t(locale, "debug.commit", { value: APP_COMMIT })}</span>
        <span title={sessionId}>{t(locale, "debug.session", { value: formatSessionId(sessionId) })}</span>
      </div>
      <p>
        {t(locale, "debug.autosave", {
          key: AUTOSAVE_KEY,
          path: ".dtp-debug/latest-run.json",
        })}
      </p>
      {game.lossReason ? <p>{t(locale, "debug.stopReason", { reason: localizeText(game.lossReason, locale) })}</p> : null}
      <button
        className="ghost-button"
        onClick={() => copyDebugSnapshot(game)}
        type="button"
      >
        {t(locale, "debug.copy")}
      </button>
    </section>
  );
}

function loadLocale(): Locale {
  const storage = getBrowserStorage();
  return normalizeLocale(storage?.getItem(LOCALE_STORAGE_KEY));
}

function saveLocale(locale: Locale): void {
  const storage = getBrowserStorage();
  if (!storage) return;
  try {
    storage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Locale selection is a convenience setting.
  }
}

function getBrowserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
