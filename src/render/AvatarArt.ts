import type Phaser from 'phaser';
import { armSprite, KURAMA, KURAMA_AIM_PAD, kuramaSprite, SUSANOO, SUSANOO_INK, SUSANOO_MATS, susanooSprite, type ArmSpec } from '../art/avatarSprites';
import { paintRuns } from '../art/pixelRaster';
import { aimSpirit } from '../art/aimSpirit';
import { SUSANOO_LAUNCH, avatarAim } from '../sim/data/heroes';

type G = Phaser.GameObjects.Graphics;

/** Susanoo's animation: flame / wing frames per second, how long the muzzle flash shows, and the rising embers */
export const SUSANOO_FX = { fps: 8, flash: 0.1, embers: 7, emberRate: 0.9, emberRise: 18 };
/** Kurama's flame / tail frames per second */
export const KURAMA_FX = { fps: 8 };

/**
 * Paints the translucent pixel-art spirits and arms of art/avatarSprites.ts (D88). The sprites are baked once per
 * animation frame (runs with their own opacity); painting them is a list of whole-pixel rects. Local coordinates always
 * face the opponent.
 */
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
   * rests. The whole spirit fades as one `alpha` (times its own translucency). A few violet embers rise off it.
   */
  susanoo(x: number, y: number, d: number, level: number, alpha: number, time: number, charge = 1, sinceShot = -1, aim=0): void {
    const lvl = level >= 4 ? 4 : 3;
    const stage =
      sinceShot >= 0 ? (sinceShot < SUSANOO_FX.flash ? SUSANOO.shot : SUSANOO.rest) : Math.min(SUSANOO.stages - 1, Math.floor(Math.max(0, charge) * SUSANOO.stages));
    const frame = Math.floor(time * SUSANOO_FX.fps);
    const sprite = susanooSprite(lvl, stage, frame);
    const fx = Math.round(x);
    const fy = Math.round(y);
    const launch=SUSANOO_LAUNCH[lvl];
    const pose=aimSpirit(sprite,'susanoo',SUSANOO.ax,SUSANOO.ay,SUSANOO.ax+launch.ahead,SUSANOO.ay-launch.up,aim);
    paintRuns(this.back, pose.baked, d > 0 ? fx-SUSANOO.ax-pose.pad : fx+SUSANOO.ax+pose.pad, fy-SUSANOO.ay-pose.pad, d<0, alpha);

    // embers: single pixels rising off the flames and the shoulders, stepping on whole pixels
    for (let i = 0; i < SUSANOO_FX.embers; i++) {
      const phase = (time * SUSANOO_FX.emberRate + i * 0.37) % 1;
      const u = -28 + ((i * 11) % 50) + Math.round(Math.sin(i * 2.3 + time * 3));
      const v = -10 - ((i * 7) % 40) - phase * SUSANOO_FX.emberRise;
      this.back.fillStyle(phase < 0.5 ? SUSANOO_INK.flash2 : SUSANOO_MATS[0].tones[1], alpha * (1 - phase)).fillRect(fx + Math.round(d * u), fy + Math.round(v), 1, phase < 0.3 ? 2 : 1);
    }
  }

  /**
   * Nine-tailed avatar: only exists for Naruto's final ultimate. It crouches over the fighter (his feet on its anchor);
   * `roar` = the Bijudama pose, head up and jaws open around the sim's launch point.
   */
  kurama(x: number, y: number, d: number, alpha: number, time: number, roar = false, aim=0): void {
    const a=avatarAim(aim),sprite = kuramaSprite(Math.floor(time * KURAMA_FX.fps), roar,a);
    const fx = Math.round(x);
    const fy = Math.round(y);
    const pad=a===0?0:KURAMA_AIM_PAD;
    paintRuns(this.back,sprite,d>0?fx-KURAMA.ax-pad:fx+KURAMA.ax+pad,fy-KURAMA.ay-pad,d<0,alpha);
  }
}
