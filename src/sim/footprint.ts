import type { GameData } from '../data/schemas';
import { activeMods, type HouseState } from './state';

export function modFootprintDelta(data: GameData, house: HouseState | null): number {
  if (!house) return 0;
  return activeMods(data, house).reduce((sum, mod) => sum + mod.footprintDelta, 0);
}

export interface FootprintChange {
  baseIncrement: number;
  quizDelta: number;
  modDelta: number;
  after: number;
}

/** footprint += baseYearlyIncrement + quiz delta + active mod deltas, floored at 0. */
export function nextFootprint(
  data: GameData,
  footprint: number,
  quizDelta: number,
  house: HouseState | null,
): FootprintChange {
  const baseIncrement = data.balance.baseYearlyIncrement;
  const modDelta = modFootprintDelta(data, house);
  // Round away float noise (e.g. 6.1 + 0.2) so band boundaries behave.
  const raw = Math.round((footprint + baseIncrement + quizDelta + modDelta) * 1e6) / 1e6;
  return { baseIncrement, quizDelta, modDelta, after: Math.max(0, raw) };
}
