import * as Phaser from 'phaser';
import type { House } from '../data/schemas';
// The designer's animation, used as-is. It's a classic script that defines window.HouseTransitions.
import '../../assets/map/disaster_assets/animation/house-transitions.js';
import { backgroundKey, getAmbientAssets, getHouseArt, REPAIR_ICON, spriteKey, type AmbientAssets, type DamageLevel } from './houseAssets';
import { placeStage, STAGE, type ArtBox, type StagePlacement } from './houseArt';

export type TransitionType = 'flood' | 'landslip' | 'repair';

interface TransitionAssets extends Partial<AmbientAssets> {
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
  /** `ams` is the moving background's clock (ms); it keeps clouds and cars moving through a transition. */
  frame(type: TransitionType, t: number, from: DamageLevel, to: DamageLevel, ams?: number): void;
  reduced: boolean;
  ambient: boolean;
  ctx: CanvasRenderingContext2D;
  // Building blocks of a still frame, used to draw the moving background in two layers
  // so the mod overlays can sit between them. `mix` is 0 for the normal scene, 1 after a disaster.
  scenery(mix: number, ams: number): void;
  traffic(mix: number, ams: number): void;
  fg(alpha: number): void;
  rain(intensity: number, ms: number): void;
}

interface HouseTransitionsClass {
  new (
    canvas: HTMLCanvasElement,
    assets: TransitionAssets,
    options?: { reducedMotion?: boolean; ambient?: boolean; seed?: number },
  ): HouseTransitionsInstance;
  DURATION: Record<TransitionType, number>;
}

declare global {
  interface Window {
    HouseTransitions: HouseTransitionsClass;
  }
}

/** With reduced motion, the designer's animations run at this fraction of their length. */
const REDUCED_SPEED = 0.35;
/** Picks where the clouds and cars start; the same for every house so scenes match between screens. */
const AMBIENT_SEED = 3;
/** The moving background is redrawn at most this often (ms); it moves slowly, and each redraw re-uploads the stage. */
const AMBIENT_FRAME_MS = 1000 / 30;
/** Light rain over a damaged house's moving background (the designer's still-frame value). */
const POST_RAIN = 0.35;
let counter = 0;

/** One clock for every moving background and transition, so a transition picks up the clouds where the backdrop left them. */
const ambientClock = (scene: Phaser.Scene, ht: HouseTransitionsInstance) => (ht.reduced ? 0 : scene.game.loop.time);

function transitionAssets(scene: Phaser.Scene, houseDef: House, region: string): TransitionAssets {
  const img = (key: string) => scene.textures.get(key).getSourceImage() as HTMLImageElement;
  const art = getHouseArt(houseDef.sprite);
  return {
    region,
    bgNormal: img(backgroundKey(houseDef.sprite, 'normal')),
    bgPost: img(backgroundKey(houseDef.sprite, 'post')),
    fgPost: art.hasForeground ? img(backgroundKey(houseDef.sprite, 'post_fg')) : null,
    sprite: img(spriteKey(houseDef.sprite, 0)),
    damaged: { 1: img(spriteKey(houseDef.sprite, 1)), 2: img(spriteKey(houseDef.sprite, 2)) },
    repairIcon: img(REPAIR_ICON),
    slipPath: art.slipPath,
    ...getAmbientAssets(scene, houseDef.sprite),
  };
}

/** A stage-sized canvas texture shown at the stage's place on screen, drawn by its own HouseTransitions. */
function stageCanvas(scene: Phaser.Scene, assets: TransitionAssets, stage: StagePlacement) {
  const key = `house-transition-${++counter}`;
  const tex = scene.textures.createCanvas(key, STAGE.w, STAGE.h)!;
  const ht = new window.HouseTransitions(tex.getSourceImage() as HTMLCanvasElement, assets, { ambient: true, seed: AMBIENT_SEED });
  const image = scene.add.image(stage.x, stage.y, key).setOrigin(0).setScale(stage.scale);
  return { key, tex, ht, image };
}

export interface HouseTransition {
  image: Phaser.GameObjects.Image;
  /** Plays an animation, resolving with the damage level it ends on. */
  play(type: TransitionType, from: DamageLevel, to: DamageLevel): Promise<DamageLevel>;
  destroy(): void;
}

/**
 * Puts the designer's flood / landslip / repair animation on screen for one house,
 * drawn to a canvas texture laid out on the same stage as the static house art.
 * If the house's moving-background layers are loaded, the scenery keeps moving underneath.
 */
export function createHouseTransition(
  scene: Phaser.Scene,
  houseDef: House,
  box: ArtBox,
  region: string,
  level: DamageLevel,
): HouseTransition {
  const { key, tex, ht, image } = stageCanvas(scene, transitionAssets(scene, houseDef, region), placeStage(box));
  ht.drawStatic(level);
  tex.refresh();

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
            ht.frame(type, tw.getValue() ?? 0, from, to, ht.ambient ? ambientClock(scene, ht) : undefined);
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

export interface LiveBackdrop {
  /** Sky, clouds, birds, terrain, boats and distant cars: goes behind the house sprite. */
  back: Phaser.GameObjects.Image;
  /** Cars on the street, flood water left behind and rain: goes over the house and its overlays. */
  front: Phaser.GameObjects.Image;
}

/**
 * The house's moving background (the designer's ambient mode), in two layers so the house
 * sprite and mod overlays can sit between them. Returns null if the house's layers aren't
 * loaded (see preloadAmbient), so callers can fall back to the still pictures.
 * Both layers redraw on the scene's update and clean up when destroyed.
 */
export function createLiveBackdrop(
  scene: Phaser.Scene,
  houseDef: House,
  region: string,
  level: DamageLevel,
  stage: StagePlacement,
): LiveBackdrop | null {
  const assets = transitionAssets(scene, houseDef, region);
  if (!assets.bgNormalBase) return null;
  const back = stageCanvas(scene, assets, stage);
  const front = stageCanvas(scene, assets, stage);
  const mix = level > 0 ? 1 : 0;
  // Only riverside streets have cars in front of the house, and only a damaged house has rain.
  const frontMoves = region === 'riverside' || level > 0;

  const draw = (drawFront: boolean) => {
    const ams = ambientClock(scene, back.ht);
    back.ht.ctx.clearRect(0, 0, STAGE.w, STAGE.h);
    back.ht.scenery(mix, ams);
    back.tex.refresh();
    if (!drawFront) return;
    const f = front.ht;
    f.ctx.clearRect(0, 0, STAGE.w, STAGE.h);
    f.traffic(mix, ams);
    if (level > 0) {
      f.fg(1);
      f.rain(POST_RAIN, ams);
    }
    front.tex.refresh();
  };
  draw(true);

  let last = scene.game.loop.time;
  const update = (time: number) => {
    if (time - last < AMBIENT_FRAME_MS) return;
    last = time;
    draw(frontMoves);
  };
  // With reduced motion the scene stays still, so it's drawn once.
  if (!back.ht.reduced) scene.events.on(Phaser.Scenes.Events.UPDATE, update);

  // Destroying either layer (or the scene shutting down) removes both, the redraw and the textures.
  let destroyed = false;
  const cleanup = (source: Phaser.GameObjects.Image) => {
    if (destroyed) return;
    destroyed = true;
    scene.events.off(Phaser.Scenes.Events.UPDATE, update);
    const textures = scene.textures;
    for (const layer of [back, front]) if (layer.image !== source && layer.image.scene) layer.image.destroy();
    // After the image being destroyed has finished with its texture.
    queueMicrotask(() => [back, front].forEach((layer) => textures.remove(layer.key)));
  };
  back.image.once(Phaser.GameObjects.Events.DESTROY, cleanup);
  front.image.once(Phaser.GameObjects.Events.DESTROY, cleanup);
  return { back: back.image, front: front.image };
}
