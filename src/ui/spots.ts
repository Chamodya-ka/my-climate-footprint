import * as Phaser from 'phaser';
import type { Spot } from '../data/schemas';
import { announce } from './a11y';
import type { Focusable, FocusNav } from './buttons';
import { PLUS_ICON } from './houseAssets';
import { colours } from './theme';

export const SPOT_COPY: Record<Spot, { name: string; intro: string }> = {
  door: { name: 'Door', intro: 'Keep floodwater out at the doorway, and be ready to stay home safely.' },
  foundation: { name: 'Foundation', intro: 'Raise or strengthen what the house stands on.' },
  garden: { name: 'Garden', intro: 'Work the ground around the house: drains, walls, nails and trees.' },
};

const RADIUS = 22;
const FOCUS_SCALE = 1.15;

export interface SpotButtonOptions {
  spot: Spot;
  /** e.g. "1/2": upgrades in place out of those available at this spot. */
  count: string;
  onActivate: () => void;
  onFocus?: () => void;
}

/**
 * A round "+" marker on the house that opens that spot's upgrade window.
 * Focus shows a thick outline and a larger marker, never colour alone. The spot's name
 * and count are announced to screen readers rather than shown.
 */
export class SpotButton extends Phaser.GameObjects.Container implements Focusable {
  nav: FocusNav | null = null;
  readonly disabled = false;
  private readonly circle: Phaser.GameObjects.Arc;

  constructor(scene: Phaser.Scene, x: number, y: number, readonly opts: SpotButtonOptions) {
    super(scene, x, y);
    // The focus ring sits behind the designer's "+" icon; the circle is also the click target.
    this.circle = scene.add.circle(0, 0, RADIUS, 0xffffff, 0.001).setStrokeStyle(0, 0x10202b);
    const plus = scene.add.image(0, 0, PLUS_ICON).setDisplaySize(RADIUS * 2.4, RADIUS * 2.4);
    this.add([this.circle, plus]);
    this.setSize(RADIUS * 2, RADIUS * 2);
    this.circle.setInteractive({ useHandCursor: true });
    // pointermove, not pointerover: a resting mouse must not steal keyboard focus.
    this.circle.on('pointermove', () => this.nav?.focus(this));
    this.circle.on('pointerdown', () => {
      this.nav?.focus(this);
      this.activate();
    });
    this.setDepth(5);
    this.setFocused(false);
    scene.add.existing(this);
  }

  describe(): string {
    return `${SPOT_COPY[this.opts.spot].name} upgrades, ${this.opts.count} in place`;
  }

  setFocused(focused: boolean): void {
    this.circle.setStrokeStyle(focused ? 6 : 0, colours.focus);
    this.setScale(focused ? FOCUS_SCALE : 1);
    if (focused) {
      this.opts.onFocus?.();
      announce(this.describe());
    }
  }

  activate(): void {
    this.opts.onActivate();
  }
}
