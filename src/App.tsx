import { useRef, useState } from "react";
import { BoardPanel } from "./components/BoardPanel";
import { DocsScreen } from "./components/DocsScreen";
import { GameHeader } from "./components/GameHeader";
import { MenuScreen } from "./components/MenuScreen";
import { MorningReportPage } from "./components/MorningReportPage";
import { RunBanner } from "./components/RunBanner";
import { SidePanel } from "./components/SidePanel";
import { TeamPanel } from "./components/TeamPanel";
import { type RtGameState } from "./realtime/simulation";
import { type Locale } from "./i18n";
import { useTaskFeedback } from "./hooks/useTaskFeedback";
import { useGameDragAndDrop } from "./hooks/useGameDragAndDrop";
import { useGameEventEffects } from "./hooks/useGameEventEffects";
import { initialSelectedTaskId, useGameActions } from "./hooks/useGameActions";
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
import { USER_DOCS } from "./userdocs";
import "./styles.css";

type AppScreen = "menu" | "game" | "docs";

type ProdView = "released" | "unfinished";

export function App() {
  const {
    animatedWorkEventKeysRef,
    bootGame,
    initialAutosaveRef,
    initialLocale,
    loggedEventKeysRef,
    restoredSave,
    sessionIdRef,
  } = useGameBoot();

  const [locale, setLocale] = useState<Locale>(() => initialLocale);
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
  const selectedTask = selectedTaskId ? game.tasks[selectedTaskId] : null;
  const morningReport = game.morningReport;
  const interactionBlocked =
    screen !== "game" || game.paused || game.status !== "running" || Boolean(morningReport);
  const mutate = useGameMutation(screen, setGame);
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
  useLatestGameRef(game, latestGameRef);
  useLocaleGameSync(locale, setGame, latestGameRef);
  useNormalizeRealtimeStateOnMount(setGame);
  useSelectedTaskSync(game, selectedTaskId, setSelectedTaskId);
  useGameEventEffects({
    game,
    screen,
    initialAutosaveRef,
    sessionIdRef,
    loggedEventKeysRef,
    animatedWorkEventKeysRef,
    bounceTask,
  });

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

      {game.status !== "running" ? <RunBanner game={game} locale={locale} /> : null}

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

          <SidePanel
            canCancelWork={Boolean(
              selectedTask?.assignedCharacterId &&
                game.characters[selectedTask.assignedCharacterId] &&
                !morningReport,
            )}
            cancelDisabled={interactionBlocked}
            game={game}
            locale={locale}
            onCancelWork={cancelSelectedTask}
            onOpenLinkedTask={openLinkedTask}
            selectedTask={selectedTask}
          />
        </section>
      )}
    </main>
  );
}
