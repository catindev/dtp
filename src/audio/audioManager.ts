import {
  SOUND_CATALOG,
  type SoundEffectName,
} from "./soundCatalog";

const MAIN_THEME_VOLUME = 0.25;
const SFX_VOLUME = 0.8;

type DtpAudioState = {
  mainTheme: HTMLAudioElement | null;
  mainThemeInstances: HTMLAudioElement[];
  mainThemePlayPromise: Promise<void> | null;
  mainThemeRestartOnNextPlay: boolean;
  mainThemeShouldPlay: boolean;
  randomState: number;
};

const AUDIO_STATE_KEY = "__dtpAudioState";

export function startMainTheme({ restart = false }: { restart?: boolean } = {}): void {
  const state = getAudioState();
  const audio = getMainThemeAudio();
  state.mainThemeShouldPlay = true;
  if (restart || state.mainThemeRestartOnNextPlay) {
    audio.currentTime = 0;
    state.mainThemeRestartOnNextPlay = false;
  }
  audio.volume = MAIN_THEME_VOLUME;
  audio.loop = true;
  if (!audio.paused || state.mainThemePlayPromise) return;
  state.mainThemePlayPromise = audio.play()
    .catch(() => {
      // Browser autoplay policy can block playback until the next user gesture.
    })
    .finally(() => {
      state.mainThemePlayPromise = null;
      if (!state.mainThemeShouldPlay) {
        audio.pause();
      }
    });
}

export function pauseMainTheme(): void {
  const state = getAudioState();
  state.mainThemeShouldPlay = false;
  for (const audio of state.mainThemeInstances) {
    audio.pause();
  }
}

export function restartMainThemeOnNextPlay(): void {
  const state = getAudioState();
  const audio = getMainThemeAudio();
  audio.pause();
  audio.currentTime = 0;
  state.mainThemeRestartOnNextPlay = true;
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
  const state = getAudioState();
  if (!state.mainTheme) {
    state.mainTheme = new Audio(SOUND_CATALOG.mainTheme);
    state.mainTheme.preload = "auto";
    state.mainTheme.loop = true;
    state.mainTheme.volume = MAIN_THEME_VOLUME;
    state.mainThemeInstances.push(state.mainTheme);
  }
  return state.mainTheme;
}

function nextRandomIndex(length: number): number {
  if (length <= 1) return 0;
  const state = getAudioState();
  state.randomState = (state.randomState * 1664525 + 1013904223) >>> 0;
  return state.randomState % length;
}

function getAudioState(): DtpAudioState {
  const globalState = globalThis as typeof globalThis & {
    [AUDIO_STATE_KEY]?: DtpAudioState;
  };
  if (!globalState[AUDIO_STATE_KEY]) {
    globalState[AUDIO_STATE_KEY] = {
      mainTheme: null,
      mainThemeInstances: [],
      mainThemePlayPromise: null,
      mainThemeRestartOnNextPlay: false,
      mainThemeShouldPlay: false,
      randomState: Date.now() >>> 0,
    };
  }
  return globalState[AUDIO_STATE_KEY];
}
