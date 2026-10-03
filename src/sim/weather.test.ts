import { describe, expect, it } from 'vitest';
import { data } from './testHelpers';
import { bandFor, oddsFor, rollDisaster } from './weather';

describe('band lookup', () => {
  const w = data.weather;
  it.each([
    [8, 20],
    [8.49, 20],
    [8.5, 35],
    [9, 50],
    [9.5, 75],
    [10, 100],
    [10.49, 100],
    [10.5, 100],
    [12, 100],
  ])('footprint %s t → flood and landslide %s%%', (footprint, chance) => {
    expect(oddsFor(w, footprint, 'flood')).toBe(chance);
    expect(oddsFor(w, footprint, 'landslide')).toBe(chance);
  });

  it('bands include their lower bound and exclude their upper bound', () => {
    expect(bandFor(w, 8.5).min).toBe(8.5);
    expect(bandFor(w, 10).min).toBe(10);
  });
});

describe('rollDisaster', () => {
  it('hits exactly when roll < chance', () => {
    const r = rollDisaster(123, 50);
    expect(r.hit).toBe(r.roll < 50);
    expect(rollDisaster(123, 0).hit).toBe(false);
    expect(rollDisaster(123, 100).hit).toBe(true);
  });

  it('is deterministic and advances the RNG', () => {
    expect(rollDisaster(42, 30)).toEqual(rollDisaster(42, 30));
    expect(rollDisaster(42, 30).rngState).not.toBe(42);
  });
});
