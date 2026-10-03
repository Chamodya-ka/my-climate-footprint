import * as Phaser from 'phaser';
import { announce } from './a11y';
import type { Focusable, FocusNav } from './buttons';
import { colours, FONT } from './theme';

const FOCUS_SCALE = 1.08;
const INK = '#26344a';
const INK_DIM = '#5a697d';

/** A colour as Phaser wants it, from an [r, g, b] triple. */
export const rgbToNumber = ([r, g, b]: [number, number, number]) => (r << 16) | (g << 8) | b;

interface MarkerOptions {
  onActivate: () => void;
  onFocus?: () => void;
  /** If set, the marker is unavailable and this explains why. */
  disabledReason?: string | null;
}

/**
 * Base for focusable things drawn on the map. Focus shows a thick outline,
 * a ▶ and a slightly larger marker, never colour alone.
 */
abstract class MapMarker extends Phaser.GameObjects.Container implements Focusable {
  nav: FocusNav | null = null;
  protected focused = false;

  constructor(scene: Phaser.Scene, x: number, y: number, protected readonly opts: MarkerOptions) {
    super(scene, x, y);
  }

  get disabled(): boolean {
    return Boolean(this.opts.disabledReason);
  }

  /** Makes `hit` the clickable area for this marker. */
  protected wire(hit: Phaser.GameObjects.Shape): void {
    hit.setInteractive({ useHandCursor: true });
    // pointermove, not pointerover: a resting mouse must not steal keyboard focus.
    hit.on('pointermove', () => this.nav?.focus(this));
    hit.on('pointerdown', () => {
      this.nav?.focus(this);
      this.activate();
    });
  }

  abstract describe(): string;
  protected abstract refresh(): void;

  setFocused(focused: boolean): void {
    this.focused = focused;
    this.setScale(focused ? FOCUS_SCALE : 1);
    this.refresh();
    if (focused) {
      this.opts.onFocus?.();
      announce(this.describe());
    }
  }

  activate(): void {
    if (this.disabled) {
      announce(`Unavailable: ${this.opts.disabledReason}`);
      return;
    }
    this.opts.onActivate();
  }
}

/** A region's name tag on the map: a white pill with a coloured dot, name and hazard. */
export class RegionLabel extends MapMarker {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly nameText: Phaser.GameObjects.Text;
  private readonly boxW: number;
  private readonly boxH: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly title: string,
    private readonly hazard: string,
    private readonly tint: number,
    opts: MarkerOptions,
  ) {
    super(scene, x, y, opts);
    this.nameText = scene.add.text(0, 0, '', { fontFamily: FONT, fontSize: '26px', color: INK, fontStyle: 'bold' });
    const hazardText = scene.add.text(0, 0, hazard, { fontFamily: FONT, fontSize: '15px', color: INK_DIM });
    this.nameText.setText(`▶ ${title}`); // measure with the focus marker so the pill doesn't resize
    this.boxW = Math.max(this.nameText.width, hazardText.width) + 56;
    this.boxH = this.nameText.height + hazardText.height + 14;
    this.bg = scene.add.graphics();
    const left = -this.boxW / 2 + 38;
    this.nameText.setPosition(left, -this.boxH / 2 + 6);
    hazardText.setPosition(left, this.nameText.y + this.nameText.height);
    const hit = scene.add.rectangle(0, 0, this.boxW, this.boxH, 0xffffff, 0.001);
    this.add([this.bg, this.nameText, hazardText, hit]);
    this.wire(hit);
    this.setDepth(5);
    this.refresh();
    scene.add.existing(this);
  }

  describe(): string {
    return `${this.title}. Hazard: ${this.hazard}.`;
  }

  protected refresh(): void {
    const { boxW: w, boxH: h } = this;
    this.bg.clear();
    this.bg.fillStyle(0x283c5a, 0.35).fillRoundedRect(-w / 2, -h / 2 + 4, w, h, 18);
    this.bg.fillStyle(0xffffff).fillRoundedRect(-w / 2, -h / 2, w, h, 18);
    this.bg.lineStyle(this.focused ? 6 : 4, this.focused ? colours.focus : this.tint).strokeRoundedRect(-w / 2, -h / 2, w, h, 18);
    this.bg.fillStyle(this.tint).fillCircle(-w / 2 + 22, -h / 2 + 22, 8);
    this.nameText.setText(`${this.focused ? '▶ ' : ''}${this.title}`);
  }
}

/** A house pin on the map: a round badge with a house icon and the house's name. */
export class HousePin extends MapMarker {
  private readonly badge: Phaser.GameObjects.Arc;
  private readonly tag: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly title: string,
    private readonly tint: number,
    opts: MarkerOptions,
  ) {
    super(scene, x, y, opts);
    const R = 24;
    const shadow = scene.add.ellipse(0, R + 4, R * 1.6, 10, 0x000000, 0.25);
    const stem = scene.add.triangle(0, R - 2, -10, 0, 10, 0, 0, 16, 0xffffff).setOrigin(0.5, 0);
    this.badge = scene.add.circle(0, 0, R, 0xffffff);
    const icon = scene.add.image(0, 0, 'icon-house');
    this.tag = scene.add
      .text(0, R + 20, '', { fontFamily: FONT, fontSize: '16px', color: INK, backgroundColor: '#ffffffee', padding: { x: 6, y: 3 } })
      .setOrigin(0.5, 0);
    this.add([shadow, stem, this.badge, icon, this.tag]);
    this.wire(this.badge);
    this.setDepth(6);
    this.refresh();
    scene.add.existing(this);
  }

  describe(): string {
    return this.disabled ? `${this.title}. Unavailable: ${this.opts.disabledReason}` : this.title;
  }

  protected refresh(): void {
    this.badge.setStrokeStyle(this.focused ? 6 : 4, this.focused ? colours.focus : this.tint);
    this.setAlpha(this.disabled ? 0.6 : 1);
    this.tag.setText(`${this.focused ? '▶ ' : ''}${this.disabled ? '✕ ' : ''}${this.title}`);
  }
}
