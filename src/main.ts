import * as Phaser from 'phaser';
import { colours, HEIGHT, WIDTH } from './ui/theme';
import { Boot } from './scenes/Boot';
import { Title } from './scenes/Title';
import { RegionSelect } from './scenes/RegionSelect';
import { HouseSelect } from './scenes/HouseSelect';
import { HouseScene } from './scenes/House';
import { Quiz } from './scenes/Quiz';
import { Roll } from './scenes/Roll';
import { YearReview } from './scenes/YearReview';
import { FinalReport } from './scenes/FinalReport';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: colours.bg,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [Boot, Title, RegionSelect, HouseSelect, HouseScene, Quiz, Roll, YearReview, FinalReport],
});

// Exposed in development only, for debugging and browser testing.
if (import.meta.env.DEV) void import('./devtools').then((m) => m.installDevtools(game));
