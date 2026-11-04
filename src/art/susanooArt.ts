// Sasuke's Susanoo: the giant violet chakra warrior that rises around him for the ultimate arrow (forms 3 and 4).
// Drawn big (its head alone is taller than a fighter) in three parts that are baked separately so the show-up
// animation can build them one after the other:
//   core   everything but the wings: the flames at its feet, legs, robes, torso, armour, head (form 4), or the ribcage
//          and horned skull (form 3)
//   wings  the great feathered wings (form 4 only), unfurled last
//   arms   both arms, the bow, the string and the arrow; this is the only part that moves when the shot is aimed
//          (it swings about the shoulder), and the only one with draw stages
// Phaser-free. Everything faces +x; facing left mirrors it (the painter flips).

import { SUSANOO_LAUNCH, avatarAim } from '../sim/data/heroes';
import { bakeSpirit, inkLine, Raster, ScaledPen, type Baked, type Ink, type Pen, type Pt } from './pixelRaster';
import {
  SPIRIT_FRAMES, S_ARMOR, S_BONE, S_BOW, S_COVERT, S_FLAME, S_FLAME2, S_GLOW, S_LIMB, S_LIMB2, S_PLATE, S_SEAM, S_WING, S_WING2,
  SUSANOO_HALO, SUSANOO_INK, SUSANOO_MATS, flame, rot, taper, tongue, wob, type XY,
} from './spiritKit';

/**
 * The canvas every Susanoo part is baked into: the raster pixel (ax, ay) sits on the fighter's feet. Stages 0..3 draw
 * the bow back, 4 is the shot (string snapping, muzzle flash), 5 the bow at rest while the spirit fades.
 */
export const SUSANOO = {
  ax: 150,
  ay: 218,
  w: 300,
  h: 238,
  stages: 4,
  shot: 4,
  rest: 5,
  /** form 3 is drawn at 1.9x its design units (the old skeleton), form 4 in pixels */
  scale: { 3: 1.9, 4: 1 } as Record<3 | 4, number>,
  /** the bow: half height, how far its grip is bent forward of its tips, how far behind the tips the string is drawn at each stage */
  form: {
    3: { half: 44, bend: 13, draw: [15, 31, 48, 64] },
    4: { half: 46, bend: 12, draw: [11, 25, 39, 53] },
  } as Record<3 | 4, { half: number; bend: number; draw: readonly number[] }>,
  /** height above the feet of the tallest point of each form (the show-up animation reveals up to it) */
  height: { 3: 160, 4: 180 } as Record<3 | 4, number>,
  /** where the wings grow from (form 4), in design pixels */
  wingRoot: [-14, -98] as XY,
};

// ---------------------------------------------------------------- the core: flames, body, head

/** Form 3 (Mangekyo): a ribcage around a dark chakra core, a spine, a horned skull, no legs: a column of violet flame. */
function ribcage(r: Pen, frame: number): void {
  const P = (pts: XY[]): Pt[] => pts;
  const flames: [number, number, number][] = [[-30, 24, 9], [-23, 40, 12], [-14, 52, 12], [-5, 30, 12], [4, 28, 12], [12, 48, 12], [20, 42, 11], [27, 26, 9]];
  r.ellipse(-2, -3, 28, 4, S_FLAME);
  flames.forEach(([u, h, w], i) => {
    const hh = h + wob([0, 3, 1, -2], i + frame);
    flame(r, u, 0, hh, w, 3 + (i % 3), (frame * Math.PI) / 2 + i * 1.7, i % 2 ? S_FLAME2 : S_FLAME);
  });
  r.poly(P([[-21, -53], [15, -53], [17, -42], [12, -32], [5, -24], [5, -8], [-11, -8], [-11, -24], [-18, -32], [-23, -42]]), S_FLAME);
  for (let v = -31; v <= -11; v += 3) r.poly(P([[-5.5, v], [-0.5, v], [-0.5, v + 2], [-5.5, v + 2]]), S_BONE);
  r.poly(P([[-15, -15], [-4, -17], [-4, -10], [-12, -9]]), S_BONE);
  r.poly(P([[-2, -17], [8, -15], [5, -9], [-2, -10]]), S_BONE);
  r.poly(P([[-4.5, -51], [-1.5, -51], [-1.5, -34], [-4.5, -34]]), S_BONE);
  for (let i = 0; i < 5; i++) {
    const v = -48 + i * 4;
    const reach = 17 - i * 1.7;
    r.stroke([[-4, v], [-10, v - 1], [-3 - reach, v + 1], [-4 - reach, v + 4]], S_BONE, 2);
    r.stroke([[-2, v], [4, v - 1], [-3 + reach, v + 1], [-2 + reach, v + 4]], S_BONE, 2);
  }
  r.stroke([[-19, -51], [13, -51]], S_BONE, 2);
  for (let v = -57; v <= -53; v += 2) r.poly(P([[-4.5, v], [-0.5, v], [-0.5, v + 1], [-4.5, v + 1]]), S_BONE);
  // the shoulder joints the arms hang from
  r.ellipse(-19, -48, 3.5, 3.5, S_BONE);
  r.ellipse(13, -48, 3.5, 3.5, S_BONE);
  // the horned skull; the tengu nose is half the length it used to be
  r.poly(taper([[3, -68], [8, -73], [9, -77], [7, -80]], 2.8, 0.6), S_BONE);
  r.poly(taper([[-7, -68], [-12, -73], [-14, -77], [-12, -80]], 2.8, 0.6), S_BONE);
  r.ellipse(-1, -63, 9, 8, S_BONE);
  r.poly(taper([[6, -64], [11, -62.5], [16, -60.5]], 3, 0.6), S_BONE);
  r.poly(P([[2, -61], [12, -61], [10, -57], [2, -57]]), S_BONE);
  r.poly(P([[-4, -57], [10, -57], [9, -53], [1, -51], [-5, -53]]), S_BONE);
  r.poly(P([[1, -69], [10, -68], [9, -62], [2, -62]]), S_SEAM);
  r.line(0, -70, 10, -69, S_BONE);
  r.line(-8, -58, 1, -60, S_SEAM);
  r.line(0, -55, 9, -55, S_SEAM);
  for (const u of [2, 5, 8]) r.set(u, -54, S_SEAM);
  r.poly(P([[-7, -66], [-3, -67], [-4, -61]]), S_SEAM);
  r.rect(4, -66, 3, 2, S_GLOW);
}

/** a flame tongue of the hair / crest: base (x, y), unit direction, length, with a flicker */
function lick(r: Pen, x: number, y: number, dx: number, dy: number, len: number, w: number, frame: number, i: number, m = S_FLAME): void {
  const l = Math.hypot(dx, dy) || 1;
  tongue(r, x, y, dx / l, dy / l, len + wob([0, 3, 1, -2], frame + i), w, wob([-2, 0, 2, 0], frame + i * 2) * 1.2, m);
}

/** Form 4 (Perfect): a standing armoured warrior. Legs under wide hakama, a lamellar chest, great layered pauldrons, a crested helmet with a tengu face plate. */
function perfect(r: Pen, frame: number): void {
  const P = (pts: XY[]): Pt[] => pts;
  const seam = (a: XY, b: XY, thick = 1) => r.line(a[0], a[1], b[0], b[1], S_SEAM, thick);

  // chakra fire licking up around the feet
  r.ellipse(0, -3, 44, 5, S_FLAME);
  for (let i = 0; i < 11; i++) {
    const u = -42 + i * 8.4;
    const h = 12 + ((i * 7) % 5) * 4 + wob([0, 3, 1, -2], i + frame);
    flame(r, u, -1, h, 8, 2 + (i % 3), (frame * Math.PI) / 2 + i * 1.3, i % 2 ? S_FLAME2 : S_FLAME);
  }

  // the far leg (darker), its shin guard and shoe
  r.poly(taper([[-8, -70], [-16, -42], [-21, -14]], 11, 8), S_LIMB2);
  r.poly(P([[-27, -38], [-14, -38], [-15, -14], [-27, -14]]), S_PLATE);
  seam([-26, -30], [-15, -30]);
  seam([-26, -22], [-16, -22]);
  r.poly(P([[-38, -11], [-12, -12], [0, -8], [8, -16], [7, -6], [-2, -1], [-34, -1]]), S_ARMOR);
  seam([-30, -7], [-4, -6]);

  // the near leg: wide hakama that fall in folds, a knee guard, a shin guard with bands, a pointed shoe
  r.poly(taper([[8, -70], [16, -42], [14, -14]], 12, 9), S_LIMB);
  r.poly(P([[-8, -74], [28, -74], [30, -50], [25, -34], [-2, -34], [-10, -52]]), S_ARMOR);
  for (const u of [-2, 7, 16, 23]) seam([u, -70], [u + 1, -38]);
  r.ellipse(15, -38, 8, 7, S_PLATE);
  seam([9, -38], [21, -38]);
  r.poly(P([[8, -31], [23, -31], [22, -14], [8, -14]]), S_PLATE);
  for (const v of [-26, -20]) seam([9, v], [22, v]);
  r.poly(P([[0, -12], [26, -12], [38, -8], [47, -17], [46, -6], [36, -1], [2, -1]]), S_ARMOR);
  seam([8, -7], [38, -6]);
  seam([26, -12], [27, -2]);

  // the sash with its knot and hanging cloth, and the sword hanging at the hip
  r.poly(P([[-24, -74], [28, -74], [28, -65], [-24, -65]]), S_PLATE);
  seam([-24, -69.5], [28, -69.5]);
  r.poly(taper([[-20, -67], [-31, -56], [-38, -32]], 5, 2.5), S_ARMOR);
  r.poly(taper([[-14, -67], [-20, -52], [-24, -34]], 4, 2), S_PLATE);
  r.stroke([[26, -72], [-46, -52]], S_LIMB2, 4);
  r.stroke([[26, -72], [-46, -52]], S_SEAM, 1);
  r.ellipse(27, -73, 4.5, 4.5, S_PLATE);
  r.stroke([[30, -74], [41, -78]], S_ARMOR, 3);
  r.ellipse(42, -78, 2.5, 2.5, S_PLATE);

  // the far shoulder, the torso and its plates
  r.poly(P([[-32, -108], [-12, -112], [-6, -100], [-28, -97]]), S_LIMB2);
  r.poly(P([[-23, -70], [27, -70], [29, -92], [24, -108], [-16, -110], [-27, -92]]), S_ARMOR);
  r.poly(P([[-18, -106], [20, -106], [25, -94], [18, -80], [-14, -80], [-22, -94]]), S_PLATE);
  for (const u of [-9, 1, 11]) seam([u, -104], [u, -82]);
  for (const v of [-98, -90]) seam([-18, v], [21, v]);
  for (let row = 0; row < 3; row++) {
    const v = -79 + row * 5;
    r.poly(P([[-22, v], [26, v], [27, v + 5], [-23, v + 5]]), row % 2 ? S_PLATE : S_ARMOR);
    for (let u = -18; u <= 22; u += 6) seam([u, v], [u, v + 5]);
  }
  // the collar and the great pauldrons: three overlapping plates over the near shoulder, gridded like lamellar armour
  r.poly(P([[-12, -108], [10, -108], [8, -121], [-12, -121]]), S_ARMOR);
  r.poly(P([[8, -110], [22, -116], [18, -124], [6, -118]]), S_PLATE);
  r.ellipse(16, -111, 21, 11, S_PLATE);
  r.ellipse(16, -104, 22, 9, S_ARMOR);
  r.ellipse(16, -97, 21, 8, S_PLATE);
  for (const v of [-106, -99]) seam([-4, v], [36, v]);
  for (let u = -2; u <= 34; u += 6) seam([u, -111], [u + 1, -103]);
  for (let u = 1; u <= 31; u += 6) seam([u, -104], [u, -95]);

  // the head: flame hair streaming back, a crested helmet, the pale tengu face plate with its (short) nose
  lick(r, -12, -142, -0.9, -0.25, 36, 12, frame, 0);
  lick(r, -13, -134, -0.97, 0.05, 32, 12, frame, 1, S_FLAME2);
  lick(r, -12, -126, -0.9, 0.35, 26, 11, frame, 2);
  lick(r, -4, -150, -0.35, -0.95, 24, 9, frame, 3, S_FLAME2);
  lick(r, -9, -148, -0.8, -0.6, 26, 9, frame, 4);
  r.ellipse(-2, -133, 15, 16, S_ARMOR);
  r.poly(P([[-13, -147], [11, -147], [16, -139], [-15, -139]]), S_PLATE);
  for (const [u0, u1, h] of [[-9, -11, 12], [-1.5, -1.5, 16], [6, 9, 12]]) r.poly(P([[u0 - 2.4, -146], [u1, -146 - h], [u0 + 2.4, -146]]), S_PLATE);
  r.poly(P([[-14, -128], [-2, -130], [3, -118], [-8, -114], [-16, -121]]), S_PLATE);
  r.poly(P([[2, -147], [17, -144], [21, -134], [17, -123], [4, -121], [-1, -131]]), S_BONE);
  r.poly(taper([[17, -134], [21, -133.5], [27, -131]], 3, 0.8), S_BONE);
  r.poly(P([[6, -140], [17, -139], [16, -134], [7, -135]]), S_SEAM);
  r.line(5, -141, 18, -140, S_BONE);
  r.rect(9, -137, 6, 2, S_GLOW);
  seam([8, -125], [18, -124]);
  r.poly(P([[10, -124], [12, -124], [11, -121]]), S_PLATE);
  r.poly(P([[14, -124], [16, -124], [15, -121.5]]), S_PLATE);
}

/**
 * The great wings of the Perfect Susanoo: three rows of long, tiled feathers fanned from the back shoulder (primaries,
 * the shorter secondaries between and over them, then the coverts), with a second, paler wing behind that peeks out above.
 */
function wings(r: Pen, frame: number): void {
  const [rx, ry] = SUSANOO.wingRoot;
  const flap = wob([0, 0.03, 0.06, 0.03], frame);
  const row = (root: XY, a0: number, a1: number, count: number, l0: number, l1: number, grow: number, mats: readonly number[], phase: number, ribs: boolean): void => {
    const step = (a1 - a0) / count;
    for (let j = count - 1; j >= 0; j--) {
      const t = (j + 0.5) / count;
      const a = a0 + (a1 - a0) * t + flap * (0.6 + t) + wob([0, 0.012, -0.012, 0], j + frame) * 0.8;
      const len = l0 + (l1 - l0) * Math.pow(Math.sin(Math.min(1, t) * Math.PI), 0.7);
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const nx = -dy;
      const ny = dx;
      const bx = root[0] + dx * 5;
      const by = root[1] + dy * 5;
      const hw0 = 3.2;
      const hw1 = Math.max(4, len * Math.abs(step) * grow);
      const tx = root[0] + dx * len;
      const ty = root[1] + dy * len;
      const m = mats[(j + phase) % mats.length];
      r.poly([[bx + nx * hw0, by + ny * hw0], [tx - dx * 3 + nx * hw1, ty - dy * 3 + ny * hw1], [tx + dx * 2, ty + dy * 2], [tx - dx * 3 - nx * hw1, ty - dy * 3 - ny * hw1], [bx - nx * hw0, by - ny * hw0]], m);
      if (ribs && len > 20) {
        r.line(bx + dx * 7, by + dy * 7, tx - dx * 6, ty - dy * 6, S_SEAM, 1);
        for (const k of [0.42, 0.7]) {
          const cx = root[0] + dx * len * k;
          const cy = root[1] + dy * len * k;
          const hw = hw0 + (hw1 - hw0) * k * 0.9;
          r.line(cx + nx * hw * 0.8, cy + ny * hw * 0.8, cx - nx * hw * 0.8, cy - ny * hw * 0.8, S_SEAM, 1);
        }
      }
    }
  };
  const d = Math.PI / 180;
  // the far wing, behind and above
  const far: XY = [rx + 8, ry - 8];
  row(far, -66 * d, -166 * d, 11, 58, 82, 0.55, [S_WING2], 0, false);
  row(far, -72 * d, -160 * d, 10, 24, 40, 0.8, [S_COVERT], 0, false);
  // the near wing
  const root: XY = [rx, ry];
  row(root, -78 * d, -178 * d, 13, 54, 86, 0.6, [S_WING, S_WING2], 0, true);
  row(root, -82 * d, -174 * d, 12, 34, 56, 0.85, [S_WING2, S_WING], 1, true);
  row(root, -86 * d, -170 * d, 11, 18, 28, 1.0, [S_COVERT], 0, false);
}

// ---------------------------------------------------------------- the arms, the bow and the arrow

interface ArmsGeo {
  /** shoulder pivot (the arms and bow swing about it), the drawing arm's shoulder, the draw arm's elbow per stage */
  pivot: XY;
  back: XY;
  elbows: XY[];
  elbowBow: XY;
}
const ARMS: Record<3 | 4, ArmsGeo> = {
  3: { pivot: [25, -91], back: [-36, -91], elbows: [[21, -95], [-21, -99], [-61, -99], [-97, -95]], elbowBow: [51, -89] },
  4: { pivot: [16, -102], back: [-16, -102], elbows: [[8, -104], [-8, -108], [-24, -108], [-40, -104]], elbowBow: [48, -98] },
};

function armsRaster(level: 3 | 4, stage: number, aim: number): Baked {
  const { ax, ay } = SUSANOO;
  const g = ARMS[level];
  const spec = SUSANOO.form[level];
  const top = level === 4;
  const r = new Raster(SUSANOO.w, SUSANOO.h);
  const ink: Ink[] = [];
  const a = avatarAim(aim);
  // design pixel (u ahead of the feet, v up from them) -> raster pixel, swung about the shoulder by the aim
  const Z = (u: number, v: number): XY => {
    const p = rot([u, v], g.pivot, a);
    return [ax + p[0], ay + p[1]];
  };
  const ZP = (pts: XY[]): Pt[] => pts.map(([u, v]) => Z(u, v));
  const ZT = (pts: XY[], w0: number, w1: number): Pt[] => taper(pts.map(([u, v]) => Z(u, v)), w0, w1);
  const drawing = stage < SUSANOO.stages;
  const launch = SUSANOO_LAUNCH[level];
  const lx = launch.ahead;
  const ly = -launch.up;
  const gx = lx - 5;
  const tipX = gx - spec.bend;
  const nockX = drawing ? tipX - spec.draw[stage] : tipX;
  const hand: XY = [nockX, ly];
  const elbowDraw = drawing ? g.elbows[stage] : g.elbows[0];
  const wrist: XY = [gx - 2, ly];
  const s = top ? 1 : SUSANOO.scale[3];

  // the drawing arm (the far one): the shoulder, an upper arm to the elbow, a forearm to the closed hand on the string
  if (top) {
    r.poly(ZT([g.back, elbowDraw], 5.5, 4.6), S_LIMB2);
    r.poly(ZT([elbowDraw, hand], 4.6, 3.8), S_LIMB2);
    r.poly(ZP([[g.back[0] - 8, g.back[1] - 5], [g.back[0] + 7, g.back[1] - 7], [g.back[0] + 9, g.back[1] + 3], [g.back[0] - 6, g.back[1] + 5]]), S_ARMOR);
    const [hx, hy] = Z(hand[0] - 2, hand[1]);
    r.ellipse(hx, hy, 5.4, 5.4, S_PLATE);
  } else {
    r.stroke([Z(...g.back), Z(...elbowDraw)], S_BONE, Math.round(3 * s));
    r.ellipse(...Z(...elbowDraw), 2.5 * s, 2.5 * s, S_LIMB2);
    r.stroke([Z(elbowDraw[0], elbowDraw[1] - 1.2), Z(...hand)], S_LIMB2, Math.round(1.4 * s));
    r.stroke([Z(elbowDraw[0], elbowDraw[1] + 1.2), Z(...hand)], S_LIMB2, Math.round(1.4 * s));
    r.ellipse(...Z(hand[0] - 2, hand[1]), 2.6 * s, 2.6 * s, S_LIMB2);
  }

  // the bow arm (the near one): shoulder, a long arm straight out to the grip
  if (top) {
    r.poly(ZT([g.pivot, g.elbowBow], 6.4, 5.4), S_ARMOR);
    r.poly(ZT([g.elbowBow, wrist], 5.4, 4.8), S_PLATE);
    for (const t of [0.28, 0.52, 0.78]) {
      const u = g.elbowBow[0] + (wrist[0] - g.elbowBow[0]) * t;
      const v = g.elbowBow[1] + (wrist[1] - g.elbowBow[1]) * t;
      r.line(...Z(u, v - 5), ...Z(u, v + 5), S_SEAM, 1);
    }
    r.poly(ZP([[g.elbowBow[0] - 3, g.elbowBow[1] - 7], [g.elbowBow[0] + 5, g.elbowBow[1] - 6], [g.elbowBow[0] + 5, g.elbowBow[1] + 6], [g.elbowBow[0] - 3, g.elbowBow[1] + 7]]), S_PLATE);
  } else {
    r.stroke([Z(...g.pivot), Z(...g.elbowBow)], S_LIMB, Math.round(3 * s));
    r.ellipse(...Z(...g.elbowBow), 2.5 * s, 2.5 * s, S_LIMB);
    r.stroke([Z(g.elbowBow[0], g.elbowBow[1] - 1.2), Z(...wrist)], S_LIMB, Math.round(1.4 * s));
    r.stroke([Z(g.elbowBow[0], g.elbowBow[1] + 1.2), Z(...wrist)], S_LIMB, Math.round(1.4 * s));
  }

  // the bow: a recurved arc of chakra (the Perfect one thicker, with spurs on its back), the near hand closed on its grip
  const arc: Pt[] = [Z(tipX + 3, ly - spec.half - 3)];
  for (let i = 0; i <= 14; i++) {
    const t = i / 7 - 1;
    arc.push(Z(gx - spec.bend * t * t, ly + t * spec.half));
  }
  arc.push(Z(tipX + 3, ly + spec.half + 3));
  r.stroke(arc, S_BOW, top ? 4 : 3);
  if (top) {
    for (const t of [-0.8, -0.45, 0.45, 0.8]) {
      const bx = gx - spec.bend * t * t;
      const by = ly + t * spec.half;
      r.poly(ZP([[bx + 1, by - 2], [bx + 5, by + Math.sign(t) * 2], [bx + 1, by + 2]]), S_BOW);
    }
  }
  const [gxr, gyr] = Z(gx - 1.5, ly);
  r.ellipse(gxr, gyr, top ? 5 : 2.7 * s, top ? 5 : 2.7 * s, top ? S_PLATE : S_LIMB);

  // the string (single pixels), the arrow while drawing, a muzzle flash on the shot
  const topTip: XY = [tipX, ly - spec.half];
  const botTip: XY = [tipX, ly + spec.half];
  const P = (u: number, v: number): XY => Z(u, v);
  const line = (p: XY, q: XY, c: number) => inkLine(ink, p[0], p[1], q[0], q[1], c);
  if (drawing) {
    line(P(...topTip), P(nockX, ly), SUSANOO_INK.string);
    line(P(nockX, ly), P(...botTip), SUSANOO_INK.string);
    r.poly([Z(lx + 1, ly + 0.5), Z(lx - 4.5, ly - 3), Z(lx - 4.5, ly + 4)], S_GLOW);
    line(P(nockX + 1, ly), P(lx - 4, ly), SUSANOO_INK.shaft);
    for (const [dx, dy] of [[1, -1], [2, -1], [3, -2], [4, -2], [1, 1], [2, 1], [3, 2], [4, 2]]) {
      const [px, py] = P(nockX + dx, ly + dy);
      ink.push({ x: Math.round(px), y: Math.round(py), c: SUSANOO_INK.fletch });
    }
  } else {
    // just released, the string snaps past straight and quivers; then it rests straight
    const mid = stage === SUSANOO.shot ? tipX + 1 : tipX;
    line(P(...topTip), P(mid, ly), SUSANOO_INK.string);
    line(P(mid, ly), P(...botTip), SUSANOO_INK.string);
    if (stage === SUSANOO.shot) {
      line(P(lx + 1, ly), P(lx + 9, ly), SUSANOO_INK.flash);
      line(P(lx + 1, ly - 4), P(lx + 1, ly + 4), SUSANOO_INK.flash2);
      for (const [dx, dy] of [[2, -1], [2, 1], [3, -2], [3, 2], [0, 0], [-1, 0]]) {
        const [px, py] = P(lx + dx, ly + dy);
        ink.push({ x: Math.round(px), y: Math.round(py), c: dx > 2 ? SUSANOO_INK.flash2 : SUSANOO_INK.flash });
      }
    }
  }
  return trimBelowFeet(bakeSpirit(r, SUSANOO_MATS, SUSANOO_HALO, ink));
}

// ---------------------------------------------------------------- baking and caches

/** nothing is drawn at or below the fighter's feet row (the spirit stands on the ground, it does not sink into it) */
function trimBelowFeet(b: Baked): Baked {
  b.runs = b.runs.filter((run) => run.y < SUSANOO.ay);
  return b;
}

function coreAndWings(level: 3 | 4, frame: number): { core: Baked; wings: Baked | null } {
  const { ax, ay, w, h } = SUSANOO;
  const scale = SUSANOO.scale[level];
  const make = (draw: (pen: Pen) => void): Raster => {
    const r = new Raster(w, h);
    draw(new ScaledPen(r, [0, 0], [ax, ay], scale));
    return r;
  };
  const core = make((pen) => (level === 4 ? perfect(pen, frame) : ribcage(pen, frame)));
  if (level === 3) return { core: trimBelowFeet(bakeSpirit(core, SUSANOO_MATS, SUSANOO_HALO)), wings: null };
  const wing = make((pen) => wings(pen, frame));
  // the wings stop where the body begins (so the mass behind never shows through the translucent body)
  for (let i = 0; i < wing.m.length; i++) if (core.m[i]) wing.m[i] = 0;
  return { core: trimBelowFeet(bakeSpirit(core, SUSANOO_MATS, SUSANOO_HALO)), wings: trimBelowFeet(bakeSpirit(wing, SUSANOO_MATS, SUSANOO_HALO)) };
}

const cache = new Map<string, Baked>();
function cached(key: string, make: () => Baked, max = 160): Baked {
  let b = cache.get(key);
  if (!b) {
    if (cache.size >= max) cache.delete(cache.keys().next().value!);
    b = make();
    cache.set(key, b);
  }
  return b;
}

const frameOf = (frame: number): number => ((Math.floor(frame) % SPIRIT_FRAMES) + SPIRIT_FRAMES) % SPIRIT_FRAMES;
const parts = new Map<string, { core: Baked; wings: Baked | null }>();
function body(level: 3 | 4, frame: number): { core: Baked; wings: Baked | null } {
  const key = `${level}|${frame}`;
  let p = parts.get(key);
  if (!p) {
    p = coreAndWings(level, frame);
    parts.set(key, p);
  }
  return p;
}

/** The body without wings, animation frame 0..3 (the flames flicker). */
export function susanooCore(level: 3 | 4, frame: number): Baked {
  return body(level, frameOf(frame)).core;
}

/** The wings (form 4; null for form 3), animation frame 0..3 (they beat). */
export function susanooWings(level: 3 | 4, frame: number): Baked | null {
  return body(level, frameOf(frame)).wings;
}

/** The arms, bow and arrow: `stage` 0..3 draws the bow back, 4 = the shot, 5 = at rest; the whole assembly swings about the shoulder by `aim`. */
export function susanooArms(level: 3 | 4, stage: number, aim = 0): Baked {
  const st = Math.max(0, Math.min(SUSANOO.rest, Math.floor(stage)));
  const a = avatarAim(aim);
  return cached(`arms|${level}|${st}|${a}`, () => armsRaster(level, st, a), 96);
}

/**
 * The whole Susanoo in one sprite (what the game paints once it is formed): wings behind, then the body, then the
 * arms. Baked once per (form, stage, frame, aim).
 */
export function susanooSprite(level: 3 | 4, stage: number, frame: number, aim = 0): Baked {
  const f = frameOf(frame);
  const st = Math.max(0, Math.min(SUSANOO.rest, Math.floor(stage)));
  const a = avatarAim(aim);
  return cached(`all|${level}|${st}|${f}|${a}`, () => {
    const b = body(level, f);
    const arms = susanooArms(level, st, a);
    return { w: SUSANOO.w, h: SUSANOO.h, runs: [...(b.wings?.runs ?? []), ...b.core.runs, ...arms.runs] };
  }, 48);
}

