import type { Disaster, GameData, Mod } from '../data/schemas';
import { effectivePercent, modFitsArea } from './damage';
import { getMod, type GameState, type HouseState, type YearRecord } from './state';

export interface Suggestion {
  mod: Mod;
  disaster: Disaster;
  /** Damage % with the mods the house actually had. */
  actualPercent: number;
  /** Damage % if this mod had also been in place. */
  withModPercent: number;
}

/**
 * The single unbuilt mod that would most have lowered damage from `disaster`,
 * given the mods in `modIds`. Null if nothing would help (already at the floor).
 */
export function bestMissingMod(data: GameData, modIds: string[], disaster: Disaster): Suggestion | null {
  const have = modIds.map((id) => getMod(data, id));
  const actualPercent = effectivePercent(data, disaster, have);
  let best: Suggestion | null = null;
  for (const mod of data.mods) {
    if (modIds.includes(mod.id) || !(mod.reductions[disaster] ?? 0)) continue;
    const withModPercent = effectivePercent(data, disaster, [...have, mod]);
    if (withModPercent < actualPercent && (!best || withModPercent < best.withModPercent)) {
      best = { mod, disaster, actualPercent, withModPercent };
    }
  }
  return best;
}

/** Built mods that protect against none of this area's disasters. */
export function modsThatDontFit(data: GameData, house: HouseState): Mod[] {
  return [...house.permanentMods, ...house.consumables]
    .map((id) => getMod(data, id))
    .filter((mod) => !modFitsArea(data, house, mod));
}

export interface DisasterSummary {
  year: number;
  disaster: Disaster;
  percent: number;
  valueLost: number;
}

export function disastersFaced(state: GameState): DisasterSummary[] {
  return state.history.flatMap((rec) =>
    rec.results
      .filter((r) => r.hit)
      .map((r) => ({ year: rec.year, disaster: r.disaster, percent: r.effectivePercent, valueLost: r.valueLost })),
  );
}

/** For the final report: per disaster that hit, the best mod the player lacked at the time. */
export function whatWouldHaveHelped(data: GameData, state: GameState): Suggestion[] {
  const byDisaster = new Map<Disaster, Suggestion>();
  for (const rec of state.history) {
    for (const r of rec.results) {
      if (!r.hit || byDisaster.has(r.disaster)) continue;
      const suggestion = bestMissingMod(data, r.helpedBy, r.disaster);
      if (suggestion) byDisaster.set(r.disaster, suggestion);
    }
  }
  return [...byDisaster.values()];
}

export function totalRepairs(state: GameState): { count: number; cost: number } {
  const repairs = state.history.flatMap((r) => r.actions.repairs);
  return { count: repairs.length, cost: repairs.reduce((sum, r) => sum + r.cost, 0) };
}

export function allModsBuilt(state: GameState): string[] {
  return state.history.flatMap((r: YearRecord) => r.actions.modsBuilt);
}
