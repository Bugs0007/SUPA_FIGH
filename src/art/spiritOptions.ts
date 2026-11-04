// Design studies for the giant spirits: five takes on Susanoo and five on Kurama, to pick a direction from
// (?scene=art&page=options&spirit=susanoo|kurama). Not used by the game. They share one idea the shipped art lacks:
// organic, smoothly curved shapes (splines with a width profile) instead of blocks, and three render styles:
//   glow   translucent chakra with bright rims (like the one-tail cloak)
//   solid  opaque, dark outline, four flat tones: the same look as the fighters
//   neon   an outline-only wireframe glow
// Phaser-free.

import { K_EAR, K_EYE, K_FANG, K_FAR, K_BODY, K_HEAD, K_JAW, K_LEG, K_MARK, K_MOUTH, KURAMA_HALO, KURAMA_MATS } from './avatarSprites';
import { bake, bakeSpirit, Raster, toRuns, type Baked, type Material, type Pen } from './pixelRaster';
import { S_ARMOR, S_BONE, S_BOW, S_COVERT, S_FLAME, S_FLAME2, S_GLOW, S_LIMB, S_LIMB2, S_PLATE, S_SEAM, S_WING, S_WING2, SUSANOO_HALO, SUSANOO_MATS, flame, plume, wob, type XY } from './spiritKit';

export interface SpiritOption {
  id: string;
  name: string;
  note: string;
  /** raster size and the pixel the fighter's feet stand on */
  w: number;
  h: number;
  ax: number;
  ay: number;
  bake(frame: number): Baked;
}

// ---------------------------------------------------------------- shape helpers

/** Catmull-Rom spline through `pts`, sampled `steps` times per segment; `k` = control index of each sample */
function spline(pts: XY[], steps = 8): { p: XY[]; k: number[] } {
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  const p: XY[] = [];
  const k: number[] = [];
  for (let i = 1; i < P.length - 2; i++) {
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      p.push([f(P[i - 1][0], P[i][0], P[i + 1][0], P[i + 2][0]), f(P[i - 1][1], P[i][1], P[i + 1][1], P[i + 2][1])]);
      k.push(i - 1 + t);
    }
  }
  p.push(pts[pts.length - 1]);
  k.push(pts.length - 1);
  return { p, k };
}

/** A smooth limb / horn / tail / feather: a spline through `pts` whose half width follows `w` (one value per control point). */
function rib(r: Pen, pts: XY[], w: number[], m: number, steps = 8): void {
  const { p, k } = spline(pts, steps);
  const widths = k.map((x) => {
    const i = Math.min(w.length - 2, Math.floor(x));
    return Math.max(0.4, w[i] + (w[i + 1] - w[i]) * (x - i));
  });
  plume(r, p, widths, m);
}

const mirror = (pts: XY[], s: number): XY[] => pts.map(([u, v]) => [u * s, v] as XY);

/** A set of claws fanning out from a hand at (x, y) toward `angle` (radians, screen), `n` fingers, `len` long. */
function claws(r: Pen, x: number, y: number, angle: number, n: number, len: number, spread: number, m: number): void {
  for (let i = 0; i < n; i++) {
    const a = angle + (i - (n - 1) / 2) * spread;
    const mx = x + Math.cos(a) * len * 0.6;
    const my = y + Math.sin(a) * len * 0.6;
    rib(r, [[x, y], [mx + Math.cos(a + 0.35) * 2, my + Math.sin(a + 0.35) * 2], [x + Math.cos(a + 0.5) * len, y + Math.sin(a + 0.5) * len]], [2.2, 1.7, 0.5], m, 5);
  }
}

// ---------------------------------------------------------------- render styles

/** Outline-only glow: the edge of every part is a bright line, the inside a faint wash; ids in `lines` are bright detail. */
function neon(r: Raster, rim: number, wash: number, lines: Record<number, number>): Baked {
  const n = r.w * r.h;
  const colors = new Int32Array(n).fill(-1);
  const alphas = new Float32Array(n);
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const m = r.get(x, y);
      if (!m) continue;
      const i = y * r.w + x;
      if (lines[m] !== undefined) {
        colors[i] = lines[m];
        alphas[i] = 1;
        continue;
      }
      let edge = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const o = r.get(x + dx, y + dy);
        if (o !== m && lines[o] === undefined) edge = true;
      }
      colors[i] = edge ? rim : wash;
      alphas[i] = edge ? 1 : 0.2;
    }
  }
  return toRuns(colors, r.w, r.h, alphas);
}

const mat = (dark: number, base: number, light: number, hi: number): Material => ({ dark, base, light, hi });

// ---------------------------------------------------------------- Susanoo (canvas 130 x 158, feet at (65, 154))

const SW = 128;
const SH = 158;
const SAX = 64;
const SAY = 154;
const sq = (u: number, v: number): XY => [SAX + u, SAY + v];
const sqs = (pts: XY[]): XY[] => pts.map(([u, v]) => sq(u, v));
const sflip = (pts: XY[], s: number): XY[] => sqs(mirror(pts, s));

/** 1: the Mangekyo Susanoo grown up: a towering skeleton, ribs and spine, horned skull, clawed arms, rising from flame. */
function susanooRibs(f: number): Baked {
  const r = new Raster(SW, SH);
  r.ellipse(...sq(0, -3), 32, 5, S_FLAME);
  for (let i = 0; i < 9; i++) flame(r, ...sq(-32 + i * 8, 0), 26 + ((i * 7) % 5) * 7 + wob([0, 3, 1, -2], i + f), 9, 3, (f * Math.PI) / 2 + i * 1.5, i % 2 ? S_FLAME2 : S_FLAME);
  r.ellipse(...sq(0, -36), 13, 7, S_BONE);
  rib(r, sqs([[0, -36], [1, -64], [0, -100]]), [5, 3.4, 4.5], S_BONE);
  for (let i = 0; i < 7; i++) {
    const v = -96 + i * 8;
    const reach = 35 - i * 3.2;
    for (const s of [1, -1]) rib(r, sflip([[3, v], [15, v - 10], [reach, v - 2], [reach - 3, v + 13]], s), [3.2, 2.6, 1.8, 1.2], S_BONE);
  }
  for (const s of [1, -1]) {
    rib(r, sflip([[2, -101], [20, -110], [42, -105]], s), [3.4, 3.2, 2.6], S_BONE);
    r.poly(sflip([[35, -105], [42, -128], [48, -102]], s), S_BONE);
    rib(r, sflip([[42, -104], [54, -84], [56, -62]], s), [4.6, 3.8, 3.2], S_LIMB);
    rib(r, sflip([[56, -62], [53, -42], [44, -26]], s), [3.2, 2.8, 2.2], S_LIMB);
    claws(r, ...sq(s * 44, -26), s > 0 ? 1.9 : 1.25, 4, 11, 0.42, S_BONE);
  }
  r.ellipse(...sq(0, -120), 15.5, 14.5, S_BONE);
  r.poly(sqs([[-10, -111], [10, -111], [8, -100], [-8, -100]]), S_BONE);
  for (const s of [1, -1]) {
    r.ellipse(...sq(s * 6.5, -122), 4.6, 4, S_SEAM);
    r.rect(...sq(s * 6.5 - 1.5, -123), 3, 2, S_GLOW);
    rib(r, sflip([[10, -130], [24, -144], [43, -148], [56, -138]], s), [5.6, 4.6, 3, 0.7], S_BONE);
  }
  r.poly(sqs([[-2, -118], [2, -118], [0, -111]]), S_SEAM);
  r.poly(sqs([[0, -148], [4, -136], [-4, -136]]), S_BONE);
  for (let u = -6; u <= 6; u += 3) r.line(...sq(u, -106), ...sq(u, -101), S_SEAM, 1);
  return bakeSpirit(r, SUSANOO_MATS, SUSANOO_HALO);
}

const SAMURAI_MATS: Material[] = [
  mat(0x2a1450, 0x5a34a8, 0x8a5ee0, 0xc8a8ff), // 1 armour
  mat(0x3a1e6a, 0x7a50cc, 0xa87ef0, 0xe2d0ff), // 2 plates
  mat(0x120a2a, 0x241250, 0x3a2078, 0x5636a0), // 3 cloth
  mat(0x9a86c0, 0xd8cce8, 0xf0e8fa, 0xffffff), // 4 mask
  mat(0xe8d8ff, 0xffffff, 0xffffff, 0xffffff), // 5 glow
  mat(0x7088b0, 0xb8c8e8, 0xe0ecff, 0xffffff), // 6 steel
  mat(0x6a4aa0, 0xb090f0, 0xd8c0ff, 0xffffff), // 7 trim
];

/** 2: a solid, outlined armoured samurai, two hands on a great sword planted before it: the fighters' own look, scaled up. */
function susanooSamurai(f: number): Baked {
  const r = new Raster(SW, SH);
  const sway = wob([0, 1, 2, 1], f);
  // cloak behind
  for (const s of [1, -1]) rib(r, sflip([[16, -104], [34 + sway, -70], [38 + sway * 2, -24]], s), [6, 9, 6], 3);
  // legs: wide hakama, shoes
  for (const s of [1, -1]) {
    r.poly(sflip([[3, -64], [24, -64], [28, -12], [5, -12]], s), 3);
    r.poly(sflip([[6, -30], [26, -30], [27, -12], [6, -12]], s), 2);
    r.poly(sflip([[4, -13], [30, -13], [36, -6], [32, 0], [4, 0]], s), 1);
  }
  // torso, belt, chest plates
  r.poly(sqs([[-24, -66], [24, -66], [28, -92], [22, -108], [-22, -108], [-28, -92]]), 1);
  for (let row = 0; row < 5; row++) {
    const v = -104 + row * 7;
    r.poly(sqs([[-22 + row, v], [22 - row, v], [21 - row, v + 6], [-21 + row, v + 6]]), row % 2 ? 1 : 2);
  }
  r.poly(sqs([[-26, -72], [26, -72], [26, -64], [-26, -64]]), 7);
  r.poly(sqs([[-5, -72], [5, -72], [4, -62], [-4, -62]]), 2);
  // pauldrons: three layered, spiked plates
  for (const s of [1, -1]) {
    for (let i = 0; i < 3; i++) r.ellipse(...sq(s * (34 - i), -108 + i * 6), 17 - i * 1.5, 8, i % 2 ? 1 : 2);
    r.poly(sflip([[30, -113], [38, -134], [44, -110]], s), 2);
    // arms down to the sword
    rib(r, sflip([[34, -100], [34, -80], [14, -70]], s), [7, 6.5, 5.5], 1);
    rib(r, sflip([[14, -70], [5, -68]], s), [5.5, 5], 2);
    r.ellipse(...sq(s * 3, -70), 5, 5, 2);
  }
  // the sword
  r.poly(sqs([[-3, -78], [3, -78], [2.5, -6], [0, 0], [-2.5, -6]]), 6);
  r.poly(sqs([[-9, -78], [9, -78], [9, -74], [-9, -74]]), 7);
  r.poly(sqs([[-2, -92], [2, -92], [2, -78], [-2, -78]]), 3);
  // neck guard, helmet, crest horns, mask
  r.poly(sqs([[-24, -122], [24, -122], [30, -104], [-30, -104]]), 2);
  r.poly(sqs([[-20, -118], [20, -118], [22, -108], [-22, -108]]), 1);
  for (const s of [1, -1]) rib(r, sflip([[5, -140], [15, -156], [30, -168]], s), [3.4, 3, 0.6], 7);
  r.ellipse(...sq(0, -128), 18, 16, 1);
  r.poly(sqs([[-12, -137], [12, -137], [16, -128], [-16, -128]]), 2);
  r.poly(sqs([[-11, -130], [11, -130], [9, -110], [-9, -110]]), 4);
  for (const s of [1, -1]) {
    r.poly(sflip([[2, -126], [10, -128], [10, -124], [3, -123]], s), 5);
    r.line(...sq(s * 2, -131), ...sq(s * 11, -128), 1, 2);
  }
  for (const u of [-6, -2, 2, 6]) r.poly(sqs([[u - 1.3, -118], [u + 1.3, -118], [u, -113]]), 5);
  return bake(r, SAMURAI_MATS, 0x0e0620, true);
}

/** 3: the bow-wielding Perfect Susanoo, redrawn with anime proportions: a big head, broad shoulders, a narrow waist, curved wings. */
function susanooArcher(f: number): Baked {
  const r = new Raster(SW, SH);
  const beat = wob([0, 2, 4, 2], f);
  // wings behind: two sweeping plumes with feathers hanging off them
  for (const [dx, dy, grow, m] of [[8, -6, 0.85, S_WING2], [0, 0, 1, S_WING]] as const) {
    rib(r, sqs([[-6 + dx, -106 + dy], [-24, -124 + dy], [-42, -140 + dy - beat], [-60, -142 + dy - beat]]), [5, 11 * grow, 9 * grow, 1], m);
    for (let i = 0; i < 6; i++) {
      const t = 0.18 + i * 0.13;
      const bx = -6 + dx + (-56 - dx) * t;
      const by = -106 + dy + (-142 - -106) * Math.pow(t, 0.8);
      rib(r, sqs([[bx, by], [bx - 10, by + 22 * grow], [bx - 14, by + 44 * grow - i * 2]]), [3.6, 3.4, 0.6], i % 2 ? S_WING2 : m, 5);
    }
  }
  // flames at the feet
  r.ellipse(...sq(0, -3), 26, 4, S_FLAME);
  for (let i = 0; i < 7; i++) flame(r, ...sq(-24 + i * 8, 0), 14 + ((i * 5) % 4) * 4 + wob([0, 3, 1, -2], i + f), 8, 2, (f * Math.PI) / 2 + i * 1.4, i % 2 ? S_FLAME2 : S_FLAME);
  // legs and long robe
  rib(r, sqs([[-5, -70], [-12, -42], [-12, -8]]), [8, 7, 5], S_LIMB2);
  r.poly(sqs([[-24, -10], [-8, -10], [0, -5], [4, -9], [3, 0], [-26, 0]]), S_ARMOR);
  rib(r, sqs([[4, -70], [10, -42], [10, -8]]), [9, 8, 6], S_LIMB);
  r.poly(sqs([[-6, -10], [20, -10], [30, -4], [34, -11], [32, 0], [-6, 0]]), S_ARMOR);
  r.poly(sqs([[-16, -76], [18, -76], [26, -30], [-22, -30]]), S_ARMOR);
  for (const u of [-10, -2, 6, 14]) r.line(...sq(u, -74), ...sq(u + (u > 0 ? 3 : -2), -32), S_SEAM, 1);
  // torso
  rib(r, sqs([[-2, -72], [0, -92], [3, -108]]), [9, 12, 12], S_PLATE);
  r.poly(sqs([[-12, -76], [14, -76], [14, -68], [-12, -68]]), S_COVERT);
  r.ellipse(...sq(4, -108), 15, 9, S_PLATE);
  r.ellipse(...sq(4, -102), 14, 7, S_ARMOR);
  for (const u of [-6, 0, 6, 12]) r.line(...sq(u, -112), ...sq(u, -98), S_SEAM, 1);
  // head: big, helmeted, a sharp short nose, a scowl
  r.ellipse(...sq(6, -126), 15, 15, S_ARMOR);
  r.poly(sqs([[10, -138], [24, -134], [28, -124], [22, -114], [10, -112]]), S_BONE);
  rib(r, sqs([[24, -125], [30, -123], [36, -119]]), [2.6, 2, 0.6], S_BONE, 5);
  r.poly(sqs([[12, -132], [26, -128], [24, -125], [13, -128]]), S_SEAM);
  r.poly(sqs([[14, -130], [25, -127], [24, -125.4], [15, -128.4]]), S_GLOW);
  r.line(...sq(10, -134), ...sq(27, -128), S_SEAM, 1);
  r.line(...sq(14, -117), ...sq(26, -118), S_SEAM, 1);
  rib(r, sqs([[0, -138], [-8, -156], [-24, -166], [-44, -166]]), [5, 4.4, 3, 0.6], S_PLATE);
  rib(r, sqs([[6, -140], [8, -158], [0, -172]]), [3.4, 2.8, 0.5], S_ARMOR);
  for (let i = 0; i < 3; i++) rib(r, sqs([[-6, -128 + i * 6], [-22 - f % 2 * 2, -128 + i * 7], [-40 - i * 3, -118 + i * 9]]), [4.4, 3.4, 0.6], i % 2 ? S_FLAME2 : S_FLAME, 6);
  // arms and the bow
  rib(r, sqs([[8, -106], [34, -104], [62, -106]]), [5.6, 5, 4.4], S_PLATE);
  r.ellipse(...sq(64, -106), 4.5, 4.5, S_LIMB2);
  rib(r, sqs([[-2, -108], [-14, -100], [10, -106]]), [4.6, 4, 3.4], S_LIMB2);
  const arc: XY[] = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 7 - 1;
    arc.push(sq(66 - 11 * t * t, -106 + t * 42));
  }
  r.stroke(arc, S_BOW, 3);
  return bakeSpirit(r, SUSANOO_MATS, SUSANOO_HALO);
}

/** 4: a demon bust: a huge horned, fanged head with flame hair over a mountainous chest and two great arms crossed in a clawed X. */
function susanooBust(f: number): Baked {
  const r = new Raster(SW, SH);
  // wings behind
  for (const s of [1, -1]) {
    rib(r, sflip([[30, -96], [52, -118], [64, -144 - wob([0, 2, 3, 1], f)], [58, -156]], s), [7, 10, 8, 1], S_WING);
    for (let i = 0; i < 4; i++) rib(r, sflip([[40 + i * 4, -104 - i * 8], [56 + i * 2, -100 - i * 8], [62, -92 - i * 6]], s), [3.4, 3, 0.6], i % 2 ? S_WING2 : S_COVERT, 5);
  }
  // fire the bust rises from
  r.ellipse(...sq(0, -34), 40, 8, S_FLAME);
  for (let i = 0; i < 11; i++) flame(r, ...sq(-48 + i * 9.6, -30), 22 + ((i * 9) % 6) * 5 + wob([0, 3, 1, -2], i + f), 11, 3, (f * Math.PI) / 2 + i * 1.3, i % 2 ? S_FLAME2 : S_FLAME);
  // chest
  r.poly(sqs([[-30, -50], [30, -50], [40, -96], [-40, -96]]), S_ARMOR);
  r.poly(sqs([[-22, -58], [22, -58], [26, -90], [-26, -90]]), S_PLATE);
  for (let v = -84; v <= -62; v += 7) r.line(...sq(-24, v), ...sq(24, v), S_SEAM, 1);
  r.line(...sq(0, -90), ...sq(0, -58), S_SEAM, 1);
  // pauldrons with spikes
  for (const s of [1, -1]) {
    for (let i = 0; i < 3; i++) r.ellipse(...sq(s * (42 - i * 2), -102 + i * 7), 20 - i * 2, 9, i % 2 ? S_ARMOR : S_PLATE);
    for (const [u, h] of [[34, 22], [44, 18], [52, 12]] as const) r.poly(sflip([[u - 4, -108], [u + 1, -108 - h], [u + 5, -106]], s), S_PLATE);
  }
  // arms crossed in an X over the chest
  for (const s of [1, -1]) {
    rib(r, sflip([[46, -96], [52, -74], [36, -56]], s), [8, 7, 6], S_LIMB);
    rib(r, sflip([[36, -56], [10, -70], [-14, -88]], s), [6, 5.4, 4.6], S_PLATE);
    claws(r, ...sq(s * -14, -88), s > 0 ? -2.3 : -0.85, 4, 13, 0.4, S_BONE);
  }
  // the head
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.42;
    rib(r, sqs([[Math.cos(a) * 14, -126 + Math.sin(a) * 12], [Math.cos(a) * 30, -126 + Math.sin(a) * 28 - wob([0, 3, 1, 2], f + i)], [Math.cos(a) * 42, -126 + Math.sin(a) * 44]]), [5, 4, 0.7], i % 2 ? S_FLAME2 : S_FLAME, 6);
  }
  r.ellipse(...sq(0, -124), 23, 21, S_ARMOR);
  r.poly(sqs([[-16, -134], [16, -134], [14, -112], [6, -102], [-6, -102], [-14, -112]]), S_BONE);
  for (const s of [1, -1]) {
    r.poly(sflip([[3, -125], [17, -131], [16, -123], [4, -121]], s), S_SEAM);
    r.poly(sflip([[5, -125], [15, -128.5], [14.6, -125.4], [5.4, -123.6]], s), S_GLOW);
    rib(r, sflip([[12, -143], [28, -156], [44, -160], [56, -150]], s), [6.4, 5.4, 3.6, 0.8], S_PLATE);
    r.poly(sflip([[10, -112], [15, -102], [8, -106]], s), S_BONE);
  }
  r.poly(sqs([[-9, -110], [9, -110], [8, -103], [-8, -103]]), S_SEAM);
  for (const u of [-6, -2, 2, 6]) r.poly(sqs([[u - 1.5, -110], [u + 1.5, -110], [u, -105]]), S_BONE);
  return bakeSpirit(r, SUSANOO_MATS, SUSANOO_HALO);
}

/** 5: a neon wraith: a hooded, robed figure with a blank face and two burning eyes, wide sleeves and wings drawn as lines of light. */
function susanooWraith(f: number): Baked {
  const r = new Raster(SW, SH);
  const BODY = 1;
  const WING = 2;
  const LINE = 3;
  for (const s of [1, -1]) {
    for (let i = 0; i < 4; i++) rib(r, sflip([[16, -100 + i * 4], [44 + i * 6, -118 - i * 5 - wob([0, 2, 3, 1], f + i)], [60 + i * 3, -92 - i * 14]], s), [3, 3.4, 0.6], WING, 6);
  }
  r.poly(sqs([[-9, -118], [9, -118], [36, -18], [-36, -18]]), BODY);
  for (const s of [1, -1]) {
    rib(r, sflip([[12, -100], [38, -96], [60, -82]], s), [6, 9, 15], BODY);
    claws(r, ...sq(s * 61, -80), s > 0 ? 0.5 : 2.6, 4, 11, 0.4, LINE);
  }
  r.ellipse(...sq(0, -126), 14, 17, BODY);
  r.poly(sqs([[-14, -126], [0, -158], [14, -126]]), BODY);
  for (const s of [1, -1]) rib(r, sflip([[7, -138], [18, -152], [30, -152]], s), [4, 3, 0.6], BODY);
  r.ellipse(...sq(0, -122), 8, 11, 0);
  for (const s of [1, -1]) r.poly(sflip([[2, -124], [7, -127], [6, -123.5], [3, -122.5]], s), LINE);
  r.line(...sq(0, -98), ...sq(0, -24), LINE, 1);
  for (let v = -90; v < -30; v += 12) {
    r.line(...sq(-14 - (-v - 90) * -0.2, v), ...sq(0, v + 8), LINE, 1);
    r.line(...sq(14 + (-v - 90) * -0.2, v), ...sq(0, v + 8), LINE, 1);
  }
  for (let i = 0; i < 8; i++) {
    const ph = (f * 0.25 + i * 0.37) % 1;
    r.set(...sq(-30 + ((i * 11) % 60), -26 - ph * 90), LINE);
  }
  return neon(r, 0xcaa0ff, 0x8a58dc, { [LINE]: 0xffffff });
}

// ---------------------------------------------------------------- Kurama (canvas 160 x 116, feet at (80, 112))

const KW = 192;
const KH = 116;
const KAX = 100;
const KAY = 112;
const kq = (u: number, v: number): XY => [KAX + u, KAY + v];
const kqs = (pts: XY[]): XY[] => pts.map(([u, v]) => kq(u, v));
const TAILS = [1, 2, 3];

/** nine flowing tails from a base point, fanned between two directions (degrees, screen angle) */
function tails(r: Pen, base: XY, a0: number, a1: number, len: number, f: number, curl = -8): void {
  for (let i = 0; i < 9; i++) {
    const a = ((a0 + ((a1 - a0) * i) / 8) * Math.PI) / 180;
    const L = len - Math.abs(i - 4) * 2.5;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const sway = (i % 2 ? 1 : -1) * 5 + wob([0, 2, 0, -2], f + i);
    const pts: XY[] = [
      base,
      [base[0] + dx * L * 0.35 - dy * sway, base[1] + dy * L * 0.35 + dx * sway],
      [base[0] + dx * L * 0.72 + dy * sway, base[1] + dy * L * 0.72 - dx * sway],
      [base[0] + dx * L + (dx > 0 ? 3 : -3), base[1] + dy * L + curl],
    ];
    rib(r, kqs(pts), [3, 8, 8.5, 0.8], TAILS[i % 3], 7);
  }
}

/** The fox's head and mane, facing +x, centred around (cx, cy): a long snout, tall ears, a scowl, fangs, flame mane. */
function foxHead(r: Pen, cx: number, cy: number, f: number, open: number, scale = 1): void {
  const P = (u: number, v: number): XY => kq(cx + u * scale, cy + v * scale);
  const PS = (pts: XY[]): XY[] => pts.map(([u, v]) => P(u, v));
  for (let i = 0; i < 4; i++) rib(r, PS([[-4, -2 + i * 4], [-14 - wob([0, 2, 1, 3], f + i), -6 + i * 6], [-24, -2 + i * 8]]), [3.6 * scale, 3 * scale, 0.5], K_HEAD, 5);
  rib(r, PS([[-2, -8], [-4, -22], [-1, -38]]), [4.6 * scale, 3.4 * scale, 0.4], K_EAR, 6);
  rib(r, PS([[6, -9], [10, -22], [18, -34]]), [4.2 * scale, 3 * scale, 0.4], K_EAR, 6);
  r.ellipse(...P(0, 0), 11 * scale, 9.5 * scale, K_HEAD);
  rib(r, PS([[6, -1], [20, 0], [34, 3 + open * 0.3]]), [7 * scale, 5.2 * scale, 2.4 * scale], K_HEAD, 6);
  rib(r, PS([[6, 5], [19, 8 + open], [32, 8 + open * 1.2]]), [3.4 * scale, 2.8 * scale, 1.6 * scale], K_JAW, 6);
  r.poly(PS([[12, 3], [33, 4], [32, 7 + open], [14, 7 + open]]), K_MOUTH);
  for (const u of [16, 21, 26, 31]) r.poly(PS([[u - 1.4, 3.5], [u + 1.4, 3.6], [u + 0.2, 7.5]]), K_FANG);
  for (const u of [18, 24, 29]) r.poly(PS([[u - 1.3, 7 + open], [u + 1.3, 7 + open], [u, 3.5 + open]]), K_FANG);
  r.poly(PS([[3, -6], [15, -3], [14, -0.5], [4, -2.5]]), K_MARK);
  r.poly(PS([[5, -5], [14, -2.6], [13.6, -1], [5.4, -3]]), K_EYE);
  r.line(...P(11, 1), ...P(16, 5), K_MARK, 1);
  r.poly(PS([[33, 1], [37, 2], [35, 4]]), K_MARK);
}

function foxPaws(r: Pen, x: number, y: number, dir: number, size = 1): void {
  r.poly(kqs([[x - 4 * size, y - 5], [x + dir * 12 * size, y - 5], [x + dir * 14 * size, y], [x - 4 * size, y]]), K_LEG);
  for (let i = 0; i < 3; i++) rib(r, kqs([[x + dir * (9 + i * 2) * size, y - 3 + i], [x + dir * (14 + i * 2) * size, y - 1 + i], [x + dir * (17 + i * 2) * size, y + 2 + i]]), [1.4, 1.1, 0.4], K_FANG, 3);
}

/** 1 (and 2, 3 in other styles): a lean stalking fox: a long snout, tall ears, a deep chest, sprung legs, nine tails streaming up and back. */
function foxStalk(f: number): Raster {
  const r = new Raster(KW, KH);
  tails(r, [-36, -44], -168, -62, 66, f);
  rib(r, kqs([[18, -40], [22, -22], [26, -4]]), [5, 4, 3.4], K_FAR);
  rib(r, kqs([[-24, -40], [-32, -24], [-24, -12], [-26, -3]]), [6, 4.6, 3.6, 3.2], K_FAR);
  rib(r, kqs([[-36, -42], [-14, -52], [10, -54], [30, -44]]), [8, 12, 13.5, 9], K_BODY);
  for (let i = 0; i < 6; i++) flame(r, ...kq(-34 + i * 11, -46 - i * 1.4), 11 + (i % 2) * 4 + wob([0, 2, 3, 1], f + i), 6, -2, (f * Math.PI) / 2 + i * 1.1, K_BODY);
  r.ellipse(...kq(-30, -40), 11, 9, K_LEG);
  rib(r, kqs([[-26, -44], [-38, -26], [-28, -13], [-32, -3]]), [8, 6, 4, 3.6], K_LEG);
  foxPaws(r, -30, -1, 1);
  rib(r, kqs([[26, -42], [36, -22], [38, -4]]), [6.4, 4.8, 3.8], K_LEG);
  foxPaws(r, 36, -1, 1);
  rib(r, kqs([[24, -50], [36, -60], [46, -68]]), [10, 8.6, 7.4], K_HEAD);
  foxHead(r, 54, -68, f, 4);
  r.ellipse(...kq(16, -40), 7.5, 7.5, K_MARK);
  r.ellipse(...kq(16, -40), 5.6, 5.6, K_LEG);
  r.ellipse(...kq(16, -40), 2.4, 2.4, K_MARK);
  r.stroke(kqs([[-36, -46], [-16, -52], [4, -54], [14, -52]]), K_MARK, 1);
  r.stroke(kqs([[22, -34], [26, -22], [28, -10]]), K_MARK, 1);
  return r;
}

/** 4: an upright, hunched demon fox: digitigrade hind legs, long arms with great claws, a head thrust forward, tails fanned high behind. */
function foxUpright(f: number): Raster {
  const r = new Raster(KW, KH);
  tails(r, [-18, -40], -176, -86, 70, f, -10);
  rib(r, kqs([[-10, -44], [-26, -28], [-18, -14], [-22, -3]]), [8, 7, 4.5, 3.6], K_FAR);
  rib(r, kqs([[-6, -44], [-4, -70], [10, -92]]), [11, 14, 12], K_BODY);
  for (let i = 0; i < 5; i++) flame(r, ...kq(-4 + i * 4, -50 - i * 9), 10 + wob([0, 2, 3, 1], f + i), 6, -3, (f * Math.PI) / 2 + i, K_BODY);
  rib(r, kqs([[-2, -46], [-16, -30], [-6, -16], [-10, -3]]), [9, 7, 4.8, 4], K_LEG);
  r.poly(kqs([[-14, -5], [14, -5], [18, 0], [-14, 0]]), K_LEG);
  for (let i = 0; i < 3; i++) rib(r, kqs([[12 + i * 2, -3 + i], [18 + i * 2, -1 + i], [22 + i * 2, 3 + i]]), [1.6, 1.2, 0.4], K_FANG, 3);
  rib(r, kqs([[4, -84], [24, -72], [40, -50]]), [7, 6.4, 5.6], K_LEG);
  claws(r, ...kq(40, -50), 1.1, 4, 14, 0.38, K_FANG);
  rib(r, kqs([[2, -88], [26, -92], [50, -84]]), [6.4, 6, 5.4], K_BODY);
  claws(r, ...kq(50, -84), 0.2, 4, 14, 0.38, K_FANG);
  rib(r, kqs([[6, -88], [14, -96], [20, -102]]), [9, 8, 7], K_HEAD);
  foxHead(r, 28, -104, f, 5, 0.9);
  r.ellipse(...kq(6, -62), 6.5, 6.5, K_MARK);
  r.ellipse(...kq(6, -62), 4.6, 4.6, K_LEG);
  r.ellipse(...kq(6, -62), 2, 2, K_MARK);
  return r;
}

/** 5: only the head and claws: a vast fox head with its mane, two clawed hands reaching ahead, nine tails opening behind it like a halo. */
function foxBust(f: number): Raster {
  const r = new Raster(KW, KH);
  tails(r, [-14, -52], -186, -4, 64, f, -6);
  r.poly(kqs([[-44, 0], [-34, -44], [-4, -62], [30, -50], [40, 0]]), K_BODY);
  for (let i = 0; i < 7; i++) flame(r, ...kq(-34 + i * 10, -42 - Math.abs(i - 3) * -3), 12 + wob([0, 3, 1, 2], f + i) + (i % 2) * 5, 7, -2, (f * Math.PI) / 2 + i * 1.2, K_BODY);
  for (const [bx, by, dir] of [[26, -26, 1], [44, -8, 1]] as const) {
    rib(r, kqs([[bx - 20, by - 10], [bx - 4, by - 6], [bx + 12, by + 2]]), [8, 7, 6], K_LEG);
    claws(r, ...kq(bx + 12, by + 2), 0.1 * dir, 4, 14, 0.4, K_FANG);
  }
  foxHead(r, 6, -64, f, 7, 1.7);
  return r;
}

function glowFox(make: (f: number) => Raster) {
  return (f: number): Baked => bakeSpirit(make(f), KURAMA_MATS, KURAMA_HALO);
}

const FUR: Material[] = [
  mat(0xb04a08, 0xf08a1a, 0xffb838, 0xffe38a),
  mat(0xa84208, 0xe87a14, 0xffa830, 0xffd870),
  mat(0xb85210, 0xf49424, 0xffc040, 0xffe898),
  mat(0x7a3006, 0xb85a10, 0xe08020, 0xf8b040),
  mat(0xc4560a, 0xff9a22, 0xffc040, 0xffe890),
  mat(0xb84e08, 0xf28c1c, 0xffb838, 0xffe38a),
  mat(0xc4560a, 0xff9a22, 0xffc040, 0xffe890),
  mat(0x9a3c06, 0xd87012, 0xf4a030, 0xffd070),
  mat(0xc4560a, 0xff9a22, 0xffc040, 0xffe890),
  mat(0x24100a, 0x24100a, 0x24100a, 0x24100a),
  mat(0x4a1006, 0x4a1006, 0x4a1006, 0x4a1006),
  mat(0xfff4d8, 0xfff4d8, 0xffffff, 0xffffff),
  mat(0xfff8c0, 0xfff8c0, 0xfffff0, 0xffffff),
];

function solidFox(f: number): Baked {
  return bake(foxStalk(f), FUR, 0x3a1204, true);
}

function neonFox(f: number): Baked {
  return neon(foxStalk(f), 0xffc030, 0xf8700c, { [K_MARK]: 0xffd060, [K_EYE]: 0xffffff, [K_FANG]: 0xfff4d8, [K_MOUTH]: 0xff8a20 });
}

export const SUSANOO_OPTIONS: SpiritOption[] = [
  { id: 's1', name: '1 RIBCAGE COLOSSUS', note: 'GLOW. A TOWERING SKELETON: RIBS, HORNED SKULL, CLAWED ARMS, FLAME BASE', w: SW, h: SH, ax: SAX, ay: SAY, bake: susanooRibs },
  { id: 's2', name: '2 ARMOURED SAMURAI', note: 'SOLID + OUTLINE. SAME LOOK AS THE FIGHTERS, SCALED UP. GREAT SWORD', w: SW, h: SH, ax: SAX, ay: SAY, bake: susanooSamurai },
  { id: 's3', name: '3 WINGED ARCHER', note: 'GLOW. SIDE VIEW WITH THE BOW (GAMEPLAY-READY): BIG HEAD, CURVED WINGS', w: SW, h: SH, ax: SAX, ay: SAY, bake: susanooArcher },
  { id: 's4', name: '4 DEMON BUST', note: 'GLOW. HUGE FANGED HEAD, FLAME HAIR, CROSSED CLAW ARMS, RISING FROM FIRE', w: SW, h: SH, ax: SAX, ay: SAY, bake: susanooBust },
  { id: 's5', name: '5 NEON WRAITH', note: 'OUTLINE ONLY. HOODED ROBED FIGURE, BURNING EYES, WINGS OF LIGHT', w: SW, h: SH, ax: SAX, ay: SAY, bake: susanooWraith },
];

export const KURAMA_OPTIONS: SpiritOption[] = [
  { id: 'k1', name: '1 STALKING FOX', note: 'GLOW. LEAN QUADRUPED, LONG SNOUT, NINE TAILS STREAMING UP AND BACK', w: KW, h: KH, ax: KAX, ay: KAY, bake: glowFox(foxStalk) },
  { id: 'k2', name: '2 SOLID FOX', note: 'SOLID + OUTLINE. THE SAME FOX AS A CEL-SHADED, OPAQUE SPRITE', w: KW, h: KH, ax: KAX, ay: KAY, bake: solidFox },
  { id: 'k3', name: '3 NEON FOX', note: 'OUTLINE ONLY. THE SAME FOX AS A WIREFRAME OF LIGHT', w: KW, h: KH, ax: KAX, ay: KAY, bake: neonFox },
  { id: 'k4', name: '4 UPRIGHT DEMON FOX', note: 'GLOW. HUNCHED ON TWO LEGS, LONG ARMS AND GREAT CLAWS, TAILS FANNED HIGH', w: KW, h: KH, ax: KAX, ay: KAY, bake: glowFox(foxUpright) },
  { id: 'k5', name: '5 GUARDIAN BUST', note: 'GLOW. A VAST HEAD, TWO CLAWED HANDS REACHING AHEAD, TAILS AS A HALO', w: KW, h: KH, ax: KAX, ay: KAY, bake: glowFox(foxBust) },
];
