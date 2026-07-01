export interface RandomHost {
  rngState: number;
}

export function normalizeRandomHost(host: RandomHost): RandomHost {
  host.rngState = host.rngState >>> 0 || 1;
  return host;
}

export function nextRandom(host: RandomHost): number {
  normalizeRandomHost(host);
  let value = host.rngState >>> 0;
  value += 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  host.rngState = value >>> 0;
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

export function randomBetween(host: RandomHost, min: number, max: number): number {
  return min + nextRandom(host) * (max - min);
}

export function randomInt(host: RandomHost, min: number, max: number): number {
  return Math.floor(randomBetween(host, min, max + 1));
}

export function chance(host: RandomHost, probability: number): boolean {
  return nextRandom(host) < probability;
}

export function pickOne<T>(host: RandomHost, items: readonly T[]): T {
  return items[randomInt(host, 0, items.length - 1)];
}

export function shuffle<T>(host: RandomHost, items: readonly T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(host, 0, index);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

export function weightedPick<T>(
  host: RandomHost,
  entries: Array<{ item: T; weight: number }>,
): T {
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  let cursor = nextRandom(host) * total;
  for (const entry of entries) {
    cursor -= Math.max(0, entry.weight);
    if (cursor <= 0) return entry.item;
  }
  return entries[entries.length - 1].item;
}
