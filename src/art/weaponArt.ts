import type Phaser from 'phaser';
import { PixelCanvas } from './canvas';
import { P } from './palette';

// Weapon sprites as ASCII pixel maps (fill only; the outline is generated). Rows are right-padded
// with '.' to the longest row. grip = pixel the hand holds (weapon-local, before outline padding).
// Barrel/blade points right (+x). Muzzle offsets in sim/data/weapons.ts are measured from this grip.
// The same atlas also carries map props ('prop_<type>', grip = bottom center) and projectile sprites.

interface WeaponArt {
  rows: string[];
  grip: [number, number];
}

const PAL: Record<string, string> = {
  g: P.steel2,
  d: P.steel0,
  m: P.steel1,
  l: P.steel4,
  w: P.wood2,
  W: P.wood1,
  y: P.brass,
  r: P.red1,
  b: P.ink2,
  o: P.orange,
  k: P.concrete2,
  s: P.steel3,
  x: P.white,
  R: P.red2,
  G: P.green1,
  e: P.green2,
  Y: P.yellow,
  B: P.blue2,
  c: P.glass1,
  n: P.wood3,
};

export const WEAPON_ART: Record<string, WeaponArt> = {
  knife: {
    grip: [1, 1],
    rows: [
      '...lllll.',
      'bbbsssssl',
      '...ss....',
    ],
  },
  machete: {
    grip: [1, 1],
    rows: [
      '....lllllllll.',
      'bbbbssssssssss',
      '.....ssssssss.',
    ],
  },
  bat: {
    grip: [1, 1],
    rows: [
      '.........wwwwww.',
      'WWWwwwwwwwwwwwww',
      '.........wwwwww.',
    ],
  },
  pipe: {
    grip: [2, 1],
    rows: [
      'mgggggggggggggm',
      'dmmmmmmmmmmmmmd',
    ],
  },
  katana: {
    grip: [2, 1],
    rows: [
      '......llllllllllll.',
      'bbbbyysssssssssssss',
      '.....y.............',
    ],
  },
  chair: {
    grip: [1, 1],
    rows: [
      '.......w......',
      'WWwwwwwwwwwwww',
      '.......w....w.',
      '.......w....w.',
      '.......WWWWWW.',
      '.......w....w.',
      '.......w....w.',
    ],
  },
  sledge: {
    grip: [1, 2],
    rows: [
      '...........gggg',
      '...........mmmm',
      'WWWwwwwwwwwmmmm',
      '...........mmmm',
      '...........dddd',
    ],
  },
  pistol: {
    grip: [1, 3],
    rows: [
      'gggggggggl',
      'dddddddddd',
      'dd.d......',
      'dd........',
      'bb........',
    ],
  },
  revolver: {
    grip: [1, 3],
    rows: [
      '.ggggggggggl',
      'ddmmmddddddd',
      'dd.yy.......',
      'ww..........',
      'ww..........',
    ],
  },
  uzi: {
    grip: [2, 3],
    rows: [
      'gggggggggl',
      'dddddddddd',
      '..dd.d....',
      '..bb.d....',
      '.....d....',
      '.....d....',
    ],
  },
  flaregun: {
    grip: [1, 3],
    rows: [
      'oooooooooo',
      'oooooRRRRR',
      'oo.d......',
      'oo........',
      'bb........',
    ],
  },
  shotgun: {
    grip: [5, 3],
    rows: [
      'wwww..ggggggggggggl',
      'wwwwwmddddddddddddd',
      'ww...dd..WWWWW.....',
      '.....dd............',
    ],
  },
  smg: {
    grip: [6, 2],
    rows: [
      '....gggggggggggl',
      'dddddddddddddddd',
      'dd....dd.d......',
      '......dd.d......',
      '.........d......',
    ],
  },
  rifle: {
    grip: [7, 3],
    rows: [
      '.........b..........',
      'wwww.gggggggggggggggl',
      'wwwwwdddddddddddddddd',
      'ww...ddd.dd..........',
      '.......d.dd..........',
      '..........d..........',
    ],
  },
  sniper: {
    grip: [8, 3],
    rows: [
      '........bbbbbb........',
      '........dcdddd........',
      'wwwwwggggggggggggggggggl',
      'WWWWwdddddddddddddd.....',
      'WW....dd.d..............',
    ],
  },
  minigun: {
    grip: [6, 4],
    rows: [
      '......gggggggggggggl',
      '....ddmmmmmmmmmmmmml',
      '...dddgggggggggggggl',
      '....ddmmmmmmmmmmmmml',
      '.....dd.dd..........',
      '.....bb.............',
    ],
  },
  flamer: {
    grip: [8, 3],
    rows: [
      '..RRR..............',
      '.RRRRR.gggggggggddo',
      '.RRRRRdddddddddddd.',
      '.RRRRR.dd..........',
      '..RRR..dd..........',
    ],
  },
  bazooka: {
    grip: [7, 3],
    rows: [
      'eeeeeeeeeeeeeeeeeeG.',
      'GGGGGGGGGGGGGGGGGGGd',
      'GGGGGGGGGGGGGGGGGGGd',
      '......dd..dd........',
      '......bb............',
    ],
  },
  grenade: {
    grip: [2, 3],
    rows: [
      '..ll.',
      '.dmd.',
      'GeeGG',
      'GeGGG',
      'GGGGG',
      '.GGG.',
    ],
  },
  molotov: {
    grip: [1, 5],
    rows: [
      '.o.',
      'yo.',
      '.W.',
      '.w.',
      'wcw',
      'wcw',
      'www',
      'www',
    ],
  },
  c4: {
    grip: [4, 2],
    rows: [
      'kkkkkkkkk',
      'kRBkkbbkk',
      'kkkkkbbkk',
      'kkkkkkkkk',
    ],
  },
  mine: {
    grip: [4, 1],
    rows: [
      '...R.....',
      '.ggggggg.',
      'ddddddddd',
    ],
  },
  medkit: {
    grip: [4, 0],
    rows: [
      '..bbbbb..',
      'xxxxxxxxx',
      'xxxxRxxxx',
      'xxxRRRxxx',
      'xxxxRxxxx',
      'xxxxxxxxx',
    ],
  },
  jetpack: {
    grip: [3, 4],
    rows: [
      '.gg..gg.',
      'gRRggRRg',
      'gRRggRRg',
      'gRRmmRRg',
      'gRRmmRRg',
      'gRRggRRg',
      '.dd..dd.',
      '.oo..oo.',
    ],
  },
  speed: {
    grip: [3, 3],
    rows: [
      '....YY.',
      '...YY..',
      '..YY...',
      '.YYYYY.',
      '...YY..',
      '..YY...',
      '.YY....',
    ],
  },
  strength: {
    grip: [3, 3],
    rows: [
      '.RRRRR.',
      'RRxRxRR',
      'RRRRRRR',
      'RRRRRRR',
      '.RRRRR.',
      '..RRR..',
    ],
  },
  bullettime: {
    grip: [3, 3],
    rows: [
      'yyyyyyy',
      '.ccccc.',
      '..ccc..',
      '...c...',
      '..cBc..',
      '.cBBBc.',
      'yyyyyyy',
    ],
  },
  // the power orb (M11): one pickup for every hero; a swirling gold-and-blue sphere
  powerorb: {
    grip: [5, 5],
    rows: [
      '...ooooo...',
      '.ooYYYYYoo.',
      '.oYYxxYYYo.',
      'oYYxxxYYYBo',
      'oYxxxYYYBBo',
      'oYYxYYYBBBo',
      'oYYYYYBBBco',
      'oYYYYBBBcco',
      '.oYYBBBccco',
      '.ooYBBccoo.',
      '...ooooo...',
    ],
  },
  prop_crate: {
    grip: [7, 13],
    rows: [
      'nnnnnnnnnnnnnn',
      'nWWWWWWWWWWWWn',
      'nWnWWWWWWWWnWn',
      'nWwnwwwwwwnwWn',
      'nWwwnwwwwnwwWn',
      'nWwwwnwwnwwwWn',
      'nWWWWWnnWWWWWn',
      'nWwwwwnnwwwwWn',
      'nWwwwnwwnwwwWn',
      'nWwwnwwwwnwwWn',
      'nWWnWWWWWWnWWn',
      'nWnwwwwwwwwnWn',
      'nWWWWWWWWWWWWn',
      'nnnnnnnnnnnnnn',
    ],
  },
  prop_barrel: {
    grip: [6, 15],
    rows: [
      '.dddddddddd.',
      'rrrxRRRRRrrr',
      'rrrxRRRRRrrr',
      'mmmmmmmmmmmm',
      'rrrxRRRRRrrr',
      'rrrxRRRRRrrr',
      'bbYYbbYYbbYY',
      'bYYbbYYbbYYb',
      'YYbbYYbbYYbb',
      'YbbYYbbYYbbY',
      'rrrxRRRRRrrr',
      'rrrxRRRRRrrr',
      'mmmmmmmmmmmm',
      'rrrxRRRRRrrr',
      'rrrxRRRRRrrr',
      '.dddddddddd.',
    ],
  },
  prop_gas: {
    grip: [4, 12],
    rows: [
      '...mm...',
      '..mddm..',
      '.GGGGGG.',
      'GGeGGGGG',
      'GGeGGGGG',
      'GGeGGGGG',
      'GYYYYYYG',
      'GYYYYYYG',
      'GGeGGGGG',
      'GGeGGGGG',
      'GGeGGGGG',
      'GGeGGGGG',
      '.GGGGGG.',
    ],
  },
  prop_tnt: {
    grip: [6, 11],
    rows: [
      'RRRRRRRRRRRR',
      'RxxxxxxxxxxR',
      'RxRRxRxRRxxR',
      'RxxRxRRxRxxR',
      'RxxRxRxRRxxR',
      'RxxxxxxxxxxR',
      'RRRRRRRRRRRR',
      'RooooooooooR',
      'RRRRRRRRRRRR',
      'RxxRxxRxxRxR',
      'RRRRRRRRRRRR',
      '.d........d.',
    ],
  },
  prop_chandelier: {
    grip: [14, 11],
    rows: [
      '.............dd.............',
      '.............dd.............',
      '.............yy.............',
      '......yyyyyyyyyyyyyyyy......',
      '....yyy..y....yy....y.yyy...',
      '..yy.....y....yy....y....yy.',
      '.y......cyc..cyyc..cyc.....y',
      'yyyyyyyyyyyyyyyyyyyyyyyyyyyy',
      '.c..c..c..c..c..c..c..c..c..',
      '.c..c..c..c..c..c..c..c..c..',
      '............................',
      '............................',
    ],
  },
  proj_rocket: {
    grip: [4, 1],
    rows: [
      'd.ggggR.',
      'ddmmmmRR',
      'd.ggggR.',
    ],
  },
};

export interface WeaponFrame {
  key: string;
  frame: string;
  /** grip position in the frame (px, including outline padding) — use as sprite origin */
  gripX: number;
  gripY: number;
  w: number;
  h: number;
}

const frames = new Map<string, WeaponFrame>();

export function bakeWeapons(scene: Phaser.Scene): void {
  const ids = Object.keys(WEAPON_ART);
  const cellW = 32;
  const cellH = 24;
  const pc = new PixelCanvas(cellW * ids.length, cellH);
  const layout: { id: string; x: number; w: number; h: number }[] = [];
  ids.forEach((id, i) => {
    const art = WEAPON_ART[id];
    const len = Math.max(...art.rows.map((r) => r.length));
    const rows = art.rows.map((r) => r.padEnd(len, '.'));
    const w = len + 2;
    const h = rows.length + 2;
    const x = i * cellW;
    pc.ascii(x + 1, 1, rows, PAL);
    pc.outline(x, 0, w, h);
    layout.push({ id, x, w, h });
  });
  const tex = scene.textures.addCanvas('weapons', pc.flush())!;
  for (const l of layout) {
    tex.add(l.id, 0, l.x, 0, l.w, l.h);
    const art = WEAPON_ART[l.id];
    frames.set(l.id, { key: 'weapons', frame: l.id, gripX: art.grip[0] + 1, gripY: art.grip[1] + 1, w: l.w, h: l.h });
  }
}

export function weaponFrame(id: string): WeaponFrame | undefined {
  return frames.get(id);
}
