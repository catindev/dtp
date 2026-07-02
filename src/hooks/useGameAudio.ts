import { useEffect, type MutableRefObject } from "react";
import type { RtEvent, RtGameState } from "../realtime/simulation";
import { gameEventKey } from "../frontendLogging";
import {
  pauseMainTheme,
  playSoundEffect,
  startMainTheme,
} from "../audio/audioManager";
import {
  SOUND_EFFECT_NAMES,
  type SoundEffectName,
} from "../audio/soundCatalog";

export function useMainThemePlayback(
  game: RtGameState,
  screen: string,
): void {
  const shouldPlay =
    screen === "game" &&
    game.status === "running" &&
    !game.paused &&
    !game.morningReport;

  useEffect(() => {
    if (shouldPlay) {
      startMainTheme();
    } else {
      pauseMainTheme();
    }
  }, [shouldPlay]);

  useEffect(() => () => pauseMainTheme(), []);
}

export function useGlobalButtonSounds(): void {
  useEffect(() => {
    function handleClick(event: MouseEvent): void {
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest("button");
      if (!button || button.disabled) return;
      playSoundEffect(readButtonSoundEffect(button));
    }

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);
}

function readButtonSoundEffect(button: HTMLButtonElement): SoundEffectName {
  const requested = button.dataset.soundEffect;
  return isSoundEffectName(requested) ? requested : "buttonClick";
}

function isSoundEffectName(value: string | undefined): value is SoundEffectName {
  return Boolean(value && SOUND_EFFECT_NAMES.includes(value as SoundEffectName));
}

export function useGameEventSounds({
  game,
  screen,
  soundEventKeysRef,
}: {
  game: RtGameState;
  screen: string;
  soundEventKeysRef: MutableRefObject<Set<string>>;
}): void {
  useEffect(() => {
    if (screen !== "game") return;
    for (const event of game.log.slice().reverse()) {
      const key = gameEventKey(event);
      if (soundEventKeysRef.current.has(key)) continue;
      soundEventKeysRef.current.add(key);

      if (event.type === "task_spawned") {
        playSoundEffect("newTask");
      } else if (event.type === "backlog_opportunity_expired") {
        playSoundEffect("backlogEnd");
      } else if (isCharacterWorkCompletedEvent(event)) {
        playSoundEffect("subtaskCompleted");
      } else if (event.type === "release_train" || event.type === "release_train_empty") {
        playSoundEffect("dayEnd");
      } else if (event.type === "quarter_review") {
        playSoundEffect("quarterEnd");
      }
    }
  }, [game.log, screen, soundEventKeysRef]);
}

function isCharacterWorkCompletedEvent(event: RtEvent): boolean {
  return (
    event.type === "analysis_done" ||
    event.type === "subtask_done" ||
    event.type === "bugfix_done" ||
    event.type === "qa_done"
  );
}
