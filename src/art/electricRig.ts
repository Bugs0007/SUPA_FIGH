import { bake, Raster, ScaledPen, type Material, type Pen, type Pt } from './pixelRaster';
import type { PokemonPose } from './pokemonArt';
import type { ReferenceFrame } from './pokemonSpriteMotion';

const ORIGIN: Pt = [50, 60];
const OUTLINE = 0x36252c;
const flat = (c: number): Material => ({ dark: c, base: c, light: c, hi: c });
const YELLOW = 1, SHADE = 2, LIGHT = 3, BELLY = 4, BROWN = 5, BLACK = 6, WHITE = 7, CHEEK = 8, FAR = 9;
const PALETTES = [
  [0xf4cf43, 0xc79435, 0xffe881, 0xffe6a4, 0x8e572e, 0x352b32, 0xfff9e0, 0xdc6450, 0xbd9b3e],
  [0xe99b43, 0xc16e38, 0xffbd64, 0xffeac5, 0x765139, 0x342d35, 0xfff8dd, 0xeac65a, 0xbb763d],
  [0xe5b936, 0xb8892d, 0xffdf61, 0xffe5aa, 0x805530, 0x362c30, 0xfff6d9, 0xf6d759, 0xb88c31],
] as const;
const CYCLE = [0, 0.71, 1, 0.71, 0, -0.71, -1, -0.71];
const LIFT = [0, 0, 0, 2, 4, 3, 1, 0];
const RECOVER = [1, 1, 0.9, 0.7, 0.47, 0.26, 0.1, 0];
const FALL = [0, 0.1, 0.3, 0.57, 0.81, 0.96, 1, 1];
const CAST = [0.15, 0.55, 1, 1, 0.8, 0.5, 0.2, 0];

interface RodentPose {
  hip: Pt;
  chest: Pt;
  head: Pt;
  feet: readonly [Pt, Pt];
  hands: readonly [Pt, Pt];
  tail: number;
  ear: number;
  eyeClosed: boolean;
}

const offset = (p: Pt, x: number, y: number): Pt => [p[0] + x, p[1] + y];

function poseFor(rank: number, pose: PokemonPose, phase: number): RodentPose {
  const small = rank === 0;
  const h = small ? 0 : rank === 2 ? 2 : 0;
  let hip: Pt = small ? [-3, -5] : [-3, -7 - h];
  let chest: Pt = small ? [0, -8] : [0, -13 - h];
  let head: Pt = small ? [4, -12] : [5, -19 - h];
  let feet: [Pt, Pt] = [[-5, -2], [3, -2]];
  let hands: [Pt, Pt] = [offset(chest, 4, 4), offset(chest, 6, 3)];
  let tail = CYCLE[phase] * 0.7;
  let ear = CYCLE[(phase + 2) & 7] * 0.7;
  let eyeClosed = pose === 'idle' && phase === 7;
  const power = RECOVER[phase];

  if (pose === 'walk' || pose === 'run') {
    const sprint = pose === 'run';
    const stride = sprint ? 6 : 3;
    const bob = sprint ? [0, -1, -2, -1, 0, -1, -2, -1][phase] : [0, 0, -1, -1, 0, 0, -1, -1][phase];
    hip = offset(hip, sprint ? -2 : 0, bob);
    chest = offset(chest, sprint ? 5 : 1, bob + (sprint ? 3 : 0));
    head = offset(head, sprint ? 6 : 1, bob + (sprint ? 5 : 0));
    feet = [[-3 + CYCLE[phase] * stride, -2 - LIFT[phase]], [3 + CYCLE[(phase + 4) & 7] * stride, -2 - LIFT[(phase + 4) & 7]]];
    hands = [offset(chest, 3 - CYCLE[phase] * stride, sprint ? 5 : 3), offset(chest, 4 + CYCLE[phase] * stride, sprint ? 5 : 4)];
    tail += sprint ? -3 : 0;
    ear += sprint ? 3 : 0;
  } else if (pose === 'punch' || pose === 'kick') {
    chest = offset(chest, 3 * power, power);
    head = offset(head, 2 * power, power);
    hands = [offset(chest, 3 - power * 2, 3), offset(chest, 5 + power * 7, 1 - power * 2)];
    if (pose === 'kick') feet = [[-5, -2], [3 + 9 * power, -2 - 6 * power]];
    tail += power * 3;
    ear += power * 2;
  } else if (pose === 'cast') {
    const charge = CAST[phase];
    chest = offset(chest, -charge * 2, charge);
    head = offset(head, charge * 2, charge);
    hands = [offset(chest, 2, 2 - charge), offset(chest, 5, 3 - charge * 2)];
    feet = [[-6, -2], [4, -2]];
    ear -= charge * 3;
    tail += charge * 2;
  } else if (pose === 'windup' || pose === 'guard') {
    hip = offset(hip, -1, 1);
    chest = offset(chest, -2, 2);
    head = offset(head, -1, 2);
    hands = [offset(head, 1, 3), offset(head, 4, 4)];
    ear += 2;
  } else if (pose === 'dash') {
    hip = offset(hip, -2, -1);
    chest = offset(chest, 5, 3);
    head = offset(head, 7, 5);
    feet = [[-8, -4 - LIFT[phase] * 0.5], [-1, -3 - LIFT[(phase + 4) & 7] * 0.5]];
    hands = [offset(chest, 1, 3), offset(chest, 5, 2)];
    tail -= 4;
    ear += 4;
  } else if (pose === 'air' || pose === 'takeoff' || pose === 'cling') {
    feet = [[-3, -6], [3, -5]];
    hands = pose === 'cling' ? [offset(head, 5, 3), offset(head, 5, 6)] : [offset(chest, 4, 0), offset(chest, 6, 2)];
    hip = offset(hip, 0, -1);
    tail += 2;
    ear -= 1;
  } else if (pose === 'land') {
    hip = offset(hip, 0, 2 * power);
    chest = offset(chest, 2 * power, 3 * power);
    head = offset(head, 2 * power, 3 * power);
    feet = [[-6, -2], [4, -2]];
    hands = [offset(chest, 3, 4), offset(chest, 5, 3)];
    tail += power * 3;
  } else if (pose === 'hurt') {
    chest = offset(chest, -4 * power, 2 * power);
    head = offset(head, -5 * power, power);
    hands = [offset(chest, 1, 2), offset(chest, 4, 2)];
    ear += power * 4;
    tail -= power * 3;
    eyeClosed = power > 0.5;
  } else if (pose === 'faint') {
    const fall = FALL[phase];
    hip = offset(hip, -2 * fall, (small ? 2 : 4) * fall);
    chest = offset(chest, 3 * fall, (small ? 3 : 8) * fall);
    head = offset(head, 6 * fall, (small ? 7 : 14 + h) * fall);
    feet = [[-6, -2], [0, -2]];
    hands = [[6, -2], [9, -2]];
    ear += 7 * fall;
    tail -= 3 * fall;
    eyeClosed = true;
  }
  return { hip, chest, head, feet, hands, tail, ear, eyeClosed };
}

function rodentTail(p: Pen, body: RodentPose, rank: number): void {
  const root = offset(body.hip, -3, 0);
  if (rank === 0) {
    const x = root[0], y = root[1] + body.tail;
    p.poly([[x, y], [x - 5, y - 1], [x - 4, y - 5], [x - 8, y - 5], [x - 6, y - 11],
      [x - 15, y - 10], [x - 16, y - 14], [x - 3, y - 16], [x - 7, y - 8],
      [x - 1, y - 8], [x - 3, y - 3], [x + 1, y - 2]], BROWN);
    p.poly([[x - 4, y - 7], [x - 6, y - 11], [x - 14, y - 10], [x - 15, y - 13],
      [x - 5, y - 14], [x - 8, y - 7]], YELLOW);
    p.line(x - 14, y - 12, x - 7, y - 13, LIGHT);
    return;
  }
  const tip: Pt = [root[0] - 17, root[1] - 9 + body.tail];
  p.stroke([root, offset(root, -8, 3), offset(root, -16, -1), tip], BROWN, 1.5);
  p.poly([offset(tip, 1, 1), offset(tip, -4, -3), offset(tip, 0, -7), offset(tip, -7, -7),
    offset(tip, -3, -14), offset(tip, -10, -11), offset(tip, -5, -18), offset(tip, 7, -22),
    offset(tip, 0, -12), offset(tip, 7, -13), offset(tip, 1, -4), offset(tip, 5, -5)], YELLOW);
  p.line(tip[0] - 4, tip[1] - 15, tip[0] + 4, tip[1] - 20, LIGHT);
  if (rank === 2) {
    const second = offset(tip, -7, -2);
    p.poly([second, offset(second, -5, -5), offset(second, -2, -11), offset(second, -9, -10),
      offset(second, -3, -21), offset(second, 6, -25), offset(second, -1, -15), offset(second, 5, -16),
      offset(second, -1, -7), offset(second, 3, -7)], LIGHT);
  }
}

function hindLeg(p: Pen, hip: Pt, foot: Pt, near: boolean): void {
  const knee: Pt = [(hip[0] + foot[0]) * 0.5 - 1, Math.min(-3, (hip[1] + foot[1]) * 0.5)];
  p.stroke([hip, knee, foot], near ? YELLOW : FAR, near ? 3 : 2.5);
  p.line(foot[0] - 1, foot[1], foot[0] + 3, foot[1], near ? YELLOW : FAR, 2);
  p.set(foot[0] + 3, foot[1], LIGHT);
}

/** Directly posed side-view cels, including the shoulder-hugging traversal pose. */
export function bakeElectricRig(rank: number, pose: PokemonPose, phase: number): ReferenceFrame {
  rank = Math.max(0, Math.min(2, rank));
  phase &= 7;
  const scale = rank === 0 ? 0.45 : rank === 2 ? 0.78 : 0.62;
  const r = new Raster(114, 74);
  const p = new ScaledPen(r, [0, 0], ORIGIN, scale);
  const body = poseFor(rank, pose, phase);
  const { hip, chest, head, feet, hands } = body;
  rodentTail(p, body, rank);
  hindLeg(p, offset(hip, 2, 1), feet[0], false);
  p.stroke([offset(chest, 1, 1), hands[0]], FAR, 2);
  p.ellipse(hip[0], hip[1] - 2, rank === 0 ? 5.3 : 6, rank === 0 ? 5 : 7, YELLOW);
  p.stroke([hip, chest], YELLOW, rank === 0 ? 7 : 8);
  p.ellipse(hip[0] - 3, hip[1] + 1, 2.2, 2.8, SHADE);
  p.ellipse(chest[0] + 2, chest[1] + 2, 3.7, rank === 0 ? 4 : 6, BELLY);
  p.ellipse(hip[0] - 3, hip[1] - 3, 2.2, 3.2, LIGHT);
  if (rank === 0) {
    p.line(hip[0] - 3, hip[1] - 5, hip[0] - 1, hip[1] - 4, BROWN, 2);
    p.line(hip[0] - 4, hip[1] - 1, hip[0] - 2, hip[1], BROWN, 2);
  } else {
    p.line(hip[0] - 5, hip[1] - 5, hip[0] - 2, hip[1] - 4, BROWN, 2);
    p.line(hip[0] - 6, hip[1], hip[0] - 3, hip[1] + 1, BROWN, 2);
  }
  hindLeg(p, offset(hip, -1, 0), feet[1], true);
  p.stroke([offset(chest, 2, 0), offset(hands[1], -2, -1), hands[1]], YELLOW, 2.5);
  p.set(hands[1][0] + 1, hands[1][1], LIGHT);
  const ear = body.ear;
  p.poly([offset(head, -4, -2), offset(head, -8, -8 + ear), offset(head, -7, -13 + ear),
    offset(head, -3, -8 + ear * 0.5), offset(head, -1, -2)], rank === 0 ? YELLOW : BROWN);
  p.poly([offset(head, -8, -9 + ear), offset(head, -7, -13 + ear), offset(head, -5, -9 + ear * 0.5)], BLACK);
  p.poly([offset(head, -1, -3), offset(head, -2, -10 - ear * 0.4), offset(head, 1, -15 - ear * 0.4),
    offset(head, 3, -9), offset(head, 2, -2)], rank === 0 ? YELLOW : BROWN);
  if (rank > 0) {
    p.poly([offset(head, -7, -10 + ear), offset(head, -6, -7 + ear), offset(head, -4, -5), offset(head, -3, -9)], LIGHT);
    p.poly([offset(head, 0, -11), offset(head, 1, -13), offset(head, 2, -9), offset(head, 0, -7)], LIGHT);
  } else p.poly([offset(head, -1, -12), offset(head, 1, -15), offset(head, 2, -11)], BLACK);
  p.poly([offset(head, -5, -2), offset(head, -3, -6), offset(head, 2, -6), offset(head, 5, -3),
    offset(head, 7, -1), offset(head, 7, 1), offset(head, 4, 3), offset(head, -2, 3), offset(head, -5, 1)], YELLOW);
  p.line(head[0] - 3, head[1] - 4, head[0], head[1] - 5, LIGHT);
  p.ellipse(head[0] + 1, head[1] + 1, rank === 0 ? 1.2 : 1.6, 1.3, CHEEK);
  if (body.eyeClosed) p.line(head[0] + 3, head[1] - 2, head[0] + 5, head[1] - 2, BLACK);
  else {
    p.ellipse(head[0] + 4, head[1] - 2.5, 1, 1.6, BLACK);
    p.set(head[0] + 4, head[1] - 2, BLACK);
    if (rank > 0) p.set(head[0] + 3, head[1] - 3, WHITE);
  }
  p.set(head[0] + 7, head[1] - 1, BLACK);
  p.line(head[0] + 4, head[1] + 2, head[0] + 6, head[1] + 1, BROWN);
  const sprite = bake(r, PALETTES[rank].map(flat), OUTLINE, false);
  sprite.runs = sprite.runs.filter(run => run.y < ORIGIN[1]);
  const point = (p: Pt): Pt => [Math.round(p[0] * scale), Math.round(p[1] * scale)];
  return { sprite, originX: ORIGIN[0], originY: ORIGIN[1],
    muzzle: point(offset(head, 2, 1)),
    ...(rank === 2 ? { saddle: point(offset(chest, -3, -3)) } : {}),
  };
}
