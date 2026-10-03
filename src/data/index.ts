import balance from './balance.json';
import weather from './weather.json';
import areas from './areas.json';
import houses from './houses.json';
import mods from './mods.json';
import quiz from './quiz.json';
import { parseGameData, type GameData, type RawGameData } from './schemas';

export const rawGameData: RawGameData = { balance, weather, areas, houses, mods, quiz };

/** Validates the bundled JSON. Throws (loudly) if anything is wrong. */
export function loadGameData(): GameData {
  return parseGameData(rawGameData);
}
