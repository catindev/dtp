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
  createRealtimeState,
  formatGameTime,
  formatOverdueGameTime,
  getOutsourceTaskWorkStatus,
  isWorkColumn,
  lateReleaseReport,
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
  type RtOutsourceStatus,
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
const BACKEND_LOG_QUEUE_KEY = "dtp.backendLogQueue.v1";
const BACKEND_LOG_QUEUE_LIMIT = 1200;
const BACKEND_LOG_BATCH_SIZE = 80;
const BACKEND_LOG_FLUSH_INTERVAL_MS = 2500;

let backendFlushInFlight = false;
let backendFlushAgain = false;

interface FrontendLogEntry {
  id: string;
  clientCreatedAt: string;
  sessionId: string;
  source: "dtp2-frontend";
  kind: "action" | "game_event" | "snapshot";
  name: string;
  payload: unknown;
}

interface BackendLogQueue {
  version: 1;
  updatedAt: string;
  compactedEntries: number;
  droppedEntries: number;
  entries: FrontendLogEntry[];
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
  const [shakeTaskIds, setShakeTaskIds] = useState<Set<string>>(() => new Set());
  const [shakeColumnIds, setShakeColumnIds] = useState<Set<RtColumn>>(() => new Set());
  const [pauseShake, setPauseShake] = useState(false);
  const flashTimer = useRef<number | null>(null);
  const bounceTimers = useRef<Record<string, number>>({});
  const shakeTaskTimers = useRef<Record<string, number>>({});
  const shakeColumnTimers = useRef<Partial<Record<RtColumn, number>>>({});
  const pauseShakeTimer = useRef<number | null>(null);
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
      if (pauseShakeTimer.current) window.clearTimeout(pauseShakeTimer.current);
      clearBounceTimers();
      clearShakeTimers();
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
    if (game.paused && screen === "game" && game.status === "running" && !morningReport) {
      event.preventDefault();
      shakePauseButton();
      return;
    }
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
    if (game.paused && screen === "game" && game.status === "running" && !morningReport) {
      event.preventDefault();
      shakePauseButton();
      return;
    }
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
    if (game.paused && screen === "game" && game.status === "running" && !morningReport) {
      event.preventDefault();
      shakePauseButton();
      return;
    }
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
    const activeDrag = activeDragRef.current;
    if (column === "released") {
      shakeColumn(column);
      activeDragRef.current = null;
      return;
    }
    const taskId =
      event.dataTransfer.getData("application/dtp-task") ||
      (activeDrag?.type === "task" ? activeDrag.taskId : "");
    if (!taskId) {
      if (activeDrag) shakeColumn(column);
      activeDragRef.current = null;
      return;
    }
    moveDroppedTask(taskId, column);
  }

  function moveDroppedTask(taskId: string, column: RtColumn, rejectTargetTaskId?: string) {
    const fromColumn = game.tasks[taskId]?.column;
    const task = game.tasks[taskId];
    const moveCheck = canMoveRealtimeTask(game, taskId, column);

    if (!moveCheck.allowed) {
      if (rejectTargetTaskId) {
        shakeTask(rejectTargetTaskId);
      } else {
        shakeColumn(column);
      }
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
      moveDroppedTask(draggedTaskId, task.column, task.id);
      return;
    }

    const outsourcePayload =
      event.dataTransfer.getData("application/dtp-outsourcing") ||
      (activeDrag?.type === "outsourcing" ? "outsourcing" : "");
    if (outsourcePayload) {
      const outsourceStatus = getOutsourceTaskWorkStatus(game, task.id);
      const canOutsource = outsourceStatus.allowed;
      if (canOutsource) {
        mutate((draft) => {
          if (outsourceTaskWork(draft, task.id)) {
            setSelectedTaskId(task.id);
          }
        });
      } else {
        shakeTask(task.id);
      }
      logAction(
        sessionIdRef.current,
        canOutsource ? "outsourcing_dropped_on_task" : "outsourcing_drop_rejected",
        {
          taskId: task.id,
          taskTitle: task.title,
          column: task.column,
          budget: game.resources.budget,
          reason: outsourceStatusText(outsourceStatus),
          blocker: outsourceStatus.reason,
          neededBudget: outsourceStatus.neededBudget,
          subtaskRole: outsourceStatus.subtask?.role,
          subtaskImportance: outsourceStatus.subtask?.importance,
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
    if (!characterId) return;
    const character = game.characters[characterId];
    const canAssign = canAssignCharacterToTask(game, characterId, task.id);

    if (canAssign) {
      mutate((draft) => {
        if (assignCharacterToTask(draft, characterId, task.id)) {
          setSelectedTaskId(task.id);
        }
      });
    } else {
      shakeTask(task.id);
    }
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
        reason: canAssign ? "assigned" : characterDropRejectReason(characterId, task),
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

  function clearShakeTimers() {
    for (const timer of Object.values(shakeTaskTimers.current)) {
      window.clearTimeout(timer);
    }
    for (const timer of Object.values(shakeColumnTimers.current)) {
      if (timer) window.clearTimeout(timer);
    }
    shakeTaskTimers.current = {};
    shakeColumnTimers.current = {};
  }

  function shakeTask(taskId: string) {
    setShakeTaskIds((current) => {
      const next = new Set(current);
      next.delete(taskId);
      return next;
    });
    if (shakeTaskTimers.current[taskId]) {
      window.clearTimeout(shakeTaskTimers.current[taskId]);
    }
    window.requestAnimationFrame(() => {
      setShakeTaskIds((current) => new Set(current).add(taskId));
      shakeTaskTimers.current[taskId] = window.setTimeout(() => {
        setShakeTaskIds((current) => {
          const next = new Set(current);
          next.delete(taskId);
          return next;
        });
        delete shakeTaskTimers.current[taskId];
      }, 420);
    });
  }

  function shakeColumn(column: RtColumn) {
    setShakeColumnIds((current) => {
      const next = new Set(current);
      next.delete(column);
      return next;
    });
    if (shakeColumnTimers.current[column]) {
      window.clearTimeout(shakeColumnTimers.current[column]);
    }
    window.requestAnimationFrame(() => {
      setShakeColumnIds((current) => new Set(current).add(column));
      shakeColumnTimers.current[column] = window.setTimeout(() => {
        setShakeColumnIds((current) => {
          const next = new Set(current);
          next.delete(column);
          return next;
        });
        delete shakeColumnTimers.current[column];
      }, 420);
    });
  }

  function shakePauseButton() {
    setPauseShake(false);
    if (pauseShakeTimer.current) {
      window.clearTimeout(pauseShakeTimer.current);
    }
    window.requestAnimationFrame(() => {
      setPauseShake(true);
      pauseShakeTimer.current = window.setTimeout(() => {
        setPauseShake(false);
        pauseShakeTimer.current = null;
      }, 420);
    });
  }

  function characterDropRejectReason(characterId: string, task: RtTask): string {
    const character = game.characters[characterId];
    if (!character) return "character missing";
    if (character.assignedTaskId) return "character already busy";
    if (character.exhaustedToday) return "character exhausted";
    if (!isWorkColumn(task.column)) return "wrong column";
    if (task.assignedCharacterId || task.outsourcing) return "task already in work";
    return "no matching visible work";
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
          <span className="session-id" title={sessionIdRef.current}>
            Session {formatSessionId(sessionIdRef.current)}
          </span>
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
          <span className="stat-pill primary">Trust {game.resources.trust}</span>
          <span className="stat-pill primary">Clients {game.resources.clients}</span>
          <span className="stat-pill value">Value {game.resources.value}</span>
          <span className="stat-pill muted">Debt {game.resources.debt}</span>
          <span className="stat-pill muted">Budget {game.resources.budget}</span>
          <span className="stat-pill muted">Boost {game.resources.processBoost}%</span>
        </div>
        <div className="header-actions">
          <button
            className={`pause-button ${pauseShake ? "reject-shake" : ""}`}
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
                    <MetricBar label="Stamina" tone="stamina" value={character.stamina} />
                    {character.burnout > 0 ? (
                      <span className="burnout-badge">Burnout {Math.round(character.burnout)}</span>
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
                  shakeColumnIds.has(column) ? "reject-shake" : "",
                ].join(" ")}
                key={column}
                onDragOver={allowDrop}
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
                      reject={shakeTaskIds.has(task.id)}
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
                <TaskInspector
                  assigned={selectedAssigned}
                  canCancelWork={Boolean(selectedAssigned && !morningReport)}
                  cancelDisabled={interactionBlocked}
                  onCancelWork={cancelSelectedTask}
                  task={selectedTask}
                />
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
  const summary = report.daySummary;

  return (
    <section className="morning-report-page">
      <div className="morning-report-hero">
        <div>
          <span>Q{report.quarter} / Day {report.day} / {report.at}</span>
          <h1>Morning Briefing</h1>
          <p>
            {report.empty
              ? "Nothing shipped or expired yesterday. Today's work starts from the existing backlog."
              : `${report.shippedTaskIds.length} shipped, ${report.missedTaskIds.length} missed. Today's backlog reflects the consequences.`}
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

      <div className="morning-flow-strip">
        <span>Clean {summary.releasedClean}</span>
        <span>Risky {summary.releasedRisky}</span>
        <span>Dirty {summary.releasedDirty}</span>
        <span>Missed {summary.missedBacklog + summary.missedInProgress}</span>
        <span>Fallout +{summary.falloutCreated}</span>
        <span>Unresolved {summary.unresolvedFallout}</span>
      </div>

      <section className="morning-report-section">
        <h2>Consequences</h2>
        {report.consequences.length === 0 ? (
          <p className="empty">No visible release or missed-work fallout hit the team this morning.</p>
        ) : (
          <div className="morning-consequence-list">
            {report.consequences.map((consequence) => (
              <article className="morning-consequence-row" key={consequence.id}>
                <header>
                  <div>
                    <span>{consequence.sourceTaskId}</span>
                    <strong>{consequence.symptom}</strong>
                  </div>
                  <b>
                    {consequence.terminal
                      ? "terminal"
                      : consequence.generatedTaskId ?? consequenceFallbackLabel(consequence)}
                  </b>
                </header>
                <p>{consequenceText(consequence)}</p>
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
              const readiness = releaseReadiness(task);
              const releaseEffects = releaseEffectsForTask(task, releaseEvent, readiness);
              return (
                <article className="release-task-row" key={task.id}>
                  <header>
                    <div>
                      <span>{task.id}</span>
                      <strong>{task.title.replace(`${task.id}: `, "")}</strong>
                    </div>
                    <b>{task.kind}</b>
                  </header>
                  <ReadinessBadge report={readiness} />
                  <div className="release-effect-strip">
                    {releaseEffects.map((effect) => (
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
  reject,
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
  const urgent = !task.released && task.column !== "done" && deadlineRatio <= 0.18;
  const dragBlocked =
    Boolean(task.assignedCharacterId) ||
    Boolean(task.outsourcing) ||
    game.status !== "running" ||
    task.released;
  const locked =
    Boolean(task.assignedCharacterId) ||
    Boolean(task.outsourcing) ||
    game.paused ||
    game.status !== "running" ||
    task.released;
  const needsAttention =
    task.stageComplete && task.column === "inProgress" && !task.assignedCharacterId && !task.released;
  const readyForDone = needsAttention && taskReadyForDone(task);
  const neededRoles = taskNeededRoleChips(task);
  const cardStatus = task.released
    ? "Released"
    : task.column === "done"
      ? "Ships 18:00"
      : null;
  const readinessClass = taskCardReadinessClass(task, readiness, readyForDone);
  const title = task.title.replace(`${task.id}: `, "");

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
          <b>{task.kind}</b>
        </div>
        <i
          aria-label={`Impact ${blastRadiusLabel(task.blastRadius)}`}
          className={`impact-dot ${task.blastRadius}`}
          title={`Impact ${blastRadiusLabel(task.blastRadius)}`}
        />
      </header>
      <strong className="task-title">{title}</strong>
      <div className="task-scan-row">
        <ReadinessBadge report={readiness} compact />
        {late.valuePenaltyPercent > 0 ? (
          <span className="late-chip">Late -{late.valuePenaltyPercent}%</span>
        ) : null}
        {cardStatus ? <span className="card-status-chip">{cardStatus}</span> : null}
      </div>
      {neededRoles.length > 0 ? (
        <div className="role-chip-row" aria-label="Needed roles">
          {neededRoles.map((role) => (
            <span className={`role-chip ${role.kind}`} key={role.key}>
              {role.label}
            </span>
          ))}
        </div>
      ) : null}
      {!task.released && task.column !== "done" ? (
        <TinyBar label="Deadline" ratio={deadlineRatio} tone={deadlineTone(deadlineRatio)} />
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
    </article>
  );
}

function TaskInspector({
  assigned,
  canCancelWork,
  cancelDisabled,
  onCancelWork,
  task,
}: {
  assigned: RtCharacter | null;
  canCancelWork: boolean;
  cancelDisabled: boolean;
  onCancelWork: () => void;
  task: RtTask;
}) {
  const readiness = releaseReadiness(task);
  const late = lateReleaseReport(task);
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
        <span>Impact {blastRadiusLabel(task.blastRadius)}</span>
        {late.valuePenaltyPercent > 0 ? (
          <span>Late {formatOverdueGameTime(late.overdueMs)} / Value -{late.valuePenaltyPercent}%</span>
        ) : null}
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
      {canCancelWork ? (
        <button
          className="cancel-button inspector-cancel-button"
          disabled={cancelDisabled}
          onClick={onCancelWork}
          type="button"
        >
          Отменить задачу
        </button>
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
  report,
}: {
  compact?: boolean;
  report: RtReadinessReport;
}) {
  const reasons = compact ? report.reasons.slice(0, 2) : report.reasons;
  return (
    <div className={`readiness-box ${report.readiness} ${compact ? "compact" : ""}`}>
      <strong>{readinessLabel(report.readiness)}</strong>
      {!compact && reasons.length > 0 ? (
        <div>
          {reasons.map((reason) => (
            <span key={reason}>{riskReasonLabel(reason)}</span>
          ))}
        </div>
      ) : !compact ? (
        <div>
          <span>No visible release risks</span>
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

function outsourceStatusText(status: RtOutsourceStatus): string {
  const subtask = status.subtask;
  const work = subtask ? `${subtaskRoleLabel(subtask.role)} ${subtask.importance}` : "known work";
  switch (status.reason) {
    case "ready":
      return `Can take ${work} for Budget ${status.cost}.`;
    case "insufficient_budget":
      return `Need Budget ${status.neededBudget} for ${work}; current ${status.currentBudget}.`;
    case "needs_analysis":
      return "Needs analysis first: no visible open work.";
    case "no_open_work":
      return "No visible open work for outsourcing.";
    case "task_busy":
      return "Task is already in work.";
    case "task_released":
      return "Task is already released.";
    case "wrong_column":
      return "Move task to In Progress first.";
    case "task_missing":
      return "Task is no longer on the board.";
  }
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
      return "High impact area";
    case "blast_radius_uncovered":
      return "High impact not protected";
    case "changed_after_qa":
      return "Changed after QA";
    case "not_implemented":
      return "Implementation incomplete";
  }
}

function blastRadiusLabel(blastRadius: RtTask["blastRadius"]): string {
  if (blastRadius === "high") return "High";
  if (blastRadius === "medium") return "Medium";
  return "Low";
}

function consequenceText(
  consequence: RtMorningReport["consequences"][number],
): string {
  if (consequence.source === "release") {
    return `Because yesterday's ${consequence.sourceTaskId} shipped with ${consequenceCauseLabel(
      consequence.cause,
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
): string {
  if (consequence.effects.includes("minor hit")) return "hit";
  return "blocked";
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
    case "ignored_work":
      return "ignored work";
    case "missed_deadline":
      return "missed deadline";
    case "terminal_chain":
      return "terminal fallout";
  }
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

function buildDebugSnapshot(game: RtGameState, sessionId?: string) {
  const tasks = Object.values(game.tasks);
  const backendQueue = readBackendLogQueue();
  return {
    savedAt: new Date().toISOString(),
    sessionId: sessionId ?? null,
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
    logger: {
      backendUrl: BACKEND_LOG_URL,
      queuedEntries: backendQueue.entries.length,
      compactedEntries: backendQueue.compactedEntries,
      droppedEntries: backendQueue.droppedEntries,
    },
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
    overdueMs: Math.round(task.overdueMs),
    lateRelease: lateReleaseReport(task),
    stageProgress: Math.round(task.stageProgress),
    stageComplete: task.stageComplete,
    assignedCharacterId: task.assignedCharacterId,
    released: task.released,
    rootCauseTaskId: task.rootCauseTaskId,
    sourceTaskId: task.sourceTaskId,
    chainDepth: task.chainDepth,
    resolved: task.resolved,
    resolution: task.resolution,
    resolutionDay: task.resolutionDay,
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

function taskNeededRoleChips(task: RtTask): Array<{
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
    label: subtaskRoleLabel(role),
  }));
  const hasHiddenOpenWork = task.subtasks.some((subtask) => !subtask.revealed && !subtask.done);
  if (hasHiddenOpenWork) {
    chips.push({
      key: "unknown",
      kind: "unknown",
      label: "unknown",
    });
  }
  return chips;
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
  const snapshot = buildDebugSnapshot(game, sessionId);
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
    sessionId: snapshot.sessionId,
    seed: snapshot.seed,
    status: snapshot.status,
    lossReason: snapshot.lossReason,
    time: snapshot.time,
    resources: snapshot.resources,
    morningReport: snapshot.morningReport,
    daySummary: snapshot.morningReport?.daySummary ?? null,
    quarter: snapshot.quarter,
    spawn: snapshot.spawn,
    taskCount: snapshot.taskCount,
    logger: snapshot.logger,
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
          rootCauseTaskId: task?.rootCauseTaskId,
          chainDepth: task?.chainDepth,
          resolved: task?.resolved,
          resolution: task?.resolution,
          deadlineMs: task?.deadlineMs,
          overdueMs: task?.overdueMs,
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

function formatSessionId(sessionId: string): string {
  const [prefix, timestamp, ...rest] = sessionId.split("-");
  const suffix = rest.join("-").slice(-8);
  if (!prefix || !timestamp || !suffix) return sessionId;
  return `${prefix}-${timestamp}-${suffix}`;
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
    clientCreatedAt: new Date().toISOString(),
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
  enqueueBackendLog(entries);
  flushBackendLogQueue();
}

function flushBackendLogQueue(): void {
  if (backendFlushInFlight) {
    backendFlushAgain = true;
    return;
  }

  const queue = readBackendLogQueue();
  if (queue.entries.length === 0) return;

  const batch = queue.entries.slice(0, BACKEND_LOG_BATCH_SIZE);
  const sentIds = new Set(batch.map((entry) => entry.id));
  backendFlushInFlight = true;

  fetch(BACKEND_LOG_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entries: batch }),
  })
    .then((response) => {
      if (!response.ok) throw new Error(`backend log rejected: ${response.status}`);
      removeBackendLogEntries(sentIds);
    })
    .catch(() => {
      // Keep the local queue. The next interval or online event will retry.
    })
    .finally(() => {
      backendFlushInFlight = false;
      const hasMore = readBackendLogQueue().entries.length > 0;
      if (backendFlushAgain || hasMore) {
        backendFlushAgain = false;
        window.setTimeout(flushBackendLogQueue, hasMore ? 120 : BACKEND_LOG_FLUSH_INTERVAL_MS);
      }
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

function enqueueBackendLog(entries: FrontendLogEntry[]): void {
  if (entries.length === 0) return;
  const queue = readBackendLogQueue();
  const compacted = compactBackendQueueEntries([...queue.entries, ...entries]);
  writeBackendLogQueue({
    version: 1,
    updatedAt: new Date().toISOString(),
    compactedEntries: queue.compactedEntries + compacted.compactedEntries,
    droppedEntries: queue.droppedEntries + compacted.droppedEntries,
    entries: compacted.entries,
  });
}

function removeBackendLogEntries(sentIds: Set<string>): void {
  const queue = readBackendLogQueue();
  const entries = queue.entries.filter((entry) => !sentIds.has(entry.id));
  writeBackendLogQueue({
    ...queue,
    updatedAt: new Date().toISOString(),
    entries,
  });
}

function compactBackendQueueEntries(entries: FrontendLogEntry[]): {
  entries: FrontendLogEntry[];
  compactedEntries: number;
  droppedEntries: number;
} {
  const nonSnapshots: FrontendLogEntry[] = [];
  const latestSnapshotBySession = new Map<string, FrontendLogEntry>();
  const seenIds = new Set<string>();
  let duplicateEntries = 0;
  let snapshotEntries = 0;

  for (const entry of entries) {
    if (seenIds.has(entry.id)) {
      duplicateEntries += 1;
      continue;
    }
    seenIds.add(entry.id);

    if (entry.kind === "snapshot") {
      snapshotEntries += 1;
      latestSnapshotBySession.set(entry.sessionId, entry);
    } else {
      nonSnapshots.push(entry);
    }
  }

  const snapshots = Array.from(latestSnapshotBySession.values());
  const maxNonSnapshots = Math.max(0, BACKEND_LOG_QUEUE_LIMIT - snapshots.length);
  const keptNonSnapshots = nonSnapshots.slice(-maxNonSnapshots);
  const droppedNonSnapshots = Math.max(0, nonSnapshots.length - keptNonSnapshots.length);
  const droppedSnapshots = Math.max(0, snapshotEntries - snapshots.length);

  return {
    entries: [...keptNonSnapshots, ...snapshots],
    compactedEntries: duplicateEntries + droppedSnapshots,
    droppedEntries: droppedNonSnapshots,
  };
}

function readBackendLogQueue(): BackendLogQueue {
  const storage = getBrowserStorage();
  if (!storage) return emptyBackendLogQueue();
  const raw = storage.getItem(BACKEND_LOG_QUEUE_KEY);
  if (!raw) return emptyBackendLogQueue();

  try {
    const parsed = JSON.parse(raw) as Partial<BackendLogQueue>;
    if (
      parsed.version !== 1 ||
      typeof parsed.updatedAt !== "string" ||
      typeof parsed.droppedEntries !== "number" ||
      !Array.isArray(parsed.entries)
    ) {
      storage.removeItem(BACKEND_LOG_QUEUE_KEY);
      return emptyBackendLogQueue();
    }

    return {
      version: 1,
      updatedAt: parsed.updatedAt,
      compactedEntries:
        typeof parsed.compactedEntries === "number" ? parsed.compactedEntries : 0,
      droppedEntries: parsed.droppedEntries,
      entries: parsed.entries.filter(isFrontendLogEntry),
    };
  } catch {
    storage.removeItem(BACKEND_LOG_QUEUE_KEY);
    return emptyBackendLogQueue();
  }
}

function writeBackendLogQueue(queue: BackendLogQueue): void {
  const storage = getBrowserStorage();
  if (!storage) return;

  try {
    storage.setItem(BACKEND_LOG_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    const compacted = compactBackendQueueEntries(queue.entries.slice(-Math.floor(BACKEND_LOG_QUEUE_LIMIT / 2)));
    const halfQueueDrop = Math.max(0, queue.entries.length - Math.floor(BACKEND_LOG_QUEUE_LIMIT / 2));
    try {
      storage.setItem(
        BACKEND_LOG_QUEUE_KEY,
        JSON.stringify({
          ...queue,
          updatedAt: new Date().toISOString(),
          compactedEntries: queue.compactedEntries + compacted.compactedEntries,
          droppedEntries: queue.droppedEntries + halfQueueDrop + compacted.droppedEntries,
          entries: compacted.entries,
        }),
      );
    } catch {
      // If localStorage is full or unavailable, diagnostics cannot be persisted.
    }
  }
}

function emptyBackendLogQueue(): BackendLogQueue {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    compactedEntries: 0,
    droppedEntries: 0,
    entries: [],
  };
}

function isFrontendLogEntry(value: unknown): value is FrontendLogEntry {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<FrontendLogEntry>;
  return (
    typeof record.id === "string" &&
    typeof record.clientCreatedAt === "string" &&
    typeof record.sessionId === "string" &&
    record.source === "dtp2-frontend" &&
    (record.kind === "action" || record.kind === "game_event" || record.kind === "snapshot") &&
    typeof record.name === "string"
  );
}

function getBrowserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
