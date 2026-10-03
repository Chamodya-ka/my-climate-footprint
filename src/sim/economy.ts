import type { GameData, House } from '../data/schemas';
import type { HouseState } from './state';

const PERCENT = 100;

/** The income added at the start of a year: a share of the house's current value (lower while damaged). */
export function yearlyIncome(data: GameData, house: HouseState | null): number {
  if (!house) return 0;
  return Math.round((house.value * data.balance.incomePercentOfHouseValue) / PERCENT);
}

export function repairCost(data: GameData, house: HouseState): number {
  return Math.round(data.balance.repairCostRate * (house.fullValue - house.value));
}

/** Houses the player could move to: every house except the one they're leaving. */
export function otherHouses(data: GameData, excludeHouseId: string | null): House[] {
  return data.houses.filter((h) => h.id !== excludeHouseId);
}

export function cheapestOtherHouse(data: GameData, excludeHouseId: string | null): House | null {
  return otherHouses(data, excludeHouseId).reduce<House | null>(
    (best, h) => (best === null || h.price < best.price ? h : best),
    null,
  );
}

export function netWorth(bank: number, house: HouseState | null): number {
  return bank + (house?.value ?? 0);
}
