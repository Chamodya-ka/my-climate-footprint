import { describe, expect, it } from 'vitest';
import type { GameData } from '../data/schemas';
import type { GameState } from './state';
import { data, dataWith, FLOOD_HOUSE, LANDSLIDE_HOUSE, startedGame, withHouse } from './testHelpers';
import {
  answerQuiz,
  applyMod,
  buyHouse,
  checkApplyMod,
  checkRepair,
  checkSell,
  continueAfterReview,
  endTurn,
  expectOk,
  newGame,
  repair,
  sell,
} from './turn';
import { quizForYear } from './state';

/** Ends the turn and answers the quiz with the given answer (or the first). */
function playYear(s: GameState, d: GameData = data, answerIndex = 0): GameState {
  const q = expectOk(endTurn(s));
  const answer = quizForYear(d, q.year).answers[answerIndex]!;
  return expectOk(answerQuiz(q, d, answer.id));
}

/** Data where the area's disaster always (or never) hits. */
const alwaysHits = dataWith((d) => d.weather.bands.forEach((b) => (b.odds = { flood: 100, landslide: 100 })));
const neverHits = dataWith((d) => d.weather.bands.forEach((b) => (b.odds = { flood: 0, landslide: 0 })));

describe('buying and year start', () => {
  it('buying the first house starts year 1 and adds income', () => {
    const s = startedGame();
    const price = data.houses.find((h) => h.id === FLOOD_HOUSE)!.price;
    expect(s.year).toBe(1);
    expect(s.phase).toBe('action');
    expect(s.bank).toBe(data.balance.startingBudget - price + data.balance.yearlyIncome);
    expect(s.actionsLeft).toBe(data.balance.actionsPerTurn);
  });

  it('income is added at the start of every year and actions reset', () => {
    const s = expectOk(applyMod(startedGame(FLOOD_HOUSE, neverHits), neverHits, 'sandbags'));
    const review = playYear(s, neverHits);
    const next = expectOk(continueAfterReview(review, neverHits));
    expect(next.year).toBe(2);
    expect(next.bank).toBe(review.bank + data.balance.yearlyIncome);
    expect(next.actionsLeft).toBe(data.balance.actionsPerTurn);
  });

  it('cannot buy a house the bank cannot cover', () => {
    const poor = dataWith((d) => (d.balance.startingBudget = 1));
    expect(buyHouse(newGame(poor, 1), poor, FLOOD_HOUSE).ok).toBe(false);
  });
});

describe('actions', () => {
  it('a mod costs 1 action and its dollar cost', () => {
    const s = startedGame();
    const after = expectOk(applyMod(s, data, 'seal-doors'));
    expect(after.actionsLeft).toBe(s.actionsLeft - 1);
    expect(after.bank).toBe(s.bank - 8000);
    expect(after.house!.permanentMods).toEqual(['seal-doors']);
  });

  it('cannot exceed actionsPerTurn', () => {
    let s = startedGame();
    for (const id of ['seal-doors', 'drainage', 'sandbags']) s = expectOk(applyMod(s, data, id));
    expect(s.actionsLeft).toBe(0);
    const check = checkApplyMod(s, data, 'store-food');
    expect(check.ok).toBe(false);
  });

  it('a permanent mod cannot be applied twice', () => {
    const s = expectOk(applyMod(startedGame(), data, 'seal-doors'));
    expect(checkApplyMod(s, data, 'seal-doors')).toEqual({ ok: false, reason: 'Already built on this house.' });
  });

  it('a stocked consumable cannot be stocked again', () => {
    const s = expectOk(applyMod(startedGame(), data, 'sandbags'));
    expect(checkApplyMod(s, data, 'sandbags').ok).toBe(false);
  });

  it('mods that do not fit the area are still allowed', () => {
    expect(checkApplyMod(startedGame(FLOOD_HOUSE), data, 'retaining-wall').ok).toBe(true);
  });
});

describe('money', () => {
  it('no mod can take the bank below 0', () => {
    const s = { ...startedGame(), bank: 100 };
    expect(checkApplyMod(s, data, 'elevate').ok).toBe(false);
    expect(applyMod(s, data, 'elevate').ok).toBe(false);
  });

  it('no repair can take the bank below 0', () => {
    const s = { ...withHouse(startedGame(), { value: 1 }), bank: 100 };
    expect(checkRepair(s, data).ok).toBe(false);
  });
});

describe('repairs', () => {
  const damaged = () => withHouse(startedGame(), { value: 400000 });

  it('cost 1 action and restore exactly the original value', () => {
    const s = damaged();
    const after = expectOk(repair(s, data));
    expect(after.actionsLeft).toBe(s.actionsLeft - 1);
    expect(after.house!.value).toBe(after.house!.originalValue);
  });

  it('charge repairCostRate × value lost', () => {
    const s = damaged();
    expect(expectOk(repair(s, data)).bank).toBe(s.bank - 300000);
    const half = dataWith((d) => (d.balance.repairCostRate = 0.5));
    expect(expectOk(repair(s, half)).bank).toBe(s.bank - 150000);
  });

  it('are unavailable when the house is undamaged', () => {
    expect(checkRepair(startedGame(), data).ok).toBe(false);
  });

  it('are unavailable when the bank cannot cover the cost', () => {
    expect(checkRepair({ ...damaged(), bank: 299999 }, data).ok).toBe(false);
  });

  it('are unavailable with no actions left', () => {
    expect(checkRepair({ ...damaged(), actionsLeft: 0 }, data).ok).toBe(false);
  });
});

describe('weather resolution', () => {
  it('Hills houses never roll floods; Coastal and Urban houses never roll landslides', () => {
    for (const house of data.houses) {
      const area = data.areas.find((a) => a.id === house.areaId)!;
      const s = playYear(startedGame(house.id, alwaysHits), alwaysHits);
      const rolled = s.history[0]!.results.map((r) => r.disaster);
      if (area.regionId === 'hills') expect(rolled).toEqual(['landslide']);
      else expect(rolled).toEqual(['flood']);
    }
  });

  it('a hit takes effective% of the original value', () => {
    const s = playYear(expectOk(applyMod(startedGame(FLOOD_HOUSE, alwaysHits), alwaysHits, 'seal-doors')), alwaysHits);
    expect(s.history[0]!.results[0]!.effectivePercent).toBe(20);
    expect(s.house!.value).toBe(700000 * 0.8);
  });

  it('value never exceeds the original value', () => {
    let s = startedGame(FLOOD_HOUSE, neverHits);
    for (let i = 0; i < 3; i++) s = expectOk(continueAfterReview(playYear(s, neverHits), neverHits));
    expect(s.house!.value).toBe(s.house!.originalValue);
  });

  it('an unprepared flood house (40%) is destroyed by the third unrepaired hit', () => {
    let s = startedGame(FLOOD_HOUSE, alwaysHits);
    s = expectOk(continueAfterReview(playYear(s, alwaysHits), alwaysHits));
    s = expectOk(continueAfterReview(playYear(s, alwaysHits), alwaysHits));
    expect(s.house!.destroyed).toBe(false);
    s = playYear(s, alwaysHits);
    expect(s.house!.destroyed).toBe(true);
    expect(s.house!.value).toBe(0);
  });

  it('a fully prepared house (10%) survives nine hits and is destroyed by the tenth', () => {
    const long = dataWith((d) => {
      d.weather.bands.forEach((b) => (b.odds = { flood: 100, landslide: 100 }));
      d.balance.gameLengthYears = 20;
    });
    let s = withHouse(startedGame(FLOOD_HOUSE, long), { permanentMods: ['seal-doors', 'elevate'] });
    for (let i = 0; i < 9; i++) s = expectOk(continueAfterReview(playYear(s, long), long));
    expect(s.house!.destroyed).toBe(false);
    s = playYear(s, long);
    expect(s.house!.destroyed).toBe(true);
  });
});

describe('consumables', () => {
  it('are used up when their disaster hits', () => {
    let s = startedGame(FLOOD_HOUSE, alwaysHits);
    s = expectOk(applyMod(s, alwaysHits, 'sandbags'));
    s = expectOk(applyMod(s, alwaysHits, 'store-food'));
    s = playYear(s, alwaysHits);
    expect(s.house!.consumables).toEqual([]);
    expect(s.history[0]!.results[0]!.consumablesUsed.sort()).toEqual(['sandbags', 'store-food']);
  });

  it('are kept when no disaster hits', () => {
    let s = expectOk(applyMod(startedGame(FLOOD_HOUSE, neverHits), neverHits, 'sandbags'));
    s = playYear(s, neverHits);
    expect(s.house!.consumables).toEqual(['sandbags']);
  });

  it('are kept when a different disaster hits', () => {
    // Sandbags only protect against floods; a landslide must not use them up.
    let s = expectOk(applyMod(startedGame(LANDSLIDE_HOUSE, alwaysHits), alwaysHits, 'sandbags'));
    s = expectOk(applyMod(s, alwaysHits, 'store-food'));
    s = playYear(s, alwaysHits);
    expect(s.house!.consumables).toEqual(['sandbags']);
  });

  it('can be restocked after being used up', () => {
    let s = expectOk(applyMod(startedGame(FLOOD_HOUSE, alwaysHits), alwaysHits, 'sandbags'));
    s = expectOk(continueAfterReview(playYear(s, alwaysHits), alwaysHits));
    expect(checkApplyMod(s, alwaysHits, 'sandbags').ok).toBe(true);
  });
});

describe('footprint', () => {
  it('adds the base increment and the quiz delta', () => {
    const s = playYear(startedGame(FLOOD_HOUSE, neverHits), neverHits, 0); // cycle: -1.0
    expect(s.footprint).toBeCloseTo(data.balance.startingFootprint + data.balance.baseYearlyIncrement - 1);
  });

  it('adds active mod deltas (planting trees)', () => {
    const s = expectOk(applyMod(startedGame(FLOOD_HOUSE, neverHits), neverHits, 'plant-trees'));
    const after = playYear(s, neverHits, 0);
    const trees = data.mods.find((m) => m.id === 'plant-trees')!.footprintDelta;
    expect(after.footprint).toBeCloseTo(
      data.balance.startingFootprint + data.balance.baseYearlyIncrement - 1 + trees,
    );
  });

  it('never goes below 0', () => {
    const low = dataWith((d) => {
      d.balance.startingFootprint = 0;
      d.balance.baseYearlyIncrement = 0;
    });
    expect(playYear(startedGame(FLOOD_HOUSE, low), low, 0).footprint).toBe(0);
  });

  it('odds use the updated value', () => {
    // Start just below the 8 t band; the year's increase must push the roll into the 30% band.
    const edge = dataWith((d) => {
      d.balance.startingFootprint = 7.5;
      d.balance.baseYearlyIncrement = 0.5;
    });
    const s = playYear(startedGame(FLOOD_HOUSE, edge), edge, 3); // carpool: 0
    expect(s.footprint).toBe(8);
    expect(s.history[0]!.results[0]!.chancePercent).toBe(30);
  });
});

describe('outcome', () => {
  it('destruction ends the game as a loss immediately', () => {
    let s = withHouse(startedGame(FLOOD_HOUSE, alwaysHits), { value: 1 });
    s = playYear(s, alwaysHits);
    expect(s.outcome).toBe('lost');
    expect(s.year).toBeLessThan(data.balance.gameLengthYears);
    s = expectOk(continueAfterReview(s, alwaysHits));
    expect(s.phase).toBe('over');
    expect(applyMod(s, alwaysHits, 'sandbags').ok).toBe(false);
  });

  it('surviving year N is a win', () => {
    let s = startedGame(FLOOD_HOUSE, neverHits);
    for (let y = 1; y < data.balance.gameLengthYears; y++) {
      s = expectOk(continueAfterReview(playYear(s, neverHits), neverHits));
      expect(s.outcome).toBeNull();
    }
    s = playYear(s, neverHits);
    expect(s.outcome).toBe('won');
    expect(expectOk(continueAfterReview(s, neverHits)).phase).toBe('over');
  });

  it('selling is blocked when no other house would be affordable', () => {
    const s = { ...withHouse(startedGame(), { value: 100000 }), bank: 0 };
    expect(checkSell(s, data).ok).toBe(false);
  });

  it('selling returns the damaged value and moving uses the whole turn', () => {
    const s = withHouse(startedGame(), { value: 420000 });
    const sold = expectOk(sell(s, data));
    expect(sold.bank).toBe(s.bank + 420000);
    expect(sold.phase).toBe('choosingHouse');
    expect(buyHouse(sold, data, FLOOD_HOUSE).ok).toBe(false); // can't rebuy the house just sold
    const moved = expectOk(buyHouse(sold, data, 'townhouse'));
    expect(moved.actionsLeft).toBe(0);
    expect(moved.house!.permanentMods).toEqual([]);
    expect(moved.year).toBe(1);
    expect(checkSell(moved, data)).toEqual({ ok: false, reason: "You've already moved this year." });
  });
});

describe('determinism', () => {
  it('the same seed and same choices give the same game', () => {
    const play = (seed: number) => {
      let s = expectOk(buyHouse(newGame(data, seed), data, FLOOD_HOUSE));
      for (let y = 0; y < data.balance.gameLengthYears && !s.outcome; y++) {
        s = playYear(s, data, y % 2);
        s = expectOk(continueAfterReview(s, data));
      }
      return s;
    };
    expect(play(99)).toEqual(play(99));
    const rolls = (s: GameState) => s.history.map((h) => h.results.map((r) => r.roll));
    expect(rolls(play(99))).not.toEqual(rolls(play(100)));
  });
});
