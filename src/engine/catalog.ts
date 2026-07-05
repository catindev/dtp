import type {
  RtRole,
  RtStage,
  RtSubtaskRole,
  RtTaskDomain,
} from "./types";

export const DOMAINS: readonly RtTaskDomain[] = [
  "payments",
  "auth",
  "admin",
  "search",
  "reports",
  "notifications",
];

export const DOMAIN_PREFIXES: Record<RtTaskDomain, string> = {
  payments: "PAY",
  auth: "AUTH",
  admin: "ADM",
  search: "SRCH",
  reports: "REP",
  notifications: "NTF",
};

export const BASE_SKILLS: Record<RtRole, Record<RtStage, number>> = {
  analyst: { analysis: 5, todo: 2, test: 2 },
  designer: { analysis: 3, todo: 3, test: 1 },
  backend: { analysis: 1, todo: 5, test: 2 },
  frontend: { analysis: 1, todo: 5, test: 2 },
  qa: { analysis: 2, todo: 1, test: 5 },
  sre: { analysis: 2, todo: 3, test: 4 },
};

export const BASE_SPECIALTIES: Record<RtRole, Record<RtSubtaskRole, number>> = {
  analyst: { backend: 1, frontend: 1, design: 2, qa: 2, sre: 1, bugfix: 1 },
  designer: { backend: 0, frontend: 3, design: 5, qa: 1, sre: 0, bugfix: 1 },
  backend: { backend: 5, frontend: 2, design: 0, qa: 1, sre: 2, bugfix: 4 },
  frontend: { backend: 2, frontend: 5, design: 2, qa: 1, sre: 0, bugfix: 3 },
  qa: { backend: 1, frontend: 1, design: 1, qa: 5, sre: 1, bugfix: 1 },
  sre: { backend: 3, frontend: 0, design: 0, qa: 3, sre: 5, bugfix: 3 },
};
