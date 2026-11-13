import { Raster, ScaledPen, toRuns, type Pen, type Pt } from './pixelRaster';
import type { PokemonPose } from './pokemonArt';
import type { ReferenceFrame } from './pokemonSpriteMotion';

const ORIGIN: Pt = [72, 72];
const INK = 1, DEEP = 2, SHADE = 3, SKIN = 4, LIGHT = 5, LEAF = 6;
const LEAF_LIGHT = 7, BELLY = 8, BELLY_LIGHT = 9, EYE = 10, WHITE = 11, ORB = 12;
const PALETTES = [
  [-1, 0x20362c, 0x306044, 0x46965a, 0x75bb6d, 0xa3d88a, 0x417b49, 0x7dbb68, 0xb75251, 0xe18970, 0xe8d872, 0xf5ecd5, 0xd4d866],
  [-1, 0x22362d, 0x355c39, 0x4c8547, 0x6dab55, 0x9dcd70, 0x356a3b, 0x77a958, 0xad4d4c, 0xdc7562, 0xedd779, 0xf6eed8, 0xd7d66b],
  [-1, 0x163c2e, 0x255a3c, 0x2e8550, 0x43a561, 0x7bc67b, 0x245d3c, 0x66aa51, 0xbd4c51, 0xe87965, 0xf2d572, 0xffefd1, 0xe3d65e],
  [-1, 0x153b2e, 0x22553d, 0x2c7b4c, 0x3e9a5b, 0x78bf70, 0x214e35, 0x5b9645, 0xb83d4d, 0xef756a, 0xf3da76, 0xffecd0, 0xe25765],
] as const;
const SWAY = [0, 1, 2, 1, 0, -1, -2, -1];
const BREATH = [0, 0, -1, -1, -1, 0, 0, 0];
const STRIKE = [0.6, 1, 0.92, 0.72, 0.48, 0.25, 0.1, 0];
const CAST = [0.12, 0.55, 1, 1, 0.88, 0.62, 0.32, 0];
const HURT = [0.4, 1, 0.88, 0.65, 0.42, 0.24, 0.1, 0];
const FALL = [0, 0.1, 0.3, 0.59, 0.83, 0.96, 1, 1];
const WALK_X = [4, 2, 0, -3, -4, -2, 0, 3];
const WALK_Y = [0, 0, 0, 0, 0, 2, 3, 2];
const RUN_X = [8, 5, 0, -5, -9, -7, 0, 7];
const RUN_Y = [0, 0, 0, 2, 4, 7, 7, 3];
const add = (a: Pt, x: number, y: number): Pt => [a[0] + x, a[1] + y];

interface GeckoPose {
  hip: Pt;
  chest: Pt;
  head: Pt;
  feet: readonly [Pt, Pt];
  hands: readonly [Pt, Pt];
  tail: number;
  crown: number;
  mouth: number;
}

function poseFor(rank: number, pose: PokemonPose, phase: number): GeckoPose {
  const grown = rank >= 2;
  const middle = rank === 1;
  let hip: Pt = [-2, grown ? -12 : middle ? -9 : -6];
  let chest: Pt = [0, grown ? -23 : middle ? -17 : -11];
  let head: Pt = [grown ? 5 : 4, grown ? -32 : middle ? -25 : -17];
  let feet: [Pt, Pt] = [[grown ? -8 : -5, -2], [grown ? 7 : 4, -2]];
  let hands: [Pt, Pt] = [[grown ? 8 : 5, chest[1] + 5], [grown ? 10 : 6, chest[1] + 7]];
  let tail = SWAY[phase];
  let crown = SWAY[(phase + 2) % 8] * 0.45;
  let mouth = 0;
  if (pose === 'idle') {
    chest = add(chest, 0, BREATH[phase] * 0.65);
    head = add(head, 0, BREATH[phase] * 0.45);
  }

  if (pose === 'walk' || pose === 'run' || pose === 'dash') {
    const sprint = pose !== 'walk';
    const xs = sprint ? RUN_X : WALK_X;
    const ys = sprint ? RUN_Y : WALK_Y;
    const far = (phase + 4) % 8;
    const stride = grown ? 1.15 : middle ? 0.85 : 0.57;
    const bob = sprint ? [0, -1, -2, -2, -1, 0, 1, 1][phase] : BREATH[phase];
    feet = [[-2 + xs[far] * stride, -2 - ys[far] * stride], [xs[phase] * stride, -2 - ys[phase] * stride]];
    hip = add(hip, sprint ? -2 : 0, bob + (sprint ? 1 : 0));
    chest = add(chest, sprint ? 5 : 1, bob + (sprint ? grown ? 6 : middle ? 4 : 2 : 0));
    head = add(head, sprint ? 9 : 1, bob + (sprint ? grown ? 6 : middle ? 4 : 2 : 0));
    const swing = SWAY[phase] * (sprint ? 2 : 1);
    hands = [[-5 - swing, chest[1] + 3], [sprint ? -2 + swing : 6 + swing, chest[1] + (sprint && grown ? 7 : 4)]];
    tail = (sprint ? -4 : 0) + SWAY[(phase + 4) % 8];
    crown = SWAY[(phase + 3) % 8] - (sprint ? 3 : 0);
    if (pose === 'dash') {
      chest = add(chest, grown ? 6 : 3, grown ? 3 : 1);
      head = add(head, grown ? 8 : 4, grown ? 3 : 1);
      feet = [[grown ? -15 : -8, -9], [grown ? -8 : -4, -7]];
      hands = [add(chest, -8, 3), add(chest, grown ? 16 : 11, 0)];
      tail -= 4;
      crown -= 2;
    }
  }
  if (pose === 'cast') {
    const power = CAST[phase];
    const drive = [-2,-4,5,4,0,-0.5,-0.2,0][phase];
    hip = add(hip, -power, power);
    chest = add(chest, drive * 0.5, power);
    head = add(head, drive, -power);
    feet = [[grown ? -10 : -6,-2],[grown ? 9 : 5,-2]];
    hands = [add(chest, -5 * power, 4), add(chest, 4 + 10 * power, -4 * power)];
    tail = 4 * power;
    crown = -4 * power;
    mouth = power;
  } else if (pose === 'punch' || pose === 'backhand' || pose === 'kick') {
    const power = STRIKE[phase];
    chest = add(chest, power * 4, power);
    head = add(head, power * 3, -power);
    if (pose === 'kick') {
      feet[1] = add(feet[1], (grown ? 17 : 10) * power, -(grown ? 13 : 8) * power);
      hands = [add(chest, -4, 5), add(chest, -3, 7)];
    } else if (pose === 'backhand') {
      chest = add(chest, -2 * power, -2 * power);
      hands = [add(chest, 4 + (grown ? 19 : 12) * power, -4 * power), add(chest, 3 - 7 * power, 5)];
      tail = 6 * power;
    } else {
      hands = [add(chest, -3, 4), add(chest, (grown ? 18 : 12) * power, power)];
    }
    if (pose !== 'backhand') tail = -4 * power;
    crown = -3 * power;
  } else if (pose === 'guard' || pose === 'windup') {
    const power = pose === 'guard' ? 1 : 0.3 + phase * 0.1;
    hip = add(hip, -2 * power, power);
    chest = add(chest, -3 * power, 2 * power);
    head = add(head, -3 * power, 3 * power);
    hands = [add(head, 5, 6), add(head, 2, 8)];
    tail += 3 * power;
    crown += 2 * power;
  } else if (pose === 'cling') {
    chest = add(chest, 1, 0);
    feet = [[-4, -8], [3, -7]];
    hands = [add(chest, 7, -4), add(chest, 9, -1)];
    tail = 3;
  } else if (pose === 'air' || pose === 'takeoff') {
    chest = add(chest, 2, -1);
    head = add(head, 3, -2);
    feet = [[grown ? -11 : -7, -9], [2, -7]];
    hands = [add(chest, -6, 2), add(chest, 9, 0)];
    tail = -5 + SWAY[phase];
    crown -= 3;
  } else if (pose === 'land') {
    const power = STRIKE[phase];
    hip = add(hip, -power, (rank ? 3 : 1) * power);
    chest = add(chest, 3 * power, (rank ? 4 : 2) * power);
    head = add(head, 4 * power, (rank ? 4 : 2) * power);
    feet = [[grown ? -10 : -7, -2], [grown ? 10 : 6, -2]];
    hands = [add(chest, -1, 5), add(chest, 4, 6)];
    tail -= 4 * power;
  } else if (pose === 'hurt') {
    const power = HURT[phase];
    hip = add(hip, -2 * power, 0);
    chest = add(chest, -5 * power, power);
    head = add(head, -7 * power, -power);
    hands = [add(chest, 3, 3), add(chest, 4, 6)];
    tail += 5 * power;
    crown += 4 * power;
  } else if (pose === 'faint') {
    const power = FALL[phase];
    hip = add(hip, -3 * power, (grown ? 4 : middle ? 2 : 0) * power);
    chest = add(chest, 6 * power, (grown ? 15 : middle ? 9 : 3) * power);
    head = add(head, 8 * power, (grown ? 19 : middle ? 12 : 5) * power);
    feet = [[-10, -2], [-3, -2]];
    hands = [[5, -3], [11, -3]];
    tail = 3 * power;
    crown = -2 * power;
  }
  return { hip, chest, head, feet, hands, tail, crown, mouth };
}

function limb(r: Pen, root: Pt, knee: Pt, end: Pt, near: boolean, width: number): void {
  r.stroke([root, knee, end], INK, width + 2);
  r.stroke([root, knee, end], near ? SKIN : SHADE, width);
  if (near && width > 2) r.line(root[0] - 1, root[1], knee[0] - 1, knee[1], LIGHT);
}

function elbow(root: Pt, hand: Pt): Pt {
  return [(root[0] + hand[0]) / 2 - 1, (root[1] + hand[1]) / 2 + 1];
}

function foot(r: Pen, at: Pt, near: boolean, rank: number): void {
  const width = rank >= 2 ? 6 : 4;
  r.poly([add(at, -2, -2), add(at, width - 2, -2), add(at, width + 1, 0), add(at, width, 2), add(at, -3, 2)], INK);
  r.line(at[0] - 1, at[1] - 1, at[0] + width - 1, at[1] - 1, near ? SKIN : SHADE, 2);
  r.set(at[0] + width, at[1], near ? WHITE : LIGHT);
  if (rank >= 1) r.set(at[0] + width - 2, at[1], near ? WHITE : LIGHT);
}

function leaf(r: Pen, root: Pt, tip: Pt, width: number, near = true): void {
  const dx = tip[0] - root[0], dy = tip[1] - root[1];
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length * width, ny = dx / length * width;
  const middle: Pt = [root[0] + dx * 0.45, root[1] + dy * 0.45];
  r.poly([root, add(middle, nx, ny), tip, add(middle, -nx, -ny)], INK);
  r.poly([add(root, dx / length, dy / length), add(middle, nx * 0.72, ny * 0.72),
    add(tip, -dx / length, -dy / length), add(middle, -nx * 0.72, -ny * 0.72)], near ? LEAF : DEEP);
  r.line(root[0], root[1], tip[0] - dx / length * 2, tip[1] - dy / length * 2, near ? LEAF_LIGHT : SHADE);
}

function tail(r: Pen, hip: Pt, rank: number, sway: number): void {
  const root = add(hip, -3, 0);
  if (rank === 0) {
    const curve = add(root, -7, -1 + sway * 0.4);
    const tip = add(root, -12, -8 + sway);
    r.stroke([root, curve, tip], INK, 6);
    r.stroke([root, curve, tip], LEAF, 4);
    r.ellipse(tip[0] - 2, tip[1] - 1, 4.2, 5.6, INK);
    r.ellipse(tip[0] - 2, tip[1] - 1, 3.2, 4.6, SKIN);
    r.ellipse(tip[0] + 2, tip[1] + 3, 3.4, 4.2, INK);
    r.ellipse(tip[0] + 2, tip[1] + 3, 2.4, 3.2, LIGHT);
    r.line(root[0] - 2, root[1] - 1, tip[0] - 2, tip[1] - 1, LEAF_LIGHT);
    return;
  }
  const tip = add(root, rank === 3 ? -42 : rank === 2 ? -31 : -23, -7 + sway);
  r.stroke([root, add(root, -12, -4 + sway * 0.4), tip], INK, rank >= 2 ? 7 : 5);
  r.stroke([root, add(root, -12, -4 + sway * 0.4), tip], LEAF, rank >= 2 ? 5 : 3);
  const pairs = rank === 3 ? 5 : rank === 2 ? 4 : 2;
  for (let i = 0; i < pairs; i++) {
    const distance = 7 + i * (rank === 3 ? 7 : 6);
    const at = add(root, -distance, -distance * 0.12 + sway * distance / Math.abs(tip[0] - root[0]));
    const size = rank === 3 ? 13 - i * 0.8 : rank === 2 ? 12 - i : 13;
    leaf(r, at, add(at, -7 - i, -size), rank >= 2 ? 4.3 : 3.5, false);
    leaf(r, at, [at[0] - 9 - i, Math.min(-3, at[1] + size * 0.6)], rank >= 2 ? 4.8 : 3.5);
    if (rank === 3) r.line(at[0] - 1, at[1] - 1, at[0] - 3, at[1] + 2, BELLY_LIGHT, 2);
  }
  r.line(root[0] - 2, root[1] - 1, tip[0] + 1, tip[1] - 1, LEAF_LIGHT);
  if (rank === 3) {
    leaf(r, add(tip, 0, 0), add(tip, -11, -2), 5);
    r.poly([add(tip, -3, -3), add(tip, -1, -1), add(tip, -4, 3), add(tip, -7, 1)], BELLY);
  }
}

function head(r: Pen, at: Pt, rank: number, crown: number, mouth: number, closed: boolean): Pt {
  const grown = rank >= 2;
  const [x, y] = at;
  if (rank === 1) {
    leaf(r, [x - 3, y - 4], [x - 24, y - 12 + crown], 4.5, false);
    leaf(r, [x - 1, y - 5], [x - 22, y - 17 + crown], 4.2);
  }
  const back = grown ? 7 : 6;
  const snout = grown ? 13 : rank ? 10 : 9;
  r.poly([[x - back, y + 2], [x - back - 1, y - 3], [x - 3, y - 8], [x + 3, y - 7],
    [x + 7, y - 4], [x + snout, y], [x + snout - 1, y + 4], [x + 5, y + 6], [x - 2, y + 5]], INK);
  r.poly([[x - back + 1, y + 1], [x - back + 1, y - 3], [x - 3, y - 6], [x + 3, y - 5],
    [x + 7, y - 2], [x + snout - 1, y], [x + snout - 2, y + 3], [x + 4, y + 4], [x - 2, y + 3]], SKIN);
  r.poly([[x - 4, y - 3], [x - 2, y - 6], [x + 3, y - 5], [x + 5, y - 3], [x, y - 4]], LIGHT);
  r.line(x + 2, y + 3, x + snout - 2, y + 2, DEEP);
  if (mouth > 0.3) {
    r.line(x + 6, y + 3, x + snout - 2, y + 3 + Math.round(mouth * 2), INK, 2);
    r.set(x + snout - 4, y + 4, BELLY_LIGHT);
  }
  r.poly([[x + 1, y - 4], [x + 7, y - 2], [x + 5, y], [x + 1, y - 1]], INK);
  if (!closed) {
    r.line(x + 2, y - 3, x + 5, y - 2, EYE);
    r.set(x + 4, y - 2, INK);
    r.set(x + 2, y - 3, WHITE);
  }
  r.set(x + snout - 2, y, DEEP);
  if (grown) {
    r.poly([[x - 7, y - 3], [x - 7, y - 13], [x - 4, y - 14], [x - 1, y - 7]], INK);
    r.poly([[x - 6, y - 4], [x - 6, y - 11], [x - 4, y - 12], [x - 2, y - 6]], SKIN);
    r.line(x - 6, y - 10, x - 4, y - 7, LIGHT);
    if (rank === 3) {
      r.poly([[x - 4, y - 6], [x - 1, y - 13], [x + 2, y - 6]], BELLY);
      r.line(x - 3, y + 4, x + 1, y + 5, BELLY_LIGHT, 2);
    }
  }
  return [x + snout, y + 3];
}

/** Geckos articulate their leaf blades and counterbalance each stride with the tail. */
export function bakeGeckoRig(rank: number, pose: PokemonPose, phase: number): ReferenceFrame {
  rank = Math.max(0, Math.min(3, Math.floor(rank)));
  phase = ((Math.floor(phase) % 8) + 8) % 8;
  if (rank >= 2) return matureGecko(rank, pose, phase);
  const grown = rank >= 2;
  const scale = [0.65, 0.68, 0.9, 1.05][rank];
  const s = poseFor(rank, pose, phase);
  const raster = new Raster(144, 96);
  const r = new ScaledPen(raster, [0, 0], ORIGIN, scale);
  const width = grown ? 3 : 2;
  tail(r, s.hip, rank, s.tail);

  const farKnee: Pt = [s.hip[0] - (grown ? 6 : 4), (s.hip[1] + s.feet[0][1]) / 2];
  limb(r, add(s.hip, 1, 0), farKnee, add(s.feet[0], 0, -2), false, width + 1);
  foot(r, s.feet[0], false, rank);
  const farShoulder = add(s.chest, 2, 1);
  const farElbow = elbow(farShoulder, s.hands[0]);
  limb(r, farShoulder, farElbow, s.hands[0], false, width);
  if (rank > 0) leaf(r, farElbow, add(s.hands[0], 5, -7), grown ? 4.5 : 3.5, false);

  r.stroke([s.hip, s.chest], INK, grown ? 12 : rank ? 9 : 7);
  r.ellipse(s.hip[0], s.hip[1], grown ? 6.7 : rank ? 5 : 4, grown ? 7 : rank ? 5.5 : 4.5, INK);
  r.stroke([s.hip, s.chest], SKIN, grown ? 10 : rank ? 7 : 5);
  r.ellipse(s.hip[0], s.hip[1] - 0.5, grown ? 5.6 : rank ? 4 : 3.2, grown ? 5.8 : rank ? 4.5 : 3.5, SKIN);
  r.line(s.chest[0] - 2, s.chest[1], s.hip[0] - 3, s.hip[1], LIGHT, 2);
  r.poly([add(s.chest, 2, 2), add(s.chest, 4, 3), add(s.hip, 4, 1), add(s.hip, 1, 4), add(s.hip, 0, -1)], BELLY);
  r.line(s.chest[0] + 2, s.chest[1] + 3, s.hip[0] + 2, s.hip[1] + 1, BELLY_LIGHT);
  if (grown) {
    const spineX = s.chest[0] - s.hip[0];
    const spineY = s.chest[1] - s.hip[1];
    const spineLength = Math.hypot(spineX, spineY) || 1;
    for (const progress of [0.12, 0.48, 0.84]) {
      const at: Pt = [
        s.chest[0] - spineX * progress + spineY / spineLength * 4.3,
        s.chest[1] - spineY * progress - spineX / spineLength * 4.3,
      ];
      r.ellipse(at[0], at[1], 2, 2.5, DEEP);
      r.ellipse(at[0] - 0.5, at[1] - 0.5, 1.4, 1.8, ORB);
      r.set(at[0], at[1] - 1, EYE);
    }
  }
  const nearKnee: Pt = [s.hip[0] + (grown ? 6 : 4), (s.hip[1] + s.feet[1][1]) / 2 - 1];
  limb(r, add(s.hip, -1, 1), nearKnee, add(s.feet[1], 0, -2), true, width + 1);
  foot(r, s.feet[1], true, rank);

  const nearShoulder = add(s.chest, -1, 1);
  const nearElbow = elbow(nearShoulder, s.hands[1]);
  limb(r, nearShoulder, nearElbow, s.hands[1], true, width);
  if (rank > 0) {
    for (const i of [0, 1, 2]) leaf(r, add(nearElbow, -i * 1.5, -i), add(s.hands[1], 8 - i * 2, -8 - i * 3), grown ? 3.3 : 2.7);
  }
  r.line(s.hands[1][0], s.hands[1][1], s.hands[1][0] + 4, s.hands[1][1] - 1, rank ? WHITE : EYE);
  r.stroke([s.chest, add(s.head, -1, 3)], INK, grown ? 8 : 6);
  r.stroke([s.chest, add(s.head, -1, 3)], SKIN, grown ? 6 : 4);
  const muzzle = head(r, s.head, rank, s.crown, s.mouth, pose === 'faint' && phase > 2 || pose === 'hurt' && phase < 3 || pose === 'idle' && phase === 7);
  const anchor = ([x, y]: Pt): Pt => [Math.round(x * scale), Math.round(y * scale)];
  return {
    sprite: toRuns(Int32Array.from(raster.m, ink => PALETTES[rank][ink]), raster.w, raster.h),
    originX: ORIGIN[0], originY: ORIGIN[1], muzzle: anchor(muzzle),
    saddle: grown ? anchor(add(s.chest, -5, -3)) : undefined,
  };
}

/** Adult geckos have a tapered torso, red throat, seed rows and a solid conifer tail. */
function matureGecko(rank:number,pose:PokemonPose,phase:number):ReferenceFrame {
  const mega=rank===3,scale=mega?1.05:.9;
  const raster=new Raster(144,96),r=new ScaledPen(raster,[0,0],ORIGIN,scale);
  const s=poseFor(rank,pose,phase),face=add(s.head,0,-.5);
  const closed=pose==='faint'&&phase>2||pose==='hurt'&&phase<3||pose==='idle'&&phase===7;
  const joint=(root:Pt,knee:Pt,end:Pt,width:number,near:boolean)=>{
    r.stroke([root,knee,end],INK,width+1.4);r.stroke([root,knee,end],near?SKIN:SHADE,width);
    if(near)r.line(root[0]-.7,root[1]-.5,knee[0]-.7,knee[1]-.5,LIGHT);
  };
  const clawFoot=(at:Pt,near:boolean)=>{
    r.poly([add(at,-3,-2),add(at,2,-2),add(at,6,-.7),add(at,7,1),add(at,1,2),add(at,-3,1)],INK);
    r.poly([add(at,-2.3,-1.4),add(at,1.7,-1.4),add(at,4.8,-.3),add(at,5.2,.6),add(at,0,1),add(at,-2.3,.5)],near?SKIN:SHADE);
    for(const [dx,dy]of [[2,-.8],[4,.1],[5.5,.9]] as const)r.line(at[0]+dx,at[1]+dy,at[0]+dx+1.8,at[1]+dy+.2,WHITE);
  };
  const clawHand=(at:Pt,near:boolean)=>{
    r.ellipse(at[0],at[1],2.4,2.1,INK);r.ellipse(at[0]-.2,at[1]-.2,1.8,1.5,near?SKIN:SHADE);
    for(const dy of [-1.5,0,1.6])r.line(at[0]+1.5,at[1]+dy,at[0]+4,at[1]+dy-.5,WHITE);
  };
  const root=add(s.hip,-4,-1),sway=s.tail;
  const extent=mega?45:32;
  const tip=add(root,-extent,-7+sway);
  r.poly([root,add(root,-12,-5+sway*.25),add(tip,3,-2),add(tip,-2,1),add(root,-12,3+sway*.4),add(root,1,3)],INK);
  r.poly([add(root,-1,0),add(root,-12,-3+sway*.25),add(tip,3,-.5),add(root,-12,1.5+sway*.4)],SKIN);
  const tiers=mega?5:4;
  for(let i=tiers-1;i>=0;i--){
    const t=(i+.35)/tiers;
    const at=add(root,-5-t*(extent-8),-1-t*5+sway*t);
    const breadth=(mega?15:12)-i*(mega?1.4:1.5);
    const crown:Pt=[at[0]-3.5-i*.6,at[1]-breadth];
    const lower:Pt=[at[0]-6-i*.4,Math.min(-3,at[1]+breadth*.64)];
    r.poly([add(at,4,-1),crown,add(at,-8-i,-2),add(at,-3,2)],INK);
    r.poly([add(at,2,-.8),add(crown,.4,1.8),add(at,-6-i,-1),add(at,-2,1)],LEAF);
    r.line(at[0]+1,at[1]-1,crown[0]+.4,crown[1]+2,LEAF_LIGHT);
    r.poly([add(at,3,0),add(at,-7-i,1),lower,add(at,-1,4)],INK);
    r.poly([add(at,1.8,.3),add(at,-5.5-i,1.6),add(lower,.5,-1.2),add(at,-1,2.7)],LEAF);
    r.line(at[0],at[1]+1,lower[0]+1,lower[1]-1,LEAF_LIGHT);
    if(mega){
      r.poly([add(crown,0,.5),add(crown,.6,4.2),add(crown,2,5.5),add(crown,1.3,1.6)],BELLY_LIGHT);
      r.poly([lower,add(lower,2,-2.3),add(lower,3,-1),add(lower,1.6,.8)],BELLY);
    }
  }
  if(mega){
    r.poly([add(tip,4,-3),add(tip,-7,-4),add(tip,-10,-1),add(tip,-4,2),add(tip,4,3)],INK);
    r.poly([add(tip,3,-2),add(tip,-6,-2.5),add(tip,-8,-1),add(tip,-3,1),add(tip,3,2)],LEAF);
    r.line(tip[0]-6,tip[1]-2,tip[0]-8,tip[1]-.5,BELLY_LIGHT,2);
  }
  const farKnee:Pt=[s.hip[0]-6,(s.hip[1]+s.feet[0][1])/2-1];
  joint(add(s.hip,-1,0),farKnee,add(s.feet[0],0,-2),4.1,false);clawFoot(s.feet[0],false);
  const farShoulder=add(s.chest,1.6,1.1),farElbow=elbow(farShoulder,s.hands[0]);
  joint(farShoulder,farElbow,s.hands[0],2.8,false);clawHand(s.hands[0],false);
  leaf(r,add(farElbow,-.5,-1),add(s.hands[0],3,-9),3.3,false);
  r.poly([add(s.chest,-4,-2),add(s.chest,2.6,-2),add(s.chest,4.5,3),add(s.hip,3.2,-1),add(s.hip,4.8,3.8),add(s.hip,-1,6.1),add(s.hip,-5,2),add(s.chest,-3,3.8)],INK);
  r.poly([add(s.chest,-3,-1.2),add(s.chest,2,-1.1),add(s.chest,3.2,3),add(s.hip,2.3,-1),add(s.hip,3.6,3.5),add(s.hip,-.8,4.7),add(s.hip,-3.8,1.5),add(s.chest,-2.4,3)],SKIN);
  r.line(s.chest[0]-1.9,s.chest[1]+.2,s.hip[0]-2.2,s.hip[1]+1,LIGHT);
  r.poly([add(s.chest,1.5,1),add(s.chest,3.3,2.7),add(s.hip,3.2,2.6),add(s.hip,.5,4),add(s.hip,.3,-1)],BELLY);
  r.line(s.chest[0]+2,s.chest[1]+3,s.hip[0]+2,s.hip[1]+1,BELLY_LIGHT);
  // Both rows of seeds sit on the back and follow the rotating spine.
  const spine:Pt=[s.hip[0]-s.chest[0],s.hip[1]-s.chest[1]];
  for(const t of [.1,.42,.75])for(const row of [0,1]){
    const at:Pt=[s.chest[0]+spine[0]*t-4.4-row*1.8,s.chest[1]+spine[1]*t+row*1.5];
    r.ellipse(at[0],at[1],row?1.7:2.1,row?1.9:2.4,INK);
    r.ellipse(at[0]-.2,at[1]-.3,row?1.2:1.55,row?1.35:1.75,ORB);
    r.set(at[0]-.4,at[1]-1,mega?BELLY_LIGHT:EYE);
  }
  const nearKnee:Pt=[s.hip[0]+6.3,(s.hip[1]+s.feet[1][1])/2-1.5];
  joint(add(s.hip,1,1),nearKnee,add(s.feet[1],0,-2),4.7,true);clawFoot(s.feet[1],true);
  const nearShoulder=add(s.chest,-1.1,1),nearElbow=elbow(nearShoulder,s.hands[1]);
  joint(nearShoulder,nearElbow,s.hands[1],3,true);
  leaf(r,add(nearElbow,-1,-1),add(s.hands[1],5,-8),mega?4.2:3.5);
  leaf(r,add(nearElbow,-2.2,-3),add(s.hands[1],1,-12),mega?4:3.1);
  clawHand(s.hands[1],true);
  r.stroke([s.chest,add(face,-1,3)],INK,6.5);r.stroke([s.chest,add(face,-1,3)],SKIN,4.9);
  // Red throat continues under the jaw; the cheek stays green and the iris stays yellow.
  r.line(s.chest[0]+1,s.chest[1]-1,face[0]+3,face[1]+4.3,BELLY,2.3);
  r.poly([add(face,-6,2),add(face,-7,-3),add(face,-4,-8),add(face,.5,-8),add(face,5,-4.8),add(face,12,-.5),add(face,13,2),add(face,8,5),add(face,1,5.3)],INK);
  r.poly([add(face,-5.1,1.5),add(face,-5.6,-3),add(face,-3.5,-6.5),add(face,.4,-6.5),add(face,4.5,-3.5),add(face,11,-.1),add(face,11.6,1.6),add(face,7.6,3.7),add(face,1,4.1)],SKIN);
  r.poly([add(face,-4.8,-2),add(face,-3.3,-6),add(face,.4,-6),add(face,3,-3.8),add(face,-.3,-4.5)],LIGHT);
  r.poly([add(face,-6,-2),add(face,-9,-10),add(face,-7,-12),add(face,-3,-7),add(face,-1,-5)],INK);
  r.poly([add(face,-5.6,-2.3),add(face,-7.4,-9.6),add(face,-6.6,-10.5),add(face,-3.9,-6.8),add(face,-2.5,-5)],SKIN);
  r.line(face[0]-6.4,face[1]-8.7,face[0]-4,face[1]-6.7,LIGHT);
  r.poly([add(face,-1,-5),add(face,-.3,-10.7),add(face,1.6,-10),add(face,4,-4.8)],INK);
  r.poly([add(face,-.2,-5.5),add(face,.3,-9),add(face,1.1,-8.8),add(face,2.7,-5.3)],mega?BELLY:SKIN);
  if(mega){
    r.poly([add(face,-5,-7),add(face,-5,-12),add(face,-2,-11),add(face,1,-6),add(face,4,-4.3),add(face,1,-3)],BELLY);
    r.line(face[0]-3.8,face[1]-10,face[0]-.3,face[1]-6,BELLY_LIGHT);
  }
  r.poly([add(face,-.5,-4.3),add(face,5.5,-3),add(face,6.1,-.3),add(face,1,.4),add(face,-.5,-1.1)],INK);
  if(!closed){
    r.poly([add(face,.4,-3.4),add(face,4.9,-2.6),add(face,5,-.8),add(face,1,-.5)],EYE);
    r.line(face[0]+3.9,face[1]-2.7,face[0]+4,face[1]-.9,INK);
    r.set(face[0]+1,face[1]-2.9,WHITE);
  }
  r.poly([add(face,1,3.5),add(face,5,3),add(face,11.1,1.6),add(face,10,3.7),add(face,6,5),add(face,1,4.7)],BELLY);
  r.line(face[0]+3,face[1]+2.3,face[0]+11,face[1]+1.2,DEEP);
  if(s.mouth>.3)r.line(face[0]+6,face[1]+2.5,face[0]+10,face[1]+2.5+s.mouth*1.5,INK,1.3);
  r.set(face[0]+10,face[1]-.1,DEEP);
  r.set(face[0]+7,face[1]+2.4,WHITE);
  const anchor=([x,y]:Pt):Pt=>[Math.round(x*scale),Math.round(y*scale)];
  return {sprite:toRuns(Int32Array.from(raster.m,ink=>PALETTES[rank][ink]),raster.w,raster.h),originX:ORIGIN[0],originY:ORIGIN[1],muzzle:anchor(add(face,13,3))};
}
