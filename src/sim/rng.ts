/**
 * Seeded pseudo-random numbers (mulberry32). The RNG state is a single
 * uint32 stored in GameState, so a game is fully serialisable and replayable.
 * The constants below are part of the algorithm, not game balance.
 */
export interface RandomDraw {
  /** Uniform in [0, 1). */
  value: number;
  /** The RNG state to store for the next draw. */
  state: number;
}

export function seedToState(seed: number): number {
  return seed >>> 0;
}

export function nextRandom(state: number): RandomDraw {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  return { value, state: next };
}

/** Fisher–Yates shuffle driven by the seeded RNG. Returns a new array and the advanced RNG state. */
export function shuffle<T>(items: readonly T[], state: number): { items: T[]; state: number } {
  const out = [...items];
  let s = state;
  for (let i = out.length - 1; i > 0; i--) {
    const draw = nextRandom(s);
    s = draw.state;
    const j = Math.floor(draw.value * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return { items: out, state: s };
}
