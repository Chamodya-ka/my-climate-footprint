import type { Disaster, Weather, WeatherBand } from '../data/schemas';
import { nextRandom } from './rng';

const PERCENT = 100;

/**
 * Finds the band for a footprint. Bands include their lower bound and exclude
 * their upper bound; anything at or above the last band's max uses the last band.
 */
export function bandFor(weather: Weather, footprint: number): WeatherBand {
  const { bands } = weather;
  const last = bands[bands.length - 1];
  const first = bands[0];
  if (!first || !last) throw new Error('weather.json has no bands');
  if (footprint >= last.max) return last;
  return bands.find((b) => footprint >= b.min && footprint < b.max) ?? first;
}

export function oddsFor(weather: Weather, footprint: number, disaster: Disaster): number {
  return bandFor(weather, footprint).odds[disaster];
}

export interface Roll {
  roll: number;
  hit: boolean;
  rngState: number;
}

/** Rolls 0–99 from the seeded RNG; the disaster hits when roll < chancePercent. */
export function rollDisaster(rngState: number, chancePercent: number): Roll {
  const draw = nextRandom(rngState);
  const roll = Math.floor(draw.value * PERCENT);
  return { roll, hit: roll < chancePercent, rngState: draw.state };
}
