import type {
  RtEvent,
  RtGameState,
  RtLossReport,
  RtReleaseReadiness,
  RtVictoryGrade,
  RtVictoryReport,
} from "./types";
import { releaseReadiness } from "./readiness";
import { renderTaskNarrative } from "./narrative";

type LossEventSink = (event: Omit<RtEvent, "at">) => void;

export function checkRunState(state: RtGameState, emit: LossEventSink): void {
  if (state.status !== "running") return;
  state.peakDebt = Math.max(state.peakDebt, state.resources.debt);
  if (state.resources.trust <= 0) {
    loseRun(state, emit, "business trust reached 0", "trust");
  }
  if (state.resources.clients <= 0) {
    loseRun(state, emit, "clients left the product", "clients");
  }
  if (state.resources.debt >= 100) {
    loseRun(state, emit, "technical debt reached 100", "debt");
  }
  if (state.status === "running" && state.day > state.calendar.daysPerYear) {
    winRun(state, emit);
  }
}

function loseRun(
  state: RtGameState,
  emit: LossEventSink,
  reason: string,
  primaryMetric: RtLossReport["primaryMetric"],
): void {
  if (state.status === "lost") return;
  state.status = "lost";
  state.lossReason = reason;
  state.lossReport = buildLossReport(state, reason, primaryMetric);
  emit({
    type: "run_lost",
    title: "Run lost",
    body: state.lossReport.explanation,
    effects: [
      `trust ${state.resources.trust}`,
      `clients ${state.resources.clients}`,
      `debt ${state.resources.debt}`,
    ],
  });
}

function winRun(state: RtGameState, emit: LossEventSink): void {
  if (state.status !== "running") return;
  state.status = "won";
  state.paused = true;
  state.victoryReport = buildVictoryReport(state);
  emit({
    type: "run_won",
    title: "Run won",
    body: state.victoryReport.summary,
    effects: [
      `grade ${state.victoryReport.grade}`,
      `score ${state.victoryReport.score}`,
      `day ${state.day - 1}/${state.calendar.daysPerYear}`,
      `trust ${state.resources.trust}`,
      `clients ${state.resources.clients}`,
      `debt ${state.resources.debt}`,
      `value ${state.resources.value}`,
    ],
  });
}

function buildVictoryReport(state: RtGameState): RtVictoryReport {
  const releasedTasks = Object.values(state.tasks).filter((task) => task.released);
  const releaseMix = releasedTasks.reduce(
    (acc, task) => {
      acc[releaseReadiness(task).readiness] += 1;
      return acc;
    },
    { clean: 0, risky: 0, dirty: 0 } satisfies Record<RtReleaseReadiness, number>,
  );
  const falloutTasks = Object.values(state.tasks).filter((task) => Boolean(task.rootCauseTaskId));
  const falloutResolved = falloutTasks.filter((task) => task.released || task.resolved).length;
  const unresolvedFallout = falloutTasks.length - falloutResolved;
  const missedTasks = Object.values(state.tasks).filter(
    (task) => task.resolution === "missed_minor" || task.resolution === "missed_tail" || task.resolution === "missed_terminal",
  ).length;
  const missedOpportunities = Object.values(state.tasks).filter(
    (task) => task.resolution === "backlog_opportunity_expired",
  ).length;
  const totalBurnout = Math.round(
    Object.values(state.characters).reduce((sum, character) => sum + character.burnout, 0),
  );
  const score = clampVictoryScore(
    100 -
      (100 - state.resources.trust) * 0.35 -
      (100 - state.resources.clients) * 0.45 -
      state.resources.debt * 0.3 -
      releaseMix.risky * 1.2 -
      releaseMix.dirty * 4 -
      unresolvedFallout * 5 -
      missedTasks * 2 -
      missedOpportunities * 1.5 -
      totalBurnout * 0.45,
  );
  const grade = gradeVictory(score);
  const summary = `The team survived the production year with grade ${grade}.`;
  return {
    grade,
    score,
    headline: "Year survived.",
    summary,
    resourceSnapshot: { ...state.resources },
    stats: {
      daysSurvived: state.calendar.daysPerYear,
      releasedClean: releaseMix.clean,
      releasedRisky: releaseMix.risky,
      releasedDirty: releaseMix.dirty,
      falloutCreated: falloutTasks.length,
      falloutResolved,
      unresolvedFallout,
      missedTasks,
      missedOpportunities,
      totalBurnout,
      peakDebt: state.peakDebt,
    },
    notes: victoryNotes(grade, state.resources.debt, unresolvedFallout, totalBurnout),
  };
}

function clampVictoryScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function gradeVictory(score: number): RtVictoryGrade {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  return "D";
}

function victoryNotes(
  grade: RtVictoryGrade,
  debt: number,
  unresolvedFallout: number,
  totalBurnout: number,
): string[] {
  const notes = [`Grade ${grade} reflects the state of the product after day 80.`];
  if (debt >= 70) notes.push("Debt stayed high; the team survived, but future work is fragile.");
  if (unresolvedFallout > 0) notes.push(`${unresolvedFallout} fallout task(s) remained unresolved.`);
  if (totalBurnout >= 20) notes.push("The team carried noticeable burnout into the next year.");
  if (notes.length === 1) notes.push("The year ended in stable shape.");
  return notes;
}

function buildLossReport(
  state: RtGameState,
  reason: string,
  primaryMetric: RtLossReport["primaryMetric"],
): RtLossReport {
  const lastMissedTasks = state.log
    .filter(
      (event) =>
        event.type === "missed_task_resolved" ||
        event.type === "missed_minor_hit" ||
        event.type === "missed_tail_blocked" ||
        event.type === "backlog_opportunity_expired",
    )
    .slice(0, 5)
    .map((event) => ({
      at: event.at,
      title: event.title,
      effects: event.effects,
    }));
  const lastBadReleases = state.log
    .filter(
      (event) =>
        event.type === "release" &&
        event.effects.some((effect) => effect.startsWith("trust -") || effect.startsWith("clients -")),
    )
    .slice(0, 5)
    .map((event) => ({
      at: event.at,
      title: event.title,
      effects: event.effects,
    }));
  const activePressure = Object.values(state.tasks)
    .filter((task) => !task.released && !task.resolved)
    .sort((a, b) => a.deadlineMs - b.deadlineMs)
    .slice(0, 6)
    .map((task) => ({
      id: task.id,
      title: renderTaskNarrative(task, state.locale).title,
      column: task.column,
      deadlineMs: Math.round(task.deadlineMs),
      assignedCharacterId: task.assignedCharacterId,
    }));

  const headline =
    primaryMetric === "trust"
      ? "Business trust hit zero."
      : primaryMetric === "clients"
        ? "Customers left the product."
        : "Technical debt overwhelmed the product.";
  const badReleaseCount = lastBadReleases.length;
  const explanation =
    primaryMetric === "trust"
      ? `Trust fell to 0. The latest run had ${badReleaseCount} recent release(s) that hurt trust or clients.`
      : primaryMetric === "clients"
        ? `Clients fell to 0. Recent low-quality releases and missed work made customers leave.`
        : `Debt reached 100. Recent releases and ignored backlog opportunities made future work too hard.`;
  const suggestion =
    badReleaseCount > 0
      ? "Do more Analysis, assign QA in To Do, and fix bugfix subtasks before moving cards to Done."
      : "Pick valuable backlog tasks before their opportunity value fades, and keep clean releases reducing debt.";

  return {
    reason,
    headline,
    explanation,
    primaryMetric,
    resourceSnapshot: { ...state.resources },
    lastMissedTasks,
    lastBadReleases,
    activePressure,
    suggestion,
  };
}
