import * as Phaser from 'phaser';
import { SPOTS, type Mod, type Spot } from '../data/schemas';
import { formatMoney } from '../sim/format';
import { getHouse, quizForYear, type HouseState } from '../sim/state';
import { answerQuiz, applyMod, checkApplyMod, checkEndTurn, checkRepair, checkSell, endTurn, repair, sell } from '../sim/turn';
import { apply, data, state } from '../session';
import { Button, FocusNav, type ButtonOptions } from '../ui/buttons';
import { calendarYear, modTooltip } from '../ui/copy';
import { confirmDialog } from '../ui/confirm';
import { drawHUD } from '../ui/HUD';
import { drawHouseScene, FULL_SCREEN_ART, spotPositions } from '../ui/houseArt';
import { showQuestion } from '../ui/questionDialog';
import { SPOT_COPY, SpotButton } from '../ui/spots';
import { colours, HEIGHT, text, WIDTH } from '../ui/theme';

const EDGE = 16;
const PAD = 12;
const BTN_W = 300;
const BTN_H = 56;
const GAP = 16;
const WIN_BTN_H = 50;
const WIN_GAP = 6;

const WINDOW_W = 620;
const MOD_BTN_H = 56;
const WINDOW_DEPTH = 20;

interface HouseParams {
  /** Main focus to restore after the scene restarts. */
  focusIndex?: number;
  /** Upgrade window to reopen after buying from it. */
  openSpot?: Spot;
  windowFocus?: number;
}

/**
 * The action phase. The house fills the screen; "+" markers on it open
 * upgrade windows. The dock holds repair, sell and end-of-year.
 */
export class HouseScene extends Phaser.Scene {
  private params: HouseParams = {};
  private nav!: FocusNav;

  constructor() {
    super('House');
  }

  init(params: HouseParams): void {
    this.params = params ?? {};
    // Phaser keeps a scene's last start/restart data; clear it so a later plain
    // scene.start('House') doesn't reopen an old upgrade window.
    this.sys.settings.data = {};
  }

  create(): void {
    const d = data();
    const s = state();
    const house = s.house as HouseState;
    const houseDef = getHouse(d, house.houseId);

    drawHouseScene(this, d, houseDef, house, FULL_SCREEN_ART).setDepth(-10);
    const hud = drawHUD(this, d, s);

    this.nav = new FocusNav(this);

    // "+" markers, left to right so focus order follows the picture.
    const positions = spotPositions(FULL_SCREEN_ART, houseDef);
    const spots = [...SPOTS].sort((a, b) => positions[a].x - positions[b].x);
    for (const spot of spots) {
      const mods = d.mods.filter((m) => m.spot === spot);
      if (mods.length === 0) continue;
      const inPlace = mods.filter((m) => house.permanentMods.includes(m.id) || house.consumables.includes(m.id)).length;
      const marker: SpotButton = new SpotButton(this, positions[spot].x, positions[spot].y, {
        spot,
        count: `${inPlace}/${mods.length}`,
        onActivate: () => this.openWindow(spot, mods, this.nav.indexOf(marker), 0),
      });
      this.nav.add(marker);
    }

    // Buttons tiled along the bottom. Repair only appears when there's damage to fix.
    const buttons: Omit<ButtonOptions, 'fontSize'>[] = [];
    if (house.value < house.fullValue) {
      const repairCheck = checkRepair(s, d);
      buttons.push({
        label: 'Repair the house',
        disabledReason: repairCheck.ok ? null : repairCheck.reason,
        onActivate: () => {
          if (apply(repair(state(), d))) this.scene.restart({ focusIndex: this.nav.focusedIndex } satisfies HouseParams);
        },
      });
    }
    const sellCheck = checkSell(s, d);
    buttons.push({
      label: 'Sell and Move',
      disabledReason: sellCheck.ok ? null : sellCheck.reason,
      onActivate: () =>
        confirmDialog(this, {
          nav: this.nav,
          title: `Sell the ${houseDef.name.toLowerCase()}?`,
          message:
            `You'll get its current value, ${formatMoney(house.value)}` +
            (house.value < house.fullValue ? ` (it's worth ${formatMoney(house.fullValue)} repaired; the damage isn't fixed)` : '') +
            `.\n\nMoving uses the rest of this year, and your upgrades stay with this house. You can't buy it back.`,
          confirmLabel: 'Sell and move',
          onConfirm: () => {
            if (apply(sell(state(), d))) this.scene.start('RegionSelect');
          },
        }),
    });
    const endCheck = checkEndTurn(s);
    buttons.push({
      // "Skip" until an upgrade has been bought this year.
      label: s.thisYear.modsBuilt.length > 0 ? 'Finish Upgrades' : 'Skip Upgrades',
      disabledReason: endCheck.ok ? null : endCheck.reason,
      onActivate: () => {
        const before = state();
        if (apply(endTurn(before, d))) this.scene.start('Roll', { before });
      },
    });
    const rowW = buttons.length * BTN_W + (buttons.length - 1) * GAP;
    buttons.forEach((opts, i) => {
      const x = (WIDTH - rowW) / 2 + i * (BTN_W + GAP);
      this.nav.add(new Button(this, x, HEIGHT - EDGE - BTN_H, BTN_W, BTN_H, { ...opts, fontSize: 20 }));
    });
    this.nav.focusIndex(this.params.focusIndex ?? 0);

    // Each year opens with the question, before any upgrades.
    if (s.phase === 'quiz') {
      showQuestion(this, {
        year: calendarYear(d, s.year),
        question: quizForYear(d, s.year),
        from: hud.footprintBox,
        nav: this.nav,
        onAnswer: (answerId) => {
          if (apply(answerQuiz(state(), d, answerId))) hud.setTrend(state().thisYear.quiz?.footprintDelta ?? null);
        },
        // Restart once the feedback is closed, so the upgrades unlock.
        onDone: () => this.scene.restart({}),
      });
      return;
    }

    const reopen = this.params.openSpot;
    if (reopen) {
      this.openWindow(reopen, d.mods.filter((m) => m.spot === reopen), this.params.focusIndex ?? 0, this.params.windowFocus ?? 0);
    }
  }

  /** A modal window listing the upgrades for one spot on the house. */
  private openWindow(spot: Spot, mods: Mod[], markerIndex: number, focusIndex: number): void {
    const d = data();
    const s = state();
    const house = s.house as HouseState;
    this.nav.enabled = false;

    const layer = this.add.container(0, 0).setDepth(WINDOW_DEPTH);
    const nav = new FocusNav(this);
    const close = () => {
      nav.destroy();
      layer.destroy();
      this.nav.enabled = true;
      this.nav.focusIndex(markerIndex);
    };
    nav.onCancel = close;

    // Dim the house; clicking outside the window closes it.
    const blocker = this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x000000, 0.45).setOrigin(0).setInteractive();
    blocker.on('pointerdown', close);
    layer.add(blocker);

    const x = (WIDTH - WINDOW_W) / 2;
    const left = x + PAD * 2;
    const inner = WINDOW_W - PAD * 4;
    const title = this.add.text(left, 0, `${SPOT_COPY[spot].name} upgrades`, text.h2);
    const intro = this.add.text(left, 0, SPOT_COPY[spot].intro, { ...text.small, wordWrap: { width: inner } });
    const actions = this.add.text(left, 0, `Each upgrade costs ${d.balance.actionsPerMod} action · ${s.actionsLeft} left`, {
      ...text.small,
      fontSize: '16px',
    });
    const info = this.add.text(left, 0, '', { ...text.small, fontSize: '16px', lineSpacing: 3, wordWrap: { width: inner } });
    // Reserve room for the longest tooltip so the window doesn't change size as focus moves.
    const infoH = Math.max(
      ...mods.map((m) => {
        const check = checkApplyMod(s, d, m.id);
        info.setText(modTooltip(m) + (check.ok ? '' : `\nUnavailable: ${check.reason}`));
        return info.height;
      }),
    );
    info.setText('');

    const headerH = title.height + 4 + intro.height + 4 + actions.height + PAD;
    const listH = mods.length * (MOD_BTN_H + WIN_GAP);
    const h = PAD * 2 + headerH + listH + PAD + infoH + PAD + WIN_BTN_H + PAD * 2;
    const y = Math.max(EDGE, (HEIGHT - h) / 2);

    const win = this.add.rectangle(x, y, WINDOW_W, h, colours.panel).setOrigin(0).setStrokeStyle(3, colours.focus);
    win.setInteractive(); // swallow clicks so they don't reach the blocker
    layer.add([win, title, intro, actions, info]);
    title.setY(y + PAD * 2);
    intro.setY(title.y + title.height + 4);
    actions.setY(intro.y + intro.height + 4);

    let by = y + PAD * 2 + headerH;
    mods.forEach((mod, i) => {
      const built = house.permanentMods.includes(mod.id) || house.consumables.includes(mod.id);
      const check = checkApplyMod(s, d, mod.id);
      // Price when it can be bought; otherwise why not, so the reason is visible without focusing it.
      const status = built ? (mod.type === 'consumable' ? '✓ Stocked' : '✓ Built') : check.ok ? formatMoney(mod.cost) : `✕ ${check.reason}`;
      const b = new Button(this, left, by, inner, MOD_BTN_H, {
        label: mod.name,
        detail: status,
        fontSize: 18,
        disabledReason: check.ok ? null : check.reason,
        onFocus: () => info.setText(modTooltip(mod) + (check.ok ? '' : `\nUnavailable: ${check.reason}`)),
        onActivate: () => {
          if (apply(applyMod(state(), d, mod.id))) {
            this.scene.restart({ focusIndex: markerIndex, openSpot: spot, windowFocus: i } satisfies HouseParams);
          }
        },
      });
      layer.add(b);
      nav.add(b);
      by += MOD_BTN_H + WIN_GAP;
    });
    info.setY(by + PAD - WIN_GAP);

    const closeW = 160;
    const closeBtn = new Button(this, x + WINDOW_W - PAD * 2 - closeW, y + h - PAD * 2 - WIN_BTN_H, closeW, WIN_BTN_H, {
      label: 'Close',
      fontSize: 19,
      onActivate: close,
    });
    layer.add(closeBtn);
    nav.add(closeBtn);
    nav.focusIndex(focusIndex);
  }

}
