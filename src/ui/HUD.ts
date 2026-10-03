import * as Phaser from 'phaser';
import type { GameData } from '../data/schemas';
import { formatMoney } from '../sim/format';
import { repairCost } from '../sim/economy';
import { type GameState } from '../sim/state';
import { ICON_SIZE, type IconKey } from './icons';
import { calendarYear } from './copy';
import { colours, FONT, WIDTH } from './theme';

const PAD = 14;
const EDGE = 16;
const ICON_GAP = 10;
const ROW_GAP = 8;
const MIN_W = 180;

/** The footprint scale: a green-to-red bar with a pointer at the current value. */
const SCALE_W = 168;
const BAR_H = 12;
const POINTER = 7;
const SCALE_LABEL_GAP = 2;
/** Scale colours run from green (hue 1/3) at 0 to red (hue 0) at the top of the scale. */
const HUE_LOW = 1 / 3;
const SCALE_SAT = 0.65;
const SCALE_VAL = 0.9;
const OUTLINE = 0x10202b;
/** The trend arrow beside the scale. */
const TREND_GAP = 10;
const TREND_SIZE = 18;
const TREND_UP = 0xff6b5b;
const TREND_DOWN = 0x4cc46a;

/** Content in scenes using the HUD should start below this. */
export const HUD_HEIGHT = 190;

export type HudRowKey = 'footprint' | 'bank' | 'houseValue' | 'repairCost';

/** Drawn content used in place of a row's text value. */
interface Widget {
  obj: Phaser.GameObjects.Container;
  width: number;
  height: number;
}

interface Row {
  key: HudRowKey;
  icon: IconKey;
  label: string;
  value: string | Widget;
}

/**
 * A box of rows, each an icon beside a small label and a bold value.
 * The box is only as wide as its widest row; `align` pins it to the left or right edge.
 */
function box(
  scene: Phaser.Scene,
  c: Phaser.GameObjects.Container,
  align: 'left' | 'right',
  rows: Row[],
  rowRects: Partial<Record<HudRowKey, BoxRect>>,
): BoxRect {
  const items = rows.map((row) => ({
    icon: scene.add.image(0, 0, row.icon).setOrigin(0, 0.5),
    label: scene.add.text(0, 0, row.label.toUpperCase(), { fontFamily: FONT, fontSize: '13px', color: colours.textDim }),
    value:
      typeof row.value === 'string'
        ? scene.add.text(0, 0, row.value, { fontFamily: FONT, fontSize: '19px', color: colours.text, fontStyle: 'bold' })
        : row.value.obj.setSize(row.value.width, row.value.height),
  }));
  const textW = Math.max(...items.map((it) => Math.max(it.label.width, it.value.width)));
  const w = Math.max(MIN_W, PAD + ICON_SIZE + ICON_GAP + textW + PAD);
  const x = align === 'left' ? EDGE : WIDTH - EDGE - w;

  const bg = scene.add.rectangle(x, EDGE, w, 10, colours.panel, 0.92).setOrigin(0).setStrokeStyle(2, colours.panelEdge);
  c.add(bg);
  let y = EDGE + PAD - 2;
  items.forEach((it, i) => {
    const rowH = Math.max(ICON_SIZE, it.label.height + it.value.height);
    rowRects[rows[i]!.key] = { x: x + PAD / 2, y: y - ROW_GAP / 2, w: w - PAD, h: rowH + ROW_GAP };
    it.icon.setPosition(x + PAD, y + rowH / 2);
    it.label.setPosition(x + PAD + ICON_SIZE + ICON_GAP, y);
    it.value.setPosition(x + PAD + ICON_SIZE + ICON_GAP, y + it.label.height);
    c.add([it.icon, it.label, it.value]);
    y += rowH + ROW_GAP;
  });
  const h = y - ROW_GAP - EDGE + PAD;
  bg.setSize(w, h);
  return { x, y: EDGE, w, h };
}

/**
 * Top left: the neighbourhood footprint. Top centre: the year, as big text.
 * Top right: bank, house value, total repair cost.
 */
export interface BoxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The neighbourhood footprint as a scale from 0 to the top of the weather bands
 * (green to red), with a pointer at the current value. Band edges are ticked,
 * since that's where the odds step up. The pointer's position carries the
 * meaning, so colour is never the only signal.
 */
function footprintScale(scene: Phaser.Scene, data: GameData, footprint: number): Widget & { trend: Phaser.GameObjects.Graphics } {
  const bands = data.weather.bands;
  const max = bands[bands.length - 1]!.max;
  const c = scene.add.container(0, 0);
  const barY = POINTER + 2;
  const g = scene.add.graphics();

  for (let i = 0; i < SCALE_W; i++) {
    const hue = HUE_LOW * (1 - i / (SCALE_W - 1));
    g.fillStyle(Phaser.Display.Color.HSVToRGB(hue, SCALE_SAT, SCALE_VAL).color).fillRect(i, barY, 1, BAR_H);
  }
  g.lineStyle(1, OUTLINE, 0.6);
  for (const band of bands.slice(1)) {
    const x = Math.round((band.min / max) * SCALE_W);
    g.lineBetween(x, barY, x, barY + BAR_H);
  }
  g.lineStyle(2, OUTLINE).strokeRect(0, barY, SCALE_W, BAR_H);

  // Pointer: a white triangle above the bar and a white line through it, outlined so it reads on any colour.
  const px = Math.min(1, Math.max(0, footprint / max)) * SCALE_W;
  g.fillStyle(0xffffff).fillTriangle(px - POINTER, 0, px + POINTER, 0, px, barY);
  g.lineStyle(1.5, OUTLINE).strokeTriangle(px - POINTER, 0, px + POINTER, 0, px, barY);
  g.fillStyle(OUTLINE).fillRect(px - 2.5, barY - 1, 5, BAR_H + 2);
  g.fillStyle(0xffffff).fillRect(px - 1, barY, 2, BAR_H);

  const labelStyle = { fontFamily: FONT, fontSize: '12px', color: colours.textDim };
  const labelY = barY + BAR_H + SCALE_LABEL_GAP;
  const low = scene.add.text(0, labelY, `${bands[0]!.min} t`, labelStyle);
  const high = scene.add.text(SCALE_W, labelY, `${max} t`, labelStyle).setOrigin(1, 0);

  const trend = scene.add.graphics().setPosition(SCALE_W + TREND_GAP + TREND_SIZE / 2, barY + BAR_H / 2);
  c.add([g, low, high, trend]);
  return { obj: c, width: SCALE_W + TREND_GAP + TREND_SIZE, height: labelY + low.height, trend };
}

/** Draws a red up arrow for a rise, a green down arrow for a fall, nothing for no change. */
function drawTrend(g: Phaser.GameObjects.Graphics, delta: number | null): void {
  g.clear();
  if (!delta) return;
  const up = delta > 0;
  const h = TREND_SIZE / 2;
  const dir = up ? -1 : 1;
  // Shaft and head, pointing up or down; the shape carries the meaning as well as the colour.
  const points = [
    [-h * 0.35, -dir * h],
    [h * 0.35, -dir * h],
    [h * 0.35, 0],
    [h, 0],
    [0, dir * h],
    [-h, 0],
    [-h * 0.35, 0],
  ].map(([x, y]) => new Phaser.Math.Vector2(x, y));
  g.fillStyle(up ? TREND_UP : TREND_DOWN).fillPoints(points, true);
  g.lineStyle(1.5, OUTLINE).strokePoints(points, true);
}

export interface Hud extends Phaser.GameObjects.Container {
  /** Bottom edge of the top-right box, so side panels can sit below it. */
  rightBottom: number;
  /** The neighbourhood footprint box (top left). */
  footprintBox: BoxRect;
  /** Each row of the boxes, e.g. for pointing explanations at them. */
  rows: Record<HudRowKey, BoxRect>;
  /** Shows the footprint arrow for a change of `delta` tonnes (up, down, or none for 0 / null). */
  setTrend(delta: number | null): void;
}

export function drawHUD(scene: Phaser.Scene, data: GameData, state: GameState): Hud {
  const c = scene.add.container(0, 0).setDepth(10);
  const house = state.house;

  const rows: Partial<Record<HudRowKey, BoxRect>> = {};
  const scale = footprintScale(scene, data, state.footprint);
  const footprintBox = box(
    scene,
    c,
    'left',
    [{ key: 'footprint', icon: 'icon-footprint', label: 'Neighbourhood footprint', value: scale }],
    rows,
  );
  // The arrow shows which way this year's answer pushes the footprint.
  const setTrend = (delta: number | null) => drawTrend(scale.trend, delta);
  setTrend(state.thisYear.quiz?.footprintDelta ?? null);

  // The calendar year: big white text at the top centre, outlined so it reads over the sky.
  // Hidden before the first house is bought (year 0).
  if (state.year > 0) c.add(
    scene.add
      .text(WIDTH / 2, EDGE + 4, `${calendarYear(data, state.year)}`, {
        fontFamily: FONT,
        fontSize: '40px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#10202b',
        strokeThickness: 6,
      })
      .setOrigin(0.5, 0),
  );

  // House value and repair cost show $0 before a house is bought, so the box never changes shape.
  const right: Row[] = [
    { key: 'bank', icon: 'icon-bank', label: 'Bank', value: formatMoney(state.bank) },
    { key: 'houseValue', icon: 'icon-house', label: 'House value', value: formatMoney(house?.value ?? 0) },
    {
      key: 'repairCost',
      icon: 'icon-repair',
      label: 'Total repair cost',
      value: formatMoney(house ? repairCost(data, house) : 0),
    },
  ];
  const r = box(scene, c, 'right', right, rows);
  return Object.assign(c, { rightBottom: r.y + r.h, footprintBox, rows: rows as Record<HudRowKey, BoxRect>, setTrend });
}
