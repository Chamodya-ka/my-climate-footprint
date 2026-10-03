import * as Phaser from 'phaser';
import type { House } from '../data/schemas';
import { formatMoney, formatPriceShort } from '../sim/format';
import { getArea } from '../sim/state';
import { buyHouse, checkBuyHouse } from '../sim/turn';
import { apply, data, state } from '../session';
import { Button, FocusNav } from '../ui/buttons';
import { drawHouseScene } from '../ui/houseArt';
import { getZoomData, pinFor, spriteKey, zoomKey } from '../ui/houseAssets';
import { drawHUD } from '../ui/HUD';
import { HouseMarker, rgbToNumber } from '../ui/mapMarkers';
import { MapView } from '../ui/mapView';
import { openPopover, type PopoverAnchor } from '../ui/popover';
import { getRegionMap } from '../ui/regionMap';
import { colours, FONT, HEIGHT, text, WIDTH } from '../ui/theme';

const EDGE = 16;
const PAD = 18;
const FADE_MS = 300;
const BTN_H = 52;
const BACK_W = 240;
const TITLE_Y = 70;

const WINDOW_W = 520;
const BUY_W = 280;
/** Keeps the title clear of the close icon in the corner. */
const CLOSE_CLEAR = 24;
const ART_H = 210;
const WINDOW_DEPTH = 20;

const HALF = 0.5;

const capitalise = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * Zooms from the valley map into the chosen region's close-up view, with each
 * house drawn where it stands. Choosing a house opens a window to buy it.
 */
export class HouseSelect extends Phaser.Scene {
  private regionId = '';
  private nav!: FocusNav;

  constructor() {
    super('HouseSelect');
  }

  init(params: { regionId: string }): void {
    this.regionId = params.regionId;
  }

  create(): void {
    const d = data();
    const s = state();
    const region = d.regions.find((r) => r.id === this.regionId)!;
    const tint = rgbToNumber(getRegionMap().labels.regions[region.mapRegion]!.tint);
    const zd = getZoomData();
    const view = zd.regions[region.mapRegion]!;

    const map = new MapView(this);
    map.highlight(region.mapRegion);
    drawHUD(this, d, s);
    this.nav = new FocusNav(this);

    // Heading and the way back sit over the zoomed view.
    const heading = this.add
      .text(WIDTH / 2, TITLE_Y, `${region.name}: choose a house`, {
        fontFamily: FONT,
        fontSize: '26px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#10202b',
        strokeThickness: 5,
      })
      .setOrigin(0.5, 0)
      .setDepth(10)
      .setAlpha(0);
    const back = new Button(this, EDGE, HEIGHT - EDGE - BTN_H, BACK_W, BTN_H, {
      label: 'Back to the map',
      fontSize: 20,
      onActivate: () => this.scene.start('RegionSelect'),
    });
    back.setDepth(10).setAlpha(0);

    // Zoom the map into the region's crop, then cross-fade to the close-up art and drop the houses in.
    // Top-aligned: the close-up art is a little taller than the screen, and houses near its top
    // edge must clear the HUD boxes, so the trim comes off the bottom.
    map.zoomToRect(view.crop, () => {
      const scale = Math.max(WIDTH / zd.width, HEIGHT / zd.height);
      const offX = (WIDTH - zd.width * scale) / 2;
      const offY = 0;
      const zoom = this.add.image(offX, offY, zoomKey(region.mapRegion)).setOrigin(0).setScale(scale).setDepth(-9).setAlpha(0);
      this.tweens.add({ targets: [zoom, heading, back], alpha: 1, duration: FADE_MS });

      const houses = d.houses
        .filter((h) => getArea(d, h.areaId).regionId === region.id)
        .map((h) => ({ house: h, pin: pinFor(d, h) }))
        .sort((a, b) => a.pin.x - b.pin.x); // focus order follows the picture, left to right
      for (const { house, pin } of houses) {
        const spriteH = pin.spriteH * scale;
        const check = checkBuyHouse(s, d, house.id);
        const marker: HouseMarker = new HouseMarker(
          this,
          offX + pin.x * scale,
          offY + pin.y * scale,
          house.name,
          {
            texture: spriteKey(house.sprite),
            w: pin.spriteW * scale,
            h: pin.spriteH * scale,
            anchorY: pin.anchorY,
            contentTop: pin.contentTop,
            tagBelow: pin.tagBelow,
            price: formatPriceShort(house.price),
            tier: capitalise(house.tier),
            tint,
          },
          // Unaffordable houses can still be opened, so the window can explain why.
          {
            onActivate: () =>
              this.openWindow(house, this.nav.indexOf(marker), {
                // The sprite's centre and half-size, so the popover's tail stops at its edge.
                x: marker.x,
                y: marker.y + spriteH * (HALF - pin.anchorY),
                rx: (pin.spriteW * scale) / 2,
                ry: spriteH / 2,
              }),
          },
        );
        const alpha = check.ok ? 1 : 0.6;
        marker.setAlpha(0);
        this.tweens.add({ targets: marker, alpha, duration: FADE_MS });
        this.nav.add(marker);
      }
      this.nav.add(back);
      this.nav.focusIndex(0);
    }, 'top');
  }

  /**
   * A popover growing out of the house, like the upgrade windows: the house's details
   * and a centred Buy button, with a red × on its top-right corner.
   */
  private openWindow(house: House, markerIndex: number, anchor: PopoverAnchor): void {
    const d = data();
    const s = state();
    const check = checkBuyHouse(s, d, house.id);
    this.nav.enabled = false;

    // Measure the content first (positions are set once the popover is placed).
    const inner = WINDOW_W - PAD * 2;
    const title = this.add.text(0, 0, house.name, { ...text.h2, wordWrap: { width: inner - CLOSE_CLEAR } });
    const facts = this.add.text(
      0,
      0,
      `${capitalise(house.tier)} · ${house.bedrooms} bedrooms · ${house.floorArea} m² · built ${house.built}\n` +
        `Floor ${house.floorHeight} m above the ground`,
      { ...text.small, fontSize: '16px', wordWrap: { width: inner } },
    );
    const details = this.add.text(0, 0, house.blurb + (check.ok ? '' : `\n\nUnavailable: ${check.reason}`), {
      fontFamily: FONT,
      fontSize: '16px',
      color: colours.text,
      lineSpacing: 3,
      wordWrap: { width: inner },
    });
    const h = PAD + title.height + 4 + facts.height + PAD + ART_H + PAD + details.height + PAD + BTN_H + PAD;

    const { layer, nav, x0, y0, finish } = openPopover(this, {
      w: WINDOW_W,
      h,
      anchor,
      depth: WINDOW_DEPTH,
      closeLabel: `Close ${house.name}`,
      onClose: () => {
        this.nav.enabled = true;
        this.nav.focusIndex(markerIndex);
      },
    });
    title.setPosition(x0 + PAD, y0 + PAD);
    facts.setPosition(x0 + PAD, title.y + title.height + 4);
    const artBox = { x: x0 + PAD, y: facts.y + facts.height + PAD, w: inner, h: ART_H };
    layer.add([title, facts, drawHouseScene(this, d, house, null, artBox)]);
    details.setPosition(x0 + PAD, artBox.y + ART_H + PAD);
    layer.add(details);

    const buy = new Button(this, x0 + (WINDOW_W - BUY_W) / 2, y0 + h - PAD - BTN_H, BUY_W, BTN_H, {
      label: `Buy for ${formatMoney(house.price)}`,
      fontSize: 19,
      disabledReason: check.ok ? null : check.reason,
      onActivate: () => {
        if (apply(buyHouse(state(), d, house.id))) this.scene.start('House');
      },
    });
    layer.add(buy);
    nav.add(buy);
    finish();
    // The close icon comes after Buy; start there when the house can't be bought.
    nav.focusIndex(check.ok ? 0 : 1);
  }
}
