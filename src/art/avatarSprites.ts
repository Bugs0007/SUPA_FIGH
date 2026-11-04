// Pixel-art sprites for the big spirits (Sasuke's Susanoo, Naruto's Kurama) and the spectral / chakra arms that throw
// the transformed punches (D88). They are translucent chakra constructs, treated like Naruto's one-tail cloak scaled up:
// no ink outline, a bright nearly opaque rim, a darker see-through interior (`bakeSpirit`: four flat bands, each with
// its own opacity), a faint halo pixel all around, and flame-tongue edges that flicker over four frames. Still the
// fighters' pixel rules: 1-pixel grid, whole pixels, flat tones, the same pixel density (1 art px = 1 world px).
// Parts are separate groups, so every bone, plate, feather, leg and tail gets its own bright rim over the mass behind.
// Phaser-free: `AvatarArt` (render/) paints the baked runs. Everything faces +x; facing left mirrors it.

import { avatarAim } from '../sim/data/heroes';
import { bake, bakeSpirit, Raster, ScaledPen, type Baked, type Material, type Pt, type SpiritMat } from './pixelRaster';

import { type XY, plume, flame, taper, tongue, rot, wob, spirit, flat, SPIRIT_FRAMES, S_BONE, S_LIMB, S_LIMB2, S_ARMOR, S_PLATE, S_SEAM, S_GLOW, SUSANOO_MATS, SUSANOO_HALO, SUSANOO_INK, SUSANOO_COLOURS, SUSANOO_GLOW } from './spiritKit';
export { SPIRIT_FRAMES, SUSANOO_MATS, SUSANOO_HALO, SUSANOO_INK, SUSANOO_COLOURS, SUSANOO_GLOW };

export { SUSANOO, susanooArms, susanooCore, susanooSprite, susanooWings } from './susanooArt';
import { susanooArms, susanooCore } from './susanooArt';

// ---- Kurama: translucent golden chakra, black seal markings, nine flame tails
const K_TAIL_A = 1;
const K_TAIL_B = 2;
const K_TAIL_C = 3;
const K_FAR = 4;
const K_BODY = 5;
const K_LEG = 6;
const K_HEAD = 7;
const K_JAW = 8;
const K_EAR = 9;
const K_MARK = 10;
const K_MOUTH = 11;
const K_FANG = 12;
const K_EYE = 13;
/**
 * Kurama glows: saturated orange bands (yellow-orange mixed with a dark sky goes brown, so the inner bands lean red),
 * wider bright bands than the violet spirit, and still see-through in the middle
 */
const GOLD_A = [1, 0.92, 0.78, 0.64] as const;
const TAIL_A = [0.95, 0.86, 0.7, 0.54] as const;
const GOLD = [0xfff6c8, 0xffd040, 0xffa424, 0xff8a14] as const;
const GOLD_BANDS = [1, 3, 6] as const;
const TAIL_BANDS = [1, 2, 5] as const;
export const KURAMA_MATS: SpiritMat[] = [
  spirit([0xfff0a0, 0xffc030, 0xff9418, 0xf8700c], TAIL_A, 1, 0, TAIL_BANDS), // tails, three alternating tones
  spirit([0xffe890, 0xffb02a, 0xfa8614, 0xee640a], TAIL_A, 2, 0, TAIL_BANDS),
  spirit([0xfff4b0, 0xffc838, 0xff9c1c, 0xf4760e], TAIL_A, 3, 0, TAIL_BANDS),
  spirit([0xffd878, 0xf8a02a, 0xf0801a, 0xe06010], [0.9, 0.8, 0.64, 0.52], 4, 0, TAIL_BANDS), // far legs and ear (behind)
  { ...spirit(GOLD, GOLD_A, 5, 1, GOLD_BANDS), dither: true }, // the body
  { ...spirit(GOLD, GOLD_A, 6, 2, GOLD_BANDS), dither: true }, // the near legs
  { ...spirit(GOLD, GOLD_A, 7, 2, GOLD_BANDS), dither: true }, // the head
  { ...spirit(GOLD, GOLD_A, 8, 2, GOLD_BANDS), dither: true }, // the lower jaw
  { ...spirit(GOLD, GOLD_A, 9, 1, GOLD_BANDS), dither: true }, // the near ear (behind the head)
  flat(0x2a0c04, 0.9), // the black seal markings, whiskers, slit pupil
  flat(0x4a1006, 0.82), // inside the mouth
  flat(0xfff8e0, 0.95), // fangs and claws
  flat(0xfffbe0, 1), // the eye
];
export const KURAMA_HALO = { c: 0xff8a10, a: 0.35 };
export const KURAMA_COLOURS = new Set<number>([KURAMA_HALO.c, ...KURAMA_MATS.flatMap((m) => [...m.tones])]);
/** the inside-of-the-mouth colour (tests: the Bijudama forms in the open mouth) */
export const KURAMA_MOUTH = KURAMA_MATS[K_MOUTH - 1].tones[0];

/**
 * Kurama's layout: the raster pixel (ax, ay) sits on Naruto's feet (he stands inside the chest, between the legs, as in
 * the reference). The open mouth is right behind `KURAMA_LAUNCH` (sim/data/heroes.ts), where the Bijudama leaves.
 */
export const KURAMA = { ax: 196, ay: 180, w: 350, h: 184, scale: 1.9, /** height of its tallest point (ears, tails) above the feet */ height: 176 };

/**
 * The tails and the rest of the body, baked as two sprites (the show-up animation raises the body first and fans the
 * tails out after). Drawn in design units at `KURAMA.scale` times: its head alone is bigger than a whole fighter.
 */
function kuramaPair(frame: number, roar: boolean, aim=0): { tails: Baked; body: Baked } {
  const pad=aim===0?0:KURAMA_AIM_PAD;
  const ax=0,ay=0;
  const rawB = new Raster(KURAMA.w+pad*2, KURAMA.h+pad*2);
  const rawT = new Raster(KURAMA.w+pad*2, KURAMA.h+pad*2);
  const anchor: Pt = [KURAMA.ax + pad, KURAMA.ay + pad];
  const r = new ScaledPen(rawB, [0, 0], anchor, KURAMA.scale);
  const rt = new ScaledPen(rawT, [0, 0], anchor, KURAMA.scale);
  const Q = (u: number, v: number): XY => [ax + u, ay + v];
  const P = (pts: XY[]): Pt[] => pts.map(([u, v]) => Q(u, v));
  const T = (pts: XY[], w0: number, w1: number): Pt[] => taper(pts.map(([u, v]) => Q(u, v)), w0, w1);
  const R = (u: number, v: number): XY => [Math.round(ax + u), Math.round(ay + v)];
  const mark = (pts: XY[], thick = 1) => r.stroke(pts.map(([u, v]) => R(u, v)), K_MARK, thick);
  const TAILS = [K_TAIL_A, K_TAIL_B, K_TAIL_C];

  // nine tails: fat flame plumes fanned from back-and-down to straight up, swaying, flame flicking off the top edge
  const base: XY = [-42, -30];
  const lens = [40, 44, 50, 54, 54, 50, 44, 38, 32];
  for (let i = 8; i >= 0; i--) {
    const th = ((-24 + i * 17) * Math.PI) / 180;
    const dx = -Math.cos(th);
    const dy = -Math.sin(th) * 0.84;
    const len = lens[i];
    const m = TAILS[i % 3];
    const sway = (i % 2 ? 1 : -1) * 4 + wob([0, 1.5, 0, -1.5], frame + i);
    const curl = th < 0.7 ? 10 : th < 1.2 ? 5 : 0;
    const centre = (t: number): XY => [base[0] + dx * len * t - dy * Math.sin(t * Math.PI) * sway, base[1] + dy * len * t + dx * Math.sin(t * Math.PI) * sway - curl * t * t];
    const n = 10;
    const pts: XY[] = [];
    const widths: number[] = [];
    for (let k = 0; k <= n; k++) {
      pts.push(centre(k / n));
      widths.push(1 + 6.4 * Math.sin(Math.PI * Math.min(1, 0.2 + (k / n) * 0.88)));
    }
    plume(rt, pts.map(([u, v]) => Q(u, v)), widths, m);
    // one big flick off the upper edge, swept toward the tip, and a curled flaming tip
    for (const [k, ll] of [[3, 6], [6, 9]] as const) {
      const p = pts[k];
      const a = pts[k - 1];
      const b = pts[k + 1];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const tx = (b[0] - a[0]) / l;
      const ty = (b[1] - a[1]) / l;
      const side = tx > 0 ? -1 : 1; // the normal that points up
      const nx = -ty * side;
      const ny = tx * side;
      const ex = nx * 0.6 + tx * 0.8;
      const ey = ny * 0.6 + ty * 0.8;
      tongue(rt, ...Q(p[0] + nx * (widths[k] - 1), p[1] + ny * (widths[k] - 1)), ex, ey, ll + wob([0, 2, 1, 3], frame + k + i), 5, wob([-1, 0, 1, 0], frame + i) * 1.5, m);
    }
    const [tu, tv] = centre(0.94);
    const [pu, pv] = centre(0.8);
    const tl = Math.hypot(tu - pu, tv - pv) || 1;
    tongue(rt, ...Q(tu, tv), (tu - pu) / tl, (tv - pv) / tl, 9 + wob([0, 2, 3, 1], frame + i), 3.2, (i % 2 ? 3 : -3) + wob([-1, 1, 0, 0], frame + i), m);
    // dark seal rings across the tail
    for (const t of [0.3, 0.5]) {
      const [mu, mv] = centre(t);
      const [pu, pv] = centre(t + 0.04);
      const l = Math.hypot(pu - mu, pv - mv) || 1;
      const w = widths[Math.round(t * n)] * 0.9;
      rt.line(mu - ((pv - mv) / l) * w, mv + ((pu - mu) / l) * w, mu + ((pv - mv) / l) * w, mv - ((pu - mu) / l) * w, K_MARK, 0.5);
    }
  }

  // the head turns up for the Bijudama; the jaw drops open around its hinge
  const headPivot: XY = [28, -50];
  const tilt = (roar ? -0.12 : 0)+aim;
  const H = (p: XY): XY => rot(p, headPivot, tilt);
  const HQ = (pts: XY[]): Pt[] => pts.map((p) => Q(...H(p)));
  const hinge = H([40, -45]);
  const J = (p: XY): XY => rot(H(p), hinge, roar ? 0.46 : 0.1);

  // the far legs and the far ear, darker, behind the body
  r.poly(T([[-20, -24], [-15, -12], [-12, -5]], 5.5, 4.2), K_FAR);
  r.poly(P([[-20, -7], [-4, -7], [-2, -1], [-21, -1]]), K_FAR);
  r.poly(T([[24, -44], [36, -26], [42, -7]], 6.5, 5), K_FAR);
  r.poly(P([[36, -9], [52, -9], [55, -1], [35, -1]]), K_FAR);
  r.poly(T([H([40, -64]), H([36, -75]), H([29, -81])], 6, 0.6), K_FAR);

  // the body: a low, powerful, crouched mass rising to big shoulders, chakra flicking off the back
  r.poly(P([[-48, -24], [-48, -34], [-40, -41], [-26, -43], [-10, -45], [6, -50], [18, -56], [30, -57], [38, -46], [37, -32], [30, -22], [16, -17], [0, -19], [-14, -20], [-28, -17], [-42, -17]]), K_BODY);
  // a flaming scruff over the shoulders
  for (const [u, v, h, i] of [[4, -47, 9, 0], [13, -52, 12, 1], [22, -56, 9, 2]] as [number, number, number, number][]) {
    flame(r, ...Q(u, v + 2), h + wob([0, 2, 3, 1], frame + i), 8, -3, (frame * Math.PI) / 2 + i, K_BODY);
  }

  // a ridge of chakra flames along the spine
  [[-38, -41], [-27, -44], [-15, -46], [-3, -49], [8, -53]].forEach(([u, v], i) => {
    flame(r, u, v + 2, 13 + (i % 2) * 3 + wob([0, 2, 3, 1], frame + i), 7, -3 + (i % 3), (frame * Math.PI) / 2 + i * 1.1, K_BODY);
  });

  // the near legs: a big haunch, a bent hind leg, a heavy planted front leg with big clawed paws
  r.ellipse(...Q(-32, -26), 14, 13, K_LEG);
  r.poly(T([[-41, -17], [-43, -9], [-38, -4]], 6, 5), K_LEG);
  r.poly(P([[-49, -8], [-28, -8], [-24, -3], [-24, -1], [-50, -1]]), K_LEG);
  r.poly(T([[16, -48], [24, -32], [26, -21]], 10, 7.5), K_LEG);
  r.poly(T([[26, -22], [28, -13], [29, -6]], 7, 6), K_LEG);
  r.poly(P([[19, -10], [40, -10], [46, -5], [46, -1], [19, -1]]), K_LEG);
  for (const v of [-8, -5, -2]) {
    r.line(...R(46, v), ...R(53, v + 2), K_FANG);
    r.line(...R(-24, v), ...R(-17, v + 2), K_FANG);
  }

  // the seal markings: a ring on the shoulder, an arc over the haunch, a stripe down the back and down each leg
  r.ellipse(...Q(20, -37), 9, 9, K_MARK);
  r.ellipse(...Q(20, -37), 7, 7, K_LEG);
  r.ellipse(...Q(20, -37), 3.4, 3.4, K_MARK);
  mark([[-44, -34], [-30, -39], [-14, -40], [0, -41], [11, -42]]);
  mark([[-44, -22], [-42, -33], [-33, -38], [-23, -35]], 2);
  mark([[24, -28], [27, -18], [28, -9]]);
  mark([[-42, -14], [-43, -8]]);
  // finer lines: the shoulder blade, the ribs, the haunch
  mark([[-6, -44], [2, -38], [6, -30]], 0.5);
  for (const u of [-20, -12, -4]) mark([[u, -37], [u + 2, -29]], 0.5);
  mark([[-46, -30], [-40, -20]], 0.5);
  mark([[14, -22], [20, -20], [26, -22]], 0.5);

  // the open mouth (dark), then the head and the jaw over it: what stays dark between them is the mouth
  r.poly([Q(...hinge), Q(...H([71, -48])), Q(...J([68, -44])), Q(...J([48, -39]))], K_MOUTH);
  r.poly(T([H([28, -52]), H([22, -46]), H([18, -42])], 4.5, 1), K_HEAD);
  r.poly(HQ([[24, -55], [28, -66], [36, -71], [45, -68], [50, -60], [59, -56], [70, -53], [71, -48], [62, -47], [50, -49], [38, -45], [28, -47]]), K_HEAD);
  r.poly(T([H([33, -64]), H([25, -74]), H([20, -82])], 6.5, 0.6), K_EAR);
  mark([H([31, -65]), H([25, -73]), H([22, -78])],2);
  r.poly([Q(...J([38, -45])), Q(...J([62, -46])), Q(...J([68, -44])), Q(...J([63, -40])), Q(...J([48, -38])), Q(...J([38, -40]))], K_JAW);
  // fangs down from the upper lip, up from the jaw
  for (const u of [50, 55, 60, 65]) r.poly(HQ([[u - 1.6, -47], [u + 1.6, -47], [u + 0.3, -41.5]]), K_FANG);
  for (const u of [47, 52, 57, 62]) r.poly([Q(...J([u - 1.4, -44.5])), Q(...J([u + 1.4, -44.5])), Q(...J([u, -50.5]))], K_FANG);
  // the eye: a slanted slit with a black pupil under a heavy brow; three bold whisker marks; the nose
  r.poly(HQ([[37,-64],[50,-62],[48,-56],[39,-57]]),K_MARK);
  r.poly(HQ([[39, -62], [49, -60], [46, -57.5], [40, -59]]), K_EYE);
  // a heavy, scowling brow, wrinkles on the forehead and the nose bridge
  r.poly(HQ([[35, -68], [53, -64.5], [52, -61.5], [37, -63.5]]), K_MARK);
  mark([H([40, -70]), H([48, -68])], 0.5);
  mark([H([37, -72]), H([45, -72])], 0.5);
  mark([H([56, -58]), H([62, -57])], 0.5);
  mark([H([45, -61]), H([45, -58])]);
  mark([H([36, -66]), H([42, -64]), H([51, -62])], 2);
  mark([H([44, -55]), H([54, -54])]);
  for (const k of [0, 1, 2]) mark([H([31, -58 + k * 3]), H([40, -57 + k * 2.5])], 2);
  r.poly(HQ([[67,-54],[72,-52],[71,-49],[67,-50]]),K_MARK);
  // cheek ruff: licks off the back of the head
  tongue(r, ...Q(...H([28, -48])), -0.85, 0.5, 7 + wob([0, 2, 1, 3], frame), 5, 1, K_HEAD);
  tongue(r, ...Q(...H([26, -57])), -0.9, -0.3, 6 + wob([1, 3, 0, 2], frame), 5, -1, K_HEAD);
  tongue(r, ...Q(...H([30, -60])), -0.8, -0.5, 11 + wob([2, 0, 3, 1], frame), 7, 1, K_HEAD);
  tongue(r, ...Q(...H([31, -67])), -0.5, -0.85, 10 + wob([0, 2, 1, 3], frame), 6, -1, K_HEAD);
  tongue(r, ...Q(...H([26, -52])), -0.95, 0.3, 11 + wob([3, 1, 2, 0], frame), 7, 1, K_HEAD);
  // the tails stop where the body begins (so the mass behind never shows through the translucent body)
  for (let i = 0; i < rawT.m.length; i++) if (rawB.m[i]) rawT.m[i] = 0;
  const feet = KURAMA.ay + pad;
  const trim = (b: Baked): Baked => ({ ...b, runs: b.runs.filter((run) => run.y < feet) });
  return { tails: trim(bakeSpirit(rawT, KURAMA_MATS, KURAMA_HALO)), body: trim(bakeSpirit(rawB, KURAMA_MATS, KURAMA_HALO)) };
}

/** Kurama, frame 0..3 (tails sway, flames lick); `roar` = the Bijudama pose (head up, jaws wide). Baked once each. */
export const KURAMA_AIM_PAD = 100;
const kuramaCache = new Map<string, { tails: Baked; body: Baked }>();
/** Kurama as its two parts: the tails (behind), the body with the head. `aim` tilts the head. */
export function kuramaParts(frame: number, roar = false, aim = 0): { tails: Baked; body: Baked } {
  const f = ((frame % SPIRIT_FRAMES) + SPIRIT_FRAMES) % SPIRIT_FRAMES;
  const a = avatarAim(aim);
  const key = `k|${f}|${roar ? 1 : 0}|${a}`;
  let p = kuramaCache.get(key);
  if (!p) {
    if (kuramaCache.size >= 72) kuramaCache.delete(kuramaCache.keys().next().value!);
    p = kuramaPair(f, roar, a);
    kuramaCache.set(key, p);
  }
  return p;
}
/**
 * The sprites a hero's spirit needs, as small steps (one bake each) to run one after another while the match is idle, so
 * the first ultimate does not stall on baking them: Susanoo's bodies and arms for Sasuke, Kurama's parts for Naruto.
 */
export function spiritWarmup(hero: string): (() => void)[] {
  const steps: (() => void)[] = [];
  for (let f = 0; f < SPIRIT_FRAMES; f++) {
    if (hero === 'sasuke') {
      steps.push(() => susanooCore(4, f), () => susanooCore(3, f));
      if (f === 0) for (const level of [3, 4] as const) for (let s = 0; s < 4; s++) steps.push(() => susanooArms(level, s, 0));
    } else if (hero === 'naruto') steps.push(() => kuramaParts(f, false, 0), () => kuramaParts(f, true, 0));
  }
  return steps;
}

const kuramaWhole = new Map<string, Baked>();
/** Kurama as one sprite (tails behind the body), what the game paints once it is formed. */
export function kuramaSprite(frame: number, roar = false, aim = 0): Baked {
  const f = ((frame % SPIRIT_FRAMES) + SPIRIT_FRAMES) % SPIRIT_FRAMES;
  const key = `${f}|${roar ? 1 : 0}|${avatarAim(aim)}`;
  let b = kuramaWhole.get(key);
  if (!b) {
    const { tails, body } = kuramaParts(f, roar, aim);
    const pad = avatarAim(aim) === 0 ? 0 : KURAMA_AIM_PAD;
    if (kuramaWhole.size >= 72) kuramaWhole.delete(kuramaWhole.keys().next().value!);
    b = { w: KURAMA.w + pad * 2, h: KURAMA.h + pad * 2, runs: [...tails.runs, ...body.runs] };
    kuramaWhole.set(key, b);
  }
  return b;
}

// ---- arms: the transformed punches. Kurama's chakra arm and Susanoo's skeletal / armoured arm are translucent spirits
// like the avatars; Naruto's red cloak arm (forms 1-3) stays a solid outlined sprite.
export type ArmKind = 'susanoo' | 'susanooBone' | 'kurama' | 'claw';

export interface ArmSpec {
  kind: ArmKind;
  /** shoulder, elbow, fist (world pixels) */
  s: XY;
  e: XY;
  h: XY;
  /** +1 / -1: which way the fist faces */
  d: 1 | -1;
  /** upper-arm thickness in pixels (the forearm is a little slimmer) */
  thick: number;
  /** the three-step punch: 0 = open claw (windup), 1 = fingers curling (reaching), 2 = closed fist (impact, default) */
  step?: 0 | 1 | 2;
  /** flame frame (0..3) */
  frame?: number;
}

export interface ArmSprite {
  baked: Baked;
  /** world position of the raster's top-left pixel */
  ox: number;
  oy: number;
}

// the red chakra cloaks of the first three forms: crimson over dark red, pale claws (solid, outlined)
const CLAW_MATS: Material[] = [
  { dark: 0x5a0f23, base: 0xc8283c, light: 0xff6a62, hi: 0xffc2b0 },
  { dark: 0x3a0a18, base: 0x8a1c30, light: 0xd8483f, hi: 0xff9a84 },
  { dark: 0xc9b08c, base: 0xf0dcc0, light: 0xfff2de, hi: 0xffffff },
  { dark: 0x1d0610, base: 0x2e0914, light: 0x4a1020, hi: 0x6a1a30 },
];

function rimmedStroke(r: Raster, pts: readonly Pt[], m: number, rimMat: number, thick: number): void {
  r.stroke(pts, rimMat, thick + 2);
  r.stroke(pts, m, thick);
}
function rimmed(r: Raster, pts: readonly Pt[], m: number, rimMat: number): void {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) r.poly(pts.map(([x, y]) => [x + dx, y + dy] as Pt), rimMat);
  r.poly(pts, m);
}

/** Naruto's red cloak arm (forms 1-3): the solid outlined sprite */
function clawArm(r: Raster, s: XY, e: XY, h: XY, d: number, thick: number): Baked {
  const t = Math.max(3, thick | 1);
  const tf = Math.max(3, (t - 2) | 1);
  rimmedStroke(r, [s, e], 1, 4, t);
  rimmedStroke(r, [e, h], 1, 4, tf);
  const len = Math.hypot(h[0] - e[0], h[1] - e[1]) || 1;
  const ux = (h[0] - e[0]) / len;
  const uy = (h[1] - e[1]) / len;
  for (let k = 6; len > 15 && k < len - 6; k += 6) {
    const px = e[0] + ux * k;
    const py = e[1] + uy * k;
    r.line(px - uy * (tf / 2), py + ux * (tf / 2), px + uy * (tf / 2), py - ux * (tf / 2), 3);
  }
  const bx = h[0] - ux * 4;
  const by = h[1] - uy * 4;
  r.line(bx - uy * (tf / 2 + 1), by + ux * (tf / 2 + 1), bx + uy * (tf / 2 + 1), by - ux * (tf / 2 + 1), 2, 2);
  rimmed(r, [[e[0] - 3, e[1] - 3], [e[0] + 3, e[1] - 3], [e[0] + 3, e[1] + 2], [e[0] - 3, e[1] + 2]], 2, 4);
  const rad = Math.round(t / 2) + 1;
  const fx = h[0] + d * rad;
  const back = h[0] - d * rad;
  rimmed(r, [[back, h[1] - rad], [fx - d, h[1] - rad], [fx + d, h[1] - rad + 2], [fx + d, h[1] + rad - 2], [fx - d, h[1] + rad], [back, h[1] + rad]], 1, 4);
  rimmed(r, [[h[0] - d * 2, h[1] - rad - 3], [h[0] + d * 2, h[1] - rad - 3], [h[0] + d * 2, h[1] - rad + 1], [h[0] - d * 2, h[1] - rad + 1]], 1, 4);
  for (let i = -1; i <= 1; i++) r.set(fx, h[1] + i * 2, 3);
  for (let i = -1; i <= 1; i++) r.line(fx + d * 2, h[1] + i * 2, fx + d * 7, h[1] + i * 2 + Math.sign(i), 3);
  return bake(r, CLAW_MATS, 0x1d0610, false);
}

/**
 * The hand of a spirit arm at h, facing d, by punch step: an open claw (a palm and four splayed fingers with claws),
 * fingers curling, or a closed fist (a rounded block with knuckle seams). `rad` = half the hand's size.
 */
function spiritHand(r: Raster, h: XY, d: number, rad: number, step: number, body: number, claw: number, seam: number, bony: boolean): void {
  const [hx, hy] = h;
  if (step === 2) {
    r.poly([[hx - d * rad, hy - rad], [hx + d * (rad - 1), hy - rad], [hx + d * (rad + 1), hy - rad + 2], [hx + d * (rad + 1), hy + rad - 1], [hx + d * (rad - 1), hy + rad + 1], [hx - d * rad, hy + rad + 1]], body);
    r.poly([[hx - d * 2, hy - rad - 2], [hx + d * 2, hy - rad - 2], [hx + d * 2, hy - rad + 1], [hx - d * 2, hy - rad + 1]], body);
    for (let i = -1; i <= 1; i++) r.line(hx + d * (rad - 2), hy + i * 2 + 1, hx + d * rad, hy + i * 2 + 1, seam);
    if (bony) for (let i = -1; i <= 1; i++) r.set(hx + d * (rad + 2), hy + i * 2 + 1, claw);
    return;
  }
  r.ellipse(hx, hy, rad, rad, body);
  const curl = step === 1;
  for (let i = 0; i < 4; i++) {
    const spread = (i - 1.5) * (curl ? 0.28 : 0.42);
    const len = (curl ? 4 : 6) + (i === 1 || i === 2 ? 1 : 0);
    const a0x = Math.cos(spread) * d;
    const a0y = Math.sin(spread);
    const bx = hx + a0x * (rad - 1);
    const by = hy + a0y * (rad - 1);
    const kx = bx + a0x * len;
    const ky = by + a0y * len + (curl ? 1.5 : 0);
    const tip: XY = curl ? [kx - d * 1.5, ky + 2.5] : [kx + d * 2, ky + a0y * 2];
    r.line(bx, by, kx, ky, body, bony ? 1 : 2);
    r.line(kx, ky, tip[0], tip[1], claw);
  }
}

/** Rasterize one arm in world coordinates (so no flipping or rotation is needed). */
function armRaster(a: ArmSpec, ox: number, oy: number, w: number, hgt: number): Baked {
  const r = new Raster(w, hgt);
  const L = (p: XY): XY => [Math.round(p[0]) - ox, Math.round(p[1]) - oy];
  const [s, e, h] = [L(a.s), L(a.e), L(a.h)];
  const d = a.d;
  const step = a.step ?? 2;
  const frame = a.frame ?? 0;
  if (a.kind === 'claw') return clawArm(r, s, e, h, d, a.thick);
  const t = Math.max(3, a.thick);
  const len = Math.hypot(h[0] - e[0], h[1] - e[1]) || 1;
  const ux = (h[0] - e[0]) / len;
  const uy = (h[1] - e[1]) / len;
  const rad = Math.round(t / 2) + 2;

  if (a.kind === 'kurama') {
    // a gold chakra arm: flame licking back off its top edge, a seal ring on the upper arm, a black line along it
    const flames = 5;
    for (let i = 0; i < flames; i++) {
      const k = (i + 0.4) / flames;
      const px = s[0] + (h[0] - s[0]) * k * 0.8;
      const py = s[1] + (h[1] - s[1]) * k * 0.8;
      tongue(r, px, py - t / 2 + 1.5, -d * 0.7, -0.7, 7 + wob([0, 2, 1, 3], frame + i), 5.5, wob([-1, 1, 0, 1], frame + i), K_BODY);
    }
    r.poly(taper([s, e], t / 2 + 1, t / 2 + 0.5), K_BODY);
    r.poly(taper([e, h], t / 2 + 0.5, t / 2), K_BODY);
    const ring: XY = [(s[0] + e[0]) / 2, (s[1] + e[1]) / 2];
    r.ellipse(ring[0], ring[1], t / 2 + 1.2, t / 2 + 1.2, K_MARK);
    r.ellipse(ring[0], ring[1], t / 2 - 0.2, t / 2 - 0.2, K_LEG);
    r.ellipse(ring[0], ring[1], 1.3, 1.3, K_MARK);
    if (len > 8) r.line(e[0], e[1], h[0] - ux * (rad + 1), h[1] - uy * (rad + 1), K_MARK);
    spiritHand(r, h, d, rad, step, K_LEG, K_FANG, K_MARK, false);
    return bakeSpirit(r, KURAMA_MATS, KURAMA_HALO);
  }
  if (a.kind === 'susanooBone') {
    // Mangekyo: a humerus, an elbow joint, two forearm bones and a bony claw
    r.stroke([s, e], S_BONE, 3);
    r.ellipse(s[0], s[1], 3, 3, S_BONE);
    r.ellipse(e[0], e[1], 2.5, 2.5, S_BONE);
    const nx = -uy;
    const ny = ux;
    r.line(e[0] + nx, e[1] + ny, h[0] + nx * 1.5, h[1] + ny * 1.5, S_LIMB);
    r.line(e[0] - nx, e[1] - ny, h[0] - nx * 1.5, h[1] - ny * 1.5, S_LIMB);
    spiritHand(r, h, d, Math.max(3, rad - 1), step, S_LIMB, S_GLOW, S_SEAM, true);
    return bakeSpirit(r, SUSANOO_MATS, SUSANOO_HALO);
  }
  // Perfect: an armoured arm, a pauldron, a banded bracer and a gauntlet
  r.poly(taper([s, e], t / 2 + 0.5, t / 2), S_ARMOR);
  r.poly(taper([e, h], t / 2, t / 2 - 0.5), S_PLATE);
  for (let k = 5; len > 12 && k < len - rad; k += 5) {
    const px = e[0] + ux * k;
    const py = e[1] + uy * k;
    r.line(px - uy * (t / 2), py + ux * (t / 2), px + uy * (t / 2), py - ux * (t / 2), S_SEAM);
  }
  r.poly([[s[0] - 5, s[1] - 3], [s[0] + 4, s[1] - 5], [s[0] + 6, s[1] + 2], [s[0] - 4, s[1] + 4]], S_LIMB2);
  r.ellipse(e[0], e[1], 2.5, 2.5, S_LIMB2);
  spiritHand(r, h, d, rad, step, S_LIMB2, S_GLOW, S_SEAM, false);
  return bakeSpirit(r, SUSANOO_MATS, SUSANOO_HALO);
}

const armCache = new Map<string, Baked>();
const ARM_CACHE_MAX = 600;

/**
 * One arm in world coordinates. Baked once per shape (positions relative to the fist, step, frame): a punch repeats the
 * same few dozen shapes, so most frames are cache hits.
 */
export function armSprite(a: ArmSpec): ArmSprite {
  const pad = 18;
  const H: XY = [Math.round(a.h[0]), Math.round(a.h[1])];
  const S: XY = [Math.round(a.s[0]), Math.round(a.s[1])];
  const E: XY = [Math.round(a.e[0]), Math.round(a.e[1])];
  const ox = Math.min(S[0], E[0], H[0]) - pad;
  const oy = Math.min(S[1], E[1], H[1]) - pad;
  const w = Math.max(S[0], E[0], H[0]) - ox + pad;
  const hgt = Math.max(S[1], E[1], H[1]) - oy + pad;
  const frame = (((a.frame ?? 0) % SPIRIT_FRAMES) + SPIRIT_FRAMES) % SPIRIT_FRAMES;
  const key = `${a.kind}|${S[0] - H[0]},${S[1] - H[1]}|${E[0] - H[0]},${E[1] - H[1]}|${a.d}|${a.thick}|${a.step ?? 2}|${a.kind === 'claw' ? 0 : frame}`;
  let baked = armCache.get(key);
  if (!baked) {
    if (armCache.size >= ARM_CACHE_MAX) armCache.clear();
    // rasterize relative to the fist so the cached runs are valid wherever the arm is
    baked = armRaster({ ...a, s: S, e: E, h: H, frame }, ox, oy, w, hgt);
    armCache.set(key, baked);
  }
  return { baked, ox, oy };
}
