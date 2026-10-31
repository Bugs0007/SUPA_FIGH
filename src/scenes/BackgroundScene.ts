import Phaser from 'phaser';
import { BACKGROUNDS } from '../art/backgroundArt';
import { VIEW_H, VIEW_W } from '../game/display';
import { ParallaxBackdrop } from '../render/Parallax';
import { bindZoom } from './ui';

/**
 * Parallax backdrop rendered underneath the match scene with its own camera (no zoom wobble, no
 * shake). Reads the match camera to scroll the far / clouds / mid / near layers (render/Parallax.ts).
 */
export class BackgroundScene extends Phaser.Scene {
  private backdrop: ParallaxBackdrop | null = null;

  constructor() {
    super('bg');
  }

  create(data: { theme?: string }): void {
    const theme = data?.theme ?? 'arena';
    bindZoom(this, VIEW_W, VIEW_H);
    this.cameras.main.setBackgroundColor((BACKGROUNDS[theme] ?? BACKGROUNDS.arena).sky);
    // Phaser reuses scene instances: the old backdrop's sprites died with the previous run of the scene
    this.backdrop = new ParallaxBackdrop(this, VIEW_W, VIEW_H);
    this.backdrop.setTheme(theme);
  }

  override update(_time: number, deltaMs: number): void {
    const ms = this.scene.get('match') as Phaser.Scene | null;
    const cam = ms?.cameras?.main;
    if (!cam || !this.backdrop) return;
    this.backdrop.update(deltaMs / 1000, cam.worldView.centerX, cam.worldView.centerY);
  }
}
