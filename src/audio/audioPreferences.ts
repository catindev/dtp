export const MUSIC_ENABLED_STORAGE_KEY = "dtp.musicEnabled.v1";

export function loadMusicEnabledPreference(): boolean {
  try {
    return window.localStorage.getItem(MUSIC_ENABLED_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function saveMusicEnabledPreference(enabled: boolean): void {
  try {
    window.localStorage.setItem(MUSIC_ENABLED_STORAGE_KEY, enabled ? "true" : "false");
  } catch {
    // Non-critical preference; ignore unavailable storage.
  }
}
