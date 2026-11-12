import { bake, Raster, ScaledPen, type Material, type Pen, type Pt } from './pixelRaster';
import type { PokemonPose } from './pokemonArt';
import type { ReferenceFrame } from './pokemonSpriteMotion';

type Flight = 'none' | 'hover' | 'cruise' | 'sprint';
type Limb = readonly [knee: Pt, ankle: Pt];
type Wing = readonly [wrist: Pt, tip: Pt, trailing: Pt];

const ORIGIN: Pt = [86, 96];
const SKIN = 1;
const SHADE = 2;
const BELLY = 3;
const MEMBRANE = 4;
const FAR_MEMBRANE = 5;
const CLAW = 6;
const LINE = 7;
const LIGHT = 8;
const MOUTH = 9;
const EYE = 10;
const NEAR_RIB = 11;
const FAR_RIB = 12;

const colors = (dark: number, base: number, light: number, hi: number): Material => ({ dark, base, light, hi });
const flat = (c: number): Material => colors(c, c, c, c);
const ORANGE: readonly Material[] = [
  colors(0xb65c27, 0xe78433, 0xf6a04d, 0xffbb6d),
  colors(0x7d361e, 0xad4e25, 0xc46330, 0xdf7837),
  colors(0xc69b60, 0xf0d795, 0xffe7a8, 0xfff0bd),
  colors(0x142d37, 0x235058, 0x33676a, 0x4c7e7c),
  colors(0x74351e, 0xb25d2b, 0xcd7739, 0xdf904b),
  colors(0x9d9b9c, 0xd8d3c6, 0xf8ecd7, 0xfff9ec),
  flat(0x39272a),
  colors(0xd97e3b, 0xfbb466, 0xffc37b, 0xffd08f),
  colors(0x54292e, 0x823d43, 0xaf5356, 0xbc6663),
  flat(0x398f83),
  colors(0x773c26, 0xc96c36, 0xe78f49, 0xf5a960),
  colors(0x552b23, 0x934622, 0xb06130, 0xcf7839),
];
const MEGA: readonly Material[] = [
  flat(0x3b444c),
  flat(0x2a313b),
  flat(0x4b6572),
  flat(0x20394e),
  flat(0x26354a),
  flat(0xc2d0d6),
  flat(0x1c2330),
  flat(0x36a6c9),
  flat(0x62435c),
  flat(0xc16051),
  flat(0x3c4b58),
  flat(0x303e4b),
];

const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const offset = (a: Pt, x: number, y: number): Pt => [a[0] + x, a[1] + y];
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const normal = (a: Pt, b: Pt): Pt => {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  return [-dy / len, dx / len];
};
const across = (p: Pt, n: Pt, r: number): Pt => offset(p, n[0] * r, n[1] * r);

function tapered(pen: Pen, joints: readonly Pt[], widths: readonly number[], mat: number): void {
  const sides = joints.map((p, i) => {
    const n = normal(joints[Math.max(0, i - 1)], joints[Math.min(joints.length - 1, i + 1)]);
    return [across(p, n, widths[i]), across(p, n, -widths[i])] as const;
  });
  pen.poly([...sides.map(side => side[0]), ...sides.reverse().map(side => side[1])], mat);
}

interface Pose {
  hip: Pt;
  chest: Pt;
  head: Pt;
  headPitch: number;
  jaw: number;
  legs: readonly [Limb, Limb];
  hands: readonly [Pt, Pt];
  tail: readonly [Pt, Pt, Pt];
  flare: number;
  grip?: Pt;
  takeoff?: number;
  fold?: number;
  closedEyes?: boolean;
}

type FlightBody = Pick<Pose, 'hip' | 'chest' | 'head' | 'headPitch' | 'legs' | 'hands' | 'tail'>;
const FLIGHT_LEVEL = { none: 0, hover: 0, cruise: 1, sprint: 2 } as const;
const FLIGHT_BODIES: readonly FlightBody[] = [
  {
    hip: [-4, -15], chest: [1, -29], head: [11, -39], headPitch: -6,
    legs: [[[-12, -10], [-13, -5]], [[1, -10], [0, -6]]],
    hands: [[13, -21], [8, -18]],
    tail: [[-19, -13], [-37, -21], [-48, -18]],
  },
  {
    hip: [-12, -18], chest: [4, -24], head: [21, -24], headPitch: 4,
    legs: [[[-20, -15], [-26, -17]], [[-12, -10], [-18, -12]]],
    hands: [[5, -17], [1, -15]],
    tail: [[-26, -21], [-42, -23], [-53, -21]],
  },
  {
    hip: [-16, -19], chest: [7, -23], head: [26, -24], headPitch: 7,
    legs: [[[-27, -20], [-33, -21]], [[-23, -14], [-29, -16]]],
    hands: [[-2, -18], [-5, -17]],
    tail: [[-32, -23], [-47, -23], [-59, -25]],
  },
];

// Ankles stay on the same pixel row through each stance. A walking foot swings
// under the hip, while a sprinting foot tucks behind it before reaching.
const WALK: readonly Limb[] = [
  [[3, -10], [8, -3]], [[2, -10], [5, -3]], [[0, -11], [1, -3]], [[-3, -10], [-4, -3]],
  [[-7, -10], [-8, -3]], [[-8, -12], [-5, -7]], [[-1, -12], [0, -9]], [[5, -11], [7, -7]],
];
const RUN: readonly Limb[] = [
  [[4, -8], [12, -3]], [[1, -7], [6, -3]], [[-4, -8], [-1, -3]], [[-9, -9], [-11, -5]],
  [[-14, -10], [-15, -5]], [[-13, -12], [-9, -11]], [[0, -11], [2, -10]], [[8, -10], [11, -6]],
];
const FLOAT = [0, -1, -2, -2, -1, 0, 1, 1];
const BREATH = [0, 0, -1, -1, -1, -1, 0, 0];
const STRIKE = [0.65, 1, 0.92, 0.72, 0.46, 0.26, 0.1, 0];
const CAST = [0.15, 0.62, 1, 1, 0.88, 0.54, 0.24, 0];
const GUARD = [1, 1, 1, 0.96, 0.96, 1, 1, 1];
const LAND = [0.62, 1, 0.91, 0.62, 0.38, 0.22, 0.1, 0];
const BRAKE = [1, 0.96, 0.81, 0.57, 0.34, 0.19, 0.08, 0];
const LIFTOFF = [0.12, 0.25, 0.47, 0.72, 0.94, 1, 1, 1];
const RECOIL = [1, 0.96, 0.84, 0.66, 0.43, 0.23, 0.1, 0];
const COLLAPSE = [0.12, 0.28, 0.5, 0.72, 0.86, 0.94, 1, 1];

function bodyPose(pose: PokemonPose, phase: number, flight: Flight, glide: number): Pose {
  let hip: Pt = [-2, -13], chest: Pt = [4, -24], head: Pt = [15, -34];
  let legs: [Limb, Limb] = [[[-10, -9], [-10, -3]], [[2, -8], [4, -3]]];
  let hands: [Pt, Pt] = [[14, -16], [10, -14]];
  let tail: [Pt, Pt, Pt] = [[-18, -10], [-35, -14], [-48, -10]];
  let headPitch = 0, jaw = 0, flare = 0;
  let grip: Pt | undefined;
  let takeoff: number | undefined;
  let fold: number | undefined;
  let closedEyes = false;
  const breath = BREATH[phase];

  if (flight !== 'none') {
    const bob = FLOAT[phase];
    const segment = Math.min(1, Math.floor(glide));
    const blend = glide - segment;
    const from = FLIGHT_BODIES[segment];
    const to = FLIGHT_BODIES[segment + 1];
    hip = lerp(from.hip, to.hip, blend);
    chest = lerp(from.chest, to.chest, blend);
    head = lerp(from.head, to.head, blend);
    headPitch = from.headPitch + (to.headPitch - from.headPitch) * blend;
    legs = [
      [lerp(from.legs[0][0], to.legs[0][0], blend), lerp(from.legs[0][1], to.legs[0][1], blend)],
      [lerp(from.legs[1][0], to.legs[1][0], blend), lerp(from.legs[1][1], to.legs[1][1], blend)],
    ];
    hands = [lerp(from.hands[0], to.hands[0], blend), lerp(from.hands[1], to.hands[1], blend)];
    tail = [lerp(from.tail[0], to.tail[0], blend), lerp(from.tail[1], to.tail[1], blend), lerp(from.tail[2], to.tail[2], blend)];
    hip = offset(hip, 0, bob * 0.75);
    chest = offset(chest, 0, bob);
    head = offset(head, 0, bob * 0.65);
    legs = [
      [offset(legs[0][0], 0, bob), offset(legs[0][1], 0, bob + FLOAT[(phase + 2) % 8] * 0.5)],
      [offset(legs[1][0], 0, bob), offset(legs[1][1], 0, bob + FLOAT[(phase + 3) % 8] * 0.5)],
    ];
    tail[1] = offset(tail[1], 0, FLOAT[(phase + 5) % 8]);
    tail[2] = offset(tail[2], 0, FLOAT[(phase + 3) % 8] * 1.5);
  } else if (pose === 'walk' || pose === 'run') {
    const sprint = pose === 'run';
    const steps = sprint ? RUN : WALK;
    const step = (sprint ? [0, 1, 0, -2, 0, 1, 0, -2] : [0, 0, 1, 0, -1, -2, -1, 0])[phase];
    hip = offset(hip, sprint ? -3 : 0, step);
    chest = offset(chest, sprint ? 7 : 1, step - 1);
    head = offset(head, sprint ? 10 : 1, sprint ? 4 + step * 0.5 : step);
    headPitch = sprint ? 8 : 0;
    const farStep = steps[(phase + 4) % 8];
    legs = [[offset(farStep[0], -3, 0), offset(farStep[1], -3, 0)], steps[phase]];
    const armSwing = [-1, 0, 2, 4, 5, 3, 1, -1][phase];
    hands = [[15 - armSwing, -15 + step], [8 + armSwing, -14 + step]];
    tail = [[-19, -10], [-36, -16 + step], [-49, -13 + FLOAT[(phase + 4) % 8]]];
    if (sprint) {
      hands = [[17 - 2 * armSwing, -15 + step], [9 + armSwing, -13 + step]];
      tail = [[-23, -16], [-39, -21 + step], [-54, -20 + FLOAT[(phase + 4) % 8]]];
    }
  } else {
    chest = offset(chest, 0, breath);
    head = offset(head, 0, breath);
    tail[1] = offset(tail[1], 0, FLOAT[(phase + 2) % 8]);
    tail[2] = offset(tail[2], 0, FLOAT[phase]);
  }

  if (pose === 'cast' || pose === 'windup') {
    const power = pose === 'windup' ? 0.32 + phase * 0.07 : CAST[phase];
    const recoil = pose === 'cast' && phase >= 2 ? 7 * power : -3 * power;
    chest = offset(chest, 4 * power, -1 * power);
    head = offset(head, recoil, -2 * power);
    hands = [offset(hands[0], -2 * power, -2 * power), offset(hands[1], -4 * power, 2 * power)];
    jaw = power * 6;
    headPitch -= 11 * power;
    flare = power;
  } else if (pose === 'dash') {
    const power = STRIKE[phase];
    hip = offset(hip, -4 * power, -1 * power);
    chest = offset(chest, 8 * power, 3 * power);
    head = offset(head, 13 * power, 6 * power);
    headPitch += 13 * power;
    hands = [offset(hands[0], -3 * power, 1 * power), offset(hands[1], -9 * power, 2 * power)];
    if (flight === 'none') legs = [RUN[(phase + 4) % 8], RUN[phase]];
    tail[2] = offset(tail[2], -4 * power, -5 * power);
    jaw = 1 + 2 * power;
  } else if (pose === 'punch' || pose === 'kick') {
    const power = STRIKE[phase];
    chest = offset(chest, 7 * power, (pose === 'kick' ? 5 : 2) * power);
    head = offset(head, 6 * power, 3 * power);
    headPitch += 9 * power;
    jaw = 3 * power;
    flare = 0.68 * power;
    if (pose === 'punch') {
      hands = [offset(hands[0], -3 * power, 0), offset(chest, 18 * power + 5, 2 + 6 * (1 - power))];
    } else {
      legs[1] = [offset(legs[1][0], 8 * power, -7 * power), offset(legs[1][1], 18 * power, -10 * power)];
      hands = [offset(hands[0], -3 * power, -4 * power), offset(hands[1], -5 * power, -2 * power)];
    }
  } else if (pose === 'hurt') {
    const recoil = RECOIL[phase];
    hip = offset(hip, -3 * recoil, 1.5 * recoil);
    chest = offset(chest, -7 * recoil, 3 * recoil);
    head = offset(head, -10 * recoil, recoil);
    headPitch -= 17 * recoil;
    hands = [offset(hands[0], -4 * recoil, 3 * recoil), offset(hands[1], 4 * recoil, -4 * recoil)];
    legs = [
      [offset(legs[0][0], -3 * recoil, 2 * recoil), legs[0][1]],
      [offset(legs[1][0], 2 * recoil, 2 * recoil), legs[1][1]],
    ];
    tail[1] = offset(tail[1], 0, -3 * recoil);
    tail[2] = offset(tail[2], 0, -6 * recoil);
    jaw = 2.5 * recoil;
    flare = 0.65 * recoil;
    closedEyes = phase < 2;
  } else if (pose === 'faint') {
    const collapse = COLLAPSE[phase];
    hip = lerp(hip, [-8, -12.5], collapse);
    chest = lerp(chest, [1, -14], collapse);
    head = lerp(head, [12, -13], collapse);
    headPitch += (25 - headPitch) * collapse;
    legs = [
      [lerp(legs[0][0], [-13, -5], collapse), lerp(legs[0][1], [-11, -3], collapse)],
      [lerp(legs[1][0], [3, -4], collapse), lerp(legs[1][1], [5, -3], collapse)],
    ];
    hands = [lerp(hands[0], [11, -5], collapse), lerp(hands[1], [5, -5], collapse)];
    tail = [lerp(tail[0], [-21, -4], collapse), lerp(tail[1], [-36, -3], collapse), lerp(tail[2], [-46, -2], collapse)];
    jaw = 1.8 * (1 - collapse);
    fold = collapse;
    closedEyes = true;
  } else if (pose === 'takeoff') {
    takeoff = LIFTOFF[phase];
    const push = [0.5, 1, 1, 0.72, 0.36, 0, 0, 0][phase];
    const tuck = [0, 0, 0.12, 0.35, 0.64, 0.87, 1, 1][phase];
    hip = offset(hip, -1.5 * push, -1.8 * push);
    chest = offset(chest, -1.5 * push, -3 * push);
    head = offset(head, -1.5 * push, -3 * push);
    headPitch -= 6 * push;
    legs = [
      [lerp([-12, -9], legs[0][0], tuck), lerp([-11, -3], legs[0][1], tuck)],
      [lerp([2, -7], legs[1][0], tuck), lerp([4, -3], legs[1][1], tuck)],
    ];
    hands = [offset(hands[0], 2 * push, -2 * push), offset(hands[1], -2 * push, -3 * push)];
    tail[1] = offset(tail[1], 0, 3 * push);
    tail[2] = offset(tail[2], 0, 5 * push);
  } else if (pose === 'air') {
    const float = FLOAT[phase];
    hip = offset(hip, -2, -1);
    chest = offset(chest, 2, -2);
    head = offset(head, 2, -2);
    legs = [[[-11, -11], [-13, -8]], [[4, -12], [3, -9]]];
    hands = [offset(hands[0], 3, -3), offset(hands[1], 4, -1)];
    tail[1] = offset(tail[1], 0, float - 3);
    tail[2] = offset(tail[2], 0, float * 1.5 - 6);
    flare = 0.7;
  } else if (pose === 'land') {
    const compression = LAND[phase];
    hip = offset(hip, 0, 3.3 * compression);
    chest = offset(chest, 4 * compression, 5 * compression);
    head = offset(head, 3.5 * compression, 5 * compression);
    legs = [
      [offset(legs[0][0], -3.5 * compression, 2.2 * compression), legs[0][1]],
      [offset(legs[1][0], 4.5 * compression, 2.5 * compression), legs[1][1]],
    ];
    hands = [offset(hands[0], 4 * compression, 3 * compression), offset(hands[1], 5 * compression, 2 * compression)];
    tail[1] = offset(tail[1], 0, -5 * compression);
    tail[2] = offset(tail[2], 0, -9 * compression);
    headPitch = 10 * compression;
    flare = 1.45 * BRAKE[phase];
  } else if (pose === 'toss') {
    const release = [1, 1, 0.88, 0.72, 0.51, 0.3, 0.13, 0][phase];
    chest = offset(chest, 5 * release, 4 * release);
    head = offset(head, 7 * release, 6 * release);
    headPitch += 19 * release;
    hands = [lerp(hands[0], [18, -7], release), lerp(hands[1], [14, -4], release)];
    tail[1] = offset(tail[1], -3 * release, -5 * release);
    tail[2] = offset(tail[2], -5 * release, -7 * release);
    jaw = 2 * release;
    flare = release;
  } else if (pose === 'grab') {
    const lift = STRIKE[phase];
    head = offset(head, 1, -4 * lift);
    headPitch -= 10 * lift;
    grip = [9, -21];
    hands = [offset(grip, 1, -3), offset(grip, -2, 2)];
    if (flight !== 'none') {
      legs = [
        [offset(legs[0][0], -1, 1), offset(legs[0][1], -2, 1)],
        [offset(legs[1][0], -1, -1), offset(legs[1][1], -3, -1)],
      ];
    }
    flare = lift * 0.7;
  } else if (pose === 'guard') {
    const set = GUARD[phase];
    hip = offset(hip, -2 * set, 1 * set);
    chest = offset(chest, -2 * set, 2 * set);
    head = offset(head, -5 * set, 5 * set);
    hands = [offset(head, 3, 8), offset(head, 6, 5)];
    headPitch += 11 * set;
  }

  return { hip, chest, head, headPitch, jaw, legs, hands, tail, flare, grip, takeoff, fold, closedEyes };
}

// Each wing follows three drawn joints. The trailing fingers flex through the
// downstroke and fold in during recovery, lagging the leading edge.
const HOVER_WING: readonly Wing[] = [
  [[-11, -26], [-37, -40], [-15, 2]], [[-10, -23], [-43, -29], [-15, 6]],
  [[-12, -15], [-52, -12], [-15, 12]], [[-16, -4], [-51, 9], [-14, 13]],
  [[-15, 5], [-44, 22], [-12, 15]], [[-10, -1], [-34, 20], [-10, 12]],
  [[-9, -12], [-34, 5], [-11, 6]], [[-11, -22], [-34, -21], [-13, 3]],
];
const CRUISE_WING: readonly Wing[] = [
  [[-15, -20], [-43, -31], [-18, -1]], [[-15, -18], [-47, -22], [-20, 2]],
  [[-19, -11], [-53, -10], [-21, 6]], [[-20, -4], [-54, 2], [-20, 7]],
  [[-20, 4], [-49, 15], [-17, 9]], [[-14, 2], [-39, 14], [-15, 8]],
  [[-12, -7], [-34, 4], [-14, 3]], [[-13, -15], [-38, -16], [-16, 0]],
];
const SPRINT_WING: readonly Wing[] = [
  [[-22, -14], [-56, -21], [-24, -1]], [[-23, -11], [-58, -13], [-25, 1]],
  [[-25, -7], [-60, -4], [-25, 4]], [[-26, -2], [-60, 5], [-25, 6]],
  [[-23, 2], [-55, 11], [-22, 8]], [[-19, 2], [-49, 9], [-20, 7]],
  [[-16, -5], [-43, 2], [-19, 4]], [[-19, -10], [-49, -11], [-22, 1]],
];
const FLY_WINGS = [HOVER_WING, CRUISE_WING, SPRINT_WING] as const;

function wing(pen: Pen, pose: Pose, flight: Flight, phase: number, far: boolean, mega: boolean, glide: number): void {
  const origin = offset(pose.chest, far ? 0 : -4, far ? -2 : -1);
  const f = pose.flare;
  const lift = flight === 'none' ? FLOAT[phase] : 0;
  const segment = Math.min(1, Math.floor(glide));
  const blend = glide - segment;
  const key = far ? (phase + 7) % 8 : phase;
  const from = FLY_WINGS[segment][key];
  const to = FLY_WINGS[segment + 1][key];
  let regular: Wing = flight === 'none'
    ? [[-9, -13 - f * 7 + lift], [-29 - 12 * f, 3 - f * 13 + lift], [-8, 4 + f * 3]]
    : [lerp(from[0], to[0], blend), lerp(from[1], to[1], blend), lerp(from[2], to[2], blend)];
  if (pose.fold) {
    regular = [
      lerp(regular[0], [-8, -12], pose.fold),
      lerp(regular[1], [-25, 2], pose.fold),
      lerp(regular[2], [-7, 4], pose.fold),
    ];
  }
  const [a, b, c]: Wing = pose.takeoff === undefined ? regular
    : [
      lerp([-10, -20], [-15, 5], pose.takeoff),
      lerp([-37, -31], [-44, 22], pose.takeoff),
      lerp([-14, 2], [-12, 15], pose.takeoff),
    ];
  const rear = (p: Pt): Pt => far ? offset(p, -p[0] * 0.33 + 1, -4 - p[1] * 0.12) : p;
  const wrist = add(origin, rear(a));
  const tip = add(origin, rear(b));
  const trailing = add(origin, rear(c));
  const mid = lerp(tip, trailing, 0.55), inner = lerp(tip, trailing, 0.82);
  const span = (wingT: number, wristT: number): Pt => lerp(lerp(tip, trailing, wingT), wrist, wristT);
  const lowerTip = offset(mid, -2, mega ? 8 : 4);
  const innerTip = offset(inner, 0, mega ? 8 : 4);
  const rib = far ? FAR_RIB : NEAR_RIB;
  const membrane = far ? FAR_MEMBRANE : MEMBRANE;
  const leading = offset(lerp(wrist, tip, 0.45), 0, -2);
  const point1 = span(0.23, mega ? 0.36 : 0.19);
  const point2 = span(0.42, mega ? 0.18 : 0.15);
  const point3 = span(0.69, mega ? 0.32 : 0.26);
  const point4 = span(0.77, 0.2);
  pen.poly([origin, offset(wrist, 1, -3), leading, tip, point1, point2, lowerTip, point3, point4, innerTip, trailing], membrane);
  if (mega) {
    pen.poly([lerp(wrist, tip, 0.25), offset(leading, 1, 2), lerp(tip, point1, 0.12),
      span(0.12, 0.45), span(0.47, 0.44), span(0.29, 0.62), lerp(wrist, trailing, 0.3)], far ? MEMBRANE : LIGHT);
    pen.poly([lerp(wrist, lowerTip, 0.33), lerp(wrist, lowerTip, 0.65), offset(lowerTip, 1, -3),
      span(0.64, 0.3), span(0.53, 0.47)], far ? MEMBRANE : LIGHT);
    pen.poly([lerp(wrist, innerTip, 0.47), lerp(wrist, innerTip, 0.8), span(0.87, 0.31),
      span(0.81, 0.45)], far ? MEMBRANE : LIGHT);
  }
  pen.stroke([origin, offset(lerp(origin, wrist, 0.6), -1, 0), wrist, leading, tip], rib, 2);
  pen.stroke([wrist, offset(lerp(wrist, lowerTip, 0.57), -1, 0), lowerTip], rib);
  pen.stroke([offset(wrist, 1, 1), offset(lerp(wrist, innerTip, 0.61), -1, 0), innerTip], rib);
  pen.line(trailing[0], trailing[1], origin[0], origin[1], rib);
  if (!far) {
    const top = offset(lerp(wrist, leading, 0.45), 0, -1);
    pen.line(wrist[0] + 1, wrist[1] - 1, top[0], top[1], mega ? NEAR_RIB : LIGHT);
  }
}

function leg(pen: Pen, root: Pt, [knee, ankle]: Limb, near: boolean, flight: Flight, mega: boolean, glide: number): void {
  const mat = near ? SKIN : SHADE;
  tapered(pen, [offset(root, 1, -3), lerp(root, knee, 0.45), knee, ankle], near ? [4.7, 5.5, 3.3, 1.9] : [3.1, 4.1, 2.7, 1.65], mat);
  const feetPitch = flight === 'none' ? 0 : 0.32 - Math.min(1, glide) * 0.7;
  const foot = (x: number, y: number): Pt => offset(ankle, x, y + x * feetPitch);
  pen.poly([foot(-2, -2), foot(1, -2.5), foot(4, -1.9), foot(7, 0), foot(6, 1.9), foot(-2, 1.9), foot(-3, 0)], mat);
  pen.poly([foot(3, -0.9), foot(6, -0.9), foot(8, 0.7), foot(6, 1.9), foot(4, 0.8), foot(2, 1.9)], CLAW);
  if (near) {
    pen.poly([offset(root, -2, -3), offset(lerp(root, knee, 0.5), -2, 0), offset(knee, -2, 1),
      offset(lerp(root, knee, 0.5), 0, 1), offset(root, 1, -3)], mega ? NEAR_RIB : LIGHT);
  }
}

function arm(pen: Pen, root: Pt, hand: Pt, near: boolean, clamped: boolean): void {
  const elbow = offset(lerp(root, hand, 0.56), -2.4, 1.4);
  tapered(pen, [root, elbow, hand], near ? [2.9, 2, 1.35] : [2.4, 1.8, 1.2], near ? SKIN : SHADE);
  pen.poly([offset(hand, -1, -2), offset(hand, 2, -1), offset(hand, 3, 1), offset(hand, 1, 3), offset(hand, -2, 1)], near ? SKIN : SHADE);
  if (clamped) {
    pen.poly([offset(hand, 1, 0), offset(hand, 3, 0), offset(hand, 3, 2), offset(hand, 0, 2)], CLAW);
  } else {
    pen.poly([offset(hand, 1, 0), offset(hand, 4, 2), offset(hand, 3, 3), offset(hand, 1, 2), offset(hand, 0, 3), offset(hand, -1, 2)], CLAW);
  }
}

function torso(pen: Pen, pose: Pose, mega: boolean): Pt {
  const { hip, chest, head } = pose;
  const bellyNormal = normal(hip, chest);
  const b = (u: number, v: number): Pt => across(lerp(hip, chest, u), bellyNormal, v);
  pen.poly([b(-0.51, 0), b(-0.37, -6.3), b(0.03, -8.8), b(0.58, -7.4), b(1.07, -5.1),
    b(1.18, 0.9), b(1.13, 6.2), b(0.8, 9.7), b(0.35, 11.4), b(-0.07, 11.3), b(-0.41, 6.5)], SKIN);
  pen.poly([b(-0.39, 5.3), b(-0.18, 1.8), b(0.22, 1.1), b(0.72, 2.5), b(1.09, 2.9),
    b(1.13, 6.2), b(0.8, 9.5), b(0.36, 11), b(-0.08, 11), b(-0.36, 7)], BELLY);
  pen.poly([b(-0.31, -5), b(0.1, -7.3), b(0.63, -6), b(0.91, -4.7), b(0.57, -4.7), b(0.08, -6)], mega ? NEAR_RIB : LIGHT);
  const neckTop = offset(head, -5, 3);
  const throat = offset(lerp(chest, neckTop, 0.58), 0, -1.5);
  tapered(pen, [chest, throat, neckTop], [5.6, 4.6, 4.5], SKIN);
  const nn = normal(chest, neckTop);
  pen.poly([across(chest, bellyNormal, 2.8), across(throat, nn, 1.6), across(neckTop, nn, 2.8),
    across(neckTop, nn, 4.4), across(throat, nn, 4.4), across(chest, bellyNormal, 5.8)], BELLY);
  if (mega) {
    for (const t of [0, 0.24, 0.48, 0.71, 0.94]) {
      pen.stroke([b(t - 0.08, 3), b(t, 5.3), b(t + 0.01, 7.5)], NEAR_RIB);
    }
    for (const t of [0.35, 0.64, 0.92]) {
      const p = lerp(chest, neckTop, t);
      const n = across(p, nn, -3.1);
      pen.poly([offset(n, -3, 1), offset(n, -6, -5), offset(n, -0.5, -3), offset(n, 2, -1)], SHADE);
    }
  }
  return b(0.7, -6.5);
}

function dragonHead(pen: Pen, pose: Pose, phase: number, mega: boolean): Pt {
  const angle = pose.headPitch * Math.PI / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const at = (x: number, y: number): Pt => offset(pose.head, x * cos - y * sin, x * sin + y * cos);
  const poly = (points: readonly Pt[], mat: number): void => pen.poly(points.map(([x, y]) => at(x, y)), mat);
  const line = (points: readonly Pt[], mat: number): void => pen.stroke(points.map(([x, y]) => at(x, y)), mat);
  const jaw = pose.jaw;
  poly([[0, 0], [-4, -4], [-9, mega ? -15 : -12], [-7, -10], [-1, -6], [3, -2]], SHADE);
  poly([[-6, 1], [-10, -3], [-15, mega ? -13 : -9], [-11, -8], [-5, -6], [-1, -2], [0, 1]], SKIN);
  if (mega) {
    poly([[-11, -8], [-15, -13], [-11, -10], [-7, -7]], LIGHT);
    poly([[-7, -9], [-9, -15], [-6, -10], [-4, -8]], LIGHT);
  }
  poly([[-5, 1], [1, 4], [7, 4 + jaw], [12, 5 + jaw], [11, 7 + jaw], [6, 8 + jaw], [-1, 7 + jaw * 0.32], [-6, 6]], SKIN);
  poly([[-2, 4], [5, 4 + jaw * 0.68], [12, 4.5 + jaw], [10, 6 + jaw], [6, 6 + jaw], [0, 5 + jaw * 0.34]], jaw > 2 ? MOUTH : LINE);
  poly([[-7, 5], [-7, -0.3], [-5, -4.8], [0, -5.3], [3.4, -3.5], [6.3, -0.7],
    [10, 0.2], [13, 1.4], [14, 3.4], [12.3, 5.1], [7.5, 4.8], [3.8, 3.8], [-0.1, 5.6], [-4, 7]], SKIN);
  if (mega) {
    poly([[-8, 3], [-11, 0], [-10, 5], [-6, 7], [-4, 4]], SHADE);
    poly([[4, -3], [8, -1], [8, 1], [2, -0.6]], NEAR_RIB);
  }
  poly([[-5, -2.5], [-2, -4.4], [1, -3.9], [3, -2.4], [-1.5, -3]], mega ? NEAR_RIB : LIGHT);
  if (pose.closedEyes || phase === 6 && jaw < 1) {
    line([[-2, -0.8], [0.6, -0.6], [3, 0.5]], LINE);
  } else {
    poly([[-1.9, -1.9], [1.2, -1.25], [4.4, 1.3], [1.2, 1.7], [-1.2, 0.4]], LINE);
    poly([[-1.2, -1.2], [1.3, -0.45], [3.6, 1.05], [0.8, 1.1], [-0.9, 0]], CLAW);
    pen.set(...at(1.4, 0.25), EYE);
    pen.set(...at(2.1, 0.3), LINE);
  }
  line([[10.5, 1.9], [12, 2.1]], LINE);
  line([[0, 3.2], [3.1, 4.5], [9.1, 5.1], [11.5, 4.9]], LINE);
  if (jaw > 1) {
    poly([[7.2, 4.6], [9.2, 4.8], [8.2, 6.8]], CLAW);
    poly([[10.2, 4.8], [12.2, 4.8], [11.1, 6.5]], CLAW);
  }
  return at(13, 4.7 + jaw * 0.42);
}

/** Articulated pixel cels. Coordinates are authored at the scale of the arena. */
export function bakeCharizardRig(
  rank: 2 | 3, pose: PokemonPose, phase: number, flight: Flight, wingPhase: number, flightBlend: number = FLIGHT_LEVEL[flight],
): ReferenceFrame {
  phase = ((Math.floor(phase) % 8) + 8) % 8;
  wingPhase = ((Math.floor(wingPhase) % 8) + 8) % 8;
  const glide = Math.max(0, Math.min(2, flightBlend));
  const mega = rank === 3;
  const scale = mega ? 1.25 : 1;
  const raster = new Raster(164, 126);
  const pen = new ScaledPen(raster, [0, 0], ORIGIN, scale);
  const body = bodyPose(pose, phase, flight, glide);
  const { hip, chest, tail, legs, hands } = body;
  const tailRoot = offset(hip, -3, -1);
  const clamped = pose === 'grab';
  const legFlight = pose === 'takeoff' && phase < 3 ? 'none' : flight;

  wing(pen, body, flight, wingPhase, true, mega, glide);
  leg(pen, offset(hip, 3, 0), legs[0], false, legFlight, mega, glide);
  arm(pen, offset(chest, 3, 3), hands[0], false, clamped);
  tapered(pen, [tailRoot, ...tail], [5.3, 4.3, 2.6, 0.9], SKIN);
  tapered(pen, [offset(tailRoot, 0, 3.5), offset(tail[0], 0, 2.7), offset(tail[1], 0, 1.4), tail[2]],
    [1.3, 1.6, 1, 0.3], BELLY);
  if (mega) {
    for (const [a, b, t] of [[tailRoot, tail[0], 0.6], [tail[0], tail[1], 0.34], [tail[0], tail[1], 0.8]] as const) {
      const p = lerp(a, b, t);
      pen.poly([offset(p, -5, -2), offset(p, -6, -6), offset(p, 1, -3), offset(p, 3, -1)], SHADE);
    }
  }
  wing(pen, body, flight, wingPhase, false, mega, glide);
  const saddle = torso(pen, body, mega);
  leg(pen, offset(hip, -1, 1), legs[1], true, legFlight, mega, glide);
  arm(pen, offset(chest, 1, 2), hands[1], true, clamped);
  const muzzle = dragonHead(pen, body, phase, mega);

  const point = (p: Pt): Pt => [Math.round(p[0] * scale), Math.round(p[1] * scale)];
  return {
    sprite: bake(raster, mega ? MEGA : ORANGE, mega ? 0x111522 : 0x301d25, false),
    originX: ORIGIN[0],
    originY: ORIGIN[1],
    saddle: point(offset(saddle, 0, -1)),
    ...(body.grip ? { grip: point(body.grip) } : {}),
    fire: { tail: point(tail[2]), size: mega ? 16 : 8, muzzle: point(muzzle) },
  };
}
