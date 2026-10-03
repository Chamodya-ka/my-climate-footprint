import * as Phaser from 'phaser';
import { formatTonnes } from '../sim/format';
import { quizForYear } from '../sim/state';
import { answerQuiz } from '../sim/turn';
import { apply, data, state } from '../session';
import { Button, FocusNav } from '../ui/buttons';
import { signedTonnes } from '../ui/copy';
import { drawHUD } from '../ui/HUD';
import { drawBackdrop } from '../ui/houseArt';
import { panel, textBlock } from '../ui/panels';
import { colours, FONT, HEIGHT, text, WIDTH } from '../ui/theme';

const EDGE = 16;
const PAD = 14;
const DETAIL_W = 420;
const COLS = 2;
const BTN_H = 52;
const GAP = 8;

/**
 * End of turn: "What would you do?" One answer per year sets the footprint change.
 * Shown as a dock over the house, so the player still sees what's at stake.
 */
export class Quiz extends Phaser.Scene {
  constructor() {
    super('Quiz');
  }

  create(): void {
    const d = data();
    const s = state();
    drawBackdrop(this, d, s.house);
    drawHUD(this, d, s);
    const q = quizForYear(d, s.year);

    const rows = Math.ceil(q.answers.length / COLS);
    const dockW = WIDTH - EDGE * 2;
    const title = this.add.text(0, 0, 'What would you do?', text.h2);
    const prompt = this.add.text(0, 0, q.prompt, {
      fontFamily: FONT,
      fontSize: '19px',
      color: colours.text,
      wordWrap: { width: dockW - PAD * 2 },
    });
    const headerH = title.height + 4 + prompt.height + 12;
    const dockH = PAD + headerH + rows * BTN_H + (rows - 1) * GAP + PAD;
    const dockY = HEIGHT - EDGE - dockH;

    panel(this, EDGE, dockY, dockW, dockH).setDepth(-1);
    title.setPosition(EDGE + PAD, dockY + PAD);
    prompt.setPosition(EDGE + PAD, dockY + PAD + title.height + 4);

    const top = dockY + PAD + headerH;
    const detailX = WIDTH - EDGE - PAD - DETAIL_W;
    const gridW = detailX - PAD - (EDGE + PAD);
    const bw = (gridW - (COLS - 1) * GAP) / COLS;
    const detail = textBlock(this, detailX, top, DETAIL_W, '', { ...text.small, fontSize: '16px', lineSpacing: 3 });

    const nav = new FocusNav(this);
    q.answers.forEach((answer, i) => {
      nav.add(
        new Button(this, EDGE + PAD + (i % COLS) * (bw + GAP), top + Math.floor(i / COLS) * (BTN_H + GAP), bw, BTN_H, {
          label: answer.label,
          fontSize: 19,
          onFocus: () =>
            detail.setText(
              `If your neighbourhood made this choice, its footprint would change by ` +
                `${signedTonnes(answer.footprintDelta)} this year, on top of the yearly rise of ` +
                `${signedTonnes(d.balance.baseYearlyIncrement)}.\n` +
                `Footprint now: ${formatTonnes(s.footprint)}. A bigger footprint makes disasters more likely ` +
                `for everyone. (Game values, not real-world measurements.)`,
            ),
          onActivate: () => {
            const before = state();
            if (apply(answerQuiz(before, d, answer.id))) this.scene.start('Roll', { before });
          },
        }),
      );
    });
    nav.focusFirstAvailable();
  }
}
