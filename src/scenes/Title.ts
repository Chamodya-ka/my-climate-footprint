import * as Phaser from 'phaser';
import { newGame } from '../sim/turn';
import { data, randomSeed, startNewGame } from '../session';
import { playMenuMusic } from '../ui/audio';
import { Button, FocusNav } from '../ui/buttons';
import { titleIntro } from '../ui/copy';
import { MapView } from '../ui/mapView';
import { colours, HEIGHT, text, WIDTH } from '../ui/theme';

/** How much of the map the dark wash hides (1 = all of it). */
const MAP_DIM = 0.9;
const TITLE_Y = 330;

export class Title extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    const d = data();
    playMenuMusic(this.game);
    // The valley map, very dark, so the title reads clearly over it.
    new MapView(this);
    this.add.rectangle(0, 0, WIDTH, HEIGHT, colours.bg, MAP_DIM).setOrigin(0).setDepth(-9);
    this.add.text(WIDTH / 2, TITLE_Y, 'My Climate Footprint', text.title).setOrigin(0.5);
    const intro = titleIntro();
    const tagline = this.add
      .text(WIDTH / 2, TITLE_Y + 70, intro.tagline, { ...text.h2, align: 'center', lineSpacing: 6 })
      .setOrigin(0.5, 0);
    const body = this.add.text(WIDTH / 2, tagline.y + tagline.height + 28, intro.body, text.body).setOrigin(0.5, 0);
    const nav = new FocusNav(this);
    nav.add(
      new Button(this, WIDTH / 2 - 140, body.y + body.height + 40, 280, 64, {
        label: 'Start',
        fontSize: 26,
        onActivate: () => {
          startNewGame(newGame(d, randomSeed()));
          this.scene.start('RegionSelect');
        },
      }),
    );
    nav.focusFirstAvailable();
  }
}
