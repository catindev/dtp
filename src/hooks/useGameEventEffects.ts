import { useEffect, type MutableRefObject } from "react";
import { APP_COMMIT, type AutosaveLoadResult } from "../save";
import { formatGameTime, type RtEvent, type RtGameState } from "../realtime/simulation";
import {
  createLogEntry,
  gameEventKey,
  logAction,
  postBackendLog,
  type FrontendLogEntry,
} from "../frontendLogging";

interface UseGameEventEffectsArgs {
  game: RtGameState;
  screen: string;
  initialAutosaveRef: MutableRefObject<AutosaveLoadResult | null>;
  sessionIdRef: MutableRefObject<string>;
  loggedEventKeysRef: MutableRefObject<Set<string>>;
  animatedWorkEventKeysRef: MutableRefObject<Set<string>>;
  bounceTask: (taskId: string) => void;
}

export function useGameEventEffects({
  game,
  screen,
  initialAutosaveRef,
  sessionIdRef,
  loggedEventKeysRef,
  animatedWorkEventKeysRef,
  bounceTask,
}: UseGameEventEffectsArgs): void {
  useEffect(() => {
    if (screen !== "game" || initialAutosaveRef.current?.status !== "loaded") return;
    logAction(sessionIdRef.current, "autosave_restored", {
      savedAt: initialAutosaveRef.current.save.savedAt,
      savedCommit: initialAutosaveRef.current.save.appCommit,
      currentCommit: APP_COMMIT,
      normalized: initialAutosaveRef.current.normalized,
    });
  }, [initialAutosaveRef, screen, sessionIdRef]);

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
  }, [game, loggedEventKeysRef, screen, sessionIdRef]);

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
  }, [animatedWorkEventKeysRef, bounceTask, game.log, game.tasks, screen]);
}

function isWorkPassDoneEvent(event: RtEvent): boolean {
  return (
    event.type === "analysis_done" ||
    event.type === "subtask_done" ||
    event.type === "bugfix_done" ||
    event.type === "qa_done"
  );
}
