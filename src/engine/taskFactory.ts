import {
  FRONTEND_GUARDRAIL_MIN_MAJOR_WORK,
  FRONTEND_GUARDRAIL_WINDOW,
} from "./balance";
import { DOMAINS, DOMAIN_PREFIXES } from "./catalog";
import { SIM_TEXT, TASK_TITLES } from "./content";
import { normalizeEngineLocale } from "./locale";
import { clamp } from "./math";
import {
  chance,
  pickOne,
  randomBetween,
  randomInt,
  shuffle,
  weightedPick,
} from "./rng";
import type {
  RtBlastRadius,
  RtGameState,
  RtSubtask,
  RtSubtaskImportance,
  RtSubtaskRole,
  RtTask,
  RtTaskKind,
} from "./types";

export function generateTask(state: RtGameState, forcedKind?: RtTaskKind): RtTask {
  const kind = forcedKind ?? chooseTaskKind(state);
  const domain = pickOne(state, DOMAINS);
  const id = `${DOMAIN_PREFIXES[domain]}-${String(state.nextTaskId++).padStart(3, "0")}`;
  const pressure = kind === "incident" ? randomInt(state, 4, 6) : randomInt(state, 1, 5);
  const complexity = randomInt(state, 1, 5);
  const blastRadius = chooseBlastRadius(state, kind, complexity, pressure);
  const trustNoise = (100 - state.resources.trust) * 0.45;
  const debtNoise = state.resources.debt * 0.1;
  const clarity = clamp(randomInt(state, 48, 88) - trustNoise - debtNoise, 8, 92);
  const deadlineMs = Math.round(
    randomBetween(state, 520000, 780000) + complexity * 45000 - pressure * 15000,
  );
  const value = Math.round((8 + complexity * 4 + pressure * 3) * kindValueMultiplier(kind));
  const locale = normalizeEngineLocale(state.locale);
  const subtasks = generateSubtasks(
    state,
    id,
    domain,
    kind,
    complexity,
    blastRadius,
    forcedKind ? false : shouldBiasFrontendWork(state),
  );
  revealInitialSubtasks(state, subtasks, Math.round(clarity));

  return {
    id,
    title: `${id}: ${pickOne(state, TASK_TITLES[locale][kind])}`,
    kind,
    domain,
    blastRadius,
    column: "backlog",
    pressure,
    complexity,
    value,
    clarity: Math.round(clarity),
    quality: Math.max(0, Math.round(clarity * 0.25)),
    testCoverage: 0,
    bugs: 0,
    changedAfterQa: false,
    workDone: false,
    subtasks,
    currentSubtaskId: null,
    offRolePenalty: 0,
    postmortem: [],
    deadlineMs: Math.max(420000, deadlineMs),
    deadlineMaxMs: Math.max(420000, deadlineMs),
    overdueMs: 0,
    stageProgress: 0,
    stageComplete: false,
    assignedCharacterId: null,
    outsourcing: null,
    released: false,
    rootCauseTaskId: null,
    sourceTaskId: null,
    chainDepth: 0,
    resolved: false,
    resolution: null,
    resolutionDay: null,
    releaseScore: null,
    queuedDeadlineMs: null,
    lastNote: "Waiting in backlog.",
  };
}

export function inferBlastRadius(task: RtTask): RtBlastRadius {
  if (
    task.kind === "incident" ||
    task.kind === "performance" ||
    task.kind === "compliance" ||
    task.pressure >= 5 ||
    task.complexity >= 5
  ) {
    return "high";
  }
  if (task.kind === "integration" || task.kind === "techDebt" || task.pressure >= 3) {
    return "medium";
  }
  return "low";
}

function generateSubtasks(
  state: RtGameState,
  taskId: string,
  domain: string,
  kind: RtTaskKind,
  complexity: number,
  blastRadius: RtBlastRadius,
  frontendBias: boolean,
): RtSubtask[] {
  const specs: Array<{
    role: RtSubtaskRole;
    importance: RtSubtaskImportance;
    title: string;
  }> = [];

  const add = (role: RtSubtaskRole, importance: RtSubtaskImportance, title: string) =>
    specs.push({ role, importance, title });
  const text = SIM_TEXT[normalizeEngineLocale(state.locale)].subtasks;

  if (kind === "feature") {
    const frontendLed = frontendBias || (frontendDomain(domain) && chance(state, 0.22));
    add(
      frontendLed ? "frontend" : "backend",
      "critical",
      frontendLed ? text.buildUserFacingWorkflow : text.buildServerSideBehavior,
    );
    add(
      frontendLed ? "backend" : "frontend",
      "important",
      frontendLed ? text.supportUiWithServerBehavior : text.wireUiState,
    );
    add("qa", "important", text.validateHappyPath);
    if (complexity >= 3) add("design", "important", text.clarifyProductInteraction);
    if (complexity >= 4 || chance(state, 0.35)) add("sre", "optional", text.prepareRolloutSafety);
  }

  if (kind === "bug") {
    const frontendBugChance = frontendBias ? 0.82 : frontendDomain(domain) ? 0.68 : 0.5;
    add(chance(state, frontendBugChance) ? "frontend" : "backend", "critical", text.fixRootCause);
    add("qa", "important", text.reproduceAndVerifyFix);
    if (chance(state, 0.35)) add("sre", "optional", text.addAlertForRecurrence);
  }

  if (kind === "techDebt") {
    const frontendDebt = frontendBias || (frontendDomain(domain) && chance(state, 0.55));
    if (frontendDebt) {
      add("frontend", "critical", text.refactorClientFlow);
      if (complexity >= 4) add("backend", "optional", text.alignServerContract);
    } else {
      add("backend", "critical", text.refactorRiskyModule);
    }
    add("qa", complexity >= 3 ? "important" : "optional", text.runRegressionPass);
    if (chance(state, 0.45)) add("sre", "optional", text.cleanOperationalConfig);
  }

  if (kind === "integration") {
    const frontendIntegration = frontendBias || chance(state, frontendDomain(domain) ? 0.55 : 0.4);
    add("backend", "critical", text.implementIntegrationContract);
    add(
      "sre",
      frontendIntegration && blastRadius !== "high" ? "optional" : "important",
      text.handleTimeoutsAndRetries,
    );
    add("qa", "important", text.validateFailureModes);
    if (frontendIntegration) add("frontend", "important", text.exposeIntegrationStatus);
  }

  if (kind === "incident") {
    add("sre", "critical", text.stabilizeProductionPath);
    add("backend", "important", text.patchServiceBehavior);
    add("qa", "optional", text.smokeTestRecovery);
  }

  if (kind === "performance") {
    const frontendPerformance = frontendBias || (frontendDomain(domain) && chance(state, 0.55));
    if (frontendPerformance) {
      add("frontend", "critical", text.reduceClientSideLatency);
      add("sre", blastRadius === "high" ? "important" : "optional", text.watchProductionPressure);
      if (complexity >= 4) add("backend", "important", text.optimizeHotPath);
    } else {
      add("sre", "critical", text.reduceProductionPressure);
      add("backend", "important", text.optimizeHotPath);
    }
    add("qa", "important", text.loadTestCriticalScenario);
  }

  if (kind === "compliance") {
    const frontendCompliance = frontendBias || chance(state, frontendDomain(domain) ? 0.45 : 0.25);
    add("qa", "critical", text.verifyComplianceScenario);
    add("backend", "important", text.implementPolicyEnforcement);
    if (blastRadius === "high") {
      add("sre", "important", text.addAuditRetentionSafety);
      if (frontendCompliance) add("frontend", "optional", text.showCompliantUiCopy);
    } else if (frontendCompliance) {
      add("frontend", "important", text.showCompliantUiCopy);
      if (chance(state, 0.25)) add("sre", "optional", text.addAuditRetentionSafety);
    } else {
      add("sre", "important", text.addAuditRetentionSafety);
    }
  }

  return specs.map((spec, index) => ({
    id: `${taskId}-S${index + 1}`,
    title: spec.title,
    role: spec.role,
    importance: spec.importance,
    revealed: false,
    done: false,
    progress: 0,
    completedBy: null,
    offRole: false,
  }));
}

function revealInitialSubtasks(
  state: RtGameState,
  subtasks: RtSubtask[],
  clarity: number,
): void {
  const critical = subtasks.find((subtask) => subtask.importance === "critical");
  if (critical) critical.revealed = true;

  const visibleCount = clarity >= 70 ? 3 : clarity >= 45 ? 2 : 1;
  for (const subtask of shuffle(state, subtasks).slice(0, visibleCount)) {
    subtask.revealed = true;
  }
}

function frontendDomain(domain: string): boolean {
  return (
    domain === "admin" ||
    domain === "auth" ||
    domain === "search" ||
    domain === "reports" ||
    domain === "notifications"
  );
}

function shouldBiasFrontendWork(state: RtGameState): boolean {
  const recentTasks = Object.values(state.tasks)
    .filter((task) => !task.rootCauseTaskId && !task.sourceTaskId)
    .sort((a, b) => taskSequenceNumber(b) - taskSequenceNumber(a))
    .slice(0, FRONTEND_GUARDRAIL_WINDOW);
  if (recentTasks.length < FRONTEND_GUARDRAIL_WINDOW) return false;

  const majorFrontendWork = recentTasks.filter((task) =>
    task.subtasks.some(
      (subtask) =>
        subtask.role === "frontend" &&
        (subtask.importance === "critical" || subtask.importance === "important"),
    ),
  ).length;
  return majorFrontendWork < FRONTEND_GUARDRAIL_MIN_MAJOR_WORK;
}

function taskSequenceNumber(task: RtTask): number {
  return Number(task.id.match(/-(\d+)$/)?.[1] ?? 0);
}

function chooseBlastRadius(
  state: RtGameState,
  kind: RtTaskKind,
  complexity: number,
  pressure: number,
): RtBlastRadius {
  const base =
    kind === "incident" || kind === "performance" || kind === "compliance"
      ? 2
      : kind === "integration" || kind === "techDebt"
        ? 1
        : 0;
  const score =
    base +
    (complexity >= 4 ? 1 : 0) +
    (pressure >= 4 ? 1 : 0) +
    (chance(state, 0.24) ? 1 : 0);
  if (score >= 3) return "high";
  if (score >= 1) return "medium";
  return "low";
}

function chooseTaskKind(state: RtGameState): RtTaskKind {
  const weights: Array<{ item: RtTaskKind; weight: number }> = [
    { item: "feature", weight: 30 },
    { item: "bug", weight: 14 },
    { item: "techDebt", weight: 8 },
    { item: "integration", weight: 14 },
    { item: "incident", weight: 5 },
    { item: "performance", weight: 10 },
    { item: "compliance", weight: 9 },
  ];
  for (const entry of weights) {
    if (state.resources.debt > 55 && entry.item === "bug") entry.weight += 14;
    if (state.resources.debt > 55 && entry.item === "techDebt") entry.weight += 10;
    if (state.resources.debt > 55 && entry.item === "performance") entry.weight += 10;
    if (state.resources.trust < 40 && entry.item === "incident") entry.weight += 12;
  }
  return weightedPick(state, weights);
}

function kindValueMultiplier(kind: RtTaskKind): number {
  if (kind === "feature") return 1.25;
  if (kind === "incident") return 0.75;
  if (kind === "techDebt") return 0.9;
  if (kind === "compliance") return 1.1;
  return 1;
}
