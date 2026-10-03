import { loadGameData } from '../data';
import type { GameData } from '../data/schemas';
import { quizForYear, type GameState } from './state';
import { answerQuiz, buyHouse, continueAfterReview, expectOk, newGame } from './turn';

export const data: GameData = loadGameData();

/** A deep copy of the real data with overrides, for isolating one rule. */
export function dataWith(patch: (d: GameData) => void): GameData {
  const copy = structuredClone(data);
  patch(copy);
  return copy;
}

export const FLOOD_HOUSE = 'riverside-bungalow';
export const LANDSLIDE_HOUSE = 'hillysides-house';
/** Purchase price of FLOOD_HOUSE, so tests don't depend on placeholder prices. */
export const FLOOD_PRICE = data.houses.find((h) => h.id === FLOOD_HOUSE)!.price;

/** Year 1's question in a game started with seed 1 (the default in these helpers). */
export const YEAR1_QUESTION = quizForYear(data, { ...newGame(data, 1), year: 1 });
/** Index of the correct answer to YEAR1_QUESTION (the lowest footprint change). */
export const YEAR1_CORRECT = YEAR1_QUESTION.answers.findIndex(
  (a) => a.footprintDelta === data.balance.quizAnswers.correct.footprintDelta,
);

/** Answers the current year's question with the answer at `answerIndex`. */
export function answer(s: GameState, d: GameData = data, answerIndex = 0): GameState {
  const choice = quizForYear(d, s).answers[answerIndex]!;
  return expectOk(answerQuiz(s, d, choice.id));
}

/** A game in year 1's action phase (question answered), in the given house. */
export function startedGame(houseId = FLOOD_HOUSE, d: GameData = data, seed = 1, answerIndex = 0): GameState {
  return answer(expectOk(buyHouse(newGame(d, seed), d, houseId)), d, answerIndex);
}

/** Leaves the year review and, unless the game is over, answers the next year's question. */
export function nextYear(s: GameState, d: GameData = data, answerIndex = 0): GameState {
  const next = expectOk(continueAfterReview(s, d));
  return next.phase === 'quiz' ? answer(next, d, answerIndex) : next;
}

/** Overrides the house value/mods directly to set up a scenario. */
export function withHouse(state: GameState, patch: Partial<NonNullable<GameState['house']>>): GameState {
  const s = structuredClone(state);
  Object.assign(s.house!, patch);
  return s;
}
