import { type Dispatch, type SetStateAction } from "react";
import { normalizeRealtimeState, type RtGameState } from "../realtime/simulation";

export function useGameMutation(
  screen: string,
  setGame: Dispatch<SetStateAction<RtGameState>>,
) {
  function mutate(updater: (draft: RtGameState) => void) {
    setGame((current) => {
      if (
        screen !== "game" ||
        current.paused ||
        current.status !== "running" ||
        current.morningReport
      ) {
        return current;
      }
      const draft = structuredClone(current) as RtGameState;
      normalizeRealtimeState(draft);
      updater(draft);
      return draft;
    });
  }

  return mutate;
}
