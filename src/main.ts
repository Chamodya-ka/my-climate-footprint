import * as Phaser from 'phaser';
import { colours } from './ui/theme';
import { CANVAS_SIZE, installCrispText } from './ui/resolution';
import { Boot } from './scenes/Boot';
import { Title } from './scenes/Title';
import { RegionSelect } from './scenes/RegionSelect';
import { HouseSelect } from './scenes/HouseSelect';
import { HouseScene } from './scenes/House';
import { Roll } from './scenes/Roll';
import { YearReview } from './scenes/YearReview';
import { FinalReport } from './scenes/FinalReport';

installCrispText();

// The canvas is drawn near the screen's real pixel size; each scene's camera zooms to fit the WIDTH×HEIGHT layout (see ui/resolution.ts).
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: CANVAS_SIZE.width,
  height: CANVAS_SIZE.height,
  backgroundColor: colours.bg,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [Boot, Title, RegionSelect, HouseSelect, HouseScene, Roll, YearReview, FinalReport],
});

// Exposed in development only, for debugging and browser testing.
if (import.meta.env.DEV) void import('./devtools').then((m) => m.installDevtools(game));
