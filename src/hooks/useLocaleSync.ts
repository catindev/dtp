import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { LOCALE_STORAGE_KEY, normalizeLocale, type Locale } from "../i18n";
import { type RtGameState } from "../realtime/simulation";

export function loadStoredLocale(): Locale {
  const storage = getBrowserStorage();
  return normalizeLocale(storage?.getItem(LOCALE_STORAGE_KEY));
}

export function useLocaleGameSync(
  locale: Locale,
  setGame: Dispatch<SetStateAction<RtGameState>>,
  latestGameRef: MutableRefObject<RtGameState>,
): void {
  useEffect(() => {
    saveLocale(locale);
    setGame((current) => {
      if (current.locale === locale) return current;
      const next = { ...current, locale };
      latestGameRef.current = next;
      return next;
    });
  }, [latestGameRef, locale, setGame]);
}

function saveLocale(locale: Locale): void {
  const storage = getBrowserStorage();
  if (!storage) return;
  try {
    storage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Locale selection is a convenience setting.
  }
}

function getBrowserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
