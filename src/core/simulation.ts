import {
  baseNeeds,
  baseSkillProfiles,
  characterNames,
  domainPrefixes,
  negativeTraits,
  positiveTraits,
  riskTemplates,
  rolePreferredTracks,
  seniorityModifiers,
  sizeModifiers,
  taskKindBaseWeights,
  taskTitles,
} from "./content";
import {
  chance,
  nextRandom,
  normalizeSeed,
  pickOne,
  pickSome,
  randomInt,
  weightedPick,
} from "./rng";
import {
  BOARD_COLUMNS,
  WORK_TRACKS,
  type Assignment,
  type BoardColumn,
  type Character,
  type CharacterRole,
  type CharacterTrait,
  type GameEvent,
  type GameState,
  type NeedLevel,
  type ReleaseOutcome,
  type ReleaseTier,
  type Seniority,
  type SkillMap,
  type SprintReview,
  type TaskCard,
  type TaskDomain,
  type TaskKind,
  type TaskModifier,
  type TaskRisk,
  type WorkResult,
  type WorkTrack,
} from "./types";

const activeColumns: BoardColumn[] = [
  "incoming",
  "analysis",
  "design",
  "dev",
  "review",
  "qa",
  "release",
];

const wipColumns: BoardColumn[] = [
  "analysis",
  "design",
  "dev",
  "review",
  "qa",
  "release",
];

const trackRiskWeights: Record<WorkTrack, number> = {
  analysis: 0.12,
  design: 0.08,
  backend: 0.16,
  frontend: 0.12,
  review: 0.1,
  qa: 0.18,
  releaseSafety: 0.14,
};

export function createInitialState(seed = Date.now()): GameState {
  const normalizedSeed = normalizeSeed(seed);
  const state: GameState = {
    seed: normalizedSeed,
    rngState: normalizedSeed,
    day: 1,
    sprint: 1,
    daysPerSprint: 5,
    maxSprints: 4,
    status: "running",
    lossReason: null,
    resources: {
      trust: 50,
      debt: 20,
      value: 0,
      budget: 3,
    },
    board: createEmptyBoard(),
    tasks: {},
    characters: {},
    candidatePool: [],
    nextTaskId: 1,
    nextCharacterId: 1,
    wipLimit: 4,
    log: [],
    latestSprintReview: null,
    metrics: {
      releases: 0,
      cleanReleases: 0,
      roughSuccesses: 0,
      escapedBugs: 0,
      incidents: 0,
      revealedRisks: 0,
      mitigatedRisks: 0,
      restActions: 0,
      sickLeaves: 0,
      wipSamples: 0,
      totalWip: 0,
      valueThisSprint: 0,
      releasesThisSprint: 0,
      incidentsThisSprint: 0,
      sprintStartTrust: 50,
      sprintStartDebt: 20,
    },
  };

  for (const [role, seniority] of [
    ["analyst", "middle"],
    ["designer", "middle"],
    ["backend", "middle"],
    ["frontend", "middle"],
  ] as Array<[CharacterRole, Seniority]>) {
    const character = generateCharacter(state, role, seniority);
    state.characters[character.id] = character;
  }

  for (const [role, seniority] of [
    ["qa", "middle"],
    ["sre", "middle"],
    ["backend", "junior"],
  ] as Array<[CharacterRole, Seniority]>) {
    state.candidatePool.push(generateCharacter(state, role, seniority));
  }

  for (const kind of ["feature", "bug", "techDebt"] as TaskKind[]) {
    addTaskToState(state, generateTask(state, kind));
  }

  pushEvent(state, {
    type: "run_started",
    title: "Run started",
    body: `Seed ${state.seed}. Keep prod alive for ${state.maxSprints} sprints.`,
    effects: ["trust 50", "debt 20", "budget 3"],
  });

  return state;
}

export function cloneState(state: GameState): GameState {
  return structuredClone(state) as GameState;
}

export function generateTask(state: GameState, forcedKind?: TaskKind): TaskCard {
  const kind = forcedKind ?? chooseTaskKind(state);
  const domain = pickOne(state, Object.keys(domainPrefixes) as TaskDomain[]);
  const numericId = state.nextTaskId++;
  const id = `${domainPrefixes[domain]}-${String(numericId).padStart(3, "0")}`;
  const title = `${id}: ${pickOne(state, taskTitles[kind])}`;
  const size = randomInt(state, 1, 5);
  const modifiers = pickTaskModifiers(state);
  const trueNeeds = applyTaskModifiers(scaleNeeds(baseNeeds[kind], size), modifiers);
  const risks = generateRisksForTask(state, id, modifiers);
  const value = calculateTaskValue(kind, size, modifiers);
  const pressure = calculatePressure(kind, modifiers);
  const deadline = calculateDeadline(kind, size, modifiers);

  return {
    id,
    title,
    kind,
    domain,
    column: "incoming",
    age: 0,
    deadline,
    pressure,
    value,
    size,
    modifiers,
    visible: {
      description: `A ${kind} task in ${domain}. Visible estimate may be incomplete.`,
      suspectedTags: modifiers,
      knownNeeds: createVisibleNeeds(state, trueNeeds, modifiers),
      revealedRisks: [],
    },
    trueNeeds,
    progress: createEmptySkillMap(),
    risks,
    contributors: [],
    released: false,
    releaseOutcome: null,
  };
}

export function generateCharacter(
  state: GameState,
  forcedRole?: CharacterRole,
  forcedSeniority?: Seniority,
): Character {
  const role =
    forcedRole ??
    pickOne(state, ["analyst", "designer", "backend", "frontend", "qa", "sre"]);
  const seniority =
    forcedSeniority ?? pickOne(state, ["junior", "middle", "senior"]);
  const seniorityConfig = seniorityModifiers[seniority];
  const baseSkills = baseSkillProfiles[role];
  const skills = createEmptySkillMap();

  for (const track of WORK_TRACKS) {
    const variance = randomInt(state, -1, 1);
    skills[track] = clamp(
      baseSkills[track] + seniorityConfig.skillDelta + variance,
      0,
      5,
    );
  }

  const positiveTrait = pickOne(state, positiveTraits);
  const traits: CharacterTrait[] = [positiveTrait];
  if (chance(state, 0.45)) {
    traits.push(pickOne(state, negativeTraits));
  }

  return {
    id: `C-${state.nextCharacterId++}`,
    name: pickOne(state, characterNames),
    role,
    seniority,
    level: seniority === "junior" ? 1 : seniority === "middle" ? 2 : 3,
    skills,
    xp: createEmptySkillMap(),
    traits,
    fatigue: 0,
    burnout: 0,
    status: "available",
    focusTaskId: null,
    salary: seniorityConfig.salary,
    growthRate: seniorityConfig.growthRate,
    resilience: seniorityConfig.resilience,
    unavailableDays: 0,
  };
}

export function moveTask(
  state: GameState,
  taskId: string,
  targetColumn: BoardColumn,
): void {
  const task = state.tasks[taskId];
  if (!task) {
    throw new Error(`Unknown task ${taskId}.`);
  }
  if (task.column === "done") {
    throw new Error("Done tasks cannot be moved.");
  }
  if (targetColumn === "done") {
    throw new Error("Use releaseTask to move tasks to done.");
  }

  removeFromBoard(state, taskId);
  task.column = targetColumn;
  state.board[targetColumn].push(taskId);
}

export function workOnTask(
  state: GameState,
  characterId: string,
  taskId: string,
  workTrack: WorkTrack,
): WorkResult {
  const character = state.characters[characterId];
  const task = state.tasks[taskId];
  if (!character) {
    throw new Error(`Unknown character ${characterId}.`);
  }
  if (!task) {
    throw new Error(`Unknown task ${taskId}.`);
  }
  if (character.status !== "available") {
    throw new Error(`${character.name} is not available.`);
  }
  if (task.column === "done") {
    throw new Error("Cannot work on a done task.");
  }

  const contextSwitched =
    character.focusTaskId !== null && character.focusTaskId !== taskId;
  const effectiveSkill = calculateEffectiveSkill(character, task, workTrack);
  const offRole = isOffRole(character, workTrack);
  const progressGain = calculateProgressGain(
    state,
    character,
    task,
    workTrack,
    effectiveSkill,
    offRole,
    contextSwitched,
  );

  task.progress[workTrack] = clamp(
    task.progress[workTrack] + progressGain,
    0,
    Math.max(task.trueNeeds[workTrack] + 40, 100),
  );
  if (!task.contributors.includes(characterId)) {
    task.contributors.push(characterId);
  }

  const revealedRisks = revealRisks(state, character, task, workTrack, effectiveSkill);
  const mitigatedRisks = mitigateRisks(task, workTrack);
  state.metrics.revealedRisks += revealedRisks.length;
  state.metrics.mitigatedRisks += mitigatedRisks.length;

  const createdDefect = maybeCreateDefect(state, character, task, workTrack);
  const xpGain = applyXp(character, workTrack, progressGain, revealedRisks, mitigatedRisks);
  const startingFatigue = character.fatigue;
  const fatigueGain = calculateFatigueGain(character, task, offRole, contextSwitched);
  character.fatigue = clamp(character.fatigue + fatigueGain, 0, 100);
  const burnoutGain = calculateBurnoutGain(character, task, startingFatigue);
  character.burnout = clamp(character.burnout + burnoutGain, 0, 100);
  character.focusTaskId = taskId;

  pushEvent(state, {
    type: "work",
    title: `${character.name} worked on ${task.id}`,
    body: `${workTrack} progress +${progressGain}.`,
    effects: [
      `fatigue +${fatigueGain}`,
      `burnout +${burnoutGain}`,
      ...revealedRisks.map((risk) => `revealed: ${risk.triggerText}`),
      ...mitigatedRisks.map((risk) => `mitigated: ${risk.triggerText}`),
      ...(createdDefect ? [`new hidden defect: ${createdDefect.type}`] : []),
    ],
  });

  return {
    progressGain,
    revealedRisks,
    mitigatedRisks,
    xpGain,
    fatigueGain,
    burnoutGain,
    createdDefect,
  };
}

export function releaseTask(state: GameState, taskId: string): ReleaseOutcome {
  const task = state.tasks[taskId];
  if (!task) {
    throw new Error(`Unknown task ${taskId}.`);
  }
  if (task.column === "done" || task.released) {
    throw new Error(`${taskId} was already released.`);
  }

  const riskScore = calculateReleaseRisk(state, task);
  const tier = releaseTierFromRisk(riskScore);
  const deltas = calculateReleaseDeltas(task, tier);
  const triggeredRiskIds = triggerRisksForOutcome(task, tier);
  let spawnedTaskId: string | null = null;

  state.resources.value += deltas.valueDelta;
  state.resources.trust = clamp(state.resources.trust + deltas.trustDelta, 0, 100);
  state.resources.debt = clamp(state.resources.debt + deltas.debtDelta, 0, 100);

  if (tier === "rough" && chance(state, 0.3)) {
    spawnedTaskId = spawnFollowUp(state, "bug", task);
  }
  if (tier === "bugEscaped") {
    spawnedTaskId = spawnFollowUp(state, "bug", task);
  }
  if (tier === "incident") {
    spawnedTaskId = spawnFollowUp(state, "incident", task);
    for (const contributorId of task.contributors) {
      const contributor = state.characters[contributorId];
      if (contributor) {
        contributor.burnout = clamp(contributor.burnout + 5, 0, 100);
      }
    }
  }

  removeFromBoard(state, taskId);
  task.column = "done";
  task.released = true;
  state.board.done.push(taskId);

  const outcome: ReleaseOutcome = {
    taskId,
    tier,
    riskScore,
    valueDelta: deltas.valueDelta,
    trustDelta: deltas.trustDelta,
    debtDelta: deltas.debtDelta,
    spawnedTaskId,
    triggeredRiskIds,
  };
  task.releaseOutcome = outcome;

  state.metrics.releases += 1;
  state.metrics.releasesThisSprint += 1;
  state.metrics.valueThisSprint += deltas.valueDelta;
  if (tier === "clean") state.metrics.cleanReleases += 1;
  if (tier === "rough") state.metrics.roughSuccesses += 1;
  if (tier === "bugEscaped") state.metrics.escapedBugs += 1;
  if (tier === "incident") {
    state.metrics.incidents += 1;
    state.metrics.incidentsThisSprint += 1;
  }

  pushEvent(state, {
    type: "release",
    title: `Release ${task.id}: ${formatReleaseTier(tier)}`,
    body: `Risk score ${Math.round(riskScore)}. ${task.title}`,
    effects: [
      `value ${formatDelta(deltas.valueDelta)}`,
      `trust ${formatDelta(deltas.trustDelta)}`,
      `debt ${formatDelta(deltas.debtDelta)}`,
      ...(spawnedTaskId ? [`new follow-up: ${spawnedTaskId}`] : []),
    ],
  });

  checkLoseConditions(state);
  return outcome;
}

export function resolveDay(state: GameState, assignments: Assignment[]): void {
  if (state.status !== "running") {
    return;
  }

  const assignedCharacters = new Set<string>();
  const workedCharacters = new Set<string>();
  const restedCharacters = new Set<string>();

  for (const assignment of assignments) {
    if (assignedCharacters.has(assignment.characterId)) {
      pushEvent(state, {
        type: "assignment_skipped",
        title: "Duplicate assignment skipped",
        body: `${assignment.characterId} already has an assignment today.`,
        effects: [],
      });
      continue;
    }
    assignedCharacters.add(assignment.characterId);

    const character = state.characters[assignment.characterId];
    if (!character || character.status !== "available") {
      continue;
    }

    if (assignment.action === "rest") {
      character.status = "resting";
      restedCharacters.add(character.id);
      state.metrics.restActions += 1;
      pushEvent(state, {
        type: "rest",
        title: `${character.name} rests today`,
        body: "No progress, but fatigue and burnout recover.",
        effects: ["rest action"],
      });
      continue;
    }

    if (!assignment.taskId || !assignment.workTrack) {
      continue;
    }

    workOnTask(state, character.id, assignment.taskId, assignment.workTrack);
    workedCharacters.add(character.id);
  }

  ageActiveTasks(state);
  applyWipFriction(state);
  applyPassiveRecovery(state, workedCharacters, restedCharacters);
  updateSickLeave(state);
  maybeGenerateDailyTask(state);
  checkLoseConditions(state);

  if (state.status !== "running") {
    return;
  }

  state.day += 1;
  if (state.day > state.daysPerSprint) {
    runSprintReview(state);
  }
}

export function hireCandidate(state: GameState, candidateId: string): boolean {
  const index = state.candidatePool.findIndex((candidate) => candidate.id === candidateId);
  if (index === -1) {
    return false;
  }
  const candidate = state.candidatePool[index];
  if (state.resources.budget < candidate.salary) {
    return false;
  }

  state.resources.budget -= candidate.salary;
  state.characters[candidate.id] = candidate;
  state.candidatePool.splice(index, 1, generateCharacter(state));
  pushEvent(state, {
    type: "hire",
    title: `${candidate.name} joined the team`,
    body: `${candidate.seniority} ${candidate.role}.`,
    effects: [`budget -${candidate.salary}`],
  });
  return true;
}

export function trainCharacter(
  state: GameState,
  characterId: string,
  workTrack: WorkTrack,
): boolean {
  const character = state.characters[characterId];
  if (!character || state.resources.budget < 1) {
    return false;
  }
  state.resources.budget -= 1;
  character.xp[workTrack] += 5;
  levelUpIfReady(character, workTrack);
  pushEvent(state, {
    type: "train",
    title: `${character.name} trained ${workTrack}`,
    body: "Focused training between sprints.",
    effects: ["budget -1", `${workTrack} xp +5`],
  });
  return true;
}

export function restTeam(state: GameState): boolean {
  if (state.resources.budget < 1) {
    return false;
  }
  state.resources.budget -= 1;
  for (const character of Object.values(state.characters)) {
    character.fatigue = clamp(character.fatigue - 25, 0, 100);
    character.burnout = clamp(character.burnout - 5, 0, 100);
  }
  pushEvent(state, {
    type: "rest_team",
    title: "Team recovery",
    body: "The team gets a quieter sprint transition.",
    effects: ["budget -1", "fatigue -25", "burnout -5"],
  });
  return true;
}

export function calculateReleaseRisk(state: GameState, task: TaskCard): number {
  let riskScore = 0;

  for (const track of WORK_TRACKS) {
    const gap = Math.max(0, task.trueNeeds[track] - task.progress[track]);
    riskScore += gap * trackRiskWeights[track];
  }

  for (const risk of task.risks) {
    if (risk.state === "hidden") riskScore += risk.severity * 8;
    if (risk.state === "revealed") riskScore += risk.severity * 4;
    if (risk.state === "mitigated") riskScore += risk.severity;
  }

  riskScore += state.resources.debt * 0.25;
  for (const contributorId of task.contributors) {
    const contributor = state.characters[contributorId];
    if (contributor && (contributor.fatigue > 70 || contributor.burnout > 60)) {
      riskScore += 5;
    }
  }

  riskScore -= task.progress.releaseSafety * 0.3;
  return clamp(riskScore, 0, 100);
}

export function activeWip(state: GameState): number {
  return wipColumns.reduce((sum, column) => sum + state.board[column].length, 0);
}

export function debugSummary(state: GameState): Record<string, number | string> {
  return {
    seed: state.seed,
    status: state.status,
    sprint: state.sprint,
    day: state.day,
    releases: state.metrics.releases,
    cleanReleases: state.metrics.cleanReleases,
    roughSuccesses: state.metrics.roughSuccesses,
    escapedBugs: state.metrics.escapedBugs,
    incidents: state.metrics.incidents,
    averageWip:
      state.metrics.wipSamples === 0
        ? 0
        : Number((state.metrics.totalWip / state.metrics.wipSamples).toFixed(2)),
    revealedRisks: state.metrics.revealedRisks,
    mitigatedRisks: state.metrics.mitigatedRisks,
    restActions: state.metrics.restActions,
    sickLeaves: state.metrics.sickLeaves,
    finalTrust: state.resources.trust,
    finalDebt: state.resources.debt,
    finalValue: state.resources.value,
    budget: state.resources.budget,
    activeWip: activeWip(state),
  };
}

export function visibleProgress(task: TaskCard, track: WorkTrack): string {
  const need = task.trueNeeds[track];
  if (need <= 0) return "n/a";
  const ratio = task.progress[track] / need;
  if (ratio <= 0) return "none";
  if (ratio < 0.35) return "started";
  if (ratio < 0.75) return "partial";
  if (ratio < 1) return "looks close";
  return "done?";
}

function createEmptyBoard(): Record<BoardColumn, string[]> {
  return BOARD_COLUMNS.reduce(
    (board, column) => ({ ...board, [column]: [] }),
    {} as Record<BoardColumn, string[]>,
  );
}

function createEmptySkillMap(): SkillMap {
  return WORK_TRACKS.reduce(
    (map, track) => ({ ...map, [track]: 0 }),
    {} as SkillMap,
  );
}

function chooseTaskKind(state: GameState): TaskKind {
  const weights = Object.entries(taskKindBaseWeights).map(([item, weight]) => ({
    item: item as TaskKind,
    weight,
  }));

  const debt = state.resources.debt;
  const trust = state.resources.trust;
  const wip = activeWip(state);

  for (const entry of weights) {
    if (debt > 50 && entry.item === "bug") entry.weight += 15;
    if (debt > 50 && entry.item === "techDebt") entry.weight += 10;
    if (debt > 50 && entry.item === "performance") entry.weight += 10;
    if (trust < 35 && entry.item === "incident") entry.weight += 10;
    if (wip > state.wipLimit && entry.item === "bug") entry.weight += 10;
  }

  return weightedPick(state, weights);
}

function pickTaskModifiers(state: GameState): TaskModifier[] {
  const count = weightedPick(state, [
    { item: 0, weight: 45 },
    { item: 1, weight: 40 },
    { item: 2, weight: 15 },
  ]);
  return pickSome(
    state,
    [
      "legacy",
      "vip",
      "vague",
      "deadline",
      "crossTeam",
      "customerVisible",
      "smallButTricky",
    ],
    count,
  );
}

function scaleNeeds(needs: SkillMap, size: number): SkillMap {
  const modifier = sizeModifiers[size] ?? 1;
  const scaled = createEmptySkillMap();
  for (const track of WORK_TRACKS) {
    scaled[track] = Math.round(needs[track] * modifier);
  }
  return scaled;
}

function applyTaskModifiers(needs: SkillMap, modifiers: TaskModifier[]): SkillMap {
  const next = { ...needs };
  if (modifiers.includes("legacy")) {
    next.backend += 20;
    next.qa += 20;
  }
  if (modifiers.includes("vague")) {
    next.analysis += 30;
  }
  if (modifiers.includes("crossTeam")) {
    next.analysis += 20;
  }
  if (modifiers.includes("customerVisible")) {
    next.design += 20;
    next.frontend += 20;
  }
  return next;
}

function generateRisksForTask(
  state: GameState,
  taskId: string,
  modifiers: TaskModifier[],
): TaskRisk[] {
  const matching = riskTemplates.filter((template) => {
    if (!template.tags || template.tags.length === 0) return true;
    return template.tags.some((tag) => modifiers.includes(tag));
  });
  const count = randomInt(state, 1, modifiers.includes("smallButTricky") ? 3 : 2);
  const templates = pickSome(state, matching, count);

  return templates.map((template, index) => ({
    id: `${taskId}-R${index + 1}`,
    type: template.type,
    severity: clamp(
      template.severity + (modifiers.includes("smallButTricky") ? 1 : 0),
      1,
      4,
    ),
    state: "hidden",
    discoverBy: [...template.discoverBy],
    mitigateBy: [...template.mitigateBy],
    triggerText: template.triggerText,
    followupTaskKind: template.followupTaskKind,
  }));
}

function calculateTaskValue(
  kind: TaskKind,
  size: number,
  modifiers: TaskModifier[],
): number {
  const baseByKind: Record<TaskKind, number> = {
    feature: 12,
    bug: 6,
    techDebt: 8,
    integration: 10,
    incident: 5,
    performance: 9,
    compliance: 9,
  };
  const deadlineMultiplier = modifiers.includes("deadline") ? 1.2 : 1;
  return Math.round((baseByKind[kind] + size * 2) * deadlineMultiplier);
}

function calculatePressure(kind: TaskKind, modifiers: TaskModifier[]): number {
  let pressure = kind === "incident" ? 5 : kind === "bug" ? 3 : 2;
  if (modifiers.includes("vip")) pressure += 2;
  if (modifiers.includes("deadline")) pressure += 2;
  return clamp(pressure, 1, 6);
}

function calculateDeadline(
  kind: TaskKind,
  size: number,
  modifiers: TaskModifier[],
): number {
  let deadline = kind === "incident" ? 2 : 4 + size;
  if (modifiers.includes("deadline")) deadline -= 2;
  return clamp(deadline, 1, 9);
}

function createVisibleNeeds(
  state: GameState,
  trueNeeds: SkillMap,
  modifiers: TaskModifier[],
): Record<WorkTrack, NeedLevel> {
  const result = {} as Record<WorkTrack, NeedLevel>;
  for (const track of WORK_TRACKS) {
    const unknownChance = modifiers.includes("vague") ? 0.25 : 0.12;
    if (chance(state, unknownChance)) {
      result[track] = "unknown";
      continue;
    }

    const baseLevel = needLevelFromValue(trueNeeds[track]);
    const levels: NeedLevel[] = ["none", "low", "medium", "high"];
    const index = levels.indexOf(baseLevel);
    const noise = randomInt(state, -1, 1);
    result[track] = levels[clamp(index + noise, 0, levels.length - 1)];
  }
  return result;
}

function needLevelFromValue(value: number): NeedLevel {
  if (value <= 0) return "none";
  if (value < 25) return "low";
  if (value < 55) return "medium";
  return "high";
}

function addTaskToState(state: GameState, task: TaskCard): void {
  state.tasks[task.id] = task;
  state.board[task.column].push(task.id);
  pushEvent(state, {
    type: "task_generated",
    title: `New task: ${task.id}`,
    body: task.title,
    effects: [
      task.kind,
      `pressure ${task.pressure}`,
      `deadline ${task.deadline}`,
      ...task.modifiers,
    ],
  });
}

function calculateEffectiveSkill(
  character: Character,
  task: TaskCard,
  workTrack: WorkTrack,
): number {
  let skill = character.skills[workTrack];
  if (character.traits.includes("legacyExpert") && task.modifiers.includes("legacy")) {
    skill += 1;
  }
  if (
    character.traits.includes("productSense") &&
    workTrack === "analysis" &&
    (task.kind === "feature" || task.modifiers.includes("customerVisible"))
  ) {
    skill += 1;
  }
  skill -= Math.floor(character.fatigue / 30);
  skill -= Math.floor(character.burnout / 50);
  return clamp(skill, 0, 6);
}

function isOffRole(character: Character, workTrack: WorkTrack): boolean {
  return (
    !rolePreferredTracks[character.role].includes(workTrack) &&
    character.skills[workTrack] <= 1
  );
}

function calculateProgressGain(
  state: GameState,
  character: Character,
  task: TaskCard,
  workTrack: WorkTrack,
  effectiveSkill: number,
  offRole: boolean,
  contextSwitched: boolean,
): number {
  let progress = 6 + effectiveSkill * 5;
  if (character.traits.includes("fast")) progress *= 1.2;
  if (character.traits.includes("careful")) progress *= 0.85;
  if (offRole) progress *= 0.75;
  if (contextSwitched) progress *= 0.85;
  if (character.traits.includes("contextSwitchHater") && contextSwitched) {
    progress *= 0.9;
  }
  if (workTrack === "review" && character.traits.includes("soloist")) {
    progress *= 0.85;
  }
  progress /= sizeModifiers[task.size] ?? 1;
  progress *= 0.8 + nextRandom(state) * 0.4;
  return clamp(Math.round(progress), 2, 35);
}

function revealRisks(
  state: GameState,
  character: Character,
  task: TaskCard,
  workTrack: WorkTrack,
  effectiveSkill: number,
): TaskRisk[] {
  const revealed: TaskRisk[] = [];
  for (const risk of task.risks) {
    if (risk.state !== "hidden" || !risk.discoverBy.includes(workTrack)) {
      continue;
    }
    let probability =
      0.15 +
      effectiveSkill * 0.12 -
      character.fatigue * 0.003 -
      character.burnout * 0.002;
    if (character.traits.includes("careful")) probability += 0.25;
    if (character.traits.includes("sloppy")) probability -= 0.1;
    if (chance(state, clamp(probability, 0.05, 0.95))) {
      risk.state = "revealed";
      task.visible.revealedRisks.push(risk.triggerText);
      revealed.push(risk);
    }
  }
  return revealed;
}

function mitigateRisks(task: TaskCard, workTrack: WorkTrack): TaskRisk[] {
  const mitigated: TaskRisk[] = [];
  for (const risk of task.risks) {
    if (
      risk.state === "revealed" &&
      risk.mitigateBy.includes(workTrack) &&
      task.progress[workTrack] >= task.trueNeeds[workTrack] * 0.75
    ) {
      risk.state = "mitigated";
      mitigated.push(risk);
    }
  }
  return mitigated;
}

function maybeCreateDefect(
  state: GameState,
  character: Character,
  task: TaskCard,
  workTrack: WorkTrack,
): TaskRisk | null {
  if (workTrack !== "backend" && workTrack !== "frontend") {
    return null;
  }

  let probability = 0.05;
  if (character.traits.includes("sloppy")) probability += 0.15;
  if (character.traits.includes("fast")) probability += 0.1;
  if (character.fatigue > 70) probability += 0.1;
  if (character.burnout > 60) probability += 0.1;
  if (character.traits.includes("careful")) probability -= 0.1;

  if (!chance(state, clamp(probability, 0, 0.45))) {
    return null;
  }

  const type = workTrack === "backend" ? "backend_bug" : "frontend_bug";
  const defect: TaskRisk = {
    id: `${task.id}-D${task.risks.length + 1}`,
    type,
    severity: randomInt(state, 1, 2),
    state: "hidden",
    discoverBy: ["review", "qa"],
    mitigateBy: [workTrack, "review", "qa"],
    triggerText:
      workTrack === "backend"
        ? "A hidden backend defect was introduced."
        : "A hidden frontend defect was introduced.",
    followupTaskKind: "bug",
  };
  task.risks.push(defect);
  return defect;
}

function applyXp(
  character: Character,
  workTrack: WorkTrack,
  progressGain: number,
  revealedRisks: TaskRisk[],
  mitigatedRisks: TaskRisk[],
): number {
  const rawXp =
    1 +
    Math.floor(progressGain / 15) +
    (revealedRisks.length > 0 ? 2 : 0) +
    (mitigatedRisks.length > 0 ? 3 : 0);
  const xpGain = Math.max(1, Math.round(rawXp * character.growthRate));
  character.xp[workTrack] += xpGain;
  levelUpIfReady(character, workTrack);
  return xpGain;
}

function levelUpIfReady(character: Character, workTrack: WorkTrack): void {
  const threshold = 8 + character.skills[workTrack] * 6;
  if (character.skills[workTrack] >= 5 || character.xp[workTrack] < threshold) {
    return;
  }
  character.skills[workTrack] += 1;
  character.xp[workTrack] -= threshold;
  character.level += 1;
}

function calculateFatigueGain(
  character: Character,
  task: TaskCard,
  offRole: boolean,
  contextSwitched: boolean,
): number {
  let fatigue = 12 + task.pressure;
  if (offRole) fatigue += 4;
  if (contextSwitched) fatigue += 5;
  if (character.traits.includes("contextSwitchHater") && contextSwitched) fatigue += 5;
  if (task.kind === "incident") fatigue += 6;
  if (character.traits.includes("fragile")) fatigue *= 1.3;
  return Math.round(fatigue);
}

function calculateBurnoutGain(
  character: Character,
  task: TaskCard,
  startingFatigue: number,
): number {
  let burnout = 0;
  if (startingFatigue > 60) burnout += 2;
  if (startingFatigue > 80) burnout += 4;
  if (task.kind === "incident") burnout += 3;
  if (task.pressure >= 4) burnout += 1;
  if (character.traits.includes("fragile")) burnout *= 1.5;
  burnout /= character.resilience;
  return Math.round(burnout);
}

function ageActiveTasks(state: GameState): void {
  for (const column of activeColumns) {
    for (const taskId of state.board[column]) {
      const task = state.tasks[taskId];
      task.age += 1;
      if (task.age <= task.deadline) {
        continue;
      }
      let trustLoss = task.pressure;
      if (task.kind === "incident") trustLoss *= 2;
      if (task.modifiers.includes("vip")) trustLoss = Math.ceil(trustLoss * 1.5);
      state.resources.trust = clamp(state.resources.trust - trustLoss, 0, 100);
      if (task.age - task.deadline > 2) {
        state.resources.debt = clamp(state.resources.debt + 1, 0, 100);
      }
      pushEvent(state, {
        type: "task_aged",
        title: `${task.id} is late`,
        body: `${task.title} missed its pressure window.`,
        effects: [`trust -${trustLoss}`],
      });
    }
  }
}

function applyWipFriction(state: GameState): void {
  const wip = activeWip(state);
  state.metrics.wipSamples += 1;
  state.metrics.totalWip += wip;
  if (wip <= state.wipLimit) {
    return;
  }

  const overflow = wip - state.wipLimit;
  for (const character of Object.values(state.characters)) {
    if (character.status === "available") {
      character.fatigue = clamp(character.fatigue + overflow * 2, 0, 100);
    }
  }
  state.resources.debt = clamp(state.resources.debt + overflow, 0, 100);
  pushEvent(state, {
    type: "wip_friction",
    title: "WIP friction",
    body: `${wip} active cards exceed WIP limit ${state.wipLimit}.`,
    effects: [`team fatigue +${overflow * 2}`, `debt +${overflow}`],
  });
}

function applyPassiveRecovery(
  state: GameState,
  workedCharacters: Set<string>,
  restedCharacters: Set<string>,
): void {
  for (const character of Object.values(state.characters)) {
    if (character.status === "sickLeave" || character.status === "burnedOut") {
      continue;
    }
    if (workedCharacters.has(character.id)) {
      character.fatigue = clamp(character.fatigue - 6, 0, 100);
      continue;
    }
    if (restedCharacters.has(character.id)) {
      character.fatigue = clamp(character.fatigue - 35, 0, 100);
      character.burnout = clamp(character.burnout - 4, 0, 100);
      character.status = "available";
      continue;
    }
    character.fatigue = clamp(character.fatigue - 12, 0, 100);
  }
}

function updateSickLeave(state: GameState): void {
  for (const character of Object.values(state.characters)) {
    if (character.burnout >= 100 && character.status !== "sickLeave") {
      character.status = "sickLeave";
      character.unavailableDays = 3;
      character.burnout = 75;
      character.fatigue = 50;
      state.metrics.sickLeaves += 1;
      pushEvent(state, {
        type: "sick_leave",
        title: `${character.name} is on sick leave`,
        body: "Burnout hit the hard limit.",
        effects: ["unavailable 3 days", "burnout reset to 75"],
      });
      continue;
    }

    if (character.status === "sickLeave") {
      character.unavailableDays -= 1;
      character.fatigue = clamp(character.fatigue - 20, 0, 100);
      character.burnout = clamp(character.burnout - 5, 0, 100);
      if (character.unavailableDays <= 0) {
        character.status = "available";
        character.unavailableDays = 0;
        pushEvent(state, {
          type: "back_from_sick_leave",
          title: `${character.name} returns`,
          body: "Available again, but still fragile.",
          effects: [],
        });
      }
    }
  }
}

function maybeGenerateDailyTask(state: GameState): void {
  if (state.board.incoming.length >= 6) {
    return;
  }
  let probability = 0.5;
  if (state.resources.trust < 35) probability += 0.2;
  if (state.resources.debt > 60) probability += 0.2;
  if (activeWip(state) > state.wipLimit) probability -= 0.2;
  if (chance(state, clamp(probability, 0.05, 0.9))) {
    addTaskToState(state, generateTask(state));
  }
}

function checkLoseConditions(state: GameState): void {
  if (state.resources.trust <= 0) {
    state.status = "lost";
    state.lossReason = "trust reached 0";
  }
  if (state.resources.debt >= 100) {
    state.status = "lost";
    state.lossReason = "debt reached 100";
  }
  const allUnavailable = Object.values(state.characters).every(
    (character) =>
      character.status === "sickLeave" || character.status === "burnedOut",
  );
  if (allUnavailable) {
    state.status = "lost";
    state.lossReason = "all characters are unavailable";
  }
}

function runSprintReview(state: GameState): void {
  const budgetBefore = state.resources.budget;
  state.resources.budget += 2;
  if (state.metrics.incidentsThisSprint === 0) state.resources.budget += 1;
  const target = 20 + state.sprint * 5;
  if (state.metrics.valueThisSprint >= target) state.resources.budget += 1;
  if (state.resources.trust < 25) state.resources.budget -= 1;
  state.resources.budget = Math.max(0, state.resources.budget);

  const review: SprintReview = {
    sprint: state.sprint,
    valueDelivered: state.metrics.valueThisSprint,
    releases: state.metrics.releasesThisSprint,
    incidents: state.metrics.incidentsThisSprint,
    trustDelta: state.resources.trust - state.metrics.sprintStartTrust,
    debtDelta: state.resources.debt - state.metrics.sprintStartDebt,
    nearBurnout: Object.values(state.characters)
      .filter((character) => character.burnout >= 70)
      .map((character) => character.name),
    budgetDelta: state.resources.budget - budgetBefore,
  };
  state.latestSprintReview = review;

  pushEvent(state, {
    type: "sprint_review",
    title: `Sprint ${state.sprint} review`,
    body: `${review.releases} releases, ${review.incidents} incidents, value ${review.valueDelivered}.`,
    effects: [
      `trust ${formatDelta(review.trustDelta)}`,
      `debt ${formatDelta(review.debtDelta)}`,
      `budget ${formatDelta(review.budgetDelta)}`,
    ],
  });

  state.sprint += 1;
  state.day = 1;
  state.metrics.valueThisSprint = 0;
  state.metrics.releasesThisSprint = 0;
  state.metrics.incidentsThisSprint = 0;
  state.metrics.sprintStartTrust = state.resources.trust;
  state.metrics.sprintStartDebt = state.resources.debt;

  if (state.sprint > state.maxSprints) {
    state.status =
      state.resources.trust > 0 &&
      state.resources.debt < 100 &&
      state.resources.value > 0
        ? "won"
        : "lost";
    state.lossReason = state.status === "lost" ? "run ended below thresholds" : null;
  }
}

function calculateReleaseDeltas(
  task: TaskCard,
  tier: ReleaseTier,
): { valueDelta: number; trustDelta: number; debtDelta: number } {
  if (task.kind === "techDebt" && (tier === "clean" || tier === "rough")) {
    return {
      valueDelta: Math.round(task.value * 0.3),
      trustDelta: tier === "clean" ? 2 : 0,
      debtDelta: -task.value,
    };
  }

  if (tier === "clean") {
    return { valueDelta: task.value, trustDelta: 4, debtDelta: 0 };
  }
  if (tier === "rough") {
    return { valueDelta: task.value, trustDelta: 1, debtDelta: 2 };
  }
  if (tier === "bugEscaped") {
    return { valueDelta: Math.round(task.value * 0.7), trustDelta: -4, debtDelta: 5 };
  }
  return { valueDelta: Math.round(task.value * 0.3), trustDelta: -12, debtDelta: 8 };
}

function releaseTierFromRisk(riskScore: number): ReleaseTier {
  if (riskScore <= 20) return "clean";
  if (riskScore <= 45) return "rough";
  if (riskScore <= 70) return "bugEscaped";
  return "incident";
}

function triggerRisksForOutcome(task: TaskCard, tier: ReleaseTier): string[] {
  if (tier === "clean" || tier === "rough") {
    return [];
  }
  const count = tier === "incident" ? 2 : 1;
  return task.risks
    .filter((risk) => risk.state !== "mitigated")
    .sort((a, b) => b.severity - a.severity)
    .slice(0, count)
    .map((risk) => {
      risk.state = "triggered";
      return risk.id;
    });
}

function spawnFollowUp(
  state: GameState,
  fallbackKind: TaskKind,
  sourceTask: TaskCard,
): string {
  const triggeredRisk = sourceTask.risks.find((risk) => risk.state === "triggered");
  const kind = triggeredRisk?.followupTaskKind ?? fallbackKind;
  const followUp = generateTask(state, kind);
  followUp.domain = sourceTask.domain;
  followUp.title = `${followUp.id}: Follow up ${sourceTask.id}`;
  followUp.pressure = clamp(sourceTask.pressure + 1, 1, 6);
  followUp.deadline = Math.max(1, sourceTask.deadline - 2);
  addTaskToState(state, followUp);
  return followUp.id;
}

function removeFromBoard(state: GameState, taskId: string): void {
  for (const column of BOARD_COLUMNS) {
    const index = state.board[column].indexOf(taskId);
    if (index >= 0) {
      state.board[column].splice(index, 1);
      return;
    }
  }
}

function pushEvent(
  state: GameState,
  event: Omit<GameEvent, "day" | "sprint">,
): void {
  state.log.unshift({
    day: state.day,
    sprint: state.sprint,
    ...event,
  });
  if (state.log.length > 200) {
    state.log.length = 200;
  }
}

function formatDelta(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

function formatReleaseTier(tier: ReleaseTier): string {
  if (tier === "clean") return "clean release";
  if (tier === "rough") return "rough success";
  if (tier === "bugEscaped") return "bug escaped";
  return "incident";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
