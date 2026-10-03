import { describe, expect, it } from 'vitest';
import { damageIfHit, effectivePercent, hitsLeft, modAddsNothing, modFitsArea } from './damage';
import { getMod } from './state';
import { data, LANDSLIDE_HOUSE, startedGame, withHouse } from './testHelpers';

const mods = (...ids: string[]) => ids.map((id) => getMod(data, id));

describe('damage', () => {
  it('no mods gives base damage', () => {
    expect(effectivePercent(data, 'flood', [])).toBe(40);
    expect(effectivePercent(data, 'landslide', [])).toBe(50);
  });

  it('a single mod reduces damage', () => {
    expect(effectivePercent(data, 'flood', mods('seal-doors'))).toBe(20);
  });

  it('stacked mods add up (seal doors + sandbags = 15%)', () => {
    expect(effectivePercent(data, 'flood', mods('seal-doors', 'sandbags'))).toBe(15);
  });

  it('reductions past the floor give exactly 10%', () => {
    expect(effectivePercent(data, 'flood', mods('seal-doors', 'elevate'))).toBe(10);
    expect(effectivePercent(data, 'landslide', mods('retaining-wall'))).toBe(10);
    expect(effectivePercent(data, 'landslide', mods('retaining-wall', 'soil-nailing', 'plant-trees'))).toBe(10);
  });

  it('mods for the other disaster do nothing', () => {
    expect(effectivePercent(data, 'landslide', mods('seal-doors', 'elevate'))).toBe(50);
  });

  it('damageIfHit uses permanent mods and stocked consumables', () => {
    const s = withHouse(startedGame(), { permanentMods: ['seal-doors'], consumables: ['sandbags'] });
    expect(damageIfHit(data, s.house!, 'flood')).toBe(15);
  });

  it('hitsLeft counts hits until value reaches 0', () => {
    const s = startedGame();
    expect(hitsLeft(data, s.house!, 'flood')).toBe(3);
    const prepared = withHouse(s, { permanentMods: ['seal-doors', 'elevate'] });
    expect(hitsLeft(data, prepared.house!, 'flood')).toBe(10);
  });

  it('flags mods that add nothing past the floor, and mods that do not fit the area', () => {
    const s = withHouse(startedGame(), { permanentMods: ['seal-doors', 'elevate'] });
    expect(modAddsNothing(data, s.house!, getMod(data, 'drainage'))).toBe(true);
    expect(modFitsArea(data, s.house!, getMod(data, 'retaining-wall'))).toBe(false);
    const hill = startedGame(LANDSLIDE_HOUSE);
    expect(modFitsArea(data, hill.house!, getMod(data, 'retaining-wall'))).toBe(true);
    expect(modAddsNothing(data, hill.house!, getMod(data, 'retaining-wall'))).toBe(false);
  });
});
