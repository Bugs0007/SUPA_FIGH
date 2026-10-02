import type Phaser from 'phaser';
import { TILE } from '../sim/constants';
import { TK } from '../sim/map/tiles';
import type { TileMap } from '../sim/map/tilemap';
import { hash2, PixelCanvas } from './canvas';
import { P, shade } from './palette';

// Autotiled tileset: one row per tile kind, 16 variants per row indexed by a 4-bit neighbor mask
// (1 = up, 2 = right, 4 = down, 8 = left: set when that neighbor "connects").
// The row after the last tile kind holds the background wall for the current theme.

export const MASK_UP = 1;
export const MASK_RIGHT = 2;
export const MASK_DOWN = 4;
export const MASK_LEFT = 8;
export const KIND_ROWS = 14;
export const BACK_ROW = KIND_ROWS;

export interface ThemeColors {
  back: string;
  backSeam: string;
  sky0: string;
  sky1: string;
}

export const THEMES: Record<string, ThemeColors> = {
  arena: { back: '#2a2438', backSeam: '#221d2e', sky0: '#15111f', sky1: '#2b2140' },
  rooftops: { back: '#2a1e3a', backSeam: '#20162e', sky0: '#120c24', sky1: '#3a1a4a' },
  train: { back: '#2a2a34', backSeam: '#202028', sky0: '#0e1024', sky1: '#242a50' },
  factory: { back: '#3a2a22', backSeam: '#2e201a', sky0: '#2a1410', sky1: '#6a3418' },
  construction: { back: '#4a4a52', backSeam: '#3e3e46', sky0: '#6fa8dc', sky1: '#a8d0f0' },
  casino: { back: '#4a1424', backSeam: '#3a0e1c', sky0: '#2a0a14', sky1: '#4a1424' },
  docks: { back: '#2a3440', backSeam: '#222a34', sky0: '#3a2048', sky1: '#f08a4a' },
  office: { back: '#3a4656', backSeam: '#303a48', sky0: '#7ab0e0', sky1: '#b8d8f0' },
  lab: { back: '#16302e', backSeam: '#102624', sky0: '#081a1c', sky1: '#0c2428' },
  mine: { back: '#2a1e14', backSeam: '#20160e', sky0: '#120c08', sky1: '#1e140c' },
  leaf: { back: '#4a3424', backSeam: '#3c2a1c', sky0: '#5aa0e0', sky1: '#a8d8f8' },
  ship: { back: '#3e2a1c', backSeam: '#321f14', sky0: '#4a90d8', sky1: '#a8d8f0' },
  alien: { back: '#2a1838', backSeam: '#20102c', sky0: '#1a0a3a', sky1: '#4a2a7a' },
};

type Painter = (pc: PixelCanvas, ox: number, oy: number, mask: number, seed: number) => void;

const up = (m: number) => (m & MASK_UP) !== 0;
const right = (m: number) => (m & MASK_RIGHT) !== 0;
const down = (m: number) => (m & MASK_DOWN) !== 0;
const left = (m: number) => (m & MASK_LEFT) !== 0;

function edges(pc: PixelCanvas, ox: number, oy: number, m: number, hi: string, lo: string, ink: string = P.ink): void {
  if (!up(m)) {
    pc.rect(ox, oy, 16, 1, ink);
    pc.rect(ox, oy + 1, 16, 1, hi);
  }
  if (!down(m)) pc.rect(ox, oy + 15, 16, 1, ink);
  if (!left(m)) pc.rect(ox, oy, 1, 16, ink);
  if (!right(m)) pc.rect(ox + 15, oy, 1, 16, ink);
  if (!down(m)) pc.rect(ox + (left(m) ? 0 : 1), oy + 14, 16 - (left(m) ? 0 : 1) - (right(m) ? 0 : 1), 1, lo);
}

const concrete: Painter = (pc, ox, oy, m, seed) => {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const n = hash2(x, y, seed);
      pc.set(ox + x, oy + y, n < 0.08 ? P.concrete0 : n > 0.93 ? P.concrete2 : P.concrete1);
    }
  if (hash2(seed, 3) < 0.4) pc.line(ox + 3, oy + 5, ox + 7, oy + 9, P.concrete0);
  if (!up(m)) pc.rect(ox, oy + 2, 16, 1, P.concrete2);
  edges(pc, ox, oy, m, P.concrete3, P.concrete0);
};

const metal: Painter = (pc, ox, oy, m) => {
  pc.rect(ox, oy, 16, 16, P.steel1);
  pc.rect(ox + 1, oy + 1, 14, 1, P.steel2);
  pc.rect(ox + 1, oy + 1, 1, 14, P.steel2);
  pc.rect(ox + 1, oy + 14, 14, 1, P.steel0);
  pc.rect(ox + 14, oy + 1, 1, 14, P.steel0);
  for (const [x, y] of [
    [3, 3],
    [12, 3],
    [3, 12],
    [12, 12],
  ])
    pc.set(ox + x, oy + y, P.steel3);
  pc.line(ox + 5, oy + 10, ox + 10, oy + 5, P.steel2);
  edges(pc, ox, oy, m, P.steel4, P.steel0);
};

const steel: Painter = (pc, ox, oy, m) => {
  pc.rect(ox, oy, 16, 16, P.steel0);
  pc.rect(ox, oy, 16, 1, P.steel1);
  pc.rect(ox, oy + 8, 16, 1, P.steel1);
  for (let x = 2; x < 16; x += 6) {
    pc.set(ox + x, oy + 3, P.steel2);
    pc.set(ox + x + 3, oy + 11, P.steel2);
  }
  edges(pc, ox, oy, m, P.steel2, P.ink2);
};

const brick: Painter = (pc, ox, oy, m, seed) => {
  pc.rect(ox, oy, 16, 16, P.brick0);
  for (let row = 0; row < 4; row++) {
    const off = row % 2 === 0 ? 0 : 4;
    for (let bx = -1; bx < 3; bx++) {
      const x0 = bx * 8 + off;
      const col = hash2(bx + 10, row, seed) < 0.3 ? P.brick2 : P.brick1;
      for (let y = 0; y < 3; y++)
        for (let x = 0; x < 7; x++) {
          const px = x0 + x;
          if (px >= 0 && px < 16) pc.set(ox + px, oy + row * 4 + y, col);
        }
    }
  }
  edges(pc, ox, oy, m, P.brick2, P.brick0);
};

const wood: Painter = (pc, ox, oy, m, seed) => {
  for (let x = 0; x < 16; x++) {
    const plank = Math.floor(x / 4);
    const col = x % 4 === 3 ? P.wood0 : plank % 2 === 0 ? P.wood1 : P.wood2;
    pc.rect(ox + x, oy, 1, 16, col);
  }
  for (let p = 0; p < 4; p++) {
    pc.set(ox + p * 4 + 1, oy + 2, P.steel3);
    pc.set(ox + p * 4 + 1, oy + 13, P.steel3);
    if (hash2(p, 7, seed) < 0.5) pc.set(ox + p * 4 + 2, oy + 7 + (p % 3), P.wood0);
  }
  edges(pc, ox, oy, m, P.wood3, P.wood0);
};

const glass: Painter = (pc, ox, oy, m) => {
  pc.rect(ox, oy, 16, 16, P.glass0, 120);
  pc.line(ox + 3, oy + 12, ox + 12, oy + 3, P.glass2);
  pc.line(ox + 6, oy + 13, ox + 13, oy + 6, P.glass1);
  const f = P.steel2;
  if (!up(m)) pc.rect(ox, oy, 16, 2, f);
  if (!down(m)) pc.rect(ox, oy + 14, 16, 2, f);
  if (!left(m)) pc.rect(ox, oy, 2, 16, f);
  if (!right(m)) pc.rect(ox + 14, oy, 2, 16, f);
};

const platWood: Painter = (pc, ox, oy, m) => {
  pc.rect(ox, oy, 16, 5, P.wood2);
  pc.rect(ox, oy, 16, 1, P.ink);
  pc.rect(ox, oy + 1, 16, 1, P.wood3);
  pc.rect(ox, oy + 4, 16, 1, P.wood0);
  pc.rect(ox, oy + 5, 16, 1, P.ink);
  pc.set(ox + 4, oy + 2, P.wood0);
  pc.set(ox + 12, oy + 3, P.wood0);
  if (!left(m)) {
    pc.rect(ox, oy, 1, 6, P.ink);
    pc.line(ox + 2, oy + 6, ox + 6, oy + 10, P.wood1, 2);
  }
  if (!right(m)) {
    pc.rect(ox + 15, oy, 1, 6, P.ink);
    pc.line(ox + 13, oy + 6, ox + 9, oy + 10, P.wood1, 2);
  }
};

const platMetal: Painter = (pc, ox, oy, m) => {
  pc.rect(ox, oy, 16, 4, P.steel2);
  pc.rect(ox, oy, 16, 1, P.ink);
  pc.rect(ox, oy + 1, 16, 1, P.steel4);
  for (let x = 1; x < 16; x += 3) pc.set(ox + x, oy + 2, P.steel0);
  pc.rect(ox, oy + 3, 16, 1, P.steel0);
  pc.rect(ox, oy + 4, 16, 1, P.ink);
  if (!left(m)) {
    pc.rect(ox, oy, 1, 5, P.ink);
    pc.rect(ox + 2, oy + 5, 2, 6, P.steel1);
  }
  if (!right(m)) {
    pc.rect(ox + 15, oy, 1, 5, P.ink);
    pc.rect(ox + 12, oy + 5, 2, 6, P.steel1);
  }
};

const ladder: Painter = (pc, ox, oy, m) => {
  pc.rect(ox + 2, oy, 2, 16, P.wood2);
  pc.rect(ox + 12, oy, 2, 16, P.wood2);
  pc.rect(ox + 1, oy, 1, 16, P.ink);
  pc.rect(ox + 4, oy, 1, 16, P.ink);
  pc.rect(ox + 11, oy, 1, 16, P.ink);
  pc.rect(ox + 14, oy, 1, 16, P.ink);
  for (let y = 2; y < 16; y += 5) {
    pc.rect(ox + 4, oy + y, 8, 2, P.wood3);
    pc.rect(ox + 4, oy + y + 2, 8, 1, P.ink);
  }
  if (!up(m)) {
    pc.rect(ox + 1, oy, 14, 1, P.ink);
  }
};

const dirt: Painter = (pc, ox, oy, m, seed) => {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const n = hash2(x, y, seed + 5);
      pc.set(ox + x, oy + y, n < 0.1 ? P.dirt0 : n > 0.9 ? P.dirt2 : P.dirt1);
    }
  edges(pc, ox, oy, m, P.dirt2, P.dirt0);
};

const water: Painter = (pc, ox, oy, m) => {
  pc.rect(ox, oy, 16, 16, P.water1, 210);
  if (!up(m)) {
    for (let x = 0; x < 16; x++) pc.set(ox + x, oy + (x % 8 < 4 ? 0 : 1), P.water2);
    pc.rect(ox, oy + 2, 16, 1, P.water2, 160);
  }
  pc.set(ox + 5, oy + 8, P.water2, 180);
  pc.set(ox + 11, oy + 12, P.water2, 180);
};

const conveyor =
  (dir: number): Painter =>
  (pc, ox, oy, m) => {
    pc.rect(ox, oy, 16, 16, P.steel0);
    pc.rect(ox, oy + 1, 16, 4, P.ink2);
    for (let x = 0; x < 16; x += 4) {
      const cx = dir > 0 ? x : 15 - x;
      pc.set(ox + cx, oy + 2, P.yellow);
      pc.set(ox + cx + (dir > 0 ? -1 : 1), oy + 3, P.yellow);
    }
    for (let x = 3; x < 16; x += 6) pc.circle(ox + x, oy + 10, 2, P.steel2);
    pc.rect(ox, oy + 14, 16, 1, P.ink);
    edges(pc, ox, oy, m, P.steel3, P.ink2);
  };

const PAINTERS: Record<number, Painter> = {
  [TK.CONV_L]: conveyor(-1),
  [TK.CONV_R]: conveyor(1),
  [TK.CONCRETE]: concrete,
  [TK.METAL]: metal,
  [TK.BRICK]: brick,
  [TK.WOOD]: wood,
  [TK.GLASS]: glass,
  [TK.PLAT_WOOD]: platWood,
  [TK.PLAT_METAL]: platMetal,
  [TK.LADDER]: ladder,
  [TK.DIRT]: dirt,
  [TK.WATER]: water,
  [TK.STEEL]: steel,
};

function paintBack(pc: PixelCanvas, ox: number, oy: number, m: number, th: ThemeColors): void {
  pc.rect(ox, oy, 16, 16, th.back);
  pc.rect(ox + 7, oy, 1, 16, th.backSeam);
  pc.rect(ox, oy + 7, 16, 1, th.backSeam);
  pc.set(ox + 3, oy + 3, shade(th.back, 0.08));
  pc.set(ox + 11, oy + 11, shade(th.back, 0.08));
  if (!up(m)) pc.rect(ox, oy, 16, 2, shade(th.back, -0.3));
  if (!left(m)) pc.rect(ox, oy, 1, 16, shade(th.back, -0.3));
  if (!right(m)) pc.rect(ox + 15, oy, 1, 16, shade(th.back, -0.3));
}

/** Bake the tileset texture 'tiles_<theme>'. */
export function bakeTiles(scene: Phaser.Scene, theme: string): string {
  const key = 'tiles_' + theme;
  if (scene.textures.exists(key)) return key;
  const th = THEMES[theme] ?? THEMES.arena;
  const pc = new PixelCanvas(16 * TILE, (KIND_ROWS + 1) * TILE);
  for (const [kindStr, painter] of Object.entries(PAINTERS)) {
    const kind = Number(kindStr);
    for (let mask = 0; mask < 16; mask++) painter(pc, mask * TILE, kind * TILE, mask, kind * 31 + mask);
  }
  for (let mask = 0; mask < 16; mask++) paintBack(pc, mask * TILE, BACK_ROW * TILE, mask, th);
  scene.textures.addCanvas(key, pc.flush());
  return key;
}

/** Which neighbors "connect" for autotiling. */
export function tileMask(map: TileMap, tx: number, ty: number): number {
  const k = map.get(tx, ty);
  const d = map.def(tx, ty);
  const connects = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= map.w || y >= map.h) return d.solid; // solids continue off-map
    const nk = map.get(x, y);
    if (k === TK.GLASS || d.oneWay || k === TK.LADDER || k === TK.WATER) return nk === k;
    return map.def(x, y).solid && nk !== TK.GLASS;
  };
  let m = 0;
  if (connects(tx, ty - 1)) m |= MASK_UP;
  if (connects(tx + 1, ty)) m |= MASK_RIGHT;
  if (connects(tx, ty + 1)) m |= MASK_DOWN;
  if (connects(tx - 1, ty)) m |= MASK_LEFT;
  return m;
}

export function backMask(map: TileMap, tx: number, ty: number): number {
  const b = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < map.w && y < map.h && (map.back[y * map.w + x] === 1 || map.def(x, y).solid);
  let m = 0;
  if (b(tx, ty - 1)) m |= MASK_UP;
  if (b(tx + 1, ty)) m |= MASK_RIGHT;
  if (b(tx, ty + 1)) m |= MASK_DOWN;
  if (b(tx - 1, ty)) m |= MASK_LEFT;
  return m;
}
