import Phaser from 'phaser';
import { Art } from '../art';

/** Bakes every procedural texture, then hands off to the title (or straight to a match). */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    Art.bakeShared(this);
    Art.tileset(this, 'arena');
    const params = new URLSearchParams(location.search);
    const target = params.get('scene');
    this.scene.start(target && ['match', 'art', 'lobby', 'controls'].includes(target) ? target : 'title');
  }
}
