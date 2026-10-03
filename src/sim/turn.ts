import type { GameData } from '../data/schemas';
import { damageIfHit, valueLostFor } from './damage';
import { cheapestOtherHouse, repairCost } from './economy';
import { formatMoney } from './format';
import { nextFootprint } from './footprint';
import { seedToState } from './rng';
import {
  activeMods,
  areaOfHouse,
  emptyYearActions,
  fail,
  getHouse,
  getMod,
  OK,
  quizForYear,
  type Check,
  type DisasterResult,
  type GameState,
  type HouseState,
  type Result,
} from './state';
import { oddsFor, rollDisaster } from './weather';

/*
 * Every player intent has a `check*` (for disabling buttons with a reason)
 * and a matching action that returns a new state. Actions never mutate their input.
 */

function clone(state: GameState): GameState {
  return structuredClone(state);
}

function ok(state: GameState): Result {
  return { ok: true, state };
}

export function newGame(data: GameData, seed: number): GameState {
  return {
    seed,
    rng: seedToState(seed),
    phase: 'choosingHouse',
    year: 0,
    bank: data.balance.startingBudget,
    actionsLeft: 0,
    footprint: data.balance.startingFootprint,
    house: null,
    soldHouseId: null,
    outcome: null,
    thisYear: emptyYearActions(),
    history: [],
  };
}

/** Year start: income is added, actions reset, and the year's question comes first. Mutates the (already cloned) state. */
function startYear(s: GameState, data: GameData, year: number): void {
  s.year = year;
  s.bank += data.balance.yearlyIncome;
  s.actionsLeft = data.balance.actionsPerTurn;
  s.thisYear = emptyYearActions();
  s.phase = 'quiz';
}

// ---------------------------------------------------------------- buying

export function checkBuyHouse(state: GameState, data: GameData, houseId: string): Check {
  if (state.phase !== 'choosingHouse') return fail('You can only buy a house when choosing where to live.');
  if (houseId === state.soldHouseId) return fail("You've just sold this house. Pick somewhere else.");
  const house = getHouse(data, houseId);
  if (house.price > state.bank) {
    return fail(`Costs ${formatMoney(house.price)}. You have ${formatMoney(state.bank)}.`);
  }
  return OK;
}

export function buyHouse(state: GameState, data: GameData, houseId: string): Result {
  const check = checkBuyHouse(state, data, houseId);
  if (!check.ok) return check;
  const s = clone(state);
  const house = getHouse(data, houseId);
  s.bank -= house.price;
  s.house = {
    houseId,
    purchasePrice: house.price,
    fullValue: house.price,
    unrepairedHits: 0,
    value: house.price,
    permanentMods: [],
    consumables: [],
    destroyed: false,
  };
  if (s.year === 0) {
    startYear(s, data, 1);
  } else {
    // TODO(open-question): 3 — selling plus buying uses the whole turn (default).
    s.actionsLeft = 0;
    s.phase = 'action';
    if (s.thisYear.move) s.thisYear.move.toHouseId = houseId;
  }
  s.soldHouseId = null;
  return ok(s);
}

// ---------------------------------------------------------------- action phase

function checkActionPhase(state: GameState): Check {
  if (state.phase !== 'action') return fail('You can only do this during the action phase.');
  if (!state.house) return fail("You don't own a house.");
  if (state.house.destroyed) return fail('The house has been destroyed.');
  return OK;
}

function checkActions(state: GameState, needed: number): Check {
  if (state.actionsLeft < needed) return fail('No actions left this year.');
  return OK;
}

export function checkApplyMod(state: GameState, data: GameData, modId: string): Check {
  const phase = checkActionPhase(state);
  if (!phase.ok) return phase;
  const house = state.house as HouseState;
  const mod = getMod(data, modId);
  if (mod.type === 'permanent' && house.permanentMods.includes(modId)) {
    return fail('Already built on this house.');
  }
  if (mod.type === 'consumable' && house.consumables.includes(modId)) {
    return fail('Already stocked. Restock once it has been used up.');
  }
  const actions = checkActions(state, data.balance.actionsPerMod);
  if (!actions.ok) return actions;
  if (mod.cost > state.bank) return fail(`Costs ${formatMoney(mod.cost)}. You have ${formatMoney(state.bank)}.`);
  return OK;
}

export function applyMod(state: GameState, data: GameData, modId: string): Result {
  const check = checkApplyMod(state, data, modId);
  if (!check.ok) return check;
  const s = clone(state);
  const house = s.house as HouseState;
  const mod = getMod(data, modId);
  s.bank -= mod.cost;
  s.actionsLeft -= data.balance.actionsPerMod;
  if (mod.type === 'permanent') {
    house.permanentMods.push(modId);
    // A permanent upgrade adds its cost to the house's value (and its full value).
    // Consumables add nothing: they get used up.
    house.fullValue += mod.cost;
    house.value += mod.cost;
  } else {
    house.consumables.push(modId);
  }
  s.thisYear.modsBuilt.push(modId);
  return ok(s);
}

export function checkRepair(state: GameState, data: GameData): Check {
  const phase = checkActionPhase(state);
  if (!phase.ok) return phase;
  const house = state.house as HouseState;
  if (house.value >= house.fullValue) return fail("The house isn't damaged.");
  const actions = checkActions(state, data.balance.actionsPerRepair);
  if (!actions.ok) return actions;
  const cost = repairCost(data, house);
  if (cost > state.bank) return fail(`Repairs cost ${formatMoney(cost)}. You have ${formatMoney(state.bank)}.`);
  return OK;
}

export function repair(state: GameState, data: GameData): Result {
  const check = checkRepair(state, data);
  if (!check.ok) return check;
  const s = clone(state);
  const house = s.house as HouseState;
  const cost = repairCost(data, house);
  s.thisYear.repairs.push({ cost, valueRestored: house.fullValue - house.value });
  s.bank -= cost;
  s.actionsLeft -= data.balance.actionsPerRepair;
  house.value = house.fullValue;
  house.unrepairedHits = 0;
  return ok(s);
}

export function checkSell(state: GameState, data: GameData): Check {
  const phase = checkActionPhase(state);
  if (!phase.ok) return phase;
  if (state.thisYear.move) return fail("You've already moved this year.");
  const house = state.house as HouseState;
  const cheapest = cheapestOtherHouse(data, house.houseId);
  if (!cheapest || state.bank + house.value < cheapest.price) {
    return fail(
      `After selling you'd have ${formatMoney(state.bank + house.value)}, ` +
        `not enough for another house${cheapest ? ` (cheapest ${formatMoney(cheapest.price)})` : ''}.`,
    );
  }
  return OK;
}

/** Sells the current house for its current value and returns to choosing a house. */
export function sell(state: GameState, data: GameData): Result {
  const check = checkSell(state, data);
  if (!check.ok) return check;
  const s = clone(state);
  const house = s.house as HouseState;
  s.bank += house.value;
  s.thisYear.move = { fromHouseId: house.houseId, saleValue: house.value, toHouseId: null };
  s.soldHouseId = house.houseId;
  s.house = null;
  s.actionsLeft = 0;
  s.phase = 'choosingHouse';
  return ok(s);
}

// ---------------------------------------------------------------- the year's question

export function checkAnswerQuiz(state: GameState, data: GameData, answerId: string): Check {
  if (state.phase !== 'quiz') return fail('There is no question to answer right now.');
  const question = quizForYear(data, state.year);
  if (!question.answers.some((a) => a.id === answerId)) return fail(`Unknown answer "${answerId}".`);
  return OK;
}

/**
 * Answers the year's question at the start of the year. The answer is only
 * recorded here; it changes the footprint when the year ends. Unlocks the action phase.
 */
export function answerQuiz(state: GameState, data: GameData, answerId: string): Result {
  const check = checkAnswerQuiz(state, data, answerId);
  if (!check.ok) return check;
  const s = clone(state);
  const question = quizForYear(data, s.year);
  const answer = question.answers.find((a) => a.id === answerId)!;
  s.thisYear.quiz = { questionId: question.id, answerId, footprintDelta: answer.footprintDelta };
  s.phase = 'action';
  return ok(s);
}

// ---------------------------------------------------------------- resolution

export function checkEndTurn(state: GameState): Check {
  const phase = checkActionPhase(state);
  if (!phase.ok) return phase;
  if (!state.thisYear.quiz) return fail("Answer this year's question first.");
  return OK;
}

/**
 * Ends the year: updates the footprint with this year's answer, rolls the
 * weather, applies damage and the end check. Produces a YearRecord and moves to the review.
 */
export function endTurn(state: GameState, data: GameData): Result {
  const check = checkEndTurn(state);
  if (!check.ok) return check;
  const s = clone(state);
  const house = s.house as HouseState;
  const choice = s.thisYear.quiz!;

  const footprintBefore = s.footprint;
  const change = nextFootprint(data, s.footprint, choice.footprintDelta, house);
  s.footprint = change.after;

  const area = areaOfHouse(data, house.houseId);
  const results: DisasterResult[] = [];
  // If an area ever lists several disasters, each is rolled and applied in turn.
  for (const disaster of area.disasters) {
    const chancePercent = oddsFor(data.weather, s.footprint, disaster);
    const roll = rollDisaster(s.rng, chancePercent);
    s.rng = roll.rngState;
    const result: DisasterResult = {
      disaster,
      chancePercent,
      roll: roll.roll,
      hit: roll.hit,
      basePercent: data.weather.baseDamagePercent[disaster],
      effectivePercent: 0,
      valueLost: 0,
      valueAfter: house.value,
      helpedBy: [],
      consumablesUsed: [],
    };
    if (roll.hit && !house.destroyed) {
      const percent = damageIfHit(data, house, disaster);
      const lost = valueLostFor(house.fullValue, percent);
      const protecting = activeMods(data, house).filter((m) => (m.reductions[disaster] ?? 0) > 0);
      house.value = Math.max(0, house.value - lost);
      house.unrepairedHits += 1;
      house.destroyed = house.value <= 0;
      const used = protecting.filter((m) => m.type === 'consumable').map((m) => m.id);
      house.consumables = house.consumables.filter((id) => !used.includes(id));
      Object.assign(result, {
        effectivePercent: percent,
        valueLost: lost,
        valueAfter: house.value,
        helpedBy: protecting.map((m) => m.id),
        consumablesUsed: used,
      });
    }
    results.push(result);
  }

  if (house.destroyed) s.outcome = 'lost';
  else if (s.year >= data.balance.gameLengthYears) s.outcome = 'won';

  s.history.push({
    year: s.year,
    houseId: house.houseId,
    areaId: area.id,
    actions: structuredClone(s.thisYear),
    quiz: choice,
    footprintBefore,
    baseIncrement: change.baseIncrement,
    modFootprintDelta: change.modDelta,
    footprintAfter: s.footprint,
    results,
    destroyed: house.destroyed,
    bankAtEnd: s.bank,
    valueAtEnd: house.value,
  });
  s.phase = 'review';
  return ok(s);
}

/** Leaves the year review: either the game ends or the next year starts. */
export function continueAfterReview(state: GameState, data: GameData): Result {
  if (state.phase !== 'review') return fail('There is no year review to continue from.');
  const s = clone(state);
  if (s.outcome) s.phase = 'over';
  else startYear(s, data, s.year + 1);
  return ok(s);
}

/** Convenience for scenes and tests: unwraps a Result or throws. */
export function expectOk(result: Result): GameState {
  if (!result.ok) throw new Error(result.reason);
  return result.state;
}
