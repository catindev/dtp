export const WORK_TRACKS = [
  "analysis",
  "design",
  "backend",
  "frontend",
  "review",
  "qa",
  "releaseSafety",
] as const;

export type WorkTrack = (typeof WORK_TRACKS)[number];

export const BOARD_COLUMNS = [
  "incoming",
  "analysis",
  "design",
  "dev",
  "review",
  "qa",
  "release",
  "done",
] as const;

export type BoardColumn = (typeof BOARD_COLUMNS)[number];

export type TaskKind =
  | "feature"
  | "bug"
  | "techDebt"
  | "integration"
  | "incident"
  | "performance"
  | "compliance";

export type TaskDomain =
  | "payments"
  | "auth"
  | "admin"
  | "search"
  | "reports"
  | "notifications";

export type TaskModifier =
  | "legacy"
  | "vip"
  | "vague"
  | "deadline"
  | "crossTeam"
  | "customerVisible"
  | "smallButTricky";

export type NeedLevel = "none" | "low" | "medium" | "high" | "unknown";

export type RiskState = "hidden" | "revealed" | "mitigated" | "triggered";

export type RiskType =
  | "wrong_scope"
  | "ux_confusion"
  | "backend_bug"
  | "frontend_bug"
  | "regression"
  | "performance"
  | "data_loss"
  | "dependency"
  | "release_blast_radius";

export type CharacterRole =
  | "analyst"
  | "designer"
  | "backend"
  | "frontend"
  | "qa"
  | "sre";

export type Seniority = "junior" | "middle" | "senior";

export type CharacterTrait =
  | "fast"
  | "careful"
  | "mentor"
  | "legacyExpert"
  | "productSense"
  | "fragile"
  | "sloppy"
  | "soloist"
  | "contextSwitchHater";

export type CharacterStatus =
  | "available"
  | "resting"
  | "sickLeave"
  | "burnedOut";

export type ReleaseTier =
  | "clean"
  | "rough"
  | "bugEscaped"
  | "incident";

export type RunStatus = "running" | "won" | "lost";

export type SkillMap = Record<WorkTrack, number>;

export type BoardState = Record<BoardColumn, string[]>;

export interface Resources {
  trust: number;
  debt: number;
  value: number;
  budget: number;
}

export interface TaskVisibleInfo {
  description: string;
  suspectedTags: string[];
  knownNeeds: Record<WorkTrack, NeedLevel>;
  revealedRisks: string[];
}

export interface TaskRisk {
  id: string;
  type: RiskType;
  severity: number;
  state: RiskState;
  discoverBy: WorkTrack[];
  mitigateBy: WorkTrack[];
  triggerText: string;
  followupTaskKind: TaskKind | null;
}

export interface TaskCard {
  id: string;
  title: string;
  kind: TaskKind;
  domain: TaskDomain;
  column: BoardColumn;
  age: number;
  deadline: number;
  pressure: number;
  value: number;
  size: number;
  modifiers: TaskModifier[];
  visible: TaskVisibleInfo;
  trueNeeds: SkillMap;
  progress: SkillMap;
  risks: TaskRisk[];
  contributors: string[];
  released: boolean;
  releaseOutcome: ReleaseOutcome | null;
}

export interface Character {
  id: string;
  name: string;
  role: CharacterRole;
  seniority: Seniority;
  level: number;
  skills: SkillMap;
  xp: SkillMap;
  traits: CharacterTrait[];
  fatigue: number;
  burnout: number;
  status: CharacterStatus;
  focusTaskId: string | null;
  salary: number;
  growthRate: number;
  resilience: number;
  unavailableDays: number;
}

export interface GameEvent {
  day: number;
  sprint: number;
  type: string;
  title: string;
  body: string;
  effects: string[];
}

export interface ReleaseOutcome {
  taskId: string;
  tier: ReleaseTier;
  riskScore: number;
  valueDelta: number;
  trustDelta: number;
  debtDelta: number;
  spawnedTaskId: string | null;
  triggeredRiskIds: string[];
}

export interface WorkResult {
  progressGain: number;
  revealedRisks: TaskRisk[];
  mitigatedRisks: TaskRisk[];
  xpGain: number;
  fatigueGain: number;
  burnoutGain: number;
  createdDefect: TaskRisk | null;
}

export interface Assignment {
  characterId: string;
  action: "work" | "rest";
  taskId?: string;
  workTrack?: WorkTrack;
}

export interface SprintReview {
  sprint: number;
  valueDelivered: number;
  releases: number;
  incidents: number;
  trustDelta: number;
  debtDelta: number;
  nearBurnout: string[];
  budgetDelta: number;
}

export interface RunMetrics {
  releases: number;
  cleanReleases: number;
  roughSuccesses: number;
  escapedBugs: number;
  incidents: number;
  revealedRisks: number;
  mitigatedRisks: number;
  restActions: number;
  sickLeaves: number;
  wipSamples: number;
  totalWip: number;
  valueThisSprint: number;
  releasesThisSprint: number;
  incidentsThisSprint: number;
  sprintStartTrust: number;
  sprintStartDebt: number;
}

export interface GameState {
  seed: number;
  rngState: number;
  day: number;
  sprint: number;
  daysPerSprint: number;
  maxSprints: number;
  status: RunStatus;
  lossReason: string | null;
  resources: Resources;
  board: BoardState;
  tasks: Record<string, TaskCard>;
  characters: Record<string, Character>;
  candidatePool: Character[];
  nextTaskId: number;
  nextCharacterId: number;
  wipLimit: number;
  log: GameEvent[];
  latestSprintReview: SprintReview | null;
  metrics: RunMetrics;
}
