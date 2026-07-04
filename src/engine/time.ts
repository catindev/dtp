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
import { ensureUnlockedHorizonGoals } from "./goals";
import { clamp } from "./math";
import {
  copyResources,
  diffResources,
  morningReportEffects,
} from "./resources";
import type {
  RtEvent,
  RtGameState,
  RtQuarterReviewReport,
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
): RtQuarterReviewReport | null {
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

  const quarterReview =
    state.calendar.dayInQuarter === 1 && state.day > 1 ? resolveQuarter(state, emit) : null;
  ensureUnlockedHorizonGoals(state, emit);
  return quarterReview;
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

function resolveQuarter(
  state: RtGameState,
  emit: TimeEventSink,
): RtQuarterReviewReport {
  const reviewedQuarter = state.quarter;
  const valueActual = state.quarterValue;
  const valueTarget = state.quarterGoal.value;
  const trustActual = state.resources.trust;
  const trustTarget = state.quarterGoal.trust;
  const valueMet = valueActual >= valueTarget;
  const trustMet = trustActual >= trustTarget;
  const resourceBefore = copyResources(state.resources);
  const hitGoal = valueMet && trustMet;
  if (hitGoal) {
    state.resources.budget += state.quarterGoal.rewardBudget;
    state.resources.processBoost = clamp(state.resources.processBoost + 5, 0, 25);
  } else {
    state.resources.trust = clamp(state.resources.trust - 8, 0, 100);
  }
  const resourceAfter = copyResources(state.resources);
  const resourceDelta = diffResources(resourceBefore, resourceAfter);
  const effects = morningReportEffects(resourceDelta);

  emit({
    type: "quarter_review",
    title: `Quarter ${reviewedQuarter} review`,
    body: hitGoal ? "Business goals were met." : "Business goals were missed.",
    effects,
  });

  const report: RtQuarterReviewReport = {
    quarter: reviewedQuarter,
    hitGoal,
    valueActual,
    valueTarget,
    valueMet,
    trustActual,
    trustTarget,
    trustMet,
    resourceBefore,
    resourceAfter,
    resourceDelta,
    effects,
  };

  state.quarter = state.calendar.quarter;
  state.dayInQuarter = state.calendar.dayInQuarter;
  state.daysPerQuarter = state.calendar.daysPerQuarter;
  state.quarterValue = 0;
  state.quarterGoal = {
    value: Math.round(state.quarterGoal.value * 1.18 + 20),
    trust: Math.min(70, state.quarterGoal.trust + 3),
    rewardBudget: state.quarterGoal.rewardBudget,
  };

  return report;
}
