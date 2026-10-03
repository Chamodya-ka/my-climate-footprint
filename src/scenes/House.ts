import * as Phaser from 'phaser';
import { SPOTS, type Mod, type Spot } from '../data/schemas';
import { formatMoney } from '../sim/format';
import { getArea, getHouse, quizForYear, type HouseState } from '../sim/state';
import { answerQuiz, applyMod, checkApplyMod, checkEndTurn, checkRepair, checkSell, endTurn, repair, sell } from '../sim/turn';
import { apply, data, state } from '../session';
import { Button, FocusNav, type ButtonOptions } from '../ui/buttons';
import { modTooltip } from '../ui/copy';
import { confirmDialog } from '../ui/confirm';
import { drawHUD } from '../ui/HUD';
import { drawHouseScene, FULL_SCREEN_ART, houseDamageLevel, preloadBackdrop, spotPositions } from '../ui/houseArt';
import { modIconKey } from '../ui/houseAssets';
import { createHouseTransition } from '../ui/houseTransitions';
import { openPopover } from '../ui/popover';
import { showQuestion } from '../ui/questionDialog';
import { SpotButton } from '../ui/spots';
import { HEIGHT, text, WIDTH } from '../ui/theme';

const EDGE = 16;
const PAD = 12;
const BTN_W = 300;
const BTN_H = 56;
const GAP = 16;
const WIN_GAP = 6;
/** Upgrade icon size in the upgrade windows. */
const ICON = 44;

/** Upgrade popover: width and row height. */
const POP_W = 440;
const MOD_BTN_H = 50;
/** The "+" marker's radius, so the tail stops at its edge. */
const MARKER_R = 26;
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

  preload(): void {
    preloadBackdrop(this, data(), state().house);
  }

  create(): void {
    const d = data();
    const s = state();
    const house = s.house as HouseState;
    const houseDef = getHouse(d, house.houseId);

    drawHouseScene(this, d, houseDef, house, FULL_SCREEN_ART, { live: true }).setDepth(-10);
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
          const before = state();
          if (!apply(repair(before, d))) return;
          // Play the designer's repair animation over the house, then show the repaired house.
          const focusIndex = this.nav.focusedIndex;
          this.nav.enabled = false;
          const region = d.regions.find((r) => r.id === getArea(d, houseDef.areaId).regionId)!.mapRegion;
          const from = houseDamageLevel(before.house);
          const tr = createHouseTransition(this, houseDef, FULL_SCREEN_ART, region, from);
          tr.image.setDepth(-5);
          void tr.play('repair', from, 0).then(() => this.scene.restart({ focusIndex } satisfies HouseParams));
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
      const question = quizForYear(d, s.year);
      showQuestion(this, {
        question,
        from: hud.footprintBox,
        nav: this.nav,
        onAnswer: (answerId) => {
          if (!apply(answerQuiz(state(), d, answerId))) return;
          const answer = question.answers.find((a) => a.id === answerId);
          if (answer) hud.showFootprintChange(answer.footprintDelta);
        },
        // Restart once the feedback is closed, so the upgrades unlock.
        onDone: () => this.scene.restart({}),
      });
      return;
    }

    const reopen = this.params.openSpot;
    if (reopen) {
      // Reopened after a purchase: no grow-in animation.
      this.openWindow(reopen, d.mods.filter((m) => m.spot === reopen), this.params.focusIndex ?? 0, this.params.windowFocus ?? 0, false);
    }
  }

  /**
   * A popover listing the upgrades for one spot, growing out of that spot's "+" marker
   * with a tail pointing at it. A red × in its top-right corner closes it (so do Escape
   * and clicking anywhere outside it). It doesn't dim the house.
   */
  private openWindow(spot: Spot, mods: Mod[], markerIndex: number, focusIndex: number, animate = true): void {
    const d = data();
    const s = state();
    const house = s.house as HouseState;
    const marker = spotPositions(FULL_SCREEN_ART, getHouse(d, house.houseId))[spot];
    this.nav.enabled = false;

    // Measure the content first (positions are set once the popover is placed).
    const inner = POP_W - PAD * 2;
    const title = this.add.text(0, 0, 'Property Upgrades', text.h2);
    const upgradesLeft = Math.floor(s.actionsLeft / d.balance.actionsPerMod);
    const actions = this.add.text(0, 0, `You have ${upgradesLeft} upgrade${upgradesLeft === 1 ? '' : 's'} left for this year.`, {
      ...text.small,
      fontSize: '15px',
    });
    const info = this.add.text(0, 0, '', { ...text.small, fontSize: '15px', lineSpacing: 2, wordWrap: { width: inner } });
    // Reserve room for the longest tooltip so the popover doesn't change size as focus moves.
    const infoH = Math.max(
      ...mods.map((m) => {
        const check = checkApplyMod(s, d, m.id);
        info.setText(modTooltip(m) + (check.ok ? '' : `\nUnavailable: ${check.reason}`));
        return info.height;
      }),
    );
    info.setText('');
    const headerH = title.height + 2 + actions.height + PAD;
    const listH = mods.length * (MOD_BTN_H + WIN_GAP) - WIN_GAP;
    const h = PAD + headerH + listH + PAD + infoH + PAD;

    const { layer, nav, x0, y0, finish } = openPopover(this, {
      w: POP_W,
      h,
      anchor: { x: marker.x, y: marker.y, rx: MARKER_R, ry: MARKER_R },
      depth: WINDOW_DEPTH,
      closeLabel: 'Close property upgrades',
      animate,
      onClose: () => {
        this.nav.enabled = true;
        this.nav.focusIndex(markerIndex);
      },
    });
    layer.add([title, actions, info]);
    title.setPosition(x0 + PAD, y0 + PAD);
    actions.setPosition(x0 + PAD, title.y + title.height + 2);

    let rowY = y0 + PAD + headerH;
    mods.forEach((mod, i) => {
      const built = house.permanentMods.includes(mod.id) || house.consumables.includes(mod.id);
      const check = checkApplyMod(s, d, mod.id);
      // Price when it can be bought; otherwise why not, so the reason is visible without focusing it.
      const status = built ? (mod.type === 'consumable' ? '✓ Stocked' : '✓ Built') : check.ok ? formatMoney(mod.cost) : `✕ ${check.reason}`;
      // The upgrade's icon, then its button.
      const icon = this.add.image(x0 + PAD + ICON / 2, rowY + MOD_BTN_H / 2, modIconKey(mod.icon)).setDisplaySize(ICON, ICON);
      if (!check.ok && !built) icon.setAlpha(0.5);
      layer.add(icon);
      const b = new Button(this, x0 + PAD + ICON + WIN_GAP, rowY, inner - ICON - WIN_GAP, MOD_BTN_H, {
        label: mod.name,
        detail: status,
        fontSize: 17,
        align: 'left',
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
      rowY += MOD_BTN_H + WIN_GAP;
    });
    info.setPosition(x0 + PAD, rowY - WIN_GAP + PAD);

    finish();
    nav.focusIndex(focusIndex);
  }


}
