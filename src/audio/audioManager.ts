import {
  SOUND_CATALOG,
  type SoundEffectName,
} from "./soundCatalog";

const MAIN_THEME_VOLUME = 0.25;
const SFX_VOLUME = 0.8;

let mainTheme: HTMLAudioElement | null = null;
let randomState = Date.now() >>> 0;

export function startMainTheme({ restart = false }: { restart?: boolean } = {}): void {
  const audio = getMainThemeAudio();
  if (restart) {
    audio.currentTime = 0;
  }
  audio.volume = MAIN_THEME_VOLUME;
  audio.loop = true;
  void audio.play().catch(() => {
    // Browser autoplay policy can block playback until the next user gesture.
  });
}

export function pauseMainTheme(): void {
  if (!mainTheme) return;
  mainTheme.pause();
}

export function restartMainThemeOnNextPlay(): void {
  const audio = getMainThemeAudio();
  audio.pause();
  audio.currentTime = 0;
}

export function playSoundEffect(effect: SoundEffectName): void {
  const variants = SOUND_CATALOG[effect];
  const src = variants[nextRandomIndex(variants.length)];
  const audio = new Audio(src);
  audio.volume = SFX_VOLUME;
  void audio.play().catch(() => {
    // Non-critical feedback sound; ignore blocked playback.
  });
}

function getMainThemeAudio(): HTMLAudioElement {
  if (!mainTheme) {
    mainTheme = new Audio(SOUND_CATALOG.mainTheme);
    mainTheme.preload = "auto";
    mainTheme.loop = true;
    mainTheme.volume = MAIN_THEME_VOLUME;
  }
  return mainTheme;
}

function nextRandomIndex(length: number): number {
  if (length <= 1) return 0;
  randomState = (randomState * 1664525 + 1013904223) >>> 0;
  return randomState % length;
}
