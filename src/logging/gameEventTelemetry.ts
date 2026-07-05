import {
  formatGameTime,
  type RtEvent,
  type RtGameState,
  type RtEventData,
} from "../realtime/simulation";

export interface GameEventTelemetryPayload {
  channel: "game_event";
  eventType: string;
  at: string;
  gameTime: string;
  day: number;
  campaignDay: number;
  elapsedGameMinutes: number;
  status: RtGameState["status"];
  lossReason: RtGameState["lossReason"];
  taskId: string | null;
  characterId: string | null;
  characterRole: string | null;
  actorType: string | null;
  actorId: string | null;
  workType: string | null;
  subtaskRole: string | null;
  effects: string[];
  data: RtEventData | null;
  resources: {
    trust: number;
    clients: number;
    debt: number;
    value: number;
    budget: number;
  };
}

export function buildGameEventTelemetry(
  game: RtGameState,
  event: RtEvent,
): GameEventTelemetryPayload {
  const data = event.data ?? null;
  return {
    channel: "game_event",
    eventType: event.type,
    at: event.at,
    gameTime: formatGameTime(game),
    day: game.day,
    campaignDay: game.calendar.campaignDay,
    elapsedGameMinutes: Math.round(game.elapsedGameMinutes),
    status: game.status,
    lossReason: game.lossReason,
    taskId: stringData(data, "taskId") ?? parseTaskId(event.title),
    characterId: stringData(data, "characterId"),
    characterRole: stringData(data, "characterRole"),
    actorType: stringData(data, "actorType"),
    actorId: stringData(data, "actorId"),
    workType: stringData(data, "workType"),
    subtaskRole: stringData(data, "subtaskRole"),
    effects: event.effects,
    data,
    resources: {
      trust: game.resources.trust,
      clients: game.resources.clients,
      debt: game.resources.debt,
      value: game.resources.value,
      budget: game.resources.budget,
    },
  };
}

function stringData(data: RtEventData | null, key: string): string | null {
  const value = data?.[key];
  return typeof value === "string" ? value : null;
}

function parseTaskId(title: string): string | null {
  const match = /^(?<id>[A-Z]+-\d+)/.exec(title);
  return match?.groups?.id ?? null;
}
