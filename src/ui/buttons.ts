import * as Phaser from 'phaser';
import { colours, FONT } from './theme';
import { announce } from './a11y';

export interface ButtonOptions {
  label: string;
  /** Second line, e.g. a price. */
  detail?: string;
  /** If set, the button is unavailable and this explains why. */
  disabledReason?: string | null;
  onActivate: () => void;
  /** Called when focused by keyboard or hovered. */
  onFocus?: () => void;
  fontSize?: number;
  /** Text alignment; centred unless a list reads better left-aligned (e.g. upgrade rows). */
  align?: 'left' | 'center';
}

/** Anything FocusNav can move focus between. */
export interface Focusable {
  nav: FocusNav | null;
  readonly disabled: boolean;
  setFocused(focused: boolean): void;
  activate(): void;
  destroy(): void;
}

export type ButtonTone = 'good' | 'warn' | 'bad';
const TONE_MARK: Record<ButtonTone, string> = { good: '✓', warn: '–', bad: '✗' };

const BORDER = 2;
const FOCUS_BORDER = 4;
const TEXT_PAD = 12;
const MIN_FONT = 13;

/**
 * A keyboard-focusable button with its text centred (or left-aligned with `align: 'left'`). Focus is shown by a thick outline
 * (a shape change, not just colour); unavailable buttons show ✕ and dimmed text, so colour
 * is never the only signal.
 */
export class Button extends Phaser.GameObjects.Container implements Focusable {
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly labelText: Phaser.GameObjects.Text;
  private readonly detailText: Phaser.GameObjects.Text | null;
  private focused = false;
  private tone: ButtonTone | null = null;
  nav: FocusNav | null = null;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly w: number,
    readonly h: number,
    readonly opts: ButtonOptions,
  ) {
    super(scene, x, y);
    const size = opts.fontSize ?? 20;
    const left = opts.align === 'left';
    const textX = left ? TEXT_PAD : w / 2;
    const originX = left ? 0 : 0.5;
    this.bg = scene.add.rectangle(0, 0, w, h, colours.button).setOrigin(0);
    this.labelText = scene.add.text(textX, opts.detail ? 5 : h / 2, '', {
      fontFamily: FONT,
      fontSize: `${size}px`,
      color: colours.text,
      align: opts.align ?? 'center',
      wordWrap: { width: w - TEXT_PAD * 2 },
    });
    if (!opts.detail) this.labelText.setOrigin(originX, 0.5);
    else this.labelText.setOrigin(originX, 0).setWordWrapWidth(null);
    this.detailText = opts.detail
      ? scene.add.text(textX, h - 6, opts.detail, {
          fontFamily: FONT,
          fontSize: `${size - 3}px`,
          color: colours.textDim,
          align: opts.align ?? 'center',
          wordWrap: { width: w - TEXT_PAD * 2 },
        }).setOrigin(originX, 1)
      : null;
    this.add([this.bg, this.labelText, ...(this.detailText ? [this.detailText] : [])]);
    this.setSize(w, h);
    this.bg.setInteractive({ useHandCursor: true });
    // pointermove, not pointerover: a resting mouse must not steal keyboard focus when a scene starts.
    this.bg.on('pointermove', () => this.nav?.focus(this));
    this.bg.on('pointerdown', () => {
      this.nav?.focus(this);
      this.activate();
    });
    this.refresh();
    scene.add.existing(this);
  }

  /** Changes the label, detail line, availability or action after creation. */
  update(patch: Partial<ButtonOptions>): void {
    Object.assign(this.opts, patch);
    if (patch.detail !== undefined) this.detailText?.setText(patch.detail);
    this.refresh();
  }

  get disabled(): boolean {
    return Boolean(this.opts.disabledReason);
  }

  /**
   * Marks the button as a right, so-so or wrong choice: a coloured fill and outline plus
   * a ✓, – or ✗ before the label, so colour is never the only signal. `null` clears it.
   */
  setTone(tone: ButtonTone | null): void {
    this.tone = tone;
    this.refresh();
  }

  setFocused(focused: boolean): void {
    this.focused = focused;
    this.refresh();
    if (focused) {
      this.opts.onFocus?.();
      announce(this.describe());
    }
  }

  describe(): string {
    const parts = [this.opts.label, this.opts.detail ?? ''];
    if (this.disabled) parts.push(`Unavailable: ${this.opts.disabledReason}`);
    return parts.filter(Boolean).join('. ');
  }

  activate(): void {
    if (this.disabled) {
      announce(`Unavailable: ${this.opts.disabledReason}`);
      this.scene.cameras.main.shake(80, 0.002);
      return;
    }
    this.opts.onActivate();
  }

  /** Two-line buttons keep the label on one line, shrinking the font if needed. */
  private fitLabel(): void {
    let size = this.opts.fontSize ?? 20;
    this.labelText.setFontSize(size);
    while (this.labelText.width > this.w - TEXT_PAD * 2 && size > MIN_FONT) {
      size -= 1;
      this.labelText.setFontSize(size);
    }
  }

  private refresh(): void {
    const status = this.tone ? `${TONE_MARK[this.tone]} ` : this.disabled ? '✕ ' : '';
    this.labelText.setText(`${status}${this.opts.label}`);
    if (this.opts.detail) this.fitLabel();
    this.labelText.setColor(this.disabled ? colours.textDisabled : colours.text);
    if (this.tone) {
      this.bg.setFillStyle(colours[`${this.tone}Fill`]);
      this.bg.setStrokeStyle(FOCUS_BORDER, colours[`${this.tone}Edge`]);
      return;
    }
    this.bg.setFillStyle(this.disabled ? colours.buttonDisabled : colours.button);
    this.bg.setStrokeStyle(this.focused ? FOCUS_BORDER : BORDER, this.focused ? colours.focus : colours.panelEdge);
  }
}

/**
 * Keyboard navigation for a scene's buttons: Tab / arrow keys move focus,
 * Enter / Space activate. Unavailable buttons can still be focused so their
 * reason can be read.
 */
export class FocusNav {
  private buttons: Focusable[] = [];
  private index = -1;
  /** A disabled nav ignores keys, e.g. while a modal window has its own nav. */
  enabled = true;
  /** Called on Escape. */
  onCancel: (() => void) | null = null;
  private readonly handler: (event: KeyboardEvent) => void;

  constructor(scene: Phaser.Scene) {
    // A plain DOM listener: Phaser's keyboard plugin can replay queued
    // keydown events, which made one press move focus several steps.
    this.handler = (event: KeyboardEvent) => {
      if (!this.enabled || !scene.sys.isActive() || event.repeat) return;
      if (['Tab', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape'].includes(event.key)) {
        event.preventDefault();
      }
      this.onKey(event);
    };
    window.addEventListener('keydown', this.handler);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  /** Stops listening for keys. Buttons are not destroyed. */
  destroy(): void {
    window.removeEventListener('keydown', this.handler);
  }

  add(...buttons: Focusable[]): this {
    for (const b of buttons) {
      b.nav = this;
      this.buttons.push(b);
    }
    return this;
  }

  clear(): void {
    for (const b of this.buttons) b.destroy();
    this.buttons = [];
    this.index = -1;
  }

  indexOf(button: Focusable): number {
    return this.buttons.indexOf(button);
  }

  get focusedIndex(): number {
    return this.index;
  }

  focus(button: Focusable): void {
    const i = this.buttons.indexOf(button);
    if (i === this.index) return;
    this.buttons[this.index]?.setFocused(false);
    this.index = i;
    button.setFocused(true);
  }

  focusIndex(i: number): void {
    const b = this.buttons[Math.max(0, Math.min(i, this.buttons.length - 1))];
    if (b) this.focus(b);
  }

  /** Focuses the first available button, if any. */
  focusFirstAvailable(): void {
    const b = this.buttons.find((x) => !x.disabled) ?? this.buttons[0];
    if (b) this.focus(b);
  }

  private move(delta: number): void {
    const n = this.buttons.length;
    if (n === 0) return;
    this.focusIndex(this.index < 0 ? 0 : (this.index + delta + n) % n);
  }

  private onKey(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Tab':
        this.move(event.shiftKey ? -1 : 1);
        break;
      case 'ArrowDown':
      case 'ArrowRight':
        this.move(1);
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        this.move(-1);
        break;
      case 'Escape':
        this.onCancel?.();
        break;
      case 'Enter':
      case ' ':
        this.buttons[this.index]?.activate();
        break;
    }
  }
}
