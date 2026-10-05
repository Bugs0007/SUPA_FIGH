import type Phaser from 'phaser';
import { type Appearance, appearanceKey } from './appearance';
import { PixelCanvas } from './canvas';
import { P, shade } from './palette';

// Modular fighter art. Per appearance we bake three sheets:
//   body: 32x32 frames (legs + torso), feet on row 31, facing right
//   head: 16x16 frames (normal/hurt/dead), neck anchor at (8, 13)
//   arm : 17x17 frames at 32 angles x 2 lengths, shoulder at the frame center (8, 8)

export const BF = {
  IDLE0: 0,
  IDLE1: 1,
  RUN0: 2, // 2..7
  JUMP: 8,
  FALL: 9,
  CROUCH: 10,
  CRAWL0: 11,
  CRAWL1: 12,
  ROLL: 13,
  STRETCH: 14,
  CLIMB0: 15,
  CLIMB1: 16,
  LEDGE: 17,
  KICK: 18,
  AIRKICK: 19,
  HURT: 20,
  AIM: 21,
  PUNCH: 22,
  DANGLE: 23,
  TUMBLE: 24,
  // animation pass: more expressive in-between poses
  APEX: 25,
  HOVER: 26,
  SKID: 27,
  LAND: 28,
  WINDUP: 29,
  CROSS: 30,
  UPPER: 31,
  IDLE2: 32,
} as const;
export const BODY_FRAMES = 33;
export const HEAD = { NORMAL: 0, HURT: 1, DEAD: 2 } as const;
export const ARM_ANGLES = 32;
export const ARM_LENGTHS = [5, 7];

export interface FrameMeta {
  /** head anchor (bottom-center of the head) in frame px */
  neckX: number;
  neckY: number;
  /** front / back shoulder in frame px */
  shX: number;
  shY: number;
  bshX: number;
  bshY: number;
  hideHead: boolean;
  hideArms: boolean;
}

export interface FighterTextures {
  body: string;
  head: string;
  arm: string;
}

interface Leg {
  hx: number;
  hy: number;
  kx: number;
  ky: number;
  fx: number;
  fy: number;
}

interface Pose {
  hipY: number;
  torsoH: number;
  lean: number;
  back: Leg;
  front: Leg;
  special?: 'roll';
}

const CX = 16;

/** Leg from a hip joint with knee/foot offsets. Feet are clamped to the ground row. */
function leg(hx: number, hy: number, kdx: number, kdy: number, fdx: number, fdy: number): Leg {
  return { hx, hy, kx: hx + kdx, ky: hy + kdy, fx: hx + fdx, fy: Math.min(30, hy + fdy) };
}

function stand(hipY: number, torsoH: number, lean: number, b: [number, number, number, number], f: [number, number, number, number]): Pose {
  const hy = hipY + 1;
  return { hipY, torsoH, lean, back: leg(14, hy, ...b), front: leg(16, hy, ...f) };
}

/**
 * One leg through a run stride (knee dx/dy, foot dx/dy from the hip). The other leg plays the same
 * cycle half a stride later. 0 contact (reaching foot lands) · 1 down (weight over it) · 2 push off ·
 * 3 heel kicks up behind · 4 knee drives forward · 5 reach.
 */
const RUN_CYCLE: [number, number, number, number][] = [
  [3, 3, 5, 6],
  [1, 3, 1, 6],
  [-1, 3, -3, 5],
  [-3, 2, -5, 3],
  [2, 1, 0, 4],
  [3, 1, 4, 4],
];
/** hip height per run frame: contact, down (lowest), up (feet leave the ground), twice per cycle */
const RUN_HIP = [23, 24, 22, 23, 24, 22];

function buildPoses(): Pose[] {
  const poses: Pose[] = [];
  // idle breathing: chest rises (torso 8 -> 7) with a slight weight shift onto the back leg
  poses[BF.IDLE0] = stand(23, 8, 0, [-1, 3, -1, 6], [1, 3, 1, 6]);
  poses[BF.IDLE1] = stand(23, 7, 0, [-1, 3, -1, 6], [1, 3, 1, 6]);
  poses[BF.IDLE2] = stand(24, 7, 0, [-1, 2, -1, 5], [1, 2, 1, 5]);
  for (let i = 0; i < 6; i++) {
    poses[BF.RUN0 + i] = stand(RUN_HIP[i], 8, 1, RUN_CYCLE[(i + 3) % 6], RUN_CYCLE[i]);
  }
  // rising: front knee tucked high, back leg trailing
  poses[BF.JUMP] = stand(22, 8, 0, [-1, 3, -2, 6], [3, 1, 2, 4]);
  // top of the arc: both knees up
  poses[BF.APEX] = stand(22, 8, 0, [1, 2, -1, 4], [3, 1, 2, 3]);
  // falling: legs reaching down for the floor, slightly apart
  poses[BF.FALL] = stand(23, 8, 0, [-2, 3, -3, 6], [2, 3, 3, 6]);
  // levitating: legs together, one knee softly bent (feet hang a little)
  poses[BF.HOVER] = stand(22, 8, 0, [0, 3, 0, 6], [2, 2, 1, 5]);
  // turning around at speed: lean back, front foot braced ahead
  poses[BF.SKID] = stand(24, 8, -2, [-2, 2, -3, 5], [3, 3, 5, 6]);
  // landing squash: knees bent, chest low
  poses[BF.LAND] = stand(25, 7, 1, [-2, 2, -2, 5], [2, 2, 3, 5]);
  // punches: anticipation (lean back), jab, cross (hips turn in), haymaker/uppercut lunge
  poses[BF.WINDUP] = stand(24, 8, -1, [-2, 3, -3, 6], [2, 3, 2, 6]);
  poses[BF.CROSS] = stand(24, 8, 3, [-3, 3, -5, 6], [2, 2, 3, 6]);
  poses[BF.UPPER] = stand(23, 8, 2, [-3, 3, -5, 6], [4, 2, 5, 6]);
  poses[BF.CROUCH] = stand(28, 4, 2, [1, 1, -1, 1], [2, 0, 2, 1]);
  poses[BF.CRAWL0] = stand(28, 4, 2, [2, 1, 0, 1], [1, 0, 1, 1]);
  poses[BF.CRAWL1] = stand(28, 4, 2, [0, 1, -2, 1], [3, 0, 3, 1]);
  poses[BF.ROLL] = { ...stand(23, 8, 0, [0, 3, 0, 6], [0, 3, 0, 6]), special: 'roll' };
  poses[BF.STRETCH] = stand(23, 8, 0, [0, 3, -1, 6], [0, 3, 0, 6]);
  poses[BF.CLIMB0] = stand(23, 8, 0, [0, 3, 0, 6], [2, 1, 2, 4]);
  poses[BF.CLIMB1] = stand(23, 8, 0, [2, 1, 2, 4], [0, 3, 0, 6]);
  poses[BF.LEDGE] = stand(23, 8, 0, [-1, 3, -2, 6], [0, 3, -1, 6]);
  poses[BF.KICK] = stand(23, 8, -2, [-1, 3, -1, 6], [4, -1, 8, -2]);
  poses[BF.AIRKICK] = stand(23, 8, -1, [1, 2, -2, 3], [4, 2, 8, 3]);
  poses[BF.HURT] = stand(23, 8, -2, [-1, 3, -2, 6], [1, 3, 2, 6]);
  poses[BF.AIM] = stand(23, 8, 0, [-2, 3, -3, 6], [2, 3, 3, 6]);
  poses[BF.PUNCH] = stand(24, 8, 2, [-2, 3, -4, 6], [3, 2, 4, 6]);
  poses[BF.DANGLE] = stand(23, 8, -1, [0, 3, -1, 6], [0, 3, 1, 6]);
  poses[BF.TUMBLE] = stand(23, 8, 0, [-3, 2, -5, 4], [3, 2, 5, 5]);
  return poses;
}

const POSES = buildPoses();

/** Frame metadata, shared by every appearance. */
export const FRAME_META: FrameMeta[] = POSES.map((p) => {
  const top = p.hipY - p.torsoH;
  const special = p.special === 'roll';
  return {
    neckX: CX + p.lean,
    neckY: top,
    shX: CX + p.lean,
    shY: top + (p.torsoH <= 5 ? 1 : 2),
    bshX: CX + p.lean - 1,
    bshY: top + (p.torsoH <= 5 ? 1 : 2),
    hideHead: special,
    hideArms: special,
  };
});

// ------------------------------------------------------------------ drawing

function drawLeg(pc: PixelCanvas, ox: number, oy: number, l: Leg, pants: string, shoes: string, shin = pants): void {
  pc.line(ox + l.hx, oy + l.hy, ox + l.kx, oy + l.ky, pants, 2);
  pc.line(ox + l.kx, oy + l.ky, ox + l.fx, oy + l.fy, shin, 2);
  pc.rect(ox + l.fx, oy + l.fy, 3, 2, shoes);
}

function drawTorso(pc: PixelCanvas, ox: number, oy: number, p: Pose, a: Appearance): void {
  const top = p.hipY - p.torsoH;
  const skinDark = shade(a.skin, -0.15);
  for (let r = top; r <= p.hipY; r++) {
    const t = p.torsoH > 0 ? (p.hipY - r) / p.torsoH : 0;
    const xo = Math.round(p.lean * t);
    const x0 = ox + 13 + xo;
    const y = oy + r;
    const rowFromTop = r - top;
    const isBelt = r === p.hipY;
    for (let i = 0; i < 6; i++) {
      let col: string = a.topColor;
      const x = x0 + i;
      if (isBelt) {
        col = a.top === 'suit' ? P.ink2 : a.top === 'gi' ? a.accentColor : shade(a.pantsColor, -0.3);
        if (i === 3 && a.top !== 'suit' && a.top !== 'gi') col = P.brass;
      } else {
        switch (a.top) {
          case 'tank':
            if (rowFromTop < 2 && (i === 0 || i === 5)) col = a.skin;
            if (rowFromTop === 0 && (i === 1 || i === 4)) col = a.skin;
            break;
          case 'jacket':
            if (i === 3 || i === 4) col = a.accentColor;
            if (i === 2 && rowFromTop > 0) col = shade(a.topColor, -0.25);
            break;
          case 'suit':
            if (rowFromTop <= 2 && i >= 3 - Math.max(0, 2 - rowFromTop) && i <= 3 + Math.max(0, 2 - rowFromTop) - 1) col = P.white;
            if (i === 3 && rowFromTop >= 1 && rowFromTop <= 5) col = a.accentColor;
            break;
          case 'hoodie':
            if (r === p.hipY - 2 && i >= 2 && i <= 4) col = shade(a.topColor, -0.3);
            if (rowFromTop === 0 && i === 3) col = a.accentColor;
            break;
          case 'vest':
            col = i === 0 || i === 1 || i === 4 || i === 5 ? a.topColor : a.accentColor;
            if (i === 4 && rowFromTop % 2 === 1) col = P.brass;
            break;
          case 'tracksuit':
            // black shoulders, white collar zip
            if (rowFromTop < 2) col = a.accentColor;
            if (i === 4 && rowFromTop >= 1) col = P.white;
            break;
          case 'openvest':
            // open front: bare chest down the middle
            if (rowFromTop >= 1 && (i === 3 || i === 4)) col = a.skin;
            break;
          case 'gi':
            // undershirt V at the collar
            if (rowFromTop === 0 && i >= 2 && i <= 4) col = a.accentColor;
            if (rowFromTop === 1 && i === 3) col = a.accentColor;
            break;
          case 'tshirt':
          default:
            if (rowFromTop === 1 && i >= 3 && i <= 4) col = a.accentColor;
            break;
        }
        // subtle shading on the back edge
        if (i === 0 && col === a.topColor) col = shade(a.topColor, -0.2);
        if (i === 0 && col === a.skin) col = skinDark;
      }
      pc.set(x, y, col);
    }
  }
  if (a.top === 'hoodie') {
    // hood bump behind the neck
    pc.rect(ox + 12 + Math.round(p.lean), oy + top - 1, 3, 2, shade(a.topColor, -0.15));
  }
}

function drawRoll(pc: PixelCanvas, ox: number, oy: number, a: Appearance): void {
  const cx = ox + 16;
  const cy = oy + 25;
  pc.circle(cx, cy, 5, a.topColor);
  // tucked legs (lower-left)
  for (let y = 0; y <= 5; y++) for (let x = -5; x <= 0; x++) if (x * x + y * y <= 26) pc.set(cx + x, cy + y, a.pantsColor);
  pc.rect(cx - 6, cy + 1, 2, 3, a.shoesColor);
  // tucked head (upper-right)
  pc.rect(cx + 1, cy - 5, 4, 4, a.skin);
  pc.rect(cx + 1, cy - 6, 4, 2, a.hair === 'none' ? a.skin : a.hairColor);
  pc.set(cx + 4, cy - 3, P.ink);
}

function drawBodyFrame(pc: PixelCanvas, ox: number, oy: number, p: Pose, a: Appearance): void {
  if (p.special === 'roll') {
    drawRoll(pc, ox, oy, a);
  } else {
    const shorts = a.legs === 'shorts';
    drawLeg(pc, ox, oy, p.back, shade(a.pantsColor, -0.3), shade(a.shoesColor, -0.3), shorts ? shade(a.skin, -0.2) : undefined);
    drawTorso(pc, ox, oy, p, a);
    drawLeg(pc, ox, oy, p.front, a.pantsColor, a.shoesColor, shorts ? a.skin : undefined);
  }
  pc.outline(ox, oy, 32, 32);
}

// ------------------------------------------------------------------ head

function drawHead(pc: PixelCanvas, ox: number, oy: number, a: Appearance, mode: number): void {
  const X = (x: number) => ox + x;
  const Y = (y: number) => oy + y;
  const hairDark = shade(a.hairColor, -0.25);

  if (a.hair === 'afro') pc.circle(X(8), Y(8), 5, a.hairColor);
  // hero hair: big spiky masses that define the silhouette (behind the skull)
  if (a.hair === 'ninja') {
    pc.rect(X(4), Y(4), 9, 4, a.hairColor);
    for (const [x, y] of [[3, 5], [4, 3], [6, 2], [8, 3], [10, 2], [12, 3], [13, 5], [3, 7], [4, 8]]) pc.set(X(x), Y(y), a.hairColor);
    pc.set(X(5), Y(3), hairDark);
  }
  if (a.hair === 'saiyan') {
    pc.rect(X(4), Y(3), 9, 5, a.hairColor);
    pc.rect(X(2), Y(4), 3, 2, a.hairColor);
    pc.rect(X(3), Y(6), 2, 3, a.hairColor);
    for (const [x, y] of [[3, 2], [5, 1], [5, 2], [8, 0], [8, 1], [8, 2], [11, 1], [11, 2], [13, 3], [1, 5], [2, 8], [3, 9]]) pc.set(X(x), Y(y), a.hairColor);
  }
  if (a.hair === 'saiyan3') {
    // Super Saiyan 3: a huge golden mane down the back
    pc.rect(X(3), Y(2), 10, 6, a.hairColor);
    pc.rect(X(2), Y(5), 4, 10, a.hairColor);
    pc.rect(X(1), Y(10), 3, 5, a.hairColor);
    pc.rect(X(3), Y(3), 1, 11, hairDark);
    for (const [x, y] of [[4, 1], [6, 0], [8, 0], [10, 1], [12, 2], [13, 4], [1, 6], [0, 9]]) pc.set(X(x), Y(y), a.hairColor);
    for (const [x, y] of [[5, 0], [7, 1], [9, 1], [11, 2]]) pc.set(X(x), Y(y), shade(a.hairColor, 0.3));
  }
  if (a.hair === 'wild') {
    // Gear 5: wild, cloud-like white hair
    pc.rect(X(3), Y(3), 10, 5, a.hairColor);
    for (const [x, y] of [[2, 4], [2, 7], [3, 9], [4, 2], [6, 1], [8, 1], [10, 2], [12, 2], [13, 4], [13, 6]]) pc.circle(X(x), Y(y), 1, a.hairColor);
    pc.set(X(5), Y(3), shade(a.hairColor, -0.12));
    pc.set(X(9), Y(2), shade(a.hairColor, -0.12));
  }
  if (a.hair === 'long') pc.rect(X(4), Y(7), 3, 8, hairDark);
  if (a.hair === 'ponytail') pc.rect(X(3), Y(8), 2, 4, hairDark);

  // skull
  pc.rect(X(5), Y(6), 7, 7, a.skin);
  pc.rect(X(5), Y(12), 1, 1, shade(a.skin, -0.2));
  pc.set(X(11), Y(10), shade(a.skin, -0.12)); // jaw hint

  // hair
  const hc = a.hairColor;
  switch (a.hair) {
    case 'buzz':
      pc.rect(X(5), Y(6), 7, 1, hc);
      pc.rect(X(5), Y(7), 1, 2, hc);
      break;
    case 'short':
      pc.rect(X(5), Y(5), 7, 2, hc);
      pc.rect(X(5), Y(7), 2, 2, hc);
      pc.set(X(11), Y(7), hc);
      break;
    case 'spiky':
      pc.rect(X(5), Y(5), 7, 2, hc);
      pc.rect(X(5), Y(7), 2, 2, hc);
      pc.set(X(5), Y(4), hc);
      pc.set(X(7), Y(3), hc);
      pc.set(X(7), Y(4), hc);
      pc.set(X(9), Y(4), hc);
      pc.set(X(11), Y(4), hc);
      pc.set(X(12), Y(6), hc);
      break;
    case 'long':
      pc.rect(X(5), Y(5), 7, 2, hc);
      pc.rect(X(5), Y(7), 2, 6, hc);
      break;
    case 'mohawk':
      pc.rect(X(6), Y(3), 3, 3, hc);
      pc.rect(X(5), Y(6), 5, 1, hc);
      break;
    case 'afro':
      pc.rect(X(5), Y(4), 7, 3, hc);
      pc.rect(X(5), Y(7), 2, 4, hc);
      break;
    case 'ponytail':
      pc.rect(X(5), Y(5), 7, 2, hc);
      pc.rect(X(5), Y(7), 2, 2, hc);
      break;
    case 'bob':
      pc.rect(X(5), Y(5), 7, 2, hc);
      pc.rect(X(5), Y(7), 2, 5, hc);
      pc.rect(X(11), Y(7), 1, 2, hc);
      break;
    case 'none':
      pc.set(X(9), Y(6), shade(a.skin, 0.25));
      break;
    case 'ninja':
      // fringe falling over the forehead
      pc.rect(X(5), Y(6), 7, 1, hc);
      pc.set(X(11), Y(7), hc);
      pc.set(X(9), Y(7), hc);
      pc.rect(X(5), Y(7), 2, 2, hc);
      break;
    case 'saiyan3':
      pc.rect(X(5), Y(6), 7, 1, hc);
      pc.set(X(11), Y(7), hc);
      pc.set(X(12), Y(8), hc);
      pc.rect(X(5), Y(7), 2, 6, hc);
      break;
    case 'wild':
      pc.rect(X(5), Y(5), 7, 2, hc);
      pc.set(X(12), Y(6), hc);
      pc.set(X(10), Y(7), hc);
      pc.rect(X(5), Y(7), 2, 3, hc);
      break;
    case 'saiyan':
      pc.rect(X(5), Y(6), 7, 1, hc);
      pc.set(X(12), Y(6), hc);
      pc.set(X(12), Y(7), hc);
      pc.set(X(10), Y(7), hc);
      pc.rect(X(5), Y(7), 2, 3, hc);
      break;
  }

  // eyes
  const eye = mode !== HEAD.NORMAL ? P.ink : (a.eyes ?? (a.face === 'foxeyes' ? P.red2 : P.ink));
  if (mode === HEAD.DEAD) {
    pc.set(X(9), Y(7), P.ink);
    pc.set(X(11), Y(7), P.ink);
    pc.set(X(10), Y(8), P.ink);
    pc.set(X(9), Y(9), P.ink);
    pc.set(X(11), Y(9), P.ink);
  } else if (mode === HEAD.HURT) {
    pc.set(X(9), Y(8), P.ink);
    pc.set(X(10), Y(9), P.ink);
    pc.set(X(11), Y(8), P.ink);
    pc.set(X(10), Y(11), P.ink);
  } else {
    pc.set(X(10), Y(8), eye);
    pc.set(X(10), Y(9), eye);
  }

  // face accessories
  switch (a.face) {
    case 'beard':
      pc.rect(X(7), Y(11), 5, 2, a.hairColor);
      pc.rect(X(6), Y(10), 1, 2, a.hairColor);
      pc.set(X(11), Y(10), a.hairColor);
      break;
    case 'stubble':
      for (let x = 7; x <= 11; x++) if (x % 2 === 0) pc.set(X(x), Y(12), shade(a.skin, -0.35));
      for (let x = 8; x <= 11; x++) if (x % 2 === 1) pc.set(X(x), Y(11), shade(a.skin, -0.35));
      break;
    case 'shades':
      if (mode !== HEAD.DEAD) {
        pc.rect(X(8), Y(8), 4, 2, P.ink);
        pc.set(X(10), Y(8), P.steel3);
        pc.rect(X(5), Y(8), 3, 1, P.ink);
      }
      break;
    case 'eyepatch':
      pc.rect(X(10), Y(8), 2, 2, P.ink);
      pc.line(X(5), Y(7), X(10), Y(8), P.ink);
      break;
    case 'mustache':
      pc.rect(X(9), Y(10), 3, 1, a.hairColor);
      pc.set(X(12), Y(10), a.hairColor);
      break;
    case 'mask':
      pc.rect(X(5), Y(8), 7, 2, P.ink);
      if (mode === HEAD.NORMAL) pc.set(X(10), Y(8), P.white);
      break;
    case 'goggles':
      pc.rect(X(5), Y(8), 7, 1, a.accentColor);
      pc.rect(X(9), Y(7), 3, 3, P.steel1);
      pc.set(X(10), Y(8), P.glass1);
      break;
    case 'whiskers':
    case 'foxeyes': {
      const wc = a.face === 'foxeyes' ? shade(a.skin, -0.55) : shade(a.skin, -0.35);
      pc.set(X(8), Y(10), wc);
      pc.set(X(9), Y(11), wc);
      pc.set(X(11), Y(11), wc);
      break;
    }
    case 'scar':
      pc.set(X(10), Y(10), shade(a.skin, -0.4));
      break;
  }

  // hats
  const hat = a.hatColor;
  const hatDark = shade(hat, -0.3);
  switch (a.hat) {
    case 'cap':
      pc.rect(X(5), Y(4), 7, 3, hat);
      pc.rect(X(11), Y(6), 3, 1, hatDark);
      break;
    case 'beanie':
      pc.rect(X(6), Y(3), 5, 1, hat);
      pc.rect(X(5), Y(4), 7, 3, hat);
      pc.rect(X(5), Y(6), 7, 1, hatDark);
      break;
    case 'tophat':
      pc.rect(X(6), Y(0), 5, 5, hat);
      pc.rect(X(6), Y(4), 5, 1, P.red1);
      pc.rect(X(4), Y(5), 9, 1, hatDark);
      break;
    case 'helmet':
      pc.rect(X(6), Y(3), 5, 1, hat);
      pc.rect(X(5), Y(4), 7, 3, hat);
      pc.rect(X(4), Y(7), 9, 1, hatDark);
      pc.set(X(7), Y(4), shade(hat, 0.3));
      break;
    case 'bandana':
      pc.rect(X(5), Y(5), 7, 2, hat);
      pc.rect(X(3), Y(6), 2, 1, hatDark);
      pc.rect(X(2), Y(7), 2, 1, hatDark);
      pc.set(X(8), Y(5), P.white);
      break;
    case 'hardhat':
      pc.rect(X(6), Y(3), 5, 1, hat);
      pc.rect(X(5), Y(4), 7, 2, hat);
      pc.rect(X(4), Y(6), 9, 1, hatDark);
      pc.set(X(8), Y(3), shade(hat, 0.35));
      break;
    case 'strawhat':
      // the silhouette: wide straw brim + red band
      pc.rect(X(5), Y(2), 7, 3, hat);
      pc.set(X(6), Y(2), shade(hat, 0.2));
      pc.rect(X(5), Y(4), 7, 1, P.red1);
      pc.rect(X(1), Y(5), 15, 1, hat);
      pc.rect(X(2), Y(6), 13, 1, hatDark);
      break;
    case 'headband':
      // forehead protector: dark cloth band + steel plate on the front
      pc.rect(X(5), Y(6), 7, 1, hatDark);
      pc.rect(X(8), Y(5), 4, 2, P.steel3);
      pc.set(X(9), Y(5), P.white);
      pc.set(X(4), Y(7), hatDark);
      pc.set(X(3), Y(8), hatDark);
      break;
    case 'fedora':
      pc.rect(X(6), Y(3), 5, 3, hat);
      pc.set(X(8), Y(3), hatDark);
      pc.rect(X(6), Y(5), 5, 1, P.ink2);
      pc.rect(X(3), Y(6), 11, 1, hatDark);
      break;
  }
  pc.outline(ox, oy, 16, 16);
}

// ------------------------------------------------------------------ arms

function sleeveLen(a: Appearance, len: number): number {
  switch (a.top) {
    case 'tank':
    case 'openvest':
      return 0;
    case 'gi':
    case 'tshirt':
    case 'vest':
      return 3;
    default:
      return len - 1;
  }
}

function drawArm(pc: PixelCanvas, ox: number, oy: number, angle: number, len: number, a: Appearance): void {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const sl = sleeveLen(a, len);
  const sleeve = a.top === 'vest' ? a.accentColor : a.topColor;
  for (let i = 0; i <= len; i++) {
    const x = Math.round(ox + 8 + c * i - 0.5);
    const y = Math.round(oy + 8 + s * i - 0.5);
    let col = i < sl ? sleeve : i === sl && a.top === 'suit' ? P.white : a.skin;
    if (a.trim && i === len - 2) col = a.trim; // wrist band
    pc.rect(x, y, 2, 2, col);
  }
  pc.outline(ox, oy, 17, 17);
}

// ------------------------------------------------------------------ baking

function addFrames(tex: Phaser.Textures.Texture, count: number, fw: number, fh: number, cols: number): void {
  for (let i = 0; i < count; i++) tex.add(i, 0, (i % cols) * fw, Math.floor(i / cols) * fh, fw, fh);
}

const cache = new Map<string, FighterTextures>();

/** Bake (or fetch cached) textures for an appearance. */
export function bakeFighter(scene: Phaser.Scene, a: Appearance): FighterTextures {
  const key = appearanceKey(a);
  const hit = cache.get(key);
  if (hit && scene.textures.exists(hit.body)) return hit;

  const names: FighterTextures = { body: `fb_${key}`, head: `fh_${key}`, arm: `fa_${key}` };

  const bodyCols = 5;
  const body = new PixelCanvas(bodyCols * 32, Math.ceil(BODY_FRAMES / bodyCols) * 32);
  POSES.forEach((p, i) => drawBodyFrame(body, (i % bodyCols) * 32, Math.floor(i / bodyCols) * 32, p, a));
  addFrames(scene.textures.addCanvas(names.body, body.flush())!, BODY_FRAMES, 32, 32, bodyCols);

  const head = new PixelCanvas(48, 16);
  for (let m = 0; m < 3; m++) drawHead(head, m * 16, 0, a, m);
  addFrames(scene.textures.addCanvas(names.head, head.flush())!, 3, 16, 16, 3);

  const arm = new PixelCanvas(ARM_ANGLES * 17, ARM_LENGTHS.length * 17);
  ARM_LENGTHS.forEach((len, li) => {
    for (let k = 0; k < ARM_ANGLES; k++) drawArm(arm, k * 17, li * 17, (k / ARM_ANGLES) * Math.PI * 2, len, a);
  });
  addFrames(scene.textures.addCanvas(names.arm, arm.flush())!, ARM_ANGLES * ARM_LENGTHS.length, 17, 17, ARM_ANGLES);

  cache.set(key, names);
  return names;
}

/** Arm frame index for a local-space angle (0 = forward, +down) and length index. */
export function armFrame(angle: number, lengthIdx: number): number {
  const step = (Math.PI * 2) / ARM_ANGLES;
  let k = Math.round(angle / step) % ARM_ANGLES;
  if (k < 0) k += ARM_ANGLES;
  return lengthIdx * ARM_ANGLES + k;
}
