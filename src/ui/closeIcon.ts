import * as Phaser from 'phaser';
import { announce } from './a11y';
import type { Focusable, FocusNav } from './buttons';
import { colours } from './theme';

const RADIUS = 16;
const CROSS = 6;
const RED = 0xe5484d;
const INK = 0x10202b;
const FOCUS_SCALE = 1.2;

/**
 * A round red "×" close button for the corner of a popover. The × shape carries
 * the meaning, not just the red; focus adds a thick outline and enlarges it.
 */
export class CloseIcon extends Phaser.GameObjects.Container implements Focusable {
  nav: FocusNav | null = null;
  readonly disabled = false;
  private readonly g: Phaser.GameObjects.Graphics;
  private focused = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly onClose: () => void,
    private readonly label = 'Close',
  ) {
    super(scene, x, y);
    this.g = scene.add.graphics();
    const hit = scene.add.circle(0, 0, RADIUS + 4, 0xffffff, 0.001);
    this.add([this.g, hit]);
    hit.setInteractive({ useHandCursor: true });
    // pointermove, not pointerover: a resting mouse must not steal keyboard focus.
    hit.on('pointermove', () => this.nav?.focus(this));
    hit.on('pointerdown', () => this.activate());
    this.draw();
    scene.add.existing(this);
  }

  setFocused(focused: boolean): void {
    this.focused = focused;
    this.setScale(focused ? FOCUS_SCALE : 1);
    this.draw();
    if (focused) announce(this.label);
  }

  activate(): void {
    this.onClose();
  }

  private draw(): void {
    const g = this.g;
    g.clear();
    if (this.focused) g.lineStyle(4, colours.focus).strokeCircle(0, 0, RADIUS + 4);
    g.fillStyle(RED).fillCircle(0, 0, RADIUS);
    g.lineStyle(2, INK).strokeCircle(0, 0, RADIUS);
    g.lineStyle(4, 0xffffff).lineBetween(-CROSS, -CROSS, CROSS, CROSS).lineBetween(-CROSS, CROSS, CROSS, -CROSS);
  }
}
