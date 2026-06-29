export function normalizeSeed(seed: number): number {
  return seed >>> 0 || 1;
}

export function nextRandom(state: { rngState: number }): number {
  let value = state.rngState >>> 0;
  value += 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  state.rngState = value >>> 0;
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

export function randomInt(
  state: { rngState: number },
  min: number,
  max: number,
): number {
  return Math.floor(nextRandom(state) * (max - min + 1)) + min;
}

export function chance(state: { rngState: number }, probability: number): boolean {
  return nextRandom(state) < probability;
}

export function pickOne<T>(state: { rngState: number }, items: readonly T[]): T {
  if (items.length === 0) {
    throw new Error("Cannot pick from an empty list.");
  }
  return items[randomInt(state, 0, items.length - 1)];
}

export function pickSome<T>(
  state: { rngState: number },
  items: readonly T[],
  count: number,
): T[] {
  const pool = [...items];
  const result: T[] = [];
  while (pool.length > 0 && result.length < count) {
    const index = randomInt(state, 0, pool.length - 1);
    const [item] = pool.splice(index, 1);
    result.push(item);
  }
  return result;
}

export function weightedPick<T>(
  state: { rngState: number },
  entries: Array<{ item: T; weight: number }>,
): T {
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  if (total <= 0) {
    return entries[0].item;
  }

  let cursor = nextRandom(state) * total;
  for (const entry of entries) {
    cursor -= Math.max(0, entry.weight);
    if (cursor <= 0) {
      return entry.item;
    }
  }

  return entries[entries.length - 1].item;
}
