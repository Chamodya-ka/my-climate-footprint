import * as Phaser from 'phaser';
import { allModsBuilt, disastersFaced, totalRepairs, whatWouldHaveHelped } from '../sim/advice';
import { formatMoney, formatTonnes } from '../sim/format';
import { getMod } from '../sim/state';
import { data, state } from '../session';
import { Button, FocusNav } from '../ui/buttons';
import { announce } from '../ui/a11y';
import { DISASTER_NAME, PLACEHOLDER_NOTE, signedTonnes } from '../ui/copy';
import { drawBackdrop } from '../ui/houseArt';
import { panel, textBlock } from '../ui/panels';
import { colours, FONT, HEIGHT, text, WIDTH } from '../ui/theme';

const EDGE = 16;

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
    drawBackdrop(this, d, s.house);
    const colW = 440;
    const leftX = EDGE;
    const rightX = WIDTH - EDGE - colW;
    const top = EDGE;
    const colH = HEIGHT - EDGE * 2;
    panel(this, leftX, top, colW, colH);
    panel(this, rightX, top, colW, colH);
    const title = textBlock(
      this,
      leftX + 16,
      top + 14,
      colW - 32,
      won ? `You made it: ${s.year} years, house still standing` : `Game over: the house was destroyed in year ${s.year}`,
      { ...text.h2, fontSize: '26px' },
    );

    const faced = disastersFaced(s);
    const repairs = totalRepairs(s);
    const mods = allModsBuilt(s);
    const lines = [
      `Years survived: ${survived} of ${d.balance.gameLengthYears}`,
      `Final bank balance: ${formatMoney(s.bank)}`,
      `Repairs made: ${repairs.count} (${formatMoney(repairs.cost)})`,
      `Mods built: ${mods.length ? mods.map((id) => getMod(d, id).name).join(', ') : 'none'}`,
      '',
      `Disasters faced: ${faced.length || 'none'}`,
      ...faced.map((f) => `  Year ${f.year}: ${DISASTER_NAME[f.disaster]}, ${f.percent}% damage (${formatMoney(f.valueLost)})`),
    ];
    const advice = whatWouldHaveHelped(d, s);
    if (advice.length) {
      lines.push('', 'What would have changed the outcome:');
      for (const a of advice) {
        lines.push(
          `  ${a.mod.name} would have cut every ${a.disaster} from ${a.actualPercent}% to ${a.withModPercent}% damage.`,
        );
      }
    }
    if (!won && repairs.count === 0 && faced.length > 1) {
      lines.push('  No repairs were made. Repairing between hits resets the house to full value and buys more hits before destruction.');
    }
    textBlock(this, leftX + 16, top + 14 + title.height + 14, colW - 32, lines.join('\n'), { ...text.body, fontSize: '17px', lineSpacing: 4 });

    // Footprint trend: a simple line chart plus the choices that drove it.
    this.add.text(rightX + 16, top + 14, 'Neighbourhood footprint', text.h2);
    const chart = { x: rightX + 60, y: top + 60, w: colW - 90, h: 170 };
    const points = [{ year: 0, t: s.history[0]?.footprintBefore ?? s.footprint }, ...s.history.map((h) => ({ year: h.year, t: h.footprintAfter }))];
    const maxBand = d.weather.bands[d.weather.bands.length - 1]!.max;
    const maxT = Math.max(maxBand, ...points.map((p) => p.t));
    const g = this.add.graphics();
    // Band gridlines, labelled, so the chart reads without colour.
    for (const band of d.weather.bands) {
      const by = chart.y + chart.h - (band.min / maxT) * chart.h;
      g.lineStyle(1, colours.panelEdge).lineBetween(chart.x, by, chart.x + chart.w, by);
      this.add.text(chart.x - 8, by, `${band.min}t`, { fontFamily: FONT, fontSize: '13px', color: colours.textDim }).setOrigin(1, 0.5);
    }
    this.add.text(chart.x - 8, chart.y, `${maxT}t`, { fontFamily: FONT, fontSize: '13px', color: colours.textDim }).setOrigin(1, 0.5);
    g.lineStyle(1, colours.panelEdge).lineBetween(chart.x, chart.y, chart.x + chart.w, chart.y);
    const xFor = (year: number) => chart.x + (year / Math.max(1, d.balance.gameLengthYears)) * chart.w;
    const yFor = (t: number) => chart.y + chart.h - (t / maxT) * chart.h;
    g.lineStyle(3, colours.focus);
    g.beginPath();
    points.forEach((p, i) => (i === 0 ? g.moveTo(xFor(p.year), yFor(p.t)) : g.lineTo(xFor(p.year), yFor(p.t))));
    g.strokePath();
    g.fillStyle(colours.focus);
    points.forEach((p) => g.fillCircle(xFor(p.year), yFor(p.t), 4));
    this.add.text(chart.x, chart.y + chart.h + 6, 'Start', { fontFamily: FONT, fontSize: '13px', color: colours.textDim });
    this.add.text(chart.x + chart.w, chart.y + chart.h + 6, `Year ${d.balance.gameLengthYears}`, { fontFamily: FONT, fontSize: '13px', color: colours.textDim }).setOrigin(1, 0);

    const choices = s.history.map((h) => {
      const q = d.quiz.find((x) => x.id === h.quiz.questionId)!;
      const a = q.answers.find((x) => x.id === h.quiz.answerId)!;
      return `Y${h.year}: ${a.label} (${signedTonnes(h.quiz.footprintDelta)}) → ${formatTonnes(h.footprintAfter)}`;
    });
    textBlock(this, rightX + 16, chart.y + chart.h + 30, colW - 32, choices.join('\n'), { ...text.small, fontSize: '16px', lineSpacing: 2 });

    announce(`${won ? 'You won.' : 'Game over.'} ${lines.join('. ')}`);
    const nav = new FocusNav(this);
    nav.add(
      new Button(this, WIDTH / 2 - 150, HEIGHT - EDGE - 56, 300, 56, {
        label: 'Play again',
        fontSize: 22,
        onActivate: () => this.scene.start('Title'),
      }),
    );
    nav.focusFirstAvailable();
    textBlock(this, rightX + 16, top + colH - 14, colW - 32, PLACEHOLDER_NOTE, { ...text.small, fontSize: '15px' }).setOrigin(0, 1);
  }
}
