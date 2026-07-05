import {
  HORIZON_GOAL_CONFIG,
  MAX_HORIZON_TRUST_DAMAGE_PER_DAY,
} from "./balance";
import { clamp } from "./math";
import {
  copyResources,
  diffResources,
  morningReportEffects,
} from "./resources";
import type {
  RtEvent,
  RtGameState,
  RtHorizonGoal,
  RtHorizonGoals,
  RtHorizonKind,
  RtHorizonReviewReport,
} from "./types";

type GoalEventSink = (event: Omit<RtEvent, "at">) => void;

export function createInitialHorizonGoals(state: Pick<RtGameState, "calendar" | "resources">): RtHorizonGoals {
  const goals = emptyHorizonGoals();
  for (const kind of state.calendar.unlockedHorizons) {
    goals[kind] = createHorizonGoal(kind, state.calendar, state.resources.value);
  }
  return goals;
}

export function ensureUnlockedHorizonGoals(state: RtGameState, emit?: GoalEventSink): boolean {
  let changed = false;
  for (const kind of state.calendar.unlockedHorizons) {
    const current = state.horizonGoals[kind];
    if (current && state.day <= current.endsOnDay) continue;
    state.horizonGoals[kind] = createHorizonGoal(kind, state.calendar, state.resources.value);
    changed = true;
    emit?.({
      type: "horizon_goal_opened",
      title: `${kind} goal opened`,
      body: `Target is ${state.horizonGoals[kind]?.expectedValue ?? 0} value above the current baseline.`,
      effects: horizonGoalEffects(state.horizonGoals[kind]),
      data: {
        horizon: kind,
        id: state.horizonGoals[kind]?.id ?? 0,
        openedOnDay: state.horizonGoals[kind]?.openedOnDay ?? state.day,
        endsOnDay: state.horizonGoals[kind]?.endsOnDay ?? state.day,
        startValue: state.horizonGoals[kind]?.startValue ?? state.resources.value,
        expectedValue: state.horizonGoals[kind]?.expectedValue ?? 0,
        targetValue: state.horizonGoals[kind]?.targetValue ?? state.resources.value,
        targetTrust: state.horizonGoals[kind]?.targetTrust ?? state.resources.trust,
      },
    });
  }
  syncLegacyQuarterGoalFromHorizon(state);
  return changed;
}

export function applyValueGainToHorizonGoals(state: RtGameState, valueGain: number): void {
  for (const goal of Object.values(state.horizonGoals)) {
    if (!goal) continue;
    goal.currentValue += valueGain;
  }
  syncLegacyQuarterGoalFromHorizon(state);
}

export function resolveDueHorizonReviews(state: RtGameState, emit: GoalEventSink): RtHorizonReviewReport[] {
  const dueGoals = (["week", "month", "quarter", "year"] as RtHorizonKind[])
    .map((kind) => state.horizonGoals[kind])
    .filter((goal): goal is RtHorizonGoal => goal !== null && state.day >= goal.endsOnDay);
  if (dueGoals.length === 0) return [];

  let todayTrustDamage = 0;
  const reviews: RtHorizonReviewReport[] = [];
  for (const goal of dueGoals) {
    const valueActual = goal.currentValue;
    const valueTarget = goal.expectedValue;
    const valueMet = valueActual >= valueTarget;
    const trustActual = state.resources.trust;
    const trustTarget = goal.targetTrust;
    const trustMet = trustActual >= trustTarget;
    const hitGoal = valueMet && trustMet;
    const rawTrustDamage = hitGoal ? 0 : goal.missedTrustPenalty;
    const cappedTrustDamage = Math.min(
      rawTrustDamage,
      Math.max(0, MAX_HORIZON_TRUST_DAMAGE_PER_DAY - todayTrustDamage),
    );
    const resourceBefore = copyResources(state.resources);

    if (hitGoal) {
      state.resources.budget += goal.rewardBudget;
      state.resources.processBoost = clamp(
        state.resources.processBoost + goal.rewardProcessBoost,
        0,
        25,
      );
    } else if (cappedTrustDamage > 0) {
      state.resources.trust = clamp(state.resources.trust - cappedTrustDamage, 0, 100);
      todayTrustDamage += cappedTrustDamage;
    }

    const resourceAfter = copyResources(state.resources);
    const resourceDelta = diffResources(resourceBefore, resourceAfter);
    const effects = [
      ...morningReportEffects(resourceDelta),
      hitGoal ? "goal met" : "goal missed",
      `value ${valueActual}/${valueTarget}`,
      `trust ${trustActual}/${trustTarget}`,
      `raw trust damage ${rawTrustDamage}`,
      `capped trust damage ${cappedTrustDamage}`,
      `today trust damage ${todayTrustDamage}/${MAX_HORIZON_TRUST_DAMAGE_PER_DAY}`,
    ];
    const review: RtHorizonReviewReport = {
      kind: goal.kind,
      id: goal.id,
      hitGoal,
      valueActual,
      valueTarget,
      valueMet,
      trustActual,
      trustTarget,
      trustMet,
      rawTrustDamage,
      cappedTrustDamage,
      todayTrustDamage,
      dailyTrustDamageCap: MAX_HORIZON_TRUST_DAMAGE_PER_DAY,
      resourceBefore,
      resourceAfter,
      resourceDelta,
      effects,
    };
    reviews.push(review);
    emit({
      type: "horizon_review",
      title: `${goal.kind} ${goal.id} review`,
      body: hitGoal ? "Business goals were met." : "Business goals were missed.",
      effects,
      data: {
        horizon: goal.kind,
        id: goal.id,
        hitGoal,
        valueActual,
        valueTarget,
        trustActual,
        trustTarget,
        rawTrustDamage,
        cappedTrustDamage,
        todayTrustDamage,
      },
    });
  }

  return reviews;
}

export function syncLegacyQuarterGoalFromHorizon(state: RtGameState): void {
  const displayGoal = state.horizonGoals.quarter ?? state.horizonGoals.month ?? state.horizonGoals.week ?? state.horizonGoals.year;
  if (!displayGoal) return;
  state.quarterGoal = {
    value: displayGoal.expectedValue,
    trust: displayGoal.targetTrust,
    rewardBudget: displayGoal.rewardBudget,
  };
  state.quarterValue = displayGoal.currentValue;
}

export function emptyHorizonGoals(): RtHorizonGoals {
  return {
    week: null,
    month: null,
    quarter: null,
    year: null,
  };
}

function createHorizonGoal(kind: RtHorizonKind, calendar: RtGameState["calendar"], currentValue: number): RtHorizonGoal {
  const config = HORIZON_GOAL_CONFIG[kind];
  return {
    kind,
    id: horizonId(kind, calendar),
    openedOnDay: calendar.campaignDay,
    endsOnDay: horizonEndDay(kind, calendar),
    startValue: currentValue,
    expectedValue: config.expectedValue,
    targetValue: currentValue + config.expectedValue,
    currentValue: 0,
    targetTrust: config.trust,
    rewardBudget: config.rewardBudget,
    rewardProcessBoost: config.rewardProcessBoost,
    missedTrustPenalty: config.missedTrustPenalty,
  };
}

function horizonId(kind: RtHorizonKind, calendar: RtGameState["calendar"]): number {
  if (kind === "week") return calendar.week;
  if (kind === "month") return calendar.month;
  if (kind === "quarter") return calendar.quarter;
  return calendar.year;
}

function horizonEndDay(kind: RtHorizonKind, calendar: RtGameState["calendar"]): number {
  if (kind === "week") return calendar.week * calendar.daysPerWeek;
  if (kind === "month") return calendar.month * calendar.daysPerMonth;
  if (kind === "quarter") return calendar.quarter * calendar.daysPerQuarter;
  return calendar.daysPerYear;
}

function horizonGoalEffects(goal: RtHorizonGoal | null): string[] {
  if (!goal) return ["goal unavailable"];
  return [
    `${goal.kind} ${goal.id}`,
    `start value ${goal.startValue}`,
    `expected +${goal.expectedValue}`,
    `target value ${goal.targetValue}`,
    `trust target ${goal.targetTrust}`,
  ];
}
