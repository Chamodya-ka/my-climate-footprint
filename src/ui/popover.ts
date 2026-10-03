import * as Phaser from 'phaser';
import { FocusNav } from './buttons';
import { CloseIcon } from './closeIcon';
import { colours, HEIGHT, WIDTH } from './theme';

const EDGE = 16;
const RADIUS = 12;
/** Gap between the popover and the thing it points at; the tail spans it. */
const TAIL = 14;
/** Half the tail's base. */
const TAIL_HALF = 12;
const GROW_MS = 220;
/** How far in from the popover's corner the close icon's centre sits. */
const CLOSE_INSET = 4;

/** What a popover points at: a centre point and the half-size to keep clear of. */
export interface PopoverAnchor {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

export interface PopoverOptions {
  w: number;
  h: number;
  anchor: PopoverAnchor;
  depth: number;
  /** Screen-reader label for the red × close icon. */
  closeLabel: string;
  /** Called after the popover is gone, e.g. to give focus back to the main nav. */
  onClose: () => void;
  /** Grow in from the anchor (false when reopening in place). */
  animate?: boolean;
}

export interface Popover {
  /** Holds the content. Its origin is the anchor, so place content at `x0`/`y0` + offsets. */
  layer: Phaser.GameObjects.Container;
  /** The popover's own keyboard nav for the caller's buttons. */
  nav: FocusNav;
  x0: number;
  y0: number;
  close: () => void;
  /** Call once the content is in: puts the close icon on top and last in the focus order. */
  finish: () => void;
}

/**
 * A compact window that grows out of the thing it's about, with a tail pointing at it
 * and a round red × on its top-right corner: above the anchor if it fits, else below,
 * else beside it, kept on screen. Escape, the × and clicking outside close it. It
 * doesn't dim the screen. Callers add their content to `layer` and their buttons to `nav`,
 * then call `finish()`.
 */
export function openPopover(scene: Phaser.Scene, opts: PopoverOptions): Popover {
  const { w, h, anchor } = opts;
  const nav = new FocusNav(scene);
  // Built around the anchor, so the popover can grow out of it.
  const layer = scene.add.container(anchor.x, anchor.y).setDepth(opts.depth);
  // Clicking anywhere outside the popover closes it. Invisible: the picture stays undimmed.
  const blocker = scene.add
    .rectangle(0, 0, WIDTH, HEIGHT, 0x000000, 0.001)
    .setOrigin(0)
    .setInteractive()
    .setDepth(opts.depth - 1);
  const close = () => {
    nav.destroy();
    layer.destroy();
    blocker.destroy();
    opts.onClose();
  };
  blocker.on('pointerdown', close);
  nav.onCancel = close;

  const reachX = anchor.rx + TAIL;
  const reachY = anchor.ry + TAIL;
  let side: 'above' | 'below' | 'left' | 'right';
  if (anchor.y - reachY - h >= EDGE) side = 'above';
  else if (anchor.y + reachY + h <= HEIGHT - EDGE) side = 'below';
  else if (anchor.x + reachX + w <= WIDTH - EDGE) side = 'right';
  else side = 'left';
  const clampX = (x: number) => Phaser.Math.Clamp(x, EDGE, WIDTH - EDGE - w);
  const clampY = (y: number) => Phaser.Math.Clamp(y, EDGE, HEIGHT - EDGE - h);
  const bx = side === 'right' ? anchor.x + reachX : side === 'left' ? anchor.x - reachX - w : clampX(anchor.x - w / 2);
  const by = side === 'above' ? anchor.y - reachY - h : side === 'below' ? anchor.y + reachY : clampY(anchor.y - h / 2);
  // Everything below is relative to the anchor (the layer's origin).
  const x0 = bx - anchor.x;
  const y0 = by - anchor.y;

  const g = scene.add.graphics();
  g.fillStyle(colours.panel).fillRoundedRect(x0, y0, w, h, RADIUS);
  g.lineStyle(3, colours.focus).strokeRoundedRect(x0, y0, w, h, RADIUS);
  // The tail, from the popover's edge to the anchor's edge.
  const T = TAIL_HALF;
  const tipX = anchor.rx + 2;
  const tipY = anchor.ry + 2;
  const tail =
    side === 'above'
      ? [-T, y0 + h - 2, T, y0 + h - 2, 0, -tipY]
      : side === 'below'
        ? [-T, y0 + 2, T, y0 + 2, 0, tipY]
        : side === 'right'
          ? [x0 + 2, -T, x0 + 2, T, tipX, 0]
          : [x0 + w - 2, -T, x0 + w - 2, T, -tipX, 0];
  g.fillStyle(colours.panel).fillTriangle(tail[0]!, tail[1]!, tail[2]!, tail[3]!, tail[4]!, tail[5]!);
  g.lineStyle(3, colours.focus).lineBetween(tail[0]!, tail[1]!, tail[4]!, tail[5]!).lineBetween(tail[4]!, tail[5]!, tail[2]!, tail[3]!);
  // Swallow clicks on the popover itself so they don't reach the blocker.
  const hitArea = scene.add.rectangle(x0, y0, w, h, 0xffffff, 0.001).setOrigin(0).setInteractive();
  layer.add([hitArea, g]);

  // The red × sits on the top-right corner.
  const closeIcon = new CloseIcon(scene, x0 + w - CLOSE_INSET, y0 + CLOSE_INSET, close, opts.closeLabel);
  layer.add(closeIcon);
  const finish = () => {
    layer.bringToTop(closeIcon);
    nav.add(closeIcon);
  };

  if (opts.animate ?? true) {
    layer.setScale(0).setAlpha(0);
    scene.tweens.add({ targets: layer, scale: 1, alpha: 1, duration: GROW_MS, ease: 'Back.easeOut' });
  }
  return { layer, nav, x0, y0, close, finish };
}
