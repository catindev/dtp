import { useRef } from "react";
import { normalizeLocale, type Locale } from "../i18n";
import { createSessionId, gameEventKey } from "../frontendLogging";
import { createRealtimeState, type RtGameState } from "../realtime/simulation";
import { loadSavedRun } from "../save";
import { loadStoredLocale } from "./useLocaleSync";

export function useGameBoot() {
  const initialLocaleRef = useRef<Locale | null>(null);
  if (!initialLocaleRef.current) {
    initialLocaleRef.current = loadStoredLocale();
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

  const sessionIdRef = useRef(restoredSave?.sessionId ?? createSessionId());
  const loggedEventKeysRef = useRef(
    new Set<string>(restoredSave?.game.log.map(gameEventKey) ?? []),
  );
  const animatedWorkEventKeysRef = useRef(
    new Set<string>(restoredSave?.game.log.map(gameEventKey) ?? []),
  );
  const soundEventKeysRef = useRef(
    new Set<string>(restoredSave?.game.log.map(gameEventKey) ?? []),
  );

  return {
    animatedWorkEventKeysRef,
    bootGame: bootGameRef.current,
    initialAutosaveRef,
    initialLocale: initialLocaleRef.current,
    loggedEventKeysRef,
    restoredSave,
    sessionIdRef,
    soundEventKeysRef,
  };
}
