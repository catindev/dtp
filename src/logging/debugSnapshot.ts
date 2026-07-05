import {
  RT_COLUMNS,
  formatGameTime,
  lateReleaseReport,
  releaseReadiness,
  type RtGameState,
  type RtTask,
} from "../realtime/simulation";
import { getBackendLogStatus } from "./backendLog";

export function buildDebugSnapshot(game: RtGameState, sessionId?: string) {
  const tasks = Object.values(game.tasks);
  const backendLogStatus = getBackendLogStatus();
  return {
    savedAt: new Date().toISOString(),
    sessionId: sessionId ?? null,
    seed: game.seed,
    locale: game.locale,
    status: game.paused && game.status === "running" ? "paused" : game.status,
    lossReason: game.lossReason,
    time: {
      clock: formatGameTime(game),
      elapsedRealMs: game.elapsedRealMs,
      elapsedGameMinutes: game.elapsedGameMinutes,
      day: game.day,
      campaignDay: game.calendar.campaignDay,
      week: game.calendar.week,
      dayInWeek: game.calendar.dayInWeek,
      month: game.calendar.month,
      quarter: game.quarter,
      dayInQuarter: game.dayInQuarter,
    },
    resources: game.resources,
    morningReport: game.morningReport,
    horizonGoals: game.horizonGoals,
    quarter: {
      value: game.quarterValue,
      goal: game.quarterGoal,
    },
    lossReport: game.lossReport,
    victoryReport: game.victoryReport,
    peakDebt: game.peakDebt,
    spawn: game.spawn,
    taskCount: tasks.length,
    board: Object.fromEntries(
      RT_COLUMNS.map((column) => [
        column,
        game.board[column].map((taskId) => summarizeTask(game.tasks[taskId])),
      ]),
    ),
    characters: Object.values(game.characters).map((character) => ({
      id: character.id,
      name: character.name,
      role: character.role,
      assignedTaskId: character.assignedTaskId,
      stamina: Math.round(character.stamina),
      burnout: Math.round(character.burnout),
      shockGameMinutes: Math.round(character.shockGameMinutes),
      exhaustedToday: character.exhaustedToday,
      specialty: character.specialty,
    })),
    activeAssignments: tasks
      .filter((task) => task.assignedCharacterId)
      .map((task) => ({
        taskId: task.id,
        taskTitle: task.title,
        column: task.column,
        characterId: task.assignedCharacterId,
        progress: Math.round(task.stageProgress),
      })),
    logger: {
      backendUrl: backendLogStatus.backendUrl,
      queuedEntries: backendLogStatus.queuedEntries,
      compactedEntries: backendLogStatus.compactedEntries,
      droppedEntries: backendLogStatus.droppedEntries,
    },
    events: game.log,
  };
}

export function buildBackendSnapshot(snapshot: ReturnType<typeof buildDebugSnapshot>) {
  return {
    savedAt: snapshot.savedAt,
    sessionId: snapshot.sessionId,
    seed: snapshot.seed,
    locale: snapshot.locale,
    status: snapshot.status,
    lossReason: snapshot.lossReason,
    time: snapshot.time,
    resources: snapshot.resources,
    morningReport: snapshot.morningReport,
    daySummary: snapshot.morningReport?.daySummary ?? null,
    horizonGoals: snapshot.horizonGoals,
    quarter: snapshot.quarter,
    lossReport: snapshot.lossReport,
    victoryReport: snapshot.victoryReport,
    peakDebt: snapshot.peakDebt,
    spawn: snapshot.spawn,
    taskCount: snapshot.taskCount,
    logger: snapshot.logger,
    boardCounts: Object.fromEntries(
      Object.entries(snapshot.board).map(([column, tasks]) => [
        column,
        tasks.filter(Boolean).length,
      ]),
    ),
    activeAssignments: snapshot.activeAssignments,
    characters: snapshot.characters.map((character) => ({
      id: character.id,
      name: character.name,
      role: character.role,
      assignedTaskId: character.assignedTaskId,
      stamina: character.stamina,
      burnout: character.burnout,
      exhaustedToday: character.exhaustedToday,
    })),
    visibleTasks: Object.fromEntries(
      Object.entries(snapshot.board).map(([column, tasks]) => [
        column,
        tasks.filter(Boolean).map((task) => ({
          id: task?.id,
          kind: task?.kind,
          blastRadius: task?.blastRadius,
          releaseReadiness: task?.releaseReadiness,
          rootCauseTaskId: task?.rootCauseTaskId,
          chainDepth: task?.chainDepth,
          resolved: task?.resolved,
          resolution: task?.resolution,
          deadlineMs: task?.deadlineMs,
          overdueMs: task?.overdueMs,
          stageProgress: task?.stageProgress,
          assignedCharacterId: task?.assignedCharacterId,
          outsourcing: task?.outsourcing,
        })),
      ]),
    ),
    recentEvents: snapshot.events.slice(0, 12),
  };
}

function summarizeTask(task: RtTask | undefined) {
  if (!task) return null;
  return {
    id: task.id,
    title: task.title,
    narrative: task.narrativeRef,
    comments: task.comments,
    kind: task.kind,
    column: task.column,
    blastRadius: task.blastRadius,
    releaseReadiness: releaseReadiness(task),
    pressure: task.pressure,
    complexity: task.complexity,
    value: task.value,
    clarity: task.clarity,
    quality: task.quality,
    testCoverage: task.testCoverage,
    bugs: task.bugs,
    changedAfterQa: task.changedAfterQa,
    workDone: task.workDone,
    subtasks: task.subtasks,
    currentSubtaskId: task.currentSubtaskId,
    outsourcing: task.outsourcing,
    offRolePenalty: task.offRolePenalty,
    deadlineMs: Math.round(task.deadlineMs),
    overdueMs: Math.round(task.overdueMs),
    lateRelease: lateReleaseReport(task),
    stageProgress: Math.round(task.stageProgress),
    stageComplete: task.stageComplete,
    assignedCharacterId: task.assignedCharacterId,
    released: task.released,
    rootCauseTaskId: task.rootCauseTaskId,
    sourceTaskId: task.sourceTaskId,
    chainDepth: task.chainDepth,
    resolved: task.resolved,
    resolution: task.resolution,
    resolutionDay: task.resolutionDay,
    releaseScore: task.releaseScore,
    queuedDeadlineMs: task.queuedDeadlineMs,
    postmortem: task.postmortem,
    lastNote: task.lastNote,
  };
}
