import { normalizeEngineLocale, type EngineLocale } from "../locale";
import type { RtTask } from "../types";
import { getTaskNarrativeArchetype } from "./taskNarrative";
import type {
  TaskNarrativeFlavorText,
  TaskNarrativeText,
} from "./taskNarrativeCatalog";

export interface RenderedTaskNarrative {
  title: string;
  headline: string;
  core: TaskNarrativeText;
  flavor: TaskNarrativeFlavorText | null;
  tags: string[];
}

export function renderTaskNarrative(task: RtTask, locale: EngineLocale): RenderedTaskNarrative {
  const normalizedLocale = normalizeEngineLocale(locale);
  const archetype = getTaskNarrativeArchetype(task.narrativeRef.archetypeId);
  const branch = archetype.branches[task.narrativeRef.branchId];
  if (!branch) {
    throw new Error(
      `Task ${task.id} narrative branch missing: ${task.narrativeRef.archetypeId}/${task.narrativeRef.branchId}`,
    );
  }

  const core = renderCoreText(
    branch.core[normalizedLocale] ?? branch.core.en,
    archetype.variables,
    task.narrativeRef.variableValueIds,
    normalizedLocale,
  );
  const flavorTemplate =
    task.narrativeRef.density === "flavor"
      ? branch.flavor?.[normalizedLocale] ?? branch.flavor?.en ?? null
      : null;
  const flavor = flavorTemplate
    ? renderFlavorText(
        flavorTemplate,
        archetype.variables,
        task.narrativeRef.variableValueIds,
        normalizedLocale,
      )
    : null;
  return {
    title: `${task.id}: ${core.headline}`,
    headline: core.headline,
    core,
    flavor,
    tags: task.narrativeRef.tags,
  };
}

function renderCoreText(
  template: TaskNarrativeText,
  variables: Parameters<typeof renderTemplate>[1],
  variableValueIds: Record<string, string>,
  locale: EngineLocale,
): TaskNarrativeText {
  return {
    headline: renderTemplate(template.headline, variables, variableValueIds, locale),
    problem: renderTemplate(template.problem, variables, variableValueIds, locale),
    stakes: renderTemplate(template.stakes, variables, variableValueIds, locale),
    failurePreview: renderTemplate(template.failurePreview, variables, variableValueIds, locale),
  };
}

function renderFlavorText(
  template: TaskNarrativeFlavorText,
  variables: Parameters<typeof renderTemplate>[1],
  variableValueIds: Record<string, string>,
  locale: EngineLocale,
): TaskNarrativeFlavorText {
  return {
    aside: template.aside ? renderTemplate(template.aside, variables, variableValueIds, locale) : undefined,
    extraDetail: template.extraDetail
      ? renderTemplate(template.extraDetail, variables, variableValueIds, locale)
      : undefined,
  };
}

function renderTemplate(
  template: string,
  variables: Record<string, { values: Record<string, Record<EngineLocale, string>> }>,
  variableValueIds: Record<string, string>,
  locale: EngineLocale,
): string {
  return template.replace(/\{(?<key>[a-zA-Z0-9_]+)\}/g, (match, key: string) => {
    const valueId = variableValueIds[key] ?? (key.startsWith("area") ? variableValueIds.area : undefined);
    const value = valueId ? variables[key]?.values[valueId] : undefined;
    return value?.[locale] ?? value?.en ?? valueId ?? match;
  });
}
