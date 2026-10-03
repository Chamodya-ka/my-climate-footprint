import * as Phaser from 'phaser';
import { HEIGHT, WIDTH } from './theme';

/*
 * Sharp rendering on large and high-DPI screens.
 *
 * Every scene lays things out on a WIDTH×HEIGHT stage, but the canvas is drawn at
 * RENDER_SCALE times that, close to the screen's real pixel size. Each scene's camera
 * zooms by the same factor (`sceneConfig()`), so positions, hit tests and layouts
 * don't change; text is rasterised at the same factor (`installCrispText()`).
 */

/** Upper limit, so a very large screen doesn't make every frame (and every text texture) huge. */
const MAX_RENDER_SCALE = 3;
/** Render scales snap to quarter steps. */
const SCALE_STEP = 4;

function renderScale(): number {
  if (typeof window === 'undefined') return 1;
  const dpr = window.devicePixelRatio || 1;
  // The screen, not the window, so the game stays sharp if the window is later maximised.
  const fit = Math.max(window.screen.width / WIDTH, window.screen.height / HEIGHT);
  return Phaser.Math.Clamp(Math.ceil(fit * dpr * SCALE_STEP) / SCALE_STEP, 1, MAX_RENDER_SCALE);
}

export const RENDER_SCALE = renderScale();

/** Canvas size in device pixels. */
export const CANVAS_SIZE = { width: Math.round(WIDTH * RENDER_SCALE), height: Math.round(HEIGHT * RENDER_SCALE) };

/**
 * A scene's settings with a main camera that shows the WIDTH×HEIGHT stage on the
 * larger canvas. The camera zooms around its centre (screen = (world - scroll - size/2) × zoom + size/2),
 * so it scrolls back to keep stage (0, 0) at the canvas's top-left corner.
 */
export function sceneConfig(key: string): Phaser.Types.Scenes.SettingsConfig {
  const z = RENDER_SCALE;
  const scroll = (size: number) => (size / z - size) / 2;
  return { key, cameras: { zoom: z, scrollX: scroll(CANVAS_SIZE.width), scrollY: scroll(CANVAS_SIZE.height) } };
}

type TextFactory = (
  x: number,
  y: number,
  text: string | string[],
  style?: Phaser.Types.GameObjects.Text.TextStyle,
) => Phaser.GameObjects.Text;

/** Makes `scene.add.text()` rasterise text at RENDER_SCALE, unless a style sets its own resolution. Call once, before the game starts. */
export function installCrispText(): void {
  const factory = Phaser.GameObjects.GameObjectFactory.prototype as unknown as { text: TextFactory };
  const original = factory.text;
  factory.text = function (this: Phaser.GameObjects.GameObjectFactory, x, y, text, style) {
    return original.call(this, x, y, text, { resolution: RENDER_SCALE, ...style });
  };
}
