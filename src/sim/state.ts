import type { Area, Disaster, GameData, House, Mod, QuizPriority, QuizQuestion } from '../data/schemas';

export type Phase =
  /** Picking a house: at game start, or after selling. */
  | 'choosingHouse'
  /** Answering this year's "What would you do?" question, before any actions. */
  | 'quiz'
  /** Spending actions on mods, repairs, or selling. */
  | 'action'
  /** The weather has been rolled; the year review is showing. */
  | 'review'
  /** The game has ended; see `outcome`. */
  | 'over';

export type Outcome = 'won' | 'lost';

export interface HouseState {
  houseId: string;
  /** What the house paid when bought. Never changes. */
  purchasePrice: number;
  /**
   * The house's undamaged value: purchase price plus the cost of every permanent
   * upgrade built. Damage is a share of it, repairs restore it, and value never exceeds it.
   */
  fullValue: number;
  value: number;
  /** Disasters that have hit since the last repair (picks the damaged house picture). */
  unrepairedHits: number;
  /** Permanent mod ids, each at most once. */
  permanentMods: string[];
  /** Consumable mod ids currently stocked, each at most once. */
  consumables: string[];
  destroyed: boolean;
}

export interface DisasterResult {
  disaster: Disaster;
  /** Chance of this disaster this year, in percent. */
  chancePercent: number;
  /** The seeded roll, 0–99. The disaster hits when roll < chancePercent. */
  roll: number;
  hit: boolean;
  basePercent: number;
  /** Damage as a percentage of original value after mods and the floor. 0 if no hit. */
  effectivePercent: number;
  valueLost: number;
  valueAfter: number;
  /** Mods (permanent and consumable) that reduced this hit. */
  helpedBy: string[];
  /** Consumables used up by this hit. */
  consumablesUsed: string[];
}

export interface QuizChoice {
  questionId: string;
  answerId: string;
  footprintDelta: number;
}

export interface MoveRecord {
  fromHouseId: string;
  saleValue: number;
  toHouseId: string | null;
}

/** What the player did during this year's action phase. */
export interface YearActions {
  /** This year's quiz answer, given at the start of the year; applied to the footprint at year end. */
  quiz: QuizChoice | null;
  modsBuilt: string[];
  repairs: { cost: number; valueRestored: number }[];
  move: MoveRecord | null;
}

export interface YearRecord {
  year: number;
  houseId: string;
  areaId: string;
  actions: YearActions;
  quiz: QuizChoice;
  footprintBefore: number;
  baseIncrement: number;
  modFootprintDelta: number;
  footprintAfter: number;
  results: DisasterResult[];
  destroyed: boolean;
  bankAtEnd: number;
  valueAtEnd: number;
}

/** The whole game, as one serialisable object. */
export interface GameState {
  seed: number;
  /** RNG state; advanced only by the sim. */
  rng: number;
  phase: Phase;
  /** 0 before the first house is bought, then 1..gameLengthYears. */
  year: number;
  bank: number;
  actionsLeft: number;
  /** Carbon footprint in tonnes, assuming everyone makes the player's choices. Never below 0. */
  footprint: number;
  house: HouseState | null;
  /** Set while moving: the house just sold, which can't be bought straight back. */
  soldHouseId: string | null;
  outcome: Outcome | null;
  thisYear: YearActions;
  history: YearRecord[];
  /** Question ids in the order they're asked, drawn from the bank when the game starts. */
  questionOrder: string[];
}

/** Result of checking or performing a player intent. */
export type Check = { ok: true } | { ok: false; reason: string };
export type Result = { ok: true; state: GameState } | { ok: false; reason: string };

export const OK: Check = { ok: true };
export function fail(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}

export function emptyYearActions(): YearActions {
  return { quiz: null, modsBuilt: [], repairs: [], move: null };
}

function byId<T extends { id: string }>(items: T[], id: string, kind: string): T {
  const item = items.find((i) => i.id === id);
  if (!item) throw new Error(`Unknown ${kind} id "${id}"`);
  return item;
}

export const getHouse = (data: GameData, id: string): House => byId(data.houses, id, 'house');
export const getArea = (data: GameData, id: string): Area => byId(data.areas, id, 'area');
export const getMod = (data: GameData, id: string): Mod => byId(data.mods, id, 'mod');

export function areaOfHouse(data: GameData, houseId: string): Area {
  return getArea(data, getHouse(data, houseId).areaId);
}

/** The disasters the current house's area can roll. */
export function disastersFor(data: GameData, house: HouseState): Disaster[] {
  return areaOfHouse(data, house.houseId).disasters;
}

/** Mods currently in effect on a house: built permanent mods plus stocked consumables. */
export function activeMods(data: GameData, house: HouseState): Mod[] {
  return [...house.permanentMods, ...house.consumables].map((id) => getMod(data, id));
}

export function getQuestion(data: GameData, id: string): QuizQuestion {
  const question = data.quiz.find((q) => q.id === id);
  if (!question) throw new Error(`Unknown question "${id}"`);
  return question;
}

/** This year's question: the game's shuffled order, one per year (wrapping if the game outlasts the bank). */
export function quizForYear(data: GameData, state: GameState): QuizQuestion {
  const { questionOrder: order } = state;
  if (order.length === 0) throw new Error('The game has no questions');
  return getQuestion(data, order[(state.year - 1) % order.length]!);
}

/** The COP31 priority a question is about. */
export function priorityOf(data: GameData, question: QuizQuestion): QuizPriority {
  const priority = data.quizPriorities.find((p) => p.id === question.priority);
  if (!priority) throw new Error(`Unknown quiz priority "${question.priority}"`);
  return priority;
}
