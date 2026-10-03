import { describe, expect, it } from 'vitest';
import { upgradeReport } from './advice';
import { data, dataWith, startedGame } from './testHelpers';
import { applyMod, endTurn, expectOk } from './turn';

const alwaysHits = dataWith((d) => d.weather.bands.forEach((b) => (b.odds = { flood: 100, landslide: 100 })));
const neverHits = dataWith((d) => d.weather.bands.forEach((b) => (b.odds = { flood: 0, landslide: 0 })));
const ids = (mods: { id: string }[]) => mods.map((m) => m.id);

describe('upgradeReport', () => {
  it('sorts upgrades by whether they reduced a hit, did nothing, or were missing', () => {
    let s = startedGame();
    s = expectOk(applyMod(s, alwaysHits, 'seal-doors'));
    s = expectOk(applyMod(s, alwaysHits, 'retaining-wall'));
    const report = upgradeReport(alwaysHits, expectOk(endTurn(s, alwaysHits)));
    expect(ids(report.helped)).toEqual(['seal-doors']);
    expect(ids(report.didNotHelp)).toEqual(['retaining-wall']);
    const floodMods = data.mods.filter((m) => (m.reductions.flood ?? 0) > 0 && m.id !== 'seal-doors');
    expect(ids(report.wouldHaveHelped)).toEqual(ids(floodMods));
  });

  it('suggests nothing more once the house was at the damage floor', () => {
    let s = startedGame();
    s = expectOk(applyMod(s, alwaysHits, 'seal-doors'));
    s = expectOk(applyMod(s, alwaysHits, 'elevate'));
    const report = upgradeReport(alwaysHits, expectOk(endTurn(s, alwaysHits)));
    expect(ids(report.helped)).toEqual(['seal-doors', 'elevate']);
    expect(report.wouldHaveHelped).toEqual([]);
  });

  it('with no hazard, nothing helped or would have helped', () => {
    const s = expectOk(applyMod(startedGame(), neverHits, 'seal-doors'));
    const report = upgradeReport(neverHits, expectOk(endTurn(s, neverHits)));
    expect(report.helped).toEqual([]);
    expect(ids(report.didNotHelp)).toEqual(['seal-doors']);
    expect(report.wouldHaveHelped).toEqual([]);
  });
});
