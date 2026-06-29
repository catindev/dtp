import {
  assignCharacterToTask,
  canAssignCharacterToTask,
  createRealtimeState,
  moveRealtimeTask,
  runDailyReleaseTrain,
  tickRealtime,
} from "../realtime/simulation";

const seedArg = Number(process.argv[2]);
const seed = Number.isFinite(seedArg) ? seedArg : 184;
const state = createRealtimeState(seed);

const taskId = state.board.backlog[0];
const analystId = Object.values(state.characters).find((character) => character.role === "analyst")?.id;

moveRealtimeTask(state, taskId, "inProgress");
if (analystId) assignCharacterToTask(state, analystId, taskId);
tickUntilTaskIdle(taskId, 500);

for (let index = 0; index < 8; index += 1) {
  const task = state.tasks[taskId];
  if (!task || isTaskReadyForDone(taskId)) break;
  const worker = pickWorkerForTask(taskId);
  if (!worker) break;
  assignCharacterToTask(state, worker, taskId);
  tickUntilTaskIdle(taskId, 700);
}

moveRealtimeTask(state, taskId, "done");
const shipped = runDailyReleaseTrain(state);

console.log(
  JSON.stringify(
    {
      seed,
      status: state.status,
      time: state.gameMinuteOfDay,
      released: state.tasks[taskId]?.released,
      shipped,
      releaseScore: state.tasks[taskId]?.releaseScore,
      trust: state.resources.trust,
      clients: state.resources.clients,
      debt: state.resources.debt,
      value: state.resources.value,
      tasks: Object.keys(state.tasks).length,
      backlog: state.board.backlog.length,
      log: state.log.slice(0, 8).map((event) => event.title),
    },
    null,
    2,
  ),
);

function tickUntilTaskIdle(taskId: string, limit: number): void {
  for (let index = 0; index < limit; index += 1) {
    const task = state.tasks[taskId];
    if (!task?.assignedCharacterId) return;
    tickRealtime(state, 500);
  }
}

function pickWorkerForTask(taskId: string): string | null {
  const task = state.tasks[taskId];
  if (!task) return null;
  const open = task.subtasks.filter((subtask) => subtask.revealed && !subtask.done);
  const implementation = open.filter((subtask) => subtask.role !== "qa");
  const target =
    task.bugs > 0
      ? open.find((subtask) => subtask.role === "qa") ?? open[0]
      : (task.workDone && implementation.length === 0 ? open : implementation)[0];
  const available = Object.values(state.characters).filter((character) => !character.assignedTaskId);
  const eligible = available.filter((character) => canAssignCharacterToTask(state, character.id, taskId));
  if (!target) return eligible[0]?.id ?? null;
  const matchingRole = target.role === "design" ? "designer" : target.role === "bugfix" ? "backend" : target.role;
  return (
    eligible.find((character) => character.role === matchingRole)?.id ??
    eligible.sort((a, b) => b.specialty[target.role] - a.specialty[target.role])[0]?.id ??
    null
  );
}

function isTaskReadyForDone(taskId: string): boolean {
  const task = state.tasks[taskId];
  if (!task) return false;
  return (
    task.workDone &&
    task.bugs === 0 &&
    task.subtasks.filter((subtask) => subtask.revealed && !subtask.done).length === 0
  );
}
