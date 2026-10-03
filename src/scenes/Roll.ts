import * as Phaser from 'phaser';
import { formatMoney } from '../sim/format';
import { getHouse, type GameState, type YearRecord } from '../sim/state';
import { data, state } from '../session';
import { Button, FocusNav } from '../ui/buttons';
import { announce } from '../ui/a11y';
import { drawCalendar, CALENDAR_H, CALENDAR_W } from '../ui/calendar';
import { calendarYear, yearVerdict } from '../ui/copy';
import { drawHUD } from '../ui/HUD';
import { drawHouseScene, FULL_SCREEN_ART, groundY, slopeTop, type ArtBox } from '../ui/houseArt';
import { panel } from '../ui/panels';
import { colours, HEIGHT, text, WIDTH } from '../ui/theme';

const EFFECT_MS = 2200;
const EDGE = 16;
const PANEL_H = 170;
const INFO_W = 340;
const GAP = 24;
const BUTTON_W = 300;
const INCOME_ICON_SCALE = 1.4;

/** The weather roll. The outcome is already decided by the sim; the flipping calendar is cosmetic. */
export class Roll extends Phaser.Scene {
  /** State before the roll, so the HUD and house don't spoil the outcome while the calendar flips. */
  private before: GameState | null = null;
  /** Particles die when they leave the picture, so effects stay inside the frame. */
  private frame: Phaser.Types.GameObjects.Particles.DeathZoneObject | null = null;

  constructor() {
    super('Roll');
  }

  init(params: { before?: GameState }): void {
    this.before = params.before ?? null;
  }

  create(): void {
    const d = data();
    const s = state();
    const rec = s.history[s.history.length - 1] as YearRecord;
    const shown = this.before ?? s;
    let hud = drawHUD(this, d, shown);

    const box: ArtBox = FULL_SCREEN_ART;
    let art = drawHouseScene(this, d, getHouse(d, rec.houseId), shown.house, box).setDepth(-1);
    this.frame = { type: 'onLeave', source: new Phaser.Geom.Rectangle(box.x, box.y, box.w, box.h) };

    // Bottom panel: income, the flipping calendar and what happened, then the continue button.
    const py = HEIGHT - PANEL_H - EDGE;
    const ui = this.add.container(0, 0).setDepth(5);
    ui.add(panel(this, EDGE, py, WIDTH - EDGE * 2, PANEL_H).setFillStyle(colours.panel, 1));
    const heading = this.add.text(EDGE + 16, py + 14, 'One year goes by…', text.h2);
    ui.add(heading);
    // Income arrives at the start of next year, so there's none after the last year or a lost house.
    if (!s.outcome) {
      // The bank icon with the year's income, e.g. "+$50,000".
      const income = d.balance.yearlyIncome;
      const rowY = heading.y + heading.height + 34;
      const icon = this.add.image(EDGE + 16, rowY, 'icon-bank').setOrigin(0, 0.5).setScale(INCOME_ICON_SCALE);
      const amount = this.add
        .text(icon.x + icon.displayWidth + 12, rowY, `+${formatMoney(income)}`, {
          ...text.h2,
          fontSize: '28px',
          color: colours.good,
        })
        .setOrigin(0, 0.5);
      ui.add([icon, amount]);
      announce(`One year goes by. Bank +${formatMoney(income)}.`);
    }

    const anyHit = rec.results.some((r) => r.hit);
    this.rain(box, anyHit ? 400 : 60);

    // A calendar flips through the year: time passing, with no numbers or odds.
    // The sim has already decided the outcome.
    const calX = EDGE + 16 + INFO_W + GAP;
    const calendar = drawCalendar(this, calX, py + (PANEL_H - CALENDAR_H) / 2 + 4, calendarYear(d, rec.year));
    const verdictX = calX + CALENDAR_W + GAP;
    const outcome = this.add.text(verdictX, py + PANEL_H / 2, '', {
      ...text.body,
      fontStyle: 'bold',
      wordWrap: { width: WIDTH - EDGE - 16 - BUTTON_W - GAP - verdictX },
    });
    outcome.setOrigin(0, 0.5);
    ui.add([calendar, outcome]);

    calendar.flipYear(() => {
      // The words carry the meaning, not just the colour.
      const verdict = yearVerdict(rec.results);
      outcome.setText(verdict).setColor(anyHit ? colours.bad : colours.good);
      announce(verdict);
      for (const r of rec.results) if (r.hit) this.disasterEffect(r.disaster, box);
      this.time.delayedCall(anyHit ? EFFECT_MS : 300, () => {
        // Reveal the resolved state.
        hud.destroy();
        hud = drawHUD(this, d, s);
        art.destroy();
        art = drawHouseScene(this, d, getHouse(d, rec.houseId), s.house, box).setDepth(-1);
        const nav = new FocusNav(this);
        const button = new Button(this, WIDTH - EDGE - 16 - BUTTON_W, py + PANEL_H - 76, BUTTON_W, 60, {
          label: 'See the year review',
          fontSize: 22,
          onActivate: () => this.scene.start('YearReview'),
        });
        ui.add(button);
        nav.add(button);
        nav.focusFirstAvailable();
      });
    });
  }

  private rain(box: ArtBox, frequencyPerSec: number): void {
    this.add.particles(0, 0, 'raindrop', {
      x: { min: box.x, max: box.x + box.w },
      y: box.y,
      speedY: { min: 500, max: 700 },
      speedX: -80,
      lifespan: 1000,
      quantity: 1,
      frequency: 1000 / frequencyPerSec,
      alpha: { start: 0.7, end: 0.3 },
      tint: 0xcfe8ff,
      deathZone: this.frame!,
    }).setDepth(1);
  }

  private disasterEffect(disaster: 'flood' | 'landslide', box: ArtBox): void {
    if (disaster === 'flood') {
      const ground = groundY(box);
      // Tween scaleY, not height: Phaser 4 rectangles don't redraw when height changes.
      const depth = box.y + box.h - ground + 70;
      const water = this.add.rectangle(box.x, box.y + box.h, box.w, depth, colours.water, 0.7).setOrigin(0, 1).setDepth(1);
      water.setScale(1, 0);
      this.tweens.add({ targets: water, scaleY: 1, duration: EFFECT_MS * 0.8, ease: 'Sine.easeOut' });
      this.cameras.main.shake(300, 0.003);
    } else {
      const top = slopeTop(box);
      this.add.particles(top.x, top.y, 'dot', {
        speedX: { min: -260, max: -120 },
        speedY: { min: 40, max: 200 },
        gravityY: 400,
        lifespan: 1600,
        quantity: 6,
        frequency: 40,
        duration: EFFECT_MS * 0.6,
        scale: { min: 0.6, max: 1.8 },
        tint: [0x6b4a2b, 0x8a6a46, 0x5a5a5a],
        deathZone: this.frame!,
      }).setDepth(1);
      this.cameras.main.shake(700, 0.012);
    }
  }
}
