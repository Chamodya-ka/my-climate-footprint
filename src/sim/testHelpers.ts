import { loadGameData } from '../data';
import type { GameData } from '../data/schemas';
import type { GameState } from './state';
import { buyHouse, expectOk, newGame } from './turn';

export const data: GameData = loadGameData();

/** A deep copy of the real data with overrides, for isolating one rule. */
export function dataWith(patch: (d: GameData) => void): GameData {
  const copy = structuredClone(data);
  patch(copy);
  return copy;
}

export const FLOOD_HOUSE = 'valley-house';
export const LANDSLIDE_HOUSE = 'slope-house';

/** A game in year 1's action phase, in the given house. */
export function startedGame(houseId = FLOOD_HOUSE, d: GameData = data, seed = 1): GameState {
  return expectOk(buyHouse(newGame(d, seed), d, houseId));
}

/** Overrides the house value/mods directly to set up a scenario. */
export function withHouse(state: GameState, patch: Partial<NonNullable<GameState['house']>>): GameState {
  const s = structuredClone(state);
  Object.assign(s.house!, patch);
  return s;
}
