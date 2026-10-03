import * as Phaser from 'phaser';
import type { YearRecord } from '../sim/state';
import { continueAfterReview } from '../sim/turn';
import { apply, data, state } from '../session';
import { Button, FocusNav } from '../ui/buttons';
import { announce } from '../ui/a11y';
import { calendarYear, yearReview } from '../ui/copy';
import { drawHUD, HUD_HEIGHT } from '../ui/HUD';
import { drawBackdrop } from '../ui/houseArt';
import { panel } from '../ui/panels';
import { colours, FONT, HEIGHT, text, WIDTH } from '../ui/theme';

const EDGE = 16;
const PAD = 14;
const GAP = 10;
const BTN_W = 300;
const BTN_H = 52;
const FONT_SIZES = [17, 16, 15, 14];

/**
 * Explains the year: cause → effect → what helped or would have helped.
 * Three boxes side by side in a dock over the house, which now shows any damage.
 */
export class YearReview extends Phaser.Scene {
  constructor() {
    super('YearReview');
  }

  create(): void {
    const d = data();
    const s = state();
    const rec = s.history[s.history.length - 1] as YearRecord;
    drawBackdrop(this, d, s.house);
    drawHUD(this, d, s);

    const hit = rec.results.some((r) => r.hit);
    const sections = yearReview(d, s, rec);
    const dockW = WIDTH - EDGE * 2;
    const colW = (dockW - PAD * 2 - GAP * (sections.length - 1)) / sections.length;
    const maxDockH = HEIGHT - EDGE - (HUD_HEIGHT + 40);

    // Lay the columns out, shrinking the font until the dock fits below the HUD.
    let columns: { title: Phaser.GameObjects.Text; body: Phaser.GameObjects.Text }[] = [];
    let colH = 0;
    for (const size of FONT_SIZES) {
      columns.forEach((c) => (c.title.destroy(), c.body.destroy()));
      columns = sections.map((sec) => ({
        title: this.add.text(0, 0, sec.title, text.h2),
        body: this.add.text(0, 0, sec.body, {
          fontFamily: FONT,
          fontSize: `${size}px`,
          color: colours.text,
          lineSpacing: 3,
          wordWrap: { width: colW - PAD * 2 },
        }),
      }));
      colH = Math.max(...columns.map((c) => c.title.height + 6 + c.body.height)) + PAD * 2;
      if (PAD + BTN_H + PAD + colH + PAD <= maxDockH) break;
    }

    const dockH = PAD + BTN_H + PAD + colH + PAD;
    const dockY = HEIGHT - EDGE - dockH;
    panel(this, EDGE, dockY, dockW, dockH).setDepth(-2);

    const heading = `${calendarYear(d, rec.year)} review: ${rec.destroyed ? 'the house was destroyed' : hit ? 'disaster struck' : 'a quiet year'}`;
    this.add.text(EDGE + PAD, dockY + PAD + BTN_H / 2, heading, text.h1).setOrigin(0, 0.5);

    const colY = dockY + PAD + BTN_H + PAD;
    columns.forEach((c, i) => {
      const x = EDGE + PAD + i * (colW + GAP);
      this.add.rectangle(x, colY, colW, colH, colours.button, 0.35).setOrigin(0).setStrokeStyle(1, colours.panelEdge).setDepth(-1);
      c.title.setPosition(x + PAD, colY + PAD);
      c.body.setPosition(x + PAD, colY + PAD + c.title.height + 6);
    });
    announce(sections.map((sec) => `${sec.title}. ${sec.body}`).join(' '));

    const label = s.outcome ? 'See the final report' : `Go to ${calendarYear(d, rec.year + 1)}`;
    const nav = new FocusNav(this);
    nav.add(
      new Button(this, WIDTH - EDGE - PAD - BTN_W, dockY + PAD, BTN_W, BTN_H, {
        label,
        fontSize: 21,
        onActivate: () => {
          if (!apply(continueAfterReview(state(), d))) return;
          this.scene.start(state().phase === 'over' ? 'FinalReport' : 'House');
        },
      }),
    );
    nav.focusFirstAvailable();
  }
}
