import * as Phaser from 'phaser';
import { getRegionMap, highlightKey, MAP_BASE, MAP_OVERLAY, regionAtMap } from './regionMap';
import { HEIGHT, WIDTH } from './theme';

export interface Viewport {
  x: number;
  y: number;
  w: number;
  h: number;
}

const ZOOM_MS = 450;
/** Margin around a region when zooming to it, as a fraction of the viewport. */
const ZOOM_MARGIN = 0.9;
const MAX_ZOOM = 2;

/**
 * The valley map, drawn to cover the screen. Holds the base art, the region
 * outlines and one highlight layer per region, and converts screen ↔ map pixels.
 */
export class MapView {
  readonly layer: Phaser.GameObjects.Container;
  private readonly highlights = new Map<string, Phaser.GameObjects.Image>();
  private readonly coverScale: number;

  constructor(private readonly scene: Phaser.Scene) {
    const m = getRegionMap();
    this.layer = scene.add.container(0, 0).setDepth(-10);
    this.layer.add(scene.add.image(0, 0, MAP_BASE).setOrigin(0));
    for (const key of m.keys) {
      const hl = scene.add.image(0, 0, highlightKey(key)).setOrigin(0).setVisible(false);
      this.highlights.set(key, hl);
      this.layer.add(hl);
    }
    this.layer.add(scene.add.image(0, 0, MAP_OVERLAY).setOrigin(0));
    this.coverScale = Math.max(WIDTH / m.width, HEIGHT / m.height);
    this.showWhole();
  }

  /** Fits the whole map to the screen (cropping the edges if aspect ratios differ). */
  showWhole(): void {
    const m = getRegionMap();
    const s = this.coverScale;
    this.layer.setScale(s).setPosition((WIDTH - m.width * s) / 2, (HEIGHT - m.height * s) / 2);
  }

  /** Zooms so a map region fills the viewport, then calls `done`. */
  zoomToRegion(mapRegion: string, viewport: Viewport, done: () => void): void {
    const m = getRegionMap();
    const bb = m.bbox[mapRegion]!;
    const s = Phaser.Math.Clamp(
      Math.min(viewport.w / bb.w, viewport.h / bb.h) * ZOOM_MARGIN,
      this.coverScale,
      MAX_ZOOM,
    );
    // Centre the region in the viewport, but never show past the map's edges.
    const x = Phaser.Math.Clamp(viewport.x + viewport.w / 2 - (bb.x + bb.w / 2) * s, WIDTH - m.width * s, 0);
    const y = Phaser.Math.Clamp(viewport.y + viewport.h / 2 - (bb.y + bb.h / 2) * s, HEIGHT - m.height * s, 0);
    this.scene.tweens.add({
      targets: this.layer,
      scale: s,
      x,
      y,
      duration: ZOOM_MS,
      ease: 'Sine.easeInOut',
      onComplete: done,
    });
  }

  highlight(mapRegion: string | null): void {
    for (const [key, img] of this.highlights) img.setVisible(key === mapRegion);
  }

  toScreen(mapX: number, mapY: number): { x: number; y: number } {
    return { x: this.layer.x + mapX * this.layer.scale, y: this.layer.y + mapY * this.layer.scale };
  }

  toMap(screenX: number, screenY: number): { x: number; y: number } {
    return { x: (screenX - this.layer.x) / this.layer.scale, y: (screenY - this.layer.y) / this.layer.scale };
  }

  regionAt(screenX: number, screenY: number): string | null {
    const p = this.toMap(screenX, screenY);
    return regionAtMap(p.x, p.y);
  }
}
