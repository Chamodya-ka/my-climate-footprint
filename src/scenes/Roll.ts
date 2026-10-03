import * as Phaser from 'phaser';
import { yearlyIncome } from '../sim/economy';
import { formatMoney } from '../sim/format';
import { getArea, getHouse, type GameState, type YearRecord } from '../sim/state';
import { data, state } from '../session';
import { Button, FocusNav } from '../ui/buttons';
import { announce } from '../ui/a11y';
import { playDisasterSound } from '../ui/audio';
import { drawCalendar, CALENDAR_H, CALENDAR_W } from '../ui/calendar';
import { calendarYear, yearVerdict } from '../ui/copy';
import { displayedFootprint, drawHUD } from '../ui/HUD';
import { drawHouseScene, FULL_SCREEN_ART, houseDamageLevel, type ArtBox } from '../ui/houseArt';
import type { DamageLevel } from '../ui/houseAssets';
import { createHouseTransition, type HouseTransition } from '../ui/houseTransitions';
import { panel } from '../ui/panels';
import { colours, HEIGHT, text, WIDTH } from '../ui/theme';

const EDGE = 16;
const PANEL_H = 170;
const INFO_W = 340;
const GAP = 24;
const BUTTON_W = 300;
const INCOME_ICON_SCALE = 1.4;
/** Pause after the last animation (or the verdict, in a quiet year) before the reveal. */
const SETTLE_MS = 400;
/** Light rain while the calendar flips; a hit plays the designer's own storm animation. */
const RAIN_PER_SEC = 60;

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
    const houseDef = getHouse(d, rec.houseId);
    let art = drawHouseScene(this, d, houseDef, shown.house, box).setDepth(-1);
    this.frame = { type: 'onLeave', source: new Phaser.Geom.Rectangle(box.x, box.y, box.w, box.h) };

    // Bottom panel: income, the flipping calendar and what happened, then the continue button.
    const py = HEIGHT - PANEL_H - EDGE;
    const ui = this.add.container(0, 0).setDepth(5);
    ui.add(panel(this, EDGE, py, WIDTH - EDGE * 2, PANEL_H).setFillStyle(colours.panel, 1));
    const heading = this.add.text(EDGE + 16, py + 14, 'One year goes by…', text.h2);
    ui.add(heading);
    // Income arrives at the start of next year, so there's none after the last year or a lost house.
    if (!s.outcome) {
      // "You have earned" over the bank icon with the year's income, e.g. "+$50,000".
      // Next year's income: a share of the house's original value.
      const income = yearlyIncome(d, s.house);
      const earned = this.add.text(EDGE + 16, heading.y + heading.height + 6, 'You have earned', text.body);
      const rowY = earned.y + earned.height + 32;
      const icon = this.add.image(EDGE + 16, rowY, 'icon-bank').setOrigin(0, 0.5).setScale(INCOME_ICON_SCALE);
      const amount = this.add
        .text(icon.x + icon.displayWidth + 12, rowY, `+${formatMoney(income)}`, {
          ...text.h2,
          fontSize: '28px',
          color: colours.good,
        })
        .setOrigin(0, 0.5);
      ui.add([earned, icon, amount]);
      announce(`One year goes by. You have earned +${formatMoney(income)}.`);
    }

    const anyHit = rec.results.some((r) => r.hit);
    // The same light rain every year, so the weather doesn't give the outcome away early.
    this.rain(box, RAIN_PER_SEC);

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

    const region = d.regions.find((rg) => rg.id === getArea(d, houseDef.areaId).regionId)!.mapRegion;
    const wait = (ms: number) => new Promise<void>((resolve) => this.time.delayedCall(ms, resolve));

    calendar.flipYear(() => {
      void (async () => {
        // The words carry the meaning, not just the colour.
        const verdict = yearVerdict(rec.results);
        outcome.setText(verdict).setColor(anyHit ? colours.bad : colours.good);
        announce(verdict);

        // Each disaster that hit plays the designer's flood or landslip animation over the house,
        // stepping the damage picture up one level (to at most 2).
        let level = houseDamageLevel(shown.house);
        let transition: HouseTransition | null = null;
        for (const r of rec.results) {
          if (!r.hit) continue;
          transition ??= createHouseTransition(this, houseDef, box, region, level);
          transition.image.setDepth(-0.5); // over the static house, under the panel
          const next = Math.min(level + 1, 2) as DamageLevel;
          playDisasterSound(this, r.disaster);
          level = await transition.play(r.disaster === 'flood' ? 'flood' : 'landslip', level, next);
        }
        await wait(SETTLE_MS);

        // Reveal the resolved state: HUD, and the house with its upgrades and damage.
        hud.destroy();
        // The year's footprint change (the yearly rise and any mod effects on top of the answer's
        // change, which the gauge already shows): slide the marker the rest of the way.
        hud = drawHUD(this, d, s, { footprintFrom: displayedFootprint(d, shown) });
        art.destroy();
        art = drawHouseScene(this, d, houseDef, s.house, box).setDepth(-1);
        transition?.destroy();
        const nav = new FocusNav(this);
        const button = new Button(this, WIDTH - EDGE - 16 - BUTTON_W, py + PANEL_H - 76, BUTTON_W, 60, {
          label: 'See the year review',
          fontSize: 22,
          onActivate: () => this.scene.start('YearReview'),
        });
        ui.add(button);
        nav.add(button);
        nav.focusFirstAvailable();
      })();
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
}
