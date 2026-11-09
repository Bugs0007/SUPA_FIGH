// Pixel sprites for Sasuke's travelling jutsu. Like every other
// sprite they are hard pixels with a few flat bands and a one-pixel dark outline, no gradients and no translucency.
// Projectiles fly at any angle, so they are rasterized straight onto the world grid for one of 32 headings (nothing is
// rotated or scaled afterwards). Phaser-free: SasukeAbilityArt paints the runs.

import { inkLine, Raster, toRuns, type Baked, type Ink, type Pt } from './pixelRaster';

/** fireball bands, outside to inside, and its outline (the game palette's reds, orange and yellows) */
export const FIRE = {
  outline: 0x4a0d16,
  red: 0xb8283a,
  orange: 0xf07a2a,
  yellow: 0xf8c840,
  core: 0xfff4a0,
  /** embers that drop off the tail, hottest first */
  embers: [0xfff4a0, 0xf8c840, 0xf07a2a, 0xb8283a],
};
export const FIREBALL_FRAMES = 4;
export const HEADINGS = 32;

export interface WorldSprite {
  baked: Baked;
  /** world offset of the raster's top-left pixel from the projectile's (rounded) centre */
  ox: number;
  oy: number;
}

/** Quantize a direction to one of the 32 headings the sprites are cached for. */
export function heading(dx: number, dy: number): number {
  const a = Math.atan2(dy, dx);
  return ((Math.round((a / (Math.PI * 2)) * HEADINGS) % HEADINGS) + HEADINGS) % HEADINGS;
}

function outlined(colors: Int32Array, w: number, h: number, outline: number): void {
  const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && colors[y * w + x] >= 0 && colors[y * w + x] !== outline;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (colors[y * w + x] >= 0) continue;
      if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) colors[y * w + x] = outline;
    }
  }
}

/** point in triangle (local coordinates) */
function inTri(px: number, py: number, a: readonly number[], b: readonly number[], c: readonly number[]): boolean {
  const s = (p: readonly number[], q: readonly number[]) => (px - q[0]) * (p[1] - q[1]) - (p[0] - q[0]) * (py - q[1]);
  const d1 = s(a, b);
  const d2 = s(b, c);
  const d3 = s(c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

/** how long each tail tongue is (fraction of the radius) per flicker frame: they take turns licking further back */
const TONGUE = [0.55, 0.9, 0.7, 1.05, 0.6];

function fireballRaster(radius: number, dir: number, frame: number): WorldSprite {
  const R = Math.max(1.5, radius);
  const a = (dir / HEADINGS) * Math.PI * 2;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  // tongues trail behind the ball: 3 for a small ball, up to 5 for the biggest
  const n = R < 4 ? 0 : Math.max(3, Math.min(5, Math.round(R / 3)));
  const tail = R * 2.2;
  const pad = Math.ceil(R + tail) + 2;
  const w = pad * 2 + 1;
  const colors = new Int32Array(w * w).fill(-1);
  // red tongues first, their orange hearts after (a later match wins, so the hearts stay on top)
  const tris: { t: number[][]; c: number }[] = [];
  for (let i = 0; i < n; i++) {
    const lane = (i / (n - 1) - 0.5) * 1.15 * R;
    const middle = Math.abs(i / (n - 1) - 0.5) < 0.2;
    const len = R * (TONGUE[(i + frame) % TONGUE.length] - (middle ? 0 : 0.15));
    const wob = [0, 1, 0, -1][(i + frame) % 4];
    const hw = Math.max(2, R * 0.42);
    const tip = [-R - len, lane * 1.25 + wob];
    tris.unshift({ t: [[-R * 0.2, lane - hw], tip, [-R * 0.2, lane + hw]], c: FIRE.red });
    if (middle || n === 4) tris.push({ t: [[-R * 0.5, lane - hw * 0.55], [tip[0] + len * 0.5, tip[1]], [-R * 0.5, lane + hw * 0.55]], c: FIRE.orange });
  }
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      // pixel centre in the ball's frame: f = forward along the flight, s = sideways
      const wx = x - pad;
      const wy = y - pad;
      const f = wx * ux + wy * uy;
      const s = -wx * uy + wy * ux;
      const d = Math.hypot(f, s);
      const th = Math.atan2(s, f);
      // the back half of the rim flickers; the leading edge stays round
      const rim = R + (f < 0 ? 0.8 : 0.25) * Math.sin(th * 5 + frame * 2.4);
      let c = -1;
      if (d <= rim) {
        // the hot core leads: bands are centred a little ahead of the middle
        const dc = Math.hypot(f - R * 0.22, s);
        c = dc < R * 0.34 ? FIRE.core : dc < R * 0.62 ? FIRE.yellow : d < rim - Math.max(1, R * 0.17) ? FIRE.orange : FIRE.red;
      } else {
        for (const t of tris) if (inTri(f, s, t.t[0], t.t[1], t.t[2])) c = t.c;
      }
      colors[y * w + x] = c;
    }
  }
  outlined(colors, w, w, FIRE.outline);
  return { baked: toRuns(colors, w, w), ox: -pad, oy: -pad };
}

const cache = new Map<string, WorldSprite>();
function cached(key: string, make: () => WorldSprite): WorldSprite {
  let s = cache.get(key);
  if (!s) {
    s = make();
    cache.set(key, s);
  }
  return s;
}

/** The fireball, as big as its hitbox (`radius` in pixels), flying along heading `dir` (0..31), flicker frame 0..3. */
export function fireballSprite(radius: number, dir: number, frame: number): WorldSprite {
  const r = Math.round(radius * 2) / 2;
  const h = ((dir % HEADINGS) + HEADINGS) % HEADINGS;
  const fr = ((frame % FIREBALL_FRAMES) + FIREBALL_FRAMES) % FIREBALL_FRAMES;
  return cached(`f${r}|${h}|${fr}`, () => fireballRaster(r, h, fr));
}

const DRAGON_FIRE = [-1, 0xa92520, 0xfa5924, 0xff8d2e, 0xffbf50, 0xffedaa, 0x54131a];

/** A fire dragon head with an open jaw and a neck that breaks into trailing flames. */
function dragonFireRaster(radius: number, dir: number, frame: number): WorldSprite {
  const angle = dir / HEADINGS * Math.PI * 2;
  const ux = Math.cos(angle), uy = Math.sin(angle);
  const upright = ux < -0.001 ? -1 : 1;
  const scale = Math.max(1.5, radius) / 14;
  const pad = Math.ceil(43 * scale) + 2;
  const w = pad * 2 + 1;
  const raster = new Raster(w, w);
  const shape = (points: readonly Pt[], material: number) => raster.poly(points.map(([x, y]): Pt => [
    pad + (x * ux - y * uy * upright) * scale,
    pad + (x * uy + y * ux * upright) * scale,
  ]), material);
  const flicker = [0, 2, -1, 1][frame];

  // Long, staggered flames tighten into the neck instead of spreading like a fan.
  shape([[-41 - flicker, 4], [-33, 0], [-36, -4 - flicker], [-27, -3], [-27, -8],
    [-17, -5], [-11, -10], [-3, -6], [0, 8], [-10, 10], [-17, 8], [-25, 12],
    [-22, 7], [-32, 9], [-29, 5]], 1);
  shape([[-36, 4], [-27, 0], [-29, -3], [-22, -1], [-18, -6], [-11, -5], [-5, 2],
    [-9, 8], [-16, 6], [-22, 8], [-20, 4], [-29, 6]], 2);
  shape([[-30, 4], [-21, 1], [-22, -1], [-13, -3], [-8, 1], [-12, 4], [-18, 3]], 3);
  shape([[-27, -6], [-33, -11 - flicker], [-27, -10], [-21, -7], [-17, -5]], 2);

  // Two swept horns frame a heavy brow and a long, hooked muzzle.
  shape([[-13, -7], [-16, -14], [-22, -19], [-17, -18], [-10, -14], [-7, -9]], 1);
  shape([[-11, -7], [-14, -14], [-19, -17], [-13, -15], [-8, -11]], 3);
  shape([[-8, -10], [-10, -16], [-15, -23], [-9, -21], [-4, -16], [-1, -9]], 2);
  shape([[-7, -11], [-9, -17], [-12, -21], [-7, -18], [-3, -13]], 4);
  shape([[-16, 4], [-13, -8], [-9, -11], [-4, -11], [-2, -15], [0, -11], [5, -10],
    [8, -7], [13, -7], [16, -4], [15, -1], [12, 1], [7, 2], [11, 4], [15, 2],
    [14, 6], [10, 9], [2, 11], [-5, 8], [-10, 11], [-9, 6], [-13, 8]], 2);
  shape([[-13, 3], [-9, -6], [-5, -9], [0, -10], [4, -9], [8, -6], [13, -6],
    [15, -4], [12, -2], [5, -2], [0, 1], [-4, 6], [-10, 5]], 3);
  shape([[-4, -7], [1, -9], [5, -8], [8, -6], [12, -6], [14, -4], [11, -4],
    [8, -5], [4, -6], [-1, -4]], 4);
  shape([[-2, 2], [4, -1], [13, -1], [11, 1], [7, 2], [5, 4], [9, 6],
    [14, 3], [12, 6], [9, 8], [2, 7], [-3, 5]], 6);
  shape([[-2, 6], [3, 8], [9, 7], [14, 4], [11, 8], [5, 10], [0, 10]], 3);

  // A slanted eye and visible teeth keep the face readable at projectile scale.
  shape([[-2, -6], [2, -7], [6, -8], [5, -5], [1, -4], [-2, -4]], 6);
  shape([[0, -5], [5, -7], [4, -5], [1, -4]], 5);
  shape([[11, -5], [14, -4], [13, -3], [11, -4]], 6);
  shape([[11, -1], [14, -2], [12, 2]], 5);
  shape([[6, 0], [9, -1], [7, 3]], 5);
  shape([[9, 6], [11, 3], [12, 5]], 5);
  shape([[-10, -1], [-6, -5], [-4, -5], [-7, -2], [-9, 2], [-12, 4]], 4);

  const colors = Int32Array.from(raster.m, material => DRAGON_FIRE[material]);
  outlined(colors, w, w, FIRE.outline);
  return { baked: toRuns(colors, w, w), ox: -pad, oy: -pad };
}

export function dragonFireSprite(radius: number, dir: number, frame: number): WorldSprite {
  const r = Math.round(radius * 2) / 2;
  const h = ((dir % HEADINGS) + HEADINGS) % HEADINGS;
  const fr = ((frame % FIREBALL_FRAMES) + FIREBALL_FRAMES) % FIREBALL_FRAMES;
  return cached(`d${r}|${h}|${fr}`, () => dragonFireRaster(r, h, fr));
}

/** Susanoo's arrow in flight: a glowing head, a pale shaft, violet fletching and a short dashed trail. */
export const ARROW = { head: 0xffffff, head2: 0xd2c2ff, shaft: 0xf6f2ff, fletch: 0xa184ff, trail: 0x8a5cf0, outline: 0x140b33 };

function arrowRaster(size: number, dir: number, frame: number): WorldSprite {
  const a = (dir / HEADINGS) * Math.PI * 2;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const len = Math.round(16 + size * 1.5);
  const hl = Math.max(4, Math.round(size * 1.2));
  const pad = len + 4;
  const w = pad * 2 + 1;
  const colors = new Int32Array(w * w).fill(-1);
  // the head: a filled triangle at the front, outlined
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const f = (x - pad) * ux + (y - pad) * uy;
      const s = -(x - pad) * uy + (y - pad) * ux;
      if (f <= 1 && f >= -hl && Math.abs(s) <= ((1 - f) / (hl + 1)) * (hl * 0.5) + 0.3) colors[y * w + x] = f > -hl * 0.5 ? ARROW.head : ARROW.head2;
    }
  }
  outlined(colors, w, w, ARROW.outline);
  const ink: Ink[] = [];
  const P = (f: number, s = 0): [number, number] => [Math.round(pad + f * ux - s * uy), Math.round(pad + f * uy + s * ux)];
  const [bx, by] = P(-hl - 1);
  const [tx, ty] = P(-len);
  inkLine(ink, bx, by, tx, ty, ARROW.shaft);
  // chakra glow along both sides of the shaft (written after, so it only fills the gaps)
  for (const side of [-1, 1]) {
    const [cx0, cy0] = P(-hl - 1, side);
    const [cx1, cy1] = P(-len + 4, side);
    inkLine(ink, cx0, cy0, cx1, cy1, ARROW.fletch);
  }
  for (const side of [-1, 1]) {
    const [fx, fy] = P(-len + 3, side * 2);
    const [gx, gy] = P(-len, side * 2);
    inkLine(ink, fx, fy, gx, gy, ARROW.fletch);
  }
  // a dashed trail behind, marching with the frame
  for (let k = 0; k < 3; k++) {
    const f0 = -len - 3 - k * 5 - (frame % 2) * 2;
    const [ax0, ay0] = P(f0);
    const [ax1, ay1] = P(f0 - 2);
    inkLine(ink, ax0, ay0, ax1, ay1, ARROW.trail);
  }
  for (const p of ink) if (p.x >= 0 && p.y >= 0 && p.x < w && p.y < w && colors[p.y * w + p.x] < 0) colors[p.y * w + p.x] = p.c;
  return { baked: toRuns(colors, w, w), ox: -pad, oy: -pad };
}

export function arrowSprite(size: number, dir: number, frame: number): WorldSprite {
  const s = Math.round(size);
  const h = ((dir % HEADINGS) + HEADINGS) % HEADINGS;
  return cached(`a${s}|${h}|${frame % 2}`, () => arrowRaster(s, h, frame % 2));
}
