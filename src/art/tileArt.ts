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
export const BACK_VARIANTS = 4;

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

// ------------------------------------------------------------------ back walls
// Each theme gets its own wall material (map detailing pass) with BACK_VARIANTS variants: variant 0 is
// the plain material, 1..3 add a detail (stain, rivets, vent, crack, knot...). WorldRenderer picks a
// variant per cell from a hash so walls never look like a repeated grid.

type BackStyle = 'panels' | 'plates' | 'damask' | 'drywall' | 'labtile' | 'rock' | 'planks' | 'bricks' | 'concrete' | 'crystal';

const BACK_STYLE: Record<string, BackStyle> = {
  arena: 'panels',
  rooftops: 'bricks',
  train: 'plates',
  factory: 'plates',
  construction: 'concrete',
  casino: 'damask',
  docks: 'concrete',
  office: 'drywall',
  lab: 'labtile',
  mine: 'rock',
  leaf: 'planks',
  ship: 'planks',
  alien: 'crystal',
};

function paintBackStyle(pc: PixelCanvas, ox: number, oy: number, th: ThemeColors, style: BackStyle, v: number): void {
  const b = th.back;
  const lo = th.backSeam;
  const hi = shade(b, 0.07);
  const dark = shade(b, -0.25);
  const set = (x: number, y: number, c: string) => pc.set(ox + x, oy + y, c);
  const noise = (amt: number, seed: number) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const n = hash2(x, y, seed);
        if (n < amt) set(x, y, lo);
        else if (n > 1 - amt * 0.6) set(x, y, hi);
      }
  };
  pc.rect(ox, oy, 16, 16, b);
  switch (style) {
    case 'panels': {
      // corrugated warehouse sheet: ribs every 4 px
      for (let x = 0; x < 16; x += 4) {
        pc.rect(ox + x + 1, oy, 1, 16, hi);
        pc.rect(ox + x + 2, oy, 1, 16, lo);
      }
      if (v === 1) for (let y = 3; y < 13; y++) set(6 + (y % 2), y, shade('#7a4a2a', -0.3)); // rust run
      if (v === 2) for (const x of [1, 5, 9, 13]) set(x, 2, shade(b, 0.25));
      if (v === 3) for (let y = 5; y < 11; y += 2) pc.rect(ox + 3, oy + y, 10, 1, dark); // vent slits
      break;
    }
    case 'plates': {
      noise(0.04, 7);
      pc.rect(ox, oy, 16, 1, dark);
      pc.rect(ox, oy, 1, 16, dark);
      pc.rect(ox + 1, oy + 1, 15, 1, hi);
      for (const [x, y] of [
        [3, 3],
        [12, 3],
        [3, 12],
        [12, 12],
      ]) {
        set(x, y, shade(b, 0.3));
        set(x + 1, y + 1, dark);
      }
      if (v === 1) for (let y = 4; y < 16; y++) set(12 + (y > 9 ? 1 : 0), y, shade('#8a4a22', -0.2)); // rust streak
      if (v === 2) {
        pc.rect(ox + 5, oy + 6, 6, 4, shade(b, -0.12));
        pc.rect(ox + 5, oy + 6, 6, 1, dark);
      }
      if (v === 3) for (let x = 2; x < 14; x++) set(x, 8, x % 3 === 0 ? dark : lo);
      break;
    }
    case 'damask': {
      // wallpaper: diamond lattice + little fleurons, gold pinstripe on variant 2
      const pat = shade(b, 0.12);
      for (let i = 0; i < 8; i++) {
        set(i, i, pat);
        set(15 - i, i, pat);
        set(i, 15 - i, pat);
        set(15 - i, 15 - i, pat);
      }
      const gold = shade('#c89040', -0.35);
      for (const [x, y] of [
        [7, 7],
        [8, 7],
        [7, 8],
        [8, 8],
        [7, 0],
        [8, 15],
        [0, 7],
        [15, 8],
      ])
        set(x, y, gold);
      set(7, 4, pat);
      set(8, 11, pat);
      if (v === 1) noise(0.03, 3);
      if (v === 2) {
        // gold rosette in the lattice
        const g2 = shade('#c89040', -0.15);
        for (const [x, y] of [[7, 6], [6, 7], [9, 7], [7, 9], [9, 8], [8, 6], [6, 8], [8, 9]]) set(x, y, g2);
      }
      if (v === 3) {
        // a peeled corner
        for (let y = 10; y < 15; y++) for (let x = 10; x < 10 + (y - 9); x++) set(x, y, dark);
      }
      break;
    }
    case 'drywall': {
      noise(0.025, 11);
      pc.rect(ox, oy, 1, 16, lo);
      if (v === 1) for (let x = 4; x < 11; x++) set(x, 9 + (x % 2), lo); // scuff
      if (v === 2) {
        // wall socket
        pc.rect(ox + 6, oy + 9, 4, 5, shade(b, 0.35));
        set(7, 11, dark);
        set(8, 11, dark);
      }
      if (v === 3) {
        // small vent
        pc.rect(ox + 4, oy + 3, 8, 5, dark);
        for (let y = 4; y < 7; y++) pc.rect(ox + 5, oy + y, 6, 1, y % 2 ? lo : hi);
      }
      break;
    }
    case 'labtile': {
      // clinical 8 px tiles with grout and a glint each
      for (let t = 0; t < 4; t++) {
        const tx = (t % 2) * 8;
        const ty = Math.floor(t / 2) * 8;
        pc.rect(ox + tx, oy + ty, 8, 1, lo);
        pc.rect(ox + tx, oy + ty, 1, 8, lo);
        set(tx + 2, ty + 2, hi);
        if (v === 1 && t === 2) pc.rect(ox + tx + 1, oy + ty + 1, 7, 7, shade(b, -0.15));
      }
      if (v === 2) {
        set(10, 9, dark);
        set(11, 10, dark);
        set(11, 11, dark);
        set(12, 12, dark);
        set(12, 13, dark);
      }
      if (v === 3) {
        // screwed inspection plate
        pc.rect(ox + 9, oy + 9, 6, 6, shade(b, 0.12));
        for (const [x, y] of [[10, 10], [13, 10], [10, 13], [13, 13]]) set(x, y, dark);
      }
      break;
    }
    case 'rock': {
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const n = hash2(Math.floor(x / 3), Math.floor(y / 3), 5) * 0.6 + hash2(x, y, 9) * 0.4;
          set(x, y, n < 0.28 ? lo : n > 0.78 ? hi : b);
        }
      if (v === 1)
        for (const [x, y] of [
          [5, 6],
          [6, 6],
          [6, 7],
          [10, 11],
        ])
          set(x, y, '#d8a040'); // gold fleck
      if (v === 2) for (let i = 0; i < 9; i++) set(3 + i, 4 + Math.round(i * 0.7), dark);
      if (v === 3) pc.circle(ox + 8, oy + 8, 3, shade(b, -0.4));
      break;
    }
    case 'planks': {
      for (let y = 0; y < 16; y += 4) {
        pc.rect(ox, oy + y, 16, 1, dark);
        for (let x = 0; x < 16; x++) if (hash2(x, y, 4) < 0.18) set(x, y + 2, lo);
        const seam = (y * 5) % 16;
        pc.rect(ox + seam, oy + y, 1, 4, dark);
        set((seam + 2) % 16, y + 1, shade(b, 0.2)); // nail
      }
      if (v === 1) {
        pc.circle(ox + 9, oy + 10, 1, dark);
        set(9, 10, lo);
      }
      if (v === 2) pc.rect(ox, oy + 5, 16, 3, shade(b, -0.12));
      if (v === 3) {
        pc.rect(ox + 3, oy + 1, 6, 6, shade(b, 0.1));
        for (const [x, y] of [
          [3, 1],
          [8, 1],
          [3, 6],
          [8, 6],
        ])
          set(x, y, dark);
      }
      break;
    }
    case 'bricks': {
      for (let row = 0; row < 4; row++) {
        const y = row * 4;
        pc.rect(ox, oy + y, 16, 1, lo);
        const off = row % 2 ? 4 : 0;
        for (let x = off; x < 16; x += 8) pc.rect(ox + x, oy + y, 1, 4, lo);
        set(off + 2, y + 2, hi);
      }
      if (v === 1) noise(0.05, 13);
      if (v === 2) pc.rect(ox + 9, oy + 5, 6, 3, shade(b, -0.2));
      if (v === 3) for (let y = 2; y < 14; y++) set(7, y, dark);
      break;
    }
    case 'concrete': {
      noise(0.06, 21);
      pc.rect(ox, oy + 7, 16, 1, lo);
      pc.rect(ox, oy, 1, 16, lo);
      if (v === 1) for (let y = 8; y < 16; y++) for (let x = 3; x < 8; x++) if (hash2(x, y, 2) < 0.5) set(x, y, shade(b, -0.12)); // damp stain
      if (v === 2) for (const x of [4, 11]) set(x, 3, dark); // tie holes
      if (v === 3) for (let i = 0; i < 7; i++) set(8 + i, 9 + (i % 3), dark);
      break;
    }
    case 'crystal': {
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const n = hash2(Math.floor((x + y) / 4), Math.floor((x - y + 16) / 4), 3);
          set(x, y, n < 0.3 ? lo : n > 0.82 ? hi : b);
        }
      if (v === 1)
        for (const [x, y] of [
          [4, 4],
          [5, 5],
          [11, 10],
        ])
          set(x, y, '#9a5af0');
      if (v === 2)
        for (const [x, y] of [
          [7, 3],
          [8, 3],
          [8, 4],
          [12, 12],
        ])
          set(x, y, '#2ab8a8');
      if (v === 3) for (let i = 0; i < 6; i++) set(5 + i, 12 - i, shade('#c8a0ff', -0.3));
      break;
    }
  }
}

function paintBack(pc: PixelCanvas, ox: number, oy: number, m: number, th: ThemeColors, theme: string, variant: number): void {
  paintBackStyle(pc, ox, oy, th, BACK_STYLE[theme] ?? 'panels', variant);
  // shading where the wall meets open air: a soft shadow under ceilings, darker sides
  if (!up(m)) {
    pc.rect(ox, oy, 16, 1, shade(th.back, -0.45));
    pc.rect(ox, oy + 1, 16, 2, shade(th.back, -0.25));
  }
  if (!left(m)) pc.rect(ox, oy, 1, 16, shade(th.back, -0.3));
  if (!right(m)) pc.rect(ox + 15, oy, 1, 16, shade(th.back, -0.3));
  if (!down(m)) pc.rect(ox, oy + 15, 16, 1, shade(th.back, -0.2));
}

/** Back wall variant for a cell: mostly plain, a few with details (stable per position). */
export function backVariant(tx: number, ty: number): number {
  const h = hash2(tx, ty, 99);
  return h < 0.72 ? 0 : h < 0.82 ? 1 : h < 0.91 ? 2 : 3;
}

/** Bake the tileset texture 'tiles_<theme>'. */
export function bakeTiles(scene: Phaser.Scene, theme: string): string {
  const key = 'tiles_' + theme;
  if (scene.textures.exists(key)) return key;
  const th = THEMES[theme] ?? THEMES.arena;
  const pc = new PixelCanvas(16 * TILE, (KIND_ROWS + BACK_VARIANTS) * TILE);
  for (const [kindStr, painter] of Object.entries(PAINTERS)) {
    const kind = Number(kindStr);
    for (let mask = 0; mask < 16; mask++) painter(pc, mask * TILE, kind * TILE, mask, kind * 31 + mask);
  }
  for (let v = 0; v < BACK_VARIANTS; v++) for (let mask = 0; mask < 16; mask++) paintBack(pc, mask * TILE, (BACK_ROW + v) * TILE, mask, th, theme, v);
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
