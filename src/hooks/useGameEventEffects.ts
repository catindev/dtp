import { useEffect, useRef, type MutableRefObject } from "react";
import { APP_COMMIT, type AutosaveLoadResult } from "../save";
import { type RtGameState } from "../realtime/simulation";
import {
  createLogEntry,
  gameEventKey,
  logAction,
  postBackendLog,
  type FrontendLogEntry,
} from "../frontendLogging";
import { buildGameEventTelemetry } from "../logging/gameEventTelemetry";
import { buildDaySummaryTelemetry } from "../logging/summaryTelemetry";
import {
  isWorkPassCompletedEvent,
  workPassCompletedTaskId,
} from "../engine/eventData";

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
  const loggedSummaryIdsRef = useRef<Set<string>>(new Set());

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
        createLogEntry(sessionIdRef.current, "event", event.type, buildGameEventTelemetry(game, event)),
      );
    }
    if (newEntries.length > 0) {
      postBackendLog(newEntries);
    }
  }, [game, loggedEventKeysRef, screen, sessionIdRef]);

  useEffect(() => {
    if (screen !== "game" || !game.morningReport) return;
    const reportId = game.morningReport.id;
    if (loggedSummaryIdsRef.current.has(reportId)) return;
    loggedSummaryIdsRef.current.add(reportId);
    postBackendLog([
      createLogEntry(
        sessionIdRef.current,
        "summary",
        "day_summary",
        buildDaySummaryTelemetry(game, game.morningReport),
      ),
    ]);
  }, [game, screen, sessionIdRef]);

  useEffect(() => {
    if (screen !== "game") return;
    for (const event of game.log.slice().reverse()) {
      if (!isWorkPassCompletedEvent(event)) continue;
      const key = gameEventKey(event);
      if (animatedWorkEventKeysRef.current.has(key)) continue;
      animatedWorkEventKeysRef.current.add(key);
      const taskId = workPassCompletedTaskId(event);
      if (!taskId) continue;
      if (game.tasks[taskId]) bounceTask(taskId);
    }
  }, [animatedWorkEventKeysRef, bounceTask, game.log, game.tasks, screen]);
}
