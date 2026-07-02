import type {
  RtCharacter,
  RtEventData,
} from "./types";

export function characterEventData(
  character: RtCharacter,
  extra: RtEventData = {},
): RtEventData {
  return {
    characterId: character.id,
    characterName: character.name,
    characterRole: character.role,
    ...extra,
  };
}
