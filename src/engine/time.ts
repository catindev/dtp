import {
  NIGHT_STAMINA_MIN_RECOVERY,
  NIGHT_STAMINA_RECOVERY_RATIO,
  RELEASE_TRAIN_GAME_MINUTE,
} from "./balance";
import {
  isUntouchedBacklogTask,
  updateBacklogOpportunity,
} from "./backlogOpportunity";
import { createCampaignCalendar } from "./calendar";
import {
  ensureUnlockedHorizonGoals,
  resolveDueHorizonReviews,
} from "./goals";
import { clamp } from "./math";
import type {
  RtEvent,
  RtGameState,
  RtHorizonReviewReport,
} from "./types";

type TimeEventSink = (event: Omit<RtEvent, "at">) => void;

export function updateTaskTimers(state: RtGameState, tickMs: number, emit: TimeEventSink): void {
  for (const task of Object.values(state.tasks)) {
    if (task.released || task.column === "done") continue;
    if (isUntouchedBacklogTask(task)) {
      updateBacklogOpportunity(state, task, tickMs, emit);
      continue;
    }
    if (task.deadlineMs > 0) {
      const nextDeadlineMs = task.deadlineMs - tickMs;
      if (nextDeadlineMs < 0) {
        task.overdueMs += Math.abs(nextDeadlineMs);
      }
      task.deadlineMs = Math.max(0, nextDeadlineMs);
    } else {
      task.overdueMs += tickMs;
    }
  }
}

export function updateShock(state: RtGameState, gameMinutes: number): void {
  for (const character of Object.values(state.characters)) {
    character.shockGameMinutes = Math.max(0, character.shockGameMinutes - gameMinutes);
    if (!character.assignedTaskId && !character.exhaustedToday) {
      character.stamina = clamp(character.stamina + gameMinutes * 0.12, 0, 100);
    }
  }
}

export function crossedReleaseTrain(previousMinute: number, nextMinute: number): boolean {
  return previousMinute < RELEASE_TRAIN_GAME_MINUTE && nextMinute >= RELEASE_TRAIN_GAME_MINUTE;
}

export function formatGameTime(state: RtGameState): string {
  const hour = Math.floor(state.gameMinuteOfDay / 60);
  const minute = Math.floor(state.gameMinuteOfDay % 60);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function advanceDay(
  state: RtGameState,
  emit: TimeEventSink,
): RtHorizonReviewReport[] {
  const horizonReviews = resolveDueHorizonReviews(state, emit);
  restTeamForNewDay(state);
  state.day += 1;
  state.calendar = createCampaignCalendar(state.day);
  state.dayInQuarter = state.calendar.dayInQuarter;
  state.daysPerQuarter = state.calendar.daysPerQuarter;
  emit({
    type: "day_started",
    title: `Day ${state.day}`,
    body: "A new production day starts. The team had overnight rest.",
    effects: ["stamina restored overnight", "context shock cleared", "clock reset to 08:00"],
  });

  ensureUnlockedHorizonGoals(state, emit);
  return horizonReviews;
}

function restTeamForNewDay(state: RtGameState): void {
  for (const character of Object.values(state.characters)) {
    const missingStamina = 100 - character.stamina;
    const overnightRecovery = Math.max(
      NIGHT_STAMINA_MIN_RECOVERY,
      missingStamina * NIGHT_STAMINA_RECOVERY_RATIO,
    );
    character.stamina = clamp(character.stamina + overnightRecovery, 0, 100);
    character.shockGameMinutes = 0;
    character.exhaustedToday = false;
  }
}
