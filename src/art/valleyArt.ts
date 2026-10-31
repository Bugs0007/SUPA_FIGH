import type Phaser from 'phaser';
import { TILE } from '../sim/constants';
import { parseMap, type MapDef } from '../sim/map/mapData';
import { VALLEY_LAND, VALLEY_STATUE, VALLEY_W, type TileBox } from '../sim/map/maps/valley';
import { TK } from '../sim/map/tiles';
import { hash2, PixelCanvas } from './canvas';
import { mix, P } from './palette';

// Valley of the End (map 'valley'): the two stone statues, the cliffs, the waterfall and the river.
// The statues ARE the terrain: their cells are '#' tiles that the valley tileset leaves transparent ('#' and '-'
// paint nothing here), and this file paints them over exactly those cells into the world-sized scenery texture
// (arenaArt's bakeArenaScenery hands the 'valley' theme over to bakeValleyScenery). Same pixel rules as the
// fighters: whole pixels, flat tones, 1 px ink outline around the playable silhouette, banded/dithered gradients.
// render/ValleyFx.ts animates the falls, foam, mist and the river surface on top.

/** 'dusk' (default) or 'rain' (the rainy grey-blue of the first fight): flips the palette and adds rain. */
export const VALLEY_WEATHER: 'dusk' | 'rain' = 'dusk';

const SKY = {
  dusk: { top: '#28304f', mid: '#6a5d80', low: '#d99877', sun: '#ffd49a', far: '#56607f', far2: '#434c6b', haze: '#9a8aa0', clouds: '#c7a0a0' },
  rain: { top: '#2c3646', mid: '#56677a', low: '#8ea1ad', sun: '#c8d6dc', far: '#4e5d6c', far2: '#3f4c5b', haze: '#8094a0', clouds: '#73828f' },
}[VALLEY_WEATHER];

/** Statue stone (cool grey-green), cliff rock (warmer grey-brown), moss, water. */
const C = {
  s0: '#27312f', s1: '#3f4b47', s2: '#58655e', s3: '#75837a', s4: '#9aa697',
  r0: '#2a2928', r1: '#403c37', r2: '#575146', r3: '#6f6857', r4: '#8c846c',
  m0: '#2d4628', m1: '#486a33', m2: '#739248',
  w0: '#183447', w1: '#25515f', w2: '#3f7a82', w3: '#79b2ae', foam: '#cfe6df',
};

const W = VALLEY_W * TILE;
/** the waterfall (px): between the statues, crest at the cliff tops, foot in the river */
export const FALLS = { x0: 31 * TILE, x1: 49 * TILE, crest: VALLEY_LAND.cliffTop * TILE - 8 };
/** river surface (px): fighters standing on the riverbed are this many px deep in the water */
export const RIVER = { y: VALLEY_LAND.riverBed * TILE - 8, x0: (VALLEY_LAND.cliffX + 1) * TILE, x1: W - (VALLEY_LAND.cliffX + 1) * TILE };

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)] / 16;
const inBox = (b: TileBox, tx: number, ty: number) => tx >= b[0] && tx <= b[2] && ty >= b[1] && ty <= b[3];
const mirrorTx = (tx: number) => (tx < VALLEY_W / 2 ? tx : VALLEY_W - 1 - tx);

// ------------------------------------------------------------------ tiles

type TilePainter = (pc: PixelCanvas, ox: number, oy: number, mask: number, seed: number) => void;

/** Hanging vine (the valley's ladders): two twisted strands with leaves. */
const vine: TilePainter = (pc, ox, oy, _m, seed) => {
  for (let y = 0; y < 16; y++) {
    const a = 6 + Math.round(Math.sin((y + seed) * 0.55) * 2);
    const b = 9 + Math.round(Math.sin((y + seed) * 0.55 + 2.4) * 2);
    pc.set(ox + a, oy + y, C.m0);
    pc.set(ox + a + 1, oy + y, C.m1);
    pc.set(ox + b, oy + y, C.m0);
    pc.set(ox + b + 1, oy + y, C.m1);
  }
  for (const [x, y] of [[3, 2], [11, 6], [4, 10], [12, 13]]) {
    pc.rect(ox + x, oy + y, 3, 2, C.m1);
    pc.set(ox + x + (x < 8 ? 0 : 2), oy + y, C.m2);
    pc.set(ox + x + 1, oy + y + 2, C.m0);
  }
};
const none: TilePainter = () => undefined;

/** Valley tile painters by tile kind: stone and ledges are painted by the scenery (transparent here). */
export const VALLEY_TILES: Record<number, TilePainter> = { [TK.CONCRETE]: none, [TK.PLAT_WOOD]: none, [TK.LADDER]: vine };

// ------------------------------------------------------------------ parallax backdrop (640x360, tileable)

const BW = 640;
const BH = 360;
const wrap = (x: number) => ((x % BW) + BW) % BW;

function bandSky(pc: PixelCanvas, stops: [number, string][]): void {
  for (let y = 0; y < BH; y++) {
    let i = 0;
    while (i < stops.length - 2 && y > stops[i + 1][0]) i++;
    const [y0, c0] = stops[i];
    const [y1, c1] = stops[i + 1];
    const t = Math.max(0, Math.min(1, (y - y0) / Math.max(1, y1 - y0))) * 10;
    const a = mix(c0, c1, Math.floor(t) / 10);
    const b = mix(c0, c1, Math.min(10, Math.floor(t) + 1) / 10);
    for (let x = 0; x < BW; x++) pc.set(x, y, t % 1 > bayer(x, y) ? b : a);
  }
}

function ridge(pc: PixelCanvas, base: number, amp: number, color: string, seed: number, freq: number, lit: string): void {
  for (let x = 0; x < BW; x++) {
    const a = (x / BW) * Math.PI * 2;
    const h = amp * (0.55 + 0.3 * Math.sin(a * freq + seed) + 0.15 * Math.sin(a * freq * 3 + seed * 2)) + Math.floor(hash2(x >> 3, 1, seed) * 3);
    const top = Math.floor(base - h);
    const a2 = ((x + 6) / BW) * Math.PI * 2;
    const next = amp * (0.55 + 0.3 * Math.sin(a2 * freq + seed) + 0.15 * Math.sin(a2 * freq * 3 + seed * 2));
    pc.rect(x, top, 1, BH - top, color);
    // sunlit (rising) slopes catch the dusk light; flat tones only
    if (next > h) pc.rect(x, top, 1, Math.min(10, BH - top), lit);
    pc.set(x, top, mix(color, lit, 0.6));
  }
}

function conifer(pc: PixelCanvas, x: number, base: number, h: number, color: string): void {
  for (let r = 0; r < h; r++) {
    const half = Math.floor((r / h) * (h / 3.2)) + ((r % 5) < 2 ? 1 : 0);
    for (let i = -half; i <= half; i++) pc.set(wrap(x + i), base - h + r, color);
  }
  pc.rect(wrap(x), base, 1, 3, color);
}

/** Far + near parallax layers for the valley (registered in backgroundArt PAINTERS). */
export function paintValleyBackground(pc: PixelCanvas, layer: 'far' | 'near'): void {
  if (layer === 'far') {
    bandSky(pc, [[0, SKY.top], [150, SKY.mid], [260, SKY.low], [360, SKY.low]]);
    if (VALLEY_WEATHER === 'dusk') {
      pc.bloom(430, 236, 200, 110, SKY.sun, 0.35);
      pc.circle(430, 238, 13, SKY.sun);
    }
    // long flat dusk cloud bands
    for (let i = 0; i < 9; i++) {
      const cx = Math.floor(hash2(i, 0, 71) * BW);
      const cy = 40 + Math.floor(hash2(i, 1, 71) * 150);
      const w = 50 + Math.floor(hash2(i, 2, 71) * 90);
      for (let k = 0; k < w; k++) pc.set(wrap(cx + k), cy, SKY.clouds, 150);
      for (let k = 6; k < w - 10; k++) pc.set(wrap(cx + k), cy - 1, SKY.clouds, 110);
      for (let k = 12; k < w - 4; k++) pc.set(wrap(cx + k), cy + 1, mix(SKY.clouds, SKY.top, 0.3), 120);
    }
    ridge(pc, 292, 95, SKY.far, 1.7, 2, mix(SKY.far, SKY.low, 0.35));
    ridge(pc, 318, 60, SKY.far2, 4.2, 3, mix(SKY.far2, SKY.low, 0.3));
  } else {
    // canyon rims and pine silhouettes on the mesas around the valley
    const rim = mix('#2c3540', SKY.mid, 0.15);
    for (let i = 0; i < 6; i++) {
      const x = i * 110 + Math.floor(hash2(i, 0, 33) * 40);
      const w = 60 + Math.floor(hash2(i, 1, 33) * 50);
      const top = 250 + Math.floor(hash2(i, 2, 33) * 30);
      for (let k = 0; k < w; k++) pc.rect(wrap(x + k), top + (k < 4 || k > w - 5 ? 3 : 0), 1, BH, rim);
      for (let k = 2; k < w - 2; k += 5 + Math.floor(hash2(k, i, 9) * 6)) conifer(pc, x + k, top, 10 + Math.floor(hash2(k, i, 4) * 14), mix(rim, '#1d2a2a', 0.4));
    }
    // the valley floor seen past the bottom of the map: one continuous dark band, no sky gaps
    pc.rect(0, 296, BW, BH - 296, mix(rim, '#141c22', 0.5));
  }
}

// ------------------------------------------------------------------ the waterfall texture

/** One pixel of the falling water (period 128 px vertically). `streaks` = the fast bright layer only. */
function fallsPixel(x: number, y: number, width: number, streaks: boolean): string | null {
  const edge = Math.min(x, width - 1 - x);
  const rag = Math.floor(hash2(x, y >> 3, 17) * 3);
  if (edge < rag) return null;
  const col = x >> 2;
  const L = [8, 16, 32][Math.floor(hash2(col, 3, 5) * 3)];
  const phase = Math.floor(hash2(x >> 1, 4, 5) * 128);
  const seg = Math.floor(((y + phase) % 128) / L);
  const into = (y + phase) % L;
  const bright = hash2(x >> 1, seg, 11) < (streaks ? 0.14 : 0.32) && into < L * 0.6;
  if (streaks) return bright ? (hash2(x, seg, 3) < 0.2 ? C.foam : C.w3) : null;
  const side = edge < 14 ? 0 : edge < 34 ? 1 : 2;
  const band = hash2(col, 9, 2) < 0.3 ? Math.max(0, side - 1) : side;
  const base = [C.w0, C.w1, hash2(col, 4, 6) < 0.5 ? C.w1 : C.w2][band];
  return bright ? [C.w1, C.w2, C.w3][band] : base;
}

/** Bake the scrolling falls textures ('valley-falls-a' = body, 'valley-falls-b' = fast bright streaks). */
export function bakeValleyFalls(scene: Phaser.Scene): { body: string; streaks: string; w: number; h: number } {
  const w = FALLS.x1 - FALLS.x0;
  const h = 128;
  for (const [key, streaks] of [['valley-falls-a', false], ['valley-falls-b', true]] as const) {
    if (scene.textures.exists(key)) continue;
    const pc = new PixelCanvas(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = fallsPixel(x, y, w, streaks);
      if (c) pc.set(x, y, c, streaks ? 150 : 255);
    }
    scene.textures.addCanvas(key, pc.flush());
  }
  return { body: 'valley-falls-a', streaks: 'valley-falls-b', w, h };
}

// ------------------------------------------------------------------ world scenery

type Role = 'none' | 'rock' | 'statue' | 'ledge' | 'river';

function cellRole(def: MapDef, kinds: Uint8Array, mw: number, tx: number, ty: number): Role {
  if (tx < 0 || ty < 0 || tx >= mw || ty >= def.rows.length) return 'rock';
  const k = kinds[ty * mw + tx];
  if (k === TK.PLAT_WOOD) return 'ledge';
  if (k !== TK.CONCRETE) return 'none';
  const lx = mirrorTx(tx);
  for (const b of Object.values(VALLEY_STATUE)) if (inBox(b, lx, ty)) return 'statue';
  if (ty >= VALLEY_LAND.riverBed && lx > VALLEY_LAND.cliffX) return 'river';
  return 'rock';
}

/**
 * Cliff / canyon / boulder rock: tall jointed facets (a jittered Voronoi stretched vertically), each lit from the
 * upper left, dark joints between them, darker with depth in dithered steps.
 */
function rockPixel(x: number, y: number, wet: boolean, seed = 41, scale = 1): string {
  const gw = 26 * scale;
  const gh = 34 * scale;
  const cx = Math.floor(x / gw);
  const cy = Math.floor(y / gh);
  let d1 = 1e9;
  let d2 = 1e9;
  let sx = 0;
  let sy = 0;
  let id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const px = (cx + i) * gw + hash2(cx + i, cy + j, seed) * gw;
    const py = (cy + j) * gh + hash2(cx + i, cy + j, seed + 1) * gh;
    const d = Math.hypot((x - px) * 1.3, (y - py) * 0.55);
    if (d < d1) {
      d2 = d1;
      d1 = d;
      sx = px;
      sy = py;
      id = hash2(cx + i, cy + j, seed + 2);
    } else if (d < d2) d2 = d;
  }
  const tones = [C.r0, C.r1, C.r2, C.r3, C.r4];
  if (d2 - d1 < 1.3) return wet ? mix(C.r0, C.w0, 0.3) : C.r0;
  let t = id < 0.3 ? 1 : id < 0.8 ? 2 : 3;
  const rel = (x - sx) * 0.8 + (y - sy) * 0.5;
  if (rel < -9) t++;
  else if (rel > 9) t--;
  if (d2 - d1 < 3 && rel > 0) t--;
  if (hash2(x, y, 3) < 0.025) t++;
  const depth = (y - 330) / 320;
  if (depth > 0 && depth > bayer(x, y) * 0.5 + 0.35) t--;
  let c = tones[Math.max(0, Math.min(4, t))];
  if (wet) c = mix(c, C.w1, 0.3);
  return c;
}

/** Statue hair (darker than the stone so the silhouettes read: straight curtain vs spiky mane). */
const HAIR = ['#1d2624', '#2d3836', '#45524d'];

/** A statue, painted in left-statue local px (facing right); `uchiha` mirrors it to the right cliff. */
function paintStatue(pc: PixelCanvas, uchiha: boolean, solid: (lx: number, ly: number) => boolean): void {
  const X = (lx: number) => (uchiha ? W - 1 - lx : lx);
  const set = (lx: number, ly: number, c: string) => {
    if (solid(lx, ly)) pc.set(X(lx), ly, c);
  };
  // decorative pixels outside the collision cells (nose, toes, Madara's spikes): sides only, never above a top
  const free = (lx: number, ly: number, c: string) => {
    if (!solid(lx, ly)) pc.set(X(lx), ly, c);
  };
  const rect = (x: number, y: number, w: number, h: number, c: string) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, c);
  };
  const hline = (x0: number, x1: number, y: number, c: string) => rect(x0, y, x1 - x0 + 1, 1, c);
  const vline = (x: number, y0: number, y1: number, c: string) => rect(x, y0, 1, y1 - y0 + 1, c);
  const line = (x0: number, y0: number, x1: number, y1: number, c: string, plot = set) => {
    const n = Math.max(1, Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) plot(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c);
  };
  const disc = (cx: number, cy: number, r: number, c: string) => {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) set(cx + x, cy + y, c);
  };
  /** a filled triangle (spikes, locks): apex + two base points */
  const tri = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, c: string, plot = set) => {
    const minX = Math.min(ax, bx, cx);
    const maxX = Math.max(ax, bx, cx);
    const minY = Math.min(ay, by, cy);
    const maxY = Math.max(ay, by, cy);
    const s = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const d1 = s(x, y, ax, ay, bx, by);
      const d2 = s(x, y, bx, by, cx, cy);
      const d3 = s(x, y, cx, cy, ax, ay);
      if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) plot(x, y, c);
    }
  };
  const any = (lx: number, ly: number, c: string) => pc.set(X(lx), ly, c);
  const px = (b: TileBox) => [b[0] * TILE, b[1] * TILE, (b[2] + 1) * TILE - 1, (b[3] + 1) * TILE - 1];

  // base stone everywhere
  for (let ly = 0; ly < 20 * TILE; ly++) for (let lx = 0; lx < 20 * TILE; lx++) set(lx, ly, C.s2);

  // pedestal: carved block, frieze lines, swirl panels
  {
    const [x0, y0, x1, y1] = px(VALLEY_STATUE.pedestal);
    rect(x0, y0, x1 - x0 + 1, 5, C.s3);
    hline(x0, x1, y0 + 5, C.s1);
    hline(x0, x1, y0 + 8, C.s1);
    for (let x = x0 + 14; x < x1; x += 30) {
      vline(x, y0 + 9, y1 - 7, C.s1);
      vline(x + 1, y0 + 9, y1 - 7, C.s3);
      const cx = x + 15;
      const cy = y0 + 17;
      for (let a = 0; a < 18; a++) set(Math.round(cx + Math.cos(a * 0.6) * (1 + a * 0.3)), Math.round(cy + Math.sin(a * 0.6) * (1 + a * 0.3)), C.s1);
    }
    rect(x0, y1 - 5, x1 - x0 + 1, 6, C.s1);
  }
  // legs below the skirt: two tapered shins in greaves with knee guards, sandalled feet stepping forward
  {
    const [x0, y0, x1, y1] = px(VALLEY_STATUE.legs);
    const mid = (x0 + x1) >> 1;
    rect(x0, y0, x1 - x0 + 1, y1 - y0 + 1, C.s0);
    for (const [a, b, tone] of [[x0 + 4, mid - 6, C.s2], [mid + 4, x1 - 2, C.s3]] as const) {
      for (let y = y0; y < y1 - 8; y++) {
        const taper = Math.floor(((y - y0) / (y1 - y0)) * 7);
        rect(a + taper, y, b - a + 1 - taper * 2, 1, tone);
        set(a + taper, y, C.s4);
        set(b - taper, y, C.s1);
      }
      rect(a - 2, y0, b - a + 5, 10, C.s3); // knee guard
      hline(a - 2, b + 2, y0 + 10, C.s0);
      vline((a + b) >> 1, y0 + 12, y1 - 10, C.s4);
      vline(((a + b) >> 1) + 1, y0 + 12, y1 - 10, C.s1);
      rect(a - 1, y1 - 8, b - a + 9, 9, C.s1); // foot
      hline(a - 1, b + 7, y1 - 8, C.s3);
      for (let x = a + 2; x < b + 6; x += 6) vline(x, y1 - 7, y1 - 3, C.s0);
    }
    for (let y = y1 - 7; y <= y1; y++) for (let i = 1; i <= 4; i++) if (y - (y1 - 7) >= 4 - i) free(x1 + i, y, y === y1 - 7 ? C.s3 : C.s1); // toes
  }
  // armour skirt: dark belt, flared overlapping tassets
  {
    const [x0, y0, x1, y1] = px(VALLEY_STATUE.skirt);
    for (let x = x0, i = 0; x <= x1; x += 16, i++) {
      rect(x, y0 + 7, 16, y1 - y0 - 6, i % 2 ? C.s2 : C.s3);
      vline(x, y0 + 7, y1, C.s0);
      vline(x + 1, y0 + 7, y1, C.s4);
      hline(x + 2, x + 15, y0 + 16, C.s1);
      hline(x + 2, x + 15, y0 + 24, C.s1);
      set(x + 5, y0 + 11, C.s4);
      set(x + 11, y0 + 11, C.s4);
    }
    rect(x0, y0, x1 - x0 + 1, 7, C.s1);
    hline(x0, x1, y0 + 1, C.s0);
    hline(x0, x1, y0 + 6, C.s0);
    rect(x0 + 116, y0 + 1, 12, 5, C.s3); // belt knot
    for (let i = 0; i < 9; i++) set(x0 + 120 + (i >> 2), y0 + 7 + i, C.s3);
    rect(x0, y1 - 2, x1 - x0 + 1, 3, C.s1);
  }
  // torso: cuirass with a chest plate and lames
  {
    const [x0, y0, x1, y1] = px(VALLEY_STATUE.torso);
    rect(x0 + 52, y0 + 6, x1 - x0 - 52, 34, C.s3);
    hline(x0 + 52, x1, y0 + 6, C.s4);
    for (let x = x0 + 52; x <= x1; x++) {
      const y = y0 + 40 + Math.round(Math.sin((x - x0) / 14) * 2);
      set(x, y, C.s0);
      set(x, y + 1, C.s1);
    }
    for (let y = y0 + 50; y < y1; y += 9) {
      hline(x0 + 16, x1, y, C.s1);
      hline(x0 + 16, x1, y + 1, C.s3);
      for (let x = x0 + 22; x < x1; x += 12) set(x, y + 4, C.s4);
    }
  }
  // shoulder guards: curved stacked lames, back and front
  {
    const [x0, y0, x1] = px(VALLEY_STATUE.shoulders);
    for (const [a, b] of [[x0, x0 + 40], [x1 - 54, x1]]) {
      for (let k = 0; k < 3; k++) {
        const y = y0 + k * 6;
        rect(a, y, b - a + 1, 6, k === 0 ? C.s3 : k === 1 ? C.s2 : C.s1);
        hline(a, b, y, k === 0 ? C.s4 : C.s3);
        hline(a, b, y + 5, C.s0);
      }
    }
  }
  // the raised arm: upper arm down from the front shoulder guard to the elbow, forearm angling up to the fist;
  // the armpit / forearm cells behind it read as shadow
  {
    const [ax0, ay0] = px(VALLEY_STATUE.armpit);
    const [, , fx1, fy1] = px(VALLEY_STATUE.forearm);
    rect(ax0, ay0, fx1 - ax0 + 1, fy1 - ay0 + 1, C.s1);
    for (let y = ay0 - 4; y <= fy1; y++) for (let x = ax0 - 26; x < ax0; x++) set(x, y, x < ax0 - 24 ? C.s0 : x < ax0 - 21 ? C.s4 : C.s3);
    for (const y of [ay0 + 6, ay0 + 16]) hline(ax0 - 24, ax0 - 1, y, C.s1);
    // forearm: a thick band from the elbow up to the wrist, bracer rings across it
    const ex = ax0 - 8;
    const ey = fy1 - 6;
    const wx = fx1 + 6;
    const wy = ay0 + 8;
    for (let t = 0; t <= 1; t += 0.01) {
      const cx = Math.round(ex + (wx - ex) * t);
      const cy = Math.round(ey + (wy - ey) * t);
      for (let k = -7; k <= 7; k++) set(cx + k, cy + Math.round(k * 0.5), Math.abs(k) > 5 ? C.s0 : k < -3 ? C.s4 : C.s3);
    }
    for (const t of [0.35, 0.6]) {
      const cx = Math.round(ex + (wx - ex) * t);
      const cy = Math.round(ey + (wy - ey) * t);
      for (let k = -5; k <= 5; k++) set(cx + k, cy + Math.round(k * 0.5), C.s1);
    }
  }
  // raised hand: fist, two raised fingers (the seal of confrontation)
  {
    const [hx0, hy0, hx1, hy1] = px(VALLEY_STATUE.hand);
    rect(hx0, hy0, hx1 - hx0 + 1, hy1 - hy0 + 1, C.s3);
    // curled fingers on the front of the fist: rounded segments with dark creases
    for (let k = 0; k < 3; k++) {
      const y = hy0 + 6 + k * 8;
      disc(hx1 - 5, y + 3, 4, C.s4);
      hline(hx1 - 18, hx1, y + 7, C.s1);
    }
    vline(hx1 - 11, hy0 + 6, hy1 - 3, C.s1);
    // thumb wrapped across, wrist cuff
    line(hx0 + 4, hy0 + 18, hx1 - 12, hy0 + 12, C.s4);
    line(hx0 + 4, hy0 + 19, hx1 - 12, hy0 + 13, C.s1);
    rect(hx0, hy0, 5, hy1 - hy0 + 1, C.s1);
    // index + middle finger raised together, rounded tips, a notch and an ink groove between them
    const [gx0, gy0, gx1, gy1] = px(VALLEY_STATUE.fingers);
    rect(gx0, gy0, gx1 - gx0 + 1, gy1 - gy0 + 3, C.s3);
    const gm = (gx0 + gx1) >> 1;
    vline(gm, gy0, gy1 + 3, C.s0);
    for (let y = gy0; y < gy0 + 4; y++) set(gm + 1, y, C.s1);
    for (const y of [gy0 + 11, gy0 + 22]) {
      hline(gx0 + 1, gm - 2, y, C.s1);
      hline(gm + 2, gx1 - 1, y, C.s1);
    }
    hline(gx0 + 2, gm - 2, gy0 + 2, C.s4);
    hline(gm + 2, gx1 - 2, gy0 + 3, C.s4);
    vline(gx0 + 1, gy0 + 4, gy1, C.s4);
  }
  // hair: a dark curtain down the back (Senju) or a huge spiky mane (Uchiha)
  const [hx0, hy0, hx1, hy1] = px(VALLEY_STATUE.head);
  const [bx0, by0, bx1, by1] = px(VALLEY_STATUE.hairBack);
  const fx = hx0 + 42; // where the face starts
  const strand = (x: number, y: number) => {
    const sheen = Math.abs(y - (hy0 + 14 + ((x * 3) >> 3) % 4)) < 3 || (y > by0 + 20 && y < by0 + 26);
    return x % 4 === 0 ? HAIR[0] : sheen && x % 4 === 2 ? HAIR[2] : HAIR[1];
  };
  for (let y = hy0; y <= hy1; y++) for (let x = hx0; x < fx; x++) set(x, y, strand(x, y));
  for (let x = fx; x <= hx1; x++) for (let y = hy0; y < hy0 + 9 + ((x - fx) >> 3); y++) set(x, y, strand(x, y));
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
    const cut = uchiha ? 0 : Math.floor(hash2(x >> 1, 3, 7) * 7);
    if (y <= by1 - cut) set(x, y, strand(x, y));
  }
  if (uchiha) {
    // the mane bristles out behind in big points and hangs in jagged tips over the belt
    for (let y = by0 - 12, k = 0; y < by1 - 6; y += 11 + Math.floor(hash2(k, 4, 5) * 8), k++) {
      // irregular locks sweeping down and back, longer toward the middle of the mane
      const len = 7 + Math.floor(hash2(k, 1, 5) * 8) + (k % 3 === 1 ? 5 : 0);
      const drop = 6 + Math.floor(hash2(k, 2, 5) * 12);
      const base = 10 + Math.floor(hash2(k, 3, 5) * 6);
      tri(bx0 - len, y + drop, bx0 + 2, y, bx0 + 2, y + base, HAIR[1], free);
      line(bx0 - len + 2, y + drop - 1, bx0, y + (base >> 1), HAIR[0], free);
      line(bx0 - len + 3, y + drop - 2, bx0 - 2, y + 2, HAIR[2], free);
    }
    for (let x = bx0, k = 0; x <= bx1 + 6; x += 7, k++) tri(x + 3, by1 + 8 + (k % 2) * 4, x, by1 - 2, x + 7, by1 - 2, HAIR[1], any);
    for (let k = 0; k < 3; k++) tri(hx0 - 10 - k * 2, hy0 + 2 + k * 12, hx0 + 2, hy0 + k * 12, hx0 + 2, hy0 + 10 + k * 12, HAIR[1], free);
  } else {
    // a long lock falling in front of the ear down onto the collar
    for (let y = hy0 + 8; y < hy1 + 10; y++) for (let x = fx; x < fx + 9; x++) set(x, y, strand(x, y));
  }
  // face in profile: ear, heavy brow, deep-set eye, nose and chin just proud of the cells, mouth, jaw
  {
    const top = hy0 + 9;
    for (let y = top; y <= hy1; y++) for (let x = fx + (uchiha ? 0 : 9); x <= hx1; x++) if (y >= hy0 + 9 + ((x - fx) >> 3)) set(x, y, x > hx1 - 3 ? C.s4 : C.s3);
    if (uchiha) rect(fx, top, 10, hy1 - top + 1, C.s3);
    // cheek / jaw shadow
    for (let y = hy0 + 31; y <= hy1; y++) for (let x = fx + 10; x < hx1 - 16 + ((y - hy0 - 31) >> 1); x++) set(x, y, C.s2);
    line(fx + 20, hy0 + 30, hx1 - 14, hy0 + 30, C.s1); // cheekbone
    rect(fx + 12, hy0 + 20, 8, 13, C.s2);
    vline(fx + 15, hy0 + 23, hy0 + 30, C.s1);
    hline(fx + 12, fx + 19, hy0 + 33, C.s1);
    const ey = hy0 + 22;
    rect(hx1 - 18, ey - 3, 13, 7, C.s1); // eye socket
    hline(hx1 - 17, hx1 - 6, ey, C.s0);
    rect(hx1 - 9, ey - 1, 2, 2, C.s0);
    line(hx1 - 22, ey - 7, hx1, ey - 3, C.s0);
    line(hx1 - 22, ey - 6, hx1, ey - 2, C.s0);
    line(hx1 - 22, ey - 5, hx1, ey - 1, C.s1);
    if (uchiha) line(hx1 - 16, ey + 5, hx1 - 8, ey + 6, C.s1); // the lines under his eyes
    for (let j = 0; j < 13; j++) for (let i = 1; i <= Math.min(5, 1 + (j >> 1)); i++) free(hx1 + i, ey - 2 + j, j === 12 ? C.s1 : C.s3); // nose
    free(hx1 + 1, ey + 10, C.s1);
    hline(hx1 - 9, hx1, hy0 + 39, C.s0);
    for (let y = hy0 + 42; y <= hy1 - 1; y++) for (let i = 1; i <= 2; i++) free(hx1 + i, y, C.s3); // chin
    line(hx1 - 4, hy1, fx + 18, hy0 + 36, C.s1);
    if (uchiha) {
      // long spiky fringe over the face, one eye hidden
      for (let k = 0; k < 4; k++) {
        const x = fx + 14 + k * 9;
        tri(x + 3 + (k >> 1), hy0 + 28 + (k % 2) * 6, x - 2, hy0 + 6, x + 9, hy0 + 6, HAIR[1]);
        line(x + 3, hy0 + 8, x + 3 + (k >> 1), hy0 + 24 + (k % 2) * 6, HAIR[0]);
      }
    }
  }
  // cracks and water stains (weathering)
  const cracks: [number, number][][] = [
    [[168, 150], [176, 164], [171, 178], [182, 192]],
    [[120, 296], [128, 304], [125, 314]],
    [[200, 215], [206, 226], [203, 236]],
    [[110, 250], [116, 262], [112, 274]],
  ];
  for (const c of cracks) for (let i = 1; i < c.length; i++) line(c[i - 1][0], c[i - 1][1], c[i][0], c[i][1], C.s0);
  for (const sx of [244, 250, 280]) for (let y = 162; y < 205; y += 2) set(sx, y, C.s1);
}

/** Corner rounding radius (px) per statue part: heads and fingertips round, armour blocks square-ish. */
const ROUND: Record<string, number> = { head: 12, fingers: 4, hand: 6, hairBack: 7, shoulders: 6, skirt: 4, pedestal: 2, legs: 3 };

/** Ledge art: slab + tapered rocky underside; the crest ledge is a fallen stone forearm, mid-falls a wet shelf. */
function paintLedge(pc: PixelCanvas, x0: number, x1: number, y: number, kind: 'outcrop' | 'forearm' | 'shelf'): void {
  const w = x1 - x0;
  if (kind === 'forearm') {
    for (let x = x0; x < x1; x++) {
      const t = (x - x0) / w;
      const broken = Math.floor(hash2(x >> 1, 2, 9) * 4);
      const h = 15 + Math.round(Math.sin(t * Math.PI) * 2);
      for (let j = 0; j < h; j++) {
        let c = j < 3 ? C.s3 : j < 9 ? C.s2 : C.s1;
        if ((x - x0) % 30 < 4) c = j < 3 ? C.s2 : C.s1; // bracer bands
        if ((x - x0 < 3 || x1 - x < 4) && j > broken + 3) c = C.s0; // broken ends
        pc.set(x, y + j, c);
      }
    }
    for (let x = x0 + 6; x < x1 - 6; x += 9) pc.set(x, y + 6, C.s4);
    return;
  }
  for (let x = x0; x < x1; x++) {
    const end = Math.min(x - x0, x1 - 1 - x);
    const under = Math.min(kind === 'shelf' ? 12 : 10, 5 + end * 2) - Math.floor(hash2(x >> 1, 5, 3) * 3);
    for (let j = 0; j < 6 + under; j++) {
      let c = j < 2 ? C.r3 : j < 6 ? C.r2 : j < 6 + under - 2 ? C.r1 : C.r0;
      if (kind === 'shelf') c = mix(c, C.w1, 0.3);
      pc.set(x, y + j, c);
    }
  }
}

function forEachRun(def: MapDef, kinds: Uint8Array, mw: number, fn: (tx0: number, tx1: number, ty: number) => void): void {
  for (let ty = 0; ty < def.rows.length; ty++) {
    let tx = 0;
    while (tx < mw) {
      if (kinds[ty * mw + tx] !== TK.PLAT_WOOD) {
        tx++;
        continue;
      }
      const s = tx;
      while (tx < mw && kinds[ty * mw + tx] === TK.PLAT_WOOD) tx++;
      fn(s, tx, ty);
    }
  }
}

/** The playable stone (statues, cliffs, canyon walls, rocks, ledges), outlined and lit; transparent elsewhere. */
function paintTerrain(def: MapDef): PixelCanvas {
  const map = parseMap(def);
  const mw = map.w;
  const pc = new PixelCanvas(map.w * TILE, map.h * TILE);
  const role = (tx: number, ty: number) => cellRole(def, map.tiles, mw, tx, ty);
  const { rockLow, rockHigh } = VALLEY_LAND;
  for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < mw; tx++) {
    if (role(tx, ty) !== 'rock') continue;
    const wet = inBox(rockLow, mirrorTx(tx), ty) || inBox(rockHigh, mirrorTx(tx), ty);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) pc.set(tx * TILE + x, ty * TILE + y, rockPixel(tx * TILE + x, ty * TILE + y, wet));
  }
  // statues: solid = a statue cell, with the outer corners rounded off (3 px)
  const partAt = (tx: number, ty: number): string | null => {
    if (tx < 0 || ty < 0) return null;
    for (const [k, b] of Object.entries(VALLEY_STATUE)) if (inBox(b, tx, ty)) return k;
    return null;
  };
  const statueCell = (tx: number, ty: number) => partAt(tx, ty) !== null;
  const solid = (lx: number, ly: number) => {
    const tx = lx >> 4;
    const ty = ly >> 4;
    const part = partAt(tx, ty);
    if (!part) return false;
    const r = ROUND[part] ?? 3;
    const x = lx & 15;
    const y = ly & 15;
    const below = (tty: number) => statueCell(tx, tty) || tty >= VALLEY_LAND.cliffTop;
    // a corner is rounded when both neighbours around it are open; the radius may span two cells of the same part
    const cut = (ex: boolean, ey: boolean, dx: number, dy: number) => !ex && !ey && dx < r && dy < r && (r - dx - 0.5) ** 2 + (r - dy - 0.5) ** 2 > r * r;
    const l = statueCell(tx - 1, ty);
    const rt = statueCell(tx + 1, ty);
    const u = statueCell(tx, ty - 1);
    const d = below(ty + 1);
    return !(cut(l, u, x, y) || cut(rt, u, 15 - x, y) || cut(l, d, x, 15 - y) || cut(rt, d, 15 - x, 15 - y));
  };
  paintStatue(pc, false, solid);
  paintStatue(pc, true, solid);
  forEachRun(def, map.tiles, mw, (tx0, tx1, ty) => {
    // the bridge and the shelf are the only ledges spanning the middle of the map
    const centre = tx0 < VALLEY_W / 2 && tx1 > VALLEY_W / 2;
    const kind = centre && ty === VALLEY_LAND.bridge[1] ? 'forearm' : centre && ty === VALLEY_LAND.shelf[1] ? 'shelf' : 'outcrop';
    paintLedge(pc, tx0 * TILE, tx1 * TILE, ty * TILE, kind);
  });
  // moss on every exposed top, with a few drips
  const opaque = (x: number, y: number) => x < 0 || y < 0 || x >= pc.w || y >= pc.h || pc.alphaAt(x, y) > 0;
  const tops: [number, number][] = [];
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) if (pc.alphaAt(x, y) && !opaque(x, y - 1)) tops.push([x, y]);
  for (const [x, y] of tops) {
    const t = 1 + Math.floor(hash2(x >> 2, y, 13) * 3);
    for (let j = 0; j < t; j++) if (pc.alphaAt(x, y + j)) pc.set(x, y + j, j === 0 ? C.m2 : C.m1);
    if (hash2(x, y, 29) < 0.07) {
      const len = 3 + Math.floor(hash2(x, y, 31) * 7);
      for (let j = t; j < t + len; j += 1 + (j & 1)) if (pc.alphaAt(x, y + j)) pc.set(x, y + j, C.m0);
    }
  }
  // key light from the upper left, cool shade lower right (whole tones only)
  const src = pc.px.slice();
  const at = (x: number, y: number) => x < 0 || y < 0 || x >= pc.w || y >= pc.h || (src[y * pc.w + x] >>> 24) > 0;
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    if (!(src[y * pc.w + x] >>> 24)) continue;
    if (!at(x - 1, y) || !at(x - 2, y)) pc.light(x, y, '#e6dcc0', 0.16);
    else if (!at(x + 1, y) || !at(x + 2, y) || !at(x + 3, y)) pc.light(x, y, '#141a2a', 0.22);
    else if (!at(x, y + 1) || !at(x, y + 2)) pc.light(x, y, '#141a2a', 0.18);
  }
  // 1 px ink outline on the inside of the silhouette, so the playable shape matches the collision exactly
  const marks: number[] = [];
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    if (!(src[y * pc.w + x] >>> 24)) continue;
    if (!at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1)) marks.push(y * pc.w + x);
  }
  for (const i of marks) pc.set(i % pc.w, Math.floor(i / pc.w), P.ink);
  return pc;
}

/** Everything behind the playable stone: forest rim, gorge back wall, the falls (first frame), the river. */
function paintBackdrop(pc: PixelCanvas): void {
  const H = pc.h;
  const haze = SKY.haze;
  // forest on the far rim, two rows of pines (hazier = farther)
  for (const [base, color, seed] of [[268, mix('#33494a', haze, 0.35), 3], [300, mix('#26393a', haze, 0.15), 8]] as const) {
    for (let x = 0; x < W; x += 5 + Math.floor(hash2(x, seed, 2) * 6)) {
      const h = 18 + Math.floor(hash2(x, seed, 5) * 22);
      for (let r = 0; r < h; r++) {
        const half = Math.floor((r / h) * (h / 3.4)) + (r % 5 < 2 ? 1 : 0);
        pc.rect(x - half, base - h + r, half * 2 + 1, 1, color);
      }
    }
    pc.rect(0, base, W, 340 - base, color);
  }
  // the gorge's back wall, hazy rock with strata, and the river running to the crest
  const x0 = RIVER.x0;
  const x1 = RIVER.x1;
  const wall: Record<string, string> = { [C.r0]: '#263336', [C.r1]: '#2e3d40', [C.r2]: '#344547', [C.r3]: '#3b4d4e', [C.r4]: '#435655' };
  for (let y = FALLS.crest - 4; y < H; y++) for (let x = x0; x < x1; x++) pc.set(x, y, wall[rockPixel(x, y + 40, false, 7, 0.8)] ?? '#2e3d40');
  for (let x = x0; x < x1; x++) {
    const rim = FALLS.crest - 4 - Math.floor(hash2(x >> 3, 1, 4) * 4);
    pc.rect(x, rim, 1, 2, mix(C.m1, haze, 0.25));
  }
  for (let y = FALLS.crest - 10; y < FALLS.crest; y++) for (let x = FALLS.x0 - 14; x < FALLS.x1 + 14; x++) {
    pc.set(x, y, (x + y * 3) % 23 < 3 ? C.w2 : C.w1);
  }
  // the falls (static first frame; ValleyFx scrolls the same textures on top) and its lip over the crest
  const fw = FALLS.x1 - FALLS.x0;
  for (let y = FALLS.crest; y < RIVER.y; y++) for (let x = 0; x < fw; x++) {
    const c = fallsPixel(x, (y - FALLS.crest) % 128, fw, false);
    if (c) pc.set(FALLS.x0 + x, y, c);
    const s = fallsPixel(x, (y - FALLS.crest) % 128, fw, true);
    if (s && c) pc.set(FALLS.x0 + x, y, mix(c, s, 0.6));
  }
  for (let x = FALLS.x0 + 2; x < FALLS.x1 - 2; x++) {
    pc.set(x, FALLS.crest, C.foam);
    pc.set(x, FALLS.crest + 1, x % 3 ? C.w3 : C.foam);
    if (x % 2) pc.set(x, FALLS.crest + 2, C.w3);
  }
  // spray at the foot
  for (let y = RIVER.y - 22; y < RIVER.y; y++) for (let x = FALLS.x0 - 10; x < FALLS.x1 + 10; x++) {
    const t = (y - (RIVER.y - 22)) / 22;
    if (hash2(x >> 1, y >> 1, 77) < t * 0.8) pc.set(x, y, t > 0.6 ? C.foam : C.w3);
  }
  // the river (static); ValleyFx draws the moving surface in front of the fighters
  for (let y = RIVER.y; y < H; y++) for (let x = x0; x < x1; x++) {
    const d = (y - RIVER.y) / (H - RIVER.y);
    let c = d * 2 > bayer(x, y) + 0.4 ? C.w0 : C.w1;
    if (y < RIVER.y + 2) c = C.w2;
    if (x > FALLS.x0 && x < FALLS.x1 && (x * 7 + y * 3) % 19 < 2) c = C.w2; // the falls' reflection
    pc.set(x, y, c);
  }
}

/** World-sized valley scenery: backdrop + playable stone. Also bakes 'valley-terrain-<id>' (stone only). */
export function bakeValleyScenery(scene: Phaser.Scene, def: MapDef): string {
  const key = 'arena-scenery-' + def.id;
  const terrainKey = valleyTerrainKey(def);
  if (scene.textures.exists(key) && scene.textures.exists(terrainKey)) return key;
  const terrain = paintTerrain(def);
  const pc = new PixelCanvas(terrain.w, terrain.h);
  paintBackdrop(pc);
  for (let i = 0; i < pc.px.length; i++) if (terrain.px[i] >>> 24) pc.px[i] = terrain.px[i];
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, pc.flush());
  if (!scene.textures.exists(terrainKey)) scene.textures.addCanvas(terrainKey, terrain.flush());
  return key;
}

export const valleyTerrainKey = (def: MapDef) => 'valley-terrain-' + def.id;

export const VALLEY_COLORS = C;
