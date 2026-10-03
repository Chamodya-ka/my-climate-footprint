import * as Phaser from 'phaser';
import clickUrl from '../../assets/audio/game/click.mp3';
import floodUrl from '../../assets/audio/game/flood.mp3';
import landslideUrl from '../../assets/audio/game/landslide.mp3';
import coastalMusicUrl from '../../assets/audio/game/music_coastal.mp3';
import hillsMusicUrl from '../../assets/audio/game/music_hills.mp3';
import menuMusicUrl from '../../assets/audio/game/music_menu.mp3';
import urbanMusicUrl from '../../assets/audio/game/music_urban.mp3';
import type { Disaster } from '../data/schemas';

/**
 * Music and sound effects. Files are built from the source recordings in assets/audio by
 * tools/audio/process.sh. Sounds live in the game-wide sound manager, and fades run on the
 * game loop rather than scene tweens, so a crossfade carries on through a scene change.
 */
type Sound = Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound | Phaser.Sound.NoAudioSound;

const CLICK = 'sfx-click';
const EFFECT: Record<Disaster, string> = { flood: 'sfx-flood', landslide: 'sfx-landslide' };
/** Plays from the Title screen until the player picks an area on the map. */
const MENU_MUSIC = 'music-menu';
/** One music track per map region. */
const MUSIC: Record<string, string> = {
  coastal: 'music-coastal',
  riverside: 'music-urban',
  hillysides: 'music-hills',
};
const URLS: Record<string, string> = {
  [CLICK]: clickUrl,
  [MENU_MUSIC]: menuMusicUrl,
  [EFFECT.flood]: floodUrl,
  [EFFECT.landslide]: landslideUrl,
  [MUSIC.coastal!]: coastalMusicUrl,
  [MUSIC.riverside!]: urbanMusicUrl,
  [MUSIC.hillysides!]: hillsMusicUrl,
};

const MUSIC_VOLUME = 0.35;
const EFFECT_VOLUME = 0.8;
const CLICK_VOLUME = 0.6;
const CROSSFADE_MS = 1200;
/** How quickly a disaster sound fades when the player moves on before it ends. */
const EFFECT_FADE_MS = 600;

export function preloadAudio(scene: Phaser.Scene): void {
  for (const [key, url] of Object.entries(URLS)) scene.load.audio(key, url);
}

interface Fade {
  from: number;
  to: number;
  elapsed: number;
  ms: number;
  /** Stop and remove the sound once it has faded out. */
  end: boolean;
}

const fades = new Map<Sound, Fade>();
let music: { key: string; sound: Sound } | null = null;

function fade(sound: Sound, to: number, ms: number, end = false): void {
  fades.set(sound, { from: sound.volume, to, elapsed: 0, ms, end });
}

function stepFades(_time: number, delta: number): void {
  for (const [sound, f] of fades) {
    f.elapsed += delta;
    const t = Math.min(1, f.elapsed / f.ms);
    sound.setVolume(f.from + (f.to - f.from) * t);
    if (t < 1) continue;
    fades.delete(sound);
    if (f.end) sound.destroy();
  }
}

/** Starts the fade loop and plays a click on every pointer press. Call once, after loading. */
export function installAudio(game: Phaser.Game): void {
  game.events.on(Phaser.Core.Events.STEP, stepFades);
  game.canvas.addEventListener('pointerdown', () => game.sound.play(CLICK, { volume: CLICK_VOLUME }));
}

/**
 * Crossfades to a looping track. Does nothing if that track is already playing.
 * Before the player's first click or key press the browser keeps audio suspended,
 * so the track starts then.
 */
function playMusic(game: Phaser.Game, key: string): void {
  if (music?.key === key) return;
  if (music) fade(music.sound, 0, CROSSFADE_MS, true);
  const sound = game.sound.add(key, { loop: true, volume: 0 }) as Sound;
  sound.play();
  fade(sound, MUSIC_VOLUME, CROSSFADE_MS);
  music = { key, sound };
}

/** The menu music, for the Title screen and the map until an area is picked. */
export function playMenuMusic(game: Phaser.Game): void {
  playMusic(game, MENU_MUSIC);
}

/** Crossfades to a region's music. */
export function playRegionMusic(game: Phaser.Game, mapRegion: string): void {
  const key = MUSIC[mapRegion];
  if (!key) throw new Error(`No music for map region "${mapRegion}"`);
  playMusic(game, key);
}

/** Plays a disaster's sound, fading it out if the scene ends before the sound does. */
export function playDisasterSound(scene: Phaser.Scene, disaster: Disaster): void {
  const sound = scene.sound.add(EFFECT[disaster], { volume: EFFECT_VOLUME }) as Sound;
  sound.once(Phaser.Sound.Events.COMPLETE, () => {
    fades.delete(sound);
    sound.destroy();
  });
  sound.play();
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    if (sound.isPlaying) fade(sound, 0, EFFECT_FADE_MS, true);
  });
}
