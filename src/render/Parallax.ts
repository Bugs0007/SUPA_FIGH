import Phaser from 'phaser';
import { BACKGROUNDS, bakeBackground, releaseBackground, type BackgroundDef, type BgLayer } from '../art/backgroundArt';

interface Sprite {
  layer: BgLayer;
  img: Phaser.GameObjects.TileSprite;
  /** horizontal parallax factor */
  factor: number;
  /** extra px/s drift (clouds) */
  drift: number;
}

/**
 * The parallax stack of one theme (far, clouds, mid, near, plus an animated light/shimmer overlay that rides
 * one of them). Screen-space TileSprites; `update` scrolls them from a camera centre. Used by the match
 * backdrop (BackgroundScene) and the title screen.
 */
export class ParallaxBackdrop {
  private sprites: Sprite[] = [];
  private fxKeys: string[] = [];
  private fxSprite: Sprite | null = null;
  private fxFrame = -1;
  theme = '';
  private t = 0;

  /**
   * `release`: free the previous theme's textures when switching (title screen: it cycles through every map).
   * `animate`: bake and play the fx overlay frames.
   */
  constructor(private scene: Phaser.Scene, private w: number, private h: number, private depth = 0, private opts: { release?: boolean; animate?: boolean } = {}) {}

  get def(): BackgroundDef {
    return BACKGROUNDS[this.theme] ?? BACKGROUNDS.arena;
  }

  setTheme(theme: string): void {
    if (theme === this.theme && this.sprites.length) return;
    const old = this.theme;
    this.destroy();
    if (old && old !== theme && this.opts.release) releaseBackground(this.scene, old);
    this.theme = theme;
    const def = this.def;
    const keys = bakeBackground(this.scene, theme, { fx: this.opts.animate !== false });
    const add = (layer: BgLayer, key: string | null, factor: number, drift = 0): Sprite | null => {
      if (!key) return null;
      const img = this.scene.add.tileSprite(0, 0, this.w, this.h, key).setOrigin(0, 0).setDepth(this.depth + this.sprites.length * 0.01);
      const s = { layer, img, factor, drift };
      this.sprites.push(s);
      return s;
    };
    const fxOn = def.fx?.on;
    const addFx = (host: BgLayer, factor: number) => {
      if (fxOn === host && keys.fx.length) this.fxSprite = add('fx', keys.fx[0], factor);
    };
    add('far', keys.far, def.far);
    addFx('far', def.far);
    add('clouds', keys.clouds, def.clouds?.factor ?? def.far, def.clouds?.drift ?? 0);
    add('mid', keys.mid, def.mid ?? (def.far + def.near) / 2);
    addFx('mid', def.mid ?? (def.far + def.near) / 2);
    add('near', keys.near, def.near);
    addFx('near', def.near);
    this.fxKeys = keys.fx;
    this.fxFrame = 0;
  }

  /** dt in seconds; cx/cy = the world camera centre (cy = null: no vertical parallax). */
  update(dt: number, cx: number, cy: number | null): void {
    const def = this.def;
    this.t += dt;
    const auto = (def.scroll ?? 0) * this.t;
    // ship at sea: the horizon rocks gently (whole pixels, purely visual)
    const bob = def.bob ? Math.sin(this.t * 0.9) * def.bob : 0;
    for (const s of this.sprites) {
      const ratio = s.factor / Math.max(0.01, def.near);
      s.img.tilePositionX = Math.round(cx * s.factor + auto * ratio + s.drift * this.t);
      const range = 30 + 10 * ratio;
      const y = cy === null ? 0 : Math.max(-range, Math.min(range, -(cy - 300) * s.factor * 0.3));
      s.img.y = Math.round(y + bob * (0.6 + ratio));
    }
    if (this.fxSprite && def.fx && this.fxKeys.length > 1) {
      const f = Math.floor(this.t / def.fx.period) % this.fxKeys.length;
      if (f !== this.fxFrame) {
        this.fxFrame = f;
        this.fxSprite.img.setTexture(this.fxKeys[f]);
      }
    }
  }

  setVisible(v: boolean): void {
    for (const s of this.sprites) s.img.setVisible(v);
  }

  destroy(): void {
    for (const s of this.sprites) s.img.destroy();
    this.sprites = [];
    this.fxSprite = null;
    this.fxKeys = [];
    this.theme = '';
  }
}
