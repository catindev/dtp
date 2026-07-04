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
  createTutorialRealtimeState,
  formatGameTime,
  normalizeRealtimeState,
  startDayAfterMorningReport,
  type RtCharacter,
  type RtGameState,
  type RtTask,
} from "../realtime/simulation";
import { createSessionId, gameEventKey, logAction } from "../frontendLogging";
import { restartMainThemeOnNextPlay } from "../audio/audioManager";
import type { TimeScale } from "../timeScale";

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
  selectedCharacter: RtCharacter | null;
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
  setSelectedCharacterId: Dispatch<SetStateAction<string | null>>;
  setProdView: Dispatch<SetStateAction<ProdView>>;
  setTimeScale: Dispatch<SetStateAction<TimeScale>>;
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
  selectedCharacter,
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
  setSelectedCharacterId,
  setProdView,
  setTimeScale,
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
    setSelectedTaskId(null);
    setSelectedCharacterId(null);
    setTimeScale(1);
    setHasResumeCard(true);
    setScreen("game");
    saveRun(next, sessionId);
    logAction(sessionId, actionName, {
      seed: next.seed,
      runMode: next.runMode,
      startedAt: new Date().toISOString(),
      appCommit: APP_COMMIT,
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
    });
  }

  function startTutorialRun() {
    clearSavedRun();
    const next = createTutorialRealtimeState(Date.now(), locale);
    const sessionId = createSessionId();
    sessionIdRef.current = sessionId;
    loggedEventKeysRef.current = new Set();
    animatedWorkEventKeysRef.current = new Set();
    soundEventKeysRef.current = new Set(next.log.map(gameEventKey));
    restartMainThemeOnNextPlay();
    resetDrag();
    resetFeedback();
    setGame(next);
    setSelectedTaskId(null);
    setSelectedCharacterId(null);
    setTimeScale(1);
    setHasResumeCard(true);
    setScreen("game");
    saveRun(next, sessionId);
    logAction(sessionId, "tutorial_started", {
      seed: next.seed,
      runMode: next.runMode,
      stageId: next.tutorial?.stageId ?? null,
      stepId: next.tutorial?.stepId ?? null,
      startedAt: new Date().toISOString(),
      appCommit: APP_COMMIT,
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
    });
  }

  function skipTutorialAndStartRun() {
    startRun("tutorial_skipped");
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
    setSelectedTaskId((current) => (current && next.tasks[current] ? current : null));
    setSelectedCharacterId((current) => (current && next.characters[current] ? current : null));
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
      shippedCount: currentReport.shippedTaskIds.length,
      missedCount: currentReport.missedTaskIds.length,
      consequenceCount: currentReport.consequences.length,
      effectCount: currentReport.effects.length,
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
      characterId: character?.id,
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
    setSelectedCharacterId(null);
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
      fromCharacterId: selectedCharacter?.id,
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
    startTutorialRun,
    skipTutorialAndStartRun,
    togglePause,
  };
}
