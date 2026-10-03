import * as Phaser from 'phaser';
import { announce } from './a11y';
import { Button, FocusNav } from './buttons';
import type { BoxRect } from './HUD';
import { colours, FONT, HEIGHT, text, WIDTH } from './theme';

const W = 380;
const PAD = 18;
const BTN_H = 46;
const GAP = 10;
const TAIL = 16;
const RADIUS = 14;
const PULSE_MS = 600;
const FADE_MS = 200;
const DIM = 0.5;
/** Above the map, below the HUD, so the boxes being explained stay bright. */
const BLOCKER_DEPTH = 9;
const MARK_DEPTH = 21;

export interface CoachStep {
  target: BoxRect;
  title: string;
  body: string;
}

/**
 * A short guided tour: one callout at a time, each pointing at a target with
 * a pulsing outline. Callouts sit below targets on the left half of the
 * screen and to the left of targets on the right half. Next / Got it moves on;
 * Skip or Escape ends the tour.
 */
export function showCoachMarks(scene: Phaser.Scene, steps: CoachStep[], mainNav: FocusNav, onDone: () => void): void {
  mainNav.enabled = false;
  const blocker = scene.add.rectangle(0, 0, WIDTH, HEIGHT, 0x000000, DIM).setOrigin(0).setDepth(BLOCKER_DEPTH).setInteractive();
  let layer: Phaser.GameObjects.Container | null = null;
  let nav: FocusNav | null = null;

  const finish = () => {
    nav?.destroy();
    layer?.destroy();
    scene.tweens.add({ targets: blocker, alpha: 0, duration: FADE_MS, onComplete: () => blocker.destroy() });
    mainNav.enabled = true;
    onDone();
  };

  const show = (i: number) => {
    nav?.destroy();
    layer?.destroy();
    const step = steps[i]!;
    const { target: t } = step;
    layer = scene.add.container(0, 0).setDepth(MARK_DEPTH);

    const ring = scene.add.rectangle(t.x - 4, t.y - 4, t.w + 8, t.h + 8).setOrigin(0).setStrokeStyle(4, colours.focus);
    scene.tweens.add({ targets: ring, alpha: 0.25, duration: PULSE_MS, yoyo: true, repeat: -1 });

    const inner = W - PAD * 2;
    const count = scene.add.text(0, 0, `${i + 1} of ${steps.length}`, { ...text.small, fontSize: '14px' });
    const title = scene.add.text(0, 0, step.title, text.h2);
    const body = scene.add.text(0, 0, step.body, {
      fontFamily: FONT,
      fontSize: '16px',
      color: colours.text,
      lineSpacing: 3,
      wordWrap: { width: inner },
    });
    const h = PAD + count.height + 2 + title.height + 6 + body.height + PAD + BTN_H + PAD;

    // Below the target if it's on the left of the screen, otherwise to its left.
    const below = t.x + t.w / 2 < WIDTH / 2;
    const x = below ? t.x : t.x - TAIL - W - 4;
    const y = below ? t.y + t.h + TAIL + 4 : Math.max(t.y, Math.min(t.y + t.h / 2 - 40, HEIGHT - h - PAD));
    const g = scene.add.graphics();
    g.fillStyle(colours.panel).fillRoundedRect(x, y, W, h, RADIUS);
    g.lineStyle(3, colours.focus).strokeRoundedRect(x, y, W, h, RADIUS);
    if (below) {
      const tx = t.x + Math.min(46, t.w / 2);
      g.fillStyle(colours.panel).fillTriangle(tx - 12, y + 2, tx + 12, y + 2, tx, y - TAIL);
      g.lineStyle(3, colours.focus).lineBetween(tx - 12, y, tx, y - TAIL).lineBetween(tx, y - TAIL, tx + 12, y);
    } else {
      const ty = t.y + t.h / 2;
      g.fillStyle(colours.panel).fillTriangle(x + W - 2, ty - 12, x + W - 2, ty + 12, x + W + TAIL, ty);
      g.lineStyle(3, colours.focus).lineBetween(x + W, ty - 12, x + W + TAIL, ty).lineBetween(x + W + TAIL, ty, x + W, ty + 12);
    }
    count.setPosition(x + PAD, y + PAD);
    title.setPosition(x + PAD, count.y + count.height + 2);
    body.setPosition(x + PAD, title.y + title.height + 6);
    layer.add([ring, g, count, title, body]);

    const last = i === steps.length - 1;
    const bw = (inner - GAP) / 2;
    const by = y + h - PAD - BTN_H;
    nav = new FocusNav(scene);
    nav.onCancel = finish;
    const buttons: Button[] = [];
    if (!last) buttons.push(new Button(scene, x + PAD, by, bw, BTN_H, { label: 'Skip', fontSize: 18, onActivate: finish }));
    const next = new Button(scene, x + PAD + bw + GAP, by, bw, BTN_H, {
      label: last ? 'Got it' : 'Next',
      fontSize: 18,
      onActivate: () => (last ? finish() : show(i + 1)),
    });
    buttons.push(next);
    layer.add(buttons);
    nav.add(...buttons);
    nav.focus(next);
    layer.setAlpha(0);
    scene.tweens.add({ targets: layer, alpha: 1, duration: FADE_MS });
    announce(`${step.title}. ${step.body}`);
  };

  show(0);
}
