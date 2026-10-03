import * as Phaser from 'phaser';
import { prefersReducedMotion } from './a11y';
import { WIDTH } from './theme';

/*
 * Soft cloud silhouettes drifting over the Title screen's map. They part to either
 * side when the game starts, as if flying down into the valley.
 */

/** A cloud outline in a 100×60 box: puffs (x, y, radius) on a flat, rounded base. */
interface CloudShape {
  puffs: [number, number, number][];
}
const SHAPES: CloudShape[] = [
  { puffs: [[20, 40, 16], [40, 26, 22], [62, 30, 19], [80, 42, 14]] },
  { puffs: [[18, 42, 13], [34, 30, 18], [54, 22, 22], [74, 34, 16], [86, 44, 10]] },
  { puffs: [[24, 36, 18], [48, 30, 20], [72, 38, 16]] },
];
const UNIT = { w: 100, h: 60 };
/** Shapes are baked this many times larger than their unit box, so they stay smooth however big they're shown. */
const BAKE = 8;
/** The flat base: top edge and corner radius, in unit coordinates. */
const BASE_TOP = 38;
const BASE_RADIUS = 10;
const BASE_INSET = 6;

const shapeKey = (i: number) => `title-cloud-${i}`;

function bakeShapes(scene: Phaser.Scene): void {
  if (scene.textures.exists(shapeKey(0))) return;
  const g = scene.add.graphics();
  SHAPES.forEach((shape, i) => {
    g.clear().fillStyle(0xffffff);
    for (const [x, y, r] of shape.puffs) g.fillCircle(x * BAKE, y * BAKE, r * BAKE);
    g.fillRoundedRect(BASE_INSET * BAKE, BASE_TOP * BAKE, (UNIT.w - BASE_INSET * 2) * BAKE, (UNIT.h - BASE_TOP) * BAKE, BASE_RADIUS * BAKE);
    g.generateTexture(shapeKey(i), UNIT.w * BAKE, UNIT.h * BAKE);
  });
  g.destroy();
}

/** One cloud: where it starts, its width on screen, drift speed (px/s) and opacity. Further-away clouds are smaller, slower and fainter. */
interface CloudSpec {
  x: number;
  y: number;
  w: number;
  speed: number;
  alpha: number;
}
const CLOUDS: CloudSpec[] = [
  { x: 60, y: 40, w: 300, speed: 9, alpha: 0.28 },
  { x: 720, y: 90, w: 240, speed: 7, alpha: 0.24 },
  { x: 1050, y: 30, w: 340, speed: 11, alpha: 0.3 },
  { x: 380, y: 180, w: 420, speed: 15, alpha: 0.34 },
  { x: -120, y: 460, w: 460, speed: 18, alpha: 0.36 },
  { x: 900, y: 520, w: 380, speed: 14, alpha: 0.32 },
  { x: 560, y: 600, w: 300, speed: 10, alpha: 0.26 },
];
/** Leaving: how long the clouds take to part, how much they grow as they go, and how fast reduced motion just fades them. */
const PART_MS = 1100;
const PART_GROW = 1.6;
const FADE_MS = 300;

export interface TitleClouds {
  /** Moves the clouds out to either side (or fades them, with reduced motion); resolves when they're gone. */
  part(): Promise<void>;
}

export function addTitleClouds(scene: Phaser.Scene, depth: number): TitleClouds {
  bakeShapes(scene);
  const reduced = prefersReducedMotion();
  const clouds = CLOUDS.map((spec, i) => {
    const img = scene.add.image(spec.x, spec.y, shapeKey(i % SHAPES.length)).setOrigin(0).setAlpha(spec.alpha).setDepth(depth);
    img.setScale(spec.w / (UNIT.w * BAKE));
    return { img, spec };
  });

  let drifting = !reduced;
  const drift = (_time: number, delta: number) => {
    if (!drifting) return;
    for (const { img, spec } of clouds) {
      img.x += (spec.speed * delta) / 1000;
      if (img.x > WIDTH) img.x = -img.displayWidth; // round again from the left
    }
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, drift);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, drift));

  return {
    part() {
      drifting = false;
      return new Promise((resolve) => {
        if (reduced) {
          scene.tweens.add({ targets: clouds.map((c) => c.img), alpha: 0, duration: FADE_MS, onComplete: () => resolve() });
          return;
        }
        clouds.forEach(({ img }, i) => {
          // Each cloud leaves by the nearer side, growing as if the view were flying through it.
          const centre = img.x + img.displayWidth / 2;
          const growW = img.displayWidth * PART_GROW;
          const toX = centre < WIDTH / 2 ? -growW : WIDTH + img.displayWidth * (PART_GROW - 1);
          scene.tweens.add({
            targets: img,
            x: toX,
            y: img.y - (img.displayHeight * (PART_GROW - 1)) / 2,
            scale: img.scale * PART_GROW,
            alpha: 0,
            duration: PART_MS,
            ease: 'Cubic.easeIn',
            onComplete: i === clouds.length - 1 ? () => resolve() : undefined,
          });
        });
      });
    },
  };
}
