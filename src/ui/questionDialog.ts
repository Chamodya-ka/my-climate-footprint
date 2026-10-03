import * as Phaser from 'phaser';
import type { QuizQuestion } from '../data/schemas';
import { announce } from './a11y';
import { Button, FocusNav } from './buttons';
import { quizFeedback } from './copy';
import type { BoxRect } from './HUD';
import { colours, FONT, HEIGHT, text, WIDTH } from './theme';

const W = 760;
const PAD = 20;
const BTN_H = 52;
const GAP = 10;
const COLS = 2;
const CONTINUE_W = 200;
/** Gap between the footprint box and the bubble, bridged by the bubble's tail. */
const TAIL = 18;
/** Where along the bubble's top edge the tail sits. */
const TAIL_X = 46;
const GROW_MS = 380;
const SHRINK_MS = 240;
const PULSE_MS = 600;
const DIM = 0.45;
/** Above the house, below the HUD, so the footprint box stays bright. */
const BLOCKER_DEPTH = 9;
const BUBBLE_DEPTH = 21;
const RADIUS = 14;

export interface QuestionDialogOptions {
  question: QuizQuestion;
  /** The HUD's carbon footprint box: the bubble grows out of it. */
  from: BoxRect;
  /** Main nav to pause until the question is answered. */
  nav: FocusNav;
  /** Called as soon as an answer is chosen, to record it. */
  onAnswer: (answerId: string) => void;
  /** Called after the player has read the feedback and the bubble has closed. */
  onDone: () => void;
}

/**
 * The year's "What would you do?" question, as a speech bubble that grows out
 * of the carbon footprint box. It can't be dismissed. The question
 * itself says nothing about footprints; once answered, the same bubble says
 * whether the choice was the best one, which way it moves the carbon footprint
 * (no figures), and explains the chosen option only. Continue closes it.
 */
export function showQuestion(scene: Phaser.Scene, opts: QuestionDialogOptions): void {
  opts.nav.enabled = false;
  const { from, question } = opts;

  const blocker = scene.add.rectangle(0, 0, WIDTH, HEIGHT, 0x000000, DIM).setOrigin(0).setDepth(BLOCKER_DEPTH).setInteractive();
  blocker.setAlpha(0);
  scene.tweens.add({ targets: blocker, alpha: 1, duration: GROW_MS });

  // A pulsing outline on the footprint box ties the question to it (shape and motion, not just colour).
  const ring = scene.add
    .rectangle(from.x - 4, from.y - 4, from.w + 8, from.h + 8)
    .setOrigin(0)
    .setStrokeStyle(4, colours.focus)
    .setDepth(BUBBLE_DEPTH);
  scene.tweens.add({ targets: ring, alpha: 0.25, duration: PULSE_MS, yoyo: true, repeat: -1 });

  // The bubble is built around its tail tip, so it can grow out of (and shrink back into) the box.
  const tipX = from.x + TAIL_X;
  const tipY = from.y + from.h + 2;
  const bubble = scene.add.container(tipX, tipY).setDepth(BUBBLE_DEPTH);
  const left = from.x - tipX; // bubble's left edge, relative to the tip
  const top = TAIL;
  const inner = W - PAD * 2;
  const x0 = left + PAD;

  const bg = scene.add.graphics();
  const drawBubble = (h: number) => {
    bg.clear();
    bg.fillStyle(colours.panel).fillRoundedRect(left, top, W, h, RADIUS);
    bg.lineStyle(3, colours.focus).strokeRoundedRect(left, top, W, h, RADIUS);
    // The tail, pointing up at the footprint box.
    bg.fillStyle(colours.panel).fillTriangle(-12, top + 2, 12, top + 2, 0, 0);
    bg.lineStyle(3, colours.focus).lineBetween(-12, top, 0, 0).lineBetween(0, 0, 12, top);
  };
  const title = scene.add.text(x0, top + PAD, 'What would you do?', text.h2);
  const prompt = scene.add.text(x0, title.y + title.height + 6, question.prompt, {
    fontFamily: FONT,
    fontSize: '19px',
    color: colours.text,
    wordWrap: { width: inner },
  });
  bubble.add([bg, title, prompt]);
  const contentTop = prompt.y + prompt.height + PAD;

  const nav = new FocusNav(scene);
  nav.enabled = false; // until the bubble has finished growing

  const close = () => {
    nav.enabled = false;
    scene.tweens.add({ targets: blocker, alpha: 0, duration: SHRINK_MS });
    scene.tweens.add({
      targets: bubble,
      scale: 0,
      alpha: 0,
      duration: SHRINK_MS,
      ease: 'Back.easeIn',
      onComplete: () => {
        nav.destroy();
        bubble.destroy();
        ring.destroy();
        blocker.destroy();
        opts.onDone();
      },
    });
  };

  // Stage 2: the same bubble explains the options.
  const showFeedback = (answerId: string) => {
    nav.clear(); // removes the answer buttons
    const fb = quizFeedback(question, answerId);
    const items: Phaser.GameObjects.Text[] = [];
    let y = contentTop;
    const add = (t: Phaser.GameObjects.Text, gapAfter: number) => {
      t.setPosition(x0, y);
      items.push(t);
      y += t.height + gapAfter;
    };
    add(
      scene.add.text(0, 0, fb.verdict, {
        fontFamily: FONT,
        fontSize: '19px',
        color: fb.correct ? colours.good : colours.bad,
        fontStyle: 'bold',
        wordWrap: { width: inner },
      }),
      6,
    );
    add(
      scene.add.text(0, 0, fb.footprintLine, {
        fontFamily: FONT,
        fontSize: '16px',
        color: colours.text,
        lineSpacing: 3,
        wordWrap: { width: inner },
      }),
      PAD - 4,
    );
    // Only the chosen answer is explained, to keep the bubble short.
    const chosen = question.answers.find((a) => a.id === answerId)!;
    add(
      scene.add.text(0, 0, `▶ ${chosen.label}`, {
        fontFamily: FONT,
        fontSize: '16px',
        color: colours.focusText,
        fontStyle: 'bold',
        wordWrap: { width: inner },
      }),
      2,
    );
    add(
      scene.add.text(0, 0, chosen.explanation, {
        fontFamily: FONT,
        fontSize: '15px',
        color: colours.textDim,
        wordWrap: { width: inner },
      }),
      8,
    );
    bubble.add(items);
    const cont = new Button(scene, left + W - PAD - CONTINUE_W, y + 4, CONTINUE_W, BTN_H, {
      label: 'Continue',
      fontSize: 20,
      onActivate: close,
    });
    bubble.add(cont);
    nav.add(cont);
    drawBubble(y + 4 + BTN_H + PAD - top);
    announce(`${fb.verdict} ${fb.footprintLine}`);
    nav.enabled = true;
    nav.focus(cont);
  };

  // Stage 1: the question and its answers.
  const rows = Math.ceil(question.answers.length / COLS);
  const bw = (inner - (COLS - 1) * GAP) / COLS;
  question.answers.forEach((answer, i) => {
    const b = new Button(
      scene,
      x0 + (i % COLS) * (bw + GAP),
      contentTop + Math.floor(i / COLS) * (BTN_H + GAP),
      bw,
      BTN_H,
      {
        label: answer.label,
        fontSize: 19,
        onActivate: () => {
          opts.onAnswer(answer.id);
          showFeedback(answer.id);
        },
      },
    );
    bubble.add(b);
    nav.add(b);
  });
  drawBubble(contentTop - top + rows * BTN_H + (rows - 1) * GAP + PAD);

  bubble.setScale(0).setAlpha(0);
  announce(`What would you do? ${question.prompt}`);
  scene.tweens.add({
    targets: bubble,
    scale: 1,
    alpha: 1,
    duration: GROW_MS,
    ease: 'Back.easeOut',
    onComplete: () => {
      nav.enabled = true;
      nav.focusIndex(0);
    },
  });
}
