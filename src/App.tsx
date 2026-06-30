import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  DONE_REWORK_TRUST_COST,
  OUTSOURCE_COST_BY_IMPORTANCE,
  RELEASE_TRAIN_GAME_MINUTE,
  RT_COLUMNS,
  TICK_MS,
  assignCharacterToTask,
  cancelTaskWork,
  canAssignCharacterToTask,
  canMoveRealtimeTask,
  canOutsourceTaskWork,
  createRealtimeState,
  formatGameTime,
  isWorkColumn,
  moveRealtimeTask,
  normalizeRealtimeState,
  outsourceTaskWork,
  releaseReadiness,
  startDayAfterMorningReport,
  taskDeadlineRatio,
  tickRealtime,
  type RtCharacter,
  type RtColumn,
  type RtEvent,
  type RtGameState,
  type RtMorningReport,
  type RtReadinessReport,
  type RtRiskReason,
  type RtSubtask,
  type RtTask,
} from "./realtime/simulation";
import {
  APP_COMMIT,
  AUTOSAVE_KEY,
  SAVE_SCHEMA_VERSION,
  clearSavedRun,
  loadSavedRun,
  saveRun,
} from "./save";
import "./styles.css";

const COLUMN_LABELS: Record<RtColumn, string> = {
  backlog: "Backlog",
  inProgress: "In Progress",
  done: "Done",
  released: "Released",
};

const BACKEND_BASE_URL = import.meta.env.VITE_DTP_BACKEND_URL ?? "http://127.0.0.1:8787";
const BACKEND_LOG_URL = `${BACKEND_BASE_URL}/api/log`;
const BACKEND_RESET_URL = `${BACKEND_BASE_URL}/api/reset`;

interface FrontendLogEntry {
  id: string;
  sessionId: string;
  source: "dtp2-frontend";
  kind: "action" | "game_event" | "snapshot";
  name: string;
  payload: unknown;
}

type AppScreen = "menu" | "game";

type ActiveDrag =
  | { type: "task"; taskId: string }
  | { type: "character"; characterId: string }
  | { type: "outsourcing" }
  | null;

export function App() {
  const initialAutosaveRef = useRef<ReturnType<typeof loadSavedRun> | null>(null);
  if (!initialAutosaveRef.current) {
    initialAutosaveRef.current = loadSavedRun();
  }
  const restoredSave =
    initialAutosaveRef.current.status === "loaded" ? initialAutosaveRef.current.save : null;
  const bootGameRef = useRef<RtGameState | null>(null);
  if (!bootGameRef.current) {
    bootGameRef.current = restoredSave?.game ?? createRealtimeState(184);
  }
  const bootGame = bootGameRef.current;

  const [game, setGame] = useState<RtGameState>(() => bootGame);
  const [screen, setScreen] = useState<AppScreen>(() => (restoredSave ? "game" : "menu"));
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(
    initialSelectedTaskId(bootGame),
  );
  const [flashTaskId, setFlashTaskId] = useState<string | null>(null);
  const [bounceTaskIds, setBounceTaskIds] = useState<Set<string>>(() => new Set());
  const flashTimer = useRef<number | null>(null);
  const bounceTimers = useRef<Record<string, number>>({});
  const autosaveTimer = useRef<number | null>(null);
  const latestGameRef = useRef(game);
  const sessionIdRef = useRef(restoredSave?.sessionId ?? createSessionId());
  const loggedEventKeysRef = useRef(
    new Set<string>(restoredSave?.game.log.map(gameEventKey) ?? []),
  );
  const animatedWorkEventKeysRef = useRef(
    new Set<string>(restoredSave?.game.log.map(gameEventKey) ?? []),
  );
  const activeDragRef = useRef<ActiveDrag>(null);
  const selectedTask = selectedTaskId ? game.tasks[selectedTaskId] : null;
  const morningReport = game.morningReport;
  const interactionBlocked =
    screen !== "game" || game.paused || game.status !== "running" || Boolean(morningReport);

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
      clearBounceTimers();
    },
    [],
  );

  useEffect(() => {
    latestGameRef.current = game;
  }, [game]);

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
    const next = createRealtimeState(Date.now());
    const sessionId = createSessionId();
    sessionIdRef.current = sessionId;
    loggedEventKeysRef.current = new Set();
    animatedWorkEventKeysRef.current = new Set();
    activeDragRef.current = null;
    clearBounceTimers();
    setBounceTaskIds(new Set());
    setGame(next);
    setSelectedTaskId(next.board.backlog[0] ?? null);
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
    logAction(sessionIdRef.current, game.paused ? "resume_clicked" : "pause_clicked", {
      gameTime: formatGameTime(game),
      status: game.status,
    });
    setGame((current) =>
      current.status === "running" ? { ...current, paused: !current.paused } : current,
    );
  }

  function newRun() {
    startRun("new_run_clicked");
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

  function beginTaskDrag(event: DragEvent<HTMLElement>, task: RtTask) {
    if (interactionBlocked || task.assignedCharacterId || task.released) {
      event.preventDefault();
      return;
    }
    activeDragRef.current = { type: "task", taskId: task.id };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/dtp-task", task.id);
    event.dataTransfer.setData("text/plain", task.id);
    logAction(sessionIdRef.current, "task_drag_started", {
      taskId: task.id,
      fromColumn: task.column,
      gameTime: formatGameTime(game),
    });
  }

  function beginCharacterDrag(event: DragEvent<HTMLElement>, character: RtCharacter) {
    if (interactionBlocked || character.assignedTaskId || character.exhaustedToday) {
      event.preventDefault();
      return;
    }
    activeDragRef.current = { type: "character", characterId: character.id };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/dtp-character", character.id);
    setDragGhost(event, character);
    logAction(sessionIdRef.current, "character_drag_started", {
      characterId: character.id,
      characterName: character.name,
      role: character.role,
      gameTime: formatGameTime(game),
    });
  }

  function beginOutsourceDrag(event: DragEvent<HTMLElement>) {
    if (interactionBlocked || game.resources.budget <= 0) {
      event.preventDefault();
      return;
    }
    activeDragRef.current = { type: "outsourcing" };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/dtp-outsourcing", "outsourcing");
    event.dataTransfer.setData("text/plain", "outsourcing");
    logAction(sessionIdRef.current, "outsourcing_drag_started", {
      budget: game.resources.budget,
      gameTime: formatGameTime(game),
    });
  }

  function allowDrop(event: DragEvent<HTMLElement>) {
    if (interactionBlocked) return;
    if (
      activeDragRef.current ||
      event.dataTransfer.types.includes("application/dtp-task") ||
      event.dataTransfer.types.includes("application/dtp-character") ||
      event.dataTransfer.types.includes("application/dtp-outsourcing")
    ) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    }
  }

  function dropOnColumn(event: DragEvent<HTMLElement>, column: RtColumn) {
    event.preventDefault();
    event.stopPropagation();
    if (interactionBlocked) return;
    if (column === "released") return;
    const activeDrag = activeDragRef.current;
    const taskId =
      event.dataTransfer.getData("application/dtp-task") ||
      (activeDrag?.type === "task" ? activeDrag.taskId : "");
    if (!taskId) return;
    moveDroppedTask(taskId, column);
  }

  function moveDroppedTask(taskId: string, column: RtColumn) {
    const fromColumn = game.tasks[taskId]?.column;
    const task = game.tasks[taskId];
    const moveCheck = canMoveRealtimeTask(game, taskId, column);

    if (!moveCheck.allowed) {
      logAction(sessionIdRef.current, "task_drop_rejected", {
        taskId,
        fromColumn,
        toColumn: column,
        reason: moveCheck.reason,
        gameTime: formatGameTime(game),
      });
      activeDragRef.current = null;
      return;
    }

    mutate((draft) => {
      const moved = moveRealtimeTask(draft, taskId, column);
      if (moved) setSelectedTaskId(taskId);
    });
    logAction(sessionIdRef.current, "task_dropped_on_column", {
      taskId,
      fromColumn,
      toColumn: column,
      ...(task && column === "done"
        ? { releaseReadiness: releaseReadiness(task) }
        : {}),
      gameTime: formatGameTime(game),
    });
    flashTask(taskId);
    activeDragRef.current = null;
  }

  function dropOnTask(event: DragEvent<HTMLElement>, task: RtTask) {
    event.preventDefault();
    event.stopPropagation();
    if (interactionBlocked) return;
    const activeDrag = activeDragRef.current;
    const draggedTaskId =
      event.dataTransfer.getData("application/dtp-task") ||
      (activeDrag?.type === "task" ? activeDrag.taskId : "");
    if (draggedTaskId) {
      moveDroppedTask(draggedTaskId, task.column);
      return;
    }

    const outsourcePayload =
      event.dataTransfer.getData("application/dtp-outsourcing") ||
      (activeDrag?.type === "outsourcing" ? "outsourcing" : "");
    if (outsourcePayload) {
      if (!isWorkColumn(task.column)) return;
      const canOutsource = canOutsourceTaskWork(game, task.id);
      mutate((draft) => {
        if (outsourceTaskWork(draft, task.id)) {
          setSelectedTaskId(task.id);
        }
      });
      logAction(
        sessionIdRef.current,
        canOutsource ? "outsourcing_dropped_on_task" : "outsourcing_drop_rejected",
        {
          taskId: task.id,
          taskTitle: task.title,
          column: task.column,
          budget: game.resources.budget,
          reason: canOutsource ? "outsourcing started" : "no budget, busy task, or open work",
          gameTime: formatGameTime(game),
        },
      );
      if (canOutsource) flashTask(task.id);
      activeDragRef.current = null;
      return;
    }

    const characterId =
      event.dataTransfer.getData("application/dtp-character") ||
      (activeDrag?.type === "character" ? activeDrag.characterId : "");
    if (!characterId || !isWorkColumn(task.column)) return;
    const character = game.characters[characterId];
    const canAssign = canAssignCharacterToTask(game, characterId, task.id);

    mutate((draft) => {
      if (assignCharacterToTask(draft, characterId, task.id)) {
        setSelectedTaskId(task.id);
      }
    });
    logAction(
      sessionIdRef.current,
      canAssign ? "character_dropped_on_task" : "character_drop_rejected",
      {
        characterId,
        characterName: character?.name,
        role: character?.role,
        taskId: task.id,
        taskTitle: task.title,
        column: task.column,
        reason: canAssign ? "assigned" : "no matching specialization",
        gameTime: formatGameTime(game),
      },
    );
    if (canAssign) flashTask(task.id);
    activeDragRef.current = null;
  }

  function finishDrag() {
    activeDragRef.current = null;
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

  function flashTask(taskId: string) {
    setFlashTaskId(taskId);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlashTaskId(null), 420);
  }

  function clearBounceTimers() {
    for (const timer of Object.values(bounceTimers.current)) {
      window.clearTimeout(timer);
    }
    bounceTimers.current = {};
  }

  function bounceTask(taskId: string) {
    setBounceTaskIds((current) => new Set(current).add(taskId));
    if (bounceTimers.current[taskId]) {
      window.clearTimeout(bounceTimers.current[taskId]);
    }
    bounceTimers.current[taskId] = window.setTimeout(() => {
      setBounceTaskIds((current) => {
        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
      delete bounceTimers.current[taskId];
    }, 720);
  }

  const selectedAssigned = selectedTask?.assignedCharacterId
    ? game.characters[selectedTask.assignedCharacterId]
    : null;
  const releaseCountdown = formatReleaseCountdown(game);
  const clockText = morningReport ? "08:00" : formatGameTime(game);
  const displayedDay = morningReport?.day ?? game.day;
  const displayedQuarter = morningReport?.quarter ?? game.quarter;

  if (screen === "menu") {
    return (
      <main className="shell menu-shell">
        <section className="main-menu">
          <div className="menu-title">
            <strong>Don&apos;t Touch Prod</strong>
            <span>Q1 / Day 1</span>
          </div>
          <button className="start-button" onClick={() => startRun()} type="button">
            Start run
          </button>
        </section>
      </main>
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
          <span>Q{displayedQuarter} / Day {displayedDay}</span>
        </div>
        <div className="clock-block">
          <span className="clock">{clockText}</span>
          <span>Goal {game.quarterValue}/{game.quarterGoal.value}</span>
          <span>
            {morningReport
              ? `Morning briefing / Fallout ${morningReport.consequences.length}`
              : `Release in ${releaseCountdown} / Done ${game.board.done.length}`}
          </span>
        </div>
        <div className="stat-strip">
          <span className={`status-pill ${morningReport ? "morning-report" : game.status}`}>
            {morningReport
              ? "MORNING"
              : game.status === "running" && game.paused
                ? "PAUSED"
                : game.status.toUpperCase()}
          </span>
          <span>Trust {game.resources.trust}</span>
          <span>Clients {game.resources.clients}</span>
          <span>Debt {game.resources.debt}</span>
          <span>Value {game.resources.value}</span>
          <span>Team Budget {game.resources.budget}</span>
          <span>Boost {game.resources.processBoost}%</span>
        </div>
        <div className="header-actions">
          {selectedAssigned && !morningReport ? (
            <button
              className="cancel-button"
              disabled={interactionBlocked}
              onClick={cancelSelectedTask}
              type="button"
            >
              Отменить задачу
            </button>
          ) : null}
          <button
            className="pause-button"
            disabled={game.status !== "running" || Boolean(morningReport)}
            onClick={togglePause}
            type="button"
          >
            {game.status !== "running"
              ? "Stopped"
              : morningReport
                ? "Paused"
                : game.paused
                  ? "Resume"
                  : "Pause"}
          </button>
          <button className="ghost-button" onClick={newRun} type="button">
            New run
          </button>
        </div>
      </header>

      {game.status !== "running" ? (
        <section className="run-banner">
          <strong>{game.lossReport?.headline ?? "Игра остановилась"}</strong>
          <span>{game.lossReport?.explanation ?? game.lossReason}</span>
        </section>
      ) : null}

      {morningReport ? (
        <MorningReportPage
          game={game}
          onContinue={startBriefedDay}
          report={morningReport}
        />
      ) : (
        <section className="playfield">
          <aside className="team-panel panel">
            <h2>Team</h2>
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
                      !interactionBlocked &&
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
                        <span>Exhausted</span>
                      ) : character.assignedTaskId ? (
                        <span>On {character.assignedTaskId}</span>
                      ) : (
                        <span>Available</span>
                      )}
                      {character.shockGameMinutes > 0 ? (
                        <span>Shock {Math.ceil(character.shockGameMinutes)}m</span>
                      ) : null}
                    </div>
                    {assignedTask ? (
                      <div className="character-work">
                        <div>
                          <span>
                            {assignedTask.id} {currentWorkLabel(assignedTask)}
                          </span>
                          <b>{Math.round(assignedTask.stageProgress)}%</b>
                        </div>
                        <div className="work-track">
                          <i style={{ width: `${assignedTask.stageProgress}%` }} />
                        </div>
                      </div>
                    ) : null}
                    <MetricBar label="Stamina" value={character.stamina} />
                    <MetricBar label="Burnout" value={character.burnout} />
                  </article>
                );
              })}
              <article
                className={[
                  "outsourcing-card",
                  interactionBlocked || game.resources.budget <= 0 ? "disabled" : "",
                ].join(" ")}
                draggable={!interactionBlocked && game.resources.budget > 0}
                onDragEnd={finishDrag}
                onDragStart={beginOutsourceDrag}
              >
                <div>
                  <strong>Outsource</strong>
                  <span>contractor</span>
                </div>
                <p>Expensive fallback for missing competence.</p>
                <div className="outsourcing-costs">
                  <span>Optional {OUTSOURCE_COST_BY_IMPORTANCE.optional}</span>
                  <span>Important {OUTSOURCE_COST_BY_IMPORTANCE.important}</span>
                  <span>Critical {OUTSOURCE_COST_BY_IMPORTANCE.critical}</span>
                </div>
                <b>Team Budget {game.resources.budget}</b>
              </article>
            </div>
          </aside>

          <section className="board">
            {RT_COLUMNS.map((column) => (
              <div
                className={[
                  "column",
                  column === "done" ? "done-column" : "",
                  column === "released" ? "released-column" : "",
                ].join(" ")}
                key={column}
                onDragOver={column === "released" ? undefined : allowDrop}
                onDrop={(event) => dropOnColumn(event, column)}
              >
                <h2>{COLUMN_LABELS[column]}</h2>
                {game.board[column].map((taskId) => {
                  const task = game.tasks[taskId];
                  if (!task) return null;
                  return (
                    <TaskCard
                      attention={bounceTaskIds.has(task.id)}
                      flash={flashTaskId === task.id}
                      game={game}
                      key={task.id}
                      onClick={() => setSelectedTaskId(task.id)}
                      onDragEnd={finishDrag}
                      onDragStart={beginTaskDrag}
                      onDropCharacter={dropOnTask}
                      selected={selectedTaskId === task.id}
                      task={task}
                    />
                  );
                })}
              </div>
            ))}
          </section>

          <aside className="side-stack">
            <section className="panel inspector">
              <h2>Selected Task</h2>
              {selectedTask ? (
                <TaskInspector assigned={selectedAssigned} task={selectedTask} />
              ) : (
                <p className="empty">No task selected.</p>
              )}
            </section>

            {game.lossReport ? <LossReport report={game.lossReport} /> : null}

            <section className="panel log-panel">
              <h2>Event Log</h2>
              {game.log.slice(0, 24).map((event, index) => (
                <EventItem event={event} key={`${event.at}-${event.title}-${index}`} />
              ))}
            </section>

            <DebugPanel game={game} />
          </aside>
        </section>
      )}
    </main>
  );
}

function MorningReportPage({
  game,
  onContinue,
  report,
}: {
  game: RtGameState;
  onContinue: () => void;
  report: RtMorningReport;
}) {
  const shippedTasks = report.shippedTaskIds
    .map((taskId) => game.tasks[taskId])
    .filter((task): task is RtTask => Boolean(task));
  const canContinue = game.status === "running";

  return (
    <section className="morning-report-page">
      <div className="morning-report-hero">
        <div>
          <span>Q{report.quarter} / Day {report.day} / {report.at}</span>
          <h1>Morning Briefing</h1>
          <p>
            {report.empty
              ? "Nothing shipped yesterday. Today's work starts from the existing backlog."
              : `${report.shippedTaskIds.length} task(s) shipped yesterday. Today's backlog reflects the consequences.`}
          </p>
        </div>
        <button
          className="start-button"
          disabled={!canContinue}
          onClick={onContinue}
          type="button"
        >
          Начать день
        </button>
      </div>

      <div className="morning-summary-grid">
        <ReleaseMetric
          after={report.resourceAfter.value}
          before={report.resourceBefore.value}
          delta={report.resourceDelta.value}
          label="Value"
        />
        <ReleaseMetric
          after={report.resourceAfter.budget}
          before={report.resourceBefore.budget}
          delta={report.resourceDelta.budget}
          label="Team Budget"
        />
        <ReleaseMetric
          after={report.resourceAfter.trust}
          before={report.resourceBefore.trust}
          delta={report.resourceDelta.trust}
          label="Trust"
        />
        <ReleaseMetric
          after={report.resourceAfter.clients}
          before={report.resourceBefore.clients}
          delta={report.resourceDelta.clients}
          label="Clients"
        />
        <ReleaseMetric
          after={report.resourceAfter.debt}
          before={report.resourceBefore.debt}
          delta={report.resourceDelta.debt}
          label="Debt"
          reverseTone
        />
      </div>

      <section className="morning-report-section">
        <h2>Consequences</h2>
        {report.consequences.length === 0 ? (
          <p className="empty">No visible release fallout hit the team this morning.</p>
        ) : (
          <div className="morning-consequence-list">
            {report.consequences.map((consequence) => (
              <article className="morning-consequence-row" key={consequence.id}>
                <header>
                  <div>
                    <span>{consequence.sourceTaskId}</span>
                    <strong>{consequence.symptom}</strong>
                  </div>
                  <b>{consequence.generatedTaskId ?? "blocked"}</b>
                </header>
                <p>
                  Because yesterday&apos;s {consequence.sourceTaskId} shipped with{" "}
                  {consequenceCauseLabel(consequence.cause)}.
                </p>
                <div className="release-effect-strip">
                  {consequence.effects.map((effect) => (
                    <span className={`release-effect ${effectTone(effect)}`} key={effect}>
                      {effect}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="morning-report-section">
        <h2>Yesterday&apos;s Shipments</h2>
        {shippedTasks.length === 0 ? (
          <p className="empty">No cards were queued in Done before the release train.</p>
        ) : (
          <div className="release-task-list">
            {shippedTasks.map((task) => {
              const releaseEvent = game.log.find(
                (event) => event.type === "release" && event.title === `${task.id} released`,
              );
              return (
                <article className="release-task-row" key={task.id}>
                  <header>
                    <div>
                      <span>{task.id}</span>
                      <strong>{task.title.replace(`${task.id}: `, "")}</strong>
                    </div>
                    <b>{task.kind}</b>
                  </header>
                  <ReadinessBadge report={releaseReadiness(task)} />
                  <div className="release-effect-strip">
                    {(releaseEvent?.effects ?? [task.lastNote]).map((effect) => (
                      <span className={`release-effect ${effectTone(effect)}`} key={effect}>
                        {effect}
                      </span>
                    ))}
                  </div>
                  {task.postmortem.length > 0 ? (
                    <div className="release-postmortem">
                      {task.postmortem.slice(0, 4).map((note) => (
                        <p key={note}>{note}</p>
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
          Run stopped after this release. Start a new run from the header.
        </p>
      ) : null}
    </section>
  );
}

function ReleaseMetric({
  after,
  before,
  delta,
  label,
  reverseTone = false,
}: {
  after: number;
  before: number;
  delta: number;
  label: string;
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
        {formatSignedNumber(delta)} from {before}
      </em>
    </article>
  );
}

function TaskCard({
  attention,
  flash,
  game,
  onClick,
  onDragEnd,
  onDragStart,
  onDropCharacter,
  selected,
  task,
}: {
  attention: boolean;
  flash: boolean;
  game: RtGameState;
  onClick: () => void;
  onDragEnd: () => void;
  onDragStart: (event: DragEvent<HTMLElement>, task: RtTask) => void;
  onDropCharacter: (event: DragEvent<HTMLElement>, task: RtTask) => void;
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
  const revealedSubtasks = task.subtasks.filter((subtask) => subtask.revealed);
  const openSubtasks = revealedSubtasks.filter((subtask) => !subtask.done);
  const doneSubtaskCount = revealedSubtasks.filter((subtask) => subtask.done).length;
  const hasHiddenWork = task.subtasks.some((subtask) => !subtask.revealed && !subtask.done);
  const readiness = releaseReadiness(task);
  const urgent = !task.released && task.column !== "done" && deadlineRatio <= 0.18;
  const locked =
    Boolean(task.assignedCharacterId) ||
    Boolean(task.outsourcing) ||
    game.paused ||
    game.status !== "running" ||
    task.released;
  const needsAttention =
    task.stageComplete && task.column === "inProgress" && !task.assignedCharacterId && !task.released;
  const readyForDone = needsAttention && taskReadyForDone(task);
  const cardStatus = task.released
    ? "Released"
    : task.column === "done"
      ? "Ships at 18:00"
      : readyForDone
        ? "Known work complete"
        : null;

  return (
    <article
      className={[
        "task-card",
        selected ? "selected" : "",
        selected && task.column === "inProgress" ? "selected-work" : "",
        urgent ? "urgent" : "",
        locked ? "locked" : "",
        attention ? "work-pass-bounce" : "",
        flash ? "drop-flash" : "",
      ].join(" ")}
      draggable={!locked}
      onClick={onClick}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        if (
          !game.paused &&
          game.status === "running" &&
          isWorkColumn(task.column) &&
          !task.assignedCharacterId &&
          !task.outsourcing
        ) {
          event.preventDefault();
        }
      }}
      onDragStart={(event) => onDragStart(event, task)}
      onDrop={(event) => onDropCharacter(event, task)}
    >
      <header>
        <span>{task.id}</span>
        <b>{task.kind}</b>
      </header>
      <strong>{task.title.replace(`${task.id}: `, "")}</strong>
      <div className="task-facts">
        <span>Clarity {task.clarity}</span>
        <span>Quality {task.quality}</span>
        <span>Bugs {task.bugs}</span>
        <span>Blast {task.blastRadius}</span>
      </div>
      <ReadinessBadge report={readiness} compact />
      <div className="subtask-summary">
        <span>Known work</span>
        <strong>{doneSubtaskCount}/{revealedSubtasks.length}</strong>
        <em>{openSubtasks.length} open</em>
      </div>
      <div className="subtask-chips">
        {openSubtasks.slice(0, 4).map((subtask) => (
          <span className={`chip ${subtask.importance}`} key={subtask.id}>
            {subtaskRoleLabel(subtask.role)}
          </span>
        ))}
        {hasHiddenWork ? <span className="chip hidden">unknown work</span> : null}
      </div>
      {!task.released && task.column !== "done" ? (
        <TinyBar label="Deadline" ratio={deadlineRatio} tone="deadline" />
      ) : null}
      {task.column === "done" && !task.released ? (
        <span className="queue-note">Reopen costs Trust -{DONE_REWORK_TRUST_COST}</span>
      ) : null}
      {assigned ? (
        <div className="work-chip">
          <span>{assigned.name} {currentWorkLabel(task)}</span>
          <div className="work-track">
            <i style={{ width: `${task.stageProgress}%` }} />
          </div>
        </div>
      ) : null}
      {task.outsourcing ? (
        <div className="work-chip outsourcing-work">
          <span>Outsource {outsourcingSubtask ? `-> ${subtaskRoleLabel(outsourcingSubtask.role)}` : ""}</span>
          <div className="work-track">
            <i style={{ width: `${task.outsourcing.progress}%` }} />
          </div>
        </div>
      ) : null}
      {cardStatus ? <span className="ready-chip">{cardStatus}</span> : null}
    </article>
  );
}

function TaskInspector({
  assigned,
  task,
}: {
  assigned: RtCharacter | null;
  task: RtTask;
}) {
  const readiness = releaseReadiness(task);
  return (
    <div className="task-inspector">
      <strong>{task.title}</strong>
      <div className="inspector-grid">
        <span>Column {COLUMN_LABELS[task.column]}</span>
        <span>Pressure {task.pressure}</span>
        <span>Complexity {task.complexity}</span>
        <span>Value {task.value}</span>
        <span>Clarity {task.clarity}</span>
        <span>Quality {task.quality}</span>
        <span>QA {task.testCoverage}</span>
        <span>Bugs {task.bugs}</span>
        <span>Blast {task.blastRadius}</span>
      </div>
      <ReadinessBadge report={readiness} />
      <SubtaskList task={task} />
      {task.column === "done" && !task.released ? (
        <p>Queued for release. Reopening costs Trust -{DONE_REWORK_TRUST_COST}.</p>
      ) : (
        <TinyBar label="Deadline" ratio={taskDeadlineRatio(task)} tone="deadline" />
      )}
      {assigned ? (
        <div className="current-work">
          <span>{assigned.name} is working</span>
          <TinyBar label="Progress" ratio={task.stageProgress / 100} tone="progress" />
        </div>
      ) : null}
      {task.outsourcing ? (
        <div className="current-work">
          <span>Outsource is working</span>
          <TinyBar label="Progress" ratio={task.outsourcing.progress / 100} tone="progress" />
        </div>
      ) : null}
      <p>{task.lastNote}</p>
      {task.postmortem.length > 0 ? (
        <div className="postmortem">
          <h3>Postmortem</h3>
          {task.postmortem.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SubtaskList({ task }: { task: RtTask }) {
  const revealedSubtasks = task.subtasks.filter((subtask) => subtask.revealed);
  const hasHiddenWork = task.subtasks.some((subtask) => !subtask.revealed && !subtask.done);
  return (
    <div className="subtask-list">
      <h3>Checklist</h3>
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
          <strong>{subtask.revealed ? subtask.title : "Unknown work"}</strong>
          <em>{subtaskRoleLabel(subtask.role)}</em>
          <b>{subtask.importance}</b>
        </div>
      ))}
      {hasHiddenWork ? (
        <div className="subtask-row hidden">
          <span>?</span>
          <strong>Unknown work</strong>
          <em>analysis needed</em>
          <b>unknown</b>
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

function ReadinessBadge({
  compact = false,
  report,
}: {
  compact?: boolean;
  report: RtReadinessReport;
}) {
  const reasons = compact ? report.reasons.slice(0, 2) : report.reasons;
  return (
    <div className={`readiness-box ${report.readiness} ${compact ? "compact" : ""}`}>
      <strong>{readinessLabel(report.readiness)}</strong>
      {reasons.length > 0 ? (
        <div>
          {reasons.map((reason) => (
            <span key={reason}>{riskReasonLabel(reason)}</span>
          ))}
        </div>
      ) : (
        <div>
          <span>No visible release risks</span>
        </div>
      )}
    </div>
  );
}

function effectTone(effect: string): "positive" | "negative" | "neutral" {
  if (effect.startsWith("debt +")) return "negative";
  if (effect.startsWith("debt -")) return "positive";
  if (/\s-[0-9]/.test(effect) || effect.startsWith("no ")) return "negative";
  if (/\s\+[0-9]/.test(effect) || effect.includes("reduced")) return "positive";
  return "neutral";
}

function formatSignedNumber(value: number): string {
  if (value > 0) return `+${value}`;
  return `${value}`;
}

function readinessLabel(readiness: RtReadinessReport["readiness"]): string {
  if (readiness === "clean") return "Clean";
  if (readiness === "risky") return "Risky";
  return "Dirty";
}

function riskReasonLabel(reason: RtRiskReason): string {
  switch (reason) {
    case "no_qa":
      return "No QA pass";
    case "no_sre":
      return "SRE safety missing";
    case "known_bug":
      return "Known bugs";
    case "low_clarity":
      return "Low clarity";
    case "critical_open":
      return "Critical work open";
    case "important_open":
      return "Important work open";
    case "deadline_pressure":
      return "Deadline pressure";
    case "blast_radius_high":
      return "High blast radius";
    case "blast_radius_uncovered":
      return "Failure impact high";
    case "changed_after_qa":
      return "Changed after QA";
    case "not_implemented":
      return "Implementation incomplete";
  }
}

function consequenceCauseLabel(
  cause: RtMorningReport["consequences"][number]["cause"],
): string {
  switch (cause) {
    case "known_bug":
      return "known bugs";
    case "changed_after_qa":
      return "changes after QA";
    case "no_qa":
      return "no QA pass";
    case "no_sre":
      return "missing SRE safety";
    case "critical_open":
      return "open critical work";
    case "important_open":
      return "open important work";
    case "low_clarity":
      return "low clarity";
    case "deadline_pressure":
      return "deadline pressure";
  }
}

function MetricBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
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
  tone: "queue" | "deadline" | "progress";
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

function EventItem({ event }: { event: RtEvent }) {
  return (
    <article className="event-item">
      <strong>{event.at} {event.title}</strong>
      <p>{event.body}</p>
      <div>
        {event.effects.slice(0, 4).map((effect) => (
          <span key={effect}>{effect}</span>
        ))}
      </div>
    </article>
  );
}

function LossReport({ report }: { report: NonNullable<RtGameState["lossReport"]> }) {
  return (
    <section className="panel loss-report">
      <h2>Why You Lost</h2>
      <strong>{report.headline}</strong>
      <p>{report.explanation}</p>
      <div className="loss-grid">
        <span>Trust {report.resourceSnapshot.trust}</span>
        <span>Clients {report.resourceSnapshot.clients}</span>
        <span>Debt {report.resourceSnapshot.debt}</span>
      </div>
      {report.lastMissedTasks.length > 0 ? (
        <>
          <h3>Recent misses</h3>
          {report.lastMissedTasks.slice(0, 4).map((event) => (
            <p key={`${event.at}-${event.title}`}>
              {event.at} {event.title} ({event.effects.join(", ")})
            </p>
          ))}
        </>
      ) : null}
      {report.lastBadReleases.length > 0 ? (
        <>
          <h3>Bad releases</h3>
          {report.lastBadReleases.slice(0, 3).map((event) => (
            <p key={`${event.at}-${event.title}`}>
              {event.at} {event.title} ({event.effects.join(", ")})
            </p>
          ))}
        </>
      ) : null}
      <h3>Read</h3>
      <p>{report.suggestion}</p>
    </section>
  );
}

function DebugPanel({ game }: { game: RtGameState }) {
  const snapshot = buildDebugSnapshot(game);
  return (
    <section className="panel debug-panel">
      <h2>Debug Trace</h2>
      <div className="debug-facts">
        <span>Status {snapshot.status}</span>
        <span>Events {snapshot.events.length}</span>
        <span>Tasks {snapshot.taskCount}</span>
        <span>Save {SAVE_SCHEMA_VERSION}</span>
        <span>Commit {APP_COMMIT}</span>
      </div>
      <p>
        Autosave uses <code>{AUTOSAVE_KEY}</code>. Snapshot writes to{" "}
        <code>.dtp-debug/latest-run.json</code>.
      </p>
      {game.lossReason ? <p>Stop reason: {game.lossReason}</p> : null}
      <button
        className="ghost-button"
        onClick={() => copyDebugSnapshot(game)}
        type="button"
      >
        Copy snapshot
      </button>
    </section>
  );
}

function setDragGhost(event: DragEvent<HTMLElement>, character: RtCharacter) {
  const ghost = document.createElement("div");
  ghost.className = "drag-ghost";
  ghost.textContent = `${character.name} -> task`;
  document.body.appendChild(ghost);
  event.dataTransfer.setDragImage(ghost, 24, 18);
  window.setTimeout(() => document.body.removeChild(ghost), 0);
}

function buildDebugSnapshot(game: RtGameState) {
  const tasks = Object.values(game.tasks);
  return {
    savedAt: new Date().toISOString(),
    seed: game.seed,
    status: game.paused && game.status === "running" ? "paused" : game.status,
    lossReason: game.lossReason,
    time: {
      clock: formatGameTime(game),
      elapsedRealMs: game.elapsedRealMs,
      elapsedGameMinutes: game.elapsedGameMinutes,
      day: game.day,
      quarter: game.quarter,
      dayInQuarter: game.dayInQuarter,
    },
    resources: game.resources,
    morningReport: game.morningReport,
    quarter: {
      value: game.quarterValue,
      goal: game.quarterGoal,
    },
    lossReport: game.lossReport,
    spawn: game.spawn,
    taskCount: tasks.length,
    board: Object.fromEntries(
      RT_COLUMNS.map((column) => [
        column,
        game.board[column].map((taskId) => summarizeTask(game.tasks[taskId])),
      ]),
    ),
    characters: Object.values(game.characters).map((character) => ({
      id: character.id,
      name: character.name,
      role: character.role,
      assignedTaskId: character.assignedTaskId,
      stamina: Math.round(character.stamina),
      burnout: Math.round(character.burnout),
      shockGameMinutes: Math.round(character.shockGameMinutes),
      exhaustedToday: character.exhaustedToday,
      specialty: character.specialty,
    })),
    activeAssignments: tasks
      .filter((task) => task.assignedCharacterId)
      .map((task) => ({
        taskId: task.id,
        taskTitle: task.title,
        column: task.column,
        characterId: task.assignedCharacterId,
        progress: Math.round(task.stageProgress),
      })),
    events: game.log,
  };
}

function summarizeTask(task: RtTask | undefined) {
  if (!task) return null;
  return {
    id: task.id,
    title: task.title,
    kind: task.kind,
    column: task.column,
    blastRadius: task.blastRadius,
    releaseReadiness: releaseReadiness(task),
    pressure: task.pressure,
    complexity: task.complexity,
    value: task.value,
    clarity: task.clarity,
    quality: task.quality,
    testCoverage: task.testCoverage,
    bugs: task.bugs,
    changedAfterQa: task.changedAfterQa,
    workDone: task.workDone,
    subtasks: task.subtasks,
    currentSubtaskId: task.currentSubtaskId,
    outsourcing: task.outsourcing,
    offRolePenalty: task.offRolePenalty,
    deadlineMs: Math.round(task.deadlineMs),
    stageProgress: Math.round(task.stageProgress),
    stageComplete: task.stageComplete,
    assignedCharacterId: task.assignedCharacterId,
    released: task.released,
    releaseScore: task.releaseScore,
    queuedDeadlineMs: task.queuedDeadlineMs,
    postmortem: task.postmortem,
    lastNote: task.lastNote,
  };
}

function currentWorkLabel(task: RtTask): string {
  const subtask = task.currentSubtaskId
    ? task.subtasks.find((candidate) => candidate.id === task.currentSubtaskId)
    : null;
  if (subtask) return `-> ${subtaskRoleLabel(subtask.role)}`;
  return task.assignedCharacterId ? "-> analysis" : "";
}

function subtaskRoleLabel(role: RtSubtask["role"]): string {
  if (role === "bugfix") return "bugfix";
  if (role === "design") return "design";
  return role;
}

function formatReleaseCountdown(game: RtGameState): string {
  const minutesUntil = Math.max(0, RELEASE_TRAIN_GAME_MINUTE - game.gameMinuteOfDay);
  const roundedMinutes = Math.max(0, Math.ceil(minutesUntil));
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function postDebugSnapshot(game: RtGameState, sessionId?: string) {
  const snapshot = buildDebugSnapshot(game);
  const body = JSON.stringify(snapshot, null, 2);
  window.localStorage.setItem("dtp.latestRun", body);
  fetch("/__dtp-debug-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  }).catch(() => {
    // The endpoint exists only in the local Vite dev server.
  });
  if (sessionId) {
    postBackendLog([createLogEntry(sessionId, "snapshot", "debug_snapshot", buildBackendSnapshot(snapshot))]);
  }
}

function buildBackendSnapshot(snapshot: ReturnType<typeof buildDebugSnapshot>) {
  return {
    savedAt: snapshot.savedAt,
    seed: snapshot.seed,
    status: snapshot.status,
    lossReason: snapshot.lossReason,
    time: snapshot.time,
    resources: snapshot.resources,
    morningReport: snapshot.morningReport,
    quarter: snapshot.quarter,
    spawn: snapshot.spawn,
    taskCount: snapshot.taskCount,
    boardCounts: Object.fromEntries(
      Object.entries(snapshot.board).map(([column, tasks]) => [
        column,
        tasks.filter(Boolean).length,
      ]),
    ),
    activeAssignments: snapshot.activeAssignments,
    characters: snapshot.characters.map((character) => ({
      id: character.id,
      name: character.name,
      role: character.role,
      assignedTaskId: character.assignedTaskId,
      stamina: character.stamina,
      burnout: character.burnout,
      exhaustedToday: character.exhaustedToday,
    })),
    visibleTasks: Object.fromEntries(
      Object.entries(snapshot.board).map(([column, tasks]) => [
        column,
        tasks.filter(Boolean).map((task) => ({
          id: task?.id,
          kind: task?.kind,
          blastRadius: task?.blastRadius,
          releaseReadiness: task?.releaseReadiness,
          deadlineMs: task?.deadlineMs,
          stageProgress: task?.stageProgress,
          assignedCharacterId: task?.assignedCharacterId,
          outsourcing: task?.outsourcing,
        })),
      ]),
    ),
    recentEvents: snapshot.events.slice(0, 12),
  };
}

function copyDebugSnapshot(game: RtGameState) {
  navigator.clipboard?.writeText(JSON.stringify(buildDebugSnapshot(game), null, 2));
}

function createSessionId(): string {
  return `dtp-${Date.now()}-${crypto.randomUUID?.() ?? Math.random().toString(16).slice(2)}`;
}

function createLogEntry(
  sessionId: string,
  kind: FrontendLogEntry["kind"],
  name: string,
  payload: unknown,
): FrontendLogEntry {
  return {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    sessionId,
    source: "dtp2-frontend",
    kind,
    name,
    payload,
  };
}

function logAction(sessionId: string, name: string, payload: unknown) {
  postBackendLog([createLogEntry(sessionId, "action", name, payload)]);
}

function gameEventKey(event: RtEvent): string {
  return `${event.at}|${event.type}|${event.title}|${event.body}|${event.effects.join(";")}`;
}

function postBackendLog(entries: FrontendLogEntry[]) {
  fetch(BACKEND_LOG_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entries }),
  }).catch(() => {
    // Backend is optional during UI-only work.
  });
}

function resetBackendLog(sessionId: string) {
  fetch(BACKEND_RESET_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  }).catch(() => {
    // Backend is optional during UI-only work.
  });
}
