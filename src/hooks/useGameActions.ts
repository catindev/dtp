import { type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { type Locale } from "../i18n";
import {
  APP_COMMIT,
  SAVE_SCHEMA_VERSION,
  clearSavedRun,
  saveRun,
} from "../save";
import {
  cancelTaskWork,
  createRealtimeState,
  formatGameTime,
  normalizeRealtimeState,
  startDayAfterMorningReport,
  type RtGameState,
  type RtTask,
} from "../realtime/simulation";
import { createSessionId, gameEventKey, logAction } from "../frontendLogging";
import {
  restartMainThemeOnNextPlay,
  startMainTheme,
} from "../audio/audioManager";

type AppScreen = "menu" | "game" | "docs";
type ProdView = "released" | "unfinished";

interface UseGameActionsArgs {
  game: RtGameState;
  screen: AppScreen;
  locale: Locale;
  selectedDocId: string;
  hasResumeCard: boolean;
  selectedTaskId: string | null;
  selectedTask: RtTask | null;
  latestGameRef: MutableRefObject<RtGameState>;
  sessionIdRef: MutableRefObject<string>;
  loggedEventKeysRef: MutableRefObject<Set<string>>;
  animatedWorkEventKeysRef: MutableRefObject<Set<string>>;
  soundEventKeysRef: MutableRefObject<Set<string>>;
  mutate: (updater: (draft: RtGameState) => void) => void;
  setGame: Dispatch<SetStateAction<RtGameState>>;
  setScreen: Dispatch<SetStateAction<AppScreen>>;
  setHasResumeCard: Dispatch<SetStateAction<boolean>>;
  setSelectedTaskId: Dispatch<SetStateAction<string | null>>;
  setProdView: Dispatch<SetStateAction<ProdView>>;
  resetDrag: () => void;
  resetFeedback: () => void;
  flashTask: (taskId: string) => void;
}

export function useGameActions({
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
  soundEventKeysRef,
  mutate,
  setGame,
  setScreen,
  setHasResumeCard,
  setSelectedTaskId,
  setProdView,
  resetDrag,
  resetFeedback,
  flashTask,
}: UseGameActionsArgs) {
  function startRun(actionName = "start_run_clicked") {
    clearSavedRun();
    const next = createRealtimeState(Date.now(), locale);
    const sessionId = createSessionId();
    sessionIdRef.current = sessionId;
    loggedEventKeysRef.current = new Set();
    animatedWorkEventKeysRef.current = new Set();
    soundEventKeysRef.current = new Set(next.log.map(gameEventKey));
    restartMainThemeOnNextPlay();
    resetDrag();
    resetFeedback();
    setGame(next);
    setSelectedTaskId(next.board.backlog[0] ?? null);
    setHasResumeCard(true);
    setScreen("game");
    saveRun(next, sessionId);
    startMainTheme({ restart: true });
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
    if (game.paused && next.status === "running") startMainTheme();
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
    if (next.status === "running" && !next.paused) startMainTheme();
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

  return {
    cancelSelectedTask,
    continueRun,
    openDocs,
    openLinkedTask,
    openMenu,
    startBriefedDay,
    startRun,
    togglePause,
  };
}

export function initialSelectedTaskId(game: RtGameState): string | null {
  return (
    game.board.inProgress[0] ??
    game.board.backlog[0] ??
    game.board.done[0] ??
    game.board.released[0] ??
    null
  );
}
