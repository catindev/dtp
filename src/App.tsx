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
  canOutsourceTaskWork,
  createRealtimeState,
  formatGameTime,
  isWorkColumn,
  moveRealtimeTask,
  normalizeRealtimeState,
  outsourceTaskWork,
  releaseScore,
  taskDeadlineRatio,
  tickRealtime,
  type RtCharacter,
  type RtColumn,
  type RtEvent,
  type RtGameState,
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
type ReleaseCardPhase = "release-launching" | "release-landed";

interface ReleaseAnimationTask {
  id: string;
  title: string;
  effects: string[];
}

interface ReleaseAnimationState {
  tasks: ReleaseAnimationTask[];
  activeIndex: number;
  visibleReleasedCount: number;
  day: number;
  quarter: number;
}

type ActiveDrag =
  | { type: "task"; taskId: string }
  | { type: "character"; characterId: string }
  | { type: "outsourcing" }
  | null;

const RELEASE_CARD_ANIMATION_MS = 920;
const RELEASE_CARD_LAND_MS = 560;
const RELEASE_WRAPUP_MS = 760;

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
  const [releaseAnimation, setReleaseAnimation] = useState<ReleaseAnimationState | null>(null);
  const flashTimer = useRef<number | null>(null);
  const bounceTimers = useRef<Record<string, number>>({});
  const autosaveTimer = useRef<number | null>(null);
  const releaseAnimationTimers = useRef<number[]>([]);
  const releaseAnimationRef = useRef<ReleaseAnimationState | null>(null);
  const seenReleasedIdsRef = useRef(new Set(game.board.released));
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
  const interactionBlocked =
    screen !== "game" || game.paused || game.status !== "running" || Boolean(releaseAnimation);

  useEffect(() => {
    if (screen !== "game") return;
    const id = window.setInterval(() => {
      setGame((current) => {
        const draft = structuredClone(current) as RtGameState;
        const normalized = normalizeRealtimeState(draft);
        if (releaseAnimationRef.current) return normalized ? draft : current;
        if (draft.paused || draft.status !== "running") return normalized ? draft : current;
        tickRealtime(draft, TICK_MS);
        return draft;
      });
    }, TICK_MS);

    return () => window.clearInterval(id);
  }, [screen]);

  useEffect(() => {
    releaseAnimationRef.current = releaseAnimation;
  }, [releaseAnimation]);

  useEffect(
    () => () => {
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
      clearReleaseAnimationTimers();
      clearBounceTimers();
    },
    [],
  );

  useEffect(() => {
    latestGameRef.current = game;
  }, [game]);

  useEffect(() => {
    if (screen !== "game") return;
    const nextReleasedIds = new Set(game.board.released);
    const freshIds = game.board.released.filter((taskId) => !seenReleasedIdsRef.current.has(taskId));
    seenReleasedIdsRef.current = nextReleasedIds;

    if (freshIds.length === 0) return;
    startReleaseAnimation(
      freshIds.map((taskId) => ({
        id: taskId,
        title: game.tasks[taskId]?.title.replace(`${taskId}: `, "") ?? taskId,
        effects: releaseEffectsForTask(game, taskId),
      })),
    );
  }, [game.board.released, game.tasks, screen]);

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
        releaseAnimationRef.current
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
    seenReleasedIdsRef.current = new Set(next.board.released);
    activeDragRef.current = null;
    clearReleaseAnimationTimers();
    clearBounceTimers();
    releaseAnimationRef.current = null;
    setReleaseAnimation(null);
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
    if (interactionBlocked || character.assignedTaskId) {
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
    const fromColumn = game.tasks[taskId]?.column;

    mutate((draft) => {
      const moved = moveRealtimeTask(draft, taskId, column);
      if (moved) setSelectedTaskId(taskId);
    });
    logAction(sessionIdRef.current, "task_dropped_on_column", {
      taskId,
      fromColumn,
      toColumn: column,
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
          reason: canOutsource ? "outsourced" : "no budget or open work",
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

  function clearReleaseAnimationTimers() {
    for (const timer of releaseAnimationTimers.current) {
      window.clearTimeout(timer);
    }
    releaseAnimationTimers.current = [];
  }

  function updateReleaseAnimation(
    updater: (current: ReleaseAnimationState) => ReleaseAnimationState,
  ) {
    setReleaseAnimation((current) => {
      if (!current) return current;
      const next = updater(current);
      releaseAnimationRef.current = next;
      return next;
    });
  }

  function finishReleaseAnimation() {
    clearReleaseAnimationTimers();
    releaseAnimationRef.current = null;
    setReleaseAnimation(null);
  }

  function startReleaseAnimation(tasks: ReleaseAnimationTask[]) {
    clearReleaseAnimationTimers();
    if (tasks.length === 0) return;

    const initial = {
      tasks,
      activeIndex: 0,
      visibleReleasedCount: 0,
      day: Math.max(1, game.day - 1),
      quarter: releaseQuarterForAnimation(game),
    };
    releaseAnimationRef.current = initial;
    setReleaseAnimation(initial);
    logAction(sessionIdRef.current, "release_animation_started", {
      taskIds: tasks.map((task) => task.id),
      gameTime: "18:00",
    });

    for (let index = 0; index < tasks.length; index += 1) {
      releaseAnimationTimers.current.push(
        window.setTimeout(() => {
          updateReleaseAnimation((current) => ({
            ...current,
            activeIndex: index,
            visibleReleasedCount: Math.min(current.visibleReleasedCount, index),
          }));
        }, index * RELEASE_CARD_ANIMATION_MS),
      );
      releaseAnimationTimers.current.push(
        window.setTimeout(() => {
          updateReleaseAnimation((current) => ({
            ...current,
            activeIndex: index,
            visibleReleasedCount: Math.max(current.visibleReleasedCount, index + 1),
          }));
        }, index * RELEASE_CARD_ANIMATION_MS + RELEASE_CARD_LAND_MS),
      );
    }

    releaseAnimationTimers.current.push(
      window.setTimeout(
        finishReleaseAnimation,
        tasks.length * RELEASE_CARD_ANIMATION_MS + RELEASE_WRAPUP_MS,
      ),
    );
  }

  const selectedAssigned = selectedTask?.assignedCharacterId
    ? game.characters[selectedTask.assignedCharacterId]
    : null;
  const releaseCountdown = formatReleaseCountdown(game);
  const currentReleaseTask = releaseAnimation?.tasks[releaseAnimation.activeIndex] ?? null;
  const clockText = releaseAnimation ? "18:00" : formatGameTime(game);
  const displayedDay = releaseAnimation?.day ?? game.day;
  const displayedQuarter = releaseAnimation?.quarter ?? game.quarter;

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
        releaseAnimation ? "code-freeze" : "",
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
            {releaseAnimation
              ? `Releasing ${Math.min(
                  releaseAnimation.visibleReleasedCount + 1,
                  releaseAnimation.tasks.length,
                )}/${releaseAnimation.tasks.length}`
              : `Release in ${releaseCountdown} / Done ${game.board.done.length}`}
          </span>
        </div>
        <div className="stat-strip">
          <span className={`status-pill ${releaseAnimation ? "code-freeze" : game.status}`}>
            {releaseAnimation
              ? "CODE FREEZE"
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
          {selectedAssigned ? (
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
            disabled={game.status !== "running"}
            onClick={togglePause}
            type="button"
          >
            {game.status !== "running" ? "Stopped" : game.paused ? "Resume" : "Pause"}
          </button>
          <button className="ghost-button" onClick={newRun} type="button">
            New run
          </button>
        </div>
      </header>

      {releaseAnimation ? (
        <section className="code-freeze-panel">
          <div>
            <strong>Code Freeze</strong>
            <span>
              Shipping {currentReleaseTask?.id ?? ""} to Released
            </span>
          </div>
          <div className="release-effect-strip">
            {(currentReleaseTask?.effects ?? []).slice(0, 6).map((effect) => (
              <span className={`release-effect ${effectTone(effect)}`} key={effect}>
                {effect}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {game.status !== "running" ? (
        <section className="run-banner">
          <strong>{game.lossReport?.headline ?? "Игра остановилась"}</strong>
          <span>{game.lossReport?.explanation ?? game.lossReason}</span>
        </section>
      ) : null}

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
                  className={
                    character.assignedTaskId ? "character busy" : "character"
                  }
                  draggable={!interactionBlocked && !character.assignedTaskId}
                  key={character.id}
                  onDragEnd={finishDrag}
                  onDragStart={(event) => beginCharacterDrag(event, character)}
                >
                  <div>
                    <strong>{character.name}</strong>
                    <span>{character.role}</span>
                  </div>
                  <div className="character-state">
                    {character.assignedTaskId ? (
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
                        <span>{assignedTask.id} {currentWorkLabel(assignedTask)}</span>
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
              {displayTaskIdsForColumn(game, column, releaseAnimation).map((taskId) => {
                const task = game.tasks[taskId];
                if (!task) return null;
                return (
                  <TaskCard
                    attention={bounceTaskIds.has(task.id)}
                    flash={flashTaskId === task.id}
                    frozen={Boolean(releaseAnimation)}
                    game={game}
                    key={task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                    onDragEnd={finishDrag}
                    onDragStart={beginTaskDrag}
                    onDropCharacter={dropOnTask}
                    releasePhase={releasePhaseForTask(task.id, column, releaseAnimation)}
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
                game={game}
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
    </main>
  );
}

function TaskCard({
  attention,
  flash,
  frozen,
  game,
  onClick,
  onDragEnd,
  onDragStart,
  onDropCharacter,
  releasePhase,
  selected,
  task,
}: {
  attention: boolean;
  flash: boolean;
  frozen: boolean;
  game: RtGameState;
  onClick: () => void;
  onDragEnd: () => void;
  onDragStart: (event: DragEvent<HTMLElement>, task: RtTask) => void;
  onDropCharacter: (event: DragEvent<HTMLElement>, task: RtTask) => void;
  releasePhase?: ReleaseCardPhase;
  selected: boolean;
  task: RtTask;
}) {
  const assigned = task.assignedCharacterId
    ? game.characters[task.assignedCharacterId]
    : null;
  const deadlineRatio = taskDeadlineRatio(task);
  const openSubtasks = task.subtasks.filter((subtask) => subtask.revealed && !subtask.done);
  const doneSubtaskCount = task.subtasks.filter((subtask) => subtask.done).length;
  const hiddenCount = task.subtasks.filter((subtask) => !subtask.revealed && !subtask.done).length;
  const urgent = !task.released && task.column !== "done" && deadlineRatio <= 0.18;
  const locked =
    frozen ||
    Boolean(task.assignedCharacterId) ||
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
        ? "Ready for Done"
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
        releasePhase ?? "",
      ].join(" ")}
      draggable={!locked}
      onClick={onClick}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        if (
          !game.paused &&
          game.status === "running" &&
          isWorkColumn(task.column) &&
          !task.assignedCharacterId
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
      </div>
      <div className="subtask-summary">
        <span>Subtasks</span>
        <strong>{doneSubtaskCount}/{task.subtasks.length}</strong>
        <em>{openSubtasks.length + hiddenCount} open</em>
      </div>
      <div className="subtask-chips">
        {openSubtasks.slice(0, 4).map((subtask) => (
          <span className={`chip ${subtask.importance}`} key={subtask.id}>
            {subtaskRoleLabel(subtask.role)}
          </span>
        ))}
        {hiddenCount > 0 ? <span className="chip hidden">unknown x{hiddenCount}</span> : null}
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
      {cardStatus ? <span className="ready-chip">{cardStatus}</span> : null}
    </article>
  );
}

function TaskInspector({
  assigned,
  game,
  task,
}: {
  assigned: RtCharacter | null;
  game: RtGameState;
  task: RtTask;
}) {
  const score = task.released ? task.releaseScore : releaseScore(game, task);
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
        <span>Release score {score ?? 0}</span>
      </div>
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
  return (
    <div className="subtask-list">
      <h3>Checklist</h3>
      {task.subtasks.map((subtask) => (
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
    </div>
  );
}

function displayTaskIdsForColumn(
  game: RtGameState,
  column: RtColumn,
  releaseAnimation: ReleaseAnimationState | null,
): string[] {
  if (!releaseAnimation) return game.board[column];

  const releaseIds = new Set(releaseAnimation.tasks.map((task) => task.id));
  if (column === "done") {
    return [
      ...releaseAnimation.tasks
        .slice(releaseAnimation.visibleReleasedCount)
        .map((task) => task.id),
      ...game.board.done.filter((taskId) => !releaseIds.has(taskId)),
    ];
  }

  if (column === "released") {
    return [
      ...releaseAnimation.tasks
        .slice(0, releaseAnimation.visibleReleasedCount)
        .map((task) => task.id),
      ...game.board.released.filter((taskId) => !releaseIds.has(taskId)),
    ];
  }

  return game.board[column];
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

function releasePhaseForTask(
  taskId: string,
  column: RtColumn,
  releaseAnimation: ReleaseAnimationState | null,
): ReleaseCardPhase | undefined {
  if (!releaseAnimation) return undefined;
  const activeTask = releaseAnimation.tasks[releaseAnimation.activeIndex];
  if (activeTask?.id !== taskId) return undefined;
  if (column === "done" && releaseAnimation.visibleReleasedCount <= releaseAnimation.activeIndex) {
    return "release-launching";
  }
  if (column === "released" && releaseAnimation.visibleReleasedCount > releaseAnimation.activeIndex) {
    return "release-landed";
  }
  return undefined;
}

function releaseEffectsForTask(game: RtGameState, taskId: string): string[] {
  const releaseEvent = game.log.find(
    (event) => event.type === "release" && event.title === `${taskId} released`,
  );
  return releaseEvent?.effects ?? [`score ${game.tasks[taskId]?.releaseScore ?? 0}`];
}

function releaseQuarterForAnimation(game: RtGameState): number {
  if (game.day > 1 && game.dayInQuarter === 1) {
    return Math.max(1, game.quarter - 1);
  }
  return game.quarter;
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

function effectTone(effect: string): "positive" | "negative" | "neutral" {
  if (/\s-[0-9]/.test(effect) || effect.startsWith("no ")) return "negative";
  if (/\s\+[0-9]/.test(effect) || effect.includes("reduced")) return "positive";
  return "neutral";
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
    pressure: task.pressure,
    complexity: task.complexity,
    value: task.value,
    clarity: task.clarity,
    quality: task.quality,
    testCoverage: task.testCoverage,
    bugs: task.bugs,
    workDone: task.workDone,
    subtasks: task.subtasks,
    currentSubtaskId: task.currentSubtaskId,
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
    postBackendLog([createLogEntry(sessionId, "snapshot", "debug_snapshot", snapshot)]);
  }
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
