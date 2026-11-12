import { bake, Raster, ScaledPen, type Material, type Pen, type Pt } from './pixelRaster';
import type { PokemonPose } from './pokemonArt';
import type { ReferenceFrame } from './pokemonSpriteMotion';

const ORIGIN: Pt = [38, 56];
const flat = (c: number): Material => ({ dark: c, base: c, light: c, hi: c });
const BLUE = 1, DARK = 2, CREAM = 3, FAR = 4, LIGHT = 5, WHITE = 6, RED = 7, BLACK = 8;
const PALETTES = [
  [0x458eba, 0x26364c, 0xb9d2df, 0x326381, 0x74b8d7, 0xf2f2dc, 0xba535b, 0x192432],
  [0x3c83b0, 0x25354b, 0xf0d99e, 0x2b587a, 0x6eafd1, 0xfff6d8, 0xc85558, 0x192431],
  [0x438eb6, 0x263246, 0xf3d9a0, 0x315e7a, 0x76bfd7, 0xfff5d7, 0xc84b55, 0x192331],
] as const;
const SWING = [0, 0.7, 1, 0.7, 0, -0.7, -1, -0.7];
const RAISE = [0, 0, 0, 2, 5, 4, 2, 0];
const HIT = [1, 1, 0.86, 0.64, 0.43, 0.23, 0.08, 0];
const CHARGE = [0.1, 0.45, 1, 1, 0.82, 0.52, 0.23, 0];
const COLLAPSE = [0, 0.12, 0.32, 0.57, 0.79, 0.96, 1, 1];
const offset = (p: Pt, x: number, y: number): Pt => [p[0] + x, p[1] + y];

interface AuraPose {
  hip: Pt; chest: Pt; head: Pt;
  feet: readonly [Pt, Pt]; hands: readonly [Pt, Pt];
  tail: number; ear: number; closed: boolean;
}

function poseFor(rank: number, pose: PokemonPose, phase: number): AuraPose {
  const short = rank === 0;
  let hip: Pt = [0, short ? -8 : -13];
  let chest: Pt = [1, short ? -13 : -22];
  let head: Pt = [4, short ? -19 : -31];
  let feet: [Pt, Pt] = [[-4, -2], [4, -2]];
  let hands: [Pt, Pt] = [offset(chest, 2, 6), offset(chest, 5, 5)];
  let tail = SWING[phase];
  let ear = SWING[(phase + 2) & 7];
  let closed = pose === 'idle' && phase === 7;
  const power = HIT[phase];
  if (pose === 'walk' || pose === 'run') {
    const sprint = pose === 'run';
    const stride = sprint ? 8 : 4;
    const bob = sprint ? [0, -1, -2, -1, 0, -1, -2, -1][phase] : [0, 0, -1, -1, 0, 0, -1, -1][phase];
    hip = offset(hip, sprint ? -3 : 0, bob);
    chest = offset(chest, sprint ? 6 : 1, bob + (sprint ? 2 : 0));
    head = offset(head, sprint ? 11 : 1, bob + (sprint ? 5 : 0));
    feet = [[-3 + SWING[phase] * stride, -2 - RAISE[phase]], [4 - SWING[phase] * stride, -2 - RAISE[(phase + 4) & 7]]];
    hands = sprint
      ? [offset(chest, -7 - SWING[phase] * 2, 1), offset(chest, -5 + SWING[phase] * 3, 4)]
      : [offset(chest, 3 - SWING[phase] * 4, 6), offset(chest, 4 + SWING[phase] * 4, 5)];
    tail += sprint ? -5 : 0;
    ear += sprint ? 3 : 0;
  } else if (pose === 'cast') {
    const power = CHARGE[phase];
    chest = offset(chest, -2 + power * 3, 2);
    head = offset(head, -1 + power * 2, 2);
    feet = [[-7, -2], [6, -2]];
    const focus = offset(chest, 10 + 7 * power, 0);
    hands = [offset(focus, -1, -3), offset(focus, -1, 3)];
    tail -= 2 * power;
    ear += 2 * power;
  } else if (pose === 'punch') {
    chest = offset(chest, 5 * power, 1);
    head = offset(head, 4 * power, 1);
    hands = [offset(chest, 1 - 2 * power, 3), offset(chest, 6 + 13 * power, -1)];
    feet = [[-6, -2], [4 + 2 * power, -2]];
    tail -= 3 * power;
  } else if (pose === 'kick') {
    hip = offset(hip, -2 * power, -2 * power);
    chest = offset(chest, -4 * power, -1 * power);
    head = offset(head, -3 * power, -1 * power);
    feet = [[-6, -2], [4 + 16 * power, -2 - 12 * power]];
    hands = [offset(chest, 2, 2), offset(chest, 5 - 3 * power, 2)];
    tail += 4 * power;
  } else if (pose === 'guard' || pose === 'windup') {
    hip = offset(hip, -1, 1);
    chest = offset(chest, -2, 2);
    head = offset(head, -3, 3);
    feet = [[-6, -2], [5, -2]];
    hands = [offset(head, 3, 5), offset(head, 7, 7)];
    ear += 2;
  } else if (pose === 'dash') {
    hip = offset(hip, -4, -1);
    chest = offset(chest, 8, 4);
    head = offset(head, 14, 7);
    feet = [[-10, -4 - RAISE[phase]], [-5, -3 - RAISE[(phase + 4) & 7]]];
    hands = [offset(chest, -8, 0), offset(chest, 10, 0)];
    tail -= 6;
    ear += 5;
  } else if (pose === 'air' || pose === 'takeoff' || pose === 'cling') {
    feet = [[-3, short ? -6 : -10], [4, short ? -5 : -8]];
    hands = pose === 'cling' ? [offset(head, 5, 4), offset(head, 7, 7)] : [offset(chest, 4, -1), offset(chest, 7, 1)];
    tail += 2;
  } else if (pose === 'land') {
    hip = offset(hip, 0, 3 * power);
    chest = offset(chest, 3 * power, 5 * power);
    head = offset(head, 4 * power, 5 * power);
    feet = [[-7, -2], [6, -2]];
    hands = [offset(chest, 4, 6), offset(chest, 7, 5)];
  } else if (pose === 'hurt') {
    chest = offset(chest, -6 * power, 3 * power);
    head = offset(head, -7 * power, 4 * power);
    hands = [offset(chest, 2, 3), offset(chest, 6, 3)];
    tail -= 4 * power;
    closed = power > 0.5;
  } else if (pose === 'faint') {
    const fall = COLLAPSE[phase];
    hip = offset(hip, -2 * fall, (short ? 4 : 9) * fall);
    chest = offset(chest, 5 * fall, (short ? 8 : 17) * fall);
    head = offset(head, 10 * fall, (short ? 14 : 26) * fall);
    feet = [[-6, -2], [0, -2]];
    hands = [[8, -2], [12, -2]];
    ear += fall * 5;
    tail -= fall * 3;
    closed = true;
  }
  return { hip, chest, head, feet, hands, tail, ear, closed };
}

function leg(p: Pen, hip: Pt, ankle: Pt, near: boolean, mega: boolean): void {
  const knee: Pt = [(hip[0] + ankle[0]) * 0.5 - 2, (hip[1] + ankle[1]) * 0.5 - 1];
  p.stroke([hip, knee], near ? BLUE : FAR, 4);
  p.stroke([knee, ankle], DARK, 3);
  p.line(ankle[0] - 1, ankle[1], ankle[0] + 4, ankle[1], mega && near ? RED : DARK, 2);
  p.line(ankle[0] + 2, ankle[1] - 1, ankle[0] + 4, ankle[1] - 1, near ? LIGHT : FAR);
}

function arm(p: Pen, shoulder: Pt, wrist: Pt, near: boolean, rank: number): void {
  const elbow: Pt = [(shoulder[0] + wrist[0]) * 0.5 - 1, (shoulder[1] + wrist[1]) * 0.5 + 2];
  p.stroke([shoulder, elbow], near ? BLUE : FAR, 3);
  p.stroke([elbow, wrist], DARK, 3);
  p.ellipse(wrist[0], wrist[1], 2.3, 2, rank === 2 && near ? RED : DARK);
  if (near) p.line(wrist[0] - 1, wrist[1] - 1, wrist[0] + 1, wrist[1] - 1, FAR);
  if (rank > 0) p.poly([offset(wrist, 0, -2), offset(wrist, 1, -5), offset(wrist, 3, -1)], WHITE);
}

/** Canine martial poses with planted contact feet and independently posed hands. */
export function bakeAuraRig(rank: number, pose: PokemonPose, phase: number): ReferenceFrame {
  rank = Math.max(0, Math.min(2, rank));
  phase &= 7;
  const scale = rank === 0 ? 0.62 : rank === 2 ? 0.9 : 0.75;
  const r = new Raster(90, 70);
  const p = new ScaledPen(r, [0, 0], ORIGIN, scale);
  const body = poseFor(rank, pose, phase);
  const { hip, chest, head, feet, hands } = body;
  const short = rank === 0;
  const mega = rank === 2;
  p.stroke([offset(hip, -2, -1), offset(hip, -8, -1 + body.tail), offset(hip, -11, -5 + body.tail)], FAR, short ? 2 : 3);
  leg(p, offset(hip, 2, 1), feet[0], false, mega);
  arm(p, offset(chest, 1, 0), hands[0], false, rank);
  p.stroke([hip, chest], DARK, short ? 6 : 8);
  p.poly([offset(chest, -4, -2), offset(chest, 2, -4), offset(chest, 6, 1), offset(hip, 5, 0),
    offset(hip, -4, 0), offset(chest, -5, 2)], short ? BLUE : CREAM);
  if (short) p.line(chest[0] - 2, chest[1], chest[0] + 3, chest[1], LIGHT);
  else {
    p.poly([offset(chest, -4, -3), offset(chest, -8, -1), offset(chest, -5, 3), offset(chest, -8, 5),
      offset(chest, -2, 5), offset(chest, 1, 8), offset(chest, 5, 3), offset(chest, 7, 0), offset(chest, 2, -3)], CREAM);
    p.poly([offset(chest, 4, 0), offset(chest, 9, -1), offset(chest, 6, 3)], WHITE);
  }
  leg(p, offset(hip, -1, 0), feet[1], true, mega);
  arm(p, offset(chest, 3, 1), hands[1], true, rank);
  const ear = body.ear;
  // The far feeler and the near feeler are separate hanging silhouettes.
  p.poly([offset(head, -3, 0), offset(head, -9, 4 + ear), offset(head, -11, 10 + ear),
    offset(head, -8, 11 + ear), offset(head, -5, 5 + ear), offset(head, -1, 2)], DARK);
  p.poly([offset(head, -2, -3), offset(head, -5, -11), offset(head, -1, -8), offset(head, 1, -3)], DARK);
  p.poly([offset(head, 1, -3), offset(head, 2, -11), offset(head, 6, -8), offset(head, 5, -1)], BLUE);
  p.poly([offset(head, 2, -5), offset(head, 3, -9), offset(head, 5, -7), offset(head, 4, -3)], DARK);
  p.poly([offset(head, -5, -3), offset(head, -1, -6), offset(head, 4, -4), offset(head, 6, -1),
    offset(head, 10, 1), offset(head, 9, 4), offset(head, 3, 5), offset(head, -3, 3), offset(head, -5, 0)], BLUE);
  p.poly([offset(head, -4, -1), offset(head, 1, -2), offset(head, 5, -1), offset(head, 7, 1),
    offset(head, 9, 1), offset(head, 8, 3), offset(head, 2, 2), offset(head, -4, 2)], DARK);
  p.poly([offset(head, 5, 2), offset(head, 10, 1), offset(head, 9, 4), offset(head, 5, 4)], short ? BLUE : LIGHT);
  if (body.closed) p.line(head[0] + 2, head[1], head[0] + 5, head[1] + 1, BLACK);
  else {
    p.poly([offset(head, 0, -1), offset(head, 5, 0), offset(head, 3, 2), offset(head, 1, 1)], WHITE);
    p.set(head[0] + 3, head[1] + 1, RED);
    p.set(head[0] + 5, head[1] + 1, BLACK);
  }
  p.set(head[0] + 10, head[1] + 1, BLACK);
  p.line(head[0] + 6, head[1] + 4, head[0] + 9, head[1] + 3, BLACK);
  p.poly([offset(head, -3, 1), offset(head, -6, 4), offset(head, -8, 13 + ear), offset(head, -4, 11 + ear),
    offset(head, -2, 4)], mega ? DARK : BLUE);
  if (mega) {
    p.poly([offset(head, -6, 6), offset(head, -8, 10 + ear), offset(head, -6, 13 + ear), offset(head, -4, 10 + ear)], RED);
    p.poly([offset(head, -3, -3), offset(head, -1, -5), offset(head, 3, -3), offset(head, 1, -1)], RED);
    p.poly([offset(chest, -4, -3), offset(chest, -10, -2), offset(chest, -8, 1), offset(chest, -12, 3),
      offset(chest, -8, 6), offset(chest, -10, 8), offset(chest, -4, 7), offset(chest, 0, 11), offset(chest, 4, 5)], CREAM);
    p.line(chest[0] - 7, chest[1] + 1, chest[0] - 3, chest[1] + 2, WHITE);
  }
  const sprite = bake(r, PALETTES[rank].map(flat), 0x182332, false);
  sprite.runs = sprite.runs.filter(run => run.y < ORIGIN[1]);
  const point = (v: Pt): Pt => [Math.round(v[0] * scale), Math.round(v[1] * scale)];
  const muzzle = pose === 'cast' ? offset(hands[1], 3, -2) : offset(head, 10, 1);
  return { sprite, originX: ORIGIN[0], originY: ORIGIN[1], muzzle: point(muzzle),
    ...(rank === 2 ? { saddle: point(offset(chest, -4, -2)) } : {}),
  };
}
