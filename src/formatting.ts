import { RELEASE_TRAIN_GAME_MINUTE, type RtGameState } from "./realtime/simulation";

export function formatReleaseCountdown(game: RtGameState): string {
  const minutesUntil = Math.max(0, RELEASE_TRAIN_GAME_MINUTE - game.gameMinuteOfDay);
  const roundedMinutes = Math.max(0, Math.ceil(minutesUntil));
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

export function formatSessionId(sessionId: string): string {
  const [prefix, timestamp, ...rest] = sessionId.split("-");
  const suffix = rest.join("-").slice(-8);
  if (!prefix || !timestamp || !suffix) return sessionId;
  return `${prefix}-${timestamp}-${suffix}`;
}
