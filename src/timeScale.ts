export const TIME_SCALE_OPTIONS = [1, 1.5, 2] as const;

export type TimeScale = (typeof TIME_SCALE_OPTIONS)[number];

export function timeScaleLabel(timeScale: TimeScale): string {
  return `${timeScale}x`;
}
