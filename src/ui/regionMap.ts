import * as Phaser from 'phaser';
import { z } from 'zod';
import type { GameData } from '../data/schemas';
import baseUrl from '../../assets/map/cartoon_base.png';
import overlayUrl from '../../assets/map/cartoon_overlay.png';
import rawLabels from '../../assets/map/region_labels.json';

/*
 * The valley map from assets/map. cartoon_overlay.png holds the region shapes,
 * each filled with its tint colour; at boot we classify every overlay pixel to
 * a region so clicks can be hit-tested and regions highlighted.
 */

export const MAP_BASE = 'map-base';
export const MAP_OVERLAY = 'map-overlay';
export const highlightKey = (mapRegion: string) => `map-hl-${mapRegion}`;

const rgb = z.tuple([z.number().int(), z.number().int(), z.number().int()]);
const labelsSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  regions: z.record(
    z.string(),
    z.object({ name: z.string(), hazard: z.string(), x: z.number(), y: z.number(), maskColor: rgb, tint: rgb }),
  ),
});
export type MapLabels = z.infer<typeof labelsSchema>;

export interface RegionMap {
  labels: MapLabels;
  width: number;
  height: number;
  /** Map region keys; lookup values are 1-based indexes into this. */
  keys: string[];
  lookup: Uint8Array;
  bbox: Record<string, { x: number; y: number; w: number; h: number }>;
}

/** Overlay pixels this transparent or this white are borders, not region fill. */
const MIN_ALPHA = 8;
const WHITE = 225;
const HIGHLIGHT_ALPHA = 110;
/** How far (map pixels) a click on a region border searches for the nearest region. */
const EDGE_SEARCH = 8;

let regionMap: RegionMap | null = null;

export function preloadMap(scene: Phaser.Scene): void {
  scene.load.image(MAP_BASE, baseUrl);
  scene.load.image(MAP_OVERLAY, overlayUrl);
}

export function getRegionMap(): RegionMap {
  if (!regionMap) throw new Error('Region map not built yet');
  return regionMap;
}

/** Builds the hit-test lookup and highlight textures. Throws (loudly) if the map and data disagree. */
export function buildRegionMap(scene: Phaser.Scene, data: GameData): void {
  const parsed = labelsSchema.safeParse(rawLabels);
  if (!parsed.success) throw new Error(`assets/map/region_labels.json is invalid: ${parsed.error.message}`);
  const labels = parsed.data;
  const problems: string[] = [];
  for (const region of data.regions) {
    if (!labels.regions[region.mapRegion]) problems.push(`areas.json: region "${region.id}" has unknown mapRegion "${region.mapRegion}"`);
  }

  const { width, height } = labels;
  const source = scene.textures.get(MAP_OVERLAY).getSourceImage() as HTMLImageElement;
  if (source.width !== width || source.height !== height) {
    problems.push(`cartoon_overlay.png is ${source.width}×${source.height}, but region_labels.json says ${width}×${height}`);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0);
  const px = ctx.getImageData(0, 0, width, height).data;

  const keys = Object.keys(labels.regions);
  const tints = keys.map((k) => labels.regions[k]!.tint);
  const lookup = new Uint8Array(width * height);
  const highlights = keys.map(() => ctx.createImageData(width, height));
  const bounds = keys.map(() => ({ x0: width, y0: height, x1: 0, y1: 0 }));

  for (let i = 0; i < width * height; i++) {
    const r = px[i * 4]!;
    const g = px[i * 4 + 1]!;
    const b = px[i * 4 + 2]!;
    const a = px[i * 4 + 3]!;
    if (a < MIN_ALPHA || (r >= WHITE && g >= WHITE && b >= WHITE)) continue;
    let best = 0;
    let bestD = Infinity;
    tints.forEach(([tr, tg, tb], k) => {
      const dist = (r - tr) ** 2 + (g - tg) ** 2 + (b - tb) ** 2;
      if (dist < bestD) {
        bestD = dist;
        best = k;
      }
    });
    lookup[i] = best + 1;
    const [tr, tg, tb] = tints[best]!;
    const hl = highlights[best]!.data;
    hl[i * 4] = tr;
    hl[i * 4 + 1] = tg;
    hl[i * 4 + 2] = tb;
    hl[i * 4 + 3] = HIGHLIGHT_ALPHA;
    const x = i % width;
    const y = (i - x) / width;
    const bb = bounds[best]!;
    bb.x0 = Math.min(bb.x0, x);
    bb.y0 = Math.min(bb.y0, y);
    bb.x1 = Math.max(bb.x1, x);
    bb.y1 = Math.max(bb.y1, y);
  }

  keys.forEach((key, k) => {
    const tex = scene.textures.createCanvas(highlightKey(key), width, height)!;
    tex.context.putImageData(highlights[k]!, 0, 0);
    tex.refresh();
  });

  const bbox: RegionMap['bbox'] = {};
  keys.forEach((key, k) => {
    const bb = bounds[k]!;
    if (bb.x1 < bb.x0) problems.push(`cartoon_overlay.png has no pixels for map region "${key}"`);
    bbox[key] = { x: bb.x0, y: bb.y0, w: bb.x1 - bb.x0, h: bb.y1 - bb.y0 };
  });

  regionMap = { labels, width, height, keys, lookup, bbox };

  // Every house pin must sit inside its own region's shape.
  for (const house of data.houses) {
    const area = data.areas.find((a) => a.id === house.areaId);
    const region = data.regions.find((r) => r.id === area?.regionId);
    const at = regionAtMap(house.map.x, house.map.y);
    if (region && at !== region.mapRegion) {
      problems.push(`houses.json: "${house.id}" pin (${house.map.x}, ${house.map.y}) is in map region "${at ?? 'none'}", not "${region.mapRegion}"`);
    }
  }
  if (problems.length) throw new Error(`Map data doesn't match the game data:\n- ${problems.join('\n- ')}`);
}

/** The map region at a point in map pixels, searching a little way if it's on a border. */
export function regionAtMap(x: number, y: number): string | null {
  const m = getRegionMap();
  const at = (px: number, py: number) => {
    const xi = Math.round(px);
    const yi = Math.round(py);
    if (xi < 0 || yi < 0 || xi >= m.width || yi >= m.height) return 0;
    return m.lookup[yi * m.width + xi]!;
  };
  let hit = at(x, y);
  for (let r = 2; !hit && r <= EDGE_SEARCH; r += 2) {
    hit = at(x + r, y) || at(x - r, y) || at(x, y + r) || at(x, y - r);
  }
  return hit ? m.keys[hit - 1]! : null;
}
