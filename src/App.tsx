import { useEffect, useRef, useState, type DragEvent } from "react";
import { DocsScreen } from "./components/DocsScreen";
import { MenuScreen } from "./components/MenuScreen";
import {
  DONE_REWORK_TRUST_COST,
  OUTSOURCE_COST_BY_IMPORTANCE,
  RT_COLUMNS,
  TICK_MS,
  cancelTaskWork,
  createRealtimeState,
  formatGameTime,
  formatOverdueGameTime,
  lateReleaseReport,
  normalizeRealtimeState,
  releaseReadiness,
  startDayAfterMorningReport,
  taskDeadlineRatio,
  tickRealtime,
  type RtCharacter,
  type RtColumn,
  type RtEvent,
  type RtGameState,
  type RtMorningReport,
  type RtQuarterReviewReport,
  type RtReadinessReport,
  type RtRiskReason,
  type RtSubtask,
  type RtTask,
} from "./realtime/simulation";
import {
  LOCALE_STORAGE_KEY,
  labelBlastRadius,
  labelConsequenceCause,
  labelImportance,
  labelReadiness,
  labelRiskReason,
  labelRole,
  labelTaskKind,
  localizeEffect,
  localizeEventTitle,
  localizeLossExplanation,
  localizeLossHeadline,
  localizeLossSuggestion,
  localizeSubtaskTitle,
  localizeTaskName,
  localizeTaskTitle,
  localizeText,
  normalizeLocale,
  t,
  type Locale,
} from "./i18n";
import {
  APP_COMMIT,
  AUTOSAVE_KEY,
  SAVE_SCHEMA_VERSION,
  clearSavedRun,
  loadSavedRun,
  saveRun,
} from "./save";
import { formatReleaseCountdown, formatSessionId } from "./formatting";
import {
  BACKEND_LOG_FLUSH_INTERVAL_MS,
  buildDebugSnapshot,
  copyDebugSnapshot,
  createLogEntry,
  createSessionId,
  flushBackendLogQueue,
  gameEventKey,
  logAction,
  postBackendLog,
  postDebugSnapshot,
  type FrontendLogEntry,
} from "./frontendLogging";
import { useTaskFeedback } from "./hooks/useTaskFeedback";
import { useGameDragAndDrop } from "./hooks/useGameDragAndDrop";
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
  const autosaveTimer = useRef<number | null>(null);
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

  useEffect(() => {
    flushBackendLogQueue();
    const id = window.setInterval(flushBackendLogQueue, BACKEND_LOG_FLUSH_INTERVAL_MS);
    window.addEventListener("online", flushBackendLogQueue);

    return () => {
      window.clearInterval(id);
      window.removeEventListener("online", flushBackendLogQueue);
    };
  }, []);

  useEffect(() => {
    if (screen !== "game") return;
    const id = window.setInterval(() => {
      setGame((current) => {
        const draft = structuredClone(current) as RtGameState;
        const normalized = normalizeRealtimeState(draft);
        if (draft.paused || draft.status !== "running") return normalized ? draft : current;
        tickRealtime(draft, TICK_MS);
        return draft;
      });
    }, TICK_MS);

    return () => window.clearInterval(id);
  }, [screen]);

  useEffect(
    () => () => {
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    },
    [],
  );

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
    if (screen !== "game") return;
    const id = window.setInterval(() => {
      postDebugSnapshot(latestGameRef.current, sessionIdRef.current);
    }, 1000);

    return () => window.clearInterval(id);
  }, [screen]);

  useEffect(() => {
    if (screen !== "game") return;
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => {
      saveRun(latestGameRef.current, sessionIdRef.current);
    }, 120);

    return () => {
      if (autosaveTimer.current) {
        window.clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
    };
  }, [game, screen]);

  useEffect(() => {
    if (screen !== "game" || initialAutosaveRef.current?.status !== "loaded") return;
    logAction(sessionIdRef.current, "autosave_restored", {
      savedAt: initialAutosaveRef.current.save.savedAt,
      savedCommit: initialAutosaveRef.current.save.appCommit,
      currentCommit: APP_COMMIT,
      normalized: initialAutosaveRef.current.normalized,
    });
  }, [screen]);

  useEffect(() => {
    if (screen !== "game") return;
    const newEntries: FrontendLogEntry[] = [];
    for (const event of game.log.slice().reverse()) {
      const key = gameEventKey(event);
      if (loggedEventKeysRef.current.has(key)) continue;
      loggedEventKeysRef.current.add(key);
      newEntries.push(
        createLogEntry(sessionIdRef.current, "game_event", event.type, {
          ...event,
          gameTime: formatGameTime(game),
          resources: game.resources,
          status: game.status,
          lossReason: game.lossReason,
        }),
      );
    }
    if (newEntries.length > 0) {
      postBackendLog(newEntries);
    }
  }, [game, screen]);

  useEffect(() => {
    if (screen !== "game") return;
    for (const event of game.log.slice().reverse()) {
      if (!isWorkPassDoneEvent(event)) continue;
      const key = gameEventKey(event);
      if (animatedWorkEventKeysRef.current.has(key)) continue;
      animatedWorkEventKeysRef.current.add(key);
      const taskId = event.title.split(" ")[0];
      if (game.tasks[taskId]) bounceTask(taskId);
    }
  }, [game.log, game.tasks, screen]);

  useEffect(() => {
    if (screen !== "game") return;
    postDebugSnapshot(game, sessionIdRef.current);
  }, [game.status, game.lossReason, screen]);

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

  function startRun(actionName = "start_run_clicked") {
    clearSavedRun();
    const next = createRealtimeState(Date.now(), locale);
    const sessionId = createSessionId();
    sessionIdRef.current = sessionId;
    loggedEventKeysRef.current = new Set();
    animatedWorkEventKeysRef.current = new Set();
    resetDrag();
    resetFeedback();
    setGame(next);
    setSelectedTaskId(next.board.backlog[0] ?? null);
    setHasResumeCard(true);
    setScreen("game");
    saveRun(next, sessionId);
    logAction(sessionId, actionName, {
      seed: next.seed,
      startedAt: new Date().toISOString(),
      appCommit: APP_COMMIT,
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
    });
  }

  function togglePause() {
    if (game.morningReport) return;
    const next = game.status === "running" ? { ...game, paused: !game.paused } : game;
    latestGameRef.current = next;
    setGame(next);
    saveRun(next, sessionIdRef.current);
    logAction(sessionIdRef.current, game.paused ? "resume_clicked" : "pause_clicked", {
      gameTime: formatGameTime(game),
      status: game.status,
    });
  }

  function openMenu() {
    const next = game.status === "running" && !game.morningReport ? { ...game, paused: true } : game;
    latestGameRef.current = next;
    setGame(next);
    setHasResumeCard(true);
    setScreen("menu");
    saveRun(next, sessionIdRef.current);
    logAction(sessionIdRef.current, "menu_opened", {
      gameTime: formatGameTime(game),
      status: game.status,
    });
  }

  function continueRun() {
    const next = game.status === "running" ? { ...game, paused: false } : game;
    latestGameRef.current = next;
    setGame(next);
    setSelectedTaskId((current) => (current && next.tasks[current] ? current : initialSelectedTaskId(next)));
    setScreen("game");
    saveRun(next, sessionIdRef.current);
    logAction(sessionIdRef.current, "continue_run_clicked", {
      gameTime: formatGameTime(next),
      status: next.status,
      appCommit: APP_COMMIT,
    });
  }

  function openDocs() {
    setScreen("docs");
    logAction(sessionIdRef.current, "rtfm_opened", {
      locale,
      selectedDocId,
      hasSavedRun: hasResumeCard,
    });
  }

  function startBriefedDay() {
    const currentReport = latestGameRef.current.morningReport;
    if (!currentReport) return;
    setGame((current) => {
      const draft = structuredClone(current) as RtGameState;
      normalizeRealtimeState(draft);
      const continued = startDayAfterMorningReport(draft);
      return continued ? draft : current;
    });
    logAction(sessionIdRef.current, "morning_report_start_day_clicked", {
      reportId: currentReport.id,
      quarter: currentReport.quarter,
      day: currentReport.day,
      previousDay: currentReport.previousDay,
      shippedTaskIds: currentReport.shippedTaskIds,
      effects: currentReport.effects,
      consequences: currentReport.consequences,
    });
  }

  function cancelSelectedTask() {
    if (!selectedTask?.assignedCharacterId) return;
    const character = game.characters[selectedTask.assignedCharacterId];
    mutate((draft) => {
      cancelTaskWork(draft, selectedTask.id);
    });
    logAction(sessionIdRef.current, "cancel_task_clicked", {
      taskId: selectedTask.id,
      taskTitle: selectedTask.title,
      characterId: character?.id,
      characterName: character?.name,
      stageProgress: selectedTask.stageProgress,
      gameTime: formatGameTime(game),
    });
    flashTask(selectedTask.id);
  }

  function openLinkedTask(taskId: string) {
    const linkedTask = game.tasks[taskId];
    if (!linkedTask) return;
    if (game.board.released.includes(taskId)) {
      setProdView("released");
    } else if (linkedTask.resolved) {
      setProdView("unfinished");
    }
    setSelectedTaskId(taskId);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const card = document.querySelector<HTMLElement>(`[data-task-card-id="${taskId}"]`);
        if (card) {
          card.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        }
        flashTask(taskId);
      });
    });
    logAction(sessionIdRef.current, "linked_task_opened", {
      taskId,
      fromTaskId: selectedTaskId,
      gameTime: formatGameTime(game),
    });
  }

  const selectedAssigned = selectedTask?.assignedCharacterId
    ? game.characters[selectedTask.assignedCharacterId]
    : null;
  const releaseCountdown = formatReleaseCountdown(game);
  const clockText = morningReport ? "08:00" : formatGameTime(game);
  const displayedDay = morningReport?.day ?? game.day;
  const displayedQuarter = morningReport?.quarter ?? game.quarter;
  const quarterReviewText = quarterReviewLabel(locale, game);
  const prodTaskIds = prodView === "released" ? game.board.released : archivedUnfinishedTaskIds(game);
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
      <header className="game-header">
        <div className="brand-block">
          <strong>Don&apos;t Touch Prod</strong>
          <span>
            {t(locale, "header.day", {
              quarter: displayedQuarter,
              day: displayedDay,
              daysPerQuarter: game.daysPerQuarter,
            })}
          </span>
          <span>{quarterReviewText}</span>
        </div>
        <div className="clock-block">
          <span className="clock">{clockText}</span>
          <span>
            {t(locale, "header.goal", {
              value: game.quarterValue,
              goal: game.quarterGoal.value,
              trust: game.resources.trust,
              trustGoal: game.quarterGoal.trust,
            })}
          </span>
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
                : game.status.toUpperCase()}
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
            onClick={togglePause}
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
          <button className="ghost-button" onClick={openMenu} type="button">
            {t(locale, "header.menu")}
          </button>
        </div>
      </header>

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
          <aside className="team-panel panel">
            <h2>{t(locale, "team.title")}</h2>
            <div className="team-scroll">
              {Object.values(game.characters).map((character) => {
                const assignedTask = character.assignedTaskId
                  ? game.tasks[character.assignedTaskId]
                  : null;
                return (
                  <article
                    className={[
                      "character",
                      character.assignedTaskId ? "busy" : "",
                      character.exhaustedToday ? "exhausted" : "",
                    ].join(" ")}
                    draggable={
                      (game.paused || !interactionBlocked) &&
                      screen === "game" &&
                      game.status === "running" &&
                      !morningReport &&
                      !character.assignedTaskId &&
                      !character.exhaustedToday
                    }
                    key={character.id}
                    onDragEnd={finishDrag}
                    onDragStart={(event) => beginCharacterDrag(event, character)}
                  >
                    <div>
                      <strong>{character.name}</strong>
                      <span>{character.role}</span>
                    </div>
                    <div className="character-state">
                      {character.exhaustedToday ? (
                        <span>{t(locale, "team.exhausted")}</span>
                      ) : character.assignedTaskId ? (
                        <span>{t(locale, "team.onTask", { taskId: character.assignedTaskId })}</span>
                      ) : (
                        <span>{t(locale, "team.available")}</span>
                      )}
                      {character.shockGameMinutes > 0 ? (
                        <span>{t(locale, "team.shock", { minutes: Math.ceil(character.shockGameMinutes) })}</span>
                      ) : null}
                    </div>
                    {assignedTask ? (
                      <div className="character-work">
                        <div>
                          <span>
                            {assignedTask.id} {currentWorkLabel(assignedTask, locale)}
                          </span>
                          <b>{Math.round(assignedTask.stageProgress)}%</b>
                        </div>
                        <div className="work-track">
                          <i style={{ width: `${assignedTask.stageProgress}%` }} />
                        </div>
                      </div>
                    ) : null}
                    <MetricBar label={t(locale, "team.stamina")} tone="stamina" value={character.stamina} />
                    {character.burnout > 0 ? (
                      <span className="burnout-badge">
                        {t(locale, "team.burnout", { value: Math.round(character.burnout) })}
                      </span>
                    ) : null}
                  </article>
                );
              })}
              <article
                className={[
                  "outsourcing-card",
                  interactionBlocked || game.resources.budget <= 0 ? "disabled" : "",
                ].join(" ")}
                draggable={
                  (game.paused || !interactionBlocked) &&
                  screen === "game" &&
                  game.status === "running" &&
                  !morningReport &&
                  game.resources.budget > 0
                }
                onDragEnd={finishDrag}
                onDragStart={beginOutsourceDrag}
              >
                <div>
                  <strong>{t(locale, "outsourcing.title")}</strong>
                  <span>{t(locale, "outsourcing.role")}</span>
                </div>
                <p>{t(locale, "outsourcing.description")}</p>
                <div className="outsourcing-costs">
                  <span>{t(locale, "outsourcing.optional", { cost: OUTSOURCE_COST_BY_IMPORTANCE.optional })}</span>
                  <span>{t(locale, "outsourcing.important", { cost: OUTSOURCE_COST_BY_IMPORTANCE.important })}</span>
                  <span>{t(locale, "outsourcing.critical", { cost: OUTSOURCE_COST_BY_IMPORTANCE.critical })}</span>
                </div>
                <b>{t(locale, "outsourcing.budget", { budget: game.resources.budget })}</b>
              </article>
            </div>
          </aside>

          <section className="board">
            {RT_COLUMNS.map((column) => {
              const taskIds = column === "released" ? prodTaskIds : game.board[column];
              return (
                <div
                  className={[
                    "column",
                    column === "done" ? "done-column" : "",
                    column === "released" ? "released-column" : "",
                    shakeColumnIds.has(column) ? "reject-shake" : "",
                  ].join(" ")}
                  key={column}
                  onDragOver={allowDrop}
                  onDrop={(event) => dropOnColumn(event, column)}
                >
                  <div className="column-header">
                    <h2>{columnLabel(locale, column)}</h2>
                    {column === "released" ? (
                      <div className="prod-view-switch" aria-label={t(locale, "prodView.label")}>
                        {(["released", "unfinished"] as ProdView[]).map((view) => (
                          <button
                            className={prodView === view ? "active" : ""}
                            key={view}
                            onClick={() => setProdView(view)}
                            type="button"
                          >
                            {t(locale, `prodView.${view}`)}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {taskIds.map((taskId) => {
                    const task = game.tasks[taskId];
                    if (!task) return null;
                    return (
                      <TaskCard
                        attention={bounceTaskIds.has(task.id)}
                        flash={flashTaskId === task.id}
                        game={game}
                        key={task.id}
                        locale={locale}
                        onClick={() => setSelectedTaskId(task.id)}
                        onDragEnd={finishDrag}
                        onDragStart={beginTaskDrag}
                        onDropCharacter={dropOnTask}
                        reject={shakeTaskIds.has(task.id)}
                        selected={selectedTaskId === task.id}
                        task={task}
                      />
                    );
                  })}
                </div>
              );
            })}
          </section>

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

function quarterReviewLabel(locale: Locale, game: RtGameState): string {
  const daysLeft = Math.max(0, game.daysPerQuarter - game.dayInQuarter);
  if (daysLeft === 0) return t(locale, "header.quarterReviewTomorrow");
  return t(locale, "header.quarterReviewInDays", { days: daysLeft });
}

function columnLabel(locale: Locale, column: RtColumn): string {
  return t(locale, `columns.${column}`);
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

function TaskCard({
  attention,
  flash,
  game,
  locale,
  onClick,
  onDragEnd,
  onDragStart,
  onDropCharacter,
  reject,
  selected,
  task,
}: {
  attention: boolean;
  flash: boolean;
  game: RtGameState;
  locale: Locale;
  onClick: () => void;
  onDragEnd: () => void;
  onDragStart: (event: DragEvent<HTMLElement>, task: RtTask) => void;
  onDropCharacter: (event: DragEvent<HTMLElement>, task: RtTask) => void;
  reject: boolean;
  selected: boolean;
  task: RtTask;
}) {
  const assigned = task.assignedCharacterId
    ? game.characters[task.assignedCharacterId]
    : null;
  const outsourcingSubtask = task.outsourcing
    ? task.subtasks.find((subtask) => subtask.id === task.outsourcing?.subtaskId)
    : null;
  const deadlineRatio = taskDeadlineRatio(task);
  const readiness = releaseReadiness(task);
  const late = lateReleaseReport(task);
  const urgent = !task.resolved && !task.released && task.column !== "done" && deadlineRatio <= 0.18;
  const dragBlocked =
    Boolean(task.assignedCharacterId) ||
    Boolean(task.outsourcing) ||
    game.status !== "running" ||
    task.resolved ||
    task.released;
  const locked =
    Boolean(task.assignedCharacterId) ||
    Boolean(task.outsourcing) ||
    game.paused ||
    game.status !== "running" ||
    task.resolved ||
    task.released;
  const needsAttention =
    task.stageComplete && task.column === "inProgress" && !task.assignedCharacterId && !task.released;
  const readyForDone = needsAttention && taskReadyForDone(task);
  const neededRoles = taskNeededRoleChips(task, locale);
  const readinessClass = taskCardReadinessClass(task, readiness, readyForDone);
  const title = localizeTaskName(task.title, locale);

  return (
    <article
      className={[
        "task-card",
        selected ? "selected" : "",
        selected && task.column === "inProgress" ? "selected-work" : "",
        urgent ? "urgent" : "",
        locked ? "locked" : "",
        readinessClass,
        attention ? "work-pass-bounce" : "",
        flash ? "drop-flash" : "",
        reject ? "reject-shake" : "",
      ].join(" ")}
      data-task-card-id={task.id}
      draggable={!dragBlocked}
      onClick={onClick}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        const hasDropPayload =
          event.dataTransfer.types.includes("application/dtp-task") ||
          event.dataTransfer.types.includes("application/dtp-character") ||
          event.dataTransfer.types.includes("application/dtp-outsourcing");
        if (!game.paused && game.status === "running" && hasDropPayload) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }
      }}
      onDragStart={(event) => onDragStart(event, task)}
      onDrop={(event) => onDropCharacter(event, task)}
    >
      <header className="task-card-top">
        <div>
          <span>{task.id}</span>
          <b>{labelTaskKind(locale, task.kind)}</b>
        </div>
        <i
          aria-label={t(locale, "task.impact", { value: blastRadiusLabel(task.blastRadius, locale) })}
          className={`impact-dot ${task.blastRadius}`}
          title={t(locale, "task.impact", { value: blastRadiusLabel(task.blastRadius, locale) })}
        />
      </header>
      <strong className="task-title">{title}</strong>
      <div className="task-scan-row">
        <ReadinessBadge locale={locale} report={readiness} compact />
        {late.valuePenaltyPercent > 0 ? (
          <span className="late-chip">{t(locale, "task.lateChip", { value: late.valuePenaltyPercent })}</span>
        ) : null}
      </div>
      {neededRoles.length > 0 ? (
        <div className="role-chip-row" aria-label={t(locale, "task.neededRoles")}>
          {neededRoles.map((role) => (
            <span className={`role-chip ${role.kind}`} key={role.key}>
              {role.label}
            </span>
          ))}
        </div>
      ) : null}
      {!task.released && task.column !== "done" ? (
        <TinyBar label={t(locale, "task.deadline")} ratio={deadlineRatio} tone={deadlineTone(deadlineRatio)} />
      ) : null}
      {task.column === "done" && !task.released ? (
        <span className="queue-note">{t(locale, "task.reopenCost", { cost: DONE_REWORK_TRUST_COST })}</span>
      ) : null}
      {assigned ? (
        <div className="work-chip">
          <span>{assigned.name} {currentWorkLabel(task, locale)}</span>
          <div className="work-track">
            <i style={{ width: `${task.stageProgress}%` }} />
          </div>
        </div>
      ) : null}
      {task.outsourcing ? (
        <div className="work-chip outsourcing-work">
          <span>
            {t(locale, "task.outsource")}{" "}
            {outsourcingSubtask ? `-> ${subtaskRoleLabel(outsourcingSubtask.role, locale)}` : ""}
          </span>
          <div className="work-track">
            <i style={{ width: `${task.outsourcing.progress}%` }} />
          </div>
        </div>
      ) : null}
    </article>
  );
}

function TaskInspector({
  assigned,
  canCancelWork,
  cancelDisabled,
  game,
  locale,
  onCancelWork,
  onOpenLinkedTask,
  task,
}: {
  assigned: RtCharacter | null;
  canCancelWork: boolean;
  cancelDisabled: boolean;
  game: RtGameState;
  locale: Locale;
  onCancelWork: () => void;
  onOpenLinkedTask: (taskId: string) => void;
  task: RtTask;
}) {
  const readiness = releaseReadiness(task);
  const late = lateReleaseReport(task);
  const sourceTask = task.sourceTaskId ? game.tasks[task.sourceTaskId] : null;
  const consequenceTasks = Object.values(game.tasks)
    .filter((candidate) => candidate.sourceTaskId === task.id)
    .sort((left, right) => right.id.localeCompare(left.id));
  const visiblePostmortem = task.postmortem.filter(
    (note) => !/^Source task:/.test(note) && !/^Root cause:/.test(note),
  );
  return (
    <div className="task-inspector">
      <strong>{localizeTaskTitle(task.title, locale)}</strong>
      <div className="inspector-grid">
        <span>{t(locale, "inspector.column", { column: columnLabel(locale, task.column) })}</span>
        <span>{t(locale, "inspector.pressure", { value: task.pressure })}</span>
        <span>{t(locale, "inspector.complexity", { value: task.complexity })}</span>
        <span>{t(locale, "inspector.value", { value: task.value })}</span>
        <span>{t(locale, "inspector.clarity", { value: task.clarity })}</span>
        <span>{t(locale, "inspector.quality", { value: task.quality })}</span>
        <span>{t(locale, "inspector.qa", { value: task.testCoverage })}</span>
        <span>{t(locale, "inspector.bugs", { value: task.bugs })}</span>
        <span>{t(locale, "inspector.impact", { value: blastRadiusLabel(task.blastRadius, locale) })}</span>
        {late.valuePenaltyPercent > 0 ? (
          <span>
            {t(locale, "inspector.late", {
              time: formatOverdueGameTime(late.overdueMs),
              value: late.valuePenaltyPercent,
            })}
          </span>
        ) : null}
      </div>
      <ReadinessBadge locale={locale} report={readiness} />
      <SubtaskList locale={locale} task={task} />
      {task.column === "done" && !task.released ? (
        <p>{t(locale, "inspector.queued", { cost: DONE_REWORK_TRUST_COST })}</p>
      ) : (
        <TinyBar label={t(locale, "task.deadline")} ratio={taskDeadlineRatio(task)} tone="deadline" />
      )}
      {assigned ? (
        <div className="current-work">
          <span>{t(locale, "work.character", { name: assigned.name })}</span>
          <TinyBar label={t(locale, "work.progress")} ratio={task.stageProgress / 100} tone="progress" />
        </div>
      ) : null}
      {task.outsourcing ? (
        <div className="current-work">
          <span>{t(locale, "work.outsource")}</span>
          <TinyBar label={t(locale, "work.progress")} ratio={task.outsourcing.progress / 100} tone="progress" />
        </div>
      ) : null}
      {canCancelWork ? (
        <button
          className="cancel-button inspector-cancel-button"
          disabled={cancelDisabled}
          onClick={onCancelWork}
          type="button"
        >
          {t(locale, "inspector.cancel")}
        </button>
      ) : null}
      <p>{localizeText(task.lastNote, locale)}</p>
      {task.sourceTaskId ? (
        <div className="source-link-panel">
          <h3>{t(locale, "inspector.causedBy")}</h3>
          {sourceTask ? (
            <button
              className="task-link-chip"
              onClick={() => onOpenLinkedTask(sourceTask.id)}
              type="button"
            >
              {localizeTaskTitle(sourceTask.title, locale)}
            </button>
          ) : (
            <span className="task-link-chip disabled">
              {t(locale, "inspector.missingSource", { id: task.sourceTaskId })}
            </span>
          )}
        </div>
      ) : null}
      {consequenceTasks.length > 0 ? (
        <div className="source-link-panel">
          <h3>{t(locale, "inspector.consequences")}</h3>
          <div className="task-link-list">
            {consequenceTasks.map((consequenceTask) => (
              <button
                className="task-link-chip"
                key={consequenceTask.id}
                onClick={() => onOpenLinkedTask(consequenceTask.id)}
                type="button"
              >
                {localizeTaskTitle(consequenceTask.title, locale)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {visiblePostmortem.length > 0 ? (
        <div className="postmortem">
          <h3>{t(locale, "inspector.postmortem")}</h3>
          {visiblePostmortem.map((note) => (
            <p key={note}>{localizeText(note, locale)}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SubtaskList({ locale, task }: { locale: Locale; task: RtTask }) {
  const revealedSubtasks = task.subtasks.filter((subtask) => subtask.revealed);
  const hasHiddenWork = task.subtasks.some((subtask) => !subtask.revealed && !subtask.done);
  return (
    <div className="subtask-list">
      <h3>{t(locale, "subtasks.title")}</h3>
      {revealedSubtasks.map((subtask) => (
        <div
          className={[
            "subtask-row",
            subtask.done ? "done" : "",
            !subtask.revealed ? "hidden" : "",
          ].join(" ")}
          key={subtask.id}
        >
          <span>{subtask.done ? "✓" : subtask.revealed ? "□" : "?"}</span>
          <strong>{subtask.revealed ? localizeSubtaskTitle(subtask.title, locale) : t(locale, "subtasks.unknown")}</strong>
          <em>{subtaskRoleLabel(subtask.role, locale)}</em>
          <b>{labelImportance(locale, subtask.importance)}</b>
        </div>
      ))}
      {hasHiddenWork ? (
        <div className="subtask-row hidden">
          <span>?</span>
          <strong>{t(locale, "subtasks.unknown")}</strong>
          <em>{t(locale, "subtasks.analysisNeeded")}</em>
          <b>{t(locale, "subtasks.unknownImportance")}</b>
        </div>
      ) : null}
    </div>
  );
}

function initialSelectedTaskId(game: RtGameState): string | null {
  return (
    game.board.inProgress[0] ??
    game.board.backlog[0] ??
    game.board.done[0] ??
    game.board.released[0] ??
    null
  );
}

function archivedUnfinishedTaskIds(game: RtGameState): string[] {
  return Object.values(game.tasks)
    .filter((task) => task.resolved && !task.released)
    .sort((left, right) => {
      const dayDelta = (right.resolutionDay ?? 0) - (left.resolutionDay ?? 0);
      if (dayDelta !== 0) return dayDelta;
      return taskIdSequence(right.id) - taskIdSequence(left.id);
    })
    .map((task) => task.id);
}

function taskIdSequence(taskId: string): number {
  return Number(taskId.match(/\d+$/)?.[0] ?? 0);
}

function isWorkPassDoneEvent(event: RtEvent): boolean {
  return (
    event.type === "analysis_done" ||
    event.type === "subtask_done" ||
    event.type === "bugfix_done" ||
    event.type === "qa_done"
  );
}

function taskReadyForDone(task: RtTask): boolean {
  return (
    task.workDone &&
    task.subtasks.filter((subtask) => subtask.revealed && !subtask.done).length === 0 &&
    task.bugs === 0
  );
}

function taskCardReadinessClass(
  task: RtTask,
  readiness: RtReadinessReport,
  readyForDone: boolean,
): "ready-clean" | "ready-risky" | "needs-work" {
  const queuedOrReleased = task.column === "done" || task.released;
  const canResolveNow = readyForDone || queuedOrReleased;
  if (!canResolveNow) return "needs-work";
  if (readiness.readiness === "clean") return "ready-clean";
  if (readiness.readiness === "risky") return "ready-risky";
  return "needs-work";
}

function ReadinessBadge({
  compact = false,
  locale,
  report,
}: {
  compact?: boolean;
  locale: Locale;
  report: RtReadinessReport;
}) {
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

function readinessLabel(readiness: RtReadinessReport["readiness"], locale: Locale): string {
  return labelReadiness(locale, readiness);
}

function riskReasonLabel(reason: RtRiskReason, locale: Locale): string {
  return labelRiskReason(locale, reason);
}

function blastRadiusLabel(blastRadius: RtTask["blastRadius"], locale: Locale): string {
  return labelBlastRadius(locale, blastRadius);
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

function MetricBar({
  label,
  tone = "default",
  value,
}: {
  label: string;
  tone?: "default" | "stamina";
  value: number;
}) {
  const safeValue = Math.max(0, Math.min(100, value));
  const staminaLevel =
    tone === "stamina" && safeValue <= 25
      ? "danger"
      : tone === "stamina" && safeValue <= 55
        ? "warning"
        : "";
  return (
    <div className={`metric ${tone} ${staminaLevel}`}>
      <span>{label}</span>
      <i style={{ width: `${safeValue}%` }} />
      <b>{Math.round(value)}</b>
    </div>
  );
}

function TinyBar({
  label,
  ratio,
  tone,
}: {
  label: string;
  ratio: number;
  tone: "queue" | "deadline" | "deadline-safe" | "deadline-warning" | "deadline-urgent" | "progress";
}) {
  const percent = Math.max(0, Math.min(100, ratio * 100));
  return (
    <div className={`tiny-bar ${tone}`}>
      <span>{label}</span>
      <div className="tiny-track">
        <i style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function deadlineTone(ratio: number): "deadline-safe" | "deadline-warning" | "deadline-urgent" {
  if (ratio <= 0.18) return "deadline-urgent";
  if (ratio <= 0.42) return "deadline-warning";
  return "deadline-safe";
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

function currentWorkLabel(task: RtTask, locale: Locale): string {
  const subtask = task.currentSubtaskId
    ? task.subtasks.find((candidate) => candidate.id === task.currentSubtaskId)
    : null;
  if (subtask) return `-> ${subtaskRoleLabel(subtask.role, locale)}`;
  return task.assignedCharacterId ? (locale === "ru" ? "-> анализ" : "-> analysis") : "";
}

function taskNeededRoleChips(task: RtTask, locale: Locale): Array<{
  key: string;
  kind: "known" | "unknown";
  label: string;
}> {
  if (task.released) return [];
  const roles = new Set<RtSubtask["role"]>();
  for (const subtask of task.subtasks) {
    if (!subtask.revealed || subtask.done) continue;
    roles.add(subtask.role);
  }
  const chips: Array<{
    key: string;
    kind: "known" | "unknown";
    label: string;
  }> = Array.from(roles).map((role) => ({
    key: role,
    kind: "known",
    label: subtaskRoleLabel(role, locale),
  }));
  const hasHiddenOpenWork = task.subtasks.some((subtask) => !subtask.revealed && !subtask.done);
  if (hasHiddenOpenWork) {
    chips.push({
      key: "unknown",
      kind: "unknown",
      label: t(locale, "subtasks.unknownImportance"),
    });
  }
  return chips;
}

function subtaskRoleLabel(role: RtSubtask["role"], locale: Locale): string {
  return labelRole(locale, role);
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
