import { HORIZON_GOAL_CONFIG } from "./balance";
import type {
  RtEvent,
  RtGameState,
  RtHorizonGoal,
  RtHorizonGoals,
  RtHorizonKind,
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
