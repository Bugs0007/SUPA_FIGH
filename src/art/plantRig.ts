import { Raster, toRuns, type Pt } from './pixelRaster';
import type { PokemonPose } from './pokemonArt';
import type { ReferenceFrame } from './pokemonSpriteMotion';

const W = 152, H = 112;
const ORIGIN: Pt = [74,94];
const INK = 1, DARK = 2, SHADE = 3, SKIN = 4, LIGHT = 5, SPOT = 6;
const LEAF_DARK = 7, LEAF = 8, LEAF_LIGHT = 9, PETAL_DARK = 10, PETAL = 11;
const PETAL_LIGHT = 12, IVORY = 13, EYE = 14, BARK = 15, BARK_LIGHT = 16, SEED = 17;
const PALETTES = [
  [-1,0x203a37,0x215953,0x3f8880,0x75bca8,0xa9dbbe,0x286f61,0x315b35,0x6a9e4c,0xa5c776,0x874255,0xd96d88,0xf9b3b3,0xfff1cf,0x9f3450,0x6e5e3c,0x9d8650,0xeacb69],
  [-1,0x223b3c,0x1e5d60,0x388e8d,0x6db9ae,0xa1d6b9,0x24766c,0x2d583b,0x56834a,0x94b965,0x894251,0xd66582,0xffa4b2,0xffefd1,0xb83956,0x665a3b,0xa18b58,0xe3bf59],
  [-1,0x243b39,0x315b56,0x477f72,0x6ba192,0x99c6a4,0x2e6d61,0x2f5134,0x5c7847,0x9ebc66,0x99485c,0xdf8198,0xffbdc0,0xf8e5c5,0xb74653,0x66513c,0x947451,0xe9c260],
  [-1,0x233b3a,0x2d5b59,0x427e79,0x65a499,0x99cfb6,0x2c6d63,0x2a503a,0x507e4d,0x94bd6d,0x98485f,0xdf82a1,0xffc1d0,0xffefda,0xc44f69,0x5e4b3b,0x9c8058,0xf2c76d],
] as const;
const WALK = [2,1,0,-1,-2,-1,0,1];
const RUN = [4,2,-1,-3,-4,-2,1,3];
const LIFT = [0,0,0,1,2,2,1,0];
const BOB = [0,-0.3,-0.7,-0.3,0,0.5,0.7,0.4];
const HIT = [0.6,1,0.92,0.74,0.51,0.29,0.12,0];
const CAST = [0.08,0.42,1,1,0.8,0.53,0.25,0];
const FALL = [0,0.12,0.3,0.56,0.77,0.92,1,1];

interface PlantPose {
  body: Pt; head: Pt; feet: readonly [Pt,Pt,Pt,Pt];
  leaves: number; bloom: number; mouth: number; vines: number;
}

function plantPose(pose: PokemonPose, frame: number): PlantPose {
  let body: Pt = [-2,-7], head: Pt = [7,-8];
  let feet: [Pt,Pt,Pt,Pt] = [[-8,-1],[5,-1],[-4,-1],[10,-1]];
  let leaves = BOB[(frame + 2) & 7], bloom = 0, mouth = 0, vines = 0;
  const hit = HIT[frame];
  if (pose === 'walk' || pose === 'run') {
    const run = pose === 'run';
    const gait = run ? RUN : WALK;
    const lift = run ? 1.5 : 0.8;
    const h = run ? BOB[frame] : BOB[frame] * 0.5;
    body = [-2 + (run ? 1 : 0),-7 + h]; head = [7 + (run ? 2 : 0),-8 + h];
    feet = [
      [-8 + gait[frame],-1 - LIFT[frame] * lift],
      [5 + gait[(frame + 4) & 7],-1 - LIFT[(frame + 4) & 7] * lift],
      [-4 + gait[(frame + 4) & 7],-1 - LIFT[(frame + 4) & 7] * lift],
      [10 + gait[frame],-1 - LIFT[frame] * lift],
    ];
    leaves += gait[frame] * 0.3;
  } else if (pose === 'cast') {
    const brace = CAST[frame];
    body = [-2 - brace,-7 + brace]; head = [7 + brace * 2,-8 - brace];
    feet = [[-10,-1],[4,-1],[-5,-1],[12,-1]];
    bloom = brace; mouth = brace; leaves = -3 * brace; vines = brace;
  } else if (pose === 'punch') {
    body = [-2 + hit * 3,-7]; head = [7 + hit * 4,-8];
    feet = [[-9,-1],[5,-1],[-4,-1],[10 + 10 * hit,-1 - hit * 4]];
    vines = hit; leaves -= 3 * hit;
  } else if (pose === 'kick') {
    body = [-2 + hit * 4,-7 - hit]; head = [7 + hit * 6,-8 - hit];
    feet = [[-10,-1],[5,-1],[-5,-2],[10 + hit * 9,-4 - hit * 3]];
    leaves -= 4 * hit; vines = hit;
  } else if (pose === 'windup') {
    const coil = frame / 7;
    body = [-2 - 2 * coil,-7 + coil]; head = [6 - coil,-8 + coil];
    feet = [[-10,-1],[5,-1],[-5,-1],[10,-1]]; leaves += 2 * coil;
  } else if (pose === 'guard') {
    body = [-3,-6]; head = [5,-6];
    feet = [[-9,-1],[5,-1],[-5,-1],[9,-1]]; leaves = -4 + BOB[frame]; bloom = -0.5;
  } else if (pose === 'dash') {
    body = [-1,-6]; head = [11,-7];
    feet = [[-11 + WALK[frame],-3],[4 - WALK[frame],-3],[-5 - WALK[frame],-4],[9 + WALK[frame],-4]];
    leaves -= 4; mouth = 0.7; vines = hit;
  } else if (pose === 'air' || pose === 'takeoff') {
    body = [-2,-8]; head = [8,-10];
    feet = [[-6,-4],[5,-5],[-2,-5],[9,-6]]; leaves += 3;
  } else if (pose === 'cling') {
    body = [-3,-8]; head = [7,-10];
    feet = [[-6,-4],[10,-8],[-2,-5],[13,-8]]; leaves -= 2;
  } else if (pose === 'land') {
    body = [-2,-7 + 2 * hit]; head = [9,-8 + 3 * hit];
    feet = [[-10,-1],[5,-1],[-5,-1],[12,-1]]; leaves += 4 * hit;
  } else if (pose === 'hurt') {
    body = [-2 - hit * 3,-7 + hit]; head = [7 - hit * 4,-8 + hit * 2];
    feet = [[-9,-1],[5,-1],[-5,-1],[10,-1]]; leaves -= 4 * hit; mouth = 0.5 * hit;
  } else if (pose === 'faint') {
    const fall = FALL[frame];
    body = [-2,-7 + fall * 3]; head = [7 + fall * 2,-8 + fall * 4];
    feet = [[-10,-1],[5,-1],[-6,-1],[12,-1]]; leaves += 6 * fall; bloom = -fall;
  } else {
    body = [-2,-7 + BOB[frame] * 0.4]; head = [7,-8 + BOB[frame] * 0.5];
  }
  return { body,head,feet,leaves,bloom,mouth,vines };
}

/** Quadruped foot keys and independently bending foliage stay on the pixel grid. */
export function bakePlantRig(stage: number, pose: PokemonPose, phase: number): ReferenceFrame & { muzzle: Pt } {
  const rank = Math.max(0,Math.min(3,Math.floor(stage))) as 0 | 1 | 2 | 3;
  const frame = phase & 7;
  const mature = rank >= 2;
  const mega = rank === 3;
  const scale = [0.67,0.95,1.56,1.85][rank];
  const s = plantPose(pose,frame);
  const compression = pose === 'faint' ? FALL[frame] * 2.8 : pose === 'land' ? HIT[frame] * 1.8 : pose === 'guard' ? 1.3 : 0;
  const bodyHeight = (mature ? 7.3 : 6) - compression;
  s.body = [s.body[0],Math.min(s.body[1],-bodyHeight - 0.5)];
  s.head = [s.head[0],Math.min(s.head[1],-5.7)];
  const r = new Raster(W,H);
  const at = ([x,y]: Pt): Pt => [ORIGIN[0] + Math.round(x * scale),ORIGIN[1] + Math.round(y * scale)];
  const off = ([x,y]: Pt,x2: number,y2: number): Pt => [x + x2,y + y2];
  const poly = (points: readonly Pt[],ink: number) => r.poly(points.map(at),ink);
  const line = (a: Pt,b: Pt,ink: number,width = 1) => r.line(...at(a),...at(b),ink,Math.max(1,Math.round(width * scale)));
  const oval = (point: Pt,rx: number,ry: number,ink: number) => { const [x,y] = at(point);r.ellipse(x,y,rx * scale,ry * scale,ink); };
  const leaf = (start: Pt,end: Pt,width: number,near = true) => {
    end = [end[0],Math.min(end[1],-1.8)];
    width = Math.min(width,Math.max(0.7,(-start[1] - end[1]) * 0.5 - 1.4));
    const dx = end[0] - start[0],dy = end[1] - start[1];
    const len = Math.hypot(dx,dy) || 1;
    const nx = -dy / len * width,ny = dx / len * width;
    const center: Pt = [start[0] + dx * 0.5,start[1] + dy * 0.5];
    poly([start,off(center,nx,ny),off(end,-dx * 0.18 + nx * 0.5,-dy * 0.18 + ny * 0.5),end,
      off(end,-dx * 0.18 - nx * 0.5,-dy * 0.18 - ny * 0.5),off(center,-nx,-ny)],INK);
    poly([off(start,dx * 0.1,dy * 0.1),off(center,nx * 0.72,ny * 0.72),end,off(center,-nx * 0.68,-ny * 0.68)],near ? LEAF : LEAF_DARK);
    line(start,end,near ? LEAF_LIGHT : LEAF);
    for (const t of [0.35,0.6]) {
      const v: Pt = [start[0] + dx * t,start[1] + dy * t];
      line(v,off(v,nx * 0.45 + dx * 0.1,ny * 0.45 + dy * 0.1),LEAF_DARK);
    }
  };
  const limb = (foot: Pt,front: boolean,near: boolean) => {
    const width = mature ? 5.3 : 3.5;
    const shoulder: Pt = [s.body[0] + (front ? 7 : -5),Math.min(s.body[1] + 1,-(width + 1) * 0.5 - 0.9)];
    const knee: Pt = [(shoulder[0] + foot[0]) * 0.5 + (front ? 0.7 : -0.7),Math.min((shoulder[1] + foot[1]) * 0.5,-width * 0.5 - 1.3)];
    line(shoulder,knee,INK,width + 1); line(knee,off(foot,0,-3),INK,width);
    line(shoulder,knee,near ? SKIN : SHADE,width - 0.5); line(knee,off(foot,0,-3),near ? SKIN : SHADE,width - 1);
    poly([off(foot,-2,-2),off(foot,2,-2),off(foot,3,-0.5),off(foot,2,0),off(foot,-2,0)],INK);
    line(off(foot,-1,-1),off(foot,2,-1),near ? SKIN : SHADE,1.5);
    for (const x of [-1,1,2]) r.set(...at(off(foot,x,-0.8)),IVORY);
    if (near) {
      oval(off(shoulder,-0.2,-0.4),1.8,1.4,LIGHT);
      poly([off(knee,-1,-1),off(knee,0,-2),off(knee,1,0),off(knee,0,1)],SPOT);
    }
  };

  limb(s.feet[0],false,false); limb(s.feet[1],true,false);
  const crown = off(s.body,-2,-6);
  if (rank > 0 && s.vines > 0) {
    for (const side of [-1,1]) {
      const reach = 12 + s.vines * (mature ? 8 : 7);
      const bend = off(crown,reach * 0.5,side * 3 - 4);
      const tip: Pt = [crown[0] + reach,Math.min(crown[1] + side * 6 + 5,-2.4)];
      line(crown,bend,INK,2.6); line(bend,tip,INK,2.6);
      line(crown,bend,LEAF,1.3); line(bend,tip,LEAF,1.3);
      leaf(off(bend,1,0),off(bend,3,-5),1.4);
    }
  }
  oval(s.body,mature ? 12 : 9,bodyHeight,INK);
  oval(off(s.body,0,-0.3),mature ? 11.3 : 8.3,bodyHeight - 0.7,SKIN);
  oval(off(s.body,-4,-2),mature ? 5.2 : 3.6,2.3,LIGHT);
  poly([off(s.body,-5,-2),off(s.body,-4,-4),off(s.body,-1,-3),off(s.body,-2,-1)],SPOT);
  poly([off(s.body,2,1),off(s.body,3,-1),off(s.body,5,0),off(s.body,4,2)],SPOT);
  limb(s.feet[2],false,true); limb(s.feet[3],true,true);

  const head = s.head;
  poly([off(head,-6,-2),off(head,-7,-8),off(head,-2,-5),off(head,0,-6),off(head,5,-4),off(head,7,1),off(head,5,5),off(head,-3,5),off(head,-7,2)],INK);
  poly([off(head,-5,-2),off(head,-5,-6),off(head,-2,-4),off(head,0,-5),off(head,4,-3),off(head,6,1),off(head,4,4),off(head,-3,4),off(head,-6,1)],SKIN);
  poly([off(head,1,-5),off(head,5,-8),off(head,5,-3)],INK);
  poly([off(head,2,-5),off(head,4,-6),off(head,4,-3)],SHADE);
  poly([off(head,-4,-4),off(head,-2,-5),off(head,-1,-2),off(head,-3,-2)],SPOT);
  line(off(head,-4,-1),off(head,-3,1),LIGHT);
  const closed = pose === 'faint' && frame >= 2 || pose === 'hurt' && frame < 3 || pose === 'idle' && frame === 7;
  if (closed) line(off(head,1,-1),off(head,4,0),DARK);
  else {
    poly([off(head,0,-2),off(head,3,-2),off(head,5,1),off(head,1,1)],INK);
    poly([off(head,1,-1.5),off(head,3,-1),off(head,4,0.5),off(head,1,0.5)],IVORY);
    line(off(head,2.5,-1),off(head,3,0),EYE,1.5);
    r.set(...at(off(head,2.4,-1.6)),IVORY);
    if (mature) line(off(head,-0.5,-2.5),off(head,4,-0.7),DARK);
  }
  const jaw = s.mouth * 1.8;
  line(off(head,-1,2.2),off(head,5,2.5 + jaw),INK,s.mouth > 0.3 ? 2 : 1);
  if (s.mouth > 0.3) line(off(head,1,3 + jaw),off(head,4,3 + jaw),PETAL_DARK);
  r.set(...at(off(head,5.4,0.8)),DARK);
  r.set(...at(off(head,0,2.4)),IVORY);

  if (rank === 0) {
    oval(off(crown,0,-2 + s.leaves * 0.3),7,8,INK);
    poly([off(crown,-6,0),off(crown,-7,-6),off(crown,-4,-11),off(crown,-2,-8),off(crown,2,-10),off(crown,6,-5),off(crown,5,2),off(crown,0,5)],LEAF);
    poly([off(crown,-6,-4),off(crown,-3,-9),off(crown,-1,-7),off(crown,-1,0),off(crown,-3,3)],LEAF_LIGHT);
    line(off(crown,0,3),off(crown,2,-6),LEAF_DARK);
    line(off(crown,2,-6),off(crown,-2,-9),LEAF_DARK);
    line(off(crown,-3,3),off(crown,-5,-3),LEAF_DARK);
  } else {
    const sway = s.leaves;
    for (const [dx,dy,width] of [[-15,-3,3],[-11,6,3.6],[-5,7,3.8],[7,6,3.6],[14,1,3.1],[8,-8,3],[-7,-8,3]] as const) {
      leaf(crown,off(crown,dx,dy + sway * (dx < 0 ? 0.7 : -0.5)),width,dy >= 0);
    }
    if (rank === 1) {
      const bud = off(crown,0,-7 - s.bloom);
      poly([off(bud,-5,4),off(bud,-6,-3),off(bud,-4,-10),off(bud,-2,-6),off(bud,1,-10),off(bud,5,-5),off(bud,6,1),off(bud,3,5)],INK);
      poly([off(bud,-4,3),off(bud,-5,-3),off(bud,-3,-8),off(bud,-1,-4),off(bud,1,-8),off(bud,4,-4),off(bud,5,1),off(bud,3,4)],PETAL);
      poly([off(bud,-3,1),off(bud,-3,-5),off(bud,-1,-3),off(bud,1,0),off(bud,0,3)],PETAL_LIGHT);
      line(off(bud,1,-7),off(bud,2,2),PETAL_DARK);
    } else {
      const stemTop = off(crown,0,-12 - s.bloom * 2 + BOB[frame] * 0.3);
      line(off(crown,0,2),stemTop,INK,5.5);
      line(off(crown,0,2),stemTop,BARK,4.2);
      for (const y of [-1,-4,-7,-10]) {
        line(off(stemTop,-2,-y),off(stemTop,0,1 - y),INK);
        line(off(stemTop,0,1 - y),off(stemTop,2,-y),BARK_LIGHT);
      }
      const flower = off(stemTop,0,-1);
      for (const [dx,dy,w,h] of [[-10,-1,7,3.6],[9,-2,7,3.8],[-6,-5,6,3],[5,-6,6,3.2],[-10,3,7,4],[7,4,8,4],[0,6,7.5,4]] as const) {
        const petal = off(flower,dx * (1 + s.bloom * 0.08),dy + s.leaves * dx * 0.025);
        oval(petal,w + 0.5,h + 0.6,INK); oval(off(petal,0,-0.2),w,h,PETAL);
        line(off(petal,-w * 0.5,-h * 0.2),off(petal,-w * 0.1,-h * 0.6),PETAL_LIGHT,1.3);
        oval(off(petal,w * 0.3,0),1.3,0.9,PETAL_LIGHT);
        line(off(petal,w * 0.65,0),off(petal,w * 0.8,h * 0.35),PETAL_DARK);
      }
      poly([off(flower,-4,-3),off(flower,-3,-6),off(flower,-1,-4),off(flower,0,-7),off(flower,2,-4),off(flower,4,-6),off(flower,5,-2)],INK);
      poly([off(flower,-3,-3),off(flower,-2,-5),off(flower,0,-3),off(flower,0,-5),off(flower,2,-3),off(flower,4,-5),off(flower,4,-2)],SEED);
      line(off(flower,-3,-2),off(flower,4,-2),IVORY);
      if (mega) {
        for (const [dx,dy] of [[-11,3],[11,2],[-8,7],[7,8]]) {
          const root: Pt = [crown[0] + dx,Math.min(crown[1] + dy + s.leaves * 0.4,-3.8)];
          leaf(root,off(root,dx * 0.5,6),2.8);
        }
        const blossom = off(head,0,-6);
        for (const [dx,dy] of [[-2,0],[0,-2],[2,0],[0,2]]) oval(off(blossom,dx,dy),2,1.5,PETAL);
        r.set(...at(blossom),SEED);
      }
    }
  }
  const relative = ([x,y]: Pt): Pt => [Math.round(x * scale),Math.round(y * scale)];
  return {
    sprite: toRuns(Int32Array.from(r.m,ink => PALETTES[rank][ink]),W,H),
    originX: ORIGIN[0],originY: ORIGIN[1],
    muzzle: relative(mature ? off(crown,8,-6 - s.bloom) : off(head,6,2 + jaw)),
    ...(mature ? { saddle: relative(off(s.body,6,-6.8)) } : {}),
  };
}
