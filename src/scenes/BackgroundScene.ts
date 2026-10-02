import Phaser from 'phaser';
import { BACKGROUNDS, bakeBackground } from '../art/backgroundArt';
import { VIEW_H, VIEW_W } from '../game/display';
import { bindZoom } from './ui';

/**
 * Parallax backdrop rendered underneath the match scene with its own camera (no zoom wobble, no
 * shake). Reads the match camera to scroll the far/near layers.
 */
export class BackgroundScene extends Phaser.Scene {
  private far!: Phaser.GameObjects.TileSprite;
  private near: Phaser.GameObjects.TileSprite | null = null;
  private theme = 'arena';
  private t = 0;

  constructor() {
    super('bg');
  }

  create(data: { theme?: string }): void {
    this.theme = data?.theme ?? 'arena';
    bindZoom(this, VIEW_W, VIEW_H);
    const def = BACKGROUNDS[this.theme] ?? BACKGROUNDS.arena;
    this.cameras.main.setBackgroundColor(def.sky);
    const keys = bakeBackground(this, this.theme);
    this.far = this.add.tileSprite(0, 0, VIEW_W, VIEW_H, keys.far).setOrigin(0, 0);
    this.near = keys.near ? this.add.tileSprite(0, 0, VIEW_W, VIEW_H, keys.near).setOrigin(0, 0) : null;
    this.t = 0;
  }

  override update(_time: number, deltaMs: number): void {
    const ms = this.scene.get('match') as Phaser.Scene | null;
    const cam = ms?.cameras?.main;
    if (!cam) return;
    const def = BACKGROUNDS[this.theme] ?? BACKGROUNDS.arena;
    this.t += deltaMs / 1000;
    const cx = cam.worldView.centerX;
    const cy = cam.worldView.centerY;
    const auto = (def.scroll ?? 0) * this.t;
    this.far.tilePositionX = Math.round(cx * def.far + auto * 0.1);
    this.far.y = Math.round(Math.max(-30, Math.min(30, -(cy - 300) * def.far * 0.3)));
    if (this.near) {
      this.near.tilePositionX = Math.round(cx * def.near + auto);
      this.near.y = Math.round(Math.max(-40, Math.min(40, -(cy - 300) * def.near * 0.3)));
    }
  }
}
