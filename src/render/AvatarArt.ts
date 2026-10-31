import type Phaser from 'phaser';
import { armSprite, KURAMA, kuramaSprite, SUSANOO, SUSANOO_INK, SUSANOO_MATS, susanooSprite, type ArmSpec } from '../art/avatarSprites';
import { paintRuns } from '../art/pixelRaster';

type G = Phaser.GameObjects.Graphics;

/** Susanoo's animation: flame / wing frames per second, how long the muzzle flash shows, and the rising embers */
export const SUSANOO_FX = { fps: 8, flash: 0.1, embers: 7, emberRate: 0.9, emberRise: 18 };

/** Paints the pixel-art spirits and arms of art/avatarSprites.ts. Local coordinates always face the opponent. */
export class AvatarArt {
  constructor(
    private back: G,
    readonly front: G,
  ) {}

  /** A spectral or chakra arm from the shoulder, through the elbow, to the fist. */
  arm(g: G, spec: ArmSpec, alpha = 1): void {
    const a = armSprite(spec);
    paintRuns(g, a.baked, a.ox, a.oy, false, alpha);
  }

  /**
   * Sasuke's Susanoo standing over the fighter (feet on the fighter's feet), drawn at exactly one art pixel per world
   * pixel. `charge` 0..1 draws the bow; once released (`sinceShot` >= 0 s) the string snaps with a muzzle flash, then
   * rests. The whole spirit fades as one `alpha`. The only extra layer is a few violet embers rising off it.
   */
  susanoo(x: number, y: number, d: number, level: number, alpha: number, time: number, charge = 1, sinceShot = -1): void {
    const lvl = level >= 4 ? 4 : 3;
    const stage =
      sinceShot >= 0 ? (sinceShot < SUSANOO_FX.flash ? SUSANOO.shot : SUSANOO.rest) : Math.min(SUSANOO.stages - 1, Math.floor(Math.max(0, charge) * SUSANOO.stages));
    const frame = Math.floor(time * SUSANOO_FX.fps);
    const sprite = susanooSprite(lvl, stage, frame);
    const fx = Math.round(x);
    const fy = Math.round(y);
    paintRuns(this.back, sprite, d > 0 ? fx - SUSANOO.ax : fx + SUSANOO.ax, fy - SUSANOO.ay, d < 0, alpha);

    // embers: single pixels rising off the flame tail and the shoulders, stepping on whole pixels
    const k = SUSANOO.scale[lvl];
    for (let i = 0; i < SUSANOO_FX.embers; i++) {
      const phase = (time * SUSANOO_FX.emberRate + i * 0.37) % 1;
      const u = (-26 + ((i * 11) % 30)) * k + Math.round(Math.sin(i * 2.3 + time * 3));
      const v = (-6 - ((i * 7) % 26)) * k - phase * SUSANOO_FX.emberRise;
      this.back.fillStyle(phase < 0.5 ? SUSANOO_INK.flash2 : SUSANOO_MATS[7].light, alpha * (1 - phase)).fillRect(fx + Math.round(d * u), fy + Math.round(v), 1, phase < 0.3 ? 2 : 1);
    }
  }

  /** Nine-tailed avatar: only exists for Naruto's final ultimate. Its mouth matches the real launch point. */
  kurama(x: number, y: number, d: number, alpha: number, time: number): void {
    const sprite = kuramaSprite(Math.floor(time * 6));
    // the eye sits in front of and above the fighter; the tails and shoulders trail behind
    const ex = Math.round(x + d * KURAMA.eyeAhead);
    const ey = Math.round(y - KURAMA.eyeUp);
    paintRuns(this.back, sprite, d > 0 ? ex - KURAMA.cx : ex + KURAMA.cx, ey - KURAMA.cy, d < 0, alpha);
  }
}
