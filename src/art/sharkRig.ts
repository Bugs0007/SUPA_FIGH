import { bake, Raster, ScaledPen, type Material, type Pen, type Pt } from './pixelRaster';
import type { PokemonFlight, PokemonPose } from './pokemonArt';
import type { ReferenceFrame } from './pokemonSpriteMotion';

const ORIGIN: Pt = [84, 82];
const flat = (c: number): Material => ({ dark: c, base: c, light: c, hi: c });
const SKIN = 1, SHADE = 2, LIGHT = 3, CREAM = 4, RED = 5, WHITE = 6, INK = 7, EYE = 8, FAR = 9;
const PALETTES = [
  [0x54829a, 0x35596f, 0x79a7b8, 0xe7dfb3, 0xa93e4a, 0xf3f0d8, 0x202735, 0xe5d581, 0x3c667d],
  [0x49778e, 0x304e66, 0x7098aa, 0xe7e0b7, 0xa64950, 0xf4f0db, 0x202735, 0xdfce77, 0x375b71],
  [0x384663, 0x252f49, 0x59617e, 0xe7dfb9, 0xb14e55, 0xf4efdc, 0x171d30, 0xe1cf79, 0x2b3750],
  [0x303b56, 0x202a40, 0x4d5970, 0xdcd5af, 0xa8434f, 0xf1ebd7, 0x161d2b, 0xe2be6b, 0x26314b],
] as const;
const CYCLE = [0, 0.7, 1, 0.7, 0, -0.7, -1, -0.7];
const LIFT = [0, 0, 0, 2, 5, 4, 2, 0];
const RECOVER = [1, 1, 0.87, 0.66, 0.43, 0.24, 0.09, 0];
const CAST = [0.1, 0.45, 1, 1, 0.8, 0.5, 0.2, 0];
const COLLAPSE = [0, 0.12, 0.3, 0.57, 0.8, 0.96, 1, 1];
const LEVEL = { none: 0, hover: 0, cruise: 1, sprint: 2 } as const;
const offset = (p: Pt, x: number, y: number): Pt => [p[0] + x, p[1] + y];
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const normal = (a: Pt, b: Pt): Pt => {
  const x = b[0] - a[0], y = b[1] - a[1], length = Math.hypot(x, y) || 1;
  return [-y / length, x / length];
};
const across = (p: Pt, n: Pt, d: number): Pt => offset(p, n[0] * d, n[1] * d);

interface SharkPose {
  hip: Pt; chest: Pt; head: Pt;
  feet: readonly [Pt, Pt]; hands: readonly [Pt, Pt];
  tail: readonly [Pt, Pt, Pt]; fin: number; closed: boolean;
}

const AIR_POSES: readonly SharkPose[] = [
  { hip: [-4, -17], chest: [0, -29], head: [8, -39], feet: [[-8, -6], [5, -8]], hands: [[-9, -19], [14, -19]],
    tail: [[-16, -13], [-29, -18], [-37, -19]], fin: 0, closed: false },
  { hip: [-12, -20], chest: [5, -26], head: [22, -27], feet: [[-24, -15], [-16, -10]], hands: [[-9, -22], [8, -18]],
    tail: [[-29, -23], [-41, -24], [-52, -24]], fin: 1, closed: false },
  { hip: [-17, -21], chest: [9, -25], head: [30, -26], feet: [[-33, -20], [-27, -16]], hands: [[-18, -23], [-5, -19]],
    tail: [[-34, -24], [-48, -25], [-60, -25]], fin: 2, closed: false },
];

function flightPose(blend: number): SharkPose {
  const segment = Math.min(1, Math.floor(blend));
  const t = blend - segment;
  const a = AIR_POSES[segment], b = AIR_POSES[segment + 1];
  return {
    hip: lerp(a.hip, b.hip, t), chest: lerp(a.chest, b.chest, t), head: lerp(a.head, b.head, t),
    feet: [lerp(a.feet[0], b.feet[0], t), lerp(a.feet[1], b.feet[1], t)],
    hands: [lerp(a.hands[0], b.hands[0], t), lerp(a.hands[1], b.hands[1], t)],
    tail: [lerp(a.tail[0], b.tail[0], t), lerp(a.tail[1], b.tail[1], t), lerp(a.tail[2], b.tail[2], t)],
    fin: blend, closed: false,
  };
}

function poseFor(rank: number, pose: PokemonPose, phase: number, flight: PokemonFlight, blend: number, finPhase: number): SharkPose {
  const baby = rank === 0;
  const middle = rank === 1;
  const h = baby ? 0 : middle ? 10 : 20;
  let hip: Pt = baby ? [-3, -6] : [-3, -11 - h * 0.12];
  let chest: Pt = baby ? [0, -10] : [0, -13 - h * 0.55];
  let head: Pt = [baby ? 3 : 6, baby ? -14 : -19 - h * 0.75];
  let feet: [Pt, Pt] = [[-6, -2], [4, -2]];
  let hands: [Pt, Pt] = [offset(chest, 1, rank >= 2 ? 12 : 7), offset(chest, rank >= 2 ? 9 : 7, rank >= 2 ? 13 : 7)];
  let tail: [Pt, Pt, Pt] = [offset(hip, -9, 1), offset(hip, -20, -1), offset(hip, -27, -5)];
  let fin = 0;
  let closed = pose === 'idle' && phase === 7;
  const power = RECOVER[phase];
  if (flight !== 'none' && rank >= 2) {
    const air = flightPose(blend);
    const bob = CYCLE[finPhase] * (1.2 - blend * 0.3);
    hip = offset(air.hip, 0, bob * 0.7);
    chest = offset(air.chest, 0, bob);
    head = offset(air.head, 0, bob * 0.7);
    feet = [offset(air.feet[0], 0, bob), offset(air.feet[1], 0, bob)];
    hands = [offset(air.hands[0], 0, CYCLE[finPhase] * 2), offset(air.hands[1], 0, CYCLE[(finPhase + 4) & 7] * 2)];
    tail = [air.tail[0], offset(air.tail[1], 0, CYCLE[(finPhase + 2) & 7]), offset(air.tail[2], 0, CYCLE[(finPhase + 4) & 7] * 2)];
    fin = air.fin;
  } else if (pose === 'walk' || pose === 'run') {
    const sprint = pose === 'run';
    const stride = sprint ? baby ? 5 : 9 : baby ? 3 : 5;
    const bob = sprint ? [0, -1, -2, -1, 0, -1, -2, -1][phase] : [0, 0, -1, -1, 0, 0, -1, -1][phase];
    hip = offset(hip, sprint ? -3 : 0, bob);
    chest = offset(chest, sprint ? 6 : 1, bob + (sprint ? 2 : 0));
    head = offset(head, sprint ? 11 : 1, bob + (sprint ? 5 : 0));
    feet = [[-5 + CYCLE[phase] * stride, -2 - LIFT[phase]], [4 - CYCLE[phase] * stride, -2 - LIFT[(phase + 4) & 7]]];
    hands = [offset(chest, 2 - CYCLE[phase] * 4, 7), offset(chest, 6 + CYCLE[phase] * 5, 6)];
    tail = [offset(hip, -10, -1), offset(hip, -21, -5 + CYCLE[phase]), offset(hip, -29, -8 + CYCLE[(phase + 2) & 7] * 2)];
  } else tail[2] = offset(tail[2], 0, CYCLE[phase]);

  if (pose === 'cast') {
    const charge = CAST[phase];
    const recoil = [-2,-4,6,5,-1,-0.5,-0.2,0][phase];
    chest = offset(chest, recoil * 0.45, charge);
    head = offset(head, recoil, -2 * charge);
    hands = [offset(hands[0], -2 * charge, -2 * charge), offset(hands[1], -3 * charge, -3 * charge)];
    tail[1] = offset(tail[1], -2 * charge, -2 * charge);
    tail[2] = offset(tail[2], -3 * charge, -4 * charge);
    if (flight === 'none') feet = [[-8, -2], [6, -2]];
  } else if (pose === 'punch') {
    chest = offset(chest, 5 * power, power);
    head = offset(head, 5 * power, power);
    hands = [offset(hands[0], -3 * power, -2 * power), offset(chest, 8 + 15 * power, 1)];
    tail[2] = offset(tail[2], 0, -4 * power);
  } else if (pose === 'backhand') {
    chest = offset(chest, 2 * power, -2 * power);
    head = offset(head, 4 * power, -power);
    hands = [offset(chest, 7 + 16 * power, -4 * power), offset(hands[1], -7 * power, 2 * power)];
    tail[1] = offset(tail[1], 4 * power, -4 * power);
    tail[2] = offset(tail[2], 9 * power, -7 * power);
  } else if (pose === 'kick') {
    chest = offset(chest, -2 * power, -power);
    head = offset(head, -2 * power, -power);
    feet[1] = offset(feet[1], 18 * power, -12 * power);
    hands = [offset(hands[0], -3 * power, -3 * power), offset(hands[1], -4 * power, -4 * power)];
  } else if (pose === 'guard' || pose === 'windup') {
    hip = offset(hip, -2, 1);
    chest = offset(chest, -3, 2);
    head = offset(head, -4, 3);
    hands = [offset(head, 0, 7), offset(head, 7, 6)];
  } else if (pose === 'dash') {
    chest = offset(chest, 7 * power, 3 * power);
    head = offset(head, 12 * power, 5 * power);
    hands = [offset(chest, -5, 1), offset(chest, 10, 2)];
    if (flight === 'none') feet = [[-9, -4 - LIFT[phase]], [-2, -3 - LIFT[(phase + 4) & 7]]];
    tail[2] = offset(tail[2], -4 * power, -3 * power);
  } else if (pose === 'takeoff' && flight !== 'none' && rank >= 2) {
    const tuck = [0, 0.1, 0.28, 0.52, 0.76, 0.91, 1, 1][phase];
    const load = [0.6, 1, 0.8, 0.45, 0.2, 0, 0, 0][phase];
    feet = [lerp([-6, -2], feet[0], tuck), lerp([4, -2], feet[1], tuck)];
    hip = offset(hip, 0, -load);
    chest = offset(chest, 0, -2 * load);
    head = offset(head, 0, -2 * load);
  } else if (pose === 'cling' || pose === 'air' || pose === 'takeoff') {
    feet = [offset(hip, -3, 2), offset(hip, 4, 3)];
    hands = pose === 'cling' ? [offset(head, 4, 5), offset(head, 7, 7)] : [offset(chest, 4, 1), offset(chest, 8, 2)];
  } else if (pose === 'land') {
    hip = offset(hip, 0, 3 * power);
    chest = offset(chest, 3 * power, 5 * power);
    head = offset(head, 4 * power, 5 * power);
    feet = [[-8, -2], [6, -2]];
    hands = [offset(chest, 4, 7), offset(chest, 8, 6)];
  } else if (pose === 'hurt') {
    chest = offset(chest, -6 * power, 3 * power);
    head = offset(head, -7 * power, 4 * power);
    hands = [offset(chest, 1, 3), offset(chest, 6, 3)];
    closed = power > 0.4;
  } else if (pose === 'faint') {
    const fall = COLLAPSE[phase];
    hip = offset(hip, -2 * fall, (baby ? 2 : 8) * fall);
    chest = offset(chest, 5 * fall, (baby ? 5 : 9 + h * 0.55) * fall);
    head = offset(head, 10 * fall, (baby ? 8 : 14 + h * 0.75) * fall);
    feet = [[-6, -2], [0, -2]];
    hands = [[8, -2], [13, -2]];
    tail[1] = offset(tail[1], 0, -3 * fall);
    tail[2] = offset(tail[2], 0, -4 * fall);
    closed = true;
  }
  return { hip, chest, head, feet, hands, tail, fin, closed };
}

function leg(p: Pen, hip: Pt, foot: Pt, near: boolean, rank: number): void {
  const knee: Pt = [(hip[0] + foot[0]) * 0.5 - 2, (hip[1] + foot[1]) * 0.5 - 1];
  p.stroke([hip, knee], near ? SKIN : FAR, rank < 2 ? 3.5 : 5);
  p.stroke([knee, foot], near ? SKIN : FAR, rank < 2 ? 3 : 4);
  p.line(foot[0] - 2, foot[1], foot[0] + 4, foot[1], near ? SKIN : FAR, 2);
  p.line(foot[0] + 3, foot[1] - 1, foot[0] + 5, foot[1], WHITE);
  if (rank === 3) p.poly([offset(knee, -2, 0), offset(knee, -5, -3), offset(knee, 1, -2)], SHADE);
}

function arm(p: Pen, shoulder: Pt, wrist: Pt, near: boolean, rank: number, fin: number, phase: number): void {
  const elbow: Pt = [(shoulder[0] + wrist[0]) * 0.5 - 1, (shoulder[1] + wrist[1]) * 0.5 + 2];
  p.stroke([shoulder, elbow, wrist], near ? SKIN : FAR, rank < 2 ? 3 : 4);
  const swing = CYCLE[phase] * (fin ? 1.7 : 0.6);
  if (rank === 3) {
    p.poly([offset(elbow, -2, -1), offset(wrist, -1, -4), offset(wrist, 7, -1), offset(wrist, 7, 4),
      offset(wrist, 4, 10 + swing), offset(wrist, -1, 15 + swing), offset(wrist, 1, 7 + swing), offset(wrist, 1, 2)], SHADE);
    p.poly([offset(wrist, 1, -1), offset(wrist, 5, 0), offset(wrist, 5, 5 + swing), offset(wrist, 0, 11 + swing),
      offset(wrist, 2, 4 + swing)], RED);
  } else {
    const point = offset(elbow, -(rank >= 2 ? 12 : 5) - fin * 2, 5 + swing);
    p.poly([offset(elbow, -1, -2), point, offset(wrist, -1, 1), offset(wrist, 1, -1)], near ? SKIN : FAR);
    p.line(point[0] + 1, point[1] - 1, elbow[0] - 1, elbow[1], LIGHT);
    p.line(wrist[0] - 1, wrist[1], wrist[0] + 2, wrist[1], WHITE, 2);
  }
}

function sharkHead(p: Pen, head: Pt, rank: number, closed: boolean, pose: PokemonPose, phase: number): Pt {
  const baby = rank === 0;
  const jaw = pose === 'cast' ? CAST[phase] * (baby ? 3 : 4) : pose === 'punch' || pose === 'dash' ? 1 : 0;
  if (!baby) {
    // The paired head pods and low helmet ridge distinguish the hammerhead line.
    p.poly([offset(head, -11, -4), offset(head, -16, -6), offset(head, -18, -3), offset(head, -14, 0), offset(head, -9, -1)], FAR);
    p.poly([offset(head, -13, -3), offset(head, -10, -7), offset(head, -4, -9), offset(head, 2, -8),
      offset(head, 5, -5), offset(head, 10, -3), offset(head, 14, 0), offset(head, 15, 2),
      offset(head, 12, 5 + jaw), offset(head, 5, 7 + jaw * 0.4), offset(head, -5, 5), offset(head, -10, 1)], SKIN);
    p.ellipse(head[0] - 7, head[1] - 5, 5, 3, SHADE);
    p.line(head[0] - 10, head[1] - 6, head[0] - 5, head[1] - 7, LIGHT);
    p.poly([offset(head, -3, -7), offset(head, 0, -10), offset(head, 4, -5), offset(head, 3, -3)], SKIN);
    p.poly([offset(head, -3, 4), offset(head, 5, 3), offset(head, 14, 2), offset(head, 12, 5 + jaw),
      offset(head, 5, 7 + jaw * 0.4), offset(head, -3, 6)], CREAM);
    p.line(head[0] + 2, head[1] + 4, head[0] + 13, head[1] + 3, INK);
    if (jaw > 0.8) p.poly([offset(head, 2, 4), offset(head, 13, 3), offset(head, 11, 4 + jaw), offset(head, 5, 5 + jaw)], INK);
    p.poly([offset(head, 8, 3), offset(head, 10, 3), offset(head, 8, 5.5)], WHITE);
    if (closed) p.line(head[0] + 3, head[1] - 1, head[0] + 8, head[1], INK);
    else {
      p.poly([offset(head, 1, -3), offset(head, 9, -1), offset(head, 6, 2), offset(head, 2, 0)], INK);
      p.poly([offset(head, 2, -2), offset(head, 8, -1), offset(head, 5, 1), offset(head, 3, 0)], EYE);
      p.set(head[0] + 6, head[1], INK);
      p.set(head[0] + 3, head[1] - 1, WHITE);
    }
    p.set(head[0] + 14, head[1] + 1, INK);
    if (rank === 3) {
      p.poly([offset(head, -10, -4), offset(head, -14, -10), offset(head, -6, -6), offset(head, -3, -3)], SHADE);
      p.poly([offset(head, -1, -7), offset(head, 0, -13), offset(head, 5, -7), offset(head, 5, -4)], SHADE);
    }
    return offset(head, 14, 4 + jaw * 0.4);
  }
  p.poly([offset(head, -7, -3), offset(head, -11, -4), offset(head, -10, -8), offset(head, -4, -10),
    offset(head, 2, -8), offset(head, 4, -3)], FAR);
  p.poly([offset(head, -5, -5), offset(head, -3, -12), offset(head, 2, -13), offset(head, 5, -8), offset(head, 3, -2)], SKIN);
  p.line(head[0] - 2, head[1] - 10, head[0] + 1, head[1] - 11, LIGHT);
  p.poly([offset(head, -7, -3), offset(head, -4, -6), offset(head, 4, -5), offset(head, 9, -2),
    offset(head, 13, 0), offset(head, 12, 4 + jaw), offset(head, 7, 7 + jaw * 0.6), offset(head, -2, 7),
    offset(head, -7, 3)], SKIN);
  p.poly([offset(head, -6, -2), offset(head, -9, -5), offset(head, -15, -4), offset(head, -16, -1),
    offset(head, -13, 2), offset(head, -7, 1)], SKIN);
  p.ellipse(head[0] - 13, head[1] - 1, 2.4, 1.6, SHADE);
  p.line(head[0] - 15, head[1] - 2, head[0] - 12, head[1] - 3, LIGHT);
  p.poly([offset(head, -2, 3), offset(head, 5, 4), offset(head, 12, 1), offset(head, 10, 4 + jaw),
    offset(head, 6, 6 + jaw), offset(head, 0, 5 + jaw)], INK);
  p.poly([offset(head, 0, 4), offset(head, 3, 4), offset(head, 2, 7)], WHITE);
  p.poly([offset(head, 7, 3), offset(head, 10, 2), offset(head, 8, 6)], WHITE);
  if (closed) p.line(head[0] + 2, head[1] - 2, head[0] + 6, head[1] - 1, INK);
  else {
    p.poly([offset(head, -1, -3), offset(head, 6, -2), offset(head, 4, 1), offset(head, 1, 0)], INK);
    p.poly([offset(head, 0, -2), offset(head, 5, -1), offset(head, 3, 0), offset(head, 1, 0)], EYE);
    p.set(head[0] + 3, head[1] - 1, INK);
    p.set(head[0] + 1, head[1] - 2, WHITE);
  }
  return offset(head, 12, 3 + jaw * 0.6);
}

/** Shark fins, limbs and tail have their own posed joints in grounded and gliding modes. */
export function bakeSharkRig(
  rank: number, pose: PokemonPose, phase: number, flight: PokemonFlight, wingPhase: number,
  flightBlend: number = LEVEL[flight],
): ReferenceFrame {
  rank = Math.max(0, Math.min(3, rank));
  phase &= 7;
  wingPhase &= 7;
  const blend = Math.max(0, Math.min(2, flightBlend));
  const scale = rank === 0 ? 0.65 : rank === 1 ? 0.85 : rank === 3 ? 1.18 : 1;
  const r = new Raster(180, 100);
  const p = new ScaledPen(r, [0, 0], ORIGIN, scale);
  const body = poseFor(rank, pose, phase, flight, blend, wingPhase);
  const { hip, chest, head, feet, hands } = body;
  const babyTail = (point: Pt): Pt => rank === 0 ? [hip[0] + (point[0] - hip[0]) * 0.5, hip[1] + (point[1] - hip[1]) * 0.7] : point;
  const tail: readonly [Pt, Pt, Pt] = [babyTail(body.tail[0]), babyTail(body.tail[1]), babyTail(body.tail[2])];
  const near = normal(hip, chest);
  const b = (t: number, x: number): Pt => across(lerp(hip, chest, t), near, x * (rank >= 2 ? 1.3 : 1));
  const baby = rank === 0;
  leg(p, offset(hip, 3, 1), feet[0], false, rank);
  arm(p, offset(chest, 1, 2), hands[0], false, rank, body.fin, wingPhase);
  p.stroke([offset(hip, -3, 0), tail[0], tail[1], tail[2]], SHADE, baby ? 4 : 6);
  p.stroke([offset(hip, -4, -1), offset(tail[0], 0, -1), offset(tail[1], 0, -1), tail[2]], SKIN, baby ? 2 : 4);
  p.poly([tail[2], offset(tail[2], -5, -4), offset(tail[2], 0, -13), offset(tail[2], 5, -4),
    offset(tail[2], 5, 3), offset(tail[2], -2, 6)], SKIN);
  p.line(tail[1][0], tail[1][1] - 2, tail[2][0] + 1, tail[2][1] - 3, LIGHT);
  if (rank === 3) {
    for (const [a, z] of [[tail[0], tail[1]], [tail[1], tail[2]]] as const) {
      const at = lerp(a, z, 0.5);
      p.poly([offset(at, -4, 0), offset(at, -5, -7), offset(at, 2, -2), offset(at, 4, 1)], SHADE);
    }
  }
  // Dorsal fin comes from the back, behind the chest and head.
  p.poly([b(0.2, -4), b(0.65, -14), b(1.3, -7), b(0.8, -3)], SHADE);
  p.line(...b(0.65, -12), ...b(1.25, -6), LIGHT);
  p.poly([b(-0.4, 0), b(-0.22, -6), b(0.45, -6.5), b(1.05, -4.7), b(1.12, 3),
    b(0.65, 8.5), b(-0.05, 8), b(-0.4, 4)], SKIN);
  p.poly([b(-0.2, 3), b(0.25, 0.6), b(0.9, 0.8), b(1.1, 4), b(0.7, 8), b(0, 7.5)], rank < 2 ? RED : CREAM);
  if (rank >= 2) p.poly([b(0.14, 3), b(0.8, 0.6), b(1.08, 2.4), b(1.04, 5.3), b(0.63, 7.4), b(0.15, 5)], RED);
  p.poly([b(-0.15, -4), b(0.5, -5), b(0.9, -3), b(0.4, -3), b(-0.1, -2)], LIGHT);
  p.stroke([chest, offset(head, -5, 3)], SKIN, baby ? 5 : 7);
  if (!baby) p.stroke([offset(chest, 2, 2), offset(head, -1, 5)], CREAM, 2.4);
  leg(p, offset(hip, -1, 0), feet[1], true, rank);
  arm(p, offset(chest, 3, 2), hands[1], true, rank, body.fin, wingPhase);
  const muzzle = sharkHead(p, head, rank, body.closed, pose, phase);
  const sprite = bake(r, PALETTES[rank].map(flat), 0x1d2330, false);
  sprite.runs = sprite.runs.filter(run => run.y < ORIGIN[1]);
  const point = (v: Pt): Pt => [Math.round(v[0] * scale), Math.round(v[1] * scale)];
  return { sprite, originX: ORIGIN[0], originY: ORIGIN[1], muzzle: point(muzzle),
    ...(rank >= 2 ? { saddle: point(b(0.6, -6.7)) } : {}),
  };
}
