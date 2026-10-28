import Phaser from 'phaser';
import { audio } from './audio/AudioManager';
import { music } from './audio/music';
import { computeScale, fitFactor, isTouchDevice, VIEW_H, VIEW_W } from './game/display';
import { settings } from './game/settings';
import { padMenu } from './input/gamepad';
import { keyboard } from './input/keyboard';
import { touchUI, type TouchMode } from './input/touch';
import { BootScene } from './scenes/BootScene';
import { HudScene } from './scenes/HudScene';
import { MatchScene } from './scenes/MatchScene';
import { TitleScene } from './scenes/TitleScene';
import { ArtDebugScene } from './scenes/ArtDebugScene';
import { BackgroundScene } from './scenes/BackgroundScene';
import { ControlsScene } from './scenes/ControlsScene';
import { CreatorScene } from './scenes/CreatorScene';
import { SettingsScene } from './scenes/SettingsScene';
import { LobbyScene } from './scenes/LobbyScene';
import { TrailerOverlay } from './trailer/overlay';
import { installTrailerDriver } from './trailer/driver';

keyboard.attach(window);

// Phones and tablets: fit-to-screen canvas + on-screen controls (src/input/touch.ts)
const touch = isTouchDevice();
const fit = () => {
  document.documentElement.style.setProperty('--fit', String(fitFactor()));
  document.documentElement.style.setProperty('--vh', `${window.innerHeight}px`);
};
if (touch) {
  document.documentElement.classList.add('touch');
  fit();
  touchUI.attach();
}

// Show uncaught errors on screen (players can report them; the game keeps running if it can).
const crash = (msg: string) => {
  const el = document.getElementById('crash');
  if (!el) return;
  el.style.display = 'block';
  el.textContent = `Something broke (v${__APP_VERSION__}): ${msg}\nPlease report it. Press F5 to reload.`;
};
window.addEventListener('error', (e) => crash(String(e.message || e.error)));
window.addEventListener('unhandledrejection', (e) => crash(String(e.reason)));

let k = computeScale();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: VIEW_W * k,
  height: VIEW_H * k,
  pixelArt: true,
  roundPixels: true,
  backgroundColor: '#0b0912',
  scale: { mode: Phaser.Scale.NONE },
  input: { keyboard: false, gamepad: false, mouse: true, touch: false },
  audio: { noAudio: true },
  disableContextMenu: true,
  // trailer capture reads the canvas after each frame
  render: { preserveDrawingBuffer: new URLSearchParams(location.search).has('trailer') },
  // ?timer=1 drives the loop with setTimeout (hidden tabs / automated tests where rAF is paused)
  fps: { target: 60, forceSetTimeOut: new URLSearchParams(location.search).has('timer') },
  scene: [BootScene, BackgroundScene, TitleScene, LobbyScene, ControlsScene, CreatorScene, SettingsScene, MatchScene, HudScene, ArtDebugScene, TrailerOverlay],
});
game.registry.set('scale', k);
if (new URLSearchParams(location.search).has('trailer')) installTrailerDriver(game);

// Menus read justPressed() during scene updates; clear edges once per game step.
game.events.on(Phaser.Core.Events.PRE_STEP, () => padMenu.update());
game.events.on(Phaser.Core.Events.POST_STEP, () => keyboard.endFrame());

if (touch) {
  // which on-screen controls to show: the match sticks/buttons while playing, a D-pad everywhere else
  game.events.on(Phaser.Core.Events.PRE_STEP, () => {
    const keys = game.scene.getScenes(true).map((s) => s.scene.key);
    let mode: TouchMode = 'menu';
    if (keys.includes('trailerHud') || keys.length === 0 || (keys.length === 1 && keys[0] === 'boot')) mode = 'off';
    else if (keys.includes('match')) {
      const ms = game.scene.getScene('match') as unknown as MatchScene;
      if (ms.match) {
        // (a phone turned upright hides the game: stop the clock instead of getting killed)
        if (window.innerHeight > window.innerWidth) ms.paused = true;
        mode = ms.replay ? 'skip' : ms.paused || ms.overlayOpen ? 'menu' : 'game';
        touchUI.setHero(ms.players.some((p) => p.input === 'kb0' && !!p.spawn.hero));
      }
    }
    touchUI.setMode(mode);
  });

  // first tap: full screen, landscape, screen kept awake (best effort: iOS Safari allows none of the first two)
  let wake: { release(): Promise<void> } | null = null;
  const keepAwake = () => {
    const wl = (navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock;
    wl?.request('screen').then((l) => (wake = l)).catch(() => undefined);
  };
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && wake) keepAwake();
  });
  window.addEventListener(
    'pointerdown',
    () => {
      keepAwake();
      const el = document.documentElement;
      if (!document.fullscreenElement && el.requestFullscreen) {
        el.requestFullscreen({ navigationUI: 'hide' })
          .then(() => (screen.orientation as unknown as { lock?(o: string): Promise<void> }).lock?.('landscape'))
          .catch(() => undefined);
      }
    },
    { once: true },
  );
}

window.addEventListener('resize', () => {
  if (touch) fit();
  const nk = computeScale();
  if (nk === k) return;
  k = nk;
  game.scale.resize(VIEW_W * k, VIEW_H * k);
  game.registry.set('scale', k);
  game.events.emit('rescale', k);
});

// Browsers only start audio after a user gesture.
const unlock = () => {
  audio.unlock();
  audio.setVolumes(settings.masterVolume, settings.sfxVolume, settings.musicVolume);
  music.resume();
};
window.addEventListener('keydown', unlock);
window.addEventListener('pointerdown', unlock);

// Debug / test handle (Playwright reads this).
(window as unknown as { __GAME__: unknown }).__GAME__ = {
  game,
  match: () => (game.scene.getScene("match") as unknown as MatchScene | null)?.match ?? null,
  scene: () => game.scene.getScenes(true).map((s) => s.scene.key),
};
