import * as Phaser from 'phaser';
import type { House } from '../data/schemas';
// The designer's animation, used as-is. It's a classic script that defines window.HouseTransitions.
import '../../assets/map/disaster_assets/animation/house-transitions.js';
import { backgroundKey, getHouseArt, REPAIR_ICON, spriteKey, type DamageLevel } from './houseAssets';
import { placeStage, STAGE, type ArtBox } from './houseArt';

export type TransitionType = 'flood' | 'landslip' | 'repair';

interface TransitionAssets {
  region: string;
  bgNormal: CanvasImageSource;
  bgPost: CanvasImageSource;
  fgPost: CanvasImageSource | null;
  sprite: CanvasImageSource;
  damaged: Record<1 | 2, CanvasImageSource>;
  repairIcon?: CanvasImageSource;
  slipPath?: [number, number][] | null;
}

interface HouseTransitionsInstance {
  drawStatic(level: DamageLevel): void;
  frame(type: TransitionType, t: number, from: DamageLevel, to: DamageLevel): void;
  reduced: boolean;
}

interface HouseTransitionsClass {
  new (canvas: HTMLCanvasElement, assets: TransitionAssets, options?: { reducedMotion?: boolean }): HouseTransitionsInstance;
  DURATION: Record<TransitionType, number>;
}

declare global {
  interface Window {
    HouseTransitions: HouseTransitionsClass;
  }
}

/** With reduced motion, the designer's animations run at this fraction of their length. */
const REDUCED_SPEED = 0.35;
let counter = 0;

export interface HouseTransition {
  image: Phaser.GameObjects.Image;
  /** Plays an animation, resolving with the damage level it ends on. */
  play(type: TransitionType, from: DamageLevel, to: DamageLevel): Promise<DamageLevel>;
  destroy(): void;
}

/**
 * Puts the designer's flood / landslip / repair animation on screen for one house,
 * drawn to a canvas texture laid out on the same stage as the static house art.
 */
export function createHouseTransition(
  scene: Phaser.Scene,
  houseDef: House,
  box: ArtBox,
  region: string,
  level: DamageLevel,
): HouseTransition {
  const img = (key: string) => scene.textures.get(key).getSourceImage() as HTMLImageElement;
  const art = getHouseArt(houseDef.sprite);
  const key = `house-transition-${++counter}`;
  const tex = scene.textures.createCanvas(key, STAGE.w, STAGE.h)!;
  const ht = new window.HouseTransitions(tex.getSourceImage() as HTMLCanvasElement, {
    region,
    bgNormal: img(backgroundKey(houseDef.sprite, 'normal')),
    bgPost: img(backgroundKey(houseDef.sprite, 'post')),
    fgPost: art.hasForeground ? img(backgroundKey(houseDef.sprite, 'post_fg')) : null,
    sprite: img(spriteKey(houseDef.sprite, 0)),
    damaged: { 1: img(spriteKey(houseDef.sprite, 1)), 2: img(spriteKey(houseDef.sprite, 2)) },
    repairIcon: img(REPAIR_ICON),
    slipPath: art.slipPath,
  });
  ht.drawStatic(level);
  tex.refresh();
  const stage = placeStage(box);
  const image = scene.add.image(stage.x, stage.y, key).setOrigin(0).setScale(stage.scale);

  return {
    image,
    play(type, from, to) {
      const duration = window.HouseTransitions.DURATION[type] * (ht.reduced ? REDUCED_SPEED : 1);
      const final: DamageLevel = type === 'repair' ? 0 : to;
      return new Promise((resolve) => {
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration,
          onUpdate: (tw) => {
            ht.frame(type, tw.getValue() ?? 0, from, to);
            tex.refresh();
          },
          onComplete: () => {
            ht.drawStatic(final);
            tex.refresh();
            resolve(final);
          },
        });
      });
    },
    destroy() {
      image.destroy();
      scene.textures.remove(key);
    },
  };
}
