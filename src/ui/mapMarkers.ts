import * as Phaser from 'phaser';
import { announce } from './a11y';
import type { Focusable, FocusNav } from './buttons';
import { colours, FONT } from './theme';

const FOCUS_SCALE = 1.08;
/** Region label padding: room for the tint dot on the left, and the right-hand margin. */
const LABEL_TEXT_LEFT = 38;
const LABEL_TEXT_RIGHT = 18;
const INK = '#26344a';
const INK_DIM = '#3a4757';

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
 * a thicker outline and a slightly larger marker, never colour alone.
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
      // Announce first, so an onFocus handler can follow up with a fuller announcement.
      announce(this.describe());
      this.opts.onFocus?.();
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
    this.nameText.setText(title).setOrigin(0.5, 0);
    hazardText.setOrigin(0.5, 0);
    this.boxW = Math.max(this.nameText.width, hazardText.width) + LABEL_TEXT_LEFT + LABEL_TEXT_RIGHT;
    this.boxH = this.nameText.height + hazardText.height + 14;
    this.bg = scene.add.graphics();
    // Centred in the space right of the tint dot.
    const centre = (LABEL_TEXT_LEFT - LABEL_TEXT_RIGHT) / 2;
    this.nameText.setPosition(centre, -this.boxH / 2 + 6);
    hazardText.setPosition(centre, this.nameText.y + this.nameText.height);
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
  }
}

export interface HouseMarkerLook {
  /** Texture key of the house sprite. */
  texture: string;
  /** Sprite display size and anchor, in screen pixels. */
  w: number;
  h: number;
  anchorY: number;
  /** Top of the drawn part of the sprite, as a fraction of its height (for placing the tag). */
  contentTop: number;
  tagBelow: boolean;
  price: string;
  tier: string;
  tint: number;
}

/**
 * A house on the zoomed region view: its sprite plus a price tag ("$595k / Standard").
 * Focus thickens the tag's outline and enlarges the marker.
 */
export class HouseMarker extends MapMarker {
  private readonly tagBg: Phaser.GameObjects.Graphics;
  private readonly priceText: Phaser.GameObjects.Text;
  private readonly tagW: number;
  private readonly tagH: number;
  private readonly tagY: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly title: string,
    private readonly look: HouseMarkerLook,
    opts: MarkerOptions,
  ) {
    super(scene, x, y, opts);
    const sprite = scene.add.image(0, 0, look.texture).setOrigin(0.5, look.anchorY).setDisplaySize(look.w, look.h);
    this.priceText = scene.add.text(0, 0, '', { fontFamily: FONT, fontSize: '22px', color: INK, fontStyle: 'bold' }).setOrigin(0.5, 0);
    const tierText = scene.add.text(0, 0, look.tier, { fontFamily: FONT, fontSize: '14px', color: INK_DIM }).setOrigin(0.5, 0);
    this.priceText.setText(`✕ ${look.price}`); // measure with the ✕ so the tag doesn't resize
    this.tagW = Math.max(this.priceText.width, tierText.width) + 24;
    this.tagH = this.priceText.height + tierText.height + 10;
    const spriteTop = -look.h * (look.anchorY - look.contentTop);
    const ARROW = 10;
    this.tagY = look.tagBelow ? look.h * (1 - look.anchorY) + ARROW : spriteTop - ARROW - this.tagH;
    this.priceText.setY(this.tagY + 4);
    tierText.setY(this.priceText.y + this.priceText.height);
    this.tagBg = scene.add.graphics();
    const hit = scene.add.rectangle(0, 0, Math.max(look.w, this.tagW), 10, 0xffffff, 0.001);
    // Clickable area spans the tag and the sprite.
    const top = Math.min(this.tagY, spriteTop);
    const bottom = Math.max(this.tagY + this.tagH, look.h * (1 - look.anchorY));
    hit.setPosition(0, (top + bottom) / 2).setSize(Math.max(look.w, this.tagW), bottom - top);
    this.add([sprite, this.tagBg, this.priceText, tierText, hit]);
    this.wire(hit);
    this.setDepth(6);
    this.refresh();
    scene.add.existing(this);
  }

  describe(): string {
    const base = `${this.title}, ${this.look.price}, ${this.look.tier}`;
    return this.disabled ? `${base}. Unavailable: ${this.opts.disabledReason}` : base;
  }

  protected refresh(): void {
    const { tagW: w, tagH: h, tagY: y } = this;
    const g = this.tagBg;
    g.clear();
    g.fillStyle(0x283c5a, 0.3).fillRoundedRect(-w / 2, y + 3, w, h, 10);
    g.fillStyle(0xffffff).fillRoundedRect(-w / 2, y, w, h, 10);
    g.lineStyle(this.focused ? 5 : 3, this.focused ? colours.focus : this.look.tint).strokeRoundedRect(-w / 2, y, w, h, 10);
    // Pointer from the tag to the house.
    const tip = this.look.tagBelow ? y - 9 : y + h + 9;
    const base = this.look.tagBelow ? y : y + h;
    g.fillStyle(0xffffff).fillTriangle(-8, base, 8, base, 0, tip);
    this.setAlpha(this.disabled ? 0.6 : 1);
    this.priceText.setText(`${this.disabled ? '✕ ' : ''}${this.look.price}`);
  }
}
