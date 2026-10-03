import * as Phaser from 'phaser';
import type { GameData, House, Spot } from '../data/schemas';
import { getHouse, type HouseState } from '../sim/state';
import { backgroundKey, damageLevel, getHouseArt, getZones, spriteKey, type DamageLevel, type HouseZones } from './houseAssets';
import { FONT, HEIGHT, WIDTH } from './theme';

/*
 * A house scene, laid out like the designer's disaster assets: everything sits on
 * a 1600×1000 stage, drawn background → house sprite → (mod overlays) → foreground.
 * - Background: `_normal`, or `_post` once the house has unrepaired damage.
 * - Sprite: clean, `_dmg1` (one unrepaired hit) or `_dmg2` (two or more).
 * - Foreground (flood houses only): the water left behind, over the house.
 * Mod overlays and "+" markers are placed from the sprite's measured zones and
 * the designer's "+" positions. Each overlay has a small text tag so mods aren't
 * shown by colour alone.
 */

/** The designer's stage: backgrounds are 1600×1000, and the 1200×900 sprite sits centred at 94% of the stage height. */
export const STAGE = { w: 1600, h: 1000 };
const SPRITE_H = STAGE.h * 0.94;
const SPRITE_W = (SPRITE_H * 4) / 3;
export const SPRITE_ON_STAGE = { x: (STAGE.w - SPRITE_W) / 2, y: (STAGE.h - SPRITE_H) / 2, w: SPRITE_W, h: SPRITE_H };
const SPRITE_PX = { w: 1200, h: 900 };
/** Height of the foundation-improvement band, in sprite pixels. */
const FOUNDATION_BAND = 50;

export interface ArtBox {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 'cover' fills the box (cropping the stage's edges); 'contain' (default) shows the whole stage. */
  fit?: 'cover' | 'contain';
  /** Extra vertical shift of the stage, in screen pixels (negative moves it up). */
  shiftY?: number;
}

/**
 * The whole canvas, filled edge to edge. Shifted up so the cropped strip comes off the sky,
 * keeping the house and its garden clear of the buttons along the bottom.
 */
export const FULL_SCREEN_ART: ArtBox = { x: 0, y: 0, w: WIDTH, h: HEIGHT, fit: 'cover', shiftY: -40 };

export interface StagePlacement {
  /** Screen position of stage pixel (0, 0), and stage pixels → screen. */
  x: number;
  y: number;
  scale: number;
}

/** Where the 1600×1000 stage lands in the box. */
export function placeStage(box: ArtBox): StagePlacement {
  const fitScale = box.fit === 'cover' ? Math.max : Math.min;
  const scale = fitScale(box.w / STAGE.w, box.h / STAGE.h);
  return {
    x: box.x + (box.w - STAGE.w * scale) / 2,
    y: box.y + (box.h - STAGE.h * scale) / 2 + (box.shiftY ?? 0),
    scale,
  };
}

export interface SpritePlacement {
  zones: HouseZones;
  stage: StagePlacement;
  /** Scale from sprite pixels to screen pixels. */
  s: number;
  /** Screen position of sprite pixel (0, 0). */
  ox: number;
  oy: number;
  /** Sprite pixel → screen. */
  at: (x: number, y: number) => { x: number; y: number };
}

/** Places the house sprite on the stage, inside the box. */
export function placeSprite(box: ArtBox, houseDef: House): SpritePlacement {
  const stage = placeStage(box);
  const s = (SPRITE_ON_STAGE.w / SPRITE_PX.w) * stage.scale;
  const ox = stage.x + SPRITE_ON_STAGE.x * stage.scale;
  const oy = stage.y + SPRITE_ON_STAGE.y * stage.scale;
  return { zones: getZones(houseDef.sprite), stage, s, ox, oy, at: (x, y) => ({ x: ox + x * s, y: oy + y * s }) };
}

/** Screen positions of the upgrade "+" markers, from the designer's positions. */
export function spotPositions(box: ArtBox, houseDef: House): Record<Spot, { x: number; y: number }> {
  const { at } = placeSprite(box, houseDef);
  const { plus } = getHouseArt(houseDef.sprite);
  return { door: at(plus.door.x, plus.door.y), foundation: at(plus.foundation.x, plus.foundation.y), garden: at(plus.garden.x, plus.garden.y) };
}

/** The damage picture to show for a house: clean, one hit, or two or more. A destroyed house shows the worst. */
export function houseDamageLevel(house: HouseState | null): DamageLevel {
  if (!house) return 0;
  return house.destroyed ? 2 : damageLevel(house.unrepairedHits);
}

export function drawHouseScene(
  scene: Phaser.Scene,
  _data: GameData,
  houseDef: House,
  house: HouseState | null,
  box: ArtBox,
): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const p = placeSprite(box, houseDef);
  const { zones, s, at, stage } = p;
  const level = houseDamageLevel(house);
  const art = getHouseArt(houseDef.sprite);

  c.add(scene.add.image(stage.x, stage.y, backgroundKey(houseDef.sprite, level > 0 ? 'post' : 'normal')).setOrigin(0).setScale(stage.scale));
  const sprite = scene.add.image(p.ox, p.oy, spriteKey(houseDef.sprite, level)).setOrigin(0).setScale(s);
  c.add(sprite);
  const g = scene.add.graphics();
  c.add(g);

  const mods = new Set([...(house?.permanentMods ?? []), ...(house?.consumables ?? [])]);
  // Tags are hidden in small previews, where they'd cover the house.
  const showTags = s > 0.4;
  const tag = (x: number, y: number, label: string) => {
    if (!showTags) return;
    c.add(
      scene.add
        .text(x, y, label, { fontFamily: FONT, fontSize: '14px', color: '#10202b', backgroundColor: '#ffffffcc', padding: { x: 4, y: 2 } })
        .setOrigin(0.5),
    );
  };
  const px = (n: number) => Math.max(1, n * s); // sprite-pixel sizes → screen
  const { door, foundation, garden } = zones.zones;
  const wall = zones.wall;
  const footY = foundation.y + foundation.h;
  // On stilted and hillside houses the foundation runs far below the walls, so wall-mounted
  // overlays are anchored to the walls and door instead.
  const wallBottom = wall.y + wall.h;
  const doorBase = door.y + door.h;

  // Foundation zone.
  if (mods.has('elevate')) {
    g.fillStyle(0x6d5a48);
    const posts = 7;
    for (let i = 0; i < posts; i++) {
      const q = at(foundation.x + (foundation.w * (i + 0.5)) / posts, foundation.y);
      g.fillRect(q.x - px(9), q.y, px(18), px(foundation.h + 40));
    }
    const q = at(foundation.x, footY);
    tag(q.x - 40, q.y - px(foundation.h / 2), 'Elevated');
  }
  if (mods.has('foundation')) {
    // A concrete band just under the walls (the foundation zone can run far down a slope).
    const bandH = Math.min(foundation.h, FOUNDATION_BAND);
    const q = at(foundation.x - 10, foundation.y);
    g.fillStyle(0x9aa3ab).fillRect(q.x, q.y, px(foundation.w + 20), px(bandH));
    g.lineStyle(px(4), 0x4f5860).strokeRect(q.x, q.y, px(foundation.w + 20), px(bandH));
    const t = at(foundation.x + foundation.w / 2, foundation.y + bandH + 24);
    tag(t.x, t.y + 6, 'Foundation');
  }

  // Door zone.
  if (mods.has('seal-doors')) {
    const q = at(door.x - 8, door.y - 8);
    g.lineStyle(px(12), 0x222222).strokeRect(q.x, q.y, px(door.w + 16), px(door.h + 8));
    const t = at(door.cx, door.y);
    tag(t.x, t.y - 14, 'Sealed');
  }
  if (mods.has('sandbags')) {
    g.fillStyle(0xc9b27c).lineStyle(px(3), 0x7a6a48);
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 4; i++) {
        const q = at(door.x - 150 + i * 36 + row * 18, doorBase - 14 - row * 24);
        g.fillEllipse(q.x, q.y, px(40), px(24)).strokeEllipse(q.x, q.y, px(40), px(24));
      }
    }
    const t = at(door.x - 100, doorBase);
    tag(t.x, t.y + 14, 'Sandbags');
  }
  if (mods.has('store-food')) {
    const q = at(door.x + door.w + 30, doorBase - 60);
    g.fillStyle(0xb5884d).fillRect(q.x, q.y, px(60), px(48));
    g.lineStyle(px(4), 0x6b4a2b).strokeRect(q.x, q.y, px(60), px(48));
    tag(q.x + px(30), q.y - 12, 'Pantry');
  }

  // Garden zone: drains and the house's surroundings.
  if (mods.has('drainage')) {
    // A downpipe on the lower part of the right-hand wall, then a drain across the lawn.
    const top = at(wall.x + wall.w + 8, wall.y + wall.h * 0.45);
    const bottom = at(wall.x + wall.w + 8, Math.max(wallBottom, doorBase) + 10);
    const out = at(wall.x + wall.w + 110, Math.max(wallBottom, doorBase) + 30);
    g.lineStyle(px(12), 0x5a6b78).lineBetween(top.x, top.y, bottom.x, bottom.y).lineBetween(bottom.x, bottom.y, out.x, out.y);
    tag(out.x, out.y + 14, 'Drains');
  }
  if (mods.has('retaining-wall')) {
    const q = at(garden.x + 20, garden.y + garden.h * 0.15);
    g.fillStyle(0x8e8e8e).fillRect(q.x, q.y, px(40), px(garden.h * 0.7));
    g.lineStyle(px(4), 0x555555).strokeRect(q.x, q.y, px(40), px(garden.h * 0.7));
    tag(q.x + px(20), q.y - 12, 'Retaining wall');
  }
  if (mods.has('soil-nailing')) {
    g.fillStyle(0x333333);
    for (let i = 0; i < 8; i++) {
      const q = at(garden.x + 90 + (i % 4) * 60, garden.y + garden.h * (0.45 + Math.floor(i / 4) * 0.25));
      g.fillCircle(q.x, q.y, px(10));
    }
    const t = at(garden.x + 180, garden.y + garden.h * 0.3);
    tag(t.x, t.y, 'Soil nails');
  }
  if (mods.has('drainage-loose-soil')) {
    g.lineStyle(px(8), 0x5a6b78);
    for (let i = 0; i < 3; i++) {
      const a = at(garden.x + 80 + i * 90, garden.y + garden.h * 0.9);
      const b = at(garden.x + 150 + i * 90, garden.y + garden.h * 0.75);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
    const t = at(garden.x + 200, garden.y + garden.h * 0.95);
    tag(t.x, t.y + 8, 'Slope drains');
  }
  if (mods.has('plant-trees')) {
    for (const fx of [0.13, 0.97]) {
      const base = at(garden.x + garden.w * fx, garden.y + garden.h * 0.3);
      g.fillStyle(0x6b4a2b).fillRect(base.x - px(10), base.y - px(110), px(20), px(110));
      g.fillStyle(0x2e6b34).fillCircle(base.x, base.y - px(140), px(55));
      g.lineStyle(px(4), 0x1f4a24).strokeCircle(base.x, base.y - px(140), px(55));
    }
    const t = at(garden.x + garden.w * 0.13, garden.y + garden.h * 0.3);
    tag(t.x, t.y - px(220), 'Trees');
  }

  // Flood water left behind sits over the house and its overlays.
  if (level > 0 && art.hasForeground) {
    c.add(scene.add.image(stage.x, stage.y, backgroundKey(houseDef.sprite, 'post_fg')).setOrigin(0).setScale(stage.scale));
  }
  if (house?.destroyed) {
    sprite.setTint(0x9a8a7a);
    const mid = at(wall.x + wall.w / 2, wall.y + wall.h / 2);
    tag(mid.x, mid.y, 'Destroyed');
  }
  return c;
}

/** The player's house as a full-screen background, behind every other object in the scene. */
export function drawBackdrop(scene: Phaser.Scene, data: GameData, house: HouseState | null): void {
  if (!house) return;
  drawHouseScene(scene, data, getHouse(data, house.houseId), house, FULL_SCREEN_ART).setDepth(-10);
}
