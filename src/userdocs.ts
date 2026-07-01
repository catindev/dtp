import enGameLoopDoc from "../userdocs/en/game-loop.md?raw";
import enOverviewDoc from "../userdocs/en/overview.md?raw";
import enRolesDoc from "../userdocs/en/roles.md?raw";
import enTasksQualityDoc from "../userdocs/en/tasks-quality.md?raw";
import ruGameLoopDoc from "../userdocs/ru/game-loop.md?raw";
import ruOverviewDoc from "../userdocs/ru/overview.md?raw";
import ruRolesDoc from "../userdocs/ru/roles.md?raw";
import ruTasksQualityDoc from "../userdocs/ru/tasks-quality.md?raw";
import type { Locale } from "./i18n";

export interface UserDoc {
  id: string;
  title: Record<Locale, string>;
  markdown: Record<Locale, string>;
}

export const USER_DOCS: UserDoc[] = [
  {
    id: "overview",
    title: {
      en: "Game overview",
      ru: "Об игре",
    },
    markdown: {
      en: enOverviewDoc,
      ru: ruOverviewDoc,
    },
  },
  {
    id: "game-loop",
    title: {
      en: "Game loop",
      ru: "Игровой процесс",
    },
    markdown: {
      en: enGameLoopDoc,
      ru: ruGameLoopDoc,
    },
  },
  {
    id: "roles",
    title: {
      en: "Team roles",
      ru: "Роли в команде",
    },
    markdown: {
      en: enRolesDoc,
      ru: ruRolesDoc,
    },
  },
  {
    id: "tasks-quality",
    title: {
      en: "Quality and risk",
      ru: "Качество и риски",
    },
    markdown: {
      en: enTasksQualityDoc,
      ru: ruTasksQualityDoc,
    },
  },
];
