const TUTORIAL_COMPLETED_KEY = "dtp.tutorial.completed";

export function loadTutorialCompleted(): boolean {
  const storage = getStorage();
  if (!storage) return false;
  try {
    return storage.getItem(TUTORIAL_COMPLETED_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveTutorialCompleted(completed: boolean): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(TUTORIAL_COMPLETED_KEY, completed ? "true" : "false");
  } catch {
    // Tutorial completion should never block the game.
  }
}

export function clearTutorialCompleted(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(TUTORIAL_COMPLETED_KEY);
  } catch {
    // Ignore storage errors.
  }
}

function getStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
