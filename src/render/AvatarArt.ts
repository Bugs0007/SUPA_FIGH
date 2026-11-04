import type Phaser from 'phaser';
import { armSprite,  SUSANOO, SUSANOO_INK, SUSANOO_MATS, susanooArms, susanooCore, susanooSprite, susanooWings, type ArmSpec } from '../art/avatarSprites';
import { paintRuns } from '../art/pixelRaster';
import { easeOut, paintReveal, rising, spreading } from '../art/spiritForm';
import { airBob, paintFinalSpirit } from '../art/finalSpiritArt';
import { avatarLaunch } from '../sim/data/heroes';

type G = Phaser.GameObjects.Graphics;

/** Susanoo animation: flame / wing frames per second, how long the muzzle flash shows, and the rising embers */
export const SUSANOO_FX = { fps: 8, flash: 0.1, embers: 14, emberRate: 0.9, emberRise: 26 };
/**
 * The ultimate wind-up (`ULT_WINDUP`) split by its progress (`charge` 0..1): the spirit forms around the fighter over
 * the first `end` of it, then the bow is drawn / the Bijudama grows in the jaws over the rest.
 */
export const SPIRIT_FORM = { end: 0.62 };

/** progress of `c` through the window [a, b] of the wind-up, 0..1 */
const span = (c: number, a: number, b: number): number => Math.max(0, Math.min(1, (c - a) / (b - a)));
/** ease out with a small overshoot (the bow snapping up to aim) */
const backOut = (t: number): number => { const k = Math.max(0, Math.min(1, t)) - 1; return 1 + k * k * (2.4 * k + 1.4); };

/**
 * The beats of the two final ultimates over the wind-up (`charge` 0..1, `ULT_WINDUP` s). Both rise out of the ground,
 * then unfurl (tails / wings); Kurama then rears up and roars before the Bijudama gathers in its jaws, Susanoo forms
 * its bow, lifts it to aim and draws an arrow of light. The last stretch trembles with the power held back.
 */
export const ULT_BEATS = {
  rise: [0.02, 0.36],
  fan: [0.2, 0.56],
  roar: [0.55, 0.67],
  settle: [0.69, 0.82],
  gather: [0.7, 1],
  bow: [0.4, 0.6],
  lift: [0.57, 0.72],
  arrow: [0.63, 0.84],
  draw: [0.66, 0.95],
  tremble: 0.86,
} as const;

/** How far the Bijudama has gathered (0..1) and its size factor (it swells, then squeezes tight just before the shot). */
export function bijudamaGather(charge: number): { k: number; size: number } {
  const k = span(charge, ...ULT_BEATS.gather);
  const swell = easeOut(k / 0.88);
  const squeeze = span(charge, 0.93, 1);
  return { k, size: Math.max(0.06, swell * (1 - 0.28 * squeeze)) };
}

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
  susanoo(x: number, y: number, d: number, level: number, alpha: number, time: number, charge = 1, sinceShot = -1, aim = 0, air = false): void {
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
    if (lvl === 4) {
      const B = ULT_BEATS;
      const t = shot ? 1 : c;
      const pull = span(t, ...B.draw);
      const draw = shot ? Math.max(0, 1 - sinceShot * 18) : pull * pull * (3 - 2 * pull);
      // the bow comes up from a lowered guard with a small overshoot; after the shot it kicks up and settles
      const lower = shot ? -0.09 * Math.exp(-sinceShot * 9) : 0.3 * (1 - backOut(span(t, ...B.lift)));
      const shake = !shot && t > B.tremble ? Math.round(Math.sin(time * 83) * span(t, B.tremble, 1) * 1.4) : 0;
      paintFinalSpirit(this.back, {
        kind: 's', x: fx + shake, y: fy, facing: d, alpha, time,
        reveal: span(t, ...B.rise), fan: span(t, ...B.fan), weapon: span(t, ...B.bow),
        draw, aim: aim + lower, arrow: span(t, ...B.arrow), released: shot, air,
      });
      const by = fy + (air ? airBob(time) : 0);
      if (air) this.airStream(fx + shake, by, d, 'susanoo', time, alpha * span(t, 0.04, 0.3));
      if (p < 1) this.sigil(fx, fy, p, time, 'susanoo', height, alpha);
      else if (!shot) this.flash(fx, fy, c - SPIRIT_FORM.end, height, 'susanoo', alpha);
      if (!shot) this.motes(fx, by, d, aim + lower, span(t, ...B.arrow) * (1 - span(t, 0.95, 1)), time, 'susanoo', alpha);
      else this.release(fx, by, d, aim, sinceShot, alpha);
      return;
    }
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
   * The fox rises out of the ground with its head low, its tails lifting one after another; then it rears up and roars
   * (jaw thrown wide, shock rings rolling off the muzzle), brings its head down onto the target and holds the jaw open
   * while the Bijudama gathers. Returns the head's extra tilt so the orb sits in the jaws.
   */
  kurama(x: number, y: number, d: number, alpha: number, time: number, _roar = false, aim = 0, charge = 1, recovery = 0, air = false): number {
    const B = ULT_BEATS;
    const c = Math.max(0, Math.min(1, charge));
    const p = Math.min(1, c / SPIRIT_FORM.end);
    const roar = span(c, ...B.roar);
    const settle = span(c, ...B.settle);
    const rear = easeOut(roar);
    const down = settle * settle * (3 - 2 * settle);
    // head: low while forming, thrown up for the roar, down onto the aim for the shot
    const tilt = 0.16 * (1 - rear) - 0.24 * rear * (1 - down);
    // jaw: shut, wide for the roar, held open; it snaps shut after the release
    const jaw = (1.35 * rear - 0.4 * down) * (1 - easeOut(recovery / 0.28));
    const shake = recovery <= 0 && c > B.tremble ? Math.round(Math.sin(time * 79) * span(c, B.tremble, 1) * 1.6) : 0;
    const fx = Math.round(x) + shake;
    const fy = Math.round(y);
    paintFinalSpirit(this.back, {
      kind: 'k', x: fx, y: fy, facing: d, alpha, time,
      reveal: span(c, ...B.rise), fan: span(c, ...B.fan), draw: jaw, aim: aim + tilt, air,
    });
    const by = fy + (air ? airBob(time) : 0);
    if (air) this.airStream(fx, by, d, 'kurama', time, alpha * span(c, 0.04, 0.3));
    if (p < 1) this.sigil(fx, fy, p, time, 'kurama', 226, alpha);
    else this.flash(fx, fy, c - SPIRIT_FORM.end, 226, 'kurama', alpha);
    if (recovery <= 0 && roar > 0 && c < B.settle[1] + 0.06) this.roarRings(fx, by, d, aim + tilt, span(c, B.roar[0] + 0.03, B.settle[1] + 0.06), alpha);
    if (recovery <= 0) this.motes(fx, by, d, aim + tilt, span(c, ...B.gather) * (1 - span(c, 0.95, 1)), time, 'kurama', alpha);
    return tilt;
  }

  /**
   * In the air the spirit has no ground to stand on: its chakra pours up out of the fighter in wavering tongues that
   * widen into the spirit's waist (Susanoo) or belly (Kurama), with sparks rising along them.
   */
  private airStream(fx: number, fy: number, d: number, kind: 'susanoo' | 'kurama', time: number, alpha: number): void {
    if (alpha <= 0) return;
    const g = this.back;
    const [c0, c1, c2] = SIGIL[kind];
    const top = kind === 'susanoo' ? -78 : -34;
    const spread = kind === 'susanoo' ? 30 : 30;
    const center = kind === 'susanoo' ? 0 : -14;
    const bottom = -14;
    // ribbons of flame, one whole-pixel span per row: they leave the fighter as one thin flame and fan out as they climb
    const ribbons = 5;
    for (let i = 0; i < ribbons; i++) {
      const lane = (i / (ribbons - 1)) * 2 - 1;
      for (let v = bottom; v >= top; v--) {
        const t = (bottom - v) / (bottom - top); // 0 at the fighter, 1 at the spirit
        const wob = Math.sin(time * 6.5 + i * 1.9 - t * 7) * (1 + 3 * t);
        const u = (center + lane * spread) * t * t + wob;
        const half = 0.5 + 2.2 * t * (1 - 0.35 * Math.abs(lane));
        const flick = 0.75 + 0.25 * Math.sin(time * 13 + i * 2 + v * 0.4);
        const a = alpha * (0.35 + 0.5 * t) * flick;
        const px = (w: number) => Math.round(fx + d * u - w);
        g.fillStyle(c1, a * 0.45).fillRect(px(half + 1), Math.round(fy + v), Math.round(half * 2 + 2), 1);
        g.fillStyle(c0, a).fillRect(px(half), Math.round(fy + v), Math.max(1, Math.round(half * 2)), 1);
        if (half > 1.6) g.fillStyle(c2, a * 0.8).fillRect(px(0.5), Math.round(fy + v), 1, 1);
      }
    }
    for (let i = 0; i < 12; i++) {
      const ph = (time * 0.9 + i * 0.29) % 1;
      const u = Math.sin(i * 2.1 + time * 2) * spread * ph;
      g.fillStyle(i % 2 ? c2 : c0, alpha * (1 - ph)).fillRect(Math.round(fx + d * u), Math.round(fy - 12 + (top + 12) * ph), 1, 2);
    }
  }

  /** Shock rings rolling off Kurama's muzzle during the roar (`k` 0..1 over the roar). */
  private roarRings(fx: number, fy: number, d: number, aim: number, k: number, alpha: number): void {
    const m = avatarLaunch('naruto', 4, aim);
    const cx = fx + d * m.ahead;
    const cy = fy - m.up;
    const [c0, , c2] = SIGIL.kurama;
    for (let i = 0; i < 3; i++) {
      const q = k * 1.5 - i * 0.22;
      if (q <= 0 || q >= 1) continue;
      const r = 10 + q * 120;
      const n = Math.round(r * 1.1);
      // arcs open toward the facing side, like sound leaving the jaws
      for (let j = 0; j <= n; j++) {
        const a = -1.1 + (2.2 * j) / n;
        const px = cx + d * Math.cos(a) * r;
        const py = cy + Math.sin(a) * r * 0.85;
        this.front.fillStyle(j % 3 ? c0 : c2, alpha * (1 - q) * 0.75).fillRect(Math.round(px), Math.round(py), 2, j % 2 ? 1 : 2);
      }
    }
  }

  /**
   * Chakra gathering at the muzzle (the Bijudama in Kurama's jaws, the tip of Susanoo's arrow): sparks spiralling in from
   * all around, dark and light alternating for the Bijudama, violet for the arrow. `k` 0..1 is how strong the pull is.
   */
  private motes(fx: number, fy: number, d: number, aim: number, k: number, time: number, kind: 'susanoo' | 'kurama', alpha: number): void {
    if (k <= 0) return;
    const m = avatarLaunch(kind === 'kurama' ? 'naruto' : 'sasuke', 4, aim);
    const cx = fx + d * m.ahead;
    const cy = fy - m.up;
    const cols = kind === 'kurama' ? [0x2b1236, 0xfff1c9, 0x7b3f8f, 0xffb347] : [0xcaa0ff, 0xffffff, 0x8a58dc, 0xf3cfff];
    const count = kind === 'kurama' ? 34 : 22;
    const reach = kind === 'kurama' ? 90 : 70;
    const strength = Math.min(1, k * 3);
    for (let i = 0; i < count; i++) {
      const ph = (time * (1.1 + (i % 4) * 0.12) + i * 0.618) % 1;
      const r = 6 + Math.pow(1 - ph, 1.6) * reach * (0.7 + 0.3 * ((i * 37) % 10) / 10);
      const a = i * 2.399 + ph * 2.6;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r * 0.8;
      const big = ph < 0.45 ? 2 : 1;
      this.front.fillStyle(cols[i % cols.length], alpha * strength * Math.min(1, ph * 3)).fillRect(Math.round(px), Math.round(py), big, big);
    }
  }

  /** The instant Susanoo lets go: a flash at the arrow's tip and streaks punched forward. */
  private release(fx: number, fy: number, d: number, aim: number, since: number, alpha: number): void {
    const k = since / 0.22;
    if (k < 0 || k >= 1) return;
    const m = avatarLaunch('sasuke', 4, aim);
    const cx = fx + d * m.ahead;
    const cy = fy - m.up;
    const [c0, , c2] = SIGIL.susanoo;
    const g = this.front;
    const r = 6 + k * 34;
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      g.fillStyle(i % 2 ? c2 : c0, alpha * (1 - k)).fillRect(Math.round(cx + Math.cos(a) * r * 0.45), Math.round(cy + Math.sin(a) * r), 2, 1);
    }
    g.fillStyle(c2, alpha * (1 - k) * 0.8).fillCircle(cx, cy, 7 * (1 - k) + 2);
    const ca = Math.cos(aim) * d;
    const sa = Math.sin(aim);
    for (let i = -2; i <= 2; i++) {
      const off = i * 6;
      const len = (50 - Math.abs(i) * 12) * (0.4 + k);
      g.lineStyle(1, i ? c0 : c2, alpha * (1 - k)).lineBetween(cx - sa * off * d, cy + ca * off * d, cx + ca * len - sa * off * d, cy + sa * len + ca * off * d);
    }
  }

  /** The Bijudama held in the jaws: a dark, swirling sphere with a hot rim, pulsing as it is packed tighter. */
  bijudama(g: G, cx: number, cy: number, r: number, k: number, time: number, alpha = 1): void {
    const x0 = Math.round(cx);
    const y0 = Math.round(cy);
    const pulse = 1 + 0.07 * Math.sin(time * 30) * Math.min(1, k * 2);
    const disc = (rad: number, color: number, a: number, ox = 0, oy = 0) => {
      const rr = Math.max(0.5, rad);
      g.fillStyle(color, a * alpha);
      for (let dy = -Math.floor(rr); dy <= Math.floor(rr); dy++) {
        const half = Math.floor(Math.sqrt(rr * rr - dy * dy) + 0.25);
        g.fillRect(x0 + ox - half, y0 + oy + dy, half * 2 + 1, 1);
      }
    };
    const R = r * pulse;
    disc(R + 6, 0xffb347, 0.12);
    disc(R + 3, 0xffda7b, 0.35);
    disc(R + 1.5, 0x8a3d6a, 0.95);
    disc(R, 0x211427, 1);
    // two bands of lighter chakra swirling inside the sphere
    for (let i = 0; i < 2; i++) {
      const n = Math.max(6, Math.round(R * 3));
      for (let j = 0; j < n; j++) {
        const a = time * (i ? -9 : 7) + (j / n) * Math.PI * 1.3 + i * Math.PI;
        const rr = R * (0.45 + 0.25 * i);
        g.fillStyle(i ? 0x6d3a8a : 0x4a2560, alpha).fillRect(Math.round(x0 + Math.cos(a) * rr), Math.round(y0 + Math.sin(a) * rr * 0.7), 1, 1);
      }
    }
    disc(R * 0.3, 0xe5a6ca, 0.6, -Math.round(R * 0.3), -Math.round(R * 0.3));
  }
}
