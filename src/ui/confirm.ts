import * as Phaser from 'phaser';
import { announce } from './a11y';
import { Button, FocusNav } from './buttons';
import { colours, FONT, HEIGHT, text, WIDTH } from './theme';

const W = 520;
const PAD = 22;
const BTN_H = 52;
const GAP = 16;
const DEPTH = 30;

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  /** Main nav to pause while the dialog is open, and refocus afterwards. */
  nav: FocusNav;
}

/**
 * A modal "are you sure?" window. Cancel is focused first, so a stray Enter
 * never confirms; Escape or clicking outside also cancels.
 */
export function confirmDialog(scene: Phaser.Scene, opts: ConfirmOptions): void {
  const returnTo = opts.nav.focusedIndex;
  opts.nav.enabled = false;
  const layer = scene.add.container(0, 0).setDepth(DEPTH);
  const nav = new FocusNav(scene);
  const close = () => {
    nav.destroy();
    layer.destroy();
    opts.nav.enabled = true;
    opts.nav.focusIndex(returnTo);
  };
  nav.onCancel = close;

  const blocker = scene.add.rectangle(0, 0, WIDTH, HEIGHT, 0x000000, 0.5).setOrigin(0).setInteractive();
  blocker.on('pointerdown', close);
  const inner = W - PAD * 2;
  const title = scene.add.text(0, 0, opts.title, { ...text.h2, wordWrap: { width: inner } });
  const message = scene.add.text(0, 0, opts.message, {
    fontFamily: FONT,
    fontSize: '17px',
    color: colours.text,
    lineSpacing: 4,
    wordWrap: { width: inner },
  });
  const h = PAD + title.height + 10 + message.height + PAD + BTN_H + PAD;
  const x = (WIDTH - W) / 2;
  const y = (HEIGHT - h) / 2;
  const win = scene.add.rectangle(x, y, W, h, colours.panel).setOrigin(0).setStrokeStyle(3, colours.focus);
  win.setInteractive(); // swallow clicks so they don't reach the blocker
  title.setPosition(x + PAD, y + PAD);
  message.setPosition(x + PAD, title.y + title.height + 10);
  layer.add([blocker, win, title, message]);

  const bw = (inner - GAP) / 2;
  const by = y + h - PAD - BTN_H;
  const confirm = new Button(scene, x + PAD, by, bw, BTN_H, {
    label: opts.confirmLabel,
    fontSize: 19,
    onActivate: () => {
      close();
      opts.onConfirm();
    },
  });
  const cancel = new Button(scene, x + PAD + bw + GAP, by, bw, BTN_H, {
    label: opts.cancelLabel ?? 'Cancel',
    fontSize: 19,
    onActivate: close,
  });
  layer.add([confirm, cancel]);
  nav.add(confirm, cancel);
  announce(`${opts.title}. ${opts.message}`);
  nav.focus(cancel);
}
