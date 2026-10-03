import * as Phaser from 'phaser';
import { loadGameData } from '../data';
import { installAudio, preloadAudio } from '../ui/audio';
import { setData } from '../session';
import { makeDiceTextures } from '../ui/dice';
import { makeIconTextures } from '../ui/icons';
import { buildHouseAssets, preloadHouseAssets } from '../ui/houseAssets';
import { buildRegionMap, preloadMap } from '../ui/regionMap';

/** Validates all data files (failing loudly), loads the map and audio, and makes generated textures. */
export class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    preloadMap(this);
    preloadHouseAssets(this);
    preloadAudio(this);
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) =>
      this.fail(new Error(`Couldn't load ${file.key} (${String(file.url)})`)),
    );
  }

  create(): void {
    try {
      const data = loadGameData();
      setData(data);
      buildRegionMap(this, data);
      buildHouseAssets(this, data);
    } catch (err) {
      this.fail(err as Error);
    }
    const g = this.add.graphics();
    g.fillStyle(0xffffff).fillRect(0, 0, 2, 12);
    g.generateTexture('raindrop', 2, 12);
    g.clear().fillStyle(0xffffff).fillCircle(5, 5, 5);
    g.generateTexture('dot', 10, 10);
    g.destroy();
    makeIconTextures(this);
    makeDiceTextures(this);
    installAudio(this.game);
    this.scene.start('Title');
  }

  private fail(err: Error): never {
    const el = document.getElementById('fatal');
    if (el) {
      el.style.display = 'block';
      el.textContent = `The game data failed validation, so the game can't start.\n\n${err.message}`;
    }
    this.game.destroy(true);
    throw err;
  }
}
