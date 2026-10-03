import * as Phaser from 'phaser';
import { colours, MARGIN, text, WIDTH } from './theme';

export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number): Phaser.GameObjects.Rectangle {
  return scene.add.rectangle(x, y, w, h, colours.panel).setOrigin(0).setStrokeStyle(2, colours.panelEdge);
}

export function heading(scene: Phaser.Scene, title: string, subtitle?: string): void {
  scene.add.text(MARGIN, MARGIN, title, text.h1);
  if (subtitle) scene.add.text(MARGIN, MARGIN + 46, subtitle, { ...text.small, wordWrap: { width: WIDTH - MARGIN * 2 } });
}

/** A text box that wraps to its width; returns the Text so callers can update it. */
export function textBlock(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  content: string,
  style: Phaser.Types.GameObjects.Text.TextStyle = text.body,
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, content, { ...style, wordWrap: { width } });
}
