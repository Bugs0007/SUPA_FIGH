// window.__TRAILER__: frame-exact control for the recorder (scripts/trailer/record.mjs).
// The Phaser loop is stopped and every video frame is produced by one game.step() of exactly 1/60 s, so
// recording is deterministic and independent of how fast the machine renders.
import type Phaser from 'phaser';
import type { MatchScene } from '../scenes/MatchScene';

const DELTA = 16.666667;

export function installTrailerDriver(game: Phaser.Game): void {
  let t = 100000;
  const ms = () => game.scene.getScene('match') as unknown as MatchScene;
  const out = document.createElement('canvas');
  const api = {
    /** match scene up with a trailer rig? */
    ready: () => !!game.scene.isActive('match') && !!ms()?.trailer && !!game.scene.isActive('trailerHud'),
    info: () => {
      const s = ms().trailer!.spec;
      return { frames: s.frames, start: s.start ?? 0, id: s.id };
    },
    /** stop the real-time loop, run the warm-up ticks, arm frame stepping */
    begin: () => {
      game.loop.stop();
      const scene = ms();
      scene.trailer!.live = true;
      scene.trailerFastForward(scene.trailer!.spec.start ?? 0);
      return true;
    },
    /** advance one video frame (sim + render) */
    step: () => {
      t += DELTA;
      game.step(t, DELTA);
      ms().trailer!.endFrame();
    },
    /** current frame as a data URL (optionally downscaled to w x h) */
    capture: (w: number, h: number, type = 'image/png', q = 0.95) => {
      const src = game.canvas;
      if (src.width === w && src.height === h) return src.toDataURL(type, q);
      out.width = w;
      out.height = h;
      const c = out.getContext('2d')!;
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
      c.drawImage(src, 0, 0, w, h);
      return out.toDataURL(type, q);
    },
    audioLog: () => ms().trailer!.audioLog,
    events: () => ms().trailer!.events,
    canvasSize: () => [game.canvas.width, game.canvas.height],
  };
  (window as unknown as { __TRAILER__: typeof api }).__TRAILER__ = api;
}
