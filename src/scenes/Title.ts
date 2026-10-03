import * as Phaser from 'phaser';
import { newGame } from '../sim/turn';
import { data, randomSeed, startNewGame } from '../session';
import { playMenuMusic } from '../ui/audio';
import { Button, FocusNav } from '../ui/buttons';
import { PLACEHOLDER_NOTE, titleIntro } from '../ui/copy';
import { textBlock } from '../ui/panels';
import { HEIGHT, text, WIDTH } from '../ui/theme';

export class Title extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    const d = data();
    playMenuMusic(this.game);
    this.add.text(WIDTH / 2, 150, 'My Climate Footprint', text.title).setOrigin(0.5);
    const intro = titleIntro(d);
    const tagline = this.add
      .text(WIDTH / 2, 205, intro.tagline, { ...text.h2, align: 'center', lineSpacing: 6 })
      .setOrigin(0.5, 0);
    const body = textBlock(
      this,
      WIDTH / 2 - 380,
      tagline.y + tagline.height + 28,
      760,
      intro.body,
    ).setAlign('center');
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
    this.add.text(WIDTH / 2, HEIGHT - 70, PLACEHOLDER_NOTE, text.small).setOrigin(0.5);
  }
}
