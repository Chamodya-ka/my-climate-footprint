import * as Phaser from 'phaser';
import { newGame } from '../sim/turn';
import { data, randomSeed, startNewGame } from '../session';
import { playMenuMusic } from '../ui/audio';
import { Button, FocusNav } from '../ui/buttons';
import { titleIntro } from '../ui/copy';
import { MapView } from '../ui/mapView';
import { colours, HEIGHT, outline, text, titleButton, WIDTH } from '../ui/theme';
import { sceneConfig } from '../ui/resolution';
import { addTitleClouds } from '../ui/titleClouds';

/** How much of the map the dark wash hides (1 = all of it). Just a hint: the text's black outline keeps it readable. */
const MAP_DIM = 0.12;
const TITLE_Y = 330;
/** Clouds drift between the map and the text. */
const CLOUD_DEPTH = -5;
/** On Start, the title fades while the clouds part. */
const TEXT_FADE_MS = 400;

export class Title extends Phaser.Scene {
  constructor() {
    super(sceneConfig('Title'));
  }

  create(): void {
    const d = data();
    playMenuMusic(this.game);
    // The valley map under a light wash, with clouds drifting over it.
    new MapView(this);
    const wash = this.add.rectangle(0, 0, WIDTH, HEIGHT, colours.bg, MAP_DIM).setOrigin(0).setDepth(-9);
    const clouds = addTitleClouds(this, CLOUD_DEPTH);

    const title = this.add.text(WIDTH / 2, TITLE_Y, 'My Climate Footprint', { ...text.title, ...outline.title }).setOrigin(0.5);
    const intro = titleIntro();
    const tagline = this.add
      .text(WIDTH / 2, TITLE_Y + 70, intro.tagline, { ...text.h2, ...outline.text, align: 'center', lineSpacing: 6 })
      .setOrigin(0.5, 0);
    const body = this.add
      .text(WIDTH / 2, tagline.y + tagline.height + 28, intro.body, { ...text.body, ...outline.text })
      .setOrigin(0.5, 0);
    const nav = new FocusNav(this);
    let starting = false;
    const start = new Button(this, WIDTH / 2 - 140, body.y + body.height + 40, 280, 64, {
      label: 'Start',
      fontSize: 26,
      look: titleButton,
      onActivate: () => {
        if (starting) return;
        starting = true;
        nav.enabled = false;
        startNewGame(newGame(d, randomSeed()));
        // The clouds part to reveal the map, then the game begins on it.
        this.tweens.add({ targets: [title, tagline, body, start, wash], alpha: 0, duration: TEXT_FADE_MS });
        void clouds.part().then(() => this.scene.start('RegionSelect'));
      },
    });
    nav.add(start);
    nav.focusFirstAvailable();
  }
}
