import * as Phaser from 'phaser';
import type { QuizQuestion } from '../data/schemas';
import { announce } from './a11y';
import { Button, FocusNav } from './buttons';
import { quizFeedback, type QuizFeedback } from './copy';
import type { BoxRect } from './HUD';
import { addKiwi, type KiwiBubble, type KiwiPart } from './kiwiGuide';
import { colours, HEIGHT, WIDTH } from './theme';

/** Wider than Kiwi's usual bubble, so answers fit on one or two lines. */
const BUBBLE_W = 520;
const BTN_H = 52;
const ANSWER_H = 48;
const ANSWER_FONT = 17;
const GAP = 6;
const CONTINUE_W = 200;
/** Inset of buttons from the bubble's sides (the bubble's own padding). */
const SIDE = 18;
/** How long the chosen answer stays coloured before Kiwi explains (under a second). */
const VERDICT_MS = 700;
const FADE_MS = 300;
const PULSE_MS = 600;
const DIM = 0.45;
/** Above the house, below the HUD, so the footprint box stays bright. */
const BLOCKER_DEPTH = 9;
const RING_DEPTH = 21;

export interface QuestionDialogOptions {
  question: QuizQuestion;
  /** The HUD's carbon footprint box, outlined while the question is open: the answer moves it. */
  from: BoxRect;
  /** What Kiwi says before asking, and after explaining the answer (leading into the upgrades). */
  intro: string;
  outro: string;
  /** Main nav to pause until the question is answered. */
  nav: FocusNav;
  /** Called as soon as an answer is chosen, to record it. */
  onAnswer: (answerId: string) => void;
  /** Called after the player has read the feedback and Kiwi has gone. */
  onDone: () => void;
}

/**
 * The year's "What would you do?" question, asked by Kiwi in its speech bubble. It can't
 * be dismissed. Kiwi first says what's coming (`intro`), then asks. The question itself
 * says nothing about footprints. Choosing an answer
 * colours it green (right), yellow (no change) or red (raises the footprint), with a ✓,
 * – or ✗, for a moment; then Kiwi explains in short sentences why, names the best answer
 * if it wasn't chosen. Last, Kiwi leads into the upgrades (`outro`) and leaves.
 */
export function showQuestion(scene: Phaser.Scene, opts: QuestionDialogOptions): void {
  opts.nav.enabled = false;
  const { from, question } = opts;

  const blocker = scene.add.rectangle(0, 0, WIDTH, HEIGHT, 0x000000, DIM).setOrigin(0).setDepth(BLOCKER_DEPTH).setInteractive();
  blocker.setAlpha(0);
  scene.tweens.add({ targets: blocker, alpha: 1, duration: FADE_MS });

  // A pulsing outline on the footprint box ties the question to it (shape and motion, not just colour).
  const ring = scene.add
    .rectangle(from.x - 4, from.y - 4, from.w + 8, from.h + 8)
    .setOrigin(0)
    .setStrokeStyle(4, colours.focus)
    .setDepth(RING_DEPTH);
  scene.tweens.add({ targets: ring, alpha: 0.25, duration: PULSE_MS, yoyo: true, repeat: -1 });

  const kiwi = addKiwi(scene, true);
  const nav = new FocusNav(scene);

  const close = () => {
    nav.destroy();
    kiwi.destroy();
    ring.destroy();
    blocker.destroy();
    opts.onDone();
  };

  /** A single button at the bottom right of a bubble, focused. */
  const oneButton = (bubble: KiwiBubble, label: string, onActivate: () => void) => {
    const b = new Button(scene, bubble.x + bubble.w - SIDE - CONTINUE_W, bubble.footerY, CONTINUE_W, BTN_H, {
      label,
      fontSize: 20,
      onActivate,
    });
    bubble.layer.add(b);
    nav.add(b);
    nav.focus(b);
  };

  /** Kiwi says a few short paragraphs, with a button to move on. */
  const sayParts = (parts: KiwiPart[], label: string, next: () => void) => {
    nav.clear(); // the old bubble's buttons go with it
    oneButton(kiwi.say(parts, { width: BUBBLE_W, footer: BTN_H }), label, next);
  };

  /** Kiwi says one line, with a button to move on. */
  const sayThen = (line: string, label: string, next: () => void) => sayParts([{ text: line }], label, next);

  // Stage 3: Kiwi explains the chosen answer, then (in a bubble of its own) the best one
  // if that wasn't chosen, then leads into the upgrades and leaves.
  const explain = (fb: QuizFeedback) => {
    nav.enabled = true;
    const outro = () => sayThen(opts.outro, "Let's go", close);
    const best = () => sayParts(fb.bestLines.map((line) => ({ text: line })), 'Continue', outro);
    sayParts(
      [{ text: fb.verdict, colour: colours[fb.tone], bold: true }, ...fb.lines.map((line) => ({ text: line }))],
      fb.bestLines.length ? 'Next' : 'Continue',
      fb.bestLines.length ? best : outro,
    );
  };

  // Stage 2: Kiwi asks, with one answer per row.
  const ask = () => {
    nav.clear();
    const n = question.answers.length;
    const bubble = kiwi.say(question.prompt, {
      heading: 'What would you do?',
      width: BUBBLE_W,
      footer: n * ANSWER_H + (n - 1) * GAP,
    });
    let answered = false;
    question.answers.forEach((answer, i) => {
      const b = new Button(scene, bubble.x + SIDE, bubble.footerY + i * (ANSWER_H + GAP), bubble.w - SIDE * 2, ANSWER_H, {
        label: answer.label,
        fontSize: ANSWER_FONT,
        onActivate: () => {
          if (answered) return;
          answered = true;
          nav.enabled = false;
          opts.onAnswer(answer.id);
          // Colour the choice for a moment, then explain.
          const fb = quizFeedback(question, answer.id);
          b.setTone(fb.tone);
          announce(fb.verdict);
          scene.time.delayedCall(VERDICT_MS, () => explain(fb));
        },
      });
      bubble.layer.add(b);
      nav.add(b);
    });
    nav.focusIndex(0);
  };

  // Stage 1: Kiwi says what's coming.
  sayThen(opts.intro, 'Next', ask);
}
