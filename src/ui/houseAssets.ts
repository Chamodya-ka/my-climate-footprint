import * as Phaser from 'phaser';
import { z } from 'zod';
import { SPOTS, type GameData, type House, type Spot } from '../data/schemas';
import assetHouses from '../../assets/map/house_and_region_assets/houses.json';
import rawZoomData from '../../assets/map/house_and_region_assets/zoom_data.json';
import rawDisasterHouses from '../../assets/map/disaster_assets/houses.json';
import repairIconUrl from '../../assets/map/disaster_assets/animation/repair_icon.png';
import { regionAtMap } from './regionMap';

/*
 * House art:
 * - assets/map/disaster_assets: house sprites (clean, one hit, two or more hits), per-house
 *   backgrounds (normal, after a disaster, and a flood-water foreground), "+" positions,
 *   landslip paths and the repair icon.
 * - assets/map/house_and_region_assets: zone masks and the zoomed region views.
 * - assets/map/mod_icons: an icon per upgrade, and the "+" icon.
 * At boot we measure each zone mask (door, foundation, garden, roof, walls) so overlays
 * can be placed on any house, and check every house has all its art.
 */

const ASSET_DIR = '../../assets/map/house_and_region_assets';
const zonesUrls = import.meta.glob('../../assets/map/house_and_region_assets/sprites/*_zones.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
const spriteUrls = import.meta.glob('../../assets/map/disaster_assets/sprites/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
const backgroundUrls = import.meta.glob('../../assets/map/disaster_assets/backgrounds/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
const modIconUrls = import.meta.glob('../../assets/map/mod_icons/png/*_128.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
const zoomUrls = import.meta.glob('../../assets/map/house_and_region_assets/zoom/*_clean.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/** Damage level shown: 0 clean (or just repaired), 1 one unrepaired hit, 2 two or more. */
export type DamageLevel = 0 | 1 | 2;
export const damageLevel = (unrepairedHits: number): DamageLevel => (unrepairedHits >= 2 ? 2 : unrepairedHits === 1 ? 1 : 0);
export const spriteKey = (sprite: string, level: DamageLevel = 0) => (level ? `house-${sprite}-dmg${level}` : `house-${sprite}`);
export type BackgroundKind = 'normal' | 'post' | 'post_fg';
export const backgroundKey = (sprite: string, kind: BackgroundKind) => `bg-${sprite}-${kind}`;
export const modIconKey = (icon: string) => `mod-icon-${icon}`;
export const PLUS_ICON = modIconKey('plus');
export const REPAIR_ICON = 'repair-icon';
const zonesKey = (sprite: string) => `zones-${sprite}`;
export const zoomKey = (mapRegion: string) => `zoom-${mapRegion}`;

const pinSchema = z.object({
  houseId: z.string(),
  mapX: z.number(),
  mapY: z.number(),
  x: z.number(),
  y: z.number(),
  spriteW: z.number().positive(),
  spriteH: z.number().positive(),
  anchorY: z.number(),
  contentTop: z.number(),
  tagBelow: z.boolean(),
});
const zoomSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  regions: z.record(
    z.string(),
    z.object({
      crop: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
      pins: z.array(pinSchema),
    }),
  ),
});
export type ZoomPin = z.infer<typeof pinSchema>;
export type ZoomData = z.infer<typeof zoomSchema>;

const point = z.tuple([z.number(), z.number()]);
const disasterHousesSchema = z.object({
  houses: z.array(
    z.object({
      id: z.string(),
      /** "+" positions per zone, in the 600×450 design units of the house SVGs (sprite pixels ÷ 2). */
      plus: z.object({ roof: point, door: point, foundation: point, garden: point }),
      damage: z.object({ kind: z.enum(['flood', 'landslip']) }),
      /** Landslip only: the ground surface the mud follows, on the 1600×1000 stage. */
      slipPath: z.array(point).optional(),
    }),
  ),
});
/** Sprite pixels per design unit in the disaster pack's "+" positions. */
const PLUS_SCALE = 2;

export interface HouseArt {
  kind: 'flood' | 'landslip';
  /** "+" positions in sprite pixels (1200×900). */
  plus: Record<'roof' | Spot, { x: number; y: number }>;
  slipPath: [number, number][] | null;
  /** Flood houses have a water layer drawn over the house after a disaster. */
  hasForeground: boolean;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Measured zones of one house sprite, in sprite pixels (1200×900). */
export interface HouseZones {
  width: number;
  height: number;
  /** Everything drawn (non-transparent). */
  content: Rect;
  /** Painted wall area (black in the mask), for damage cracks. */
  wall: Rect;
  roof: Rect;
  zones: Record<Spot, Rect & { cx: number; cy: number }>;
}

/** Zones with no mods in the game (roof: solar panels, open question 4) are measured but get no marker. */
const ZONE_KEYS = [...SPOTS, 'roof'] as const;
const MIN_ALPHA = 128;

let zoomData: ZoomData | null = null;
const zonesBySprite = new Map<string, HouseZones>();
const artBySprite = new Map<string, HouseArt>();

const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1).replace(/\.png$/, '');

export function preloadHouseAssets(scene: Phaser.Scene): void {
  for (const [path, url] of Object.entries(zonesUrls)) {
    scene.load.image(zonesKey(fileName(path).replace(/_zones$/, '')), url);
  }
  for (const [path, url] of Object.entries(spriteUrls)) {
    const name = fileName(path);
    const dmg = /_dmg([12])$/.exec(name);
    if (dmg) scene.load.image(spriteKey(name.replace(/_dmg[12]$/, ''), Number(dmg[1]) as DamageLevel), url);
    else scene.load.image(spriteKey(name), url);
  }
  for (const [path, url] of Object.entries(backgroundUrls)) {
    const m = /^(.*)_(normal|post_fg|post)$/.exec(fileName(path));
    if (m) scene.load.image(backgroundKey(m[1]!, m[2] as BackgroundKind), url);
  }
  for (const [path, url] of Object.entries(modIconUrls)) {
    scene.load.image(modIconKey(fileName(path).replace(/_128$/, '')), url);
  }
  scene.load.image(REPAIR_ICON, repairIconUrl);
  for (const [path, url] of Object.entries(zoomUrls)) {
    scene.load.image(zoomKey(fileName(path).replace(/^zoom_/, '').replace(/_clean$/, '')), url);
  }
}

export function getZoomData(): ZoomData {
  if (!zoomData) throw new Error('House assets not built yet');
  return zoomData;
}

export function getHouseArt(sprite: string): HouseArt {
  const a = artBySprite.get(sprite);
  if (!a) throw new Error(`No art for sprite "${sprite}"`);
  return a;
}

export function getZones(sprite: string): HouseZones {
  const z = zonesBySprite.get(sprite);
  if (!z) throw new Error(`No zones for sprite "${sprite}"`);
  return z;
}

export function pinFor(data: GameData, house: House): ZoomPin {
  const area = data.areas.find((a) => a.id === house.areaId)!;
  const region = data.regions.find((r) => r.id === area.regionId)!;
  return getZoomData().regions[region.mapRegion]!.pins.find((p) => p.houseId === house.sprite)!;
}

function measure(scene: Phaser.Scene, sprite: string): HouseZones {
  const img = scene.textures.get(zonesKey(sprite)).getSourceImage() as HTMLImageElement;
  const { width, height } = img;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, width, height).data;

  const colours = (assetHouses as { zones: Record<string, { maskColor: number[] }> }).zones;
  const targets = [
    ...ZONE_KEYS.map((k) => ({ key: k as string, rgb: colours[k]!.maskColor })),
    { key: 'wall', rgb: [0, 0, 0] },
  ];
  const acc = new Map(targets.map((t) => [t.key, { x0: width, y0: height, x1: -1, y1: -1, sx: 0, sy: 0, n: 0 }]));
  const content = { x0: width, y0: height, x1: -1, y1: -1 };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (px[i + 3]! < MIN_ALPHA) continue;
      content.x0 = Math.min(content.x0, x);
      content.y0 = Math.min(content.y0, y);
      content.x1 = Math.max(content.x1, x);
      content.y1 = Math.max(content.y1, y);
      // Masks are drawn with crisp edges, so an exact colour match is enough.
      const t = targets.find((c) => c.rgb[0] === px[i] && c.rgb[1] === px[i + 1] && c.rgb[2] === px[i + 2]);
      if (!t) continue;
      const a = acc.get(t.key)!;
      a.x0 = Math.min(a.x0, x);
      a.y0 = Math.min(a.y0, y);
      a.x1 = Math.max(a.x1, x);
      a.y1 = Math.max(a.y1, y);
      a.sx += x;
      a.sy += y;
      a.n++;
    }
  }

  const rect = (key: string) => {
    const a = acc.get(key)!;
    if (a.n === 0) throw new Error(`sprites/${sprite}_zones.png has no "${key}" zone`);
    return { x: a.x0, y: a.y0, w: a.x1 - a.x0, h: a.y1 - a.y0, cx: a.sx / a.n, cy: a.sy / a.n };
  };
  return {
    width,
    height,
    content: { x: content.x0, y: content.y0, w: content.x1 - content.x0, h: content.y1 - content.y0 },
    wall: rect('wall'),
    roof: rect('roof'),
    zones: Object.fromEntries(SPOTS.map((s) => [s, rect(s)])) as HouseZones['zones'],
  };
}

/** Measures every house's zones and checks the assets match the game data. Throws (loudly) if not. */
export function buildHouseAssets(scene: Phaser.Scene, data: GameData): void {
  const problems: string[] = [];
  const parsed = zoomSchema.safeParse(rawZoomData);
  if (!parsed.success) throw new Error(`${ASSET_DIR}/zoom_data.json is invalid: ${parsed.error.message}`);
  zoomData = parsed.data;

  for (const region of data.regions) {
    if (!zoomData.regions[region.mapRegion]) problems.push(`zoom_data.json has no view for map region "${region.mapRegion}"`);
    if (!scene.textures.exists(zoomKey(region.mapRegion))) problems.push(`missing zoom/zoom_${region.mapRegion}_clean.png`);
  }

  const disaster = disasterHousesSchema.safeParse(rawDisasterHouses);
  if (!disaster.success) throw new Error(`disaster_assets/houses.json is invalid: ${disaster.error.message}`);

  for (const mod of data.mods) {
    if (!scene.textures.exists(modIconKey(mod.icon))) problems.push(`mods.json: "${mod.id}" has no mod_icons/png/${mod.icon}_128.png`);
  }
  if (!scene.textures.exists(PLUS_ICON)) problems.push('missing mod_icons/png/plus_128.png');

  for (const house of data.houses) {
    // Disaster art: damage sprites, backgrounds, "+" positions, and a damage kind that matches the area.
    const art = disaster.data.houses.find((h) => h.id === house.sprite);
    const disasters = data.areas.find((a) => a.id === house.areaId)?.disasters ?? [];
    if (!art) {
      problems.push(`disaster_assets/houses.json has no entry for "${house.sprite}"`);
    } else {
      const expected = disasters.includes('landslide') ? 'landslip' : 'flood';
      if (art.damage.kind !== expected) problems.push(`"${house.sprite}" damage art is for a ${art.damage.kind}, but its area has ${disasters.join(', ')}`);
      if (art.damage.kind === 'landslip' && !art.slipPath?.length) problems.push(`"${house.sprite}" is a landslip house with no slipPath`);
      const hasForeground = scene.textures.exists(backgroundKey(house.sprite, 'post_fg'));
      if (art.damage.kind === 'flood' && !hasForeground) problems.push(`missing backgrounds/${house.sprite}_post_fg.png`);
      for (const level of [1, 2] as const) {
        if (!scene.textures.exists(spriteKey(house.sprite, level))) problems.push(`missing sprites/${house.sprite}_dmg${level}.png`);
      }
      for (const kind of ['normal', 'post'] as const) {
        if (!scene.textures.exists(backgroundKey(house.sprite, kind))) problems.push(`missing backgrounds/${house.sprite}_${kind}.png`);
      }
      const toSprite = ([x, y]: [number, number]) => ({ x: x * PLUS_SCALE, y: y * PLUS_SCALE });
      artBySprite.set(house.sprite, {
        kind: art.damage.kind,
        plus: {
          roof: toSprite(art.plus.roof),
          door: toSprite(art.plus.door),
          foundation: toSprite(art.plus.foundation),
          garden: toSprite(art.plus.garden),
        },
        slipPath: art.slipPath ?? null,
        hasForeground,
      });
    }

    if (!scene.textures.exists(spriteKey(house.sprite))) problems.push(`houses.json: "${house.id}" has no sprites/${house.sprite}.png`);
    if (!scene.textures.exists(zonesKey(house.sprite))) {
      problems.push(`houses.json: "${house.id}" has no sprites/${house.sprite}_zones.png`);
      continue;
    }
    try {
      zonesBySprite.set(house.sprite, measure(scene, house.sprite));
    } catch (err) {
      problems.push((err as Error).message);
    }
    const area = data.areas.find((a) => a.id === house.areaId);
    const region = data.regions.find((r) => r.id === area?.regionId);
    const pin = region && zoomData.regions[region.mapRegion]?.pins.find((p) => p.houseId === house.sprite);
    if (!pin) {
      problems.push(`zoom_data.json has no pin for "${house.sprite}" in ${region?.mapRegion ?? 'its region'}`);
      continue;
    }
    const at = regionAtMap(pin.mapX, pin.mapY);
    if (region && at !== region.mapRegion) {
      problems.push(`zoom_data.json: "${house.sprite}" pin (${pin.mapX}, ${pin.mapY}) is in map region "${at ?? 'none'}", not "${region.mapRegion}"`);
    }
  }
  if (problems.length) throw new Error(`House assets don't match the game data:\n- ${problems.join('\n- ')}`);
}
