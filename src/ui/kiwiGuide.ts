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
/** Lighter than the introduction's dim, so the buttons Rimu points at stay easy to see. */
const TIP_DIM = 0.3;
const RING_PAD = 6;
const ARROW_GAP = 6;
const ARROW_HALF = 14;
const ARROW_H = 22;
const ARROW_BOB = 8;
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

/** One paragraph of a speech bubble, optionally coloured or bold. */
export interface KiwiPart {
  text: string;
  colour?: string;
  bold?: boolean;
}

export interface KiwiSayOptions {
  heading?: string;
  /** Small text above the heading, e.g. "2 of 8". */
  note?: string;
  /** Height to reserve at the bottom for buttons. */
  footer?: number;
  /** Bubble width, for longer text or wide buttons. */
  width?: number;
  /** Read out first by screen readers, but not shown. */
  spokenContext?: string;
}

export interface Kiwi {
  /** Shows a speech bubble above the kiwi, replacing the current one: one paragraph, or several styled ones. */
  say(content: string | KiwiPart[], opts?: KiwiSayOptions): KiwiBubble;
  destroy(): void;
}

/**
 * Rimu, the guide: stands at the bottom right, facing the screen's content, and talks
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
    say(content, opts = {}) {
      layer?.destroy();
      layer = scene.add.container(0, 0).setDepth(GUIDE_DEPTH);
      const paragraphs: KiwiPart[] = typeof content === 'string' ? [{ text: content }] : content;
      const words = paragraphs.map((p) => p.text).join(' ');
      const w = opts.width ?? BUBBLE_W;
      const inner = w - PAD * 2;
      const x = WIDTH - EDGE - w;
      const parts: Phaser.GameObjects.Text[] = [];
      if (opts.note) parts.push(scene.add.text(0, 0, opts.note, { ...text.small, fontSize: '14px' }));
      if (opts.heading) parts.push(scene.add.text(0, 0, opts.heading, { ...text.h2, wordWrap: { width: inner } }));
      for (const p of paragraphs) {
        parts.push(
          scene.add.text(0, 0, p.text, {
            fontFamily: FONT,
            fontSize: '19px',
            color: p.colour ?? colours.text,
            fontStyle: p.bold ? 'bold' : 'normal',
            lineSpacing: 5,
            wordWrap: { width: inner },
          }),
        );
      }
      const footer = opts.footer ? PAD + opts.footer : 0;
      const h = PAD + parts.reduce((sum, t) => sum + t.height, 0) + (parts.length - 1) * LINE_GAP + footer + PAD;
      // The bubble sits above the kiwi and grows upwards; its tail points down at the kiwi's head.
      const bottom = feetY - KIWI_H - TAIL;
      const y = bottom - h;
      const g = scene.add.graphics();
      g.fillStyle(colours.panel).fillRoundedRect(x, y, w, h, RADIUS);
      g.lineStyle(3, colours.focus).strokeRoundedRect(x, y, w, h, RADIUS);
      const tx = WIDTH - EDGE - KIWI_FEET_FROM_RIGHT - KIWI_HEAD_X;
      g.fillStyle(colours.panel).fillTriangle(tx - 14, bottom - 2, tx + 14, bottom - 2, tx - 4, bottom + TAIL);
      g.lineStyle(3, colours.focus).lineBetween(tx - 14, bottom, tx - 4, bottom + TAIL).lineBetween(tx - 4, bottom + TAIL, tx + 14, bottom);
      // Swallow clicks so they don't reach whatever is under the bubble.
      const hit = scene.add.rectangle(x, y, w, h, 0xffffff, 0.001).setOrigin(0).setInteractive();
      layer.add([hit, g]);
      let ty = y + PAD;
      for (const t of parts) {
        t.setPosition(x + PAD, ty);
        ty += t.height + LINE_GAP;
      }
      layer.add(parts);
      const lead = opts.spokenContext ? `${opts.spokenContext.replace(/\.$/, '')}. ` : '';
      // After the current code has run, so a button focused in the bubble doesn't replace Rimu's words.
      queueMicrotask(() => announce(`${lead}Rimu says: ${opts.heading ? `${opts.heading} ` : ''}${words}`));
      return { layer, x, w, footerY: y + h - PAD - (opts.footer ?? 0) };
    },
    destroy() {
      layer?.destroy();
      kiwi.destroy();
    },
  };
}

/**
 * Rimu's introduction after Start: it explains the game one short step at a time.
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

/** Something Rimu points at: a box, or a round button (`round`). */
export interface KiwiTarget extends BoxRect {
  round?: boolean;
}

export interface KiwiTipOptions {
  text: string;
  /** What to point at: each gets a pulsing outline and a bobbing arrow above it. */
  targets: KiwiTarget[];
  /** Main nav to pause while Rimu talks. */
  nav: FocusNav;
  /** Walk in (true), or already be standing there, e.g. straight after the year's question (false). */
  enter: boolean;
  onDone?: () => void;
}

/**
 * A one-off tip: Rimu points at some buttons and explains them in one short bubble.
 * The screen is lightly dimmed and paused; Got it (or Escape) sends Rimu away.
 */
export function showKiwiTip(scene: Phaser.Scene, opts: KiwiTipOptions): void {
  opts.nav.enabled = false;
  const blocker = scene.add.rectangle(0, 0, WIDTH, HEIGHT, 0x000000, TIP_DIM).setOrigin(0).setDepth(BLOCKER_DEPTH).setInteractive();
  const kiwi = addKiwi(scene, opts.enter);
  const pointers = scene.add.container(0, 0).setDepth(GUIDE_DEPTH);
  const reduced = prefersReducedMotion();
  for (const t of opts.targets) {
    const cx = t.x + t.w / 2;
    const ring = t.round
      ? scene.add.circle(cx, t.y + t.h / 2, t.w / 2 + RING_PAD).setStrokeStyle(4, colours.focus)
      : scene.add.rectangle(t.x - RING_PAD, t.y - RING_PAD, t.w + RING_PAD * 2, t.h + RING_PAD * 2).setOrigin(0).setStrokeStyle(4, colours.focus);
    scene.tweens.add({ targets: ring, alpha: 0.25, duration: PULSE_MS, yoyo: true, repeat: -1 });
    // A downward arrow above the target: shape and motion, not just colour.
    const arrow = scene.add.graphics({ x: cx, y: t.y - RING_PAD - ARROW_GAP });
    arrow.fillStyle(colours.focus).lineStyle(2, INK);
    arrow.fillTriangle(-ARROW_HALF, -ARROW_H, ARROW_HALF, -ARROW_H, 0, 0);
    arrow.strokeTriangle(-ARROW_HALF, -ARROW_H, ARROW_HALF, -ARROW_H, 0, 0);
    if (!reduced) scene.tweens.add({ targets: arrow, y: arrow.y - ARROW_BOB, duration: PULSE_MS, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 });
    pointers.add([ring, arrow]);
  }

  const nav = new FocusNav(scene);
  const finish = () => {
    nav.destroy();
    kiwi.destroy();
    pointers.destroy();
    blocker.destroy();
    opts.nav.enabled = true;
    opts.onDone?.();
  };
  nav.onCancel = finish;
  const bubble = kiwi.say(opts.text, { footer: BTN_H });
  const ok = new Button(scene, bubble.x + bubble.w - PAD - BTN_W, bubble.footerY, BTN_W, BTN_H, {
    label: 'Got it',
    fontSize: 18,
    onActivate: finish,
  });
  bubble.layer.add(ok);
  nav.add(ok);
  nav.focus(ok);
}
