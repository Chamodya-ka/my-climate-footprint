import * as Phaser from 'phaser';
import type { GameData } from '../data/schemas';
import { formatMoney, formatTonnes } from '../sim/format';
import { repairCost } from '../sim/economy';
import { type GameState } from '../sim/state';
import { ICON_SIZE, type IconKey } from './icons';
import { colours, FONT, WIDTH } from './theme';

const PAD = 14;
const EDGE = 16;
const ICON_GAP = 10;
const ROW_GAP = 8;
const MIN_W = 180;

/** Content in scenes using the HUD should start below this. */
export const HUD_HEIGHT = 190;

interface Row {
  icon: IconKey;
  label: string;
  value: string;
}

/**
 * A box of rows, each an icon beside a small label and a bold value.
 * The box is only as wide as its widest row; `align` pins it to the left or right edge.
 */
function box(scene: Phaser.Scene, c: Phaser.GameObjects.Container, align: 'left' | 'right', rows: Row[]): void {
  const items = rows.map((row) => ({
    icon: scene.add.image(0, 0, row.icon).setOrigin(0, 0.5),
    label: scene.add.text(0, 0, row.label.toUpperCase(), { fontFamily: FONT, fontSize: '13px', color: colours.textDim }),
    value: scene.add.text(0, 0, row.value, { fontFamily: FONT, fontSize: '19px', color: colours.text, fontStyle: 'bold' }),
  }));
  const textW = Math.max(...items.map((it) => Math.max(it.label.width, it.value.width)));
  const w = Math.max(MIN_W, PAD + ICON_SIZE + ICON_GAP + textW + PAD);
  const x = align === 'left' ? EDGE : WIDTH - EDGE - w;

  const bg = scene.add.rectangle(x, EDGE, w, 10, colours.panel, 0.92).setOrigin(0).setStrokeStyle(2, colours.panelEdge);
  c.add(bg);
  let y = EDGE + PAD - 2;
  for (const it of items) {
    const rowH = Math.max(ICON_SIZE, it.label.height + it.value.height);
    it.icon.setPosition(x + PAD, y + rowH / 2);
    it.label.setPosition(x + PAD + ICON_SIZE + ICON_GAP, y);
    it.value.setPosition(x + PAD + ICON_SIZE + ICON_GAP, y + it.label.height);
    c.add([it.icon, it.label, it.value]);
    y += rowH + ROW_GAP;
  }
  bg.setSize(w, y - ROW_GAP - EDGE + PAD);
}

/**
 * Top left: the neighbourhood footprint. Top centre: the year, as big text.
 * Top right: bank, house value, total repair cost.
 */
export function drawHUD(scene: Phaser.Scene, data: GameData, state: GameState): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0).setDepth(10);
  const house = state.house;

  box(scene, c, 'left', [{ icon: 'icon-footprint', label: 'Neighbourhood footprint', value: formatTonnes(state.footprint) }]);

  // Year: big white text at the top centre, outlined so it reads over the sky.
  c.add(
    scene.add
      .text(WIDTH / 2, EDGE + 4, `Year ${state.year} of ${data.balance.gameLengthYears}`, {
        fontFamily: FONT,
        fontSize: '40px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#10202b',
        strokeThickness: 6,
      })
      .setOrigin(0.5, 0),
  );

  const right: Row[] = [{ icon: 'icon-bank', label: 'Bank', value: formatMoney(state.bank) }];
  if (house) {
    right.push({ icon: 'icon-house', label: 'House value', value: formatMoney(house.value) });
    right.push({ icon: 'icon-repair', label: 'Total repair cost', value: formatMoney(repairCost(data, house)) });
  }
  box(scene, c, 'right', right);
  return c;
}
