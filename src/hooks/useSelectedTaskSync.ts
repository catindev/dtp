import { useEffect, type Dispatch, type SetStateAction } from "react";
import { type RtGameState } from "../realtime/simulation";
import { initialSelectedTaskId } from "./useGameActions";

export function useSelectedTaskSync(
  game: RtGameState,
  selectedTaskId: string | null,
  setSelectedTaskId: Dispatch<SetStateAction<string | null>>,
): void {
  useEffect(() => {
    if (selectedTaskId && !game.tasks[selectedTaskId]) {
      setSelectedTaskId(initialSelectedTaskId(game));
    }
  }, [game, selectedTaskId, setSelectedTaskId]);
}
