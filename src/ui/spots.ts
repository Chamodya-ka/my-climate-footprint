import * as Phaser from 'phaser';
import type { Spot } from '../data/schemas';
import { announce } from './a11y';
import type { Focusable, FocusNav } from './buttons';
import { colours, FONT } from './theme';

export const SPOT_COPY: Record<Spot, { name: string; intro: string }> = {
  doors: { name: 'Doors', intro: 'Keep floodwater out at the doorways.' },
  foundations: { name: 'Foundations', intro: 'Raise or strengthen what the house stands on.' },
  drains: { name: 'Drains', intro: 'Carry rain and surface water away from the house.' },
  inside: { name: 'Inside', intro: 'Get ready to stay home safely through a disaster.' },
  garden: { name: 'Garden', intro: 'Roots that bind the soil and take in carbon.' },
  slope: { name: 'Slope', intro: 'Hold back the bank behind the house.' },
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
    this.circle = scene.add.circle(0, 0, RADIUS, 0xffffff).setStrokeStyle(3, 0x10202b);
    const plus = scene.add
      .text(0, -1, '+', { fontFamily: FONT, fontSize: '34px', color: '#10202b', fontStyle: 'bold' })
      .setOrigin(0.5);
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
    this.circle.setStrokeStyle(focused ? 6 : 3, focused ? colours.focus : 0x10202b);
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
