import * as Phaser from 'phaser';
import type { GameData, House, Spot } from '../data/schemas';
import { getArea, getHouse, type HouseState } from '../sim/state';
import { colours, FONT, HEIGHT, WIDTH } from './theme';

/*
 * Placeholder house art drawn in code. Final sprites will come from
 * tools/blender/house_sprites.py (house + one aligned overlay per mod).
 * Each overlay also gets a small text tag so mods aren't shown by colour alone.
 */

export interface ArtBox {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Ground line as a fraction of the box height (default 0.78). */
  groundFrac?: number;
  /** House height as a fraction of the box height (default 0.28). */
  houseFrac?: number;
}

/** The whole canvas, with the ground line just above the House scene's action dock. */
export const FULL_SCREEN_ART: ArtBox = { x: 0, y: 0, w: WIDTH, h: HEIGHT, groundFrac: 0.59, houseFrac: 0.24 };

const DOOR_X = 0.42;
const DOOR_W = 0.16;
const ELEVATE_LIFT = 34;

export interface HouseGeometry {
  hx: number;
  hy: number;
  hw: number;
  hh: number;
  /** Bottom of the house walls (raised when elevated). */
  base: number;
  lift: number;
}

/** Where the house sits in the box. Shared by the drawing and the "+" markers. */
export function houseGeometry(box: ArtBox, houseDef: House, house: HouseState | null): HouseGeometry {
  // Sized from the box height so the house keeps its shape in wide, full-screen boxes.
  const houseH = box.h * (box.houseFrac ?? 0.28);
  const townhouse = houseDef.style === 'townhouse';
  const hh = townhouse ? houseH * 1.5 : houseH;
  const hw = townhouse ? houseH * 1.3 : houseH * 1.8;
  const hx = box.x + box.w * 0.5 - hw / 2;
  const lift = house?.permanentMods.includes('elevate') ? ELEVATE_LIFT : 0;
  const base = groundY(box) - lift;
  return { hx, hy: base - hh, hw, hh, base, lift };
}

/** Screen positions of the upgrade "+" markers for each spot. */
export function spotPositions(box: ArtBox, houseDef: House, house: HouseState | null): Record<Spot, { x: number; y: number }> {
  const { hx, hy, hw, hh, base } = houseGeometry(box, houseDef, house);
  const ground = groundY(box);
  return {
    doors: { x: hx + hw * (DOOR_X + DOOR_W / 2), y: base - hh * 0.3 },
    inside: { x: hx + hw * 0.78, y: hy + hh * 0.32 },
    drains: { x: hx + hw + 22, y: hy + hh * 0.15 },
    foundations: { x: hx + hw * 0.22, y: base - 4 },
    garden: { x: box.x + box.w * 0.15, y: ground - 100 },
    slope: { x: box.x + box.w * 0.84, y: ground - 175 },
  };
}

/** Ground level within the box, for effects (floodwater rises to here and above). */
export function groundY(box: ArtBox): number {
  return box.y + box.h * (box.groundFrac ?? 0.78);
}

/** Where the slope is (Hills only), for slip debris. */
export function slopeTop(box: ArtBox): { x: number; y: number } {
  // A point part-way up the slope line, from (0.55w, ground) to (w, 0.15h), clear of the corner HUD box.
  const ground = groundY(box);
  const peak = box.y + box.h * 0.15;
  const t = 0.55;
  return { x: box.x + box.w * (0.55 + 0.45 * t), y: ground - (ground - peak) * t };
}

export function drawHouseScene(
  scene: Phaser.Scene,
  data: GameData,
  houseDef: House,
  house: HouseState | null,
  box: ArtBox,
): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  c.add(g);
  const area = getArea(data, houseDef.areaId);
  const ground = groundY(box);
  const mods = new Set([...(house?.permanentMods ?? []), ...(house?.consumables ?? [])]);
  const tag = (x: number, y: number, label: string) => {
    const t = scene.add
      .text(x, y, label, { fontFamily: FONT, fontSize: '14px', color: '#10202b', backgroundColor: '#ffffffcc', padding: { x: 4, y: 2 } })
      .setOrigin(0.5);
    c.add(t);
  };

  // Sky and backdrop by region.
  g.fillStyle(colours.sky).fillRect(box.x, box.y, box.w, box.h);
  if (area.regionId === 'coastal') {
    g.fillStyle(colours.water).fillRect(box.x, ground - 30, box.w * 0.3, box.h - (ground - 30 - box.y));
    g.fillStyle(0xe8d9a8).fillRect(box.x + box.w * 0.3, ground - 6, box.w * 0.12, box.h - (ground - 6 - box.y));
  } else if (area.id === 'city-centre') {
    g.fillStyle(0x6b7f8e);
    [0.02, 0.12, 0.8, 0.9].forEach((fx, i) => g.fillRect(box.x + box.w * fx, ground - 120 - i * 15, box.w * 0.08, 120 + i * 15));
  } else if (area.id === 'river-valley') {
    g.fillStyle(0x4f7a3c).fillTriangle(box.x, ground, box.x + box.w * 0.4, box.y + box.h * 0.35, box.x + box.w * 0.8, ground);
    // The river runs across the valley floor just behind the house.
    g.fillStyle(colours.grass).fillRect(box.x, ground - 30, box.w, 30);
    g.fillStyle(colours.water).fillRect(box.x, ground - 24, box.w, 14);
  }
  if (area.regionId === 'hills') {
    g.fillStyle(colours.soil).fillTriangle(box.x + box.w * 0.55, ground, box.x + box.w, box.y + box.h * 0.15, box.x + box.w, ground);
    g.fillStyle(colours.grass).fillTriangle(box.x + box.w * 0.6, ground - 4, box.x + box.w, box.y + box.h * 0.2, box.x + box.w, ground - 4);
  }
  const grassFrom = area.regionId === 'coastal' ? box.w * 0.42 : 0;
  g.fillStyle(colours.grass).fillRect(box.x + grassFrom, ground, box.w - grassFrom, box.h - (ground - box.y));


  // The house.
  const elevated = mods.has('elevate');
  const { hx, hy, hw, hh, base, lift } = houseGeometry(box, houseDef, house);

  if (elevated) {
    g.fillStyle(0x6d5a48);
    for (let i = 0; i < 4; i++) g.fillRect(hx + 8 + (i * (hw - 24)) / 3, base, 8, lift);
    tag(hx - 40, base + lift / 2, 'Elevated');
  }
  if (mods.has('foundation')) {
    g.fillStyle(0x9aa3ab).fillRect(hx - 6, base - 10, hw + 12, 14);
    tag(hx + hw / 2, base + 12 + lift, 'Foundation');
  }

  const destroyed = house?.destroyed ?? false;
  if (destroyed) {
    g.fillStyle(0x7a6450);
    for (let i = 0; i < 9; i++) g.fillRect(hx + (i * hw) / 9, base - 10 - (i % 3) * 8, hw / 8, 10 + (i % 3) * 8);
    tag(hx + hw / 2, hy + hh / 2, 'Destroyed');
    return c;
  }

  const wallColour = { bungalow: 0xf1e3c8, beachfront: 0xd9eef5, villa: 0xf5f0e6, townhouse: 0xc9b8a6, hillside: 0xe6d3b3 }[houseDef.style];
  g.fillStyle(wallColour).fillRect(hx, hy, hw, hh);
  g.lineStyle(3, 0x3a3a3a).strokeRect(hx, hy, hw, hh);
  g.fillStyle(0x8c3b2e).fillTriangle(hx - 14, hy, hx + hw / 2, hy - hh * 0.55, hx + hw + 14, hy);
  // Windows and door.
  g.fillStyle(0x9fd3f0);
  g.fillRect(hx + hw * 0.12, hy + hh * 0.2, hw * 0.2, hh * 0.25);
  g.fillRect(hx + hw * 0.68, hy + hh * 0.2, hw * 0.2, hh * 0.25);
  const doorX = hx + hw * DOOR_X;
  const doorW = hw * DOOR_W;
  g.fillStyle(0x5b3a22).fillRect(doorX, base - hh * 0.5, doorW, hh * 0.5);

  if (house && house.value < house.originalValue) {
    g.lineStyle(3, 0x222222);
    g.beginPath();
    g.moveTo(hx + hw * 0.7, hy + 4);
    g.lineTo(hx + hw * 0.62, hy + hh * 0.4);
    g.lineTo(hx + hw * 0.74, hy + hh * 0.6);
    g.lineTo(hx + hw * 0.66, hy + hh);
    g.strokePath();
    tag(hx + hw * 0.7, hy - 14, 'Damaged');
  }

  if (mods.has('seal-doors')) {
    g.lineStyle(4, 0x222222).strokeRect(doorX - 3, base - hh * 0.5 - 3, doorW + 6, hh * 0.5 + 3);
    g.fillStyle(0x444444).fillRect(doorX - 4, base - 16, doorW + 8, 16);
    tag(doorX + doorW / 2, base - hh * 0.5 - 16, 'Sealed');
  }
  if (mods.has('sandbags')) {
    g.fillStyle(0xc9b27c);
    for (let row = 0; row < 2; row++) for (let i = 0; i < 4; i++) g.fillEllipse(hx - 50 + i * 14 + row * 7, base - 6 - row * 10, 16, 10);
    tag(hx - 30, base - 36, 'Sandbags');
  }
  if (mods.has('store-food')) {
    g.fillStyle(0xb5884d).fillRect(hx + hw * 0.7, base - 22, 22, 18);
    tag(hx + hw * 0.7 + 11, base - 34, 'Pantry');
  }
  if (mods.has('drainage')) {
    g.lineStyle(5, 0x5a6b78).lineBetween(hx + hw + 4, hy, hx + hw + 4, base + 6);
    g.lineBetween(hx + hw + 4, base + 6, hx + hw + 40, base + 6);
    tag(hx + hw + 30, base + 22, 'Drains');
  }
  if (area.regionId === 'hills' || mods.has('retaining-wall') || mods.has('soil-nailing') || mods.has('drainage-loose-soil')) {
    const sx = box.x + box.w * 0.78;
    if (mods.has('retaining-wall')) {
      g.fillStyle(0x8e8e8e).fillRect(sx, ground - 70, 18, 70);
      tag(sx + 9, ground - 82, 'Retaining wall');
    }
    if (mods.has('soil-nailing')) {
      g.fillStyle(0x333333);
      for (let i = 0; i < 6; i++) g.fillCircle(sx + 36 + (i % 3) * 22, ground - 60 - Math.floor(i / 3) * 40 - (i % 3) * 22, 4);
      tag(sx + 60, ground - 150, 'Soil nails');
    }
    if (mods.has('drainage-loose-soil')) {
      g.lineStyle(3, 0x5a6b78);
      for (let i = 0; i < 3; i++) g.lineBetween(sx + 30 + i * 24, ground - 40 - i * 30, sx + 60 + i * 24, ground - 30 - i * 30);
      tag(sx + 80, ground - 20, 'Slope drains');
    }
  }
  if (mods.has('plant-trees')) {
    for (const tx of [box.x + box.w * 0.15, box.x + box.w * 0.88]) {
      g.fillStyle(0x6b4a2b).fillRect(tx - 4, ground - 40, 8, 40);
      g.fillStyle(0x2e6b34).fillCircle(tx, ground - 50, 22);
    }
    tag(box.x + box.w * 0.15, ground - 86, 'Trees');
  }
  return c;
}

/** The player's house as a full-screen background, behind every other object in the scene. */
export function drawBackdrop(scene: Phaser.Scene, data: GameData, house: HouseState | null): void {
  if (!house) return;
  drawHouseScene(scene, data, getHouse(data, house.houseId), house, FULL_SCREEN_ART).setDepth(-10);
}
