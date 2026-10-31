// Pixel-art sprites for the big spirits (Sasuke's Susanoo, Naruto's Kurama) and the spectral / chakra arms that throw
// the transformed punches. They are built with the same rules as the fighters: 1-pixel grid, hard edges, four flat
// tones per material, a dark outline, no gradients and no translucency inside a sprite (the whole sprite fades as one).
// Parts are separated by a one-pixel dark rim, the way sprite artists cut plates apart.
// Phaser-free: `AvatarArt` (render/) paints the baked runs. Everything faces +x; facing left mirrors it.

import { SUSANOO_LAUNCH } from '../sim/data/heroes';
import { bake, inkLine, Raster, type Baked, type Ink, type Material, type Pt } from './pixelRaster';

const mat = (dark: number, base: number, light: number, hi: number): Material => ({ dark, base, light, hi });
type XY = [number, number];

/** draw `pts` as `m` with a one-pixel rim of material `rimMat` all around it (cuts the part off from what is behind) */
function rimmed(r: Raster, pts: readonly Pt[], m: number, rimMat: number): void {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) r.poly(pts.map(([x, y]) => [x + dx, y + dy] as Pt), rimMat);
  r.poly(pts, m);
}

function rimmedStroke(r: Raster, pts: readonly Pt[], m: number, rimMat: number, thick: number): void {
  r.stroke(pts, rimMat, thick + 2);
  r.stroke(pts, m, thick);
}

// ---- Susanoo: violet chakra and armour over pale bone, a glowing eye, a chakra bow
const ARMOR = 1;
const BONE = 2;
const VOID = 3;
const GOLD = 4;
const GLOW = 5;
const PLATE = 6;
const CHAKRA = 7;
const FLAME = 8;
const BOW = 9;
export const SUSANOO_MATS: Material[] = [
  mat(0x2b1a5c, 0x5a3aa4, 0x8462d4, 0xbea4fb), // armour
  mat(0x7462b4, 0xb2a2ea, 0xdcd2ff, 0xfaf6ff), // bone
  mat(0x110a2a, 0x1c1242, 0x281a58, 0x34226c), // the dark between parts
  mat(0x7c4f12, 0xd1982a, 0xffd35a, 0xfff3b0), // gold
  mat(0xb9a4ff, 0xe6dfff, 0xffffff, 0xffffff), // eye / arrowhead glow
  mat(0x3b2580, 0x7150c6, 0x9f84ee, 0xd6c8ff), // lighter plate (layers alternate with armour)
  mat(0x22114c, 0x3a2280, 0x5333a6, 0x6c48c4), // chakra body (the mass behind the ribs)
  mat(0x4a2a9a, 0x8a5cf0, 0xb698ff, 0xe4dcff), // flames at the tail
  mat(0x5e44b8, 0xa184ff, 0xd2c2ff, 0xffffff), // the chakra bow
];
export const SUSANOO_OUTLINE = 0x140b33;
/** the single-pixel string, arrow shaft, fletching and muzzle flash (painted unoutlined over the sprite) */
export const SUSANOO_INK = { string: 0xe2d8ff, shaft: 0xf6f2ff, fletch: 0xa184ff, flash: 0xffffff, flash2: 0xd2c2ff };

/**
 * The baked Susanoo's layout. The raster pixel (ax, ay) sits on the fighter's feet; the arrowhead's point is exactly
 * on `SUSANOO_LAUNCH` (sim/data/heroes.ts), where the sim spawns the arrow. Stages 0..3 draw the bow back, 4 is the shot
 * (string snapping, muzzle flash), 5 the bow at rest while the spirit fades.
 */
export const SUSANOO = {
  ax: 54,
  ay: 96,
  w: 104,
  h: 100,
  stages: 4,
  shot: 4,
  rest: 5,
  /** body proportions are drawn once and scaled up for the Perfect form (geometry only: still 1 art px = 1 world px) */
  scale: { 3: 1.12, 4: 1.22 } as Record<3 | 4, number>,
  /** how far behind the bow tips the string's middle is pulled at each draw stage (before the form scale) */
  draw: [4, 10, 15, 21] as const,
};

function susanooRaster(level: 3 | 4, stage: number, frame: number): Baked {
  const { ax, ay } = SUSANOO;
  const r = new Raster(SUSANOO.w, SUSANOO.h);
  const ink: Ink[] = [];
  const top = level === 4;
  const k = SUSANOO.scale[level];
  // body coordinates: u pixels ahead of the feet, v pixels up from them (negative), before the form scale
  const Q = (u: number, v: number): Pt => [ax + u * k, ay + v * k];
  const P = (pts: XY[]): Pt[] => pts.map(([u, v]) => Q(u, v));
  const R = (u: number, v: number): XY => [Math.round(ax + u * k), Math.round(ay + v * k)];
  const line = (a: XY, b: XY, m: number, thick = 1) => r.line(a[0], a[1], b[0], b[1], m, thick);
  // the bow is placed from the launch point, in whole pixels
  const launch = SUSANOO_LAUNCH[level];
  const lx = ax + launch.ahead;
  const ly = ay - launch.up;
  const gx = lx - 4; // the grip
  const bend = Math.round(7 * k);
  const half = Math.round(22 * k);
  const tipX = gx - bend;
  const drawing = stage < SUSANOO.stages;
  const nockX = drawing ? tipX - Math.round(SUSANOO.draw[stage] * k) : tipX;
  const limb = top ? ARMOR : BONE;

  // Perfect Susanoo: a fan of long feathers behind the shoulders (two wings' worth), beating with the flame frames
  if (top) {
    const flap = [0, 4, 7][frame % 3];
    for (let i = 0; i < 5; i++) {
      const a = ((-104 - i * 16 + flap * (1 - i * 0.15)) * Math.PI) / 180;
      const len = 30 - i * 1.5;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const at = (t: number, w: number): XY => [-12 + dx * len * t - dy * w, -37 + dy * len * t + dx * w];
      rimmed(r, P([at(0, -2), at(0.55, -3.6), at(0.88, -2.4), at(1, 0), at(0.7, 3), at(0.3, 3), at(0, 2)]), i % 2 ? PLATE : BONE, VOID);
      // a quill down the middle of each feather
      line(R(...at(0.15, 0)), R(...at(0.75, 0)), VOID);
    }
  }

  // the spirit has no legs: below the waist its chakra streams back into a tail of violet flame
  r.poly(P([[-18, -17], [5, -17], [2, -11], [-6, -6], [-17, -3], [-29, -4], [-23, -8], [-20, -12]]), CHAKRA);
  const tongues: [number, number, number][] = [
    [-20, -14, 5],
    [-24, -9, 7],
    [-29, -5, 6],
    [-12, -6, 5],
    [-3, -9, 4],
  ];
  tongues.forEach(([u, v, len], i) => {
    const l = len + [0, 2, 1][(i + frame) % 3];
    const lean = [0, 1.5, -1][(i * 2 + frame) % 3];
    const dx = -0.86;
    const dy = i < 3 ? -0.5 : 0.25;
    rimmed(r, P([[u + 2 * dy, v - 2 * dx], [u + dx * l + lean * dy, v + dy * l - lean * dx], [u - 2 * dy, v + 2 * dx]]), FLAME, VOID);
  });

  // chest: a dark chakra mass with pale ribs (Mangekyo), or a full breastplate with a gold belt (Perfect)
  const chest: XY[] = [[-20, -38], [4, -38], [8, -31], [7, -22], [3, -16], [-16, -16], [-21, -26]];
  if (top) {
    rimmed(r, P(chest), ARMOR, VOID);
    rimmed(r, P([[-16, -36], [3, -36], [6, -30], [-1, -28], [-15, -28]]), PLATE, VOID);
    line(R(-18, -23), R(6, -23), VOID);
    line(R(-17, -17), R(5, -17), GOLD, 2);
    for (let i = 0; i < 3; i++) {
      const u0 = -16 + i * 7;
      rimmed(r, P([[u0, -16], [u0 + 7, -16], [u0 + 6.5, -10 + (i === 1 ? 1 : 0)], [u0 + 0.5, -10]]), i % 2 ? PLATE : ARMOR, VOID);
    }
  } else {
    r.poly(P(chest), CHAKRA);
    rimmedStroke(r, [R(-15, -37), R(-15, -16)], BONE, VOID, 3);
    for (let v = -34; v <= -18; v += 4) line(R(-16, v), R(-14, v), VOID);
    for (let i = 0; i < 4; i++) {
      // each rib arcs up and forward from the spine and curls down at the front; the cage narrows toward the waist
      const y0 = -33 + i * 5;
      const f = 6 - i;
      rimmedStroke(r, [R(-15, y0), R(-9, y0 - 2), R(-2, y0 - 2), R(f - 2, y0), R(f, y0 + 3)], BONE, VOID, 2);
    }
    rimmedStroke(r, [R(-18, -37), R(3, -37)], BONE, VOID, 2);
  }

  // the drawing arm: from the back shoulder, elbow pulled back as the string comes to the cheek
  const elbows: XY[] = [[0, -28], [-8, -28], [-15, -29], [-21, -31]];
  const elbow = drawing ? elbows[stage] : elbows[0];
  const hand: XY = [nockX, ly];
  rimmedStroke(r, [R(-14, -35), R(...elbow)], limb, VOID, top ? 4 : 3);
  rimmedStroke(r, [R(...elbow), drawing ? hand : R(...elbows[0])], limb, VOID, top ? 3 : 2);
  if (top) rimmed(r, P([[-24, -40], [-12, -41], [-9, -34], [-14, -29], [-24, -32]]), PLATE, VOID);

  // head: a swept horn, a rounded helmet and a long pale face plate with one glowing eye
  rimmed(r, P([[-7, -53], [-15, -58], [-25, -62], [-16, -55], [-11, -50]]), top ? PLATE : BONE, VOID);
  if (!top) rimmed(r, P([[0, -53], [5, -59], [4, -51]]), BONE, VOID);
  rimmed(r, P([[-13, -41], [-14, -47], [-11, -52], [-5, -55], [1, -54], [5, -50], [6, -45], [3, -41]]), ARMOR, VOID);
  if (top) {
    for (const spike of [[[-7, -53], [-6, -61], [-3, -54]], [[-2, -54], [0, -64], [2, -54]], [[2, -52], [6, -59], [5, -50]]] as XY[][]) rimmed(r, P(spike), GOLD, VOID);
    line(R(-13, -46), R(4, -50), GOLD);
  }
  rimmed(r, P([[0, -51], [8, -51], [9, -46], [9, -40], [6, -35], [1, -37], [-1, -45]]), BONE, VOID);
  r.poly(P([[2, -49.5], [9, -48.5], [9, -46.5], [2, -47]]), VOID);
  const [ex, ey] = R(5, -48.5);
  r.rect(ex, ey, 3, 1, GLOW);
  const [mx, my] = R(3, -41);
  r.rect(mx, my, Math.round(6 * k), 1, VOID);
  r.set(mx + 1, my + 1, VOID);
  r.set(mx + Math.round(4 * k), my + 1, VOID);

  // the bow arm reaches forward to the grip
  if (top) rimmed(r, P([[-3, -40], [7, -39], [10, -33], [6, -29], [-2, -31]]), PLATE, VOID);
  const fe = R(14, -33);
  rimmedStroke(r, [R(3, -35), fe], limb, VOID, top ? 4 : 3);
  rimmedStroke(r, [fe, [gx - 2, ly]], limb, VOID, top ? 3 : 2);
  if (top) line([gx - 6, ly - 2], [gx - 6, ly + 2], GOLD, 2);

  // the bow: a recurved arc of chakra, the hand closed around its grip
  const arc: XY[] = [[tipX + 2, ly - half - 2]];
  for (let i = 0; i <= 10; i++) {
    const t = i / 5 - 1;
    arc.push([Math.round(gx - bend * t * t), Math.round(ly + t * half)]);
  }
  arc.push([tipX + 2, ly + half + 2]);
  r.stroke(arc, BOW, top ? 3 : 2);
  r.ellipse(gx - 1.5, ly + 0.5, 3.2, 3.2, VOID);
  r.ellipse(gx - 1.5, ly + 0.5, 2.3, 2.3, limb);

  // the string (single pixels, as on the fighters' bows), the arrow while drawing, a muzzle flash on the shot
  const top0: XY = [tipX, ly - half];
  const bot0: XY = [tipX, ly + half];
  if (drawing) {
    inkLine(ink, top0[0], top0[1], nockX, ly, SUSANOO_INK.string);
    inkLine(ink, nockX, ly, bot0[0], bot0[1], SUSANOO_INK.string);
    for (let c = 0; c < 4; c++) for (let j = -Math.min(c, 2); j <= Math.min(c, 2); j++) r.set(lx - c, ly + j, GLOW);
    inkLine(ink, nockX + 1, ly, lx - 4, ly, SUSANOO_INK.shaft);
    for (const [dx, dy] of [[1, -1], [2, -1], [1, 1], [2, 1]]) ink.push({ x: nockX + dx, y: ly + dy, c: SUSANOO_INK.fletch });
  } else {
    // just released, the string snaps past straight and quivers; then it rests straight
    const mid = stage === SUSANOO.shot ? tipX + 1 : tipX;
    inkLine(ink, top0[0], top0[1], mid, ly, SUSANOO_INK.string);
    inkLine(ink, mid, ly, bot0[0], bot0[1], SUSANOO_INK.string);
    if (stage === SUSANOO.shot) {
      inkLine(ink, lx + 1, ly, lx + 7, ly, SUSANOO_INK.flash);
      inkLine(ink, lx + 1, ly - 3, lx + 1, ly + 3, SUSANOO_INK.flash2);
      for (const [dx, dy] of [[2, -1], [2, 1], [3, -2], [3, 2], [0, 0], [-1, 0]]) ink.push({ x: lx + dx, y: ly + dy, c: dx > 2 ? SUSANOO_INK.flash2 : SUSANOO_INK.flash });
    }
  }
  return bake(r, SUSANOO_MATS, SUSANOO_OUTLINE, false, ink);
}

const spriteCache = new Map<string, Baked>();
function cached(key: string, make: () => Baked): Baked {
  let b = spriteCache.get(key);
  if (!b) {
    b = make();
    spriteCache.set(key, b);
  }
  return b;
}

/**
 * The Susanoo for a form (3 = Mangekyo, 4 = Perfect): `stage` 0..3 draws the bow back, 4 = the shot, 5 = at rest;
 * animation frame 0..2 (the flames flicker, the wings beat).
 */
export function susanooSprite(level: 3 | 4, stage: number, frame: number): Baked {
  const s = Math.max(0, Math.min(SUSANOO.rest, Math.floor(stage)));
  return cached(`s${level}|${s}|${frame % 3}`, () => susanooRaster(level, s, frame % 3));
}

// ---- Kurama: gold fur, orange shading, cream fangs, red slit eye
const FUR = 1;
const FUR2 = 2;
const CREAM = 3;
const MOUTH = 4;
const EYE = 5;
export const KURAMA_MATS: Material[] = [
  mat(0x9a5f12, 0xeaa028, 0xffcb4a, 0xfff0a6),
  mat(0x70300e, 0xc9651a, 0xf08a30, 0xffb860),
  mat(0xc8b88a, 0xf4e8c4, 0xfff6dc, 0xffffff),
  mat(0x1c0a10, 0x3a1420, 0x6a2430, 0x923a3a),
  mat(0xc01818, 0xff4a2a, 0xffa040, 0xfff2c0),
];
export const KURAMA_OUTLINE = 0x3b1a0c;
/** Kurama's chakra arms: the same materials, but a brighter gold with pale highlights (they are chakra, not fur) */
const KURAMA_ARM_MATS: Material[] = [
  mat(0xc27a12, 0xffcf3e, 0xffe784, 0xfffbd0),
  mat(0x8a3f0e, 0xe0801f, 0xffa83a, 0xffd080),
  KURAMA_MATS[2],
  KURAMA_MATS[3],
  KURAMA_MATS[4],
];
/** the raster pixel of Kurama's eye, which is placed 16 px in front of and 37 px above the fighter's feet */
export const KURAMA = { cx: 92, cy: 60, eyeAhead: 16, eyeUp: 37 };

function kuramaRaster(frame: number): Baked {
  const r = new Raster(150, 112);
  const { cx, cy } = KURAMA;
  const P = (pts: XY[]): Pt[] => pts.map(([x, y]) => [cx + x, cy + y] as Pt);
  // nine tails: each a tapering plume (one polygon along a gentle curve), alternating light and dark, fanned behind
  for (let i = 0; i < 9; i++) {
    // from the lowest tail (pointing back) to the highest (pointing up): each leaves the rump a little higher up
    const th = ((198 + i * 10.5) * Math.PI) / 180;
    const len = 50 + ((i * 5) % 4) * 4;
    const sway = (i % 2 ? 1 : -1) * 6 + Math.sin(frame * 2.1 + i) * 1.6;
    const dx = Math.cos(th);
    const dy = Math.sin(th);
    const bx = -22 - (i % 3) * 3;
    const by = 32 - i * 3;
    const centre = (t: number): XY => [bx + dx * len * t - dy * Math.sin(t * Math.PI) * sway, by + dy * len * t + dx * Math.sin(t * Math.PI) * sway];
    const left: XY[] = [];
    const right: XY[] = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      const w = 5.6 * Math.sin(Math.min(1, t * 1.15 + 0.12) * Math.PI * 0.62) + 0.6;
      const [px, py] = centre(t);
      const [qx, qy] = centre(Math.min(1, t + 0.05));
      const ex = qx - px;
      const ey = qy - py;
      const l = Math.hypot(ex, ey) || 1;
      left.push([px - (ey / l) * w, py + (ex / l) * w]);
      right.push([px + (ey / l) * w, py - (ex / l) * w]);
    }
    rimmed(r, P([...left, ...right.reverse()]), i % 2 ? FUR2 : FUR, MOUTH);
    // a pale tip on every plume
    const [tx, ty] = centre(0.97);
    r.ellipse(cx + tx, cy + ty, 1.5, 1.5, CREAM);
  }
  // body: a hunched shoulder mass behind the head, a cream chest, planted paws
  rimmed(r, P([[-14, 2], [-30, 8], [-40, 24], [-38, 40], [-10, 42], [12, 40], [16, 22], [9, 10]]), FUR, MOUTH);
  rimmed(r, P([[4, 14], [16, 16], [15, 36], [10, 37], [6, 30]]), CREAM, MOUTH);
  rimmed(r, P([[-34, 38], [-12, 38], [-10, 44], [-38, 44]]), FUR2, MOUTH);
  rimmed(r, P([[2, 38], [24, 38], [28, 44], [0, 44]]), FUR2, MOUTH);
  for (let i = 0; i < 3; i++) r.rect(cx + 22 + i * 2, cy + 44, 1, 2, CREAM);
  // head: cheek tufts, ears, skull and snout in one shape
  rimmed(r, P([[-14, 4], [-24, 9], [-12, 12]]), FUR2, MOUTH);
  rimmed(r, P([[-12, -13], [-16, -32], [-3, -18]]), FUR2, MOUTH);
  rimmed(r, P([[2, -18], [6, -36], [15, -15]]), FUR2, MOUTH);
  r.poly(P([[-11, -18], [-13, -27], [-6, -19]]), MOUTH);
  r.poly(P([[5, -22], [6, -31], [11, -19]]), MOUTH);
  rimmed(r, P([[-14, -2], [-12, -13], [-4, -18], [6, -18], [13, -13], [18, -8], [28, -5], [37, -1], [38, 4], [30, 6], [18, 8], [4, 10], [-8, 8], [-14, 3]]), FUR, MOUTH);
  // open jaw with fangs
  rimmed(r, P([[16, 9], [34, 8], [32, 15], [18, 16]]), FUR, MOUTH);
  r.poly(P([[17, 7], [35, 6], [33, 10], [19, 11]]), MOUTH);
  r.poly(P([[21, 6], [24, 6], [22.5, 11]]), CREAM);
  r.poly(P([[29, 6], [32, 6], [30.5, 11]]), CREAM);
  r.poly(P([[24, 11], [26, 11], [25, 8]]), CREAM);
  // the eye: a slanted slit with a red glow, a heavy brow and whisker marks
  r.poly(P([[3, -7], [14, -9], [15, -4], [5, -3]]), MOUTH);
  r.rect(cx + 7, cy - 6, 6, 2, EYE);
  r.line(cx + 1, cy - 10, cx + 16, cy - 12, MOUTH);
  r.rect(cx + 36, cy - 2, 3, 2, MOUTH);
  for (let i = 0; i < 3; i++) r.line(cx - 4, cy + 1 + i * 2, cx + 4, cy + i * 2 - 1, MOUTH);
  return bake(r, KURAMA_MATS, KURAMA_OUTLINE, false);
}

export function kuramaSprite(frame: number): Baked {
  return cached(`k|${frame % 3}`, () => kuramaRaster(frame % 3));
}

// ---- arms: shoulder guard, upper arm, elbow, forearm with a bracer, and a clawed fist, in the same pixel rules
export type ArmKind = 'susanoo' | 'kurama' | 'claw';

interface ArmStyle {
  mats: Material[];
  outline: number;
  /** material indices: arm body, paler trim / bands, accent (elbow, shoulder guard), claws, dark rim */
  body: number;
  trim: number;
  accent: number;
  claw: number;
  rim: number;
}

const ARM_STYLES: Record<ArmKind, ArmStyle> = {
  susanoo: { mats: SUSANOO_MATS, outline: SUSANOO_OUTLINE, body: PLATE, trim: BONE, accent: GOLD, claw: GOLD, rim: VOID },
  kurama: { mats: KURAMA_ARM_MATS, outline: KURAMA_OUTLINE, body: FUR, trim: CREAM, accent: FUR2, claw: CREAM, rim: MOUTH },
  // the red chakra cloaks of the first three forms: crimson over dark red, pale claws
  claw: {
    mats: [
      mat(0x5a0f23, 0xc8283c, 0xff6a62, 0xffc2b0),
      mat(0x3a0a18, 0x8a1c30, 0xd8483f, 0xff9a84),
      mat(0xc9b08c, 0xf0dcc0, 0xfff2de, 0xffffff),
      mat(0x1d0610, 0x2e0914, 0x4a1020, 0x6a1a30),
    ],
    outline: 0x1d0610,
    body: 1,
    trim: 3,
    accent: 2,
    claw: 3,
    rim: 4,
  },
};

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
}

export interface ArmSprite {
  baked: Baked;
  /** world position of the raster's top-left pixel */
  ox: number;
  oy: number;
}

/** Rasterize one arm in world coordinates (so no flipping or rotation is needed). */
export function armSprite(a: ArmSpec): ArmSprite {
  const pad = 18;
  const ox = Math.floor(Math.min(a.s[0], a.e[0], a.h[0])) - pad;
  const oy = Math.floor(Math.min(a.s[1], a.e[1], a.h[1])) - pad;
  const w = Math.ceil(Math.max(a.s[0], a.e[0], a.h[0])) - ox + pad;
  const hgt = Math.ceil(Math.max(a.s[1], a.e[1], a.h[1])) - oy + pad;
  const r = new Raster(w, hgt);
  const L = (p: XY): XY => [Math.round(p[0]) - ox, Math.round(p[1]) - oy];
  const [s, e, h] = [L(a.s), L(a.e), L(a.h)];
  const st = ARM_STYLES[a.kind];
  const t = Math.max(3, a.thick | 1);
  const tf = Math.max(3, (t - 2) | 1);

  // upper arm, then forearm over it (each cut off from the other by the rim)
  rimmedStroke(r, [s, e], st.body, st.rim, t);
  rimmedStroke(r, [e, h], st.body, st.rim, tf);
  // bands on the forearm and a bracer right behind the fist
  const len = Math.hypot(h[0] - e[0], h[1] - e[1]) || 1;
  const ux = (h[0] - e[0]) / len;
  const uy = (h[1] - e[1]) / len;
  for (let d = 6; len > 15 && d < len - 6; d += 6) {
    const px = e[0] + ux * d;
    const py = e[1] + uy * d;
    r.line(px - uy * (tf / 2), py + ux * (tf / 2), px + uy * (tf / 2), py - ux * (tf / 2), st.trim);
  }
  const bx = h[0] - ux * 4;
  const by = h[1] - uy * 4;
  r.line(bx - uy * (tf / 2 + 1), by + ux * (tf / 2 + 1), bx + uy * (tf / 2 + 1), by - ux * (tf / 2 + 1), st.accent, 2);
  // shoulder guard (susanoo / chakra mantle) and an elbow spike
  if (a.kind === 'susanoo') rimmed(r, [[s[0] - 4, s[1] - 3], [s[0] + 4, s[1] - 4], [s[0] + 5, s[1] + 3], [s[0] - 3, s[1] + 4]], ARMOR, st.rim);
  rimmed(r, [[e[0] - 3, e[1] - 3], [e[0] + 3, e[1] - 3], [e[0] + 3, e[1] + 2], [e[0] - 3, e[1] + 2]], st.accent, st.rim);
  // the fist: a block with a thumb, knuckles on its front edge and claws beyond them
  const rad = Math.round(t / 2) + (a.kind === 'claw' ? 1 : 2);
  const fx = h[0] + a.d * rad;
  const back = h[0] - a.d * rad;
  rimmed(r, [[back, h[1] - rad], [fx - a.d, h[1] - rad], [fx + a.d, h[1] - rad + 2], [fx + a.d, h[1] + rad - 2], [fx - a.d, h[1] + rad], [back, h[1] + rad]], st.body, st.rim);
  rimmed(r, [[h[0] - a.d * 2, h[1] - rad - 3], [h[0] + a.d * 2, h[1] - rad - 3], [h[0] + a.d * 2, h[1] - rad + 1], [h[0] - a.d * 2, h[1] - rad + 1]], st.body, st.rim);
  for (let i = -1; i <= 1; i++) r.set(fx, h[1] + i * 2, st.trim);
  const clawLen = a.kind === 'susanoo' ? 3 : 5;
  for (let i = -1; i <= 1; i++) r.line(fx + a.d * 2, h[1] + i * 2, fx + a.d * (clawLen + 2), h[1] + i * 2 + Math.sign(i), st.claw);
  return { baked: bake(r, st.mats, st.outline, false), ox, oy };
}
