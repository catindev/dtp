import {
  GAME_DAY_START_MINUTE,
  RELEASE_TRAIN_GAME_MINUTE,
} from "./balance";
import {
  collectMissedTaskIds,
  generateMorningConsequences,
  type ConsequenceRuntime,
} from "./consequences";
import {
  copyResources,
  diffResources,
  morningReportEffects,
} from "./resources";
import { releaseReadiness } from "./readiness";
import { runDailyReleaseTrain } from "./release";
import {
  advanceDay,
  formatGameTime,
} from "./time";
import type {
  RtDaySummary,
  RtEvent,
  RtGameState,
  RtReleaseConsequence,
  RtTask,
} from "./types";

type MorningEventSink = (event: Omit<RtEvent, "at">) => void;

export interface MorningRuntime extends ConsequenceRuntime {
  emit: MorningEventSink;
}

export function openMorningReport(state: RtGameState, runtime: MorningRuntime): void {
  state.gameMinuteOfDay = RELEASE_TRAIN_GAME_MINUTE;

  const releaseQuarter = state.quarter;
  const releaseDay = state.day;
  const resourceBefore = copyResources(state.resources);
  const shippedTaskIds = runDailyReleaseTrain(state, runtime.emit);
  const resourceAfterRelease = copyResources(state.resources);
  const releaseDelta = diffResources(resourceBefore, resourceAfterRelease);
  const missedTaskIds = collectMissedTaskIds(state);
  const quarterReview = advanceDay(state, runtime.emit);
  const resourceAfterQuarter = copyResources(state.resources);
  state.gameMinuteOfDay = GAME_DAY_START_MINUTE;
  const consequences = generateMorningConsequences(state, shippedTaskIds, missedTaskIds, runtime);
  const resourceAfter = copyResources(state.resources);
  const resourceDelta = diffResources(resourceBefore, resourceAfter);
  const consequenceDelta = diffResources(resourceAfterQuarter, resourceAfter);
  const effects = morningReportEffects(resourceDelta);
  const daySummary = buildDaySummary(
    state,
    releaseDay,
    shippedTaskIds,
    missedTaskIds,
    consequences,
  );

  state.morningReport = {
    id: `morning-${releaseQuarter}-${releaseDay}-${state.elapsedRealMs}`,
    quarter: state.quarter,
    day: state.day,
    previousDay: releaseDay,
    at: formatGameTime(state),
    shippedTaskIds,
    resourceBefore,
    resourceAfter,
    resourceDelta,
    releaseDelta,
    consequenceDelta,
    quarterReview,
    empty:
      shippedTaskIds.length === 0 &&
      missedTaskIds.length === 0 &&
      daySummary.backlogExpiredCount === 0,
    effects,
    missedTaskIds,
    consequences,
    daySummary,
  };
  state.paused = true;

  runtime.emit({
    type: "day_summary",
    title: `Day ${releaseDay} summary`,
    body: `${daySummary.shipped} shipped, ${daySummary.missedBacklog + daySummary.missedInProgress} missed, ${daySummary.backlogExpiredCount} backlog expired, ${daySummary.unresolvedFallout} unresolved fallout.`,
    effects: [
      `clean ${daySummary.releasedClean}`,
      `risky ${daySummary.releasedRisky}`,
      `dirty ${daySummary.releasedDirty}`,
      `missed backlog ${daySummary.missedBacklog}`,
      `missed progress ${daySummary.missedInProgress}`,
      `backlog expired ${daySummary.backlogExpiredCount}`,
      `backlog value lost ${daySummary.backlogValueLost}`,
      `backlog debt +${daySummary.backlogDebtAdded}`,
      `fallout +${daySummary.falloutCreated}`,
      `resolved ${daySummary.falloutResolved}`,
      `unresolved ${daySummary.unresolvedFallout}`,
      `terminal ${daySummary.terminalConsequences}`,
    ],
  });

  runtime.emit({
    type: "morning_report_opened",
    title: `Morning briefing Day ${state.day}`,
    body:
      shippedTaskIds.length > 0 || missedTaskIds.length > 0 || daySummary.backlogExpiredCount > 0
        ? `${shippedTaskIds.length} shipped, ${missedTaskIds.length} missed, ${daySummary.backlogExpiredCount} backlog expired. ${consequences.length} consequence(s) shaped today's backlog.`
        : "No tasks shipped or expired yesterday. The team starts with the existing backlog.",
    effects: [
      ...effects,
      ...(daySummary.backlogExpiredCount > 0
        ? [
            `backlog expired ${daySummary.backlogExpiredCount}`,
            `backlog value lost ${daySummary.backlogValueLost}`,
            `backlog debt +${daySummary.backlogDebtAdded}`,
          ]
        : ["no backlog decay loss"]),
      ...(consequences.length > 0 ? [`consequences ${consequences.length}`] : ["no fallout"]),
      `unresolved fallout ${daySummary.unresolvedFallout}`,
    ],
  });
}

function buildDaySummary(
  state: RtGameState,
  day: number,
  shippedTaskIds: string[],
  missedTaskIds: string[],
  consequences: RtReleaseConsequence[],
): RtDaySummary {
  const shippedReports = shippedTaskIds
    .map((taskId) => state.tasks[taskId])
    .filter((task): task is RtTask => Boolean(task))
    .map((task) => releaseReadiness(task).readiness);
  const missedTasks = missedTaskIds
    .map((taskId) => state.tasks[taskId])
    .filter((task): task is RtTask => Boolean(task));

  return {
    day,
    shipped: shippedTaskIds.length,
    releasedClean: shippedReports.filter((readiness) => readiness === "clean").length,
    releasedRisky: shippedReports.filter((readiness) => readiness === "risky").length,
    releasedDirty: shippedReports.filter((readiness) => readiness === "dirty").length,
    missedBacklog: consequences.filter((consequence) => consequence.source === "missed_backlog").length,
    missedInProgress: consequences.filter((consequence) => consequence.source === "missed_in_progress").length,
    missedMinor: missedTasks.filter((task) => task.resolution === "missed_minor").length,
    backlogValueLost: state.backlogDecayToday.valueLost,
    backlogExpiredCount: state.backlogDecayToday.expiredCount,
    backlogDebtAdded: state.backlogDecayToday.debtAdded,
    falloutCreated: consequences.filter((consequence) => consequence.generatedTaskId).length,
    falloutResolved:
      shippedTaskIds.filter((taskId) => Boolean(state.tasks[taskId]?.rootCauseTaskId)).length +
      missedTasks.filter((task) => Boolean(task.rootCauseTaskId)).length,
    unresolvedFallout: Object.values(state.tasks).filter(
      (task) => Boolean(task.rootCauseTaskId) && !task.released && !task.resolved,
    ).length,
    terminalConsequences: consequences.filter((consequence) => consequence.terminal).length,
  };
}
