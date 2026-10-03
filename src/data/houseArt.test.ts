import { describe, expect, it } from 'vitest';
import houseArt from './houseArt.json';
// Tests aren't bundled, so it's fine to read the full asset files here.
import disasterHouses from '../../assets/map/disaster_assets/houses.json';
import regionHouses from '../../assets/map/house_and_region_assets/houses.json';

/*
 * src/data/houseArt.json copies only the fields the game needs from the asset
 * packs' houses.json files, so the packs' real-place "inspiredBy" notes aren't
 * shipped in the game. These tests catch the copy drifting from the assets.
 */
describe('houseArt.json matches the asset packs', () => {
  it('has the same zone colours as the zone masks', () => {
    const zones = regionHouses.zones as Record<string, { maskColor: number[] }>;
    for (const [zone, colour] of Object.entries(houseArt.zoneColours)) expect(colour).toEqual(zones[zone]!.maskColor);
    expect(Object.keys(houseArt.zoneColours).sort()).toEqual(Object.keys(zones).sort());
  });

  it('has the same damage kind, "+" positions and slip paths for every house', () => {
    expect(houseArt.houses.map((h) => h.id).sort()).toEqual(disasterHouses.houses.map((h) => h.id).sort());
    for (const art of houseArt.houses) {
      const asset = disasterHouses.houses.find((h) => h.id === art.id)! as {
        damage: { kind: string };
        plus: unknown;
        slipPath?: unknown;
      };
      expect(art.kind).toBe(asset.damage.kind);
      expect(art.plus).toEqual(asset.plus);
      expect((art as { slipPath?: unknown }).slipPath).toEqual(asset.slipPath);
    }
  });
});

describe('no real place names in game data', () => {
  const REAL_PLACES = /Petone|Eastbourne|Wainuiomata|Naenae|Ohiro|Hutt|Wellington|New Zealand|North Island|South Island/i;
  const files = import.meta.glob('./*.json', { eager: true, import: 'default' });
  it.each(Object.keys(files))('%s', (file) => {
    expect(JSON.stringify(files[file])).not.toMatch(REAL_PLACES);
  });
});
