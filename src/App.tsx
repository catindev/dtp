import { DndContext, pointerWithin } from "@dnd-kit/core";
import { useEffect, useRef, useState } from "react";
import { BoardPanel } from "./components/BoardPanel";
import { AppFooter } from "./components/AppFooter";
import { DocsScreen } from "./components/DocsScreen";
import { GameHeader } from "./components/GameHeader";
import { MenuScreen } from "./components/MenuScreen";
import { MorningReportPage } from "./components/MorningReportPage";
import { RunBanner } from "./components/RunBanner";
import { SidePanel } from "./components/SidePanel";
import { TeamPanel } from "./components/TeamPanel";
import { VictoryReport } from "./components/VictoryReport";
import { type RtGameState } from "./realtime/simulation";
import { t, type Locale } from "./i18n";
import { useTaskFeedback } from "./hooks/useTaskFeedback";
import {
  useGameEventSounds,
  useGlobalButtonSounds,
  useMainThemePlayback,
} from "./hooks/useGameAudio";
import { useGameDragAndDrop } from "./hooks/useGameDragAndDrop";
import { useGameEventEffects } from "./hooks/useGameEventEffects";
import { useGameActions } from "./hooks/useGameActions";
import { useGameBoot } from "./hooks/useGameBoot";
import { useGameMutation } from "./hooks/useGameMutation";
import { useLocaleGameSync } from "./hooks/useLocaleSync";
import {
  useAutosaveRun,
  useBackendLogPump,
  useDebugSnapshotPoster,
  useLatestGameRef,
  useNormalizeRealtimeStateOnMount,
  useRealtimeTicker,
  useStatusDebugSnapshot,
} from "./hooks/useRuntimeEffects";
import { useSelectedTaskSync } from "./hooks/useSelectedTaskSync";
import { useRuntimeErrorLogging } from "./logging/runtimeErrors";
import type { ProdView } from "./components/board/types";
import { USER_DOCS } from "./userdocs";
import { pauseMainTheme, playSoundEffect } from "./audio/audioManager";
import {
  loadMusicEnabledPreference,
  saveMusicEnabledPreference,
} from "./audio/audioPreferences";
import type { TimeScale } from "./timeScale";
import {
  loadTutorialCompleted,
  saveTutorialCompleted,
} from "./tutorial/tutorialProgress";
import {
  tutorialFocusCharacterId,
  tutorialFocusTaskId,
} from "./tutorial/tutorialDirector";
import "./styles.css";

type AppScreen = "menu" | "game" | "docs";

export function App() {
  const {
    animatedWorkEventKeysRef,
    bootGame,
    initialAutosaveRef,
    initialLocale,
    loggedEventKeysRef,
    restoredSave,
    sessionIdRef,
    soundEventKeysRef,
  } = useGameBoot();

  const [locale, setLocale] = useState<Locale>(() => initialLocale);
  const [game, setGame] = useState<RtGameState>(() => bootGame);
  const [screen, setScreen] = useState<AppScreen>("menu");
  const [musicEnabled, setMusicEnabled] = useState(loadMusicEnabledPreference);
  const [tutorialCompleted, setTutorialCompleted] = useState(loadTutorialCompleted);
  const [timeScale, setTimeScale] = useState<TimeScale>(1);
  const [hasResumeCard, setHasResumeCard] = useState(Boolean(restoredSave));
  const [prodView, setProdView] = useState<ProdView>("released");
  const [selectedDocId, setSelectedDocId] = useState(USER_DOCS[0].id);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const saveReset =
    initialAutosaveRef.current?.status === "reset" ? initialAutosaveRef.current : null;
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
  const selectedTask = selectedTaskId ? game.tasks[selectedTaskId] : null;
  const selectedCharacter = selectedCharacterId ? game.characters[selectedCharacterId] : null;
  const attentionTaskIds = new Set(bounceTaskIds);
  const tutorialFocusTask = tutorialFocusTaskId(game);
  const tutorialFocusCharacter = tutorialFocusCharacterId(game);
  const hasInspectorContent = Boolean(selectedTask || selectedCharacter || game.lossReport);
  const morningReport = game.morningReport;
  const interactionBlocked =
    screen !== "game" || game.paused || game.status !== "running" || Boolean(morningReport);
  const mutate = useGameMutation(screen, setGame);
  const {
    activeCharacterDragId,
    characterDropAnimation,
    activeOutsourceDrag,
    activeTaskDragId,
    dndSensors,
    beginDndDrag,
    finishDndDrag,
    cancelDndDrag,
    resetDrag,
  } = useGameDragAndDrop({
    game,
    interactionBlocked,
    isGameScreen: screen === "game",
    locale,
    morningReportActive: Boolean(morningReport),
    sessionId: sessionIdRef.current,
    mutate,
    clearSelection,
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
    skipTutorialAndStartRun,
    startBriefedDay,
    startRun,
    startTutorialRun,
    togglePause,
  } = useGameActions({
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
  });

  useBackendLogPump();
  useRuntimeErrorLogging(screen, latestGameRef, sessionIdRef);
  useGlobalButtonSounds();
  useMainThemePlayback(game, screen, musicEnabled);
  useRealtimeTicker(screen, setGame, timeScale);
  useDebugSnapshotPoster(screen, latestGameRef, sessionIdRef);
  useAutosaveRun(game, screen, latestGameRef, sessionIdRef);
  useStatusDebugSnapshot(game, screen, sessionIdRef);
  useLatestGameRef(game, latestGameRef);
  useLocaleGameSync(locale, setGame, latestGameRef);
  useNormalizeRealtimeStateOnMount(setGame);
  useSelectedTaskSync(
    game,
    selectedTaskId,
    setSelectedTaskId,
    selectedCharacterId,
    setSelectedCharacterId,
  );
  useGameEventEffects({
    game,
    screen,
    initialAutosaveRef,
    sessionIdRef,
    loggedEventKeysRef,
    animatedWorkEventKeysRef,
    bounceTask,
  });
  useGameEventSounds({
    game,
    screen,
    soundEventKeysRef,
  });

  useEffect(() => {
    saveMusicEnabledPreference(musicEnabled);
    if (!musicEnabled) pauseMainTheme();
  }, [musicEnabled]);

  const selectedDoc = USER_DOCS.find((doc) => doc.id === selectedDocId) ?? USER_DOCS[0];

  function selectTask(taskId: string): void {
    playSoundEffect("click");
    setSelectedTaskId(taskId);
    setSelectedCharacterId(null);
  }

  function selectCharacter(characterId: string): void {
    playSoundEffect("click");
    setSelectedCharacterId(characterId);
    setSelectedTaskId(null);
  }

  function clearSelection(): void {
    setSelectedTaskId(null);
    setSelectedCharacterId(null);
  }

  function completeTutorialAndStartCampaign(): void {
    saveTutorialCompleted(true);
    setTutorialCompleted(true);
    startRun("tutorial_completed_start_campaign");
  }

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
        musicEnabled={musicEnabled}
        onContinueRun={continueRun}
        onLocaleChange={setLocale}
        onMusicEnabledChange={setMusicEnabled}
        onOpenDocs={openDocs}
        onStartRun={startRun}
        onStartTutorial={startTutorialRun}
        onSkipTutorial={skipTutorialAndStartRun}
        saveReset={saveReset}
        sessionId={sessionIdRef.current}
        tutorialCompleted={tutorialCompleted}
      />
    );
  }

  return (
    <main
      className={[
        "shell",
        game.paused ? "paused" : "",
        game.status === "won" ? "won" : "",
        game.status === "lost" ? "lost" : "",
        morningReport ? "morning-reporting" : "",
      ].join(" ")}
    >
      <GameHeader
        game={game}
        locale={locale}
        morningReport={morningReport}
        onOpenMenu={openMenu}
        onTimeScaleChange={setTimeScale}
        onTogglePause={togglePause}
        pauseShake={pauseShake}
        timeScale={timeScale}
      />

      {game.status !== "running" ? <RunBanner game={game} locale={locale} /> : null}

      {game.status === "won" && game.victoryReport ? (
        <VictoryReport
          locale={locale}
          onNewRun={() => startRun("victory_new_run_clicked")}
          report={game.victoryReport}
        />
      ) : morningReport ? (
        <MorningReportPage
          continueLabel={
            game.runMode === "tutorial" && game.tutorial?.completed
              ? t(locale, "tutorial.startCampaign")
              : undefined
          }
          game={game}
          locale={locale}
          onContinue={
            game.runMode === "tutorial" && game.tutorial?.completed
              ? completeTutorialAndStartCampaign
              : startBriefedDay
          }
          report={morningReport}
        />
      ) : (
        <DndContext
          collisionDetection={pointerWithin}
          onDragCancel={cancelDndDrag}
          onDragEnd={finishDndDrag}
          onDragStart={beginDndDrag}
          sensors={dndSensors}
        >
          <section className="playfield">
            <TeamPanel
              activeCharacterDragId={activeCharacterDragId}
              activeOutsourceDrag={activeOutsourceDrag}
              game={game}
              interactionBlocked={interactionBlocked}
              isGameScreen={screen === "game"}
              locale={locale}
              morningReportActive={Boolean(morningReport)}
              onCharacterSelect={selectCharacter}
              selectedCharacterId={selectedCharacterId}
              tutorialFocusCharacterId={
                tutorialFocusCharacter === activeCharacterDragId ? null : tutorialFocusCharacter
              }
            />

            <BoardPanel
              activeCharacterDragId={activeCharacterDragId}
              activeOutsourceDrag={activeOutsourceDrag}
              activeTaskDragId={activeTaskDragId}
              attentionTaskIds={attentionTaskIds}
              characterDropAnimation={characterDropAnimation}
              flashTaskId={flashTaskId}
              game={game}
              locale={locale}
              onProdViewChange={setProdView}
              onTaskClick={selectTask}
              prodView={prodView}
              rejectColumnIds={shakeColumnIds}
              rejectTaskIds={shakeTaskIds}
              selectedTaskId={selectedTaskId}
              tutorialFocusTaskId={tutorialFocusTask}
            />

            <SidePanel
              canCancelWork={Boolean(
                selectedTask?.assignedCharacterId &&
                  game.characters[selectedTask.assignedCharacterId] &&
                  !morningReport,
              )}
              cancelDisabled={interactionBlocked}
              game={game}
              hasContent={hasInspectorContent}
              locale={locale}
              onCancelWork={cancelSelectedTask}
              onClearSelection={clearSelection}
              onOpenLinkedTask={openLinkedTask}
              selectedCharacter={selectedCharacter}
              selectedTask={selectedTask}
            />
          </section>
        </DndContext>
      )}
      <AppFooter locale={locale} sessionId={sessionIdRef.current} />
    </main>
  );
}
