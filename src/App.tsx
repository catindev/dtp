import { useEffect, useRef, useState, type DragEvent, type ReactElement } from "react";
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
  type RtQuarterReviewReport,
  type RtReadinessReport,
  type RtRiskReason,
  type RtSubtask,
  type RtTask,
} from "./realtime/simulation";
import {
  LOCALE_LABELS,
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
import enGameLoopDoc from "../userdocs/en/game-loop.md?raw";
import enOverviewDoc from "../userdocs/en/overview.md?raw";
import enRolesDoc from "../userdocs/en/roles.md?raw";
import enTasksQualityDoc from "../userdocs/en/tasks-quality.md?raw";
import ruGameLoopDoc from "../userdocs/ru/game-loop.md?raw";
import ruOverviewDoc from "../userdocs/ru/overview.md?raw";
import ruRolesDoc from "../userdocs/ru/roles.md?raw";
import ruTasksQualityDoc from "../userdocs/ru/tasks-quality.md?raw";
import "./styles.css";

const BACKEND_BASE_URL = import.meta.env.VITE_DTP_BACKEND_URL ?? "http://127.0.0.1:8787";
const BACKEND_LOG_URL = `${BACKEND_BASE_URL}/api/log`;
const BACKEND_RESET_URL = `${BACKEND_BASE_URL}/api/reset`;
const BACKEND_LOG_QUEUE_KEY = "dtp.backendLogQueue.v1";
const BACKEND_LOG_QUEUE_LIMIT = 1200;
const BACKEND_LOG_BATCH_SIZE = 80;
const BACKEND_LOG_FLUSH_INTERVAL_MS = 2500;

interface UserDoc {
  id: string;
  title: Record<Locale, string>;
  markdown: Record<Locale, string>;
}

const USER_DOCS: UserDoc[] = [
  {
    id: "overview",
    title: {
      en: "Game overview",
      ru: "Об игре",
    },
    markdown: {
      en: enOverviewDoc,
      ru: ruOverviewDoc,
    },
  },
  {
    id: "game-loop",
    title: {
      en: "Game loop",
      ru: "Игровой процесс",
    },
    markdown: {
      en: enGameLoopDoc,
      ru: ruGameLoopDoc,
    },
  },
  {
    id: "roles",
    title: {
      en: "Team roles",
      ru: "Роли в команде",
    },
    markdown: {
      en: enRolesDoc,
      ru: ruRolesDoc,
    },
  },
  {
    id: "tasks-quality",
    title: {
      en: "Quality and risk",
      ru: "Качество и риски",
    },
    markdown: {
      en: enTasksQualityDoc,
      ru: ruTasksQualityDoc,
    },
  },
];

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

type AppScreen = "menu" | "game" | "docs";

type ProdView = "released" | "unfinished";

type ActiveDrag =
  | { type: "task"; taskId: string }
  | { type: "character"; characterId: string }
  | { type: "outsourcing" }
  | null;

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
    activeDragRef.current = null;
    clearBounceTimers();
    setBounceTaskIds(new Set());
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
    setDragGhost(event, character, locale);
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
          reason: outsourceStatusText(outsourceStatus, locale),
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
      <main className="shell menu-shell">
        <section className="main-menu">
          <div className="menu-title">
            <strong>Don&apos;t Touch Prod</strong>
            <span>{hasResumeCard ? t(locale, "menu.pauseSubtitle") : t(locale, "menu.subtitle")}</span>
          </div>
          <div className="menu-settings">
            <span>{t(locale, "menu.language")}</span>
            <LanguageSwitch locale={locale} onChange={setLocale} />
          </div>
          <button className="rtfm-button" onClick={openDocs} type="button">
            <strong>{t(locale, "menu.rtfm")}</strong>
            <span>{t(locale, "menu.rtfmDescription")}</span>
          </button>
          {hasResumeCard ? (
            <ResumeCard game={game} locale={locale} sessionId={sessionIdRef.current} />
          ) : null}
          <div className="menu-actions">
            {hasResumeCard ? (
              <button className="start-button" onClick={continueRun} type="button">
                {t(locale, "menu.continue")}
              </button>
            ) : (
              <button className="start-button" onClick={() => startRun()} type="button">
                {t(locale, "menu.start")}
              </button>
            )}
          </div>
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

function LanguageSwitch({
  locale,
  onChange,
}: {
  locale: Locale;
  onChange: (locale: Locale) => void;
}) {
  return (
    <div className="language-switch" aria-label={t(locale, "header.language")}>
      {(["en", "ru"] as Locale[]).map((candidate) => (
        <button
          className={candidate === locale ? "active" : ""}
          key={candidate}
          onClick={() => onChange(candidate)}
          type="button"
        >
          {LOCALE_LABELS[candidate]}
        </button>
      ))}
    </div>
  );
}

function DocsScreen({
  docs,
  locale,
  onBack,
  onLocaleChange,
  onSelectDoc,
  selectedDoc,
}: {
  docs: UserDoc[];
  locale: Locale;
  onBack: () => void;
  onLocaleChange: (locale: Locale) => void;
  onSelectDoc: (docId: string) => void;
  selectedDoc: UserDoc;
}) {
  return (
    <main className="shell docs-shell">
      <section className="docs-frame">
        <header className="docs-header">
          <div>
            <strong>{t(locale, "docs.title")}</strong>
            <span>{t(locale, "docs.subtitle")}</span>
          </div>
          <div className="docs-actions">
            <LanguageSwitch locale={locale} onChange={onLocaleChange} />
            <button className="ghost-button" onClick={onBack} type="button">
              {t(locale, "docs.back")}
            </button>
          </div>
        </header>
        <div className="docs-body">
          <nav className="docs-nav" aria-label={t(locale, "docs.nav")}>
            {docs.map((doc) => (
              <button
                className={doc.id === selectedDoc.id ? "active" : ""}
                key={doc.id}
                onClick={() => onSelectDoc(doc.id)}
                type="button"
              >
                {doc.title[locale]}
              </button>
            ))}
          </nav>
          <article className="docs-article">
            <MarkdownArticle markdown={selectedDoc.markdown[locale]} />
          </article>
        </div>
      </section>
    </main>
  );
}

function MarkdownArticle({ markdown }: { markdown: string }) {
  const elements: ReactElement[] = [];
  let listItems: string[] = [];
  let paragraph: string[] = [];

  function flushList() {
    if (listItems.length === 0) return;
    const key = `list-${elements.length}`;
    elements.push(
      <ul key={key}>
        {listItems.map((item, index) => (
          <li key={`${key}-${index}`}>{item}</li>
        ))}
      </ul>,
    );
    listItems = [];
  }

  function flushParagraph() {
    if (paragraph.length === 0) return;
    elements.push(<p key={`p-${elements.length}`}>{paragraph.join(" ")}</p>);
    paragraph = [];
  }

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    if (line.startsWith("- ")) {
      flushParagraph();
      listItems.push(line.slice(2));
      continue;
    }
    flushList();
    if (line.startsWith("### ")) {
      flushParagraph();
      elements.push(<h3 key={`h3-${elements.length}`}>{line.slice(4)}</h3>);
    } else if (line.startsWith("## ")) {
      flushParagraph();
      elements.push(<h2 key={`h2-${elements.length}`}>{line.slice(3)}</h2>);
    } else if (line.startsWith("# ")) {
      flushParagraph();
      elements.push(<h1 key={`h1-${elements.length}`}>{line.slice(2)}</h1>);
    } else {
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();

  return <>{elements}</>;
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
  const urgent = !task.released && task.column !== "done" && deadlineRatio <= 0.18;
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
  const cardStatus = task.released ? t(locale, "task.released") : null;
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
        {cardStatus ? <span className="card-status-chip">{cardStatus}</span> : null}
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

function outsourceStatusText(status: RtOutsourceStatus, locale: Locale): string {
  const subtask = status.subtask;
  const work = subtask
    ? `${subtaskRoleLabel(subtask.role, locale)} ${labelImportance(locale, subtask.importance)}`
    : localizeText("known work", locale);
  switch (status.reason) {
    case "ready":
      return locale === "ru"
        ? `Можно взять ${work} за Budget ${status.cost}.`
        : `Can take ${work} for Budget ${status.cost}.`;
    case "insufficient_budget":
      return locale === "ru"
        ? `Нужно Budget ${status.neededBudget} для ${work}; сейчас ${status.currentBudget}.`
        : `Need Budget ${status.neededBudget} for ${work}; current ${status.currentBudget}.`;
    case "needs_analysis":
      return localizeText("Needs analysis first: no visible open work.", locale);
    case "no_open_work":
      return localizeText("No visible open work for outsourcing.", locale);
    case "task_busy":
      return localizeText("Task is already in work.", locale);
    case "task_released":
      return localizeText("Task is already released.", locale);
    case "wrong_column":
      return localizeText("Move task to In Progress first.", locale);
    case "task_missing":
      return localizeText("Task is no longer on the board.", locale);
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

function setDragGhost(event: DragEvent<HTMLElement>, character: RtCharacter, locale: Locale) {
  const ghost = document.createElement("div");
  ghost.className = "drag-ghost";
  ghost.textContent = locale === "ru" ? `${character.name} -> задача` : `${character.name} -> task`;
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
    locale: game.locale,
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
    locale: snapshot.locale,
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
