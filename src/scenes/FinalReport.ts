import * as Phaser from 'phaser';
import type { Mod } from '../data/schemas';
import { disastersFaced, totalRepairs, upgradeReport } from '../sim/advice';
import { formatMoney } from '../sim/format';
import { getHouse } from '../sim/state';
import { data, state } from '../session';
import { Button, FocusNav } from '../ui/buttons';
import { announce } from '../ui/a11y';
import { calendarYear, DISASTER_NAME, lastCalendarYear, PLACEHOLDER_NOTE } from '../ui/copy';
import { drawHouseScene } from '../ui/houseArt';
import { modIconKey } from '../ui/houseAssets';
import type { IconKey } from '../ui/icons';
import { panel, textBlock } from '../ui/panels';
import { colours, FONT, HEIGHT, text, WIDTH } from '../ui/theme';

const EDGE = 16;
/** Space between a column's edge and its content. */
const PAD = 16;
const GAP = 12;
const STAT_ICON = 30;
const HEAD_ICON = 24;
const MOD_ICON = 26;
const ROW: Phaser.Types.GameObjects.Text.TextStyle = { ...text.body, fontSize: '17px', lineSpacing: 4 };

export class FinalReport extends Phaser.Scene {
  constructor() {
    super('FinalReport');
  }

  create(): void {
    const d = data();
    const s = state();
    const won = s.outcome === 'won';
    const survived = won ? s.year : s.year - 1;
    // The house (standing or in ruins) fills the screen between the two report columns.
    const colW = 440;
    const leftX = EDGE;
    const rightX = WIDTH - EDGE - colW;
    if (s.house) {
      // The house (or what's left of it) fills the gap between the two columns.
      const gapX = leftX + colW;
      drawHouseScene(this, d, getHouse(d, s.house.houseId), s.house, {
        x: gapX,
        y: 0,
        w: rightX - gapX,
        h: HEIGHT,
      }).setDepth(-10);
    }
    const top = EDGE;
    const colH = HEIGHT - EDGE * 2;
    panel(this, leftX, top, colW, colH);
    panel(this, rightX, top, colW, colH);
    // Left column: built in a container, so it can shrink to fit if a long game fills it.
    const innerW = colW - PAD * 2;
    const box = this.add.container(leftX + PAD, top + PAD);
    const spoken: string[] = [];
    let y = 0;
    const write = (x: number, content: string, style: Phaser.Types.GameObjects.Text.TextStyle, width = innerW - x) => {
      const t = textBlock(this, x, y, width, content, style);
      box.add(t);
      return t;
    };
    const icon = (key: string, x: number, size: number) => box.add(this.add.image(x, y, key).setOrigin(0).setDisplaySize(size, size));

    const headline = won
      ? `You made it to ${lastCalendarYear(d)}, house still standing`
      : `Game over: the house was destroyed in ${calendarYear(d, s.year)}`;
    y += write(0, headline, { ...text.h2, fontSize: '26px', color: won ? colours.good : colours.bad }).height + GAP;

    const stat = (key: IconKey, label: string, value: string) => {
      icon(key, 0, STAT_ICON);
      const x = STAT_ICON + 10;
      const name = write(x, `${label}: `, { ...ROW, color: colours.textDim });
      name.setY(y + (STAT_ICON - name.height) / 2);
      box.add(this.add.text(x + name.width, name.y, value, { ...ROW, fontStyle: 'bold' }));
      spoken.push(`${label}: ${value}`);
      y += STAT_ICON + 6;
    };
    const faced = disastersFaced(s);
    const repairs = totalRepairs(s);
    stat('icon-house', 'Years survived', `${survived} of ${d.balance.gameLengthYears}`);
    stat('icon-bank', 'Final bank balance', formatMoney(s.bank));
    stat('icon-repair', 'Repairs made', `${repairs.count} (${formatMoney(repairs.cost)})`);

    // Section headings carry a symbol as well as a colour.
    const section = (title: string, colour: string, iconKey?: string) => {
      y += GAP;
      if (iconKey) icon(iconKey, 0, HEAD_ICON);
      y += write(iconKey ? HEAD_ICON + 8 : 0, title, { ...ROW, fontStyle: 'bold', color: colour }).height + 4;
      spoken.push(title);
    };
    section(`Hazards faced: ${faced.length || 'none'}`, faced.length ? colours.bad : colours.good, 'icon-damage');
    for (const f of faced) {
      const line = `${calendarYear(d, f.year)}: ${DISASTER_NAME[f.disaster]}, ${formatMoney(f.valueLost)} damage`;
      y += write(HEAD_ICON + 8, line, ROW).height + 2;
      spoken.push(line);
    }

    // Upgrades, by whether they reduced damage. Each is shown with its icon, wrapping across the column.
    const upgrades = (title: string, colour: string, mods: Mod[]) => {
      if (mods.length === 0) return;
      section(title, colour);
      let x = 0;
      for (const mod of mods) {
        const name = this.add.text(0, 0, mod.name, ROW);
        const w = MOD_ICON + 6 + name.width;
        if (x > 0 && x + w > innerW) {
          x = 0;
          y += MOD_ICON + 4;
        }
        icon(modIconKey(mod.icon), x, MOD_ICON);
        box.add(name.setPosition(x + MOD_ICON + 6, y + (MOD_ICON - name.height) / 2));
        x += w + 16;
      }
      y += MOD_ICON + 4;
      spoken.push(mods.map((m) => m.name).join(', '));
    };
    const report = upgradeReport(d, s);
    upgrades('✓ Upgrades that reduced damage', colours.good, report.helped);
    upgrades("– Upgrades that didn't reduce any damage", colours.warn, report.didNotHelp);
    upgrades('+ Upgrades that would have reduced damage', colours.bad, report.wouldHaveHelped);

    if (!won && repairs.count === 0 && faced.length > 1) {
      const note = 'No repairs were made. Repairing between hits restores the house to its full value.';
      y += GAP;
      y += write(0, note, { ...ROW, color: colours.textDim }).height;
      spoken.push(note);
    }
    box.setScale(Math.min(1, (colH - PAD * 2) / y));

    // Footprint trend: a simple line chart plus the choices that drove it.
    this.add.image(rightX + PAD, top + 12, 'icon-footprint').setOrigin(0).setDisplaySize(STAT_ICON, STAT_ICON);
    this.add.text(rightX + PAD + STAT_ICON + 10, top + 14, 'Carbon footprint', text.h2);
    const chart = { x: rightX + 30, y: top + 60, w: colW - 60, h: 170 };
    const points = [{ year: 0, t: s.history[0]?.footprintBefore ?? s.footprint }, ...s.history.map((h) => ({ year: h.year, t: h.footprintAfter }))];
    // Same range as the HUD gauge, stretched if the footprint went past it.
    const minT = d.balance.minFootprint;
    const maxT = Math.max(d.balance.footprintGaugeMax, ...points.map((p) => p.t));
    const yFor = (t: number) => chart.y + chart.h - ((t - minT) / (maxT - minT)) * chart.h;
    const g = this.add.graphics();
    // Band gridlines, with no tonne figures: the line's shape shows the trend.
    for (const band of d.weather.bands) {
      const by = yFor(band.min);
      g.lineStyle(1, colours.panelEdge).lineBetween(chart.x, by, chart.x + chart.w, by);
    }
    g.lineStyle(1, colours.panelEdge).lineBetween(chart.x, chart.y, chart.x + chart.w, chart.y);
    const xFor = (year: number) => chart.x + (year / Math.max(1, d.balance.gameLengthYears)) * chart.w;
    g.lineStyle(3, colours.focus);
    g.beginPath();
    points.forEach((p, i) => (i === 0 ? g.moveTo(xFor(p.year), yFor(p.t)) : g.lineTo(xFor(p.year), yFor(p.t))));
    g.strokePath();
    g.fillStyle(colours.focus);
    points.forEach((p) => g.fillCircle(xFor(p.year), yFor(p.t), 4));
    this.add.text(chart.x, chart.y + chart.h + 6, `Start of ${d.balance.startYear}`, { fontFamily: FONT, fontSize: '13px', color: colours.textDim });
    this.add.text(chart.x + chart.w, chart.y + chart.h + 6, `End of ${lastCalendarYear(d)}`, { fontFamily: FONT, fontSize: '13px', color: colours.textDim }).setOrigin(1, 0);

    // Each year's choice, marked by what it did to the footprint (shape as well as colour).
    let choiceY = chart.y + chart.h + 30;
    for (const h of s.history) {
      const q = d.quiz.find((x) => x.id === h.quiz.questionId)!;
      const a = q.answers.find((x) => x.id === h.quiz.answerId)!;
      const delta = h.quiz.footprintDelta;
      const [mark, colour] = delta < 0 ? ['▼', colours.good] : delta > 0 ? ['▲', colours.bad] : ['=', colours.warn];
      const line = `${mark} ${calendarYear(d, h.year)}: ${a.label}`;
      choiceY += textBlock(this, rightX + PAD, choiceY, colW - PAD * 2, line, { ...text.small, fontSize: '16px', lineSpacing: 2, color: colour }).height + 2;
    }

    announce(`${headline}. ${spoken.join('. ')}`);
    const nav = new FocusNav(this);
    nav.add(
      new Button(this, WIDTH / 2 - 150, HEIGHT - EDGE - 56, 300, 56, {
        label: 'Play again',
        fontSize: 22,
        onActivate: () => this.scene.start('Title'),
      }),
    );
    nav.focusFirstAvailable();
    textBlock(this, rightX + 16, top + colH - 14, colW - 32, PLACEHOLDER_NOTE, { ...text.small, fontSize: '12px' }).setOrigin(0, 1);
  }
}
