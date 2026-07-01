import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  TICK_MS,
  normalizeRealtimeState,
  tickRealtime,
  type RtGameState,
} from "../realtime/simulation";
import { saveRun } from "../save";
import {
  BACKEND_LOG_FLUSH_INTERVAL_MS,
  flushBackendLogQueue,
  postDebugSnapshot,
} from "../frontendLogging";

export function useBackendLogPump(): void {
  useEffect(() => {
    flushBackendLogQueue();
    const id = window.setInterval(flushBackendLogQueue, BACKEND_LOG_FLUSH_INTERVAL_MS);
    window.addEventListener("online", flushBackendLogQueue);

    return () => {
      window.clearInterval(id);
      window.removeEventListener("online", flushBackendLogQueue);
    };
  }, []);
}

export function useLatestGameRef(
  game: RtGameState,
  latestGameRef: MutableRefObject<RtGameState>,
): void {
  useEffect(() => {
    latestGameRef.current = game;
  }, [game, latestGameRef]);
}

export function useNormalizeRealtimeStateOnMount(
  setGame: Dispatch<SetStateAction<RtGameState>>,
): void {
  useEffect(() => {
    setGame((current) => {
      const draft = structuredClone(current) as RtGameState;
      return normalizeRealtimeState(draft) ? draft : current;
    });
  }, [setGame]);
}

export function useRealtimeTicker(
  screen: string,
  setGame: Dispatch<SetStateAction<RtGameState>>,
): void {
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
  }, [screen, setGame]);
}

export function useDebugSnapshotPoster(
  screen: string,
  latestGameRef: MutableRefObject<RtGameState>,
  sessionIdRef: MutableRefObject<string>,
): void {
  useEffect(() => {
    if (screen !== "game") return;
    const id = window.setInterval(() => {
      postDebugSnapshot(latestGameRef.current, sessionIdRef.current);
    }, 1000);

    return () => window.clearInterval(id);
  }, [latestGameRef, screen, sessionIdRef]);
}

export function useAutosaveRun(
  game: RtGameState,
  screen: string,
  latestGameRef: MutableRefObject<RtGameState>,
  sessionIdRef: MutableRefObject<string>,
): void {
  const autosaveTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    },
    [],
  );

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
  }, [game, latestGameRef, screen, sessionIdRef]);
}

export function useStatusDebugSnapshot(
  game: RtGameState,
  screen: string,
  sessionIdRef: MutableRefObject<string>,
): void {
  useEffect(() => {
    if (screen !== "game") return;
    postDebugSnapshot(game, sessionIdRef.current);
  }, [game.status, game.lossReason, screen, sessionIdRef]);
}
