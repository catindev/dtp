import { useEffect, type MutableRefObject } from "react";
import {
  createLogEntry,
  postBackendLog,
  postDebugSnapshot,
} from "../frontendLogging";
import {
  formatGameTime,
  type RtGameState,
} from "../realtime/simulation";

export function useRuntimeErrorLogging(
  screen: string,
  latestGameRef: MutableRefObject<RtGameState>,
  sessionIdRef: MutableRefObject<string>,
): void {
  useEffect(() => {
    function logRuntimeError(source: "error" | "unhandledrejection", error: unknown): void {
      try {
        const game = latestGameRef.current;
        postBackendLog([
          createLogEntry(sessionIdRef.current, "error", "runtime_error", {
            source,
            screen,
            message: errorMessage(error),
            stack: errorStack(error),
            game: {
              status: game.status,
              paused: game.paused,
              day: game.day,
              campaignDay: game.calendar.campaignDay,
              gameTime: formatGameTime(game),
              elapsedGameMinutes: Math.round(game.elapsedGameMinutes),
              taskCount: Object.keys(game.tasks).length,
            },
          }),
        ]);
        postDebugSnapshot(game, sessionIdRef.current, "runtime_error");
      } catch {
        // Runtime error logging must never create another runtime error loop.
      }
    }

    function onError(event: ErrorEvent): void {
      logRuntimeError("error", event.error ?? event.message);
    }

    function onUnhandledRejection(event: PromiseRejectionEvent): void {
      logRuntimeError("unhandledrejection", event.reason);
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, [latestGameRef, screen, sessionIdRef]);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function errorStack(error: unknown): string | null {
  return error instanceof Error && typeof error.stack === "string" ? error.stack : null;
}
