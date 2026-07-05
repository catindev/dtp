import { useEffect, type Dispatch, type SetStateAction } from "react";
import { type RtGameState } from "../realtime/simulation";

export function useSelectedTaskSync(
  game: RtGameState,
  selectedTaskId: string | null,
  setSelectedTaskId: Dispatch<SetStateAction<string | null>>,
  selectedCharacterId: string | null,
  setSelectedCharacterId: Dispatch<SetStateAction<string | null>>,
): void {
  useEffect(() => {
    if (selectedTaskId && !game.tasks[selectedTaskId]) {
      setSelectedTaskId(null);
    }
    if (selectedCharacterId && !game.characters[selectedCharacterId]) {
      setSelectedCharacterId(null);
    }
  }, [game, selectedCharacterId, selectedTaskId, setSelectedCharacterId, setSelectedTaskId]);
}
