import type Phaser from 'phaser';
import { hash2, packColor, PixelCanvas } from './canvas';
import { mix, shade } from './palette';
import {
  BG_H as H,
  BG_W as W,
  blendDot,
  box,
  canopy,
  cityLayout,
  cloud,
  type CityStyle,
  type CloudStyle,
  disc,
  dot,
  ellipse,
  flag,
  glitter,
  glow,
  halo,
  hazeBand,
  lineW,
  moon,
  paintCity,
  paintCityLights,
  ridge,
  skyGrad,
  stars,
  streak,
  tint,
  tintRamp,
  treeLine,
  twinkleStars,
  water,
} from './bgKit';
import { paintValleyBackground } from './valleyArt';

// Procedural parallax backgrounds per map theme, rendered by render/Parallax.ts (match backdrop + title screen).
// Each theme is a stack of 640x360 horizontally tileable layers, back to front:
//   far    sky, sun / moon, the most distant silhouettes (heavily hazed toward the sky colour)
//   clouds optional drifting layer (clouds, smoke, mist, nebula) with its own auto drift
//   mid    mid-distance silhouettes, a step darker and crisper
//   near   darkest, least detailed framing silhouettes
//   fx     optional animated overlay frames riding one layer (blinking windows / beacons, water glitter,
//          twinkling stars, waving flags, falling petals...)
// The pixel language matches the tiles: flat tones, hard edges, light as stepped dithered bands (bgKit.ts).
// Backgrounds always stay lower contrast and darker than the playfield so fighters pop.
//
// Adding a theme: a BACKGROUNDS entry (sky colour + parallax factors + which optional layers exist) and a
// PAINTERS entry `(pc, layer, frame, frames) => void` that paints the requested layer (the `layered()` helper
// maps an object of per-layer functions onto that signature). Layers a def does not declare are never baked.

export type BgLayer = 'far' | 'clouds' | 'mid' | 'near' | 'fx';

export interface BackgroundDef {
  sky: string;
  /** far/near parallax factors (0 = fixed, 1 = moves with the world) */
  far: number;
  near: number;
  /** mid layer parallax factor (layer only baked when set) */
  mid?: number;
  /** drifting cloud / smoke / mist layer: parallax factor + auto drift in px/s */
  clouds?: { factor: number; drift: number };
  /** animated overlay: which layer it rides, frame count, seconds per frame */
  fx?: { on: 'far' | 'mid' | 'near'; frames: number; period: number };
  /** auto-scroll px/s (train) */
  scroll?: number;
  /** gentle vertical rocking amplitude in px (ship at sea) */
  bob?: number;
}

export const BACKGROUNDS: Record<string, BackgroundDef> = {
  arena: { sky: '#120e1e', far: 0.06, mid: 0.16, near: 0.3, fx: { on: 'mid', frames: 4, period: 0.5 } },
  rooftops: { sky: '#0d0920', far: 0.06, mid: 0.18, near: 0.35, clouds: { factor: 0.08, drift: 3 }, fx: { on: 'mid', frames: 4, period: 0.45 } },
  train: { sky: '#0a0c1e', far: 0.04, mid: 0.25, near: 0.6, scroll: 220, clouds: { factor: 0.07, drift: 2 }, fx: { on: 'far', frames: 4, period: 0.6 } },
  factory: { sky: '#1e0e0c', far: 0.06, mid: 0.18, near: 0.35, clouds: { factor: 0.1, drift: 5 }, fx: { on: 'mid', frames: 3, period: 0.16 } },
  construction: { sky: '#4a86c8', far: 0.06, mid: 0.18, near: 0.35, clouds: { factor: 0.09, drift: 7 }, fx: { on: 'mid', frames: 2, period: 0.7 } },
  casino: { sky: '#12061a', far: 0.08, mid: 0.18, near: 0.3, fx: { on: 'mid', frames: 3, period: 0.22 } },
  docks: { sky: '#2a1a48', far: 0.06, mid: 0.2, near: 0.4, clouds: { factor: 0.08, drift: 4 }, fx: { on: 'far', frames: 4, period: 0.35 } },
  office: { sky: '#3a78c0', far: 0.06, mid: 0.16, near: 0.3, clouds: { factor: 0.08, drift: 6 }, fx: { on: 'mid', frames: 2, period: 0.8 } },
  lab: { sky: '#061416', far: 0.08, mid: 0.18, near: 0.3, fx: { on: 'mid', frames: 4, period: 0.3 } },
  mine: { sky: '#0e0906', far: 0.08, mid: 0.2, near: 0.35, fx: { on: 'mid', frames: 3, period: 0.2 } },
  leaf: { sky: '#4a8ed8', far: 0.05, mid: 0.17, near: 0.35, clouds: { factor: 0.07, drift: 6 }, fx: { on: 'mid', frames: 3, period: 0.22 } },
  ship: { sky: '#3a7ccc', far: 0.05, mid: 0.14, near: 0.25, bob: 4, clouds: { factor: 0.07, drift: 9 }, fx: { on: 'far', frames: 4, period: 0.3 } },
  alien: { sky: '#120626', far: 0.05, mid: 0.17, near: 0.3, clouds: { factor: 0.07, drift: 3 }, fx: { on: 'far', frames: 4, period: 0.5 } },
  valley: { sky: '#28304f', far: .08, near: .25 },
  citadel: { sky: '#5a72a0', far: 0.05, mid: 0.13, near: 0.22, clouds: { factor: 0.08, drift: 7 }, fx: { on: 'mid', frames: 4, period: 0.4 } },
  neon: { sky: '#080a1e', far: 0.07, mid: 0.2, near: 0.35, clouds: { factor: 0.1, drift: 4 }, fx: { on: 'mid', frames: 4, period: 0.3 } },
  dojo: { sky: '#2a1a3a', far: 0.05, mid: 0.14, near: 0.28, clouds: { factor: 0.08, drift: 5 }, fx: { on: 'mid', frames: 4, period: 0.28 } },
  museum: { sky: '#060a1a', far: 0.05, mid: 0.15, near: 0.3, clouds: { factor: 0.07, drift: 4 }, fx: { on: 'mid', frames: 4, period: 0.5 } },
};

type Painter = (pc: PixelCanvas, layer: BgLayer, frame: number, frames: number) => void;

interface Layers {
  far?: (pc: PixelCanvas) => void;
  clouds?: (pc: PixelCanvas) => void;
  mid?: (pc: PixelCanvas) => void;
  near?: (pc: PixelCanvas) => void;
  fx?: (pc: PixelCanvas, frame: number, frames: number) => void;
}

const layered = (l: Layers): Painter => (pc, layer, frame, frames) => {
  if (layer === 'fx') l.fx?.(pc, frame, frames);
  else l[layer]?.(pc);
};

const wrap = (x: number) => ((x % W) + W) % W;

// ------------------------------------------------------------------ legacy helpers (valley painter)


// ------------------------------------------------------------------ shared scene pieces

const WHITE_CLOUD: CloudStyle = { light: '#f4f8fc', mid: '#dce8f2', dark: '#b8cadc' };

/** Puffy clouds scattered over a band of the sky. */
function cloudField(pc: PixelCanvas, n: number, y0: number, y1: number, st: CloudStyle, seed: number, minW = 40, maxW = 90): void {
  for (let i = 0; i < n; i++) {
    const x = Math.floor(((i + hash2(i, 0, seed) * 0.7) / n) * W);
    const y = y0 + Math.floor(hash2(i, 1, seed) * (y1 - y0));
    const w = minW + Math.floor(hash2(i, 2, seed) * (maxW - minW));
    cloud(pc, x, y, w * (0.7 + 0.5 * ((y - y0) / Math.max(1, y1 - y0))), st, seed * 13 + i);
  }
}

/** Lattice mast with a floodlight head (stadium / yard lights). */
function floodMast(pc: PixelCanvas, x: number, top: number, base: number, metal: string, lamp: string): void {
  box(pc, x, top, 1, base - top, metal);
  box(pc, x + 4, top, 1, base - top, metal);
  for (let y = top + 2; y < base; y += 6) {
    dot(pc, x + 1, y, metal);
    dot(pc, x + 2, y + 1, metal);
    dot(pc, x + 3, y + 2, metal);
  }
  box(pc, x - 6, top - 6, 17, 6, metal);
  for (let k = 0; k < 4; k++) box(pc, x - 5 + k * 4, top - 5, 3, 3, lamp);
}

function warehouses(pc: PixelCanvas, base: number, seed: number, body: string, rim: string, win: string, lit: string): void {
  let x = Math.floor(hash2(1, 1, seed) * 30);
  for (let i = 0; x < W; i++) {
    const w = 56 + Math.floor(hash2(i, 0, seed) * 70);
    const h = 26 + Math.floor(hash2(i, 1, seed) * 40);
    box(pc, x, base - h, w, h, body);
    // sawtooth north-light roof
    for (let k = 0; k + 12 <= w; k += 12) for (let r = 0; r < 7; r++) box(pc, x + k, base - h - r, Math.max(1, 12 - Math.floor(r * 1.7)), 1, r === 6 ? rim : body);
    box(pc, x, base - h, w, 1, rim);
    for (let k = 5; k < w - 6; k += 8) box(pc, x + k, base - h + 7, 5, 3, hash2(k, i, seed) < 0.45 ? lit : win);
    if (hash2(i, 4, seed) < 0.5) box(pc, x + w - 14, base - h - 26, 6, 20, body); // chimney
    x += w + 10 + Math.floor(hash2(i, 2, seed) * 26);
  }
}

/** Searchlight beam: a dithered translucent wedge from a ground point. */
function beam(pc: PixelCanvas, x0: number, y0: number, angle: number, len: number, hex: string, alpha: number): void {
  for (let s = 0; s < len; s++) {
    const half = 1 + s * 0.09;
    const cx = x0 + Math.sin(angle) * s;
    const cy = y0 - Math.cos(angle) * s;
    for (let k = -half; k <= half; k++) {
      const x = Math.round(cx + k);
      const y = Math.round(cy);
      if (((x + y) & 1) === 0 || s < 40) blendDot(pc, x, y, hex, (alpha / 255) * (1 - s / len));
    }
  }
}

/** Gantry / tower crane in silhouette. */
function towerCrane(pc: PixelCanvas, x: number, top: number, base: number, jibL: number, jibR: number, hex: string): void {
  box(pc, x, top, 2, base - top, hex);
  box(pc, x + 6, top, 2, base - top, hex);
  for (let y = top; y < base; y += 8) {
    for (let k = 0; k < 6; k++) dot(pc, x + 2 + k, y + k, hex);
    box(pc, x, y, 8, 1, hex);
  }
  box(pc, x - jibL, top - 2, jibL + jibR + 8, 3, hex);
  for (let k = 0; k < jibL + jibR; k += 6) dot(pc, x - jibL + k + 3, top - 3, hex);
  box(pc, x + 2, top - 12, 4, 10, hex); // cab tower
  box(pc, x - jibL + 2, top + 1, 9, 7, hex); // counterweight
  pc.line(wrap(x + 4), top - 12, wrap(x + jibR), top - 2, hex);
  box(pc, x + jibR - 6, top + 1, 1, 26, hex); // hook cable
  box(pc, x + jibR - 8, top + 27, 5, 3, hex);
}

/** Unfinished concrete frame building. */
function frameBuilding(pc: PixelCanvas, x: number, w: number, h: number, base: number, hex: string, slab: string): void {
  for (let k = 0; k <= w; k += 14) box(pc, x + k, base - h, 2, h, hex);
  for (let y = base - h; y < base; y += 13) box(pc, x - 1, y, w + 4, 2, slab);
}

/** Palm tree silhouette (casino strip, islands). */
function palm(pc: PixelCanvas, x: number, base: number, h: number, hex: string): void {
  for (let y = 0; y < h; y++) box(pc, x + Math.round(Math.sin((y / h) * 1.3) * 5), base - y, 3, 1, hex);
  const tx = x + Math.round(Math.sin(1.3) * 5) + 1;
  const ty = base - h;
  for (const [dx, dy] of [[-16, 6], [16, 7], [-11, -6], [12, -5], [-20, 12], [20, 13]]) {
    for (let s = 0; s <= 10; s++) {
      const t = s / 10;
      box(pc, tx + dx * t, ty + dy * t + Math.sin(t * Math.PI) * -3 + t * t * 4, 2, 2, hex);
    }
  }
}

/** Floating island with a rounded rocky underside and a grassy cap. */
function island(pc: PixelCanvas, x: number, y: number, w: number, rock: string, rockDark: string, grass: string, seed: number): void {
  for (let r = 0; r < w * 0.6; r++) {
    const t = r / (w * 0.6);
    const half = (w / 2) * Math.pow(1 - t, 0.9) * (0.9 + hash2(r >> 2, 1, seed) * 0.2);
    box(pc, x - half, y + r, half * 2, 1, rock);
    box(pc, x + half * 0.2 - r * 0.15, y + r, half * 0.8 + r * 0.15, 1, rockDark);
    if (r % 6 === 3) box(pc, x - half * 0.7, y + r, half * 0.5, 1, rockDark); // a stratum line on the lit face
  }
  box(pc, x - w / 2 - 1, y - 2, w + 2, 3, grass);
  for (let k = 0; k < w; k += 3) if (hash2(k, 4, seed) < 0.5) dot(pc, x - w / 2 + k, y - 3, grass);
}

/** A little ruined temple: column row and a lintel. */
function colonnade(pc: PixelCanvas, x: number, base: number, n: number, h: number, stone: string, lit: string, broken: number): void {
  for (let k = 0; k < n; k++) {
    const ch = k === broken ? Math.floor(h * 0.5) : h;
    box(pc, x + k * 9, base - ch, 4, ch, stone);
    box(pc, x + k * 9, base - ch, 1, ch, lit);
  }
  box(pc, x - 3, base - h - 4, (n - 1) * 9 + 10, 4, stone);
  box(pc, x - 3, base - h - 4, (n - 1) * 9 + 10, 1, lit);
}

/** East-asian roof temple / pagoda silhouette. */
function pagoda(pc: PixelCanvas, x: number, base: number, tiers: number, hex: string, roof: string): void {
  let y = base;
  for (let t = 0; t < tiers; t++) {
    const w = 30 - t * 5;
    box(pc, x - w / 2 + 3, y - 9, w - 6, 9, hex);
    // curved eaves
    for (let r = 0; r < 4; r++) box(pc, x - w / 2 - 4 + r, y - 12 - r, w + 8 - r * 2, 1, roof);
    dot(pc, x - w / 2 - 5, y - 13, roof);
    dot(pc, x + w / 2 + 4, y - 13, roof);
    y -= 15;
  }
  box(pc, x, y - 8, 1, 8, hex);
}

function cherryTree(pc: PixelCanvas, x: number, base: number, h: number, trunk: string, tones: [string, string, string, string], seed: number): void {
  box(pc, x - 2, base - h * 0.6, 4, h * 0.6, trunk);
  lineW(pc, x, base - h * 0.5, x - h * 0.22, base - h * 0.78, trunk, 2);
  lineW(pc, x, base - h * 0.45, x + h * 0.24, base - h * 0.74, trunk, 2);
  canopy(pc, x, base - h * 0.78, h * 0.42, h * 0.24, tones, seed);
}

/** Neon sign block on a façade (vertical or horizontal), drawn lit. */
function neonSign(pc: PixelCanvas, x: number, y: number, w: number, h: number, hex: string, frameHex: string, seed: number): void {
  box(pc, x, y, w, h, frameHex);
  const vertical = h > w;
  const n = vertical ? Math.floor((h - 2) / 5) : Math.floor((w - 2) / 5);
  for (let k = 0; k < n; k++) {
    const gx = vertical ? x + 1 : x + 1 + k * 5;
    const gy = vertical ? y + 1 + k * 5 : y + 1;
    // a 3x3 glyph from a hash pattern (reads as lettering at this size)
    for (let b = 0; b < 9; b++) if (hash2(k * 9 + b, 2, seed) < 0.55) dot(pc, gx + (b % 3) + (vertical ? Math.floor((w - 5) / 2) : 0), gy + Math.floor(b / 3), hex);
  }
}

// ------------------------------------------------------------------ cities

const NIGHT_CITY_FAR: CityStyle = { body: '#2a1c46', side: '#241840', rim: '#3a2a5a', win: '#2e2048', lit: ['#5a4878', '#6a5070'], litRate: 0.12 };
const NIGHT_CITY_MID: CityStyle = { body: '#1a1030', side: '#140c26', rim: '#3a2a5a', win: '#21153a', lit: ['#f8c860', '#e8a048', '#86c8e0'], litRate: 0.2 };

// ------------------------------------------------------------------ themes

const PAINTERS: Record<string, Painter> = {
  // TEST ARENA: night industrial yard: hazy skyline, sawtooth warehouses and floodlight masts.
  arena: layered({
    far: (pc) => {
      skyGrad(pc, ['#0f0c1a', '#1d1630', '#33264a'], 0, 300, 6);
      box(pc, 0, 300, W, 60, '#33264a');
      stars(pc, 50, 160, 4, '#4a4266', '#8a84b0');
      paintCity(pc, cityLayout(11, 50, 130), H - 40, { body: '#2b2244', side: '#262040', rim: '#3a3058', win: '#2f2648', lit: ['#4e4470', '#5a4a68'], litRate: 0.1 });
      hazeBand(pc, 210, 330, '#6a5a98', 0.28, 4);
    },
    mid: (pc) => {
      warehouses(pc, H - 22, 7, '#181428', '#2c2644', '#1e1a30', '#a8844a');
      box(pc, 0, H - 22, W, 22, '#181428');
      for (const x of [70, 300, 520]) floodMast(pc, x, 130, H - 22, '#222034', '#d8d4bc');
      for (const x of [70, 300, 520]) glow(pc, x + 2, 132, 46, 26, '#c8c0a0', 0.22, 3);
    },
    near: (pc) => {
      // chain-link fence, stacked containers and a pipe run, almost black
      box(pc, 0, H - 26, W, 26, '#0c0a14');
      for (let x = 0; x < W; x += 32) box(pc, x, H - 52, 2, 26, '#0c0a14');
      for (let x = 0; x < W; x += 3) dot(pc, x, H - 52 + ((x / 3) % 2 ? 0 : 1), '#16131f');
      for (let y = H - 50; y < H - 26; y += 3) for (let x = (y % 2) * 1; x < W; x += 3) dot(pc, x, y, '#100e18');
      for (const x of [40, 300, 520]) {
        box(pc, x, H - 48, 54, 22, '#0e0c16');
        box(pc, x + 10, H - 64, 40, 16, '#0e0c16');
        box(pc, x, H - 48, 54, 1, '#221e30');
        box(pc, x + 10, H - 64, 40, 1, '#221e30');
      }
    },
    fx: (pc, f) => {
      // mast beacons blink; one floodlight lamp stutters
      if (f % 2 === 0) for (const x of [70, 300, 520]) {
        dot(pc, x + 2, 122, '#ff4a4a');
        dot(pc, x + 3, 122, '#ff4a4a');
      }
      if (f === 3) box(pc, 300 - 5 + 8, 125, 3, 3, '#5a5650');
    },
  }),

  // NEON ROOFTOPS: purple night, crescent moon, three depths of skyline, neon signs and water towers.
  rooftops: layered({
    far: (pc) => {
      skyGrad(pc, ['#0d0920', '#24133e', '#4a2252', '#6a2c5a'], 0, H, 6);
      stars(pc, 90, 170, 3, '#5a4a7a', '#c8c0e0');
      moon(pc, 506, 62, 13, '#f2e6c4', '#d8c8a0', '#a898d8', '#1c1034');
      paintCity(pc, cityLayout(21, 70, 190, 16, 40, 1), H, NIGHT_CITY_FAR);
      tintRamp(pc, '#4a2252', 0.15, 0.45);
      hazeBand(pc, 230, H, '#a04a88', 0.3, 4);
    },
    clouds: (pc) => {
      for (let i = 0; i < 7; i++) streak(pc, Math.floor(hash2(i, 0, 61) * W), 40 + Math.floor(hash2(i, 1, 61) * 110), 40 + Math.floor(hash2(i, 2, 61) * 70), '#2e1a48', '#3e2658');
    },
    mid: (pc) => {
      const t = cityLayout(22, 50, 150, 22, 50, 6);
      paintCity(pc, t, H, NIGHT_CITY_MID);
      for (let i = 0; i < 8; i++) {
        const x = Math.floor(hash2(i, 9, 5) * W);
        const y = H - 60 - Math.floor(hash2(i, 8, 5) * 70);
        const c = ['#e05aa6', '#4ad8c8', '#f0943a'][i % 3];
        if (i % 2) neonSign(pc, x, y, 7, 26, c, '#120a1e', i);
        else neonSign(pc, x, y, 26, 7, c, '#120a1e', i);
        glow(pc, x + 4, y + 6, 24, 18, c, 0.18, 3);
      }
    },
    near: (pc) => {
      const c = '#0a0714';
      box(pc, 0, H - 30, W, 30, c);
      for (let i = 0; i < 6; i++) {
        const x = i * 112 + Math.floor(hash2(i, 0, 77) * 40);
        const h = 18 + Math.floor(hash2(i, 1, 77) * 30);
        box(pc, x, H - 30 - h, 70, h, c);
        box(pc, x, H - 30 - h, 70, 1, '#2a1a40');
        if (i % 2) {
          // water tower
          box(pc, x + 20, H - 30 - h - 30, 18, 20, c);
          box(pc, x + 18, H - 30 - h - 33, 22, 3, c);
          box(pc, x + 21, H - 30 - h - 10, 1, 10, c);
          box(pc, x + 36, H - 30 - h - 10, 1, 10, c);
        } else {
          box(pc, x + 40, H - 30 - h - 18, 1, 18, c); // antenna
          box(pc, x + 37, H - 30 - h - 12, 7, 1, c);
          box(pc, x + 8, H - 30 - h - 7, 14, 7, c); // AC unit
        }
      }
    },
    fx: (pc, f, n) => {
      const t = cityLayout(22, 50, 150, 22, 50, 6);
      paintCityLights(pc, t, H, NIGHT_CITY_MID, f, n, '#ff4a5a');
      // one sign stutters off for a frame
      if (f === 2) {
        const x = Math.floor(hash2(3, 9, 5) * W);
        const y = H - 60 - Math.floor(hash2(3, 8, 5) * 70);
        box(pc, x, y, 7, 26, '#120a1e');
      }
    },
  }),

  // NIGHT TRAIN: moonlit valley racing past: snowy ranges, drifting night clouds, pine hills, telegraph poles.
  train: layered({
    far: (pc) => {
      skyGrad(pc, ['#0a0c1e', '#161a38', '#2a2f58'], 0, 260, 6);
      box(pc, 0, 260, W, 100, '#2a2f58');
      stars(pc, 120, 190, 7, '#3a4068', '#9aa4d0');
      moon(pc, 150, 66, 15, '#eceae0', '#c8c8c0', '#8a9ad8');
      ridge(pc, { base: 285, amp: 130, color: '#2e3660', seed: 3, scale: 220, rough: 0.7, lit: '#3e4878', dark: '#283058', snow: { color: '#7684b0', depth: 22 } });
      ridge(pc, { base: 300, amp: 70, color: '#1e2448', seed: 9, scale: 140, rough: 0.6, lit: '#283060' });
      hazeBand(pc, 230, 310, '#4a5488', 0.25, 4);
    },
    clouds: (pc) => cloudField(pc, 6, 40, 150, { light: '#4a5482', mid: '#343c66', dark: '#2a3058' }, 17, 50, 110),
    mid: (pc) => {
      ridge(pc, { base: 335, amp: 45, color: '#121630', seed: 21, scale: 180, rough: 0.3, lit: '#181e3c' });
      treeLine(pc, 336, 30, '#0e1128', 5, 'pine', 0.8, '#141a36');
      for (const x of [120, 400]) {
        box(pc, x, 300, 22, 12, '#0e1128');
        for (let r = 0; r < 6; r++) box(pc, x - 3 + r, 294 + r, 28 - r * 2, 1, '#0e1128');
        box(pc, x + 5, 304, 3, 3, '#e8b860');
        glow(pc, x + 6, 305, 14, 9, '#e8b860', 0.25, 2);
      }
    },
    near: (pc) => {
      const c = '#05060e';
      box(pc, 0, 322, W, 38, c);
      for (let x = 0; x < W; x += 160) {
        box(pc, x, 238, 3, 90, c);
        box(pc, x - 8, 244, 19, 2, c);
        box(pc, x - 6, 252, 15, 2, c);
      }
      // sagging wires between the poles
      for (let x = 0; x < W; x++) {
        const t = (x % 160) / 160;
        const sag = Math.round(Math.sin(t * Math.PI) * 9);
        dot(pc, x, 245 + sag, c);
        dot(pc, x, 253 + sag, c);
      }
      for (let i = 0; i < 18; i++) {
        const x = Math.floor(hash2(i, 0, 9) * W);
        const r = 6 + Math.floor(hash2(i, 1, 9) * 10);
        ellipse(pc, x, 324, r * 1.4, r, c);
      }
    },
    fx: (pc, f, n) => twinkleStars(pc, 120, 190, 7, f, n, '#e8ecff'),
  }),

  // FACTORY: smog dusk over a refinery, drifting smoke, sawtooth halls with furnace windows, pipe runs.
  factory: layered({
    far: (pc) => {
      skyGrad(pc, ['#1e0e0c', '#4a2014', '#8a4420', '#b8642a'], 0, 300, 5);
      box(pc, 0, 300, W, 60, '#b8642a');
      halo(pc, 430, 236, 120, 90, '#f0a050', 0.32, 4);
      disc(pc, 430, 236, 20, '#f0b060');
      // distant refinery: cracking towers, tanks and flare stacks
      const c = '#6a3420';
      for (let i = 0; i < 9; i++) {
        const x = i * 72 + Math.floor(hash2(i, 0, 4) * 30);
        const h = 50 + Math.floor(hash2(i, 1, 4) * 90);
        box(pc, x, 300 - h, 8, h, c);
        box(pc, x - 2, 300 - h, 12, 3, c);
        for (let y = 300 - h + 8; y < 300; y += 14) box(pc, x - 3, y, 14, 2, c);
        ellipse(pc, x + 30, 300, 16, 12, c);
      }
      box(pc, 0, 296, W, 64, c);
      tintRamp(pc, '#b8642a', 0.1, 0.35);
      hazeBand(pc, 240, 320, '#e08a4a', 0.25, 4);
    },
    clouds: (pc) => {
      // smog banks and slanting plumes that thin out as they rise
      for (let i = 0; i < 8; i++) streak(pc, Math.floor(hash2(i, 0, 31) * W), 90 + Math.floor(hash2(i, 1, 31) * 120), 90 + Math.floor(hash2(i, 2, 31) * 120), '#5a3022', '#6a3a28');
      const st = { light: '#6a3e2c', mid: '#553022', dark: '#46281c' };
      for (let i = 0; i < 4; i++) {
        const x = i * 160 + Math.floor(hash2(i, 0, 33) * 60);
        for (let k = 0; k < 6; k++) cloud(pc, x + k * k * 4 + Math.floor(hash2(k, i, 34) * 6), 240 - k * 13, 12 + k * 7, st, i * 10 + k);
      }
    },
    mid: (pc) => {
      warehouses(pc, H - 30, 41, '#2a1410', '#4a2418', '#22100c', '#f08a3a');
      box(pc, 0, H - 30, W, 30, '#2a1410');
      for (const x of [150, 470]) {
        // hyperbolic cooling tower
        for (let y = 0; y < 90; y++) {
          const t = 1 - y / 90;
          const half = 22 + Math.round(Math.pow(t - 0.6, 2) * 40);
          box(pc, x - half, H - 30 - 90 + y, half * 2, 1, '#2a1410');
          box(pc, x - half, H - 30 - 90 + y, 3, 1, '#4a2418');
        }
      }
      for (const x of [60, 330, 580]) {
        box(pc, x, 150, 10, H - 180, '#2a1410');
        for (let y = 160; y < H - 30; y += 16) box(pc, x - 1, y, 12, 2, '#3a1c14');
        box(pc, x + 2, 150, 6, 2, '#c84a20');
      }
    },
    near: (pc) => {
      const c = '#140a08';
      box(pc, 0, H - 22, W, 22, c);
      for (const y of [H - 70, H - 48]) {
        box(pc, 0, y, W, 6, c);
        box(pc, 0, y, W, 1, '#3a1c10');
        for (let x = 20; x < W; x += 90) box(pc, x, y - 2, 6, 10, c);
      }
      for (const x of [30, 250, 470]) {
        ellipse(pc, x + 40, H - 22, 40, 36, c);
        box(pc, x + 4, H - 60, 72, 1, '#3a1c10');
      }
    },
    fx: (pc, f) => {
      // furnace windows breathe, flare stacks lick
      for (let i = 0; i < 40; i++) {
        const x = Math.floor(hash2(i, 0, 5) * W);
        const y = H - 70 - Math.floor(hash2(i, 1, 5) * 30);
        if ((i + f) % 3 === 0) box(pc, x, y, 5, 3, '#ffb060');
      }
      for (const x of [60, 330, 580]) {
        const hgt = 4 + ((f * 3 + x) % 5);
        for (let k = 0; k < hgt; k++) box(pc, x + 3 + ((k + f) % 3) - 1, 149 - k, Math.max(1, 4 - Math.floor(k / 2)), 1, k < 2 ? '#fff0a0' : '#f08030');
      }
    },
  }),

  // CONSTRUCTION SITE: bright day, hazy skyline, drifting cumulus, tower cranes and bare concrete frames.
  construction: layered({
    far: (pc) => {
      skyGrad(pc, ['#4a86c8', '#7ab0e0', '#bcdcf0'], 0, 300, 6);
      box(pc, 0, 300, W, 60, '#bcdcf0');
      halo(pc, 540, 50, 110, 90, '#fff8d8', 0.35, 4);
      disc(pc, 540, 50, 12, '#fffbe8');
      paintCity(pc, cityLayout(31, 60, 180, 18, 44, 4), H, { body: '#8eaccc', side: '#86a2c2', rim: '#a8c4dc', win: '#86a4c4', lit: ['#a4c0dc'], litRate: 0.3 });
      tint(pc, '#bcdcf0', 0.3, 0, H);
      hazeBand(pc, 240, H, '#e4eef6', 0.35, 4);
    },
    clouds: (pc) => cloudField(pc, 6, 30, 130, WHITE_CLOUD, 13),
    mid: (pc) => {
      const c = '#5a7088';
      frameBuilding(pc, 120, 84, 170, H, c, '#6a8098');
      frameBuilding(pc, 420, 70, 120, H, c, '#6a8098');
      towerCrane(pc, 90, 70, H, 50, 150, c);
      towerCrane(pc, 470, 110, H, 40, 120, c);
      tint(pc, '#9cc0e0', 0.15);
    },
    near: (pc) => {
      const c = '#3e4c5e';
      box(pc, 0, H - 18, W, 18, c);
      for (let x = 0; x < W; x += 48) {
        box(pc, x, H - 44, 2, 26, c);
        box(pc, x, H - 44, 48, 2, c);
        box(pc, x, H - 32, 48, 1, c);
      }
    },
    fx: (pc, f) => {
      if (f === 0) {
        dot(pc, 94, 56, '#ff4a3a');
        dot(pc, 474, 96, '#ff4a3a');
      }
    },
  }),

  // CASINO: the strip at night (seen through the lobby doors and on the title screen): searchlights, hotel
  // towers, marquee façades with chasing bulbs, palms.
  casino: layered({
    far: (pc) => {
      skyGrad(pc, ['#12061a', '#2a0a2a', '#4a1238', '#6a1a40'], 0, H, 5);
      stars(pc, 40, 120, 8, '#4a2a4a', '#a88aa0');
      for (const [x, a] of [[160, -0.35], [200, 0.2], [450, -0.15], [500, 0.4]] as const) beam(pc, x, 300, a, 300, '#f0c8e0', 46);
      paintCity(pc, cityLayout(51, 80, 210, 26, 50, 8), H, { body: '#3a1636', side: '#341230', rim: '#5a2a4a', win: '#3e1a38', lit: ['#a85a6a', '#c8885a'], litRate: 0.25 });
      tintRamp(pc, '#6a1a40', 0.1, 0.4);
      hazeBand(pc, 230, H, '#d0508a', 0.3, 4);
    },
    mid: (pc) => {
      const body = '#24091c';
      box(pc, 0, H - 40, W, 40, body);
      for (let i = 0; i < 4; i++) {
        const x = i * 160 + 14;
        const h = 80 + (i % 2) * 30;
        box(pc, x, H - 40 - h, 132, h, body);
        box(pc, x, H - 40 - h, 132, 1, '#4a1a3a');
        // marquee board with a bulb border
        box(pc, x + 16, H - 40 - h + 12, 100, 30, '#3a0e28');
        box(pc, x + 22, H - 40 - h + 20, 88, 14, ['#c83a6a', '#d8a040', '#3ab8c8', '#a85ac8'][i]);
        for (let k = 0; k < 100; k += 4) {
          dot(pc, x + 16 + k, H - 40 - h + 12, '#8a6a3a');
          dot(pc, x + 16 + k, H - 40 - h + 41, '#8a6a3a');
        }
        glow(pc, x + 66, H - 40 - h + 27, 70, 30, '#ffb070', 0.14, 3);
      }
    },
    near: (pc) => {
      for (let i = 0; i < 6; i++) palm(pc, i * 108 + Math.floor(hash2(i, 0, 3) * 30), H, 70 + Math.floor(hash2(i, 1, 3) * 30), '#12040e');
      box(pc, 0, H - 8, W, 8, '#12040e');
    },
    fx: (pc, f, n) => {
      for (let i = 0; i < 4; i++) {
        const x = i * 160 + 14;
        const h = 80 + (i % 2) * 30;
        for (let k = 0; k < 100; k += 4)
          if ((k / 4 + f) % n === 0) {
            dot(pc, x + 16 + k, H - 40 - h + 12, '#fff0a0');
            dot(pc, x + 116 - k, H - 40 - h + 41, '#fff0a0');
          }
      }
    },
  }),

  // HARBOR DOCKS: sunset over the sea, sun glitter, distant freighters and a lighthouse, gantry cranes.
  docks: layered({
    far: (pc) => {
      skyGrad(pc, ['#2a1a48', '#6a3468', '#d06a50', '#f8b060'], 0, 232, 6);
      halo(pc, 320, 220, 170, 110, '#ffd090', 0.4, 5);
      disc(pc, 320, 222, 24, '#ffe0a0');
      water(pc, 232, H, '#6a4a78', '#1e2a4a', '#8a6a90', 5);
      for (let y = 234; y < H; y += 3) {
        const span = 8 + (y - 232) * 0.45;
        for (let x = 320 - span; x < 320 + span; x += 5) if (hash2(x, y, 3) < 0.6) box(pc, x, y, 3, 1, '#f0b070');
      }
      // freighters and the lighthouse on its rock
      for (const sx of [90, 470]) {
        box(pc, sx, 222, 70, 9, '#2a1830');
        box(pc, sx + 46, 210, 16, 12, '#2a1830');
        box(pc, sx + 52, 202, 3, 8, '#2a1830');
      }
      ellipse(pc, 210, 232, 24, 10, '#2a1830', 232);
      box(pc, 206, 186, 8, 40, '#2a1830');
      box(pc, 204, 182, 12, 5, '#2a1830');
      box(pc, 206, 178, 8, 4, '#3a2440');
    },
    clouds: (pc) => {
      for (let i = 0; i < 9; i++) streak(pc, Math.floor(hash2(i, 0, 71) * W), 30 + Math.floor(hash2(i, 1, 71) * 150), 40 + Math.floor(hash2(i, 2, 71) * 90), i % 2 ? '#a8505a' : '#c8685a', '#f09a70');
    },
    mid: (pc) => {
      const c = '#24142c';
      for (const x of [60, 330]) {
        // ship-to-shore gantry crane: A-frame legs, a long boom
        box(pc, x, 120, 4, H - 120, c);
        box(pc, x + 50, 120, 4, H - 120, c);
        for (let y = 140; y < H; y += 30) pc.line(wrap(x + 4), y, wrap(x + 50), y + 26, c, 2);
        box(pc, x - 70, 116, 200, 5, c);
        for (let k = 0; k < 200; k += 8) pc.line(wrap(x - 70 + k), 116, wrap(x - 66 + k), 112, c);
        box(pc, x + 10, 98, 30, 18, c);
        pc.line(wrap(x + 25), 98, wrap(x + 128), 116, c);
        box(pc, x + 100, 121, 1, 50, c);
        box(pc, x + 94, 171, 14, 6, c);
      }
      const cols = ['#4a2028', '#203a4a', '#4a3a20', '#24402a'];
      for (let i = 0; i < 10; i++) {
        const x = i * 64 + Math.floor(hash2(i, 0, 2) * 20);
        const stack = 1 + Math.floor(hash2(i, 1, 2) * 3);
        for (let s = 0; s < stack; s++) {
          const col = mix(cols[(i + s) % cols.length], '#24142c', 0.35);
          box(pc, x, H - 30 - (s + 1) * 24, 56, 22, col);
          for (let rx = x + 3; rx < x + 54; rx += 4) box(pc, rx, H - 28 - (s + 1) * 24, 1, 18, shade(col, -0.25));
        }
      }
      box(pc, 0, H - 30, W, 30, c);
      tint(pc, '#b86a70', 0.22); // sunset haze keeps the cranes behind the piers
    },
    near: (pc) => {
      const c = '#140c1a';
      box(pc, 0, H - 14, W, 14, c);
      for (let x = 10; x < W; x += 80) {
        box(pc, x, H - 34, 8, 20, c);
        box(pc, x - 1, H - 34, 10, 2, '#2a1a30');
      }
      for (let x = 0; x < W; x++) dot(pc, x, H - 30 + Math.round(Math.sin(((x % 80) / 80) * Math.PI) * 6), c);
    },
    fx: (pc, f) => {
      glitter(pc, 234, H, '#ffe0a0', 7, f, 320, 70);
      if (f < 2) {
        box(pc, 205, 182, 10, 3, '#fff0b0');
        glow(pc, 210, 183, 30, 12, '#fff0b0', 0.3, 3);
      }
    },
  }),

  // OFFICE TOWER: high above a clear city, drifting cumulus, glass skyscrapers catching the sky.
  office: layered({
    far: (pc) => {
      skyGrad(pc, ['#3a78c0', '#6aa8e0', '#b0d4f0'], 0, H, 6);
      halo(pc, 120, 60, 110, 90, '#fff8d8', 0.3, 4);
      paintCity(pc, cityLayout(41, 80, 220, 18, 40, 3), H, { body: '#90b0d0', side: '#88a8c8', rim: '#a8c8e0', win: '#8aaacb', lit: ['#a8c8e4'], litRate: 0.35 });
      tint(pc, '#b0d4f0', 0.35);
      hazeBand(pc, 240, H, '#e0ecf6', 0.3, 4);
    },
    clouds: (pc) => cloudField(pc, 5, 30, 150, WHITE_CLOUD, 17),
    mid: (pc) => {
      for (const [x, w, h] of [[30, 70, 280], [190, 90, 230], [360, 60, 300], [480, 100, 250]] as const) {
        box(pc, x, H - h, w, h, '#4e6e94');
        box(pc, x + w - 12, H - h, 12, h, '#46628a');
        box(pc, x, H - h, w, 2, '#7a9ac0');
        for (let y = H - h + 6; y < H; y += 8) box(pc, x + 2, y, w - 14, 1, '#58789e');
        for (let k = 0; k < h; k += 3) box(pc, x + 4 + ((k * 2) % (w - 20)), H - h + k, 6, 1, '#7a9cc4'); // sky reflection
        box(pc, x + Math.floor(w / 2), H - h - 16, 1, 16, '#4e6e94');
      }
      tint(pc, '#9cc0e0', 0.2);
    },
    fx: (pc, f) => {
      if (f === 0) for (const [x, w, h] of [[30, 70, 280], [190, 90, 230], [360, 60, 300], [480, 100, 250]] as const) dot(pc, x + Math.floor(w / 2), H - h - 17, '#ff4a3a');
    },
  }),

  // SECRET LAB: an underground complex: structural bays, teal containment tubes, racks of blinking LEDs.
  lab: layered({
    far: (pc) => {
      skyGrad(pc, ['#040e10', '#08191c', '#0c2226'], 0, H, 4);
      for (let x = 0; x < W; x += 80) {
        box(pc, x, 0, 10, H, '#0a1e20');
        box(pc, x + 2, 0, 1, H, '#123034');
      }
      for (const y of [60, 180, 300]) {
        box(pc, 0, y, W, 6, '#0a1e20');
        box(pc, 0, y, W, 1, '#143236');
      }
      for (let i = 0; i < 8; i++) {
        const x = i * 80 + 30;
        box(pc, x, 70, 30, 100, '#0b2022');
        for (let y = 76; y < 160; y += 8) box(pc, x + 3, y, 24, 4, '#0e2a2c');
      }
      halo(pc, 320, 240, 260, 120, '#1a8a7a', 0.18, 4);
    },
    mid: (pc) => {
      for (let i = 0; i < 4; i++) {
        const x = i * 160 + 40;
        // containment tube with fluid and caps
        box(pc, x, 150, 34, 170, '#0a2a2a');
        box(pc, x + 3, 170, 28, 140, '#167060');
        box(pc, x + 5, 170, 3, 140, '#2a9a84');
        box(pc, x - 3, 140, 40, 12, '#16302e');
        box(pc, x - 3, 316, 40, 14, '#16302e');
        box(pc, x - 3, 140, 40, 1, '#2a4a46');
        glow(pc, x + 17, 240, 50, 90, '#2ad8b8', 0.12, 3);
        // rack beside it
        box(pc, x + 70, 200, 40, 130, '#0c1e20');
        for (let y = 206; y < 326; y += 10) box(pc, x + 73, y, 34, 7, '#102628');
      }
      box(pc, 0, 330, W, 30, '#0a1a1c');
      box(pc, 0, 330, W, 1, '#1e3a3a');
    },
    fx: (pc, f) => {
      for (let i = 0; i < 4; i++) {
        const x = i * 160 + 40;
        for (let b = 0; b < 6; b++) {
          const y = 300 - ((f * 12 + b * 23 + i * 7) % 128);
          dot(pc, x + 10 + ((b * 7) % 16), y, '#9af0d8');
        }
        for (let y = 208; y < 326; y += 10) for (let k = 0; k < 4; k++) if (hash2(k + f * 5, y, i) < 0.3) dot(pc, x + 76 + k * 7, y + 2, k % 2 ? '#4af08a' : '#f0c040');
      }
    },
  }),

  // ABANDONED MINE: cave depths, stalactites, timbered side tunnels with lantern light, glinting crystals.
  mine: layered({
    far: (pc) => {
      box(pc, 0, 0, W, H, '#0e0906');
      // bulging cave wall: overlapping boulders, each with a dim lit rim up-left
      for (let i = 0; i < 46; i++) {
        const x = Math.floor(hash2(i, 0, 12) * W);
        const y = Math.floor(hash2(i, 1, 12) * H);
        const r = 16 + Math.floor(hash2(i, 2, 12) * 34);
        const tone = ['#130c08', '#160e09', '#110b07'][i % 3];
        ellipse(pc, x - 2, y - 2, r, r * 0.7, '#1c130c');
        ellipse(pc, x, y, r, r * 0.7, tone);
      }
      for (let i = 0; i < 160; i++) dot(pc, Math.floor(hash2(i, 5, 12) * W), Math.floor(hash2(i, 6, 12) * H), '#22180f');
      // distant tunnel mouths with warm lantern glow
      for (const x of [120, 400]) {
        ellipse(pc, x, 250, 40, 50, '#050302', 300);
        glow(pc, x, 280, 40, 26, '#d89048', 0.2, 3);
        dot(pc, x, 282, '#f8c060');
      }
      for (let i = 0; i < 40; i++) {
        const x = Math.floor(hash2(i, 0, 13) * W);
        const h = 10 + Math.floor(hash2(i, 1, 13) * 40);
        for (let k = 0; k < h; k++) box(pc, x - Math.floor((h - k) / 8), k, Math.max(1, Math.floor((h - k) / 4)), 1, '#1a120c');
      }
    },
    mid: (pc) => {
      const c = '#140d08';
      for (let i = 0; i < 4; i++) {
        const x = i * 160 + Math.floor(hash2(i, 0, 21) * 40);
        // rock pillar
        for (let y = 0; y < H; y++) {
          const half = 18 + Math.round(Math.sin(y * 0.05 + i) * 6) + (y < 40 || y > H - 50 ? 10 : 0);
          box(pc, x - half, y, half * 2, 1, c);
          box(pc, x - half, y, 2, 1, '#22170e');
        }
        // timber frame
        box(pc, x + 40, 200, 6, H - 200, '#2a1a0e');
        box(pc, x + 100, 200, 6, H - 200, '#2a1a0e');
        box(pc, x + 36, 196, 74, 6, '#2a1a0e');
        dot(pc, x + 72, 210, '#f8c060');
        glow(pc, x + 72, 214, 30, 22, '#e8a050', 0.2, 3);
        // crystal cluster
        for (let k = 0; k < 4; k++) pc.line(wrap(x - 10 + k * 5), 300 - k * 3, wrap(x - 8 + k * 5), 286 - k * 4, '#2a8a84', 2);
      }
      box(pc, 0, H - 24, W, 24, c);
      for (let x = 0; x < W; x += 12) box(pc, x, H - 26, 8, 2, '#3a2a1a'); // rail sleepers
    },
    near: (pc) => {
      const c = '#080504';
      for (let i = 0; i < 10; i++) {
        const x = Math.floor(hash2(i, 0, 41) * W);
        const h = 20 + Math.floor(hash2(i, 1, 41) * 50);
        for (let k = 0; k < h; k++) box(pc, x - Math.floor(k / 4), H - k, Math.max(1, Math.floor(k / 2)), 1, c);
      }
      box(pc, 0, H - 10, W, 10, c);
    },
    fx: (pc, f) => {
      for (let i = 0; i < 4; i++) {
        const x = i * 160 + Math.floor(hash2(i, 0, 21) * 40);
        const k = (f + i) % 4;
        dot(pc, x - 8 + k * 5, 285 - k * 4, '#c8fff0');
        if (f === 1) dot(pc, x + 72, 209, '#fff0a0');
      }
    },
  }),

  // HIDDEN LEAF FOREST: sunny sky, two hazy ranges, forested hills, the village with waving banners.
  leaf: layered({
    far: (pc) => {
      skyGrad(pc, ['#4a8ed8', '#7ab8ec', '#c4e4f8'], 0, 270, 6);
      box(pc, 0, 270, W, 90, '#c4e4f8');
      halo(pc, 470, 64, 120, 100, '#fff6d0', 0.35, 4);
      disc(pc, 470, 64, 11, '#fffbe8');
      ridge(pc, { base: 270, amp: 120, color: '#93b4cc', seed: 2, scale: 200, rough: 0.6, lit: '#a6c4d8', snow: { color: '#d8e8f2', depth: 16 } });
      tintRamp(pc, '#c4e4f8', 0.05, 0.35);
      ridge(pc, { base: 285, amp: 85, color: '#7e9aa8', seed: 12, scale: 150, rough: 0.8, lit: '#90aab6', dark: '#72909e' });
      tint(pc, '#c4e4f8', 0.3, 150, 290);
      ridge(pc, { base: 300, amp: 50, color: '#6a9a7a', seed: 7, scale: 150, rough: 0.4, lit: '#7aaa86' });
      treeLine(pc, 300, 22, '#5a8a6a', 3, 'round', 1, '#6a9a76');
      hazeBand(pc, 240, 310, '#e0f0f4', 0.3, 4);
    },
    clouds: (pc) => cloudField(pc, 6, 24, 120, WHITE_CLOUD, 23),
    mid: (pc) => {
      // village: houses with tile roofs, the round red tower, poles for the banners
      const roofs = ['#c85a32', '#3a8a8a', '#b8483a', '#d0783a'];
      for (let i = 0; i < 12; i++) {
        const x = i * 54 + Math.floor(hash2(i, 0, 4) * 20);
        const w = 30 + Math.floor(hash2(i, 1, 4) * 16);
        const h = 16 + Math.floor(hash2(i, 2, 4) * 18);
        const by = 318;
        box(pc, x, by - h, w, h + 10, '#d8c8a8');
        box(pc, x + w - 6, by - h, 6, h + 10, '#c0ae8c');
        const rc = roofs[i % roofs.length];
        for (let r = 0; r < 6; r++) box(pc, x - 3 + r, by - h - 6 + r, w + 6 - r * 2, 1, r % 2 ? shade(rc, -0.12) : rc);
        for (let k = 4; k < w - 8; k += 7) box(pc, x + k, by - h + 5, 3, 4, '#5a4434');
      }
      ellipse(pc, 330, 260, 30, 20, '#c84a3a', 262);
      box(pc, 302, 260, 56, 60, '#d8bfa0');
      box(pc, 302, 260, 56, 3, '#a83a2a');
      for (let k = 308; k < 352; k += 9) box(pc, k, 272, 4, 6, '#6a4a3a');
      for (const x of [80, 250, 420, 560]) box(pc, x, 250, 1, 40, '#6a5040');
      box(pc, 0, 318, W, 42, '#5a7a4a');
      tint(pc, '#b4d4e4', 0.22);
    },
    near: (pc) => {
      // a hedge line along the bottom (the giant trees are part of the arena itself)
      for (let x = 0; x < W; x += 14) ellipse(pc, x, H - 4, 12, 10 + (x % 3) * 2, '#1a3a1c');
    },
    fx: (pc, f) => {
      for (const [i, x] of [80, 250, 420, 560].entries()) flag(pc, x + 1, 251, 12, 6, ['#c8483a', '#e0a040', '#3a8a6a', '#c8483a'][i], '#f0e0c0', f);
    },
  }),

  // GRAND LINE SHIP: open sea under a high sun, islands on the horizon, glitter, drifting cumulus, swell.
  ship: layered({
    far: (pc) => {
      skyGrad(pc, ['#3a7ccc', '#6eaee4', '#b4dcf2'], 0, 240, 6);
      halo(pc, 470, 60, 120, 100, '#fff6d0', 0.35, 4);
      disc(pc, 470, 60, 12, '#fffbe8');
      for (const [x, w] of [[70, 100], [360, 60], [520, 130]] as const) {
        for (let r = 0; r < 16; r++) box(pc, x + r * 2 + Math.floor(hash2(r, x) * 3), 240 - 16 + r, w - r * 4, 1, '#7aa69a');
        canopy(pc, x + w / 2, 222, w * 0.28, 7, ['#5a8a7a', '#6a9a84', '#7aa88e', '#8ab49a'], x);
      }
      skyGrad(pc, ['#3a7ab8', '#163e78'], 240, H, 4);
      for (let y = 243; y < H; y += 5) for (let k = 0; k < 6 + (y - 240) / 10; k++) box(pc, Math.floor(hash2(k, y, 3) * W), y, 3 + Math.floor(((y - 240) / 120) * 8), 1, '#4a8ac4');
    },
    clouds: (pc) => cloudField(pc, 6, 30, 140, WHITE_CLOUD, 41),
    mid: (pc) => {
      // a distant schooner and long swells rolling in
      const c = '#2a5a8a';
      box(pc, 180, 246, 44, 5, c);
      box(pc, 184, 251, 36, 2, c);
      for (const [mx, mh] of [[194, 40], [210, 32]] as const) {
        box(pc, mx, 246 - mh, 1, mh, c);
        for (let k = 0; k < mh - 6; k++) box(pc, mx + 1, 246 - mh + 3 + k, Math.floor(k * 0.4) + 1, 1, '#d4e4ee');
      }
      for (let y = 280; y < H; y += 18)
        for (let x = 0; x < W; x++) {
          const off = Math.round(Math.sin((x + y * 3) * 0.05) * 2);
          dot(pc, x, y + off, '#2a64a0');
          if (Math.sin((x + y * 3) * 0.05) > 0.8) dot(pc, x, y + off - 1, '#6aa4d4');
        }
    },
    near: (pc) => {
      for (let i = 0; i < 14; i++) {
        const x = Math.floor(hash2(i, 0, 51) * W);
        const y = 300 + Math.floor(hash2(i, 1, 51) * 50);
        box(pc, x, y, 14, 2, '#c8e0f0');
        box(pc, x + 3, y - 1, 7, 1, '#eef6fc');
      }
    },
    fx: (pc, f) => glitter(pc, 242, H, '#e8f4ff', 9, f),
  }),

  // ALIEN ENERGY PLANET: violet sky, a ringed giant and two moons, mesas, nebula drift, glowing flora.
  alien: layered({
    far: (pc) => {
      skyGrad(pc, ['#120626', '#2a0e4a', '#4a1e6a', '#7a3a7a'], 0, H, 5);
      stars(pc, 130, 220, 61, '#5a4a8a', '#d0c8ff');
      halo(pc, 150, 90, 110, 100, '#e08a6a', 0.22, 4);
      disc(pc, 150, 90, 32, '#d8784a');
      for (let y = -32; y < 32; y += 6) box(pc, 150 - Math.sqrt(32 * 32 - y * y), 90 + y, Math.sqrt(32 * 32 - y * y) * 2, 2, '#c4643c');
      disc(pc, 140, 80, 7, '#b85a38');
      for (let a = 0; a < Math.PI * 2; a += 0.004) {
        const x = 150 + Math.cos(a) * 58;
        const y = 90 + Math.sin(a) * 12;
        if (Math.sin(a) < 0 && Math.hypot(x - 150, y - 90) < 32) continue; // ring behind the planet
        dot(pc, x, y, '#e8b890');
        dot(pc, x, y + 1, '#a8705a');
      }
      moon(pc, 500, 50, 9, '#8af0e0', '#5ac8c0', '#5ad8c8', '#2a0e4a');
      disc(pc, 560, 110, 4, '#c8a0f0');
      // mesas and spires
      for (let i = 0; i < 7; i++) {
        const x = i * 92 + Math.floor(hash2(i, 0, 7) * 30);
        const h = 40 + Math.floor(hash2(i, 1, 7) * 80);
        const w = 20 + Math.floor(hash2(i, 2, 7) * 40);
        for (let r = 0; r < h; r++) {
          const grow = Math.floor(Math.pow(r / h, 2.2) * 18);
          box(pc, x - grow, 300 - h + r, w + grow * 2, 1, '#4a2262');
          box(pc, x + w + grow - 6 - Math.floor(grow / 2), 300 - h + r, 6 + Math.floor(grow / 2), 1, '#40205a');
        }
        box(pc, x - 2, 300 - h, w + 4, 3, '#56287a');
      }
      ridge(pc, { base: 320, amp: 40, color: '#3a1a52', seed: 3, scale: 120, lit: '#462064' });
      tintRamp(pc, '#7a3a7a', 0.05, 0.35);
      hazeBand(pc, 240, 330, '#b060a0', 0.25, 4);
    },
    clouds: (pc) => {
      for (let i = 0; i < 8; i++) streak(pc, Math.floor(hash2(i, 0, 91) * W), 120 + Math.floor(hash2(i, 1, 91) * 100), 60 + Math.floor(hash2(i, 2, 91) * 80), '#5a2a7a', '#7a4a9a');
    },
    mid: (pc) => {
      for (let i = 0; i < 4; i++) {
        const x = 70 + i * 160;
        const y = 150 + Math.floor(hash2(i, 2, 7) * 60);
        island(pc, x, y, 46, '#3e1a4c', '#2e1238', '#4a8a8a', i);
        for (let k = 0; k < 3; k++) {
          const cx = x - 12 + k * 10;
          box(pc, cx, y - 9, 3, 7, '#3ad8c8');
          dot(pc, cx + 1, y - 10, '#c8fff8');
        }
        glow(pc, x, y - 6, 26, 12, '#3ad8c8', 0.18, 3);
      }
      ridge(pc, { base: 345, amp: 40, color: '#2a1036', seed: 5, scale: 90, lit: '#34143e' });
    },
    near: (pc) => {
      for (let i = 0; i < 26; i++) {
        const x = Math.floor(hash2(i, 0, 71) * W);
        const h = 12 + Math.floor(hash2(i, 1, 71) * 30);
        for (let k = 0; k < h; k++) dot(pc, x + Math.round(Math.sin(k * 0.15 + i) * 2), H - 16 - k, '#1a0a24');
        disc(pc, x + Math.round(Math.sin(h * 0.15 + i) * 2), H - 18 - h, 3, i % 3 ? '#2aa8a0' : '#9ac880');
      }
      box(pc, 0, H - 16, W, 16, '#1a0a24');
    },
    fx: (pc, f, n) => twinkleStars(pc, 130, 220, 61, f, n, '#ffffff'),
  }),

  // Valley of the End: its own painter (art/valleyArt.ts) for the far and near layers
  valley: (pc, layer) => {
    if (layer === 'far' || layer === 'near') paintValleyBackground(pc, layer);
    // the far layer is the backdrop and must have no holes: the valley painter writes its clouds and glow with alpha,
    // so blend those pixels onto the sky colour
    if (layer === 'far') {
      const sky = packColor(BACKGROUNDS.valley.sky);
      for (let i = 0; i < pc.px.length; i++) {
        const v = pc.px[i], a = v >>> 24;
        if (a === 255) continue;
        const k = a / 255;
        const ch = (sh: number) => Math.round(((v >>> sh) & 255) * k + ((sky >>> sh) & 255) * (1 - k));
        pc.px[i] = ((255 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)) >>> 0;
      }
    }
  },

  // SKY CITADEL: above a sea of clouds, floating islands with ruined colonnades, motes drifting.
  citadel: layered({
    far: (pc) => {
      skyGrad(pc, ['#5a72a0', '#8aaccc', '#cfe0e4'], 0, H, 6);
      halo(pc, 470, 66, 130, 110, '#f4e4c0', 0.35, 4);
      disc(pc, 470, 66, 18, '#f8ecd0');
      for (let i = 0; i < 6; i++) {
        const x = 40 + i * 110 + Math.floor(hash2(i, 0, 70) * 30);
        const y = 160 + Math.floor(hash2(i, 1, 70) * 60);
        island(pc, x, y, 34, '#94a8bc', '#86a0b4', '#a8c0a8', i + 70);
        colonnade(pc, x - 10, y - 2, 3, 16, '#b8c4c8', '#d0d8d4', i % 3);
      }
      tintRamp(pc, '#cfe0e4', 0.15, 0.45);
      cloudField(pc, 10, 290, 330, { light: '#f0f4f4', mid: '#dae6ea', dark: '#c0d2dc' }, 5, 80, 150);
      box(pc, 0, 325, W, 35, '#dae6ea');
    },
    clouds: (pc) => cloudField(pc, 6, 30, 160, { light: '#f6f8f8', mid: '#e0eaee', dark: '#c4d4e0' }, 71),
    mid: (pc) => {
      for (let i = 0; i < 3; i++) {
        const x = 90 + i * 215;
        const y = 200 + (i % 2) * 36;
        island(pc, x, y, 70, '#6a7e94', '#5a6e84', '#8aa88a', i + 3);
        colonnade(pc, x - 22, y - 2, 5, 30, '#a8b2b4', '#cad2d0', (i * 2) % 5);
      }
    },
    near: (pc) => cloudField(pc, 8, 330, 350, { light: '#ffffff', mid: '#e8f0f4', dark: '#ccdce6' }, 91, 90, 160),
    fx: (pc, f) => {
      for (let i = 0; i < 24; i++) {
        const x = Math.floor(hash2(i, 0, 33) * W);
        const y = (Math.floor(hash2(i, 1, 33) * 300) - f * 3 + 300) % 300;
        dot(pc, x, y, '#fff4d8');
      }
    },
  }),

  // NEON CROSSING: cyberpunk megacity: towering blocks with holo billboards, an elevated rail, smog drift.
  neon: layered({
    far: (pc) => {
      skyGrad(pc, ['#080a1e', '#14143a', '#2a1a50', '#3a1e58'], 0, H, 5);
      paintCity(pc, cityLayout(81, 140, 300, 24, 54, 2), H, { body: '#1e1a40', side: '#1a163a', rim: '#2e2a58', win: '#201c44', lit: ['#3a8aa8', '#7a4a9a'], litRate: 0.14, pitch: [3, 4], size: [1, 2] });
      for (let i = 0; i < 4; i++) {
        const x = i * 160 + 40;
        const y = 60 + Math.floor(hash2(i, 1, 82) * 80);
        box(pc, x, y, 40, 22, i % 2 ? '#2a6a8a' : '#7a2a6a');
        box(pc, x + 2, y + 2, 36, 18, i % 2 ? '#3a8aaa' : '#9a3a86');
        for (let k = 0; k < 18; k += 2) box(pc, x + 2, y + 2 + k, 36, 1, i % 2 ? '#2a7090' : '#802e70');
      }
      tint(pc, '#3a1e58', 0.3);
      hazeBand(pc, 200, H, '#6a3a9a', 0.3, 4);
    },
    clouds: (pc) => {
      for (let i = 0; i < 6; i++) streak(pc, Math.floor(hash2(i, 0, 93) * W), 200 + Math.floor(hash2(i, 1, 93) * 100), 80 + Math.floor(hash2(i, 2, 93) * 90), '#2e1e4e', '#3e2a5e');
    },
    mid: (pc) => {
      const t = cityLayout(83, 60, 170, 24, 50, 5);
      paintCity(pc, t, H, { body: '#120e28', side: '#0e0a22', rim: '#2a2450', win: '#16122e', lit: ['#4ae0f0', '#f05ab8', '#f0d060'], litRate: 0.12 });
      box(pc, 0, 250, W, 6, '#0c0a1e');
      box(pc, 0, 250, W, 1, '#3a3a6a');
      for (let x = 30; x < W; x += 120) box(pc, x, 256, 6, H - 256, '#0c0a1e');
      for (let i = 0; i < 6; i++) {
        const x = Math.floor(hash2(i, 9, 84) * W);
        const y = 150 + Math.floor(hash2(i, 8, 84) * 80);
        const c = ['#4ae0f0', '#f05ab8', '#f0d060'][i % 3];
        neonSign(pc, x, y, i % 2 ? 7 : 26, i % 2 ? 26 : 7, c, '#0a081a', i + 20);
        glow(pc, x + 6, y + 6, 26, 20, c, 0.2, 3);
      }
    },
    near: (pc) => {
      const c = '#06050f';
      box(pc, 0, H - 28, W, 28, c);
      for (let i = 0; i < 5; i++) {
        const x = i * 130 + Math.floor(hash2(i, 0, 85) * 40);
        box(pc, x, H - 60, 50, 32, c);
        box(pc, x, H - 60, 50, 1, '#2a1e4a');
      }
      for (let x = 0; x < W; x++) dot(pc, x, H - 90 + Math.round(Math.sin(((x % 130) / 130) * Math.PI) * 12), c);
    },
    fx: (pc, f, n) => {
      paintCityLights(pc, cityLayout(83, 60, 170, 24, 50, 5), H, { body: '', side: '', rim: '', win: '', lit: ['#4ae0f0', '#f05ab8'], litRate: 0.12 }, f, n, '#ff3a6a');
      if (f % 2 === 0) for (let x = (f * 40) % 120; x < W; x += 120) box(pc, x, 248, 10, 2, '#9af0ff'); // rail car lights
    },
  }),

  // TOURNAMENT HALL (dojo): through the open shoji wall: a sunset over misty mountains and a pagoda,
  // cherry trees in bloom with petals drifting down.
  dojo: layered({
    far: (pc) => {
      skyGrad(pc, ['#2a1a3a', '#6a2e56', '#c85a5a', '#f0a060', '#f8cc80'], 0, 230, 6);
      box(pc, 0, 230, W, 130, '#f8cc80');
      halo(pc, 330, 170, 180, 110, '#ffd890', 0.4, 5);
      disc(pc, 330, 170, 30, '#ffe4a0');
      for (let k = 0; k < 4; k++) box(pc, 300, 160 + k * 6, 60, 1, '#f8c070'); // sun banding
      ridge(pc, { base: 230, amp: 120, color: '#a85a70', seed: 11, scale: 230, rough: 0.8, lit: '#c47080', dark: '#9a5068', snow: { color: '#e8a8a0', depth: 12 } });
      tintRamp(pc, '#e08a70', 0.2, 0.45);
      hazeBand(pc, 180, 250, '#f8c890', 0.35, 4);
      const tops = ridge(pc, { base: 260, amp: 80, color: '#7a3a5a', seed: 5, scale: 160, rough: 0.6, lit: '#8a4664' });
      pagoda(pc, 470, tops[470] + 6, 4, '#5a2a46', '#4a2240');
      hazeBand(pc, 220, 280, '#e89a80', 0.3, 4);
      ridge(pc, { base: 300, amp: 60, color: '#4a2240', seed: 8, scale: 120, rough: 0.5, lit: '#5a2a4a' });
    },
    clouds: (pc) => {
      for (let i = 0; i < 9; i++) streak(pc, Math.floor(hash2(i, 0, 111) * W), 60 + Math.floor(hash2(i, 1, 111) * 160), 50 + Math.floor(hash2(i, 2, 111) * 100), '#e8a080', '#f8c8a0');
    },
    mid: (pc) => {
      for (let i = 0; i < 6; i++) cherryTree(pc, i * 107 + Math.floor(hash2(i, 0, 113) * 40), 330, 80 + Math.floor(hash2(i, 1, 113) * 40), '#3a1a2a', ['#6a2a48', '#8a3c5c', '#a85272', '#c4708a'], i + 7);
      box(pc, 0, 320, W, 40, '#3a1a2a');
    },
    near: (pc) => {
      // bamboo at the edges of the view
      for (const x of [8, 22, 600, 620]) {
        box(pc, x, 0, 5, H, '#1a2a18');
        for (let y = 20; y < H; y += 34) box(pc, x - 1, y, 7, 2, '#26381e');
        for (let k = 0; k < 3; k++) lineW(pc, x + 4, 60 + k * 70 + (x % 40), x + (x < 320 ? 18 : -14), 52 + k * 70 + (x % 40), '#1a2a18', 2);
      }
    },
    fx: (pc, f, n) => {
      for (let i = 0; i < 60; i++) {
        const x = Math.floor(hash2(i, 0, 117) * W) + Math.round(Math.sin((f / n) * Math.PI * 2 + i) * 3);
        const y = Math.floor(hash2(i, 1, 117) * 330 + f * (330 / n) / 4) % 330;
        dot(pc, x, y, i % 3 ? '#f4b0c0' : '#ffd8e0');
      }
    },
  }),

  // MUSEUM ATRIUM: through the glass roof: a starry night over downtown, moon, beacon-tipped towers.
  museum: layered({
    far: (pc) => {
      skyGrad(pc, ['#060a1a', '#101a36', '#1e2a4e', '#2a3458'], 0, H, 6);
      stars(pc, 140, 200, 131, '#3a4468', '#b8c4e8');
      moon(pc, 470, 48, 14, '#f0ecdc', '#cccabc', '#8a9ad8');
      paintCity(pc, cityLayout(133, 150, 290, 18, 40, 2), H, { body: '#1e2848', side: '#1a2442', rim: '#2e3a5e', win: '#202a4a', lit: ['#4a5a80', '#6a6a7a'], litRate: 0.12 });
      tintRamp(pc, '#2a3458', 0.1, 0.4);
      hazeBand(pc, 180, H, '#4a5a8a', 0.25, 4);
    },
    clouds: (pc) => {
      for (let i = 0; i < 7; i++) streak(pc, Math.floor(hash2(i, 0, 137) * W), 30 + Math.floor(hash2(i, 1, 137) * 120), 50 + Math.floor(hash2(i, 2, 137) * 90), '#1e2848', '#2a3658');
    },
    mid: (pc) => {
      paintCity(pc, cityLayout(139, 170, 320, 26, 56, 8), H, { body: '#111a32', side: '#0d152c', rim: '#2a3a60', win: '#152040', lit: ['#e8c070', '#c8d8f0', '#e09a50'], litRate: 0.18 });
    },
    fx: (pc, f, n) => paintCityLights(pc, cityLayout(139, 170, 320, 26, 56, 8), H, { body: '', side: '', rim: '', win: '', lit: ['#e8c070', '#c8d8f0'], litRate: 0.18 }, f, n, '#ff4a4a'),
  }),
};

export interface BakedBackground {
  far: string;
  clouds: string | null;
  mid: string | null;
  near: string | null;
  /** animated overlay frames (empty = none) */
  fx: string[];
}

/** The layers a theme bakes (far always; the others when its def declares them). */
export function themeLayers(theme: string): BgLayer[] {
  const def = BACKGROUNDS[theme] ?? BACKGROUNDS.arena;
  const out: BgLayer[] = ['far'];
  if (def.clouds) out.push('clouds');
  if (def.mid !== undefined) out.push('mid');
  out.push('near');
  if (def.fx) out.push('fx');
  return out;
}

/** Paint one layer / animation frame of a theme into a fresh canvas (pure function of its arguments). */
export function paintBackgroundLayer(theme: string, layer: BgLayer, frame = 0): PixelCanvas {
  const painter = PAINTERS[theme] ?? PAINTERS.arena;
  const def = BACKGROUNDS[theme] ?? BACKGROUNDS.arena;
  const pc = new PixelCanvas(W, H);
  painter(pc, layer, frame, def.fx?.frames ?? 1);
  return pc;
}

const isEmpty = (pc: PixelCanvas) => {
  for (let i = 0; i < pc.px.length; i++) if (pc.px[i] !== 0) return false;
  return true;
};

/**
 * Bake a theme's layers into textures 'bg_<theme>_<layer>' (fx frames: 'bg_<theme>_fx<i>'). Empty static layers
 * are skipped (null); `fx: false` leaves the animation frames out (still previews). Textures are cached per theme.
 */
export function bakeBackground(scene: Phaser.Scene, theme: string, opts: { fx?: boolean } = {}): BakedBackground {
  const def = BACKGROUNDS[theme] ?? BACKGROUNDS.arena;
  const key = (l: string) => `bg_${theme}_${l}`;
  const bake = (layer: BgLayer, frame = 0, name: string = layer): string | null => {
    const k = key(name);
    if (scene.textures.exists(k)) return k;
    if (scene.textures.exists(k + '_empty')) return null;
    const pc = paintBackgroundLayer(theme, layer, frame);
    // an empty static layer is skipped; an empty animation frame is still a frame
    if (layer !== 'far' && layer !== 'fx' && isEmpty(pc)) {
      scene.textures.addCanvas(k + '_empty', document.createElement('canvas'));
      return null;
    }
    scene.textures.addCanvas(k, pc.flush());
    return k;
  };
  const layers = themeLayers(theme);
  const out: BakedBackground = {
    far: bake('far')!,
    clouds: layers.includes('clouds') ? bake('clouds') : null,
    mid: layers.includes('mid') ? bake('mid') : null,
    near: bake('near'),
    fx: [],
  };
  if (def.fx && opts.fx !== false) for (let f = 0; f < def.fx.frames; f++) out.fx.push(bake('fx', f, 'fx' + f)!);
  return out;
}

/** Drop a theme's baked layers (the title screen cycles through every theme; keep GPU memory flat). */
export function releaseBackground(scene: Phaser.Scene, theme: string): void {
  for (const k of scene.textures.getTextureKeys()) if (k.startsWith(`bg_${theme}_`)) scene.textures.remove(k);
}

/** Theme ids that have a painted background (tests: every map theme must be one of these). */
export const BACKGROUND_THEMES = Object.keys(PAINTERS);
