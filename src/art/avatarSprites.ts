// Pixel-art sprites for the big spirits (Sasuke's Susanoo, Naruto's Kurama) and the spectral / chakra arms that throw
// the transformed punches. They are built with the same rules as the fighters: 1-pixel grid, hard edges, four flat
// tones per material, a dark outline, no gradients and no translucency inside a sprite (the whole sprite fades as one).
// Parts are separated by a one-pixel dark rim, the way sprite artists cut plates apart.
// Phaser-free: `AvatarArt` (render/) paints the baked runs. Everything faces +x; facing left mirrors it.

import { bake, Raster, type Baked, type Material, type Pt } from './pixelRaster';

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

// ---- Susanoo: violet armour over pale bone, gold trim, a glowing eye
const ARMOR = 1;
const BONE = 2;
const VOID = 3;
const GOLD = 4;
const GLOW = 5;
const PLATE = 6;
export const SUSANOO_MATS: Material[] = [
  mat(0x2c2063, 0x5a46b0, 0x8670dc, 0xc2b4f8), // armour
  mat(0x6558b3, 0x9d8fe0, 0xc9bff7, 0xf0ebff), // bone
  mat(0x120c33, 0x1d1450, 0x2e2275, 0x3f3199), // shadow between plates
  mat(0x7c4f12, 0xd1982a, 0xffd35a, 0xfff3b0), // gold
  mat(0xffc94d, 0xffe27a, 0xfff3b0, 0xffffff), // eye / gem glow
  mat(0x3d2f86, 0x6f5ac7, 0x9a86ec, 0xd0c4ff), // lighter plate (layers alternate with armour)
];
export const SUSANOO_OUTLINE = 0x160d3d;

/** where things are in a baked Susanoo, relative to the raster origin */
export const SUSANOO = {
  /** the chest centre, which the sprite is placed on */
  cx: 46,
  cy: 48,
  /** the bow: tips and where the string's middle sits at each draw stage */
  tipTop: [22, -27] as const,
  tipBottom: [22, 29] as const,
  nockX: [21, 17, 13, 9] as const,
  nockY: 2,
  stages: 4,
};

function susanooRaster(level: 3 | 4, stage: number, frame: number): Baked {
  const r = new Raster(96, 84);
  const { cx, cy } = SUSANOO;
  const P = (pts: XY[]): Pt[] => pts.map(([x, y]) => [cx + x, cy + y] as Pt);
  const top = level === 4;
  const nockX = SUSANOO.nockX[Math.max(0, Math.min(SUSANOO.stages - 1, stage))];

  // Perfect Susanoo: a fan of feathers behind the shoulders, flapping between two frames
  if (top) {
    for (let i = 0; i < 6; i++) {
      const a = ((-98 - i * 14 + (frame % 2 ? 3 : 0)) * Math.PI) / 180;
      const len = 31 - i + (frame % 2 ? 2 : 0);
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const nx = -dy;
      const ny = dx;
      const at = (t: number, w: number): XY => [-10 + dx * len * t + nx * w, -10 + dy * len * t + ny * w];
      rimmed(r, P([at(0, 3), at(0.55, 5), at(1, 0), at(0.55, -5), at(0, -3)]), i % 2 ? PLATE : BONE, VOID);
    }
  }

  // flames at the hem: tongues of different heights that flicker between frames
  const heights = [4, 6, 5, 7, 5, 6, 4];
  for (let i = 0; i < 7; i++) {
    const x0 = -16 + i * 4.6;
    const tip = 20 + heights[(i + frame) % 7];
    const lean = (i + frame) % 2 ? 2 : -2;
    rimmed(r, P([[x0, 13], [x0 + 5.4, 13], [x0 + 3.5 + lean, tip - 3], [x0 + 2.7 + lean * 1.4, tip]]), i % 2 ? BONE : PLATE, VOID);
  }

  // body: the dark space behind the plates, then ribs (Mangekyo) or a full breastplate (Perfect)
  r.poly(P([[-14, -6], [12, -6], [14, 8], [10, 15], [-11, 15], [-16, 8]]), VOID);
  if (top) {
    rimmed(r, P([[-13, -6], [11, -6], [12, 7], [8, 14], [-9, 14], [-14, 7]]), ARMOR, VOID);
    rimmed(r, P([[-12, -5], [10, -5], [11, 0], [-13, 0]]), PLATE, VOID);
    r.line(cx - 12, cy + 4, cx + 10, cy + 4, GOLD);
    r.line(cx - 10, cy + 9, cx + 8, cy + 9, GOLD);
    r.ellipse(cx, cy + 1, 2, 2.6, GLOW);
  } else {
    for (let i = 0; i < 4; i++) {
      const y0 = -5 + i * 5;
      rimmed(r, P([[-12, y0], [-1, y0 + 1], [11, y0], [10, y0 + 3], [-1, y0 + 4], [-11, y0 + 3]]), BONE, VOID);
    }
    rimmed(r, P([[-2, -6], [2, -6], [2, 14], [-2, 14]]), BONE, VOID);
  }

  // rear pauldron: three overlapping plates
  for (let i = 0; i < 3; i++) rimmed(r, P([[-24 + i * 2, -8 + i * 4], [-9, -10 + i * 4], [-8, -4 + i * 4], [-22 + i * 2, -2 + i * 4]]), i % 2 ? ARMOR : PLATE, VOID);

  // head: two horns, helmet, beaked mask, slit eye
  rimmed(r, P([[-6, -30], [-13, -41], [-2, -33]]), BONE, VOID);
  rimmed(r, P([[2, -33], [3, -44], [9, -32]]), BONE, VOID);
  rimmed(r, P([[-7, -11], [7, -11], [9, -6], [-9, -6]]), ARMOR, VOID);
  rimmed(r, P([[-10, -16], [-9, -26], [-4, -32], [4, -34], [11, -30], [14, -22], [13, -15], [7, -11], [-5, -11]]), ARMOR, VOID);
  if (top) {
    for (const [a, b, c] of [[[-2, -33], [0, -43], [3, -33]], [[4, -32], [8, -40], [10, -30]], [[-8, -30], [-9, -39], [-4, -31]]] as [XY, XY, XY][]) rimmed(r, P([a, b, c]), GOLD, VOID);
    r.line(cx - 8, cy - 25, cx + 3, cy - 32, GOLD);
  }
  rimmed(r, P([[3, -25], [15, -23], [22, -17], [17, -11], [8, -11], [3, -15]]), BONE, VOID);
  r.poly(P([[9, -13], [19, -14], [17, -10], [10, -9]]), VOID);
  for (let i = 0; i < 4; i++) r.rect(cx + 10 + i * 2, cy - 13, 1, 2, BONE);
  r.poly(P([[3, -26], [12, -25], [11, -21], [4, -22]]), VOID);
  r.rect(cx + 6, cy - 24, 4, 2, GLOW);

  // front pauldron, below the beak so the two never merge
  for (let i = 0; i < 3; i++) rimmed(r, P([[5, -5 + i * 4], [19 + i * 2, -4 + i * 4], [22 + i * 2, 1 + i * 4], [7, 2 + i * 4]]), top && i === 0 ? GOLD : i % 2 ? ARMOR : PLATE, VOID);

  // arms: the bow arm reaches to the grip, the other pulls the string back to the nock
  rimmedStroke(r, P([[-8, 0], [nockX - 7, -3], [nockX, 2]]), PLATE, VOID, 4);
  r.ellipse(cx + nockX, cy + 2, 3.2, 3.2, VOID);
  r.ellipse(cx + nockX, cy + 2, 2.4, 2.4, BONE);
  rimmedStroke(r, P([[14, 4], [23, 6], [31, 1]]), PLATE, VOID, 4);
  r.line(cx + 25, cy + 3, cx + 25, cy + 8, GOLD, 2);
  r.ellipse(cx + 32, cy + 1, 4, 4, VOID);
  r.ellipse(cx + 32, cy + 1, 3, 3, BONE);

  // the bow itself
  rimmedStroke(r, P([[22, -27], [29, -18], [33, -6], [34, 3], [32, 13], [28, 22], [22, 29]]), GOLD, VOID, 3);
  rimmed(r, P([[20, -29], [25, -29], [24, -25], [21, -25]]), BONE, VOID);
  rimmed(r, P([[20, 27], [25, 27], [24, 31], [21, 31]]), BONE, VOID);
  return bake(r, SUSANOO_MATS, SUSANOO_OUTLINE, false);
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

/** The Susanoo bust for a form (3 = Mangekyo, 4 = Perfect), bow drawn to `stage` (0..3), animation frame 0..2. */
export function susanooSprite(level: 3 | 4, stage: number, frame: number): Baked {
  return cached(`s${level}|${stage}|${frame % 3}`, () => susanooRaster(level, stage, frame % 3));
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
