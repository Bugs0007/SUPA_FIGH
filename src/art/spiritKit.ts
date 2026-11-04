// Shared pieces of the big translucent spirits (Susanoo, Kurama): shape helpers that draw into a raster pen (one that
// scales design units up when a spirit is drawn at its big size) and the Susanoo materials. Phaser-free.

import { type Pen, type Pt, type SpiritMat } from './pixelRaster';

export type XY = [number, number];

/** flame / wing / tail animation frames (the spirits flicker through them at `AvatarArt`'s rate) */
export const SPIRIT_FRAMES = 4;

export const spirit = (tones: SpiritMat['tones'], alpha: SpiritMat['alpha'], group: number, layer = 0, bands?: SpiritMat['bands']): SpiritMat =>
  bands ? { tones, alpha, group, layer, bands } : { tones, alpha, group, layer };
export const flat = (c: number, a: number): SpiritMat => ({ tones: [c, c, c, c], alpha: [a, a, a, a], flat: true });

/** opacity bands (rim, inner, body, core): structure (bones, plates, legs) and chakra mass (flames, tails) */
export const SOLID_A = [0.95, 0.82, 0.6, 0.46] as const;
export const MASS_A = [0.82, 0.62, 0.44, 0.3] as const;

// ---- small shape helpers (all in raster pixels)

/** a polygon around a polyline with a half width per point (plumes, tails, flames) */
export function plume(r: Pen, pts: readonly XY[], widths: readonly number[], m: number): void {
  const left: Pt[] = [];
  const right: Pt[] = [];
  pts.forEach((p, k) => {
    const a = pts[Math.max(0, k - 1)];
    const b = pts[Math.min(pts.length - 1, k + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / l;
    const ny = (b[0] - a[0]) / l;
    left.push([p[0] + nx * widths[k], p[1] + ny * widths[k]]);
    right.push([p[0] - nx * widths[k], p[1] - ny * widths[k]]);
  });
  r.poly([...left, ...right.reverse()], m);
}

/**
 * A rising flame (raster pixels): from base centre (x, y) up `h` px, `w` wide at its fattest (a quarter of the way up),
 * swaying sideways in an S that travels up with `phase` (the flicker), tapering to a curled point.
 */
export function flame(r: Pen, x: number, y: number, h: number, w: number, sway: number, phase: number, m: number): void {
  const pts: XY[] = [];
  const widths: number[] = [];
  for (let k = 0; k <= 8; k++) {
    const t = k / 8;
    pts.push([x + Math.sin(t * Math.PI * 1.3 + phase) * sway * t, y - h * t]);
    widths.push(Math.max(0.4, (w / 2) * (0.7 + 0.45 * Math.sin(Math.min(1, t * 2) * Math.PI * 0.5)) * Math.pow(1 - t, 0.85)));
  }
  plume(r, pts, widths, m);
}

/** a polygon around a polyline, its half width going from w0 at the start to w1 at the end */
export function taper(pts: readonly XY[], w0: number, w1: number): Pt[] {
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / l;
    const ny = (b[0] - a[0]) / l;
    const w = w0 + ((w1 - w0) * i) / Math.max(1, pts.length - 1);
    left.push([pts[i][0] + nx * w, pts[i][1] + ny * w]);
    right.push([pts[i][0] - nx * w, pts[i][1] - ny * w]);
  }
  return [...left, ...right.reverse()];
}

/**
 * A flame tongue from base centre (x, y) along the unit direction (dx, dy): widest a third of the way out, the tip
 * bent `bend` px sideways (a lick that curls), `len` long and `w` wide at the base.
 */
export function tongue(r: Pen, x: number, y: number, dx: number, dy: number, len: number, w: number, bend: number, m: number): void {
  const nx = -dy;
  const ny = dx;
  const at = (t: number, s: number): Pt => [x + dx * len * t + nx * s, y + dy * len * t + ny * s];
  r.poly([at(0, -w / 2), at(0.32, -w / 2 - 0.6), at(0.72, -w * 0.15 + bend * 0.45), at(1, bend), at(0.62, w * 0.28 + bend * 0.5), at(0.3, w / 2 + 0.6), at(0, w / 2)], m);
}

/** rotate a point about a pivot (radians, screen coordinates: negative turns the front upward) */
export const rot = (p: XY, c: XY, a: number): XY => {
  const cs = Math.cos(a);
  const sn = Math.sin(a);
  return [c[0] + (p[0] - c[0]) * cs - (p[1] - c[1]) * sn, c[1] + (p[0] - c[0]) * sn + (p[1] - c[1]) * cs];
};

/** per-frame wobble: a small repeating sequence picked by an index (deterministic, no randomness) */
export const wob = (seq: readonly number[], i: number) => seq[((i % seq.length) + seq.length) % seq.length];

// ---- Susanoo: violet chakra over pale bone (Mangekyo) or layered armour (Perfect), a glowing eye, a chakra bow
export const S_FLAME = 1;
export const S_FLAME2 = 2;
export const S_BONE = 3;
export const S_LIMB = 4;
export const S_LIMB2 = 5;
export const S_ARMOR = 6;
export const S_PLATE = 7;
export const S_WING = 8;
export const S_WING2 = 9;
export const S_COVERT = 10;
export const S_BOW = 11;
export const S_SEAM = 12;
export const S_GLOW = 13;
export const VIOLET_FLAME = [0xdcb6ff, 0xae6ef9, 0x8444e2, 0x672ac4] as const;
export const VIOLET_FLAME2 = [0xd0a4ff, 0x9e5cf2, 0x7638d6, 0x5a22b4] as const;
export const VIOLET_BONE = [0xfaf2ff, 0xdcbcff, 0xb282f4, 0x9058e0] as const;
export const VIOLET_ARMOR = [0xf2e4ff, 0xcaa0ff, 0x9c68ea, 0x7a48d0] as const;
export const VIOLET_PLATE = [0xfcf4ff, 0xd8b2ff, 0xae7af2, 0x8a58dc] as const;
export const VIOLET_WING = [0xeedaff, 0xbe8eff, 0x9058e6, 0x6e3cc8] as const;
export const VIOLET_WING2 = [0xe0c8ff, 0xac78f8, 0x7e4adc, 0x6030b8] as const;
export const SUSANOO_MATS: SpiritMat[] = [
  spirit(VIOLET_FLAME, MASS_A, 1, 0), // flames and the chakra mass of the body
  spirit(VIOLET_FLAME2, MASS_A, 2, 0), // the tongues between them
  spirit(VIOLET_BONE, SOLID_A, 3, 1), // bones: ribs, spine, skull
  spirit(VIOLET_BONE, SOLID_A, 4, 2), // the bow arm (over the ribs)
  spirit(VIOLET_ARMOR, SOLID_A, 5, 2), // the drawing arm (rims over the other where they cross)
  spirit(VIOLET_ARMOR, SOLID_A, 6, 1), // armour
  spirit(VIOLET_PLATE, SOLID_A, 7, 1), // lighter plates (layers alternate with armour)
  spirit(VIOLET_WING, MASS_A, 8, 0), // primary feathers
  spirit(VIOLET_WING2, MASS_A, 9, 0), // the feathers between them
  spirit(VIOLET_WING, SOLID_A, 10, 1), // the covert feathers along the wing's edge
  spirit([0xffffff, 0xeedeff, 0xcca8ff, 0xb088f8], [1, 0.95, 0.85, 0.75], 11, 3), // the chakra bow
  flat(0x2a0c52, 0.6), // seams, sockets, the dark between plates
  flat(0xffffff, 1), // the eye, the arrowhead
];
/** the faint halo pixel around everything (the soft edge of the one-tail cloak) */
export const SUSANOO_HALO = { c: 0x8040e0, a: 0.32 };
/** the single-pixel string, arrow shaft, fletching and muzzle flash (painted over the sprite) */
export const SUSANOO_INK = { string: 0xeee4ff, shaft: 0xfaf6ff, fletch: 0xb48cff, flash: 0xffffff, flash2: 0xd8c6ff };
/** every colour the Susanoo may use (tests) */
export const SUSANOO_COLOURS = new Set<number>([SUSANOO_HALO.c, ...Object.values(SUSANOO_INK), ...SUSANOO_MATS.flatMap((m) => [...m.tones])]);
/** the arrowhead / eye colour (the glow) */
export const SUSANOO_GLOW = 0xffffff;

