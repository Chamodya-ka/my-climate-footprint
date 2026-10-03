import * as Phaser from 'phaser';
import { formatMoney } from '../sim/format';
import { getHouse } from '../sim/state';
import { data, state, takeHudTour } from '../session';
import { playRegionMusic } from '../ui/audio';
import { FocusNav } from '../ui/buttons';
import { areaHazardLine, hudIntro, regionHazardLabel } from '../ui/copy';
import { showCoachMarks } from '../ui/coachMarks';
import { RegionLabel, rgbToNumber } from '../ui/mapMarkers';
import { MapView } from '../ui/mapView';
import { panel } from '../ui/panels';
import { getRegionMap } from '../ui/regionMap';
import { drawHUD } from '../ui/HUD';
import { colours, FONT, text, WIDTH } from '../ui/theme';

const EDGE = 16;
const PAD = 16;
/** The info panel sits over the mountains in the top-right corner, below the HUD's money box. */
const PANEL_W = 370;
/** Space between the HUD's top-right box and the info panel. */
const GAP = 12;

/** The valley map: hover a region to read about it, click it (or its label) to see its houses. */
export class RegionSelect extends Phaser.Scene {
  constructor() {
    super('RegionSelect');
  }

  create(): void {
    const d = data();
    const s = state();
    const m = getRegionMap();
    const map = new MapView(this);
    const hud = drawHUD(this, d, s);
    const top = hud.rightBottom + GAP;

    // Info panel: heading, then details of the region under the pointer or focus.
    const px = WIDTH - EDGE - PANEL_W;
    const inner = PANEL_W - PAD * 2;
    const move = s.thisYear.move;
    const title = this.add.text(px + PAD, top + PAD, move ? 'Where will you move?' : 'Where will you live?', text.h2);
    const sub = this.add.text(
      px + PAD,
      title.y + title.height + 4,
      move
        ? `You sold the ${getHouse(d, move.fromHouseId).name.toLowerCase()} for ${formatMoney(move.saleValue)}. ` +
            `Moving uses the rest of this year.`
        : `Where you live decides which hazards you face.`,
      { ...text.small, fontSize: '16px', wordWrap: { width: inner } },
    );
    const info = this.add.text(px + PAD, sub.y + sub.height + 12, 'Choose a region on the map.', {
      fontFamily: FONT,
      fontSize: '15px',
      color: colours.text,
      lineSpacing: 3,
      wordWrap: { width: inner },
    });
    const bg = panel(this, px, top, PANEL_W, 10).setDepth(-1);
    const fitPanel = () => bg.setSize(PANEL_W, info.y + info.height + PAD - top);
    fitPanel();
    const infoPanel = [bg, title, sub, info];

    const select = (regionId: string) => {
      playRegionMusic(this.game, d.regions.find((r) => r.id === regionId)!.mapRegion);
      this.scene.start('HouseSelect', { regionId });
    };
    const nav = new FocusNav(this);
    const labelFor = new Map<string, RegionLabel>();

    for (const region of d.regions) {
      const meta = m.labels.regions[region.mapRegion]!;
      const areas = d.areas.filter((a) => a.regionId === region.id);
      const houses = d.houses.filter((h) => areas.some((a) => a.id === h.areaId));
      const cheapest = Math.min(...houses.map((h) => h.price));
      const at = map.toScreen(meta.x, meta.y);
      const label = new RegionLabel(this, at.x, at.y, region.name, regionHazardLabel(d, region.id), rgbToNumber(meta.tint), {
        onFocus: () => {
          map.highlight(region.mapRegion);
          info.setText(
            [
              `${region.name}: ${region.blurb}`,
              ...areas.map((a) => `\n${a.name}\n${areaHazardLine(a)}`),
              `\n${houses.length} house${houses.length === 1 ? '' : 's'} from ${formatMoney(cheapest)}`,
            ].join('\n'),
          );
          fitPanel();
        },
        onActivate: () => select(region.id),
      });
      labelFor.set(region.mapRegion, label);
      nav.add(label);
    }

    // At the start of a new game, explain the HUD boxes before asking where to live.
    let touring = false;
    if (takeHudTour()) {
      touring = true;
      infoPanel.forEach((o) => o.setAlpha(0));
      const steps = hudIntro(d).map((step) => ({ ...step, target: hud.rows[step.key] }));
      showCoachMarks(this, steps, nav, () => {
        touring = false;
        this.tweens.add({ targets: infoPanel, alpha: 1, duration: 250 });
      });
    }

    // Anywhere inside a region works too, not just its label.
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (touring) return;
      const key = map.regionAt(p.x, p.y);
      const label = key ? labelFor.get(key) : undefined;
      if (label) nav.focus(label);
    });
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (touring) return;
      if (over.length > 0) return; // a label handles its own clicks
      const key = map.regionAt(p.x, p.y);
      const region = d.regions.find((r) => r.mapRegion === key);
      if (region) select(region.id);
    });
  }
}
