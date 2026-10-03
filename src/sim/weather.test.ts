import { describe, expect, it } from 'vitest';
import { data } from './testHelpers';
import { bandFor, oddsFor, rollDisaster } from './weather';

describe('band lookup', () => {
  const w = data.weather;
  it.each([
    [0, 10, 10],
    [3.99, 10, 10],
    [4, 20, 15],
    [8, 30, 20],
    [12, 50, 30],
    [16, 75, 40],
    [19.99, 75, 40],
    [20, 75, 40],
    [35, 75, 40],
  ])('footprint %s t → flood %s%%, landslide %s%%', (footprint, flood, landslide) => {
    expect(oddsFor(w, footprint, 'flood')).toBe(flood);
    expect(oddsFor(w, footprint, 'landslide')).toBe(landslide);
  });

  it('bands include their lower bound and exclude their upper bound', () => {
    expect(bandFor(w, 4).min).toBe(4);
    expect(bandFor(w, 8).min).toBe(8);
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
