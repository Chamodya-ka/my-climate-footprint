import * as Phaser from 'phaser';
import type { House } from '../data/schemas';
import { formatMoney } from '../sim/format';
import { getArea } from '../sim/state';
import { buyHouse, checkBuyHouse } from '../sim/turn';
import { apply, data, state } from '../session';
import { Button, FocusNav } from '../ui/buttons';
import { areaHazardLine } from '../ui/copy';
import { drawHouseScene } from '../ui/houseArt';
import { HousePin, rgbToNumber } from '../ui/mapMarkers';
import { MapView } from '../ui/mapView';
import { panel } from '../ui/panels';
import { getRegionMap } from '../ui/regionMap';
import { drawHUD } from '../ui/HUD';
import { colours, FONT, HEIGHT, text, WIDTH } from '../ui/theme';

const EDGE = 16;
const PAD = 16;
const PANEL_W = 380;
const ART_H = 170;
const BTN_H = 52;
const GAP = 10;
/** Space between the HUD's top-right box and the panel. */
const HUD_GAP = 12;

/** Zooms into the chosen region, with a pin for each house and a panel to buy one. */
export class HouseSelect extends Phaser.Scene {
  private regionId = '';

  constructor() {
    super('HouseSelect');
  }

  init(params: { regionId: string }): void {
    this.regionId = params.regionId;
  }

  create(): void {
    const d = data();
    const s = state();
    const m = getRegionMap();
    const region = d.regions.find((r) => r.id === this.regionId)!;
    const tint = rgbToNumber(m.labels.regions[region.mapRegion]!.tint);
    const map = new MapView(this);
    map.highlight(region.mapRegion);
    const hud = drawHUD(this, d, s);
    const top = hud.rightBottom + HUD_GAP;

    // Right-hand panel: heading, a preview of the chosen house, its details, Buy and Back.
    const px = WIDTH - EDGE - PANEL_W;
    // A solid sidebar behind the money box and panel, so the zoomed map always ends cleanly.
    this.add.rectangle(px - EDGE, 0, WIDTH - px + EDGE, HEIGHT, colours.bg).setOrigin(0).setDepth(-5);
    const inner = PANEL_W - PAD * 2;
    panel(this, px, top, PANEL_W, HEIGHT - EDGE - top).setAlpha(0.96);
    const title = this.add.text(px + PAD, top + PAD, `${region.name}: choose a house`, text.h2);
    const artBox = { x: px + PAD, y: title.y + title.height + 12, w: inner, h: ART_H };
    let art: Phaser.GameObjects.Container | null = null;
    const details = this.add.text(px + PAD, artBox.y + ART_H + 12, 'Choose a house on the map.', {
      fontFamily: FONT,
      fontSize: '16px',
      color: colours.text,
      lineSpacing: 3,
      wordWrap: { width: inner },
    });

    const backY = HEIGHT - EDGE - PAD - BTN_H;
    const nav = new FocusNav(this);
    const buy = new Button(this, px + PAD, backY - GAP - BTN_H, inner, BTN_H, {
      label: 'Buy',
      fontSize: 20,
      disabledReason: 'Choose a house on the map first.',
      onActivate: () => {},
    });
    const back = new Button(this, px + PAD, backY, inner, BTN_H, {
      label: 'Back to the map',
      fontSize: 20,
      onActivate: () => this.scene.start('RegionSelect'),
    });

    let chosen: House | null = null;
    const choose = (house: House) => {
      if (chosen === house) return;
      chosen = house;
      const area = getArea(d, house.areaId);
      const check = checkBuyHouse(s, d, house.id);
      art?.destroy();
      art = drawHouseScene(this, d, house, null, artBox);
      details.setText(
        `${house.name}, ${formatMoney(house.price)}\n${house.blurb}\n\n` +
          `${area.name}, inspired by ${area.inspiredBy}.\n${areaHazardLine(area)}` +
          (check.ok ? '' : `\n\nUnavailable: ${check.reason}`),
      );
      buy.update({
        label: `Buy for ${formatMoney(house.price)}`,
        disabledReason: check.ok ? null : check.reason,
        onActivate: () => {
          if (apply(buyHouse(state(), d, house.id))) this.scene.start('House');
        },
      });
    };

    const houses = d.houses.filter((h) => getArea(d, h.areaId).regionId === region.id);
    // Pins appear once the zoom settles, so they land exactly on their spots.
    map.zoomToRegion(region.mapRegion, { x: 0, y: 0, w: px - EDGE, h: HEIGHT }, () => {
      for (const house of houses) {
        const check = checkBuyHouse(s, d, house.id);
        const at = map.toScreen(house.map.x, house.map.y);
        const pin: HousePin = new HousePin(this, at.x, at.y, house.name, tint, {
          // An unaffordable house can still be chosen, so the panel can explain why.
          onFocus: () => choose(house),
          onActivate: () => {
            choose(house);
            nav.focus(buy);
          },
          disabledReason: check.ok ? null : check.reason,
        });
        nav.add(pin);
      }
      nav.add(buy, back);
      nav.focusIndex(0);
    });
  }
}
