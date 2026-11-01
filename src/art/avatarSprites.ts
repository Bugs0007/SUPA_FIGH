// Pixel-art sprites for the big spirits (Sasuke's Susanoo, Naruto's Kurama) and the spectral / chakra arms that throw
// the transformed punches (D88). They are translucent chakra constructs, treated like Naruto's one-tail cloak scaled up:
// no ink outline, a bright nearly opaque rim, a darker see-through interior (`bakeSpirit`: four flat bands, each with
// its own opacity), a faint halo pixel all around, and flame-tongue edges that flicker over four frames. Still the
// fighters' pixel rules: 1-pixel grid, whole pixels, flat tones, the same pixel density (1 art px = 1 world px).
// Parts are separate groups, so every bone, plate, feather, leg and tail gets its own bright rim over the mass behind.
// Phaser-free: `AvatarArt` (render/) paints the baked runs. Everything faces +x; facing left mirrors it.

import { SUSANOO_LAUNCH } from '../sim/data/heroes';
import { bake, bakeSpirit, inkLine, Raster, type Baked, type Ink, type Material, type Pt, type SpiritMat } from './pixelRaster';

type XY = [number, number];

/** flame / wing / tail animation frames (the spirits flicker through them at `AvatarArt`'s rate) */
export const SPIRIT_FRAMES = 4;

const spirit = (tones: SpiritMat['tones'], alpha: SpiritMat['alpha'], group: number, layer = 0, bands?: SpiritMat['bands']): SpiritMat =>
  bands ? { tones, alpha, group, layer, bands } : { tones, alpha, group, layer };
const flat = (c: number, a: number): SpiritMat => ({ tones: [c, c, c, c], alpha: [a, a, a, a], flat: true });

/** opacity bands (rim, inner, body, core): structure (bones, plates, legs) and chakra mass (flames, tails) */
const SOLID_A = [0.95, 0.82, 0.6, 0.46] as const;
const MASS_A = [0.82, 0.62, 0.44, 0.3] as const;

// ---- small shape helpers (all in raster pixels)

/** a polygon around a polyline with a half width per point (plumes, tails, flames) */
function plume(r: Raster, pts: readonly XY[], widths: readonly number[], m: number): void {
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
function flame(r: Raster, x: number, y: number, h: number, w: number, sway: number, phase: number, m: number): void {
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
function taper(pts: readonly XY[], w0: number, w1: number): Pt[] {
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
function tongue(r: Raster, x: number, y: number, dx: number, dy: number, len: number, w: number, bend: number, m: number): void {
  const nx = -dy;
  const ny = dx;
  const at = (t: number, s: number): Pt => [x + dx * len * t + nx * s, y + dy * len * t + ny * s];
  r.poly([at(0, -w / 2), at(0.32, -w / 2 - 0.6), at(0.72, -w * 0.15 + bend * 0.45), at(1, bend), at(0.62, w * 0.28 + bend * 0.5), at(0.3, w / 2 + 0.6), at(0, w / 2)], m);
}

/** rotate a point about a pivot (radians, screen coordinates: negative turns the front upward) */
const rot = (p: XY, c: XY, a: number): XY => {
  const cs = Math.cos(a);
  const sn = Math.sin(a);
  return [c[0] + (p[0] - c[0]) * cs - (p[1] - c[1]) * sn, c[1] + (p[0] - c[0]) * sn + (p[1] - c[1]) * cs];
};

/** per-frame wobble: a small repeating sequence picked by an index (deterministic, no randomness) */
const wob = (seq: readonly number[], i: number) => seq[((i % seq.length) + seq.length) % seq.length];

// ---- Susanoo: violet chakra over pale bone (Mangekyo) or layered armour (Perfect), a glowing eye, a chakra bow
const S_FLAME = 1;
const S_FLAME2 = 2;
const S_BONE = 3;
const S_LIMB = 4;
const S_LIMB2 = 5;
const S_ARMOR = 6;
const S_PLATE = 7;
const S_WING = 8;
const S_WING2 = 9;
const S_COVERT = 10;
const S_BOW = 11;
const S_SEAM = 12;
const S_GLOW = 13;
const VIOLET_FLAME = [0xdcb6ff, 0xae6ef9, 0x8444e2, 0x672ac4] as const;
const VIOLET_FLAME2 = [0xd0a4ff, 0x9e5cf2, 0x7638d6, 0x5a22b4] as const;
const VIOLET_BONE = [0xfaf2ff, 0xdcbcff, 0xb282f4, 0x9058e0] as const;
const VIOLET_ARMOR = [0xf2e4ff, 0xcaa0ff, 0x9c68ea, 0x7a48d0] as const;
const VIOLET_PLATE = [0xfcf4ff, 0xd8b2ff, 0xae7af2, 0x8a58dc] as const;
const VIOLET_WING = [0xeedaff, 0xbe8eff, 0x9058e6, 0x6e3cc8] as const;
const VIOLET_WING2 = [0xe0c8ff, 0xac78f8, 0x7e4adc, 0x6030b8] as const;
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

/**
 * The baked Susanoo's layout. The raster pixel (ax, ay) sits on the fighter's feet; the arrowhead's point is exactly
 * on `SUSANOO_LAUNCH` (sim/data/heroes.ts), where the sim spawns the arrow. Stages 0..3 draw the bow back, 4 is the shot
 * (string snapping, muzzle flash), 5 the bow at rest while the spirit fades. Per form: the bow's half height and bend,
 * and how far behind the bow tips the string's middle is pulled at each draw stage.
 */
export const SUSANOO = {
  ax: 96,
  ay: 96,
  w: 180,
  h: 100,
  stages: 4,
  shot: 4,
  rest: 5,
  form: {
    3: { half: 24, bend: 7, draw: [8, 17, 26, 34] },
    4: { half: 30, bend: 8, draw: [8, 18, 28, 38] },
  } as Record<3 | 4, { half: number; bend: number; draw: readonly number[] }>,
};

function susanooRaster(level: 3 | 4, stage: number, frame: number): Baked {
  const { ax, ay } = SUSANOO;
  const r = new Raster(SUSANOO.w, SUSANOO.h);
  const ink: Ink[] = [];
  const top = level === 4;
  const spec = SUSANOO.form[level];
  // body coordinates: u pixels ahead of the feet, v pixels up from them (negative)
  const Q = (u: number, v: number): XY => [ax + u, ay + v];
  const P = (pts: XY[]): Pt[] => pts.map(([u, v]) => Q(u, v));
  const T = (pts: XY[], w0: number, w1: number): Pt[] => taper(pts.map(([u, v]) => Q(u, v)), w0, w1);
  const R = (u: number, v: number): XY => [Math.round(ax + u), Math.round(ay + v)];
  const line = (a: XY, b: XY, m: number, thick = 1) => r.line(a[0], a[1], b[0], b[1], m, thick);
  // the bow is placed from the launch point, in whole pixels
  const launch = SUSANOO_LAUNCH[level];
  const lx = ax + launch.ahead;
  const ly = ay - launch.up;
  const gx = lx - 5; // the grip
  const tipX = gx - spec.bend;
  const drawing = stage < SUSANOO.stages;
  const nockX = drawing ? tipX - spec.draw[stage] : tipX;
  const front: XY = top ? [15, -52] : [13, -48];
  const back: XY = top ? [-21, -52] : [-19, -48];

  // Perfect: one great feathered wing rising behind the back shoulder, beating with the flame frames
  if (top) {
    const flap = wob([0, -0.06, -0.11, -0.06], frame);
    const root: XY = [-14, -56];
    const edge: XY[] = ([root, [-24, -70], [-35, -80], [-49, -83], [-62, -78]] as XY[]).map((p) => rot(p, root, flap));
    const along = (t: number): XY => {
      const s = Math.min(0.999, t) * (edge.length - 1);
      const i = Math.floor(s);
      const k = s - i;
      return [edge[i][0] + (edge[i + 1][0] - edge[i][0]) * k, edge[i][1] + (edge[i + 1][1] - edge[i][1]) * k];
    };
    // three rows of feathers hang from the edge, down and back: long primaries, then secondaries and coverts over
    // them (each row shorter, nearer the edge); neighbours alternate tones so every feather keeps its own rim
    const rows: [number, number, number, number, number][] = [
      // count, start length, peak length, half width, row material base (0 = alternate primaries)
      [10, 20, 38, 4.6, 0],
      [9, 13, 22, 4.2, 1],
      [8, 8, 11, 3.6, 2],
    ];
    for (const [count, l0, l1, hw, row] of rows) {
      for (let j = count - 1; j >= 0; j--) {
        const t = (j + 0.5) / count;
        const [bu, bv] = along(0.02 + t * 0.96);
        const a = Math.PI / 2 + 0.02 + t * (0.55 - row * 0.1) - flap * 0.8;
        const len = l0 + (l1 - l0) * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.5) - (t > 0.85 ? (t - 0.85) * 40 : 0);
        const m = row === 2 ? S_COVERT : (j + row) % 2 ? S_WING2 : S_WING;
        r.poly(T([[bu, bv], [bu + Math.cos(a) * len * 0.5 - 1, bv + Math.sin(a) * len * 0.5], [bu + Math.cos(a) * len, bv + Math.sin(a) * len]], hw, 0.9), m);
      }
    }
    r.poly(T(edge, 3, 1.6), S_COVERT);
  }

  // the spirit has no legs: below the waist it is a column of violet flame, licking up around the torso
  const flames: [number, number, number][] = top
    ? [[-30, 20, 9], [-22, 34, 12], [-13, 28, 12], [-4, 36, 12], [5, 28, 12], [14, 34, 12], [23, 26, 11], [30, 16, 8]]
    : [[-30, 24, 9], [-23, 40, 12], [-14, 52, 12], [-5, 30, 12], [4, 28, 12], [12, 48, 12], [20, 42, 11], [27, 26, 9]];
  r.ellipse(...Q(-2, -3), top ? 30 : 28, 4, S_FLAME);
  flames.forEach(([u, h, w], i) => {
    const hh = h + wob([0, 3, 1, -2], i + frame);
    flame(r, ...Q(u, 0), hh, w, 3 + (i % 3), (frame * Math.PI) / 2 + i * 1.7, i % 2 ? S_FLAME2 : S_FLAME);
  });

  if (top) {
    // Perfect: three lamellar skirt panels over the flames, a belt, a breastplate and layered pauldrons
    const panels: XY[][] = [
      [[-21, -34], [-9, -34], [-10, -14], [-25, -16]],
      [[-9, -34], [3, -34], [4, -12], [-10, -12]],
      [[3, -34], [15, -34], [19, -16], [4, -14]],
    ];
    panels.forEach((p, i) => {
      r.poly(P(p), i === 1 ? S_PLATE : S_ARMOR);
      for (let v = -28; v <= -20; v += 5) line(R(p[0][0] + (i === 0 ? -1 : 1), v), R(p[1][0] - 1 + (i === 2 ? 1 : 0), v), S_SEAM);
    });
    r.poly(P([[-22, -58], [16, -58], [18, -48], [14, -36], [-18, -36], [-23, -48]]), S_ARMOR);
    r.poly(P([[-19, -56], [-5, -56], [-5, -47], [-18, -48]]), S_PLATE);
    r.poly(P([[-2, -56], [13, -56], [14, -48], [-2, -47]]), S_PLATE);
    line(R(-15, -41), R(11, -41), S_SEAM);
    r.poly(P([[-20, -36], [15, -36], [15, -32], [-20, -32]]), S_PLATE);
    r.poly(P([[-5, -37.5], [1, -37.5], [1, -30.5], [-5, -30.5]]), S_ARMOR);
    // the great pauldron: two overlapping rounded plates over the back shoulder
    r.poly(P([[-34, -54], [-14, -57], [-10, -48], [-31, -45]]), S_ARMOR);
    r.poly(P([[-35, -61], [-22, -64], [-12, -61], [-10, -54], [-33, -52]]), S_PLATE);
  } else {
    // Mangekyo: a ribcage around a dark chakra core, a spine, a pelvis
    r.poly(P([[-21, -53], [15, -53], [17, -42], [12, -32], [5, -24], [5, -8], [-11, -8], [-11, -24], [-18, -32], [-23, -42]]), S_FLAME);
    for (let v = -31; v <= -11; v += 3) r.poly(P([[-5.5, v], [-0.5, v], [-0.5, v + 2], [-5.5, v + 2]]), S_BONE);
    r.poly(P([[-15, -15], [-4, -17], [-4, -10], [-12, -9]]), S_BONE);
    r.poly(P([[-2, -17], [8, -15], [5, -9], [-2, -10]]), S_BONE);
    r.poly(P([[-4.5, -51], [-1.5, -51], [-1.5, -34], [-4.5, -34]]), S_BONE);
    for (let i = 0; i < 5; i++) {
      // each rib leaves the sternum, arcs out and curls down at the side; the cage narrows toward the waist
      const v = -48 + i * 4;
      const reach = 17 - i * 1.7;
      r.stroke([R(-4, v), R(-10, v - 1), R(-3 - reach, v + 1), R(-4 - reach, v + 4)], S_BONE, 2);
      r.stroke([R(-2, v), R(4, v - 1), R(-3 + reach, v + 1), R(-2 + reach, v + 4)], S_BONE, 2);
    }
    r.stroke([R(back[0], -51), R(front[0], -51)], S_BONE, 2);
    for (let v = -57; v <= -53; v += 2) r.poly(P([[-4.5, v], [-0.5, v], [-0.5, v + 1], [-4.5, v + 1]]), S_BONE);
  }

  // the head: a horned skull with a long tengu nose (Mangekyo), or a crested, crowned helmet with a tengu face plate
  if (top) {
    // a crest swept back off the helmet, three crown spikes, a lock of hair; the face is a pale tengu mask
    r.poly(T([[-6, -72], [-15, -78], [-28, -82]], 2.6, 0.5), S_PLATE);
    r.poly(T([[-9, -66], [-13, -60], [-14, -52]], 2, 0.7), S_PLATE);
    for (const [u0, u1, h] of [[-6, -8, 7], [-1.5, -1.5, 9], [3, 5, 7]]) r.poly(P([[u0 - 1.6, -73], [u1, -73 - h], [u0 + 1.6, -73]]), S_PLATE);
    r.poly(P([[-9, -62], [3, -62], [3, -58], [-9, -58]]), S_ARMOR);
    r.ellipse(...Q(-2, -68), 8.5, 7.5, S_ARMOR);
    r.poly(P([[0, -73], [9, -71], [10, -65], [8, -59], [1, -58], [-1, -65]]), S_BONE);
    r.poly(T([[8, -67], [18, -65], [30, -62]], 2.8, 0.6), S_BONE);
    line(R(0, -71), R(9, -70), S_SEAM);
    line(R(3, -61), R(8, -61), S_SEAM);
    r.rect(...R(3, -69), 4, 2, S_SEAM);
    r.rect(...R(4, -69), 2, 1, S_GLOW);
  } else {
    r.poly(T([[3, -68], [8, -73], [9, -77], [7, -80]], 2.8, 0.6), S_BONE);
    r.poly(T([[-7, -68], [-12, -73], [-14, -77], [-12, -80]], 2.8, 0.6), S_BONE);
    r.ellipse(...Q(-1, -63), 9, 8, S_BONE);
    r.poly(T([[6, -64], [15, -62], [25, -58]], 3, 0.6), S_BONE);
    r.poly(P([[2, -61], [12, -61], [10, -57], [2, -57]]), S_BONE);
    r.poly(P([[-4, -57], [10, -57], [9, -53], [1, -51], [-5, -53]]), S_BONE);
    // a deep socket under a heavy brow, a cheekbone, a temple hole, the teeth
    r.poly(P([[1, -69], [10, -68], [9, -62], [2, -62]]), S_SEAM);
    line(R(0, -70), R(10, -69), S_BONE);
    line(R(-8, -58), R(1, -60), S_SEAM);
    line(R(0, -55), R(9, -55), S_SEAM);
    for (const u of [2, 5, 8]) r.set(...R(u, -54), S_SEAM);
    r.poly(P([[-7, -66], [-3, -67], [-4, -61]]), S_SEAM);
    r.rect(...R(4, -66), 3, 2, S_GLOW);
  }

  // the arms: the bow arm reaches forward to the grip, the drawing arm pulls the string to the chest, its elbow going
  // back as the bow bends
  const elbowsDraw: XY[] = top ? [[8, -55], [-6, -57], [-18, -57], [-29, -55]] : [[6, -50], [-6, -52], [-17, -52], [-27, -50]];
  const elbowDraw = drawing ? elbowsDraw[stage] : elbowsDraw[0];
  const hand: XY = [nockX - ax, ly - ay];
  const elbowBow: XY = top ? [32, -50] : [27, -47];
  const wrist: XY = [gx - 2 - ax, ly - ay];
  if (top) {
    r.poly(T([front, elbowBow], 3.2, 2.8), S_ARMOR);
    r.poly(T([elbowBow, wrist], 3, 2.6), S_PLATE);
    for (const t of [0.3, 0.55, 0.8]) {
      const u = elbowBow[0] + (wrist[0] - elbowBow[0]) * t;
      const v = elbowBow[1] + (wrist[1] - elbowBow[1]) * t;
      line(R(u, v - 2), R(u, v + 2), S_SEAM);
    }
    r.poly(P([[9, -57], [21, -55], [22, -49], [10, -48]]), S_PLATE);
    r.poly(T([back, elbowDraw], 3.2, 2.8), S_LIMB2);
    r.poly(T([elbowDraw, hand], 2.8, 2.4), S_LIMB2);
    r.ellipse(...Q(hand[0] - 1, hand[1] + 0.5), 3.4, 3.4, S_LIMB2);
  } else {
    r.ellipse(...Q(...back), 3.5, 3.5, S_BONE);
    r.ellipse(...Q(...front), 3.5, 3.5, S_BONE);
    r.stroke([R(...front), R(...elbowBow)], S_LIMB, 3);
    r.ellipse(...Q(...elbowBow), 2.5, 2.5, S_LIMB);
    r.stroke([R(elbowBow[0], elbowBow[1] - 1), R(wrist[0], wrist[1] - 1)], S_LIMB, 1);
    r.stroke([R(elbowBow[0], elbowBow[1] + 1), R(wrist[0], wrist[1] + 1)], S_LIMB, 1);
    r.stroke([R(...back), R(...elbowDraw)], S_LIMB2, 3);
    r.ellipse(...Q(...elbowDraw), 2.5, 2.5, S_LIMB2);
    r.stroke([R(elbowDraw[0], elbowDraw[1] - 1), R(hand[0], hand[1] - 1)], S_LIMB2, 1);
    r.stroke([R(elbowDraw[0], elbowDraw[1] + 1), R(hand[0], hand[1] + 1)], S_LIMB2, 1);
    // bony knuckles closed on the string
    r.ellipse(...Q(hand[0] - 1, hand[1] + 0.5), 2.4, 2.4, S_LIMB2);
  }

  // the bow: a recurved arc of chakra (the Perfect one thicker, with spurs on its back), the hand closed on its grip
  const arc: XY[] = [[tipX + 3, ly - spec.half - 3]];
  for (let i = 0; i <= 12; i++) {
    const t = i / 6 - 1;
    arc.push([Math.round(gx - spec.bend * t * t), Math.round(ly + t * spec.half)]);
  }
  arc.push([tipX + 3, ly + spec.half + 3]);
  r.stroke(arc, S_BOW, top ? 3 : 2);
  if (top) {
    for (const t of [-0.75, -0.4, 0.4, 0.75]) {
      const bx = gx - spec.bend * t * t;
      const by = ly + t * spec.half;
      r.poly([[bx + 1, by - 1.5], [bx + 4, by + Math.sign(t) * 1.5], [bx + 1, by + 1.5]], S_BOW);
    }
  }
  r.ellipse(gx - 1.5, ly + 0.5, top ? 3.6 : 3, top ? 3.6 : 3, top ? S_ARMOR : S_LIMB);

  // the string (single pixels, as on the fighters' bows), the arrow while drawing, a muzzle flash on the shot
  const top0: XY = [tipX, ly - spec.half];
  const bot0: XY = [tipX, ly + spec.half];
  if (drawing) {
    inkLine(ink, top0[0], top0[1], nockX, ly, SUSANOO_INK.string);
    inkLine(ink, nockX, ly, bot0[0], bot0[1], SUSANOO_INK.string);
    for (let c = 0; c < 4; c++) for (let j = -Math.min(c, 2); j <= Math.min(c, 2); j++) r.set(lx - c, ly + j, S_GLOW);
    inkLine(ink, nockX + 1, ly, lx - 4, ly, SUSANOO_INK.shaft);
    for (const [dx, dy] of [[1, -1], [2, -1], [3, -2], [1, 1], [2, 1], [3, 2]]) ink.push({ x: nockX + dx, y: ly + dy, c: SUSANOO_INK.fletch });
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
  const baked = bakeSpirit(r, SUSANOO_MATS, SUSANOO_HALO, ink);
  baked.runs = baked.runs.filter((run) => run.y < ay);
  return baked;
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
 * animation frame 0..3 (the flames flicker, the wing beats). Baked once per (form, stage, frame).
 */
export function susanooSprite(level: 3 | 4, stage: number, frame: number): Baked {
  const s = Math.max(0, Math.min(SUSANOO.rest, Math.floor(stage)));
  const f = ((frame % SPIRIT_FRAMES) + SPIRIT_FRAMES) % SPIRIT_FRAMES;
  return cached(`s${level}|${s}|${f}`, () => susanooRaster(level, s, f));
}

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
export const KURAMA = { ax: 104, ay: 86, w: 182, h: 90 };

function kuramaRaster(frame: number, roar: boolean): Baked {
  const { ax, ay } = KURAMA;
  const r = new Raster(KURAMA.w, KURAMA.h);
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
    plume(r, pts.map(([u, v]) => Q(u, v)), widths, m);
    // one big flick off the upper edge, swept toward the tip, and a curled flaming tip
    for (const [k, ll] of [[6, 8]] as const) {
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
      tongue(r, ...Q(p[0] + nx * (widths[k] - 1), p[1] + ny * (widths[k] - 1)), ex, ey, ll + wob([0, 2, 1, 3], frame + k + i), 5, wob([-1, 0, 1, 0], frame + i) * 1.5, m);
    }
    const [tu, tv] = centre(0.94);
    const [pu, pv] = centre(0.8);
    const tl = Math.hypot(tu - pu, tv - pv) || 1;
    tongue(r, ...Q(tu, tv), (tu - pu) / tl, (tv - pv) / tl, 9 + wob([0, 2, 3, 1], frame + i), 3.2, (i % 2 ? 3 : -3) + wob([-1, 1, 0, 0], frame + i), m);
  }

  // the head turns up for the Bijudama; the jaw drops open around its hinge
  const headPivot: XY = [28, -50];
  const tilt = roar ? -0.12 : 0;
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

  // the near legs: a big haunch, a bent hind leg, a heavy planted front leg with big clawed paws
  r.ellipse(...Q(-32, -26), 14, 13, K_LEG);
  r.poly(T([[-41, -17], [-43, -9], [-38, -4]], 6, 5), K_LEG);
  r.poly(P([[-49, -8], [-28, -8], [-24, -3], [-24, -1], [-50, -1]]), K_LEG);
  r.poly(T([[16, -48], [24, -32], [26, -21]], 10, 7.5), K_LEG);
  r.poly(T([[26, -22], [28, -13], [29, -6]], 7, 6), K_LEG);
  r.poly(P([[19, -10], [40, -10], [46, -5], [46, -1], [19, -1]]), K_LEG);
  for (const v of [-8, -5, -2]) {
    r.line(...R(46, v), ...R(49, v + 1), K_FANG);
    r.line(...R(-24, v), ...R(-21, v + 1), K_FANG);
  }

  // the seal markings: a ring on the shoulder, an arc over the haunch, a stripe down the back and down each leg
  r.ellipse(...Q(20, -37), 9, 9, K_MARK);
  r.ellipse(...Q(20, -37), 7, 7, K_LEG);
  r.ellipse(...Q(20, -37), 3.4, 3.4, K_MARK);
  mark([[-44, -34], [-30, -39], [-14, -40], [0, -41], [11, -42]]);
  mark([[-44, -22], [-42, -33], [-33, -38], [-23, -35]], 2);
  mark([[24, -28], [27, -18], [28, -9]]);
  mark([[-42, -14], [-43, -8]]);

  // the open mouth (dark), then the head and the jaw over it: what stays dark between them is the mouth
  r.poly([Q(...hinge), Q(...H([71, -48])), Q(...J([68, -44])), Q(...J([48, -39]))], K_MOUTH);
  r.poly(T([H([28, -52]), H([22, -46]), H([18, -42])], 4.5, 1), K_HEAD);
  r.poly(HQ([[24, -55], [28, -66], [36, -71], [45, -68], [50, -60], [59, -56], [70, -53], [71, -48], [62, -47], [50, -49], [38, -45], [28, -47]]), K_HEAD);
  r.poly(T([H([33, -64]), H([25, -74]), H([20, -82])], 6.5, 0.6), K_EAR);
  mark([H([31, -65]), H([25, -73]), H([22, -78])],2);
  r.poly([Q(...J([38, -45])), Q(...J([62, -46])), Q(...J([68, -44])), Q(...J([63, -40])), Q(...J([48, -38])), Q(...J([38, -40]))], K_JAW);
  // fangs down from the upper lip, up from the jaw
  for (const u of [52, 58, 64]) r.poly(HQ([[u - 1.5, -47], [u + 1.5, -47], [u + 0.3, -43]]), K_FANG);
  for (const u of [48, 54, 60]) r.poly([Q(...J([u - 1.3, -44.5])), Q(...J([u + 1.3, -44.5])), Q(...J([u, -48]))], K_FANG);
  // the eye: a slanted slit with a black pupil under a heavy brow; three bold whisker marks; the nose
  r.poly(HQ([[37,-64],[50,-62],[48,-56],[39,-57]]),K_MARK);
  r.poly(HQ([[39, -62], [49, -60], [46, -57.5], [40, -59]]), K_EYE);
  mark([H([45, -61]), H([45, -58])]);
  mark([H([36, -66]), H([42, -64]), H([51, -62])], 2);
  mark([H([44, -55]), H([54, -54])]);
  for (const k of [0, 1, 2]) mark([H([31, -58 + k * 3]), H([40, -57 + k * 2.5])], 2);
  r.poly(HQ([[67,-54],[72,-52],[71,-49],[67,-50]]),K_MARK);
  // cheek ruff: licks off the back of the head
  tongue(r, ...Q(...H([28, -48])), -0.85, 0.5, 7 + wob([0, 2, 1, 3], frame), 5, 1, K_HEAD);
  tongue(r, ...Q(...H([26, -57])), -0.9, -0.3, 6 + wob([1, 3, 0, 2], frame), 5, -1, K_HEAD);
  const baked = bakeSpirit(r, KURAMA_MATS, KURAMA_HALO);
  baked.runs = baked.runs.filter((run) => run.y < KURAMA.ay);
  return baked;
}

/** Kurama, frame 0..3 (tails sway, flames lick); `roar` = the Bijudama pose (head up, jaws wide). Baked once each. */
export function kuramaSprite(frame: number, roar = false): Baked {
  const f = ((frame % SPIRIT_FRAMES) + SPIRIT_FRAMES) % SPIRIT_FRAMES;
  return cached(`k|${f}|${roar ? 1 : 0}`, () => kuramaRaster(f, roar));
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
