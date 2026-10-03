import { describe, expect, it } from 'vitest';
import type { GameData } from '../data/schemas';
import type { GameState } from './state';
import { answer, data, dataWith, FLOOD_HOUSE, FLOOD_PRICE, LANDSLIDE_HOUSE, nextYear, startedGame, withHouse } from './testHelpers';
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

/** Ends the year: footprint update, weather roll and resolution. */
function playYear(s: GameState, d: GameData = data): GameState {
  return expectOk(endTurn(s, d));
}

const SEAL_DOORS_COST = data.mods.find((m) => m.id === 'seal-doors')!.cost;

/** Data where the area's disaster always (or never) hits. */
const alwaysHits = dataWith((d) => {
  d.weather.bands.forEach((b) => (b.odds = { flood: 100, landslide: 100 }));
  // Enough to buy any house, including the luxury ones.
  d.balance.startingBudget = Math.max(...d.houses.map((h) => h.price));
});
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
    const next = nextYear(review, neverHits);
    expect(next.year).toBe(2);
    expect(next.bank).toBe(review.bank + data.balance.yearlyIncome);
    expect(next.actionsLeft).toBe(data.balance.actionsPerTurn);
  });

  it('cannot buy a house the bank cannot cover', () => {
    const poor = dataWith((d) => (d.balance.startingBudget = 1));
    expect(buyHouse(newGame(poor, 1), poor, FLOOD_HOUSE).ok).toBe(false);
  });
});

describe("the year's question", () => {
  it('each year opens with the question, before any actions', () => {
    const bought = expectOk(buyHouse(newGame(data, 1), data, FLOOD_HOUSE));
    expect(bought.phase).toBe('quiz');
    expect(checkApplyMod(bought, data, 'sandbags').ok).toBe(false);
    expect(checkRepair(bought, data).ok).toBe(false);
    expect(checkSell(bought, data).ok).toBe(false);
    expect(endTurn(bought, data).ok).toBe(false);
    const answered = answer(bought);
    expect(answered.phase).toBe('action');
    expect(checkApplyMod(answered, data, 'sandbags').ok).toBe(true);
  });

  it('the answer changes the footprint only when the year ends', () => {
    const answered = startedGame(FLOOD_HOUSE, neverHits, 1, 0); // cycle: -1.0
    expect(answered.footprint).toBe(data.balance.startingFootprint);
    expect(answered.thisYear.quiz?.answerId).toBe('cycle');
    const ended = playYear(answered, neverHits);
    expect(ended.history[0]!.quiz.answerId).toBe('cycle');
    expect(ended.footprint).toBeCloseTo(data.balance.startingFootprint + data.balance.baseYearlyIncrement - 1);
  });

  it('can only be answered once a year', () => {
    expect(answerQuiz(startedGame(), data, 'cycle').ok).toBe(false);
  });

  it('the next year opens with its question again', () => {
    const next = expectOk(continueAfterReview(playYear(startedGame(FLOOD_HOUSE, neverHits), neverHits), neverHits));
    expect(next.year).toBe(2);
    expect(next.phase).toBe('quiz');
    expect(next.thisYear.quiz).toBeNull();
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

describe('upgrades and house value', () => {
  it('a permanent upgrade adds its cost to the house value and full value', () => {
    const s = startedGame();
    const after = expectOk(applyMod(s, data, 'seal-doors'));
    expect(after.house!.value).toBe(s.house!.value + SEAL_DOORS_COST);
    expect(after.house!.fullValue).toBe(s.house!.fullValue + SEAL_DOORS_COST);
    expect(after.house!.purchasePrice).toBe(FLOOD_PRICE);
  });

  it('a consumable adds nothing to the house value', () => {
    const s = startedGame();
    const after = expectOk(applyMod(s, data, 'sandbags'));
    expect(after.house!.value).toBe(s.house!.value);
    expect(after.house!.fullValue).toBe(s.house!.fullValue);
  });

  it('upgrading a damaged house adds value but leaves the damage (and repair cost) as it was', () => {
    const s = withHouse(startedGame(), { value: FLOOD_PRICE - 100000 });
    const after = expectOk(applyMod(s, data, 'seal-doors'));
    expect(after.house!.fullValue - after.house!.value).toBe(100000);
  });

  it('repairs restore the full value, including upgrades', () => {
    let s = expectOk(applyMod(startedGame(), data, 'seal-doors'));
    s = withHouse(s, { value: s.house!.fullValue - 50000 });
    const fixed = expectOk(repair(s, data));
    expect(fixed.house!.value).toBe(FLOOD_PRICE + SEAL_DOORS_COST);
    expect(fixed.bank).toBe(s.bank - 50000);
  });

  it('selling returns the upgraded value', () => {
    const s = expectOk(applyMod(startedGame(), data, 'seal-doors'));
    expect(expectOk(sell(s, data)).bank).toBe(s.bank + FLOOD_PRICE + SEAL_DOORS_COST);
  });
});

describe('repairs', () => {
  const LOST = 250000;
  const damaged = () => withHouse(startedGame(), { value: FLOOD_PRICE - LOST });

  it('cost 1 action and restore exactly the original value', () => {
    const s = damaged();
    const after = expectOk(repair(s, data));
    expect(after.actionsLeft).toBe(s.actionsLeft - 1);
    expect(after.house!.value).toBe(after.house!.fullValue);
  });

  it('charge repairCostRate × value lost', () => {
    const s = damaged();
    expect(expectOk(repair(s, data)).bank).toBe(s.bank - LOST);
    const half = dataWith((d) => (d.balance.repairCostRate = 0.5));
    expect(expectOk(repair(s, half)).bank).toBe(s.bank - LOST / 2);
  });

  it('are unavailable when the house is undamaged', () => {
    expect(checkRepair(startedGame(), data).ok).toBe(false);
  });

  it('are unavailable when the bank cannot cover the cost', () => {
    expect(checkRepair({ ...damaged(), bank: LOST - 1 }, data).ok).toBe(false);
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

  it("a hit takes effective% of the house's full value (purchase price plus upgrades)", () => {
    const s = playYear(expectOk(applyMod(startedGame(FLOOD_HOUSE, alwaysHits), alwaysHits, 'seal-doors')), alwaysHits);
    const full = FLOOD_PRICE + SEAL_DOORS_COST;
    expect(s.history[0]!.results[0]!.effectivePercent).toBe(20);
    expect(s.house!.fullValue).toBe(full);
    expect(s.house!.value).toBe(full * 0.8);
  });

  it('value never exceeds the full value', () => {
    let s = startedGame(FLOOD_HOUSE, neverHits);
    for (let i = 0; i < 3; i++) s = nextYear(playYear(s, neverHits), neverHits);
    expect(s.house!.value).toBe(s.house!.fullValue);
  });

  it('an unprepared flood house (40%) is destroyed by the third unrepaired hit', () => {
    let s = startedGame(FLOOD_HOUSE, alwaysHits);
    s = nextYear(playYear(s, alwaysHits), alwaysHits);
    s = nextYear(playYear(s, alwaysHits), alwaysHits);
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
    for (let i = 0; i < 9; i++) s = nextYear(playYear(s, long), long);
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
    s = nextYear(playYear(s, alwaysHits), alwaysHits);
    expect(checkApplyMod(s, alwaysHits, 'sandbags').ok).toBe(true);
  });
});

describe('footprint', () => {
  it('adds the base increment and the quiz delta', () => {
    const s = playYear(startedGame(FLOOD_HOUSE, neverHits), neverHits); // answered cycle: -1.0
    expect(s.footprint).toBeCloseTo(data.balance.startingFootprint + data.balance.baseYearlyIncrement - 1);
  });

  it('adds active mod deltas (planting trees)', () => {
    const s = expectOk(applyMod(startedGame(FLOOD_HOUSE, neverHits), neverHits, 'plant-trees'));
    const after = playYear(s, neverHits);
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
    expect(playYear(startedGame(FLOOD_HOUSE, low), low).footprint).toBe(0);
  });

  it('odds use the updated value', () => {
    // Start just below the 8 t band; the year's increase must push the roll into the 30% band.
    const edge = dataWith((d) => {
      d.balance.startingFootprint = 7.5;
      d.balance.baseYearlyIncrement = 0.5;
    });
    const s = playYear(startedGame(FLOOD_HOUSE, edge, 1, 3), edge); // answered carpool: 0
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
    s = nextYear(s, alwaysHits);
    expect(s.phase).toBe('over');
    expect(applyMod(s, alwaysHits, 'sandbags').ok).toBe(false);
  });

  it('surviving year N is a win', () => {
    let s = startedGame(FLOOD_HOUSE, neverHits);
    for (let y = 1; y < data.balance.gameLengthYears; y++) {
      s = nextYear(playYear(s, neverHits), neverHits);
      expect(s.outcome).toBeNull();
    }
    s = playYear(s, neverHits);
    expect(s.outcome).toBe('won');
    expect(nextYear(s, neverHits).phase).toBe('over');
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
    const moved = expectOk(buyHouse(sold, data, 'riverside-townhouse'));
    expect(moved.actionsLeft).toBe(0);
    expect(moved.house!.permanentMods).toEqual([]);
    expect(moved.year).toBe(1);
    expect(checkSell(moved, data)).toEqual({ ok: false, reason: "You've already moved this year." });
  });
});

describe('determinism', () => {
  it('the same seed and same choices give the same game', () => {
    const play = (seed: number) => {
      let s = answer(expectOk(buyHouse(newGame(data, seed), data, FLOOD_HOUSE)), data, 1);
      for (let y = 0; y < data.balance.gameLengthYears && !s.outcome; y++) {
        s = playYear(s, data);
        s = nextYear(s, data, y % 2);
      }
      return s;
    };
    expect(play(99)).toEqual(play(99));
    const rolls = (s: GameState) => s.history.map((h) => h.results.map((r) => r.roll));
    expect(rolls(play(99))).not.toEqual(rolls(play(100)));
  });
});
