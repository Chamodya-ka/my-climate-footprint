import * as Phaser from 'phaser';
import { newGame } from '../sim/turn';
import { data, randomSeed, startNewGame } from '../session';
import { Button, FocusNav } from '../ui/buttons';
import { lastCalendarYear, PLACEHOLDER_NOTE } from '../ui/copy';
import { textBlock } from '../ui/panels';
import { HEIGHT, text, WIDTH } from '../ui/theme';

export class Title extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    const d = data();
    this.add.text(WIDTH / 2, 150, 'My Climate Footprint', text.title).setOrigin(0.5);
    this.add.text(WIDTH / 2, 210, 'A game about floods, landslides and where you choose to live', text.h2).setOrigin(0.5);
    textBlock(
      this,
      WIDTH / 2 - 380,
      270,
      760,
      `Buy a house in a valley-and-harbour city. Each year you get ` +
        `${d.balance.actionsPerTurn} actions to prepare or repair, then the weather is rolled. ` +
        `Keep your house standing from ${d.balance.startYear} to ${lastCalendarYear(d)}.\n\n` +
        `Assume everyone makes the same everyday choices you do: together they change the carbon footprint, and a bigger footprint ` +
        `makes floods and landslides more likely.`,
    ).setAlign('center');
    const nav = new FocusNav(this);
    nav.add(
      new Button(this, WIDTH / 2 - 140, 470, 280, 64, {
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
