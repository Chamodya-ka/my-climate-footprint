import * as Phaser from 'phaser';
import { colours } from './theme';

/** HUD icons, drawn in code and baked into textures at boot. */
export const ICON_SIZE = 32;

export type IconKey = 'icon-footprint' | 'icon-bank' | 'icon-house' | 'icon-repair';

/** Matches the HUD panel, so the wrench jaw reads as a gap. */
const PANEL = colours.panel;

function drawFootprint(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x8fe3a6);
  g.fillEllipse(16, 21, 14, 18); // sole
  g.fillEllipse(16, 29, 10, 6); // heel
  [
    [9, 8, 4.2],
    [14, 5, 3.4],
    [19, 5, 3],
    [23, 7, 2.6],
    [26, 10, 2.2],
  ].forEach(([x, y, r]) => g.fillCircle(x!, y!, r!));
}

function drawBank(g: Phaser.GameObjects.Graphics): void {
  // A stack of three coins.
  for (let i = 0; i < 3; i++) {
    const y = 24 - i * 7;
    g.fillStyle(0xc99a2e).fillRect(5, y, 22, 5);
    g.fillStyle(0xc99a2e).fillEllipse(16, y + 5, 22, 7);
    g.fillStyle(0xffd166).fillEllipse(16, y, 22, 7);
  }
}

function drawHouse(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0xd9eef5).fillRect(7, 15, 18, 14);
  g.fillStyle(0xe07a5f).fillTriangle(3, 16, 16, 4, 29, 16);
  g.fillStyle(0x5b3a22).fillRect(14, 21, 5, 8);
}

function drawRepair(g: Phaser.GameObjects.Graphics): void {
  // A wrench: diagonal handle with an open jaw at the top right.
  g.lineStyle(6, 0xb8c4cc).lineBetween(7, 26, 21, 12);
  g.fillStyle(0xb8c4cc).fillCircle(22, 10, 8);
  g.fillStyle(PANEL).fillCircle(25, 7, 4);
  g.fillStyle(0xb8c4cc).fillCircle(7, 26, 3.5);
}

const DRAWERS: Record<IconKey, (g: Phaser.GameObjects.Graphics) => void> = {
  'icon-footprint': drawFootprint,
  'icon-bank': drawBank,
  'icon-house': drawHouse,
  'icon-repair': drawRepair,
};

export function makeIconTextures(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  for (const [key, draw] of Object.entries(DRAWERS)) {
    g.clear();
    draw(g);
    g.generateTexture(key, ICON_SIZE, ICON_SIZE);
  }
  g.destroy();
}
