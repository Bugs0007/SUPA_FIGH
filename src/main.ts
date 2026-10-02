import Phaser from 'phaser';
import { audio } from './audio/AudioManager';
import { computeScale, VIEW_H, VIEW_W } from './game/display';
import { settings } from './game/settings';
import { padMenu } from './input/gamepad';
import { keyboard } from './input/keyboard';
import { BootScene } from './scenes/BootScene';
import { HudScene } from './scenes/HudScene';
import { MatchScene } from './scenes/MatchScene';
import { TitleScene } from './scenes/TitleScene';
import { ArtDebugScene } from './scenes/ArtDebugScene';
import { BackgroundScene } from './scenes/BackgroundScene';
import { ControlsScene } from './scenes/ControlsScene';
import { CreatorScene } from './scenes/CreatorScene';
import { LobbyScene } from './scenes/LobbyScene';

keyboard.attach(window);

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
  // ?timer=1 drives the loop with setTimeout (hidden tabs / automated tests where rAF is paused)
  fps: { target: 60, forceSetTimeOut: new URLSearchParams(location.search).has('timer') },
  scene: [BootScene, BackgroundScene, TitleScene, LobbyScene, ControlsScene, CreatorScene, MatchScene, HudScene, ArtDebugScene],
});
game.registry.set('scale', k);

// Menus read justPressed() during scene updates; clear edges once per game step.
game.events.on(Phaser.Core.Events.PRE_STEP, () => padMenu.update());
game.events.on(Phaser.Core.Events.POST_STEP, () => keyboard.endFrame());

window.addEventListener('resize', () => {
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
};
window.addEventListener('keydown', unlock);
window.addEventListener('pointerdown', unlock);

// Debug / test handle (Playwright reads this).
(window as unknown as { __GAME__: unknown }).__GAME__ = {
  game,
  match: () => (game.scene.getScene("match") as unknown as MatchScene | null)?.match ?? null,
  scene: () => game.scene.getScenes(true).map((s) => s.scene.key),
};
