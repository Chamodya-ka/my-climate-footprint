import * as Phaser from 'phaser';
import { FONT } from './theme';

/** A desk calendar drawn in code. Its pages flip through one year to show time passing; it's cosmetic. */
export const CALENDAR_W = 104;
export const CALENDAR_H = 116;

const HEADER_H = 30;
const PAGE_H = CALENDAR_H - HEADER_H;
const RADIUS = 8;
const FLIP_MS = 130;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const PAPER = 0xffffff;
const INK = 0x26344a;
const HEADER = 0xd9534f;
const DAY = 0xc9d3dc;

const DAY_SIZE = 5;
const DAY_GAP = 5;
const WEEK_DAYS = 7;
const WEEKS = 4;

export interface Calendar extends Phaser.GameObjects.Container {
  /** Flips from January to December, then calls `onDone`. */
  flipYear: (onDone: () => void) => void;
}

/** One page: the month name above a small grid of days. */
function makePage(scene: Phaser.Scene, month: number): Phaser.GameObjects.Container {
  const page = scene.add.container(0, HEADER_H);
  const g = scene.add.graphics();
  g.fillStyle(PAPER).fillRoundedRect(0, 0, CALENDAR_W, PAGE_H, { tl: 0, tr: 0, bl: RADIUS, br: RADIUS });
  g.lineStyle(1, DAY).lineBetween(0, 0, CALENDAR_W, 0);
  const gridW = WEEK_DAYS * DAY_SIZE + (WEEK_DAYS - 1) * DAY_GAP;
  const gridY = PAGE_H - 14 - (WEEKS * DAY_SIZE + (WEEKS - 1) * DAY_GAP);
  g.fillStyle(DAY);
  for (let row = 0; row < WEEKS; row++) {
    for (let col = 0; col < WEEK_DAYS; col++) {
      g.fillRect((CALENDAR_W - gridW) / 2 + col * (DAY_SIZE + DAY_GAP), gridY + row * (DAY_SIZE + DAY_GAP), DAY_SIZE, DAY_SIZE);
    }
  }
  const label = scene.add
    .text(CALENDAR_W / 2, 6, MONTHS[month]!, {
      fontFamily: FONT,
      fontSize: '26px',
      color: '#26344a',
      fontStyle: 'bold',
    })
    .setOrigin(0.5, 0)
    .setName('month');
  page.add([g, label]);
  return page;
}

function setMonth(page: Phaser.GameObjects.Container, month: number): void {
  (page.getByName('month') as Phaser.GameObjects.Text).setText(MONTHS[month]!);
}

/** A calendar for `year`, top-left corner at (x, y), showing January. */
export function drawCalendar(scene: Phaser.Scene, x: number, y: number, year: number): Calendar {
  const c = scene.add.container(x, y);

  const back = scene.add.graphics();
  back.fillStyle(0x000000, 0.25).fillRoundedRect(3, 4, CALENDAR_W, CALENDAR_H, RADIUS);
  back.fillStyle(PAPER).fillRoundedRect(0, 0, CALENDAR_W, CALENDAR_H, RADIUS);
  back.fillStyle(HEADER).fillRoundedRect(0, 0, CALENDAR_W, HEADER_H, { tl: RADIUS, tr: RADIUS, bl: 0, br: 0 });
  const yearText = scene.add
    .text(CALENDAR_W / 2, HEADER_H / 2 + 2, `${year}`, { fontFamily: FONT, fontSize: '17px', color: '#ffffff', fontStyle: 'bold' })
    .setOrigin(0.5);

  // The next month waits underneath; the top page lifts up towards the binding.
  const under = makePage(scene, 1);
  const top = makePage(scene, 0);

  const front = scene.add.graphics();
  front.lineStyle(3, INK).strokeRoundedRect(0, 0, CALENDAR_W, CALENDAR_H, RADIUS);
  // Binding rings across the top edge.
  front.fillStyle(INK);
  for (const rx of [CALENDAR_W * 0.28, CALENDAR_W * 0.72]) front.fillRoundedRect(rx - 4, -8, 8, 18, 4);

  c.add([back, yearText, under, top, front]);

  const flipYear = (onDone: () => void) => {
    let month = 0;
    const flip = () => {
      scene.tweens.add({
        targets: top,
        scaleY: 0,
        duration: FLIP_MS,
        ease: 'Sine.easeIn',
        onComplete: () => {
          month++;
          setMonth(top, month);
          top.setScale(1);
          if (month < MONTHS.length - 1) {
            setMonth(under, month + 1);
            flip();
          } else {
            under.setVisible(false);
            scene.tweens.add({ targets: c, y: c.y - 6, duration: 120, yoyo: true, ease: 'Sine.easeOut', onComplete: onDone });
          }
        },
      });
    };
    flip();
  };

  return Object.assign(c, { flipYear });
}
