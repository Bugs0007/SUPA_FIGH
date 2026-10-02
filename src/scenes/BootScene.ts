import Phaser from 'phaser';
import { Art } from '../art';
import { EXTERNAL_SHEETS } from '../art/externalSheets';

/** Bakes every procedural texture, then hands off to the title (or straight to a match). */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  /** Optional external hero sprite sheets (art/externalSheets.ts). Missing files fall back to procedural art. */
  preload(): void {
    for (const s of Object.values(EXTERNAL_SHEETS)) this.load.spritesheet(s.key, s.url, { frameWidth: s.frameW, frameHeight: s.frameH });
    this.load.on('loaderror', (f: { key: string }) => console.warn(`sprite sheet '${f.key}' not found: using procedural art`));
  }

  create(): void {
    Art.bakeShared(this);
    Art.tileset(this, 'arena');
    const params = new URLSearchParams(location.search);
    const target = params.get('scene');
    this.scene.start(target && ['match', 'art', 'lobby', 'controls', 'creator', 'settings'].includes(target) ? target : 'title');
  }
}
