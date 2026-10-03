import * as Phaser from 'phaser';
import type { GameData, House, Spot } from '../data/schemas';
import { getArea, getHouse, type HouseState } from '../sim/state';
import { getZones, spriteKey, type HouseZones } from './houseAssets';
import { colours, FONT, HEIGHT, WIDTH } from './theme';

/*
 * A house scene: a code-drawn backdrop (sky, region scenery, ground) with the
 * house sprite from assets/map/house_and_region_assets on top. Mod overlays,
 * damage and the "+" markers are placed from the sprite's measured zones
 * (door, foundation, garden, walls), so they fit any house.
 * Each overlay also gets a small text tag so mods aren't shown by colour alone.
 */

export interface ArtBox {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Ground line as a fraction of the box height (default 0.78). */
  groundFrac?: number;
}

/** The whole canvas, with the ground line just above the House scene's bottom buttons. */
export const FULL_SCREEN_ART: ArtBox = { x: 0, y: 0, w: WIDTH, h: HEIGHT, groundFrac: 0.59 };

/** How much of the space above the ground the house may fill, and of the box width. */
const MAX_HEIGHT_FRAC = 0.72;
const MAX_WIDTH_FRAC = 0.8;
/** Height of the foundation-improvement band, in sprite pixels. */
const FOUNDATION_BAND = 50;

/** Ground level within the box, for effects (floodwater rises to here and above). */
export function groundY(box: ArtBox): number {
  return box.y + box.h * (box.groundFrac ?? 0.78);
}

/** Where the backdrop's slope is (Hills only), for slip debris. */
export function slopeTop(box: ArtBox): { x: number; y: number } {
  // A point part-way up the slope line, from (0.55w, ground) to (w, 0.15h), clear of the corner HUD box.
  const ground = groundY(box);
  const peak = box.y + box.h * 0.15;
  const t = 0.55;
  return { x: box.x + box.w * (0.55 + 0.45 * t), y: ground - (ground - peak) * t };
}

export interface SpritePlacement {
  zones: HouseZones;
  /** Scale from sprite pixels to screen pixels. */
  s: number;
  /** Screen position of sprite pixel (0, 0). */
  ox: number;
  oy: number;
  /** Sprite pixel → screen. */
  at: (x: number, y: number) => { x: number; y: number };
}

/** Fits the house sprite into the box with its foundation line on the ground. */
export function placeSprite(box: ArtBox, houseDef: House): SpritePlacement {
  const zones = getZones(houseDef.sprite);
  const { content } = zones;
  const footY = zones.zones.foundation.y + zones.zones.foundation.h;
  const ground = groundY(box);
  const s = Math.min(((ground - box.y) * MAX_HEIGHT_FRAC) / (footY - content.y), (box.w * MAX_WIDTH_FRAC) / content.w);
  const ox = box.x + box.w / 2 - (content.x + content.w / 2) * s;
  const oy = ground - footY * s;
  return { zones, s, ox, oy, at: (x, y) => ({ x: ox + x * s, y: oy + y * s }) };
}

/** Screen positions of the upgrade "+" markers, one per zone that has mods. */
export function spotPositions(box: ArtBox, houseDef: House): Record<Spot, { x: number; y: number }> {
  const { zones, at } = placeSprite(box, houseDef);
  const { door, foundation, garden } = zones.zones;
  return {
    door: at(door.cx, door.cy),
    // Off-centre so the three markers don't stack on the doorway.
    foundation: at(foundation.x + foundation.w * 0.22, foundation.cy),
    garden: at(garden.x + garden.w * 0.86, garden.cy),
  };
}

function drawScenery(g: Phaser.GameObjects.Graphics, data: GameData, houseDef: House, box: ArtBox): void {
  const area = getArea(data, houseDef.areaId);
  const ground = groundY(box);
  g.fillStyle(colours.sky).fillRect(box.x, box.y, box.w, box.h);
  if (area.regionId === 'coastal') {
    g.fillStyle(colours.water).fillRect(box.x, ground - 30, box.w * 0.3, box.h - (ground - 30 - box.y));
    g.fillStyle(0xe8d9a8).fillRect(box.x + box.w * 0.3, ground - 6, box.w * 0.12, box.h - (ground - 6 - box.y));
  } else if (area.id === 'city-centre') {
    g.fillStyle(0x6b7f8e);
    [0.02, 0.12, 0.8, 0.9].forEach((fx, i) =>
      g.fillRect(box.x + box.w * fx, ground - box.h * (0.17 + i * 0.02), box.w * 0.08, box.h * (0.17 + i * 0.02)),
    );
  } else if (area.id === 'river-valley') {
    g.fillStyle(0x4f7a3c).fillTriangle(box.x, ground, box.x + box.w * 0.4, box.y + box.h * 0.35, box.x + box.w * 0.8, ground);
    // The river runs across the valley floor behind the house.
    g.fillStyle(colours.grass).fillRect(box.x, ground - box.h * 0.04, box.w, box.h * 0.04);
    g.fillStyle(colours.water).fillRect(box.x, ground - box.h * 0.033, box.w, box.h * 0.02);
  }
  if (area.regionId === 'hills') {
    g.fillStyle(colours.soil).fillTriangle(box.x + box.w * 0.55, ground, box.x + box.w, box.y + box.h * 0.15, box.x + box.w, ground);
    g.fillStyle(colours.grass).fillTriangle(box.x + box.w * 0.6, ground - 4, box.x + box.w, box.y + box.h * 0.2, box.x + box.w, ground - 4);
  }
  const grassFrom = area.regionId === 'coastal' ? box.w * 0.42 : 0;
  g.fillStyle(colours.grass).fillRect(box.x + grassFrom, ground, box.w - grassFrom, box.h - (ground - box.y));
}

export function drawHouseScene(
  scene: Phaser.Scene,
  data: GameData,
  houseDef: House,
  house: HouseState | null,
  box: ArtBox,
): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const back = scene.add.graphics();
  c.add(back);
  drawScenery(back, data, houseDef, box);

  const p = placeSprite(box, houseDef);
  const { zones, s, at } = p;
  const sprite = scene.add.image(p.ox, p.oy, spriteKey(houseDef.sprite)).setOrigin(0).setScale(s);
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

  if (house?.destroyed) {
    sprite.setAlpha(0.35).setTint(0x8a7a6a);
    g.fillStyle(0x7a6450);
    for (let i = 0; i < 12; i++) {
      const r = at(wall.x + (wall.w * (i + 0.5)) / 12, footY);
      g.fillRect(r.x - px(40), r.y - px(30 + (i % 3) * 30), px(80), px(30 + (i % 3) * 30));
    }
    const mid = at(wall.x + wall.w / 2, wall.y + wall.h / 2);
    tag(mid.x, mid.y, 'Destroyed');
    return c;
  }

  if (house && house.value < house.fullValue) {
    // A zig-zag down the lower walls, left of the door, so it stays on the house on every sprite.
    const crackTop = wall.y + wall.h * 0.35;
    const crackX = (door.x + wall.x) / 2;
    const pts = [
      [0.02, 0],
      [-0.03, 0.35],
      [0.04, 0.65],
      [-0.01, 1],
    ].map(([fx, fy]) => at(crackX + wall.w * fx!, crackTop + (wallBottom - crackTop) * fy!));
    g.lineStyle(px(8), 0x222222);
    g.beginPath();
    pts.forEach((q, i) => (i === 0 ? g.moveTo(q.x, q.y) : g.lineTo(q.x, q.y)));
    g.strokePath();
    const top = at(crackX, crackTop);
    tag(top.x, top.y - 14, 'Damaged');
  }

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
  return c;
}

/** The player's house as a full-screen background, behind every other object in the scene. */
export function drawBackdrop(scene: Phaser.Scene, data: GameData, house: HouseState | null): void {
  if (!house) return;
  drawHouseScene(scene, data, getHouse(data, house.houseId), house, FULL_SCREEN_ART).setDepth(-10);
}
