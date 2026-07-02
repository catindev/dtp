import {
  BACKLOG_EXPIRED_DEBT_MAX,
  BACKLOG_EXPIRED_DEBT_MIN,
  BACKLOG_EXPIRED_DEBT_VALUE_DIVISOR,
  BACKLOG_VALUE_DECAY_MS,
  MAX_BACKLOG_DECAY_DEBT_PER_DAY,
} from "./balance";
import { clamp } from "./math";
import {
  applyResourceDelta,
  resourceDeltaEffects,
} from "./resources";
import type {
  RtBacklogDecayDayStats,
  RtEvent,
  RtGameState,
  RtTask,
} from "./types";

type BacklogOpportunityEventSink = (event: Omit<RtEvent, "at">) => void;

export function createBacklogDecayDayStats(): RtBacklogDecayDayStats {
  return {
    valueLost: 0,
    expiredCount: 0,
    debtAdded: 0,
    expiredTaskIds: [],
  };
}

export function ensureBacklogOpportunityFields(task: RtTask): boolean {
  let changed = false;
  const legacy = task as RtTask & {
    baseValue?: number;
    backlogValue?: number;
    backlogDecayElapsedMs?: number;
    backlogDecayDurationMs?: number;
    engagedOnce?: boolean;
  };

  if (typeof legacy.baseValue !== "number" || !Number.isFinite(legacy.baseValue)) {
    task.baseValue = Math.max(0, task.value);
    changed = true;
  }
  if (typeof legacy.backlogValue !== "number" || !Number.isFinite(legacy.backlogValue)) {
    task.backlogValue = Math.max(0, task.value);
    changed = true;
  }
  if (
    typeof legacy.backlogDecayElapsedMs !== "number" ||
    !Number.isFinite(legacy.backlogDecayElapsedMs) ||
    legacy.backlogDecayElapsedMs < 0
  ) {
    task.backlogDecayElapsedMs = 0;
    changed = true;
  }
  if (
    typeof legacy.backlogDecayDurationMs !== "number" ||
    !Number.isFinite(legacy.backlogDecayDurationMs) ||
    legacy.backlogDecayDurationMs <= 0
  ) {
    task.backlogDecayDurationMs = BACKLOG_VALUE_DECAY_MS;
    changed = true;
  }
  if (typeof legacy.engagedOnce !== "boolean") {
    task.engagedOnce = task.column !== "backlog" || task.workDone || task.released || task.resolved;
    changed = true;
  }

  task.baseValue = Math.max(0, task.baseValue);
  task.backlogValue = clamp(task.backlogValue, 0, Math.max(task.baseValue, task.value, 0));
  task.backlogDecayElapsedMs = Math.max(0, task.backlogDecayElapsedMs);
  task.backlogDecayDurationMs = Math.max(1, task.backlogDecayDurationMs);
  return changed;
}

export function isUntouchedBacklogTask(task: RtTask): boolean {
  return task.column === "backlog" && !task.engagedOnce && !task.released && !task.resolved;
}

export function backlogValueRatio(task: RtTask): number {
  if (task.baseValue <= 0) return 0;
  return clamp(task.backlogValue / task.baseValue, 0, 1);
}

export function updateBacklogOpportunity(
  state: RtGameState,
  task: RtTask,
  tickMs: number,
  emit: BacklogOpportunityEventSink,
): void {
  if (!isUntouchedBacklogTask(task)) return;

  task.backlogDecayElapsedMs = Math.min(
    task.backlogDecayDurationMs,
    task.backlogDecayElapsedMs + tickMs,
  );
  const remainingRatio = clamp(
    1 - task.backlogDecayElapsedMs / task.backlogDecayDurationMs,
    0,
    1,
  );
  task.backlogValue = task.baseValue * remainingRatio;

  if (task.backlogValue <= 0) {
    expireBacklogOpportunity(state, task, emit);
  }
}

export function commitBacklogOpportunity(
  task: RtTask,
  emit: BacklogOpportunityEventSink,
): void {
  if (task.engagedOnce) return;

  const committedValue = Math.max(1, Math.round(task.backlogValue));
  const lostValue = Math.max(0, Math.round(task.baseValue - committedValue));
  task.engagedOnce = true;
  task.value = committedValue;
  task.backlogValue = committedValue;
  task.lastNote =
    lostValue > 0
      ? "Committed after opportunity decay."
      : "Committed to delivery. Deadline started.";
  emit({
    type: "task_committed",
    title: `${task.id} committed`,
    body: `${task.title} moved from backlog into active delivery.`,
    effects: [
      `value ${committedValue}/${Math.round(task.baseValue)}`,
      ...(lostValue > 0 ? [`opportunity lost ${lostValue}`] : ["full value preserved"]),
      "deadline started",
    ],
  });
}

export function resetBacklogDecayDayStats(state: RtGameState): void {
  state.backlogDecayToday = createBacklogDecayDayStats();
}

function expireBacklogOpportunity(
  state: RtGameState,
  task: RtTask,
  emit: BacklogOpportunityEventSink,
): void {
  const valueLost = Math.round(task.baseValue);
  const desiredDebt = clamp(
    Math.ceil(valueLost / BACKLOG_EXPIRED_DEBT_VALUE_DIVISOR),
    BACKLOG_EXPIRED_DEBT_MIN,
    BACKLOG_EXPIRED_DEBT_MAX,
  );
  const remainingDebtCap = Math.max(0, MAX_BACKLOG_DECAY_DEBT_PER_DAY - state.backlogDecayToday.debtAdded);
  const debtDelta = Math.min(desiredDebt, remainingDebtCap);
  const resourceDelta = applyResourceDelta(state, debtDelta > 0 ? { debt: debtDelta } : {});

  state.board.backlog = state.board.backlog.filter((taskId) => taskId !== task.id);
  task.resolved = true;
  task.resolution = "backlog_opportunity_expired";
  task.resolutionDay = state.day;
  task.backlogValue = 0;
  task.currentSubtaskId = null;
  task.assignedCharacterId = null;
  task.outsourcing = null;
  task.stageProgress = 0;
  task.stageComplete = false;
  task.lastNote = "Opportunity expired in backlog.";

  state.backlogDecayToday.valueLost += valueLost;
  state.backlogDecayToday.expiredCount += 1;
  state.backlogDecayToday.debtAdded += resourceDelta.debt ?? 0;
  state.backlogDecayToday.expiredTaskIds.push(task.id);

  emit({
    type: "backlog_opportunity_expired",
    title: `${task.id} expired`,
    body: `${task.title} faded out before the team picked it up.`,
    effects: [
      `value lost ${valueLost}`,
      ...(resourceDeltaEffects(resourceDelta).length > 0
        ? resourceDeltaEffects(resourceDelta)
        : ["debt cap reached"]),
    ],
  });
}
