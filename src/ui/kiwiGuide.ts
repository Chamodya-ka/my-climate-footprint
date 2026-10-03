import * as Phaser from 'phaser';
import type { KiwiStep } from './copy';
import { announce, prefersReducedMotion } from './a11y';
import { Button, FocusNav } from './buttons';
import type { BoxRect, HudRowKey } from './HUD';
import { colours, FONT, HEIGHT, text, WIDTH } from './theme';

const EDGE = 16;
/** The kiwi's drawn size (body plus beak) at scale 1, used to place the bubble beside it. */
const KIWI_W = 190;
const KIWI_H = 150;
/** How far the kiwi's feet stand from the right edge, and how far its head is in front of them. */
const KIWI_FEET_FROM_RIGHT = 110;
const KIWI_HEAD_X = 52;
const BUBBLE_W = 370;
const PAD = 18;
const LINE_GAP = 6;
const BTN_W = 150;
const BTN_H = 48;
const GAP = 10;
const TAIL = 20;
const RADIUS = 16;
const PULSE_MS = 600;
const FADE_MS = 200;
const ENTER_MS = 450;
const BOB_MS = 900;
const BOB_PX = 4;
const DIM = 0.5;
/** Above the map, below the HUD, so the box being explained stays bright. */
const BLOCKER_DEPTH = 9;
const GUIDE_DEPTH = 21;

const FEATHERS = 0x8a6a45;
const FEATHERS_DARK = 0x5e4630;
const INK = 0x2b1d10;
const BEAK = 0xe0c98a;
const LEGS = 0xc9a86a;

/**
 * Draws a cartoon kiwi facing right, standing with its feet at (0, 0): a round
 * brown body, small head, long beak and sturdy legs.
 */
function drawKiwi(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  // Legs and toes, behind the body.
  g.lineStyle(7, LEGS).lineBetween(-22, -40, -28, -4).lineBetween(14, -40, 10, -4);
  g.lineStyle(5, LEGS);
  for (const fx of [-28, 10]) g.lineBetween(fx, -4, fx + 16, -2).lineBetween(fx, -4, fx - 10, 0).lineBetween(fx, -4, fx + 6, 2);
  // Body.
  g.fillStyle(FEATHERS).fillEllipse(-8, -82, 150, 110);
  g.lineStyle(3, INK).strokeEllipse(-8, -82, 150, 110);
  // Feather strokes.
  g.lineStyle(2, FEATHERS_DARK);
  for (const [x, y] of [[-50, -100], [-30, -60], [-10, -105], [10, -70], [-55, -70], [25, -95], [-20, -82]] as const) {
    g.lineBetween(x, y, x + 10, y + 8);
  }
  // Head.
  g.fillStyle(FEATHERS).fillCircle(52, -118, 30);
  g.lineStyle(3, INK).strokeCircle(52, -118, 30);
  // Long, slightly drooping beak.
  g.fillStyle(BEAK).fillTriangle(76, -124, 76, -110, 150, -92);
  g.lineStyle(2, INK).strokeTriangle(76, -124, 76, -110, 150, -92);
  // Eye with a highlight.
  g.fillStyle(INK).fillCircle(60, -126, 6);
  g.fillStyle(0xffffff).fillCircle(62, -128, 2);
  return g;
}

export interface KiwiBubble {
  /** Holds the bubble; add buttons here. Destroyed by the next `say()`. */
  layer: Phaser.GameObjects.Container;
  x: number;
  w: number;
  /** Top of the space reserved by `footer`, for buttons. */
  footerY: number;
}

export interface Kiwi {
  /**
   * Shows a speech bubble above the kiwi, replacing the current one. `footer` reserves room
   * for buttons. `spokenContext` is read out first by screen readers but not shown.
   */
  say(text: string, opts?: { heading?: string; note?: string; footer?: number; spokenContext?: string }): KiwiBubble;
  destroy(): void;
}

/**
 * Kiwi, the guide: stands at the bottom right, facing the screen's content, and talks
 * in a speech bubble above it. With `enter` it walks in from the edge (or fades in with
 * reduced motion); it bobs gently while it's on screen.
 */
export function addKiwi(scene: Phaser.Scene, enter: boolean): Kiwi {
  const reduced = prefersReducedMotion();
  const feetY = HEIGHT - EDGE;
  const kiwi = scene.add.container(WIDTH - EDGE - KIWI_FEET_FROM_RIGHT, feetY).setDepth(GUIDE_DEPTH);
  kiwi.add(drawKiwi(scene));
  kiwi.setScale(-1, 1); // drawn facing right; flipped to face the map
  if (enter && reduced) {
    kiwi.setAlpha(0);
    scene.tweens.add({ targets: kiwi, alpha: 1, duration: FADE_MS });
  } else if (enter) {
    const homeX = kiwi.x;
    kiwi.x = WIDTH + KIWI_W;
    scene.tweens.add({ targets: kiwi, x: homeX, duration: ENTER_MS, ease: 'Back.easeOut' });
  }
  if (!reduced) {
    scene.tweens.add({ targets: kiwi, y: feetY - BOB_PX, duration: BOB_MS, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 });
  }

  let layer: Phaser.GameObjects.Container | null = null;
  return {
    say(words, opts = {}) {
      layer?.destroy();
      layer = scene.add.container(0, 0).setDepth(GUIDE_DEPTH);
      const inner = BUBBLE_W - PAD * 2;
      const x = WIDTH - EDGE - BUBBLE_W;
      const parts: Phaser.GameObjects.Text[] = [];
      if (opts.note) parts.push(scene.add.text(0, 0, opts.note, { ...text.small, fontSize: '14px' }));
      if (opts.heading) parts.push(scene.add.text(0, 0, opts.heading, { ...text.h2, wordWrap: { width: inner } }));
      parts.push(
        scene.add.text(0, 0, words, {
          fontFamily: FONT,
          fontSize: '19px',
          color: colours.text,
          lineSpacing: 5,
          wordWrap: { width: inner },
        }),
      );
      const footer = opts.footer ? PAD + opts.footer : 0;
      const h = PAD + parts.reduce((sum, t) => sum + t.height, 0) + (parts.length - 1) * LINE_GAP + footer + PAD;
      // The bubble sits above the kiwi and grows upwards; its tail points down at the kiwi's head.
      const bottom = feetY - KIWI_H - TAIL;
      const y = bottom - h;
      const g = scene.add.graphics();
      g.fillStyle(colours.panel).fillRoundedRect(x, y, BUBBLE_W, h, RADIUS);
      g.lineStyle(3, colours.focus).strokeRoundedRect(x, y, BUBBLE_W, h, RADIUS);
      const tx = WIDTH - EDGE - KIWI_FEET_FROM_RIGHT - KIWI_HEAD_X;
      g.fillStyle(colours.panel).fillTriangle(tx - 14, bottom - 2, tx + 14, bottom - 2, tx - 4, bottom + TAIL);
      g.lineStyle(3, colours.focus).lineBetween(tx - 14, bottom, tx - 4, bottom + TAIL).lineBetween(tx - 4, bottom + TAIL, tx + 14, bottom);
      // Swallow clicks so they don't reach whatever is under the bubble.
      const hit = scene.add.rectangle(x, y, BUBBLE_W, h, 0xffffff, 0.001).setOrigin(0).setInteractive();
      layer.add([hit, g]);
      let ty = y + PAD;
      for (const t of parts) {
        t.setPosition(x + PAD, ty);
        ty += t.height + LINE_GAP;
      }
      layer.add(parts);
      const lead = opts.spokenContext ? `${opts.spokenContext.replace(/\.$/, '')}. ` : '';
      announce(`${lead}Kiwi says: ${opts.heading ? `${opts.heading} ` : ''}${words}`);
      return { layer, x, w: BUBBLE_W, footerY: y + h - PAD - (opts.footer ?? 0) };
    },
    destroy() {
      layer?.destroy();
      kiwi.destroy();
    },
  };
}

/**
 * Kiwi's introduction after Start: it explains the game one short step at a time.
 * Steps about a HUD box highlight it. Next / Let's go moves on; Skip or Escape ends it.
 * The screen behind is dimmed and paused until it's done; the kiwi stays afterwards.
 */
export function showKiwiGuide(
  scene: Phaser.Scene,
  kiwi: Kiwi,
  steps: KiwiStep[],
  targets: Record<HudRowKey, BoxRect>,
  mainNav: FocusNav,
  onDone: () => void,
): void {
  mainNav.enabled = false;
  const blocker = scene.add.rectangle(0, 0, WIDTH, HEIGHT, 0x000000, DIM).setOrigin(0).setDepth(BLOCKER_DEPTH).setInteractive();
  let ring: Phaser.GameObjects.Rectangle | null = null;
  let nav: FocusNav | null = null;

  const finish = () => {
    nav?.destroy();
    ring?.destroy();
    scene.tweens.add({ targets: blocker, alpha: 0, duration: FADE_MS, onComplete: () => blocker.destroy() });
    mainNav.enabled = true;
    onDone();
  };

  const show = (i: number) => {
    nav?.destroy();
    ring?.destroy();
    ring = null;
    const step = steps[i]!;
    const last = i === steps.length - 1;

    // Highlight the HUD box being explained.
    if (step.key) {
      const t = targets[step.key];
      ring = scene.add.rectangle(t.x - 4, t.y - 4, t.w + 8, t.h + 8).setOrigin(0).setStrokeStyle(4, colours.focus).setDepth(GUIDE_DEPTH);
      scene.tweens.add({ targets: ring, alpha: 0.25, duration: PULSE_MS, yoyo: true, repeat: -1 });
    }

    const bubble = kiwi.say(step.text, { note: `${i + 1} of ${steps.length}`, footer: BTN_H });
    nav = new FocusNav(scene);
    nav.onCancel = finish;
    const right = bubble.x + bubble.w - PAD;
    const buttons: Button[] = [];
    if (!last) {
      buttons.push(new Button(scene, right - BTN_W * 2 - GAP, bubble.footerY, BTN_W, BTN_H, { label: 'Skip', fontSize: 18, onActivate: finish }));
    }
    const next = new Button(scene, right - BTN_W, bubble.footerY, BTN_W, BTN_H, {
      label: last ? "Let's go" : 'Next',
      fontSize: 18,
      onActivate: () => (last ? finish() : show(i + 1)),
    });
    buttons.push(next);
    bubble.layer.add(buttons);
    nav.add(...buttons);
    nav.focus(next);
  };

  show(0);
}
