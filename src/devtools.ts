/**
 * Development-only helpers for driving the game from the browser console
 * (and from automated browser tests). Loaded only when import.meta.env.DEV.
 *
 *   await dev.start(1)          // region index, then buys the first house
 *   await dev.endYear(0)        // end the year, pick quiz answer 0, wait for the review
 *   dev.state()                 // current GameState
 */
import type * as Phaser from 'phaser';
import * as session from './session';
import type { Button } from './ui/buttons';

const rawSleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function installDevtools(game: Phaser.Game): void {
  // Background tabs pause requestAnimationFrame, which freezes Phaser. While hidden,
  // step the loop by hand so scripted runs (and automated browser tests) keep moving.
  const FRAME_MS = 1000 / 60;
  let clock = performance.now();
  const MAX_CATCH_UP = 120;
  const pump = () => {
    if (!document.hidden) {
      clock = performance.now();
      return;
    }
    // Catch the game clock up to real time (background timers are throttled).
    for (let i = 0; i < MAX_CATCH_UP && clock < performance.now(); i++) {
      clock += FRAME_MS;
      game.step(clock, FRAME_MS);
    }
  };
  const sleep = async (ms: number) => {
    const t = Date.now();
    while (Date.now() - t < ms) {
      pump();
      await rawSleep(Math.min(50, ms));
    }
  };
  const active = () => game.scene.getScenes(true)[0]?.scene.key;
  const press = (key: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key }));
  const waitFor = async (key: string, ms = 8000) => {
    const t = Date.now();
    while (active() !== key && Date.now() - t < ms) await sleep(100);
    await sleep(150);
    return active();
  };
  /** Finds a button by label in the active scene, including buttons inside containers. */
  const button = (pred: (label: string) => boolean): Button | undefined => {
    const scene = game.scene.getScenes(true)[0];
    const all = scene?.children.list.flatMap((o) => ('list' in o ? [o, ...(o as Phaser.GameObjects.Container).list] : [o]));
    return all?.find((o) => 'opts' in o && pred((o as Button).opts.label)) as Button | undefined;
  };
  const click = async (pred: (label: string) => boolean, ms = 8000) => {
    const t = Date.now();
    while (!button(pred) && Date.now() - t < ms) await sleep(100);
    button(pred)?.activate();
    await sleep(150);
  };

  const dev = {
    active,
    press,
    waitFor,
    button,
    click,
    state: session.state,
    async start(regionIndex = 0, houseIndex = 0) {
      await waitFor('Title');
      await click((l) => l === 'Start');
      await waitFor('RegionSelect');
      await click((l) => l === session.data().regions[regionIndex]!.name);
      await waitFor('HouseSelect');
      for (let i = 0; i < houseIndex; i++) press('ArrowDown');
      press('Enter');
      return waitFor('House');
    },
    /** Ends the year with the given quiz answer. Stops on the Roll scene if `stopAtRoll`. */
    async endYear(answerIndex = 0, stopAtRoll = false) {
      await click((l) => l === 'Finish Upgrades');
      await waitFor('Quiz');
      for (let i = 0; i < answerIndex; i++) press('ArrowDown');
      press('Enter');
      await waitFor('Roll');
      if (stopAtRoll) return 'Roll';
      await click((l) => l === 'See the year review');
      return waitFor('YearReview');
    },
    async nextYear() {
      press('Enter');
      return waitFor(session.state().outcome ? 'FinalReport' : 'House');
    },
  };
  Object.assign(window, { game, session, dev });
}
