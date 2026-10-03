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

/** Content in scenes using the HUD should start below this. */
export const HUD_HEIGHT = 190;

export type HudRowKey = 'footprint' | 'bank' | 'houseValue' | 'repairCost';

interface Row {
  key: HudRowKey;
  icon: IconKey;
  label: string;
  value: string;
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
    icon: scene.add.image(0, 0, row.icon).setOrigin(0, 0.5).setDisplaySize(ICON_SIZE, ICON_SIZE),
    label: scene.add.text(0, 0, row.label.toUpperCase(), { fontFamily: FONT, fontSize: '13px', color: colours.textDim }),
    value: scene.add.text(0, 0, row.value, { fontFamily: FONT, fontSize: '19px', color: colours.text, fontStyle: 'bold' }),
  }));
  const textW = Math.max(...items.map((it) => Math.max(it.label.width, it.value.width)));
  const w = Math.max(MIN_W, PAD + ICON_SIZE + ICON_GAP + textW + PAD);
  const x = align === 'left' ? EDGE : WIDTH - EDGE - w;

  const bg = scene.add.rectangle(x, EDGE, w, 10, colours.panel).setOrigin(0).setStrokeStyle(2, colours.panelEdge);
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
 * Top left: the carbon footprint. Top centre: the year, as big text.
 * Top right: bank, house value, repair cost.
 */
export interface BoxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Hud extends Phaser.GameObjects.Container {
  /** Bottom edge of the top-right box, so side panels can sit below it. */
  rightBottom: number;
  /** The carbon footprint box (top left). */
  footprintBox: BoxRect;
  /** Each row of the boxes, e.g. for pointing explanations at them. */
  rows: Record<HudRowKey, BoxRect>;
  /** Pops in the arrow beside the gauge for this year's quiz answer (tonnes; not yet applied). */
  showFootprintChange: (delta: number) => void;
}

const GAUGE_W = 200;
const GAUGE_H = 14;
const MARKER = 7;
const ARROW_W = 26;
const ARROW_GAP = 12;
const GAUGE_LOW = 0x4caf50;
const GAUGE_MID = 0xffd166;
const GAUGE_HIGH = 0xe5533d;

function lerpColour(a: number, b: number, t: number): number {
  const ch = (shift: number) => Math.round(((a >> shift) & 0xff) + (((b >> shift) & 0xff) - ((a >> shift) & 0xff)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Green at 0, yellow halfway, red at the top of the scale. */
function gaugeColour(t: number): number {
  return t < 0.5 ? lerpColour(GAUGE_LOW, GAUGE_MID, t * 2) : lerpColour(GAUGE_MID, GAUGE_HIGH, (t - 0.5) * 2);
}

/**
 * Up (red) when the answer raises the footprint, down (green) when it lowers it,
 * a flat bar (grey) when it doesn't change it. Shape carries the meaning, not just colour.
 */
function drawChangeArrow(g: Phaser.GameObjects.Graphics, delta: number): void {
  const half = ARROW_W / 2;
  g.clear();
  if (delta === 0) {
    g.fillStyle(Phaser.Display.Color.HexStringToColor(colours.textDim).color);
    g.fillRect(-half + 3, -6, ARROW_W - 6, 4).fillRect(-half + 3, 3, ARROW_W - 6, 4);
    return;
  }
  const dir = delta > 0 ? -1 : 1; // -1 points up
  g.fillStyle(delta > 0 ? GAUGE_HIGH : GAUGE_LOW).lineStyle(2, colours.bg);
  const points = [
    { x: -5, y: -dir * 13 },
    { x: 5, y: -dir * 13 },
    { x: 5, y: 0 },
    { x: half, y: 0 },
    { x: 0, y: dir * 13 },
    { x: -half, y: 0 },
    { x: -5, y: 0 },
  ].map((p) => new Phaser.Math.Vector2(p.x, p.y));
  g.fillPoints(points, true).strokePoints(points, true);
}

/**
 * The carbon footprint as a 0–max scale, green to red, with ticks at the
 * weather band edges and a marker at the current value. Beside it, room for an
 * arrow showing which way this year's answer moves the footprint.
 */
function footprintGauge(
  scene: Phaser.Scene,
  c: Phaser.GameObjects.Container,
  data: GameData,
  footprint: number,
  rowRects: Partial<Record<HudRowKey, BoxRect>>,
): { rect: BoxRect; arrow: Phaser.GameObjects.Graphics; marker: Phaser.GameObjects.Graphics; markerX: (t: number) => number } {
  const bands = data.weather.bands;
  const min = data.balance.minFootprint;
  const max = data.balance.footprintGaugeMax;
  const at = (t: number) => textX + ((Phaser.Math.Clamp(t, min, max) - min) / (max - min)) * GAUGE_W;
  const x = EDGE;
  const textX = x + PAD + ICON_SIZE + ICON_GAP;
  const label = scene.add.text(textX, EDGE + PAD - 2, 'CARBON FOOTPRINT', {
    fontFamily: FONT,
    fontSize: '13px',
    color: colours.textDim,
  });
  const barY = label.y + label.height + MARKER + 3;
  const w = Math.max(MIN_W, textX - x + Math.max(label.width, GAUGE_W + ARROW_GAP + ARROW_W) + PAD);
  const h = barY + GAUGE_H - EDGE + PAD;

  const bg = scene.add.rectangle(x, EDGE, w, h, colours.panel).setOrigin(0).setStrokeStyle(2, colours.panelEdge);
  const g = scene.add.graphics();
  const SLICE = 2;
  for (let i = 0; i < GAUGE_W; i += SLICE) {
    g.fillStyle(gaugeColour(i / GAUGE_W)).fillRect(textX + i, barY, SLICE, GAUGE_H);
  }
  g.lineStyle(2, colours.bg, 0.6);
  for (const band of bands.slice(1)) {
    const tx = at(band.min);
    g.lineBetween(tx, barY + 3, tx, barY + GAUGE_H - 3);
  }
  g.lineStyle(1, colours.panelEdge).strokeRect(textX, barY, GAUGE_W, GAUGE_H);

  // The marker: a pointer above the bar and a line through it. Its own object, drawn around
  // x = 0, so it can slide along the bar when the footprint changes.
  const markerX = at;
  const marker = scene.add.graphics({ x: markerX(footprint), y: barY });
  marker.fillStyle(0xffffff).lineStyle(2, colours.bg);
  marker.fillTriangle(-MARKER, -MARKER - 1, MARKER, -MARKER - 1, 0, 1);
  marker.strokeTriangle(-MARKER, -MARKER - 1, MARKER, -MARKER - 1, 0, 1);
  marker.lineStyle(4, colours.bg).lineBetween(0, 0, 0, GAUGE_H);
  marker.lineStyle(2, 0xffffff).lineBetween(0, 0, 0, GAUGE_H);

  const icon = scene.add.image(x + PAD, EDGE + h / 2, 'icon-footprint').setOrigin(0, 0.5).setDisplaySize(ICON_SIZE, ICON_SIZE);
  const arrow = scene.add.graphics({ x: textX + GAUGE_W + ARROW_GAP + ARROW_W / 2, y: barY + GAUGE_H / 2 }).setVisible(false);
  c.add([bg, icon, label, g, marker, arrow]);

  rowRects.footprint = { x: x + PAD / 2, y: EDGE + PAD / 2, w: w - PAD, h: h - PAD };
  return { rect: { x, y: EDGE, w, h }, arrow, marker, markerX };
}

/**
 * The footprint the gauge shows. Once this year's question is answered, the marker
 * already includes the answer's change, so it moves the moment the player answers. The
 * sim applies the answer (with the yearly rise and any mod effects) when the year ends;
 * the Roll screen then slides the marker the rest of the way.
 */
export function displayedFootprint(data: GameData, state: GameState): number {
  const answered = state.phase === 'action' && state.thisYear.quiz;
  return answered ? previewFootprint(data, state.footprint, state.thisYear.quiz!.footprintDelta) : state.footprint;
}

function previewFootprint(data: GameData, footprint: number, delta: number): number {
  return Math.max(data.balance.minFootprint, footprint + delta);
}

export interface HudOptions {
  /**
   * The footprint before this screen's change. When given and different, the gauge
   * marker starts there and slides to the current value, then pulses, so the change is
   * easy to see (a year usually moves it only 5–15 px).
   */
  footprintFrom?: number;
}

/** Marker slide and pulse timings. */
const MARKER_SLIDE_MS = 1200;
const MARKER_DELAY_MS = 250;
const MARKER_PULSE_SCALE = 1.6;
const MARKER_PULSE_MS = 220;

export function drawHUD(scene: Phaser.Scene, data: GameData, state: GameState, options: HudOptions = {}): Hud {
  const c = scene.add.container(0, 0).setDepth(10);
  const house = state.house;

  const rows: Partial<Record<HudRowKey, BoxRect>> = {};
  const shownFootprint = displayedFootprint(data, state);
  const gauge = footprintGauge(scene, c, data, shownFootprint, rows);
  const footprintBox = gauge.rect;

  /** Slides the marker from `fromT` to `toT` tonnes, then pulses it so the move is noticed. */
  const slideMarker = (fromT: number, toT: number) => {
    if (fromT === toT) return;
    gauge.marker.x = gauge.markerX(fromT);
    scene.tweens.add({
      targets: gauge.marker,
      x: gauge.markerX(toT),
      delay: MARKER_DELAY_MS,
      duration: MARKER_SLIDE_MS,
      ease: 'Sine.easeInOut',
      onComplete: () =>
        scene.tweens.add({ targets: gauge.marker, scale: MARKER_PULSE_SCALE, duration: MARKER_PULSE_MS, yoyo: true, repeat: 1 }),
    });
  };
  if (options.footprintFrom !== undefined) slideMarker(options.footprintFrom, shownFootprint);

  const showFootprintChange = (delta: number, animate = true) => {
    drawChangeArrow(gauge.arrow, delta);
    gauge.arrow.setVisible(true);
    if (animate) {
      gauge.arrow.setScale(0);
      scene.tweens.add({ targets: gauge.arrow, scale: 1, duration: 350, ease: 'Back.easeOut' });
      // The answer moves the marker straight away (preview; the sim applies it at year end).
      slideMarker(state.footprint, previewFootprint(data, state.footprint, delta));
    }
  };
  // Answered this year: keep showing the answer's arrow and its effect on the marker.
  if (state.phase === 'action' && state.thisYear.quiz) showFootprintChange(state.thisYear.quiz.footprintDelta, false);

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
      label: 'Repair cost',
      value: formatMoney(house ? repairCost(data, house) : 0),
    },
  ];
  const r = box(scene, c, 'right', right, rows);
  return Object.assign(c, {
    rightBottom: r.y + r.h,
    footprintBox,
    rows: rows as Record<HudRowKey, BoxRect>,
    showFootprintChange: (delta: number) => showFootprintChange(delta),
  });
}
