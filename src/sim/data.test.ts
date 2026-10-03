import { describe, expect, it } from 'vitest';
import { rawGameData } from '../data';
import { DataValidationError, parseGameData } from '../data/schemas';

describe('data validation', () => {
  it('accepts the bundled data', () => {
    expect(() => parseGameData(rawGameData)).not.toThrow();
  });

  it('every placeholder-valued entry is marked as a placeholder', () => {
    const data = parseGameData(rawGameData);
    for (const entry of [...data.houses, ...data.mods, ...data.quiz]) expect(entry.source).toBe('placeholder');
  });

  it('fails loudly on a missing source', () => {
    const bad = structuredClone(rawGameData) as { mods: { mods: { source?: string }[] } } & typeof rawGameData;
    delete bad.mods.mods[0]!.source;
    expect(() => parseGameData(bad)).toThrow(DataValidationError);
  });

  it('fails on a house in an unknown area', () => {
    const bad = structuredClone(rawGameData) as { houses: { houses: { areaId: string }[] } } & typeof rawGameData;
    bad.houses.houses[0]!.areaId = 'atlantis';
    expect(() => parseGameData(bad)).toThrow(/unknown area/);
  });

  it('fails on gaps between weather bands', () => {
    const bad = structuredClone(rawGameData) as { weather: { bands: { min: number }[] } } & typeof rawGameData;
    bad.weather.bands[2]!.min = 9;
    expect(() => parseGameData(bad)).toThrow(/must start where/);
  });
});
