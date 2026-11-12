import { Raster, ScaledPen, toRuns, type Pen, type Pt } from './pixelRaster';
import type { PokemonPose } from './pokemonArt';
import type { ReferenceFrame } from './pokemonSpriteMotion';

const ORIGIN: Pt = [57, 66];
const INK = 1, DEEP = 2, SHADE = 3, SKIN = 4, LIGHT = 5, CREAM = 6;
const WHITE = 7, EYE = 8, RED = 9, TONGUE = 10, TONGUE_LIGHT = 11, WATER = 12;
const PALETTES = [
  [-1, 0x172c42, 0x295d7d, 0x4292b5, 0x6ec4dd, 0xa4e6e9, 0xf4eac4, 0xf4fbec, 0xf1cf59, 0x3a2c36, 0xe7a190, 0xffc1a1, 0xbdeff5],
  [-1, 0x19263d, 0x21496e, 0x2c6e9a, 0x4e9fcc, 0x81cbe0, 0xd9ebde, 0xf5fbef, 0xe8d76d, 0x3f2a3e, 0xdca2ae, 0xf6c2c5, 0xbdeff5],
  [-1, 0x192235, 0x253658, 0x30517b, 0x3d6c9c, 0x6696bd, 0xc8d9cf, 0xf0efdc, 0xe8d875, 0xc75563, 0xcd718c, 0xf0a3ad, 0x9edff0],
  [-1, 0x171f30, 0x202b4a, 0x294369, 0x375b8c, 0x5c8ab5, 0xc7d4d0, 0xf2eede, 0xe7d477, 0xe15d63, 0xc66b89, 0xf5a8b5, 0x9be8f2],
] as const;
const SWAY = [0, 1, 2, 1, 0, -1, -2, -1];
const BREATH = [0, 0, -0.5, -1, -1, -0.5, 0, 0];
const HIT = [0.45, 1, 0.88, 0.68, 0.48, 0.28, 0.12, 0];
const STRIKE = [0.72, 1, 0.92, 0.72, 0.49, 0.27, 0.1, 0];
const CAST = [0.15, 0.6, 1, 1, 0.85, 0.6, 0.3, 0];
const FALL = [0, 0.12, 0.33, 0.6, 0.83, 0.96, 1, 1];
const WALK_X = [4, 2, 0, -3, -4, -2, 0, 3];
const WALK_Y = [0, 0, 0, 0, 0, 2, 3, 2];
const RUN_X = [9, 5, 0, -6, -10, -7, 0, 7];
const RUN_Y = [0, 0, 0, 2, 4, 7, 7, 4];
const add = (a: Pt, x: number, y: number): Pt => [a[0] + x, a[1] + y];

interface FrogPose {
  hip: Pt;
  chest: Pt;
  head: Pt;
  feet: readonly [Pt, Pt];
  hands: readonly [Pt, Pt];
  scarf: number;
  mouth: number;
}

function poseFor(rank: number, pose: PokemonPose, phase: number): FrogPose {
  const ninja = rank >= 2;
  const middle = rank === 1;
  let hip: Pt = [-3, ninja ? -13 : middle ? -8 : -5];
  let chest: Pt = [0, ninja ? -21 : middle ? -13 : -7];
  let head: Pt = [ninja ? 6 : 3, ninja ? -30 : middle ? -19 : -12];
  let feet: [Pt, Pt] = [[ninja ? -11 : -7, -2], [ninja ? 7 : 5, -2]];
  let hands: [Pt, Pt] = [[ninja ? 7 : 3, ninja ? -17 : -3], [ninja ? 8 : 7, ninja ? -12 : -3]];
  let scarf = SWAY[phase];
  let mouth = 0;
  if (pose === 'idle') {
    chest = add(chest, 0, BREATH[phase]);
    head = add(head, 0, BREATH[phase] * 0.6);
  }

  if (pose === 'walk' || pose === 'run' || pose === 'dash') {
    const running = pose !== 'walk';
    const far = (phase + 4) % 8;
    const xs = running ? RUN_X : WALK_X;
    const ys = running ? RUN_Y : WALK_Y;
    const stride = ninja ? 1 : middle ? 0.7 : 0.52;
    feet = [[-3 + xs[far] * stride, -2 - ys[far] * stride], [xs[phase] * stride, -2 - ys[phase] * stride]];
    const lift = running ? [0, -1, -2, -3, -2, -1, 0, 1][phase] : [0, 0, -1, -1, 0, 0, -1, -1][phase];
    hip = add(hip, running ? -2 : 0, (!rank ? Math.min(0, lift) : lift) + (ninja && running ? 3 : 0));
    chest = add(chest, running ? 4 : 1, lift + (ninja && running ? 6 : 0));
    head = add(head, running ? 7 : 1, lift + (ninja && running ? 7 : 0));
    hands = ninja
      ? [[-9 - SWAY[phase], chest[1] + 5], [-6 + SWAY[phase], chest[1] + 7]]
      : [[-3 - SWAY[phase], chest[1] + 3], [6 + SWAY[phase], chest[1] + 3]];
    scarf = (running ? -5 : 0) + SWAY[far];
    if (!ninja && running) {
      feet = [[-6 - xs[phase] * 0.4, -2 - Math.max(0, -lift) * 0.9], [4 - xs[phase] * 0.35, -2 - Math.max(0, -lift) * 0.65]];
    }
    if (pose === 'dash') {
      chest = add(chest, ninja ? 5 : 3, ninja ? 3 : 1);
      head = add(head, ninja ? 7 : 4, ninja ? 3 : 1);
      feet = [[ninja ? -16 : -8, -8], [ninja ? -9 : -4, -6]];
      hands = [add(chest, -7, rank ? 4 : 2), add(chest, ninja ? 15 : 10, 1)];
      scarf = -9 + SWAY[far];
    }
  }
  if (pose === 'windup' || pose === 'guard') {
    const tuck = pose === 'guard' ? 1 : 0.3 + phase / 10;
    hip = add(hip, -2 * tuck, rank ? 1.5 * tuck : 0);
    chest = add(chest, -2 * tuck, 2 * tuck);
    head = add(head, -3 * tuck, 2 * tuck);
    hands = [add(head, 4, 4), add(head, 2, 7)];
    scarf -= 2;
  } else if (pose === 'punch' || pose === 'kick' || pose === 'cast') {
    const power = pose === 'cast' ? CAST[phase] : STRIKE[phase];
    chest = add(chest, 3 * power, 1.5 * power);
    head = add(head, 2 * power, -power);
    if (pose === 'kick') {
      feet[1] = [feet[1][0] + (ninja ? 16 : 9) * power, -2 - (ninja ? 13 : 6) * power];
      hands = [add(chest, -3, 3), add(chest, -6, ninja ? 6 : middle ? 4 : 2)];
    } else {
      hands = [add(chest, -3 * power, 3), add(chest, (ninja ? 17 : 10) * power, pose === 'cast' ? -3 * power : 1)];
    }
    mouth = pose === 'cast' && !ninja ? power : 0;
    scarf -= 4 * power;
  } else if (pose === 'cling') {
    hip = add(hip, -1, -1);
    chest = add(chest, 1, 0);
    head = add(head, 1, -1);
    feet = [[-5, -7], [3, -6]];
    hands = [add(chest, 6, -3), add(chest, 9, -1)];
    scarf -= 2;
  } else if (pose === 'air' || pose === 'takeoff') {
    hip = add(hip, -1, -2);
    chest = add(chest, 1, -2);
    head = add(head, 3, -2);
    feet = [[-10, ninja ? -10 : -6], [3, ninja ? -8 : -5]];
    hands = [add(chest, -6, -1), add(chest, 8, -2)];
    scarf -= 4;
  } else if (pose === 'land') {
    const power = STRIKE[phase];
    hip = add(hip, -2 * power, (ninja ? 3 : middle ? 1.3 : 0) * power);
    chest = add(chest, 2 * power, (ninja ? 4 : middle ? 2 : 1) * power);
    head = add(head, 2 * power, (ninja ? 3 : middle ? 2 : 1) * power);
    feet = [[ninja ? -13 : -8, -2], [ninja ? 9 : 6, -2]];
    hands = [add(chest, 1, rank ? 4 : 2), [ninja ? 13 : 8, -3]];
  } else if (pose === 'hurt') {
    const power = HIT[phase];
    hip = add(hip, -2 * power, 0);
    chest = add(chest, -5 * power, power);
    head = add(head, -6 * power, -power);
    hands = [add(chest, 2, 2), add(chest, 4, rank ? 4 : 3)];
    scarf += 5 * power;
  } else if (pose === 'faint') {
    const power = FALL[phase];
    hip = add(hip, -3 * power, (ninja ? 6 : middle ? 2 : 0) * power);
    chest = add(chest, 5 * power, (ninja ? 14 : middle ? 6 : 1) * power);
    head = add(head, 6 * power, (ninja ? 19 : middle ? 8 : 2) * power);
    feet = [[-12, -2], [-4, -2]];
    hands = [[4, -3], [11, -3]];
    scarf = -4 * power;
  }
  return { hip, chest, head, feet, hands, scarf, mouth };
}

function limb(r: Pen, root: Pt, joint: Pt, end: Pt, near: boolean, width: number): void {
  r.stroke([root, joint, end], INK, width + 2);
  r.stroke([root, joint, end], near ? SKIN : SHADE, width);
  if (near && width > 2) r.line(root[0], root[1] - 1, joint[0], joint[1] - 1, LIGHT);
}

function elbow(root: Pt, hand: Pt): Pt {
  return [(root[0] + hand[0]) / 2 - 1, (root[1] + hand[1]) / 2 + 1];
}

function toes(r: Pen, at: Pt, near: boolean, rank: number): void {
  const pad = near ? LIGHT : SHADE;
  const span = rank >= 2 ? 5 : 3;
  r.poly([add(at, -2, -1), add(at, span, -1), add(at, span + 2, 2), add(at, -3, 2)], INK);
  r.line(at[0] - 1, at[1], at[0] + span, at[1], pad);
  r.set(at[0] + span + 1, at[1], rank >= 2 ? CREAM : WHITE);
  if (rank >= 2) r.set(at[0] + span - 1, at[1] - 1, WHITE);
}

function foam(r: Pen, at: Pt, scale: number): void {
  r.ellipse(at[0], at[1], 3.6 * scale, 2.4 * scale, INK);
  for (const [x, y, size] of [[-2, 0, 2.1], [0, -1, 2.5], [2, 0, 2.2]] as const) {
    r.ellipse(at[0] + x * scale, at[1] + y * scale, size * scale, size * scale * 0.8, CREAM);
    r.set(at[0] + x * scale, at[1] + y * scale - 1, WHITE);
  }
}

function scarf(r: Pen, at: Pt, sway: number, bond: boolean): void {
  const tip = add(at, -20 - Math.max(0, -sway), 2 + sway);
  r.poly([add(at, 1, -1), add(at, -8, -4), add(tip, -3, -2), add(tip, 0, 1),
    add(tip, -1, 4), add(at, -10, 0), add(at, -1, 3)], INK);
  r.poly([at, add(at, -8, -2), add(tip, -1, -1), add(tip, 2, 2), add(at, -9, 1), add(at, -1, 2)], TONGUE);
  r.stroke([add(at, -2, 0), add(at, -10, -1), add(tip, 1, 0)], TONGUE_LIGHT);
  if (bond) r.line(tip[0] + 2, tip[1] + 1, at[0] - 6, at[1] + 1, RED);
}

function head(r: Pen, at: Pt, rank: number, mouth: number, closed: boolean): Pt {
  const ninja = rank >= 2;
  const [x, y] = at;
  if (!ninja) {
    const bigger = rank === 1;
    r.ellipse(x, y, bigger ? 6.4 : 5.5, bigger ? 5.2 : 4.6, INK);
    r.ellipse(x, y, bigger ? 5.4 : 4.5, bigger ? 4.2 : 3.6, SKIN);
    r.poly([[x - 2, y - 4], [x + 2, y - 4], [x + 6, y - 1], [x + 7, y + 2], [x + 3, y + 4], [x - 1, y + 3]], SKIN);
    r.line(x + 1, y + 3, x + 5, y + 3, CREAM, 2);
    for (const eyeX of [x - 3, x + 3]) {
      r.ellipse(eyeX, y - 4, 2.5, 3.4, INK);
      r.ellipse(eyeX, y - 4, 1.8, 2.7, closed ? SKIN : EYE);
      if (closed) r.line(eyeX - 1, y - 4, eyeX + 1, y - 3, DEEP);
      else {
        r.line(eyeX + 1, y - 5, eyeX + 1, y - 3, INK);
        r.set(eyeX + 1, y - 6, WHITE);
      }
    }
    if (bigger) r.poly([[x - 6, y - 1], [x - 4, y - 7], [x, y - 8], [x + 4, y - 4], [x - 1, y - 5]], DEEP);
    if (mouth > 0.3) r.line(x + 4, y + 2, x + 6, y + 2 + Math.round(mouth * 2), INK, 2);
    else r.line(x + 3, y + 2, x + 6, y + 1, DEEP);
    return [x + 7, y + 2];
  }
  // Long crown fins and a narrow white cheek preserve the ninja silhouette.
  r.poly([[x - 8, y - 1], [x - 10, y - 9], [x - 4, y - 7], [x - 1, y - 11],
    [x + 3, y - 6], [x + 8, y - 4], [x + 11, y], [x + 8, y + 5], [x + 2, y + 7], [x - 4, y + 4]], INK);
  r.poly([[x - 7, y - 1], [x - 8, y - 7], [x - 3, y - 5], [x - 1, y - 9],
    [x + 2, y - 4], [x + 7, y - 3], [x + 9, y], [x + 7, y + 4], [x + 1, y + 5], [x - 3, y + 3]], SKIN);
  r.poly([[x - 5, y], [x - 1, y - 4], [x + 2, y - 3], [x + 8, y], [x + 4, y + 2], [x + 1, y + 5], [x - 2, y + 2]], CREAM);
  r.poly([[x + 1, y - 3], [x + 7, y - 1], [x + 5, y + 1], [x + 1, y]], INK);
  if (!closed) {
    r.line(x + 2, y - 2, x + 5, y - 1, WHITE);
    r.set(x + 4, y - 1, RED);
  }
  r.line(x + 5, y + 3, x + 8, y + 2, DEEP);
  if (rank === 3) {
    r.poly([[x - 3, y - 5], [x - 1, y - 10], [x + 2, y - 4], [x + 5, y - 2], [x + 1, y - 1]], RED);
    r.line(x - 5, y - 1, x - 2, y + 2, DEEP, 2);
  }
  return [x + 10, y + 2];
}

/** Hand-posed frog hops, ninja strides and independently trailing scarf cels. */
export function bakeFrogRig(rank: number, pose: PokemonPose, phase: number): ReferenceFrame {
  rank = Math.max(0, Math.min(3, Math.floor(rank)));
  phase = ((Math.floor(phase) % 8) + 8) % 8;
  const ninja = rank >= 2;
  const s = poseFor(rank, pose, phase);
  const raster = new Raster(118, 86);
  const scale = [0.7, 0.8, 0.85, 0.98][rank];
  const r = new ScaledPen(raster, [0, 0], ORIGIN, scale);
  const width = ninja ? 3 : 2;

  if (rank === 3) {
    const at = add(s.chest, -4, -2);
    const fold = pose === 'faint' ? 1 - FALL[phase] * 0.75 : 1;
    const point = (x: number, y: number): Pt => add(at, x, y * fold);
    r.poly([point(-4, -15), point(0, -5), point(8, -8), point(3, 0),
      point(8, 7), point(-2, 4), point(-8, 12), point(-7, 1), point(-15, -3), point(-6, -5)], DEEP);
    r.stroke([point(-3, -11), at, point(-10, -2)], WATER, 2);
  }
  if (ninja) scarf(r, add(s.chest, 1, -4), s.scarf, rank === 3);
  const farKnee: Pt = [s.hip[0] - (ninja ? 7 : 5), (s.hip[1] + s.feet[0][1]) / 2 - 2];
  limb(r, add(s.hip, 1, 0), farKnee, add(s.feet[0], 0, -2), false, width + 1);
  toes(r, s.feet[0], false, rank);
  const farShoulder = add(s.chest, 2, 1);
  limb(r, farShoulder, elbow(farShoulder, s.hands[0]), s.hands[0], false, width);

  r.ellipse(s.hip[0], s.hip[1], ninja ? 5.8 : rank === 1 ? 5.2 : 5, ninja ? 6.3 : 4.5, INK);
  r.stroke([s.hip, s.chest], INK, ninja ? 10 : rank === 1 ? 8 : 7);
  r.ellipse(s.hip[0], s.hip[1] - 0.5, ninja ? 4.6 : 4.1, ninja ? 5.3 : 3.4, SKIN);
  r.stroke([add(s.hip, 0, -1), s.chest], SKIN, ninja ? 8 : rank === 1 ? 6 : 5);
  r.line(s.chest[0] - 2, s.chest[1], s.hip[0] - 3, s.hip[1], LIGHT, 2);
  r.poly([add(s.chest, 1, 1), add(s.chest, 3, 3), add(s.hip, 3, 3), add(s.hip, 0, 4), add(s.hip, -1, 0)], CREAM);
  if (ninja) r.ellipse(s.hip[0] + 3, s.hip[1] + 1, 2.1, 2.5, DEEP);
  else foam(r, add(s.chest, -1, -2), rank === 1 ? 1.25 : 1);

  const nearKnee: Pt = [s.hip[0] + (ninja ? 6 : 5), (s.hip[1] + s.feet[1][1]) / 2 - (ninja ? 1 : 3)];
  limb(r, add(s.hip, -1, 1), nearKnee, add(s.feet[1], 0, -2), true, width + 1);
  toes(r, s.feet[1], true, rank);
  if (rank === 1) foam(r, add(s.feet[1], -2, -2), 0.7);
  const nearShoulder = add(s.chest, -1, 1);
  limb(r, nearShoulder, elbow(nearShoulder, s.hands[1]), s.hands[1], true, width);
  r.ellipse(s.hands[1][0], s.hands[1][1], ninja ? 2.1 : 1.5, 1.3, ninja ? CREAM : LIGHT);
  if (ninja) {
    r.line(s.hands[1][0] - 1, s.hands[1][1] - 1, s.hands[1][0] + 4, s.hands[1][1] - 2, CREAM);
    r.ellipse(s.feet[1][0] - 2, s.feet[1][1] - 6, 2, 2.5, CREAM);
    r.line(s.chest[0] - 1, s.chest[1] - 1, s.head[0] - 2, s.head[1] + 4, SKIN, 5);
  }
  const mouth = head(r, s.head, rank, s.mouth, pose === 'faint' && phase > 2 || pose === 'hurt' && phase < 3 || pose === 'idle' && phase === 7);
  if (ninja) {
    r.stroke([add(s.head, -5, 4), add(s.head, 0, 6), add(s.head, 5, 3)], TONGUE, 3);
    r.line(s.head[0] - 4, s.head[1] + 3, s.head[0], s.head[1] + 5, TONGUE_LIGHT);
  }
  const anchor = ([x, y]: Pt): Pt => [Math.round(x * scale), Math.round(y * scale)];
  return {
    sprite: toRuns(Int32Array.from(raster.m, ink => PALETTES[rank][ink]), raster.w, raster.h),
    originX: ORIGIN[0], originY: ORIGIN[1],
    muzzle: anchor(ninja ? add(s.hands[1], 3, -2) : mouth),
    saddle: ninja ? anchor(add(s.chest, -4, -2)) : undefined,
  };
}
