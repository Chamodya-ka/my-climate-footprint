import type { Disaster, GameData, Mod } from '../data/schemas';
import { activeMods, disastersFor, type HouseState } from './state';

const PERCENT = 100;

export function reductionFrom(mods: Mod[], disaster: Disaster): number {
  return mods.reduce((sum, mod) => sum + (mod.reductions[disaster] ?? 0), 0);
}

/** effective% = max(minDamagePercent, base% - sum of reductions). */
export function effectivePercent(data: GameData, disaster: Disaster, mods: Mod[]): number {
  const base = data.weather.baseDamagePercent[disaster];
  return Math.max(data.balance.minDamagePercent, base - reductionFrom(mods, disaster));
}

/** The "damage if hit" % for a house right now. */
export function damageIfHit(data: GameData, house: HouseState, disaster: Disaster): number {
  return effectivePercent(data, disaster, activeMods(data, house));
}

export function valueLostFor(fullValue: number, percent: number): number {
  return Math.round((fullValue * percent) / PERCENT);
}

/** How many more hits of this disaster the house can take before it is destroyed. */
export function hitsLeft(data: GameData, house: HouseState, disaster: Disaster): number {
  if (house.destroyed) return 0;
  const perHit = valueLostFor(house.fullValue, damageIfHit(data, house, disaster));
  return Math.ceil(house.value / perHit);
}

/** Fewest hits left across the disasters this house's area can roll. */
export function minHitsLeft(data: GameData, house: HouseState): number {
  return Math.min(...disastersFor(data, house).map((d) => hitsLeft(data, house, d)));
}

/** True when adding this mod would not lower damage for any disaster it protects against. */
export function modAddsNothing(data: GameData, house: HouseState, mod: Mod): boolean {
  const current = activeMods(data, house);
  return (Object.keys(mod.reductions) as Disaster[]).every(
    (d) => effectivePercent(data, d, current) === effectivePercent(data, d, [...current, mod]),
  );
}

/** True when a mod protects against none of the disasters this house's area rolls. */
export function modFitsArea(data: GameData, house: HouseState, mod: Mod): boolean {
  return disastersFor(data, house).some((d) => (mod.reductions[d] ?? 0) > 0);
}
