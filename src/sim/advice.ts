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

export interface UpgradeReport {
  /** Upgrades that were in place for a disaster that hit, and reduced its damage. */
  helped: Mod[];
  /** Upgrades the player built that never reduced any damage. */
  didNotHelp: Mod[];
  /** Upgrades the player lacked when a disaster hit, which would have lowered that hit's damage. */
  wouldHaveHelped: Mod[];
}

/** For the final report: which upgrades reduced damage, which didn't, and which would have. In `mods.json` order. */
export function upgradeReport(data: GameData, state: GameState): UpgradeReport {
  const helped = new Set<string>();
  const missed = new Set<string>();
  for (const rec of state.history) {
    for (const r of rec.results) {
      if (!r.hit) continue;
      r.helpedBy.forEach((id) => helped.add(id));
      const have = r.helpedBy.map((id) => getMod(data, id));
      const actualPercent = effectivePercent(data, r.disaster, have);
      for (const mod of data.mods) {
        if (r.helpedBy.includes(mod.id)) continue;
        if (effectivePercent(data, r.disaster, [...have, mod]) < actualPercent) missed.add(mod.id);
      }
    }
  }
  const built = new Set(allModsBuilt(state));
  return {
    helped: data.mods.filter((m) => helped.has(m.id)),
    didNotHelp: data.mods.filter((m) => built.has(m.id) && !helped.has(m.id)),
    wouldHaveHelped: data.mods.filter((m) => missed.has(m.id) && !helped.has(m.id)),
  };
}

export function totalRepairs(state: GameState): { count: number; cost: number } {
  const repairs = state.history.flatMap((r) => r.actions.repairs);
  return { count: repairs.length, cost: repairs.reduce((sum, r) => sum + r.cost, 0) };
}

export function allModsBuilt(state: GameState): string[] {
  return state.history.flatMap((r: YearRecord) => r.actions.modsBuilt);
}
