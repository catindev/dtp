export type EngineLocale = "en" | "ru";

export const DEFAULT_ENGINE_LOCALE: EngineLocale = "en";

export function normalizeEngineLocale(value: unknown): EngineLocale {
  return value === "ru" || value === "en" ? value : DEFAULT_ENGINE_LOCALE;
}
