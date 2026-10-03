import * as Phaser from 'phaser';

/** Six-sided die faces, drawn in code and baked into textures at boot. The dice are cosmetic. */
export const DIE_SIZE = 72;
export const dieKey = (face: number) => `die-${face}`;

const PIP = 6;
const INSET = 18;
const RADIUS = 12;

/** Pip positions per face, as fractions across the die (0 = inset edge, 1 = far inset edge). */
const FACES: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [
    [0, 0],
    [1, 1],
  ],
  3: [
    [0, 0],
    [0.5, 0.5],
    [1, 1],
  ],
  4: [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ],
  5: [
    [0, 0],
    [1, 0],
    [0.5, 0.5],
    [0, 1],
    [1, 1],
  ],
  6: [
    [0, 0],
    [1, 0],
    [0, 0.5],
    [1, 0.5],
    [0, 1],
    [1, 1],
  ],
};

export function makeDiceTextures(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const span = DIE_SIZE - INSET * 2;
  for (const [face, pips] of Object.entries(FACES)) {
    g.clear();
    g.fillStyle(0xffffff).fillRoundedRect(2, 2, DIE_SIZE - 4, DIE_SIZE - 4, RADIUS);
    g.lineStyle(3, 0x26344a).strokeRoundedRect(2, 2, DIE_SIZE - 4, DIE_SIZE - 4, RADIUS);
    g.fillStyle(0x26344a);
    for (const [fx, fy] of pips) g.fillCircle(INSET + fx * span, INSET + fy * span, PIP);
    g.generateTexture(dieKey(Number(face)), DIE_SIZE, DIE_SIZE);
  }
  g.destroy();
}
