import { createCampaignCalendar } from "./calendar";
import { emptyResourceDelta } from "./resources";
import type {
  RtConsequenceSource,
  RtDaySummary,
  RtGameState,
  RtMorningReport,
  RtQuarterReviewReport,
  RtReleaseConsequence,
  RtResources,
} from "./types";

type LegacyRealtimeReportState = RtGameState & {
  releaseReview?: RtMorningReport | null;
  morningReport?: RtMorningReport | null;
};

export function normalizeMorningReportState(
  state: RtGameState,
  legacyState: LegacyRealtimeReportState,
): boolean {
  let changed = false;

  if (!("morningReport" in legacyState)) {
    state.morningReport = null;
    changed = true;
  }
  if (legacyState.releaseReview && !state.morningReport) {
    state.morningReport = {
      ...legacyState.releaseReview,
      previousDay: legacyState.releaseReview.previousDay ?? legacyState.releaseReview.day,
      at: "08:00",
      releaseDelta:
        (legacyState.releaseReview as RtMorningReport & { releaseDelta?: RtResources })
          .releaseDelta ?? emptyResourceDelta(),
      consequenceDelta:
        (legacyState.releaseReview as RtMorningReport & { consequenceDelta?: RtResources })
          .consequenceDelta ?? emptyResourceDelta(),
      quarterReview:
        (legacyState.releaseReview as RtMorningReport & {
          quarterReview?: RtQuarterReviewReport | null;
        }).quarterReview ?? null,
      missedTaskIds: legacyState.releaseReview.missedTaskIds ?? [],
      consequences: legacyState.releaseReview.consequences ?? [],
      daySummary:
        legacyState.releaseReview.daySummary ??
        emptyDaySummary(legacyState.releaseReview.day ?? state.day),
    };
    changed = true;
  }
  if (state.morningReport) {
    const legacyMorningReport = state.morningReport as RtMorningReport & {
      releaseDelta?: RtResources;
      consequenceDelta?: RtResources;
      quarterReview?: RtQuarterReviewReport | null;
    };
    if (!Array.isArray(state.morningReport.missedTaskIds)) {
      state.morningReport.missedTaskIds = [];
      changed = true;
    }
    if (!state.morningReport.daySummary) {
      state.morningReport.daySummary = emptyDaySummary(state.morningReport.previousDay);
      changed = true;
    } else if (normalizeDaySummary(state.morningReport.daySummary)) {
      changed = true;
    }
    if (!legacyMorningReport.releaseDelta) {
      legacyMorningReport.releaseDelta = emptyResourceDelta();
      changed = true;
    }
    if (!legacyMorningReport.consequenceDelta) {
      legacyMorningReport.consequenceDelta = emptyResourceDelta();
      changed = true;
    }
    if (legacyMorningReport.quarterReview === undefined) {
      legacyMorningReport.quarterReview = null;
      changed = true;
    }
    for (const consequence of state.morningReport.consequences) {
      if (normalizeMorningConsequence(consequence)) {
        changed = true;
      }
    }
  }

  return changed;
}

export function emptyDaySummary(day: number): RtDaySummary {
  const calendar = createCampaignCalendar(day);
  return {
    day,
    campaignDay: day,
    weekId: calendar.week,
    monthId: calendar.month,
    quarterId: calendar.quarter,
    shipped: 0,
    releasedClean: 0,
    releasedRisky: 0,
    releasedDirty: 0,
    missedBacklog: 0,
    missedInProgress: 0,
    missedMinor: 0,
    backlogValueLost: 0,
    backlogExpiredCount: 0,
    backlogDebtAdded: 0,
    falloutCreated: 0,
    falloutResolved: 0,
    unresolvedFallout: 0,
    terminalConsequences: 0,
  };
}

function normalizeDaySummary(summary: RtDaySummary): boolean {
  let changed = false;
  const legacySummary = summary as RtDaySummary & {
    campaignDay?: number;
    weekId?: number;
    monthId?: number;
    quarterId?: number;
  };
  const calendar = createCampaignCalendar(summary.day);
  if (typeof legacySummary.campaignDay !== "number") {
    summary.campaignDay = summary.day;
    changed = true;
  }
  if (typeof legacySummary.weekId !== "number") {
    summary.weekId = calendar.week;
    changed = true;
  }
  if (typeof legacySummary.monthId !== "number") {
    summary.monthId = calendar.month;
    changed = true;
  }
  if (typeof legacySummary.quarterId !== "number") {
    summary.quarterId = calendar.quarter;
    changed = true;
  }
  for (const key of ["backlogValueLost", "backlogExpiredCount", "backlogDebtAdded"] as const) {
    if (typeof summary[key] !== "number" || !Number.isFinite(summary[key])) {
      summary[key] = 0;
      changed = true;
    }
  }
  return changed;
}

function normalizeMorningConsequence(consequence: RtReleaseConsequence): boolean {
  let changed = false;
  const legacyConsequence = consequence as RtReleaseConsequence & {
    source?: RtConsequenceSource;
    terminal?: boolean;
    resourceDelta?: Partial<RtResources>;
    rootCauseTaskId?: string;
    chainDepth?: number;
  };
  if (!legacyConsequence.source) {
    consequence.source = "release";
    changed = true;
  }
  if (typeof legacyConsequence.terminal !== "boolean") {
    consequence.terminal = false;
    changed = true;
  }
  if (!legacyConsequence.resourceDelta) {
    consequence.resourceDelta = {};
    changed = true;
  }
  if (!legacyConsequence.rootCauseTaskId) {
    consequence.rootCauseTaskId = consequence.sourceTaskId;
    changed = true;
  }
  if (typeof legacyConsequence.chainDepth !== "number") {
    consequence.chainDepth = 0;
    changed = true;
  }
  return changed;
}
