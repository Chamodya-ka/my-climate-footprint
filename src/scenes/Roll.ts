import * as Phaser from 'phaser';
import { formatTonnes } from '../sim/format';
import { getHouse, type GameState, type YearRecord } from '../sim/state';
import { data, state } from '../session';
import { Button, FocusNav } from '../ui/buttons';
import { announce } from '../ui/a11y';
import { DISASTER_NAME } from '../ui/copy';
import { drawHUD } from '../ui/HUD';
import { drawHouseScene, FULL_SCREEN_ART, groundY, slopeTop, type ArtBox } from '../ui/houseArt';
import { panel } from '../ui/panels';
import { colours, FONT, HEIGHT, text, WIDTH } from '../ui/theme';

const DICE_SPIN_MS = 1400;
const EFFECT_MS = 2200;
const EDGE = 16;
const PANEL_H = 170;
const INFO_W = 340;
const DIE_W = 280;

/** The weather roll. The outcome is already decided by the sim; the dice are cosmetic. */
export class Roll extends Phaser.Scene {
  /** State before the roll, so the HUD and house don't spoil the outcome while the dice spin. */
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

    // Bottom panel: the year's odds, one die per disaster, then the continue button.
    const py = HEIGHT - PANEL_H - EDGE;
    const ui = this.add.container(0, 0).setDepth(5);
    ui.add(panel(this, EDGE, py, WIDTH - EDGE * 2, PANEL_H).setFillStyle(colours.panel, 1));
    ui.add(this.add.text(EDGE + 16, py + 14, `Year ${rec.year} weather`, text.h2));
    ui.add(
      this.add.text(
        EDGE + 16,
        py + 54,
        `Neighbourhood footprint: ${formatTonnes(rec.footprintAfter)}\n` +
          rec.results.map((r) => `${DISASTER_NAME[r.disaster]} chance: ${r.chancePercent}%`).join('\n'),
        { ...text.body, wordWrap: { width: INFO_W } },
      ),
    );

    const anyHit = rec.results.some((r) => r.hit);
    this.rain(box, anyHit ? 400 : 60);

    let x = EDGE + 16 + INFO_W + 24;
    let delay = 0;
    for (const r of rec.results) {
      const label = this.add.text(x, py + 14, `Rolling for ${DISASTER_NAME[r.disaster].toLowerCase()}…`, {
        ...text.body,
        wordWrap: { width: DIE_W },
      });
      const die = this.add
        .text(x + DIE_W / 2, py + 110, '00', { fontFamily: FONT, fontSize: '56px', color: colours.text, fontStyle: 'bold' })
        .setOrigin(0.5);
      ui.add([label, die]);
      const spinner = this.time.addEvent({
        delay: 60,
        loop: true,
        startAt: 0,
        callback: () => die.setText(String(Phaser.Math.Between(0, 99)).padStart(2, '0')),
      });
      this.time.delayedCall(delay + DICE_SPIN_MS, () => {
        spinner.remove();
        die.setText(String(r.roll).padStart(2, '0'));
        const verdict = r.hit
          ? `Rolled ${r.roll}, under ${r.chancePercent}: a ${r.disaster} hits.`
          : `Rolled ${r.roll}, not under ${r.chancePercent}: no ${r.disaster}.`;
        label.setText(verdict).setColor(r.hit ? colours.bad : colours.good);
        announce(verdict);
        if (r.hit) this.disasterEffect(r.disaster, box);
      });
      x += DIE_W + 24;
      delay += DICE_SPIN_MS;
    }

    this.time.delayedCall(delay + (anyHit ? EFFECT_MS : 300), () => {
      // Reveal the resolved state.
      hud.destroy();
      hud = drawHUD(this, d, s);
      art.destroy();
      art = drawHouseScene(this, d, getHouse(d, rec.houseId), s.house, box).setDepth(-1);
      const nav = new FocusNav(this);
      const bw = 300;
      const button = new Button(this, WIDTH - EDGE - 16 - bw, py + PANEL_H - 76, bw, 60, {
        label: 'See the year review',
        fontSize: 22,
        onActivate: () => this.scene.start('YearReview'),
      });
      ui.add(button);
      nav.add(button);
      nav.focusFirstAvailable();
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
