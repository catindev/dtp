import {
  WORK_TRACKS,
  activeWip,
  calculateReleaseRisk,
  createInitialState,
  debugSummary,
  hireCandidate,
  moveTask,
  releaseTask,
  resolveDay,
  restTeam,
  trainCharacter,
  type Assignment,
  type Character,
  type GameState,
  type TaskCard,
  type WorkTrack,
} from "../core";

const seedArg = Number(process.argv[2]);
const seed = Number.isFinite(seedArg) ? seedArg : 184;
const state = createInitialState(seed);

while (state.status === "running") {
  playDay(state);
  if (state.latestSprintReview) {
    chooseSprintAction(state);
    state.latestSprintReview = null;
  }
}

console.log(JSON.stringify(debugSummary(state), null, 2));
console.log("\nLast events:");
for (const event of state.log.slice(0, 12)) {
  console.log(
    `S${event.sprint}D${event.day} ${event.title} | ${event.effects.join(", ")}`,
  );
}

function playDay(state: GameState): void {
  pullWorkIntoBoard(state);
  releaseReadyTasks(state);

  const assignments: Assignment[] = [];
  const activeTasks = candidateTasks(state);
  const characters = Object.values(state.characters).filter(
    (character) => character.status === "available",
  );

  for (const character of characters) {
    if (shouldRest(character, state)) {
      assignments.push({ characterId: character.id, action: "rest" });
      continue;
    }

    const assignment = chooseWorkAssignment(character, activeTasks);
    if (assignment) {
      assignments.push({
        characterId: character.id,
        action: "work",
        taskId: assignment.task.id,
        workTrack: assignment.track,
      });
    } else {
      assignments.push({ characterId: character.id, action: "rest" });
    }
  }

  resolveDay(state, assignments);
}

function pullWorkIntoBoard(state: GameState): void {
  const incoming = [...state.board.incoming];
  for (const taskId of incoming) {
    if (activeWip(state) >= state.wipLimit + 1) {
      break;
    }
    const task = state.tasks[taskId];
    moveTask(state, taskId, preferredColumn(task));
  }
}

function releaseReadyTasks(state: GameState): void {
  const releasable = candidateTasks(state)
    .filter((task) => task.column !== "incoming")
    .map((task) => ({ task, risk: calculateReleaseRisk(state, task) }))
    .sort((a, b) => a.risk - b.risk);

  for (const entry of releasable) {
    const latePressure = entry.task.age >= entry.task.deadline;
    if (entry.risk <= 30 || (latePressure && entry.risk <= 55)) {
      releaseTask(state, entry.task.id);
    }
  }
}

function candidateTasks(state: GameState): TaskCard[] {
  return Object.values(state.tasks)
    .filter((task) => task.column !== "done" && !task.released)
    .sort((a, b) => {
      const aUrgency = a.pressure * 4 + Math.max(0, a.age - a.deadline + 2) * 5;
      const bUrgency = b.pressure * 4 + Math.max(0, b.age - b.deadline + 2) * 5;
      return bUrgency - aUrgency || b.value - a.value;
    });
}

function chooseWorkAssignment(
  character: Character,
  tasks: TaskCard[],
): { task: TaskCard; track: WorkTrack } | null {
  let best: { task: TaskCard; track: WorkTrack; score: number } | null = null;

  for (const task of tasks) {
    for (const track of WORK_TRACKS) {
      const need = task.trueNeeds[track];
      if (need <= 0) continue;
      const gap = need - task.progress[track];
      if (gap <= -10) continue;

      const trackFit = character.skills[track] * 8;
      const urgency = task.pressure * 5 + Math.max(0, task.age - task.deadline + 2) * 8;
      const gapScore = Math.min(40, Math.max(0, gap));
      const riskScore = task.risks.some(
        (risk) => risk.state === "revealed" && risk.mitigateBy.includes(track),
      )
        ? 20
        : 0;
      const score = trackFit + urgency + gapScore + riskScore + task.value;

      if (!best || score > best.score) {
        best = { task, track, score };
      }
    }
  }

  return best;
}

function preferredColumn(task: TaskCard): Parameters<typeof moveTask>[2] {
  const largestGap = WORK_TRACKS.map((track) => ({
    track,
    gap: task.trueNeeds[track] - task.progress[track],
  })).sort((a, b) => b.gap - a.gap)[0].track;

  if (largestGap === "analysis") return "analysis";
  if (largestGap === "design") return "design";
  if (largestGap === "backend" || largestGap === "frontend") return "dev";
  if (largestGap === "review") return "review";
  if (largestGap === "qa") return "qa";
  return "release";
}

function shouldRest(character: Character, state: GameState): boolean {
  if (character.burnout >= 70) return true;
  if (character.fatigue >= 80) return true;
  if (state.day <= 3 && character.fatigue >= 70) return true;
  return false;
}

function chooseSprintAction(state: GameState): void {
  if (state.resources.budget <= 0) return;
  if (Object.values(state.characters).some((character) => character.burnout > 50)) {
    restTeam(state);
    return;
  }
  const missingQa = Object.values(state.characters).every(
    (character) => character.role !== "qa",
  );
  const qaCandidate = state.candidatePool.find((candidate) => candidate.role === "qa");
  if (missingQa && qaCandidate) {
    hireCandidate(state, qaCandidate.id);
    return;
  }
  const weakest = Object.values(state.characters).sort(
    (a, b) => a.skills.qa + a.skills.releaseSafety - b.skills.qa - b.skills.releaseSafety,
  )[0];
  trainCharacter(state, weakest.id, weakest.skills.qa < weakest.skills.releaseSafety ? "qa" : "releaseSafety");
}
