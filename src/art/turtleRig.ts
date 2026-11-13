import { Raster, ScaledPen, toRuns, type Pt } from './pixelRaster';
import type { PokemonPose } from './pokemonArt';
import type { ReferenceFrame } from './pokemonSpriteMotion';

const W = 124, H = 92;
const ORIGIN: Pt = [58, 78];
const INK = 1, DEEP = 2, SHADE = 3, SKIN = 4, LIGHT = 5;
const BELLY = 6, BELLY_LIGHT = 7, SHELL = 8, SHELL_LIGHT = 9;
const RIM = 10, WHITE = 11, EYE = 12, STEEL = 13, STEEL_LIGHT = 14, MOUTH = 15;
const PALETTES = [
  [-1,0x26303d,0x275b72,0x4698ad,0x76c1cb,0xb1e5de,0xe2ba79,0xffe3a0,0x805439,0xb6814c,0xe4dcc0,0xfff7e7,0x4c2a36,0x567887,0xb3c6cb,0x714451],
  [-1,0x282e44,0x304872,0x577aaa,0x819dcc,0xb8c9e9,0xdfbb7c,0xfce2ac,0x72503a,0xac7b48,0xdde5e0,0xfff8eb,0x532b43,0x5a748f,0xc0d3dd,0x8e5267],
  [-1,0x212b3b,0x29475f,0x426885,0x658da9,0x92b4c8,0xc5a671,0xf0d39c,0x614736,0x967146,0xc8d3cf,0xf7f4e8,0x742e3d,0x5c6d7a,0xb6c2c5,0x774858],
  [-1,0x1d293a,0x213e5a,0x365b7e,0x527da0,0x86abc6,0xbda276,0xe9d19d,0x503c30,0x866340,0xc4d1d1,0xf7f4e8,0x802d3c,0x556a7c,0xc2d3d9,0x7c4257],
] as const;
const WALK = [3,2,0,-2,-3,-2,0,2];
const RUN = [5,3,0,-4,-5,-3,0,4];
const LIFT = [0,0,0,2,3,3,1,0];
const BOB = [0,0,-1,-1,0,1,1,0];
const STRIKE = [0.58,1,0.94,0.76,0.52,0.3,0.12,0];
const CAST = [0,0.35,1,1,0.76,0.5,0.2,0];
const FALL = [0,0.13,0.32,0.56,0.78,0.94,1,1];

interface TurtlePose {
  hip: Pt; chest: Pt; head: Pt; feet: readonly [Pt, Pt]; hands: readonly [Pt, Pt];
  tail: number; jaw: number; recoil: number; cannon: number;
}

function turtlePose(pose: PokemonPose, frame: number): TurtlePose {
  let hip: Pt = [-1,-7], chest: Pt = [1,-14], head: Pt = [7,-21];
  let feet: [Pt,Pt] = [[-4,-1],[4,-1]];
  let hands: [Pt,Pt] = [[6,-10],[8,-11]];
  let jaw = 0, recoil = 0, cannon = 0;
  let tail = BOB[(frame + 2) & 7];
  const hit = STRIKE[frame];
  if (pose === 'walk' || pose === 'run') {
    const running = pose === 'run';
    const cycle = running ? RUN : WALK;
    const near = cycle[frame], far = cycle[(frame + 4) & 7];
    const bounce = running ? BOB[frame] : BOB[frame] * 0.5;
    hip = [running ? 0 : -1,-7 + bounce];
    chest = [running ? 4 : 2,-14 + bounce];
    head = [running ? 10 : 8,-21 + bounce];
    feet = [[-3 + near,-1 - LIFT[frame] * (running ? 1.3 : 0.7)], [3 + far,-1 - LIFT[(frame + 4) & 7] * (running ? 1.3 : 0.7)]];
    hands = [[6 - near * 0.7,-10 + bounce], [8 + near * 0.6,-12 + bounce]];
    tail += near * 0.35;
  } else if (pose === 'cast') {
    recoil = [0,0.2,1,0.75,0.48,0.24,0.08,0][frame]; cannon = CAST[frame];
    const load = [0.2,1,-0.4,-0.2,0.3,0.2,0.1,0][frame];
    hip = [-1 - load,-7 + cannon]; chest = [1 - recoil * 3,-14 + cannon]; head = [7 - recoil * 2,-21 + cannon];
    feet = [[-6,-1],[5,-1]];
    hands = [[6 + cannon * 4 - recoil * 2,-12 - cannon * 2],[8 + cannon * 6 - recoil * 2,-13 - cannon * 3]];
    jaw = cannon;
  } else if (pose === 'punch') {
    chest = [1 + 4 * hit,-14]; head = [7 + 3 * hit,-21];
    hands = [[5,-11],[8 + 13 * hit,-11 - hit * 3]];
    feet = [[-5,-1],[4 + hit,-1]]; jaw = hit * 0.4;
  } else if (pose === 'backhand') {
    hip = [-1 - hit,-7]; chest = [1 + hit,-14 - hit]; head = [7 + 2 * hit,-21];
    hands = [[5 + 15 * hit,-13 - 3 * hit],[8 - 6 * hit,-11]];
    feet = [[-6,-1],[5,-1]]; tail += 4 * hit; jaw = 0.2 * hit;
  } else if (pose === 'kick') {
    hip = [-2,-8]; chest = [-2,-15]; head = [5,-22];
    feet = [[-4,-1],[5 + 12 * hit,-1 - 8 * hit]];
    hands = [[3,-11],[7,-15]]; tail -= 4 * hit;
  } else if (pose === 'windup') {
    const coil = 0.25 + frame * 0.1;
    chest = [-1,-13]; head = [5,-20]; feet = [[-5,-1],[4,-1]];
    hands = [[4,-10],[4 - coil * 4,-12]];
  } else if (pose === 'guard') {
    hip = [-2,-6]; chest = [-2,-12]; head = [4,-18];
    hands = [[5,-18],[7,-17]]; feet = [[-5,-1],[5,-1]]; tail -= 2;
  } else if (pose === 'dash') {
    hip = [-2,-7]; chest = [5,-11]; head = [12,-17];
    feet = [[-7 + WALK[frame],-3],[2 - WALK[frame],-4]];
    hands = [[7,-10],[10,-13]]; jaw = 0.5; tail -= 4;
  } else if (pose === 'air' || pose === 'takeoff') {
    hip = [-1,-9]; chest = [2,-16]; head = [8,-23];
    feet = [[-3,-5],[5,-7]]; hands = [[7,-15],[10,-17]];
  } else if (pose === 'cling') {
    hip = [-2,-8]; chest = [0,-15]; head = [5,-22];
    feet = [[0,-5],[4,-6]]; hands = [[9,-17],[11,-16]];
    tail -= 3;
  } else if (pose === 'land') {
    hip = [-1,-7 + hit * 2]; chest = [3,-14 + hit * 3]; head = [10,-21 + hit * 3];
    feet = [[-6,-1],[6,-1]]; hands = [[6,-9],[8,-9]];
  } else if (pose === 'hurt') {
    hip = [-1 - hit,-7]; chest = [1 - 4 * hit,-14 + hit]; head = [7 - 6 * hit,-21 + hit * 2];
    hands = [[3 - hit,-11],[6 - hit,-13]]; feet = [[-5,-1],[5,-1]];
    jaw = 0.6 * hit; tail -= 3 * hit;
  } else if (pose === 'faint') {
    const drop = FALL[frame];
    hip = [-1,-7 + 3 * drop]; chest = [1 + 4 * drop,-14 + 8 * drop]; head = [7 + 5 * drop,-21 + 13 * drop];
    hands = [[5 + 4 * drop,-10 + 5 * drop],[8 + 3 * drop,-11 + 5 * drop]];
    feet = [[-6,-1],[5,-1]]; tail += drop * 3;
  } else {
    chest = [1,-14 + BOB[frame] * 0.35];
    head = [7,-21 + BOB[frame] * 0.35];
  }
  return { hip,chest,head,feet,hands,tail,jaw,recoil,cannon };
}

/** Each cannon, limb and shell follows a separate native-resolution pose. */
export function bakeTurtleRig(stage: number, pose: PokemonPose, phase: number): ReferenceFrame & { muzzle: Pt } {
  const rank = Math.max(0,Math.min(3,Math.floor(stage))) as 0 | 1 | 2 | 3;
  const frame = phase & 7;
  if (rank >= 2) return matureTurtle(rank as 2 | 3, pose, frame);
  const evolved = rank >= 2;
  const mega = rank === 3;
  const scale = [0.59,0.82,1.6,1.92][rank];
  const s = turtlePose(pose,frame);
  const collapse = pose === 'faint' ? FALL[frame] : 0;
  const r = new Raster(W,H);
  const at = ([x,y]: Pt): Pt => [ORIGIN[0] + Math.round(x * scale),ORIGIN[1] + Math.round(y * scale)];
  const offset = ([x,y]: Pt, dx: number, dy: number): Pt => [x + dx,y + dy];
  const poly = (points: readonly Pt[], ink: number) => r.poly(points.map(at),ink);
  const line = (a: Pt,b: Pt,ink: number,width = 1) => r.line(...at(a),...at(b),ink,Math.max(1,Math.round(width * scale)));
  const oval = (p: Pt, rx: number, ry: number, ink: number) => { const [x,y] = at(p);r.ellipse(x,y,rx * scale,ry * scale,ink); };
  const segment = (a: Pt,b: Pt,width: number,near = true) => {
    line(a,b,INK,width + 1.3); oval(a,width * 0.5,width * 0.5,INK);
    line(a,b,near ? SKIN : SHADE,width); oval(a,Math.max(0.6,width * 0.5 - 0.5),Math.max(0.6,width * 0.5 - 0.5),near ? SKIN : SHADE);
    if (near) line(offset(a,-0.6,-0.4),offset(b,-0.6,-0.4),LIGHT);
  };
  const foot = (point: Pt, near: boolean) => {
    const knee: Pt = [point[0] - 1,Math.min((s.hip[1] + point[1]) * 0.5,evolved ? -3.9 : -3.6)];
    segment(offset(s.hip,near ? -2 : 2,0),knee,evolved ? 4.4 : 3,near);
    segment(knee,offset(point,0,-2.5),evolved ? 3.1 : 2.2,near);
    poly([offset(point,-2,-2),offset(point,2,-2),offset(point,4,-0.8),offset(point,3,0),offset(point,-2,0)],INK);
    line(offset(point,-1,-1),offset(point,2,-1),near ? SKIN : SHADE,1.5);
    if (evolved) for (const toe of [0,2,3]) line(offset(point,toe,-0.8),offset(point,toe + 0.8,-0.8),WHITE);
  };
  const arm = (hand: Pt,near: boolean) => {
    const shoulder = offset(s.chest,near ? 1 : 3,2);
    const elbow: Pt = [(shoulder[0] + hand[0]) * 0.5 + 1,(shoulder[1] + hand[1]) * 0.5 + 1.5];
    segment(shoulder,elbow,evolved ? 3.6 : 2.2,near);
    segment(elbow,hand,evolved ? 3.2 : 2,near);
    oval(hand,evolved ? 2.5 : 1.6,evolved ? 2.2 : 1.7,INK);
    oval(offset(hand,-0.3,-0.4),evolved ? 2 : 1.2,evolved ? 1.7 : 1.2,near ? SKIN : SHADE);
    if (evolved) {
      for (const dy of [-1,0.5,2]) line(offset(hand,1,dy),offset(hand,2.5,dy),WHITE);
      if (mega) cannon(offset(hand,-1,-1.2),offset(hand,6 + 2 * s.cannon,-2.2),1.8);
    }
  };
  const cannon = (start: Pt,end: Pt,radius: number) => {
    line(start,end,INK,radius * 2 + 2);
    line(offset(start,0,-0.5),offset(end,0,-0.5),STEEL,radius * 2);
    line(offset(start,0,-radius * 0.65),offset(end,0,-radius * 0.65),STEEL_LIGHT);
    oval(end,radius * 0.62 + 0.7,radius + 0.5,INK);
    oval(offset(end,0.2,0),radius * 0.48,radius * 0.7,DEEP);
    line(offset(end,-0.2,-radius),offset(end,0.3,-radius),WHITE);
  };

  // The far leg and cannon are behind the shell and the cream breastplate.
  foot(s.feet[1],false);
  if (evolved && !mega) cannon(offset(s.chest,-1,-6),offset(s.chest,20 - s.recoil * 3,-11 + s.cannon * 3),2.5);
  arm(s.hands[0],false);
  const tailStart = offset(s.hip,-4,-collapse * 2.3);
  if (rank === 1) {
    const tip = offset(tailStart,-8,-4 + s.tail);
    line(tailStart,offset(tip,1,3),INK,5);
    line(tailStart,offset(tip,1,3),SKIN,3.4);
    oval(tip,4.6,5.8,INK); oval(offset(tip,-0.3,-0.5),3.8,5, RIM);
    line(offset(tip,1,3),offset(tip,-2,1),SHADE);
    line(offset(tip,-2,1),offset(tip,-2,-1.5),SHADE);
    line(offset(tip,-2,-1.5),offset(tip,0,-2),LIGHT);
  } else {
    poly([tailStart,offset(tailStart,-6,1),offset(tailStart,-10,-2 + s.tail),offset(tailStart,-8,2 + s.tail),offset(tailStart,-3,4)],INK);
    poly([offset(tailStart,-1,1),offset(tailStart,-5,2),offset(tailStart,-8,-0.5 + s.tail),offset(tailStart,-5,3)],SHADE);
  }
  const shellHeight = (evolved ? 11.2 : 8.7) - collapse * (evolved ? 6.5 : 4.8);
  const shellCenter: Pt = [s.hip[0] - 3,Math.min((s.chest[1] + s.hip[1]) / 2 - 0.4,-shellHeight - 0.7)];
  oval(shellCenter,(evolved ? 8.3 : 6.2) + collapse * 2.3,shellHeight,INK);
  oval(offset(shellCenter,0,-0.2),(evolved ? 7.6 : 5.6) + collapse * 2.3,shellHeight - 0.7,RIM);
  oval(offset(shellCenter,-1.2,-0.5),(evolved ? 6.4 : 4.8) + collapse * 2,shellHeight - 2,SHELL);
  const seam = (a: Pt,b: Pt) => line(offset(shellCenter,a[0],a[1] * (1 - collapse * 0.6)),offset(shellCenter,b[0],b[1] * (1 - collapse * 0.6)),INK);
  seam([-3,-8],[0,-3]); seam([0,-3],[-2,2]); seam([-2,2],[-6,4]); seam([-2,2],[0,7]);
  seam([0,-3],[-6,-1]);
  line(offset(shellCenter,-4,-6),offset(shellCenter,-2,-7),SHELL_LIGHT);
  line(offset(shellCenter,-5,-4),offset(shellCenter,-4,-6),SHELL_LIGHT);

  const neckHeight = (evolved ? 8.5 : 6.4) - collapse * (evolved ? 4.5 : 3.3);
  const neck: Pt = [s.chest[0],Math.min(s.chest[1] + 2,-neckHeight - 0.7)];
  oval(neck,evolved ? 6.8 : 4.4,neckHeight,INK);
  oval(offset(neck,0,-0.2),evolved ? 6 : 3.9,neckHeight - 0.7,SKIN);
  const breastHeight = (evolved ? 9.2 : 6.5) - collapse * (evolved ? 4.8 : 3);
  const breast: Pt = [s.hip[0] + 2,Math.min(s.hip[1] - 3,-breastHeight - 0.7)];
  oval(breast,(evolved ? 6.3 : 4.5) + collapse,breastHeight,INK);
  oval(offset(breast,0,-0.2),(evolved ? 5.5 : 3.8) + collapse,breastHeight - 0.7,BELLY);
  line(offset(breast,-2,-6 * (1 - collapse * 0.55)),offset(breast,1,-7 * (1 - collapse * 0.55)),BELLY_LIGHT);
  for (const y of evolved ? [-5,-1,3,6] : [-3,1,4]) {
    line(offset(breast,-3,y * (1 - collapse * 0.55)),offset(breast,4,(y + 0.6) * (1 - collapse * 0.55)),SHELL);
  }
  if (evolved) {
    const start = offset(s.chest,mega ? -3 : -5,mega ? -15 : -7);
    const end = offset(start,mega ? 22 - s.recoil * 4 : 19 - s.recoil * 3,mega ? -3 + s.cannon * 2 : -8 + s.cannon * 2);
    if (mega) {
      // A raised shell turret carries the large barrel instead of floating it above the neck.
      poly([offset(shellCenter,-5,-5),offset(shellCenter,-6,-11),offset(start,-4,1),offset(start,2,3),offset(shellCenter,2,-5)],INK);
      poly([offset(shellCenter,-4,-5),offset(shellCenter,-5,-10),offset(start,-3,2),offset(start,1,3),offset(shellCenter,1,-5)],SHELL);
      line(offset(shellCenter,-4,-9),offset(start,-2,3),SHELL_LIGHT);
      poly([offset(start,-4,4),offset(start,-5,-3),offset(start,-1,-6),offset(start,4,-5),offset(start,5,2)],INK);
      poly([offset(start,-3,3),offset(start,-4,-2),offset(start,-1,-5),offset(start,3,-4),offset(start,4,1)],SHELL);
    }
    cannon(start,end,mega ? 3.4 : 2.7);
  }
  foot(s.feet[0],true);
  arm(s.hands[1],true);

  const face = s.head;
  const faceRx = evolved ? 6.1 : rank === 1 ? 5.1 : 5.8;
  const faceRy = evolved ? 5.8 : 6.4;
  if (rank === 1) {
    for (const [dx,dy] of [[-3,-3],[2,-2]]) {
      const root = offset(face,dx,dy);
      poly([root,offset(root,-5,-9 + BOB[frame]),offset(root,0,-7),offset(root,3,1)],INK);
      poly([offset(root,0,-1),offset(root,-3,-7 + BOB[frame]),offset(root,0,-5),offset(root,2,0)],RIM);
      line(offset(root,-2,-6),root,LIGHT);
    }
  }
  oval(face,faceRx + 0.7,faceRy + 0.6,INK);
  oval(offset(face,0,-0.3),faceRx,faceRy,SKIN);
  oval(offset(face,-2,-2.3),faceRx * 0.48,faceRy * 0.37,LIGHT);
  poly([offset(face,1,0),offset(face,7.1,0.5),offset(face,8.2,3.4),offset(face,5.5,5),offset(face,0,4)],INK);
  poly([offset(face,1,0.8),offset(face,6.3,1.1),offset(face,7.1,3.1),offset(face,5,4.2),offset(face,0.8,3.2)],SKIN);
  line(offset(face,2.5,3),offset(face,6,3.3),DEEP);
  if (s.jaw > 0.2) {
    line(offset(face,3,3.5),offset(face,7,3.5 + s.jaw * 2),INK,2);
    line(offset(face,4,4.3 + s.jaw),offset(face,6,4.3 + s.jaw),MOUTH);
  }
  const closed = pose === 'faint' && frame >= 2 || pose === 'hurt' && frame < 3 || pose === 'idle' && frame === 7;
  if (closed) line(offset(face,1.1,-0.4),offset(face,4,-0.2),DEEP);
  else {
    oval(offset(face,2,-1.3),rank === 0 ? 1.6 : 1.8,rank === 0 ? 2.7 : 1.8,INK);
    oval(offset(face,2.2,-1.4),rank === 0 ? 1.1 : 1.2,rank === 0 ? 2.1 : 1.2,WHITE);
    oval(offset(face,2.8,-1),0.7,rank === 0 ? 1.5 : 1,EYE);
    r.set(...at(offset(face,2.7,-2.1)),WHITE);
    if (evolved) line(offset(face,0,-3),offset(face,4.1,-1.7),DEEP);
  }
  r.set(...at(offset(face,6.5,1.7)),DEEP);
  if (evolved) r.set(...at(offset(face,5.8,3.7)),WHITE);

  const mainCannon = mega
    ? offset(s.chest,19 - s.recoil * 4,-18 + s.cannon * 2)
    : offset(s.chest,14 - s.recoil * 3,-15 + s.cannon * 2);
  const muzzle = evolved ? mainCannon : offset(face,8,3.5 + s.jaw);
  const relative = ([x,y]: Pt): Pt => [Math.round(x * scale),Math.round(y * scale)];
  return {
    sprite: toRuns(Int32Array.from(r.m,ink => PALETTES[rank][ink]),W,H),
    originX: ORIGIN[0],originY: ORIGIN[1],
    muzzle: relative(muzzle),
    ...(evolved ? { saddle: relative(offset(shellCenter,-1,-8.4)) } : {}),
  };
}

/** The adult shellfish has its own anatomy, rather than an enlarged Squirtle. */
function matureTurtle(rank: 2 | 3, pose: PokemonPose, frame: number): ReferenceFrame & { muzzle: Pt } {
  const mega = rank === 3, scale = mega ? 1.92 : 1.6;
  const origin: Pt = [62, 88];
  const raster = new Raster(140, 108);
  const r = new ScaledPen(raster, [0, 0], origin, scale);
  const s = turtlePose(pose, frame);
  const add = ([x,y]: Pt, dx: number, dy: number): Pt => [x+dx,y+dy];
  const head = add(s.head,2,-2);
  const collapsed = pose === 'faint' ? FALL[frame] : 0;
  const shell: Pt = [s.hip[0]-5,Math.min((s.hip[1]+s.chest[1])/2-2.8,-12*(1-collapsed*.38)-.7)];
  const flatten = (p: Pt): Pt => [p[0],p[1]+Math.max(0,-p[1]-3)*collapsed*.12];
  const segment = (root: Pt, elbow: Pt, end: Pt, width: number, near: boolean) => {
    r.stroke([root,elbow,end],INK,width+1.6);
    r.ellipse(elbow[0],elbow[1],width*.58,width*.55,INK);
    r.stroke([root,elbow,end],near?SKIN:SHADE,width);
    r.ellipse(elbow[0]-.2,elbow[1]-.3,width*.45,width*.43,near?SKIN:SHADE);
    if(near)r.line(root[0]-.8,root[1]-.7,elbow[0]-.8,elbow[1]-.7,LIGHT);
  };
  const leg = (at: Pt, near: boolean) => {
    const root = add(s.hip,near?2:-3,0);
    const knee: Pt = [at[0]-2,(s.hip[1]+at[1])/2-1.3];
    segment(root,knee,add(at,0,-2),5.3,near);
    r.poly([add(at,-4,-2.6),add(at,2,-2.5),add(at,5,-1),add(at,4,0),add(at,-4,0)],INK);
    r.poly([add(at,-3,-2),add(at,1,-2),add(at,4,-.6),add(at,-3,-.6)],near?SKIN:SHADE);
    for(const dx of [-.5,1.5,3.4]) {
      r.poly([add(at,dx,-1.5),add(at,dx+1.8,-.9),add(at,dx+1.6,-.1),add(at,dx,-.2)],WHITE);
    }
  };
  const cannon = (start: Pt, end: Pt, radius: number) => {
    r.stroke([start,end],INK,radius*2+1.9);
    r.stroke([start,end],STEEL,radius*2);
    r.line(start[0],start[1]-radius*.6,end[0],end[1]-radius*.6,STEEL_LIGHT,1.1);
    r.line(start[0]+1,start[1]+radius*.6,end[0]-1,end[1]+radius*.6,DEEP,1.1);
    r.ellipse(end[0],end[1],radius*.55+.8,radius+.8,INK);
    r.ellipse(end[0]+.4,end[1]-.1,radius*.45+.3,radius-.1,STEEL_LIGHT);
    r.ellipse(end[0]+.7,end[1],radius*.31+.2,radius*.67,INK);
    r.line(end[0]+.3,end[1]-radius*.5,end[0]+.6,end[1]-radius*.5,WHITE);
  };
  const arm = (hand: Pt, near: boolean) => {
    const shoulder = add(s.chest,near?2:4,-.3);
    const elbow: Pt = [(shoulder[0]+hand[0])*.5+.5,(shoulder[1]+hand[1])*.5+1.6];
    segment(shoulder,elbow,hand,near?5.1:4.5,near);
    if(mega) {
      // Each forearm has a brown shell housing, an ivory rim, and a short real bore.
      r.ellipse(elbow[0]+.4,elbow[1]-.1,4.4,3.3,INK);
      r.ellipse(elbow[0]+.4,elbow[1]-.3,3.8,2.8,RIM);
      r.ellipse(elbow[0]-.1,elbow[1]-.6,2.9,2.1,SHELL);
      r.line(elbow[0]-1.5,elbow[1]-1.7,elbow[0]+1.2,elbow[1]-.7,SHELL_LIGHT);
      cannon(add(elbow,1,-.3),add(hand,5,-1.6),1.7);
    }
    r.poly([add(hand,-2,-2),add(hand,1.6,-2.5),add(hand,4,-1),add(hand,4,1.8),add(hand,1,3),add(hand,-2,2)],INK);
    r.poly([add(hand,-1.5,-1.5),add(hand,1.2,-1.7),add(hand,3,-.5),add(hand,3,1.2),add(hand,0,2),add(hand,-1.5,1.5)],near?SKIN:SHADE);
    for(const dy of [-1.2,.4,1.9])r.line(hand[0]+2.5,hand[1]+dy,hand[0]+4.2,hand[1]+dy-.3,WHITE);
  };
  leg(s.feet[1],false);
  arm(s.hands[0],false);
  // A short muscular tail grows out of the shell, not a Wartortle curl.
  r.poly([add(s.hip,-5,-1),add(s.hip,-11,1),add(s.hip,-16,-1+s.tail),add(s.hip,-14,2+s.tail),add(s.hip,-7,4)],INK);
  r.poly([add(s.hip,-5,0),add(s.hip,-10,2),add(s.hip,-14,.6+s.tail),add(s.hip,-8,3)],SHADE);
  if(!mega)cannon(add(s.chest,-3,-7),add(s.chest,12-s.recoil*3,-14+s.cannon*2),2.25);
  const sy = (dy: number) => dy*(1-collapsed*.38);
  const shellPt=(x:number,y:number):Pt=>flatten(add(shell,x,sy(y)));
  r.poly([shellPt(-8,5),shellPt(-10,-3),shellPt(-7,-11),shellPt(-1,-14),shellPt(5,-11),shellPt(8,-4),shellPt(7,8),shellPt(1,12),shellPt(-5,10)],INK);
  r.poly([shellPt(-7,5),shellPt(-9,-3),shellPt(-6,-10),shellPt(-1,-13),shellPt(4,-10),shellPt(7,-4),shellPt(6,7),shellPt(1,11),shellPt(-4,9)],RIM);
  r.poly([shellPt(-7,3),shellPt(-8,-3),shellPt(-5,-9),shellPt(-1,-11.5),shellPt(3,-9),shellPt(5,-3),shellPt(4,6),shellPt(0,9),shellPt(-4,7)],SHELL);
  r.poly([shellPt(-7,-3),shellPt(-4,-9),shellPt(-1,-11),shellPt(1,-8),shellPt(-3,-4),shellPt(-3,2),shellPt(-6,4)],SHELL_LIGHT);
  for(const [a,b] of [ [[-1,-11],[-3,-4]],[[-3,-4],[1,0]],[[1,0],[-1,7]],[[-3,-4],[-7,-3]],[[1,0],[4,-3]],[[-1,7],[-5,6]] ] as const) {
    const pa=shellPt(a[0],a[1]),pb=shellPt(b[0],b[1]);
    r.line(pa[0],pa[1],pb[0],pb[1],INK);
  }
  // Broad shoulders and the thick segmented breastplate make the adult recognisable at game scale.
  const chest = add(s.chest,3,1);
  const belly = (dx:number,dy:number):Pt => [s.hip[0]+dx,Math.min(-0.7,s.hip[1]+dy)];
  const torsoRoot:Pt=[s.hip[0]+2,Math.min(-6,s.hip[1]+1)];
  r.stroke([torsoRoot,chest,add(head,-3,3)],INK,11);
  r.stroke([torsoRoot,chest,add(head,-3,3)],SKIN,9);
  r.poly([add(chest,-1,-4),add(chest,4,-3),belly(9,-1),belly(7,6),belly(1,7),belly(-1,3)],INK);
  r.poly([add(chest,-.5,-3),add(chest,3,-2),belly(8,-1),belly(6,5),belly(1,6),belly(0,2)],BELLY);
  r.line(chest[0]+.4,chest[1]-2,...belly(2,4),BELLY_LIGHT,2);
  for(const t of [.15,.4,.65,.88]) {
    const x=chest[0]+(s.hip[0]+4-chest[0])*t,y=chest[1]+(s.hip[1]+5-chest[1])*t;
    r.line(x-2.3,Math.min(-.7,y),x+4.1,Math.min(-.7,y+.6),SHELL);
  }
  let muzzle:Pt;
  if(mega) {
    const start=add(s.chest,-6,-14),end=add(s.chest,20.5-s.recoil*2,-17+s.cannon*2);
    // The long central cannon is seated inside the thick raised shell collar.
    r.poly([shellPt(-3,-8),add(start,-4,4),add(start,-4,-4),add(start,1,-7),add(start,7,-5),add(start,7,5),shellPt(5,-7)],INK);
    r.poly([shellPt(-2,-8),add(start,-3,3),add(start,-3,-3),add(start,1,-5.5),add(start,5,-4),add(start,5,4),shellPt(4,-7)],SHELL);
    r.line(start[0]-2,start[1]-3,start[0]+1,start[1]-4.3,SHELL_LIGHT,1.5);
    cannon(start,end,3.9);
    r.line(start[0]+4,start[1]-3.5,start[0]+4,start[1]+3.3,STEEL_LIGHT);
    muzzle=end;
  } else {
    const start=add(s.chest,-5,-7),end=add(s.chest,14-s.recoil*3,-15+s.cannon*2);
    r.ellipse(start[0]-1,start[1]+1,4.2,4.4,RIM);
    r.ellipse(start[0]-.5,start[1]+.5,3,3.2,INK);
    cannon(start,end,2.65);muzzle=end;
  }
  leg(s.feet[0],true);
  arm(s.hands[1],true);
  // Angular temples, flattened snout and cheek jaw replace the round baby face.
  r.poly([add(head,-6,1),add(head,-7,-4),add(head,-4,-7),add(head,1,-6),add(head,5,-3),add(head,8,-1),add(head,9,3),add(head,5,6),add(head,-1,6)],INK);
  r.poly([add(head,-5,1),add(head,-6,-3),add(head,-3,-5.8),add(head,1,-5),add(head,4,-2),add(head,7,-.3),add(head,8,2.6),add(head,4.5,5),add(head,-1,5)],SKIN);
  r.poly([add(head,-5,-2),add(head,-3,-5),add(head,.5,-4.4),add(head,2,-2.4),add(head,-1,-2.8)],LIGHT);
  r.poly([add(head,-6,-2),add(head,-8,-7),add(head,-4,-5),add(head,-3,-1)],INK);
  r.poly([add(head,-5.5,-2),add(head,-6.5,-5.5),add(head,-4.3,-4),add(head,-4,-1.5)],SHADE);
  r.poly([add(head,0,3.6),add(head,3,4),add(head,7,2.8),add(head,7,4),add(head,3,5.4),add(head,-1,4.7)],BELLY);
  r.line(head[0]+1,head[1]+2.7,head[0]+7.2,head[1]+2.2,DEEP);
  if(s.jaw>.35)r.line(head[0]+3,head[1]+3,head[0]+7,head[1]+3+s.jaw*1.3,MOUTH,1.2);
  const closed=pose==='faint'&&frame>=2||pose==='hurt'&&frame<3||pose==='idle'&&frame===7;
  r.poly([add(head,-.6,-3.5),add(head,4,-2),add(head,2.7,.3),add(head,-.5,-.4)],INK);
  if(!closed){
    r.poly([add(head,.2,-2.5),add(head,3.1,-1.7),add(head,2.4,-.3),add(head,.1,-.6)],WHITE);
    r.line(head[0]+2.1,head[1]-1.8,head[0]+2.2,head[1]-.5,EYE);
    r.set(head[0]+2,head[1]-1.7,INK);
  }
  r.set(head[0]+6.2,head[1]+.4,DEEP);
  r.set(head[0]+5.7,head[1]+3.2,WHITE);
  const anchor=([x,y]:Pt):Pt=>[Math.round(x*scale),Math.round(y*scale)];
  return {sprite:toRuns(Int32Array.from(raster.m,ink=>PALETTES[rank][ink]),raster.w,raster.h),originX:origin[0],originY:origin[1],muzzle:anchor(muzzle),saddle:anchor(add(shell,-2,-10))};
}
