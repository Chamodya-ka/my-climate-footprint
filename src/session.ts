import type { GameData } from './data/schemas';
import type { GameState, Result } from './sim/state';
import { announce } from './ui/a11y';

/**
 * The one place scenes read game state from and send intents through.
 * Scenes never change state themselves; they call a sim function and pass the Result here.
 */
let gameData: GameData | null = null;
let gameState: GameState | null = null;

export function setData(data: GameData): void {
  gameData = data;
}

export function data(): GameData {
  if (!gameData) throw new Error('Game data not loaded');
  return gameData;
}

export function state(): GameState {
  if (!gameState) throw new Error('No game in progress');
  return gameState;
}

export function setState(next: GameState): void {
  gameState = next;
}

/** Whether this game's short tour of the HUD boxes still needs showing (once per new game). */
let hudTourPending = false;

/** Rimu's one-off tips on the House screen: the "+" upgrade buttons, then the year-end buttons. */
export type KiwiTip = 'upgrades' | 'yearEnd';
const ALL_TIPS: KiwiTip[] = ['upgrades', 'yearEnd'];
const pendingTips = new Set<KiwiTip>();

/** Starts a new game: sets the state and queues Rimu's introduction and tips. */
export function startNewGame(next: GameState): void {
  gameState = next;
  hudTourPending = true;
  pendingTips.clear();
  for (const tip of ALL_TIPS) pendingTips.add(tip);
}

/** True the first time it's called for a tip after startNewGame(); false after that. */
export function takeKiwiTip(tip: KiwiTip): boolean {
  return pendingTips.delete(tip);
}

/** True the first time it's called after startNewGame(); false after that. */
export function takeHudTour(): boolean {
  const pending = hudTourPending;
  hudTourPending = false;
  return pending;
}

/** Applies a sim Result. Returns true on success; otherwise announces the reason. */
export function apply(result: Result): boolean {
  if (!result.ok) {
    announce(result.reason);
    console.warn('[sim]', result.reason);
    return false;
  }
  gameState = result.state;
  return true;
}

/** A fresh seed for a new game. Randomness lives here, never in src/sim. */
export function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}
