import type Phaser from 'phaser';
import { armSprite, KURAMA, KURAMA_AIM_PAD, kuramaParts, SUSANOO, SUSANOO_INK, SUSANOO_MATS, susanooArms, susanooCore, susanooSprite, susanooWings, type ArmSpec } from '../art/avatarSprites';
import { paintRuns } from '../art/pixelRaster';
import { easeOut, paintReveal, rising, spreading } from '../art/spiritForm';
import { avatarAim } from '../sim/data/heroes';

type G = Phaser.GameObjects.Graphics;

/** Susanoo animation: flame / wing frames per second, how long the muzzle flash shows, and the rising embers */
export const SUSANOO_FX = { fps: 8, flash: 0.1, embers: 14, emberRate: 0.9, emberRise: 26 };
/** Kurama flame / tail frames per second */
export const KURAMA_FX = { fps: 8 };
/**
 * The ultimate wind-up (`ULT_WINDUP`) split by its progress (`charge` 0..1): the spirit forms around the fighter over
 * the first `end` of it, then the bow is drawn / the Bijudama grows in the jaws over the rest.
 */
export const SPIRIT_FORM = { end: 0.62 };

/** the bright edge of the build-up: pale violet for Susanoo, pale gold for Kurama */
const EDGE = { susanoo: 0xe9d4ff, kurama: 0xfff2b0 };
const SIGIL = { susanoo: [0xcaa0ff, 0x8a58dc, 0xffffff], kurama: [0xffc030, 0xf8700c, 0xfff6c8] } as const;

/**
 * Paints the translucent pixel-art spirits and arms of art/avatarSprites.ts (D88). The sprites are baked once per
 * animation frame (runs with their own opacity); painting them is a list of whole-pixel rects. Local coordinates always
 * face the opponent. A spirit does not appear at once: it forms around the fighter (a glowing sigil on the ground, the
 * body rising out of it, the wings or tails unfurling) while the ultimate winds up, so everyone has time to react.
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

  /** The glowing sigil on the ground while a spirit forms: two counter-rotating rings of light, light streaks rising off them, embers drawn in. */
  private sigil(fx: number, fy: number, p: number, time: number, kind: 'susanoo' | 'kurama', height: number, alpha: number): void {
    const [c0, c1, c2] = SIGIL[kind];
    const g = this.back;
    const grow = easeOut(Math.min(1, p * 2.2));
    const fade = 1 - Math.max(0, (p - 0.8) / 0.2);
    if (fade <= 0) return;
    const rx = 70 * grow;
    const ry = rx * 0.16;
    for (const [ring, radius, speed, c] of [[0, 1, 0.9, c0], [1, 0.62, -1.3, c1]] as const) {
      const n = ring ? 18 : 30;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + time * speed;
        const dy = Math.sin(a) * ry * radius;
        const near = dy > 0;
        g.fillStyle(near ? c2 : c, alpha * fade * (near ? 0.95 : 0.6)).fillRect(Math.round(fx + Math.cos(a) * rx * radius), Math.round(fy + dy - 1), near ? 2 : 1, 1);
      }
    }
    // streaks of light rising off the ring
    for (let i = 0; i < 12; i++) {
      const ph = (time * 0.8 + i * 0.37) % 1;
      const a = i * 2.399;
      const sx = fx + Math.round(Math.cos(a) * rx * 0.9);
      const top = (0.25 + (0.75 * ((i * 53) % 10)) / 10) * height * 0.5 * grow;
      g.fillStyle(i % 3 ? c1 : c0, alpha * fade * (1 - ph) * 0.8).fillRect(sx, Math.round(fy - ph * top - 2), 1, 2 + (i % 3));
    }
    // embers spiralling in and up
    for (let i = 0; i < 18; i++) {
      const ph = (time * 0.9 + i * 0.173) % 1;
      const a = i * 2.4 + time * 2;
      const r = rx * 1.05 * (1 - ph);
      g.fillStyle(i % 2 ? c2 : c0, alpha * fade * (1 - ph)).fillRect(Math.round(fx + Math.cos(a) * r), Math.round(fy - 2 - ph * height * 0.62 + Math.sin(a) * r * 0.16), 1, 1 + (ph < 0.4 ? 1 : 0));
    }
  }

  /** The flash ring that goes off the moment a spirit has fully formed (`since` = how far the progress is past the end of the forming). */
  private flash(fx: number, fy: number, since: number, height: number, kind: 'susanoo' | 'kurama', alpha: number): void {
    const k = since / 0.07;
    if (k < 0 || k > 1) return;
    const [c0, , c2] = SIGIL[kind];
    const rx = 36 + 90 * k;
    const ry = rx * 0.2;
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * Math.PI * 2;
      this.back.fillStyle(i % 2 ? c2 : c0, alpha * (1 - k)).fillRect(Math.round(fx + Math.cos(a) * rx), Math.round(fy - 8 - k * height * 0.1 + Math.sin(a) * ry), 2, 1);
    }
    this.back.fillStyle(c2, alpha * (1 - k) * 0.5).fillRect(Math.round(fx - 1), Math.round(fy - height * (0.3 + k * 0.7)), 3, Math.round(height * 0.3));
  }

  /**
   * Sasuke's Susanoo standing over the fighter (feet on the fighter's feet), drawn at exactly one art pixel per world
   * pixel. `charge` 0..1 is the ultimate's wind-up: the spirit forms around him over the first part of it (ground sigil,
   * body rising, wings unfurling), then the bow is drawn; once released (`sinceShot` >= 0 s) the string snaps with a
   * muzzle flash, then rests. The whole spirit fades as one `alpha` (times its own translucency). Violet embers rise off it.
   */
  susanoo(x: number, y: number, d: number, level: number, alpha: number, time: number, charge = 1, sinceShot = -1, aim = 0): void {
    const lvl = level >= 4 ? 4 : 3;
    const frame = Math.floor(time * SUSANOO_FX.fps);
    const fx = Math.round(x);
    const fy = Math.round(y);
    const ox = d > 0 ? fx - SUSANOO.ax : fx + SUSANOO.ax;
    const oy = fy - SUSANOO.ay;
    const flip = d < 0;
    const shot = sinceShot >= 0;
    const c = Math.max(0, Math.min(1, charge));
    const p = shot ? 1 : Math.min(1, c / SPIRIT_FORM.end);
    const height = SUSANOO.height[lvl];
    if (p >= 1) {
      const stage = shot ? (sinceShot < SUSANOO_FX.flash ? SUSANOO.shot : SUSANOO.rest) : Math.min(SUSANOO.stages - 1, Math.floor(((c - SPIRIT_FORM.end) / (1 - SPIRIT_FORM.end)) * SUSANOO.stages));
      paintRuns(this.back, susanooSprite(lvl, stage, frame, aim), ox, oy, flip, alpha);
      if (!shot) this.flash(fx, fy, c - SPIRIT_FORM.end, height, 'susanoo', alpha);
      // embers: single pixels rising off the flames and the shoulders, stepping on whole pixels
      for (let i = 0; i < SUSANOO_FX.embers; i++) {
        const phase = (time * SUSANOO_FX.emberRate + i * 0.37) % 1;
        const u = -50 + ((i * 11) % 100) + Math.round(Math.sin(i * 2.3 + time * 3));
        const v = -14 - ((i * 7) % 110) - phase * SUSANOO_FX.emberRise;
        this.back.fillStyle(phase < 0.5 ? SUSANOO_INK.flash2 : SUSANOO_MATS[0].tones[1], alpha * (1 - phase)).fillRect(fx + Math.round(d * u), fy + Math.round(v), 1, phase < 0.3 ? 2 : 1);
      }
      return;
    }
    const a = alpha * (0.5 + 0.5 * p);
    paintReveal(this.back, susanooCore(lvl, frame), ox, oy, flip, a, rising(SUSANOO.ay, easeOut((p - 0.04) / 0.8) * (height + 14), 12, 1), EDGE.susanoo);
    const wings = susanooWings(lvl, frame);
    if (wings) {
      const [rx, ry] = SUSANOO.wingRoot;
      paintReveal(this.back, wings, ox, oy, flip, a, spreading(SUSANOO.ax + rx, SUSANOO.ay + ry, easeOut((p - 0.5) / 0.5) * 130, 12, 5), EDGE.susanoo);
    }
    if (p > 0.8) paintRuns(this.back, susanooArms(lvl, 0, aim), ox, oy, flip, (alpha * (p - 0.8)) / 0.2);
    this.sigil(fx, fy, p, time, 'susanoo', height, alpha);
  }

  /**
   * Nine-tailed avatar: only exists for Naruto's final ultimate. It crouches over the fighter (his feet on its anchor);
   * `charge` 0..1 is the wind-up: it forms around him (ground sigil, body rising, the nine tails fanning out), then
   * `roar` = the Bijudama pose, head up and jaws open around the sim's launch point.
   */
  kurama(x: number, y: number, d: number, alpha: number, time: number, roar = false, aim = 0, charge = 1): void {
    const frame = Math.floor(time * KURAMA_FX.fps);
    const fx = Math.round(x);
    const fy = Math.round(y);
    const c = Math.max(0, Math.min(1, charge));
    const p = Math.min(1, c / SPIRIT_FORM.end);
    const flip = d < 0;
    if (p >= 1) {
      const a = avatarAim(aim);
      const pad = a === 0 ? 0 : KURAMA_AIM_PAD;
      const ox = d > 0 ? fx - KURAMA.ax - pad : fx + KURAMA.ax + pad;
      const parts = kuramaParts(frame, roar, a);
      paintRuns(this.back, parts.tails, ox, fy - KURAMA.ay - pad, flip, alpha);
      paintRuns(this.back, parts.body, ox, fy - KURAMA.ay - pad, flip, alpha);
      this.flash(fx, fy, c - SPIRIT_FORM.end, KURAMA.height, 'kurama', alpha);
      return;
    }
    const ox = d > 0 ? fx - KURAMA.ax : fx + KURAMA.ax;
    const oy = fy - KURAMA.ay;
    const parts = kuramaParts(frame, false, 0);
    const a = alpha * (0.5 + 0.5 * p);
    // its tails fan out of the base of the spine (design point (-42, -30))
    const tailX = KURAMA.ax - 42 * KURAMA.scale;
    const tailY = KURAMA.ay - 30 * KURAMA.scale;
    paintReveal(this.back, parts.tails, ox, oy, flip, a, spreading(tailX, tailY, easeOut((p - 0.42) / 0.55) * 140, 12, 9), EDGE.kurama);
    paintReveal(this.back, parts.body, ox, oy, flip, a, rising(KURAMA.ay, easeOut((p - 0.04) / 0.76) * (KURAMA.height + 14), 12, 3), EDGE.kurama);
    this.sigil(fx, fy, p, time, 'kurama', KURAMA.height, alpha);
  }
}
