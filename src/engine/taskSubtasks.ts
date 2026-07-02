import {
  FRONTEND_GUARDRAIL_MIN_MAJOR_WORK,
  FRONTEND_GUARDRAIL_WINDOW,
} from "./balance";
import { SIM_TEXT } from "./content";
import { normalizeEngineLocale } from "./locale";
import { chance, shuffle } from "./rng";
import type {
  RtBlastRadius,
  RtGameState,
  RtSubtask,
  RtSubtaskImportance,
  RtSubtaskRole,
  RtTask,
  RtTaskKind,
} from "./types";

export function generateSubtasks(
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

export function revealInitialSubtasks(
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

export function shouldBiasFrontendWork(state: RtGameState): boolean {
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

function frontendDomain(domain: string): boolean {
  return (
    domain === "admin" ||
    domain === "auth" ||
    domain === "search" ||
    domain === "reports" ||
    domain === "notifications"
  );
}

function taskSequenceNumber(task: RtTask): number {
  return Number(task.id.match(/-(\d+)$/)?.[1] ?? 0);
}
