import type {
  RtGameState,
  RtHorizonReviewReport,
  RtMorningReport,
} from "../realtime/simulation";

export interface DaySummaryTelemetryPayload {
  channel: "summary";
  summaryType: "day";
  reportId: string;
  day: number;
  previousDay: number;
  campaignDay: number;
  shippedTaskIds: string[];
  missedTaskIds: string[];
  consequenceCount: number;
  generatedConsequenceCount: number;
  terminalConsequenceCount: number;
  resourceDelta: RtMorningReport["resourceDelta"];
  releaseDelta: RtMorningReport["releaseDelta"];
  consequenceDelta: RtMorningReport["consequenceDelta"];
  daySummary: RtMorningReport["daySummary"];
  horizonReviews: Array<Pick<
    RtHorizonReviewReport,
    | "kind"
    | "id"
    | "hitGoal"
    | "valueActual"
    | "valueTarget"
    | "trustActual"
    | "trustTarget"
    | "rawTrustDamage"
    | "cappedTrustDamage"
  >>;
  resourcesAfter: RtGameState["resources"];
}

export function buildDaySummaryTelemetry(
  game: RtGameState,
  report: RtMorningReport,
): DaySummaryTelemetryPayload {
  return {
    channel: "summary",
    summaryType: "day",
    reportId: report.id,
    day: report.day,
    previousDay: report.previousDay,
    campaignDay: report.daySummary.campaignDay,
    shippedTaskIds: report.shippedTaskIds,
    missedTaskIds: report.missedTaskIds,
    consequenceCount: report.consequences.length,
    generatedConsequenceCount: report.consequences.filter((consequence) => consequence.generatedTaskId).length,
    terminalConsequenceCount: report.consequences.filter((consequence) => consequence.terminal).length,
    resourceDelta: report.resourceDelta,
    releaseDelta: report.releaseDelta,
    consequenceDelta: report.consequenceDelta,
    daySummary: report.daySummary,
    horizonReviews: report.horizonReviews.map((review) => ({
      kind: review.kind,
      id: review.id,
      hitGoal: review.hitGoal,
      valueActual: review.valueActual,
      valueTarget: review.valueTarget,
      trustActual: review.trustActual,
      trustTarget: review.trustTarget,
      rawTrustDamage: review.rawTrustDamage,
      cappedTrustDamage: review.cappedTrustDamage,
    })),
    resourcesAfter: game.resources,
  };
}
