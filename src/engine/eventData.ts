import type {
  RtCharacter,
  RtEvent,
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

export function characterWorkPassCompletedData(
  character: RtCharacter,
  extra: RtEventData = {},
): RtEventData {
  return {
    ...characterEventData(character),
    ...extra,
    workPassCompleted: true,
    actorType: "character",
    actorId: character.id,
  };
}

export function outsourceWorkPassCompletedData(extra: RtEventData = {}): RtEventData {
  return {
    ...extra,
    workPassCompleted: true,
    actorType: "outsource",
    actorId: "outsourcing",
  };
}

export function isWorkPassCompletedEvent(event: RtEvent): boolean {
  return event.data?.workPassCompleted === true && typeof event.data.taskId === "string";
}

export function workPassCompletedTaskId(event: RtEvent): string | null {
  return isWorkPassCompletedEvent(event) && typeof event.data?.taskId === "string"
    ? event.data.taskId
    : null;
}
