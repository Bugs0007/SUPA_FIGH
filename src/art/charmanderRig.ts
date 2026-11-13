import { Raster, toRuns, type Pt } from './pixelRaster';
import type { PokemonPose } from './pokemonArt';
import type { ReferenceFrame } from './pokemonSpriteMotion';

// Native-resolution side-view cels built from separate posed parts. Feet and
// the flame's attachment point share the same origin as the game sprite.
const W = 52;
const H = 41;
const ORIGIN: Pt = [25, 33];

const Ink = {
  outline: 1, deep: 2, shade: 3, body: 4, light: 5, gleam: 6,
  bellyShade: 7, belly: 8, ivory: 9, eye: 10, tongue: 11,
} as const;
const PALETTES = [
  [-1, 0x311c25, 0x783124, 0xbc5426, 0xea842f, 0xffab4d, 0xffc76b, 0xd69854, 0xffdb87, 0xffeed0, 0x21323a, 0xb0473a],
  [-1, 0x351f29, 0x7c302d, 0xae4133, 0xd85a3c, 0xf07c4f, 0xffa36d, 0xc8935e, 0xf1ca8c, 0xffeac7, 0x36252b, 0xc65048],
] as const;

// The brow, eye, jaw and Charmeleon's swept horn are placed on the pixel grid.
const HEADS = [
  [
    '..OOOO..',
    '.OHLLBO.',
    'OHLBBBO.',
    'OLBBIEBO',
    'OBBBEEBO',
    'OBBBBBBO',
    '.OBBSSO.',
    '..OOO...',
  ],
  [
    'OO..........',
    '.OBO........',
    '..OBBOOOO...',
    '...OLLBBSO..',
    '...OBBBIEBO.',
    '...OBBBEBSBO',
    '....OSBBBBBO',
    '....OSBSSOO.',
    '.....OOO....',
  ],
] as const;
const HEAD_INK: Readonly<Record<string, number>> = {
  O: Ink.outline, S: Ink.shade, B: Ink.body, L: Ink.light, H: Ink.gleam, E: Ink.eye, I: Ink.ivory,
};

interface Stance {
  hip: Pt;
  chest: Pt;
  head: Pt;
  nearFoot: Pt;
  farFoot: Pt;
  nearHand: Pt;
  farHand: Pt;
  tail: number;
  jaw: number;
  claws: boolean;
}

// Foot keys are ground-relative. A foot at height zero is planted, while the
// sprint's passing phases give both feet clearance and tuck the rear knee.
type Stride = readonly [nearX: number, nearY: number, farX: number, farY: number, hipY: number, arm: number];
const WALK: readonly Stride[] = [
  [ 3, 0, -3, 0,  0, -2], [ 2, 0, -2, 2,  0, -1],
  [ 1, 0,  0, 3, -1,  0], [-1, 0,  2, 2, -1,  1],
  [-3, 0,  3, 0,  0,  2], [-2, 2,  2, 0,  0,  1],
  [ 0, 3,  1, 0, -1,  0], [ 2, 2, -1, 0, -1, -1],
];
const RUN: readonly Stride[] = [
  [ 5, 0, -4, 2,  0, -3], [ 3, 0, -3, 4,  1, -2],
  [ 0, 0,  1, 5,  0,  0], [-4, 2,  4, 3, -2,  2],
  [-4, 2,  5, 0,  0,  3], [-3, 4,  3, 0,  1,  2],
  [ 1, 5,  0, 0,  0,  0], [ 4, 3, -4, 2, -2, -2],
];
const RECOVERY = [1, 1, 0.86, 0.64, 0.45, 0.25, 0.1, 0];
const RECOIL = [0.4, 1, 0.86, 0.68, 0.45, 0.25, 0.1, 0];
const COLLAPSE = [0, 0.12, 0.32, 0.62, 0.84, 0.98, 1, 1];
const BREATH = [0, 0, -1, -1, -1, 0, 0, 0];
const TAIL_SWAY = [0, 1, 2, 1, 0, -1, -2, -1];

type StarterPose = PokemonPose | 'walk' | 'air' | 'land' | 'hurt' | 'faint';

function stance(pose: StarterPose, frame: number, rank: 0 | 1): Stance {
  const idle: Stance = {
    hip: [0, 0], chest: [0, BREATH[frame]], head: [0, 0],
    nearFoot: [-3, 0], farFoot: [2, 0], nearHand: [2, 2], farHand: [4, 2],
    tail: TAIL_SWAY[frame] * 0.45, jaw: 0, claws: false,
  };
  const ease = RECOVERY[frame];
  switch (pose) {
    case 'hurt': {
      const recoil = RECOIL[frame];
      return {
        ...idle, hip: [-1.8 * recoil, 0.6 * recoil], chest: [-3.7 * recoil, 1.8 * recoil],
        head: [-2 * recoil, recoil], nearFoot: [-3 - recoil, 0], farFoot: [2 + recoil, 0],
        nearHand: [2 - 2.8 * recoil, 2 + 1.6 * recoil], farHand: [4 - 3.8 * recoil, 2 + recoil],
        tail: -3.5 * recoil, jaw: recoil * 0.6,
      };
    }
    case 'faint': {
      const fall = COLLAPSE[frame];
      return {
        ...idle, hip: [-2.2 * fall, (rank ? 2.1 : 1) * fall],
        chest: [4 * fall, (rank ? 7.6 : 4.2) * fall], head: [3 * fall, 1.6 * fall],
        nearFoot: [-3 - 2 * fall, 0], farFoot: [2 - 3 * fall, 0],
        nearHand: [2 + 2 * fall, 2 - fall], farHand: [4 + fall, 2 - fall],
        tail: 2.5 * fall, jaw: 0,
      };
    }
    case 'walk':
    case 'run': {
      const sprint = pose === 'run';
      const [nearX, nearY, farX, farY, lift, swing] = (sprint ? RUN : WALK)[frame];
      return {
        ...idle,
        hip: [sprint ? 1 : 0, lift], chest: [sprint ? 3 : 1, lift + (sprint ? 2 : 0)],
        head: [sprint ? 1 : 0, sprint ? -1 : 0],
        nearFoot: [nearX, nearY], farFoot: [farX, farY],
        nearHand: [1 + swing, 2 - Math.max(0, swing) * 0.5],
        farHand: [2 - swing, 2 + Math.min(0, swing) * 0.5],
        tail: (sprint ? 2 : 0.3) + TAIL_SWAY[frame] * 0.55,
      };
    }
    case 'windup': {
      const coil = [0.3, 0.45, 0.62, 0.78, 0.92, 1, 1, 1][frame];
      return {
        ...idle, hip: [-coil, coil], chest: [-2 * coil, 2 * coil], head: [-coil, 0],
        nearFoot: [-4, 0], farFoot: [2, 0], nearHand: [2 - 5 * coil, 2 - coil],
        farHand: [3, 1 - coil], tail: -2 * coil, claws: true,
      };
    }
    case 'punch':
      return {
        ...idle, hip: [ease, 0], chest: [3 * ease, ease], head: [ease, 0],
        nearFoot: [-2 - 2 * ease, 0], farFoot: [2 + 2 * ease, 0],
        nearHand: [2 + 5 * ease, 2 - 3 * ease], farHand: [4 - 3 * ease, 2 - ease],
        tail: 2 * ease, jaw: ease, claws: true,
      };
    case 'backhand':
      return {
        ...idle, hip: [-ease, 0], chest: [2 * ease, -ease], head: [2 * ease, -ease],
        nearFoot: [-4, 0], farFoot: [3 + ease, 0],
        nearHand: [2 - 5 * ease, 2 - 2 * ease], farHand: [4 + 6 * ease, 2 - 4 * ease],
        tail: -4 * ease, jaw: ease * 0.6, claws: true,
      };
    case 'kick':
      return {
        ...idle, hip: [-ease, -ease], chest: [-2 * ease, -ease], head: [ease, 0],
        nearFoot: [-2 + 10 * ease, 8 * ease], farFoot: [2 - 4 * ease, 0],
        nearHand: [2 - 4 * ease, 2 - ease], farHand: [4 - ease, 2 - 2 * ease],
        tail: 3 * ease, jaw: ease, claws: true,
      };
    case 'cast': {
      const breath = [0.1, 0.3, 1, 1, 0.75, 0.4, 0.12, 0][frame];
      const brace = [-1, -2, 2, 1.5, -1, -0.6, -0.2, 0][frame];
      return {
        ...idle, hip: [-breath, breath], chest: [brace, breath], head: [brace * 0.7, -breath],
        nearFoot: [-4, 0], farFoot: [3, 0], nearHand: [2 - 4 * breath, 2 - breath],
        farHand: [4 - 3 * breath, 2], tail: -2 * breath, jaw: breath, claws: true,
      };
    }
    case 'dash':
      return {
        ...idle, hip: [-1, -1], chest: [4, 3], head: [2, 0],
        nearFoot: [-5 + TAIL_SWAY[frame], 3], farFoot: [-3 - TAIL_SWAY[frame], 5],
        nearHand: [5, 0], farHand: [4, -1], tail: 4, jaw: 0.75, claws: true,
      };
    case 'cling':
      return {
        ...idle, hip: [0, -1], chest: [1, -1], head: [0, -1],
        nearFoot: [1, 4], farFoot: [-2, 3], nearHand: [5, -2], farHand: [5, -1], tail: -1,
      };
    case 'guard': {
      const strain = TAIL_SWAY[frame] * 0.3;
      return {
        ...idle, hip: [-1, 1], chest: [-1, 2 + strain], head: [-1, 1],
        nearFoot: [-3, 0], farFoot: [3, 0], nearHand: [4, -2 + strain],
        farHand: [5, 0], tail: -1 + strain,
      };
    }
    case 'air':
      return {
        ...idle, hip: [0, -1], chest: [1, -1], head: [0, -1],
        nearFoot: [2, 4], farFoot: [-3, 3], nearHand: [4, 0],
        farHand: [3, -1], tail: 2 + TAIL_SWAY[frame] * 0.55,
      };
    case 'land':
      return {
        ...idle, hip: [0, 2 * ease], chest: [ease, 3 * ease], head: [0, ease],
        nearFoot: [-2 - ease, 0], farFoot: [2 + ease, 0],
        nearHand: [2 - 2 * ease, 2 + ease], farHand: [4 + ease, 2 + ease], tail: -3 * ease,
      };
    default:
      return idle;
  }
}

function point(x: number, y: number): Pt {
  return [ORIGIN[0] + Math.round(x), ORIGIN[1] + Math.round(y)];
}

function offset([x, y]: Pt, dx: number, dy: number): Pt {
  return [x + dx, y + dy];
}

// Tapered segments share the joint disk so there is no seam at extreme poses.
function taper(r: Raster, a: Pt, b: Pt, start: number, end: number, ink: number): void {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const nx = (a[1] - b[1]) / length;
  const ny = (b[0] - a[0]) / length;
  r.poly([
    offset(a, nx * start, ny * start), offset(b, nx * end, ny * end),
    offset(b, -nx * end, -ny * end), offset(a, -nx * start, -ny * start),
  ], ink);
}

function tail(r: Raster, hip: Pt, rank: 0 | 1, sway: number): Pt {
  const root = offset(hip, -2 - rank, 0);
  const base = offset(hip, -5 - rank, 1);
  const curve = offset(hip, -8 - 2 * rank, -1 + sway * 0.55);
  const tip = offset(hip, -9 - 2 * rank, -4 - 2 * rank + sway);
  taper(r, root, base, 2.2 + rank * 0.4, 1.7 + rank * 0.4, Ink.outline);
  taper(r, base, curve, 1.7 + rank * 0.4, 1.2 + rank * 0.2, Ink.outline);
  taper(r, curve, tip, 1.2 + rank * 0.2, 0.55, Ink.outline);
  r.ellipse(base[0], base[1], 1.6 + rank * 0.35, 1.6 + rank * 0.35, Ink.outline);
  r.ellipse(curve[0], curve[1], 1.15 + rank * 0.2, 1.15 + rank * 0.2, Ink.outline);
  r.stroke([root, base, curve, tip], Ink.shade);
  taper(r, offset(root, 0, -0.5), offset(base, 0, -0.5), 1.2, 0.8, Ink.body);
  taper(r, offset(base, 0, -0.5), curve, 0.8, 0.6, Ink.body);
  r.line(base[0], base[1] - 1, curve[0], curve[1], Ink.light);
  return tip;
}

function leg(r: Raster, hip: Pt, foot: Pt, rank: 0 | 1, near: boolean, raised: boolean): void {
  const knee: Pt = [
    Math.round((hip[0] + foot[0]) * 0.5) + (raised ? 1 : -1),
    Math.round((hip[1] + foot[1]) * 0.5) - (raised ? rank + 1 : 0),
  ];
  const skin = near ? Ink.body : Ink.shade;
  const thigh = 1.9 + rank * 0.7;
  const shin = 1.2 + rank * 0.35;
  taper(r, hip, knee, thigh, thigh - 0.35, Ink.outline);
  r.ellipse(knee[0], knee[1], thigh - 0.25, thigh - 0.25, Ink.outline);
  taper(r, knee, foot, thigh - 0.35, shin, Ink.outline);
  taper(r, offset(hip, 0, -0.2), knee, thigh - 0.8, thigh - 0.75, skin);
  taper(r, knee, foot, thigh - 0.75, shin - 0.55, skin);
  r.ellipse(knee[0], knee[1], thigh - 0.85, thigh - 0.85, skin);
  if (near) r.ellipse(hip[0], hip[1] - 0.5, thigh - 0.45, thigh - 0.55, skin);
  r.poly([
    offset(foot, -2, -2), offset(foot, 0, -2), offset(foot, 2 + rank, -1),
    offset(foot, 2 + rank, 1), offset(foot, -2, 1),
  ], Ink.outline);
  r.rect(foot[0] - 1, foot[1] - 1, 2 + rank, 1, skin);
  r.set(foot[0] + rank, foot[1] - 1, near ? Ink.ivory : Ink.bellyShade);
  if (near && rank) {
    r.line(hip[0] - 1, hip[1] + 1, knee[0] - 1, knee[1], Ink.light);
    r.set(foot[0] + rank - 2, foot[1] - 1, Ink.belly);
  }
}

function arm(r: Raster, shoulder: Pt, hand: Pt, rank: 0 | 1, near: boolean, claws: boolean): void {
  const elbow: Pt = [
    Math.round((shoulder[0] + hand[0]) * 0.5) - (hand[0] < shoulder[0] + 3 ? 1 : 0),
    Math.round((shoulder[1] + hand[1]) * 0.5) + (hand[1] < shoulder[1] ? 2 : 1),
  ];
  const ink = near ? Ink.body : Ink.shade;
  const path = [shoulder, elbow, hand];
  r.stroke(path, Ink.outline, 2 + rank);
  r.stroke(path, ink, rank + 1);
  if (near) {
    r.ellipse(shoulder[0], shoulder[1], 1.15 + rank * 0.65, 1.2 + rank * 0.7, Ink.body);
    r.set(shoulder[0], shoulder[1] - 1, Ink.light);
  }
  r.set(hand[0], hand[1], ink);
  if (claws || rank) {
    const toe = hand[0] + (hand[0] < shoulder[0] ? -1 : 1);
    r.set(toe, hand[1], near ? Ink.ivory : Ink.bellyShade);
    if (rank && near && claws) r.set(toe + 1, hand[1] - 1, Ink.belly);
  }
}

function trunk(r: Raster, hip: Pt, chest: Pt, rank: 0 | 1): void {
  const front = 5;
  r.poly([
    offset(chest, -3, -1), offset(chest, 2 + rank, -1), offset(chest, 3 + rank, 2),
    offset(hip, front, 0), offset(hip, 3 + rank, 3 + rank), offset(hip, 0, 4 + rank),
    offset(hip, -3 - rank, 3), offset(hip, -4 - rank, 0), offset(chest, -3 - rank, 1),
  ], Ink.outline);
  r.poly([
    offset(chest, -2, 0), offset(chest, 2 + rank, 0), offset(chest, 2 + rank, 2),
    offset(hip, front - 1, 0), offset(hip, 3 + rank, 2 + rank), offset(hip, 0, 3 + rank),
    offset(hip, -3 - rank, 2), offset(hip, -3 - rank, 0), offset(chest, -2 - rank, 1),
  ], Ink.shade);
  r.poly([
    offset(chest, -2, 0), offset(chest, 2 + rank, 0), offset(hip, 3 + rank, 0),
    offset(hip, 0, 2 + rank), offset(hip, -3, 1), offset(chest, -2 - rank, 2),
  ], Ink.body);
  r.poly([
    offset(chest, rank, 0), offset(chest, 2 + rank, 1), offset(hip, front - 1, 0),
    offset(hip, 3 + rank, 2), offset(hip, 1, 3 + rank), offset(hip, -1 + rank, 2),
    offset(hip, -1 + rank, 0),
  ], Ink.bellyShade);
  r.poly([
    offset(chest, rank, 1), offset(chest, 2 + rank, 1), offset(hip, front - 1, 0),
    offset(hip, 2 + rank, 2), offset(hip, rank, 2), offset(hip, rank, 0),
  ], Ink.belly);
}

function neck(r: Raster, chest: Pt, head: Pt, rank: 0 | 1): void {
  const collar = offset(chest, -0.4, 2);
  const jaw = offset(head, rank ? 0.5 : 1.5, rank ? -3 : -1);
  taper(r, collar, jaw, 2.3 + rank * 0.4, 1.7 + rank * 0.35, Ink.outline);
  taper(r, offset(collar, 0.1, -0.7), jaw, 1.5 + rank * 0.5, 1.2 + rank * 0.3, Ink.body);
  taper(r, offset(collar, 1, -0.1), offset(jaw, 0.6, 0), 0.65, 0.6, Ink.bellyShade);
}

function face(r: Raster, pivot: Pt, rank: 0 | 1, jaw: number, blink: boolean): Pt {
  const start = offset(pivot, rank ? -5 : -1, rank ? -9 : -6);
  for (const [y, row] of HEADS[rank].entries()) {
    for (const [x, mark] of [...row].entries()) {
      const ink = HEAD_INK[mark];
      if (ink) r.set(start[0] + x, start[1] + y, blink && (mark === 'E' || mark === 'I') ? Ink.body : ink);
    }
  }
  if (blink) {
    const eye = offset(start, rank ? 7 : 4, rank ? 5 : 4);
    r.line(eye[0], eye[1], eye[0] + 1, eye[1], Ink.deep);
  }
  const snout = offset(start, rank ? 10 : 6, rank ? 6 : 5);
  if (jaw > 0.28) {
    const drop = 1 + (rank && jaw > 0.7 ? 1 : 0);
    r.line(snout[0] - 2, snout[1] + 1, snout[0] + 1, snout[1] + drop, Ink.outline);
    r.line(snout[0] - 2, snout[1] + 1 + drop, snout[0], snout[1] + 1 + drop, Ink.shade);
    r.set(snout[0] - 1, snout[1] + drop, Ink.tongue);
    if (rank) r.set(snout[0], snout[1] + 1, Ink.ivory);
  } else {
    r.line(snout[0] - 2, snout[1] + 1, snout[0], snout[1] + 1, Ink.outline);
  }
  r.set(snout[0] + 1, snout[1] - 1, Ink.deep);
  return offset(snout, 2, jaw > 0.28 ? 1 : 0);
}

export function bakeCharmanderRig(rank: 0 | 1, pose: StarterPose, phase: number): ReferenceFrame {
  const frame = ((Math.floor(phase) % 8) + 8) % 8;
  const s = stance(pose, frame, rank);
  const scale = rank ? 1.42 : 1;
  const hip = point(-1 + s.hip[0] * scale, -6 - 3 * rank + s.hip[1] * scale);
  const chest = point(s.chest[0] * scale, -9 - 7 * rank + s.chest[1] * scale);
  const head = offset(chest, Math.round(s.head[0] * scale), Math.round(s.head[1] * scale));
  const nearFoot = point(s.nearFoot[0] * scale, -1 - s.nearFoot[1] * scale);
  const farFoot = point(s.farFoot[0] * scale, -1 - s.farFoot[1] * scale);
  const nearHand = offset(chest, Math.round(s.nearHand[0] * scale), Math.round(s.nearHand[1] * scale) + rank);
  const farHand = offset(chest, Math.round(s.farHand[0] * scale), Math.round(s.farHand[1] * scale) + rank);

  const r = new Raster(W, H);
  const tailTip = tail(r, hip, rank, s.tail);
  leg(r, offset(hip, 1, 0), farFoot, rank, false, s.farFoot[1] > 0);
  arm(r, offset(chest, 1, 1 + rank), farHand, rank, false, s.claws);
  trunk(r, hip, chest, rank);
  neck(r, chest, head, rank);
  leg(r, offset(hip, -2, 0), nearFoot, rank, true, s.nearFoot[1] > 0);
  arm(r, offset(chest, -1, 1 + rank), nearHand, rank, true, s.claws);
  const closedEye = pose === 'faint' && frame >= 2 || pose === 'hurt' && frame <= 2 || pose === 'idle' && frame === 7;
  const muzzle = face(r, head, rank, s.jaw, closedEye);

  const palette = PALETTES[rank];
  return {
    sprite: toRuns(Int32Array.from(r.m, ink => palette[ink]), W, H),
    originX: ORIGIN[0],
    originY: ORIGIN[1],
    fire: {
      tail: offset(tailTip, -ORIGIN[0], -ORIGIN[1]),
      size: rank ? 5 : 3,
      muzzle: offset(muzzle, -ORIGIN[0], -ORIGIN[1]),
    },
  };
}
