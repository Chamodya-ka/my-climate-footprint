import * as Phaser from 'phaser';
import { data, state, takeHudTour } from '../session';
import { playRegionMusic } from '../ui/audio';
import { FocusNav } from '../ui/buttons';
import { kiwiIntro, kiwiRegionLine, kiwiWhereToLive, regionHazardLabel, type KiwiLine } from '../ui/copy';
import { addKiwi, showKiwiGuide } from '../ui/kiwiGuide';
import { RegionLabel, rgbToNumber } from '../ui/mapMarkers';
import { MapView } from '../ui/mapView';
import { getRegionMap } from '../ui/regionMap';
import { drawHUD } from '../ui/HUD';

/** The valley map: Rimu asks where to live; hover a region to hear about it, click it (or its label) to see its houses. */
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

    // Rimu asks where to live, and says a little about the region under the pointer or focus.
    const touring = { on: takeHudTour() };
    const kiwi = addKiwi(this, touring.on);
    const speak = (line: KiwiLine, spokenContext?: string) => kiwi.say(line.text, { heading: line.heading, spokenContext });

    const select = (regionId: string) => {
      playRegionMusic(this.game, d.regions.find((r) => r.id === regionId)!.mapRegion);
      this.scene.start('HouseSelect', { regionId });
    };
    const nav = new FocusNav(this);
    const labelFor = new Map<string, RegionLabel>();

    for (const region of d.regions) {
      const meta = m.labels.regions[region.mapRegion]!;
      const at = map.toScreen(meta.x, meta.y);
      const label = new RegionLabel(this, at.x, at.y, region.name, regionHazardLabel(d, region.id), rgbToNumber(meta.tint), {
        onFocus: () => {
          map.highlight(region.mapRegion);
          // The label shows the name; screen readers still hear it before Rimu's line.
          speak(kiwiRegionLine(d, region), label.describe());
        },
        onActivate: () => select(region.id),
      });
      labelFor.set(region.mapRegion, label);
      nav.add(label);
    }

    // At the start of a new game, Rimu explains the game first, then asks where to live.
    if (touring.on) {
      showKiwiGuide(this, kiwi, kiwiIntro(d), hud.rows, nav, () => {
        touring.on = false;
        speak(kiwiWhereToLive(s));
      });
    } else {
      speak(kiwiWhereToLive(s));
    }

    // Anywhere inside a region works too, not just its label.
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (touring.on) return;
      if (over.length > 0) return; // over a label or Rimu's speech bubble
      const key = map.regionAt(p.x, p.y);
      const label = key ? labelFor.get(key) : undefined;
      if (label) nav.focus(label);
    });
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (touring.on) return;
      if (over.length > 0) return; // a label handles its own clicks; the speech bubble swallows them
      const key = map.regionAt(p.x, p.y);
      const region = d.regions.find((r) => r.mapRegion === key);
      if (region) select(region.id);
    });
  }
}
