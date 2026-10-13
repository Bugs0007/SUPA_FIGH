import type Phaser from 'phaser';
import { hash2, packColor, PixelCanvas } from './canvas';
import { mix, P, shade } from './palette';

// Procedural parallax backgrounds per map theme: a FAR and a NEAR layer, each 640x360, horizontally
// tileable (painted with x wrapping). Chunky silhouettes, hard edges, limited palette, ordered
// dithering for skies — same pixel language as the tiles. Rendered by BackgroundScene.

export interface BackgroundDef {
  sky: string;
  /** far/near parallax factors (0 = fixed, 1 = moves with the world) */
  far: number;
  near: number;
  /** auto-scroll px/s (train) */
  scroll?: number;
  /** gentle vertical rocking amplitude in px (ship at sea) */
  bob?: number;
}

export const BACKGROUNDS: Record<string, BackgroundDef> = {
  arena: { sky: '#15111f', far: 0.1, near: 0.3 },
  rooftops: { sky: '#120c24', far: 0.1, near: 0.35 },
  train: { sky: '#0e1024', far: 0.05, near: 0.6, scroll: 220 },
  factory: { sky: '#2a1410', far: 0.1, near: 0.35 },
  construction: { sky: '#6fa8dc', far: 0.1, near: 0.35 },
  casino: { sky: '#2a0a14', far: 0.15, near: 0.3 },
  docks: { sky: '#3a2048', far: 0.1, near: 0.4 },
  office: { sky: '#7ab0e0', far: 0.1, near: 0.3 },
  lab: { sky: '#081a1c', far: 0.12, near: 0.3 },
  mine: { sky: '#120c08', far: 0.12, near: 0.35 },
  leaf: { sky: '#5aa0e0', far: 0.1, near: 0.35 },
  ship: { sky: '#4a90d8', far: 0.08, near: 0.25, bob: 4 },
  alien: { sky: '#1a0a3a', far: 0.1, near: 0.3 },
};

const W = 640;
const H = 360;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

type Painter = (pc: PixelCanvas, layer: 'far' | 'near') => void;

const wrap = (x: number) => ((x % W) + W) % W;

/** Painted sky: many colour bands with restrained dithering at their boundaries. */
function sky(pc: PixelCanvas, top: string, bottom: string, from = 0, to = H): void {
  for (let y = from; y < to; y++) {
    const t = (y - from) / Math.max(1, to - from);
    const band = t * 24;
    const colors = [mix(top, bottom, Math.floor(band) / 24), mix(top, bottom, (Math.floor(band) + 1) / 24)];
    for (let x = 0; x < W; x++) {
      const th = BAYER[(y & 3) * 4 + (x & 3)] / 16;
      pc.set(x, y, colors[band % 1 > th ? 1 : 0]);
    }
  }
}

function rectW(pc: PixelCanvas, x: number, y: number, w: number, h: number, c: string, a = 255): void {
  for (let i = 0; i < w; i++) pc.rect(wrap(x + i), y, 1, h, c, a);
}

function stars(pc: PixelCanvas, n: number, maxY: number, seed: number): void {
  for (let i = 0; i < n; i++) {
    const x = Math.floor(hash2(i, 1, seed) * W);
    const y = Math.floor(hash2(i, 2, seed) * maxY);
    pc.set(x, y, hash2(i, 3, seed) < 0.2 ? P.yellow2 : P.white, hash2(i, 4, seed) < 0.5 ? 255 : 140);
  }
}

/** Skyline of blocky buildings with lit windows. */
function skyline(pc: PixelCanvas, base: number, minH: number, maxH: number, color: string, lit: string, seed: number, gap = 2): void {
  let x = 0;
  let i = 0;
  while (x < W) {
    const w = 18 + Math.floor(hash2(i, 0, seed) * 40);
    const h = minH + Math.floor(hash2(i, 1, seed) * (maxH - minH));
    rectW(pc, x, base - h, w, h, color);
    // Roof caps, shaded side planes and recessed window bays give each tower volume.
    rectW(pc, x, base - h, w, 2, shade(color, 0.12));
    rectW(pc, x + w - 6, base - h + 2, 6, h - 2, shade(color, -0.24));
    rectW(pc, x + 2, base - h + 3, 1, h - 3, shade(color, 0.06));
    if (hash2(i, 5, seed) < 0.3) rectW(pc, x + Math.floor(w / 2) - 1, base - h - 8, 2, 8, color); // antenna
    for (let wy = base - h + 4; wy < base - 4; wy += 5) {
      for (let wx = x + 3; wx < x + w - 3; wx += 4) {
        if (hash2(wx, wy, seed) < 0.35) {
          pc.rect(wrap(wx), wy, 2, 2, lit, 200);
          pc.set(wrap(wx), wy + 2, shade(lit, -0.5));
        }
      }
    }
    x += w + gap;
    i++;
  }
}

function mountains(pc: PixelCanvas, base: number, amp: number, color: string, seed: number, freq = 3): void {
  const ridges: number[] = [];
  for (let x = 0; x < W; x++) {
    const a = (x / W) * Math.PI * 2;
    const h = amp * (0.55 + 0.25 * Math.sin(a * freq + seed) + 0.2 * Math.sin(a * freq * 2 + seed * 3)) + hash2(x >> 2, 0, seed) * 2;
    ridges.push(Math.floor(base - h));
  }
  const lit = mix(color, '#d6e5ef', 0.1);
  const shadow = mix(color, '#25324d', 0.15);
  for (let x = 0; x < W; x++) {
    const top = ridges[x];
    const slope = ridges[wrap(x + 4)] - ridges[wrap(x - 4)];
    pc.rect(x, top, 1, H - top, slope > 0 ? shadow : lit);
    pc.rect(x, top, 1, 2, mix(color, '#cbdbe8', 0.18));
    // Broken rock strata; deliberately low contrast to keep scenery behind the action.
    for (let y = top + 10; y < Math.min(H, top + amp); y++) {
      if (hash2(x >> 3, y >> 2, seed + 20) > 0.83) pc.set(x, y, color);
    }
  }
}

function clouds(pc: PixelCanvas, n: number, maxY: number, color: string, seed: number): void {
  for (let i = 0; i < n; i++) {
    const cx = Math.floor(hash2(i, 0, seed) * W);
    const cy = 10 + Math.floor(hash2(i, 1, seed) * maxY);
    const w = 30 + Math.floor(hash2(i, 2, seed) * 50);
    for (let k = 0; k < 7; k++) {
      const r = 4 + hash2(k, i, seed) * 5;
      pc.circle(wrap(cx + 5 + k * (w - 10) / 6), cy - 2 - Math.sin(k / 6 * Math.PI) * 5, r, shade(color, -0.1));
    }
    for (let k = 0; k < 7; k++) {
      const r = 4 + hash2(k, i, seed) * 5;
      pc.circle(wrap(cx + 4 + k * (w - 10) / 6), cy - 5 - Math.sin(k / 6 * Math.PI) * 5, r * 0.85, color);
    }
    rectW(pc, cx + 3, cy + 3, w - 4, 2, shade(color, -0.05));
  }
}

function fill(pc: PixelCanvas, c: string): void {
  pc.rect(0, 0, W, H, c);
}

/** Big round-canopy tree silhouette (forest). */
function tree(pc: PixelCanvas, x: number, base: number, h: number, trunk: string, leaves: string, seed: number): void {
  rectW(pc, x - 3, base - h, 7, h, trunk);
  rectW(pc, x - 2, base - h, 2, h, shade(trunk, 0.18));
  for (let k = 0; k < 3; k++) pc.line(wrap(x), base - h + 35 + k * 16, wrap(x + (k % 2 ? 18 : -18)), base - h + 12 + k * 10, trunk, 3);
  for (let i = 0; i < 6; i++) {
    const cx = x + Math.floor((hash2(i, 0, seed) - 0.5) * 34);
    const cy = base - h - 6 + Math.floor((hash2(i, 1, seed) - 0.5) * 22);
    const r = 10 + Math.floor(hash2(i, 2, seed) * 9);
    pc.circle(wrap(cx), cy, r, leaves);
  }
  const leafColor = packColor(leaves);
  const shades = [shade(leaves, -0.22), leaves, mix(leaves, '#abc877', 0.22), mix(leaves, '#c5d98b', 0.3)];
  for (let yy = base - h - 36; yy <= base - h + 28; yy++) for (let xx = x - 38; xx <= x + 38; xx++) {
    const px = wrap(xx);
    if (pc.get(px, yy) !== leafColor) continue;
    const sun = (x - xx + base - h - yy) / 65;
    const cluster = hash2(xx >> 2, yy >> 2, seed + 100);
    const tone = sun + (cluster - 0.5) * 0.9;
    pc.set(px, yy, shades[tone > 0.42 ? 3 : tone > 0.12 ? 2 : tone < -0.12 ? 0 : 1]);
  }
}

/** Little village roofs (orange tiles) seen from afar. */
function roofs(pc: PixelCanvas, base: number, seed: number): void {
  for (let i = 0; i < 9; i++) {
    const x = Math.floor(hash2(i, 0, seed) * W);
    const w = 22 + Math.floor(hash2(i, 1, seed) * 16);
    const h = 10 + Math.floor(hash2(i, 2, seed) * 8);
    rectW(pc, x, base - h, w, h, '#d8c8a8');
    for (let r = 0; r < 6; r++) rectW(pc, x - 2 + r, base - h - 6 + r, w + 4 - r * 2, 1, r % 2 ? '#c0502a' : '#e06a30');
    rectW(pc, x + 4, base - h + 4, 3, 3, '#4a3424');
  }
}

/** Floating rock with a few glowing crystals (alien). */
function floatingRock(pc: PixelCanvas, x: number, y: number, w: number, rock: string, glow: string, seed: number): void {
  for (let r = 0; r < w / 2; r++) {
    const inset = Math.floor((r * r) / (w / 2));
    rectW(pc, x + inset, y + r, w - inset * 2, 1, r === 0 ? shade(rock, 0.2) : rock);
  }
  for (let i = 0; i < 3; i++) {
    const cx = x + 4 + Math.floor(hash2(i, 0, seed) * (w - 8));
    rectW(pc, cx, y - 4, 2, 4, glow);
    pc.set(wrap(cx), y - 5, '#e8ffff');
  }
}

const PAINTERS: Record<string, Painter> = {
  arena: (pc, layer) => {
    if (layer === 'far') {
      sky(pc, '#15111f', '#2b2140');
      skyline(pc, H, 60, 140, '#1c1628', '#2e2640', 11);
      pc.bloom(390, 200, 310, 170, '#738bdd', 0.13);
    } else {
      skyline(pc, H, 20, 75, '#100e1e', '#575b8b', 15, 10);
      // A distant gantry and suspended arena floodlights.
      rectW(pc, 0, 104, W, 3, '#24263f');
      for (let x = 48; x < W; x += 136) {
        pc.rect(x, 107, 2, 19, '#24263f');
        pc.rect(x - 5, 126, 12, 3, '#a3c4e8');
      }
    }
  },
  rooftops: (pc, layer) => {
    if (layer === 'far') {
      sky(pc, '#120c24', '#3a1a4a', 0, 220);
      pc.rect(0, 220, W, H - 220, '#3a1a4a');
      stars(pc, 70, 150, 3);
      pc.circle(520, 60, 14, '#f4e8c0');
      pc.circle(526, 56, 12, '#120c24');
      pc.bloom(520, 60, 92, 80, '#aebdff', 0.16);
      skyline(pc, H, 90, 200, '#1e1236', '#5a3a7a', 21);
    } else {
      skyline(pc, H, 40, 120, '#0e0a1c', '#f8c840', 22, 6);
      for (let i = 0; i < 9; i++) {
        const x = Math.floor(hash2(i, 9, 5) * W);
        const y = H - 60 - Math.floor(hash2(i, 8, 5) * 50);
        const c = i % 3 === 0 ? P.pink : i % 3 === 1 ? P.teal : P.orange;
        rectW(pc, x, y, 16, 6, c);
        rectW(pc, x + 1, y + 1, 14, 4, shade(c, 0.35));
        pc.bloom(wrap(x + 8), y + 3, 30, 18, c, 0.16);
      }
    }
  },
  train: (pc, layer) => {
    if (layer === 'far') {
      sky(pc, '#0e1024', '#242a50', 0, 260);
      pc.rect(0, 260, W, 100, '#242a50');
      stars(pc, 90, 200, 7);
      pc.circle(140, 70, 16, '#e8e4dc');
      pc.bloom(140, 70, 90, 80, '#a1b8ef', 0.18);
      mountains(pc, 300, 90, '#161a34', 1.3, 2);
      mountains(pc, 330, 50, '#10132a', 4.1, 4);
    } else {
      // telegraph poles and trees whipping past
      pc.rect(0, 318, W, 42, '#0a0c1a');
      for (let x = 0; x < W; x += 160) {
        rectW(pc, x, 240, 3, 80, '#05060e');
        rectW(pc, x - 8, 246, 19, 2, '#05060e');
      }
      for (let i = 0; i < 12; i++) {
        const x = Math.floor(hash2(i, 0, 9) * W);
        const h = 30 + Math.floor(hash2(i, 1, 9) * 40);
        for (let r = 0; r < h; r++) rectW(pc, x - Math.floor((h - r) / 4), 320 - h + r, Math.floor((h - r) / 2) + 2, 1, '#070912');
      }
      for (let x = 0; x < W; x += 3) pc.line(x, 252, x + 3, 253 + ((x / 3) % 2), '#05060e');
    }
  },
  factory: (pc, layer) => {
    if (layer === 'far') {
      sky(pc, '#2a1410', '#6a3418', 0, 300);
      pc.rect(0, 300, W, 60, '#6a3418');
      for (let i = 0; i < 6; i++) {
        const x = 40 + i * 110 + Math.floor(hash2(i, 0, 4) * 30);
        const h = 120 + Math.floor(hash2(i, 1, 4) * 80);
        rectW(pc, x, H - h, 14, h, '#2a1810');
        rectW(pc, x - 2, H - h, 18, 4, '#3a2418');
        for (let s = 0; s < 6; s++) {
          const r = 6 + s * 3;
          pc.circle(wrap(x + 7 + s * 6), H - h - 10 - s * 12, r, '#4a2a1e', 200 - s * 25);
        }
      }
    } else {
      pc.rect(0, 300, W, 60, '#1a0e0a');
      for (let x = 0; x < W; x += 90) {
        rectW(pc, x, 240, 50, 60, '#1a0e0a');
        pc.circle(wrap(x + 25), 240, 25, '#1a0e0a');
        rectW(pc, x + 50, 270, 40, 6, '#140a08');
      }
    }
  },
  construction: (pc, layer) => {
    if (layer === 'far') {
      sky(pc, '#5a90c8', '#a8d0f0');
      clouds(pc, 7, 120, '#e8f2fa', 13);
      skyline(pc, H, 80, 190, '#7a98b8', '#a8c0d8', 31, 8);
    } else {
      // crane silhouettes and unfinished frames
      for (const cx of [80, 400]) {
        rectW(pc, cx, 60, 6, 300, '#4a5a70');
        rectW(pc, cx - 60, 60, 220, 5, '#4a5a70');
        for (let x = cx - 60; x < cx + 160; x += 8) pc.line(wrap(x), 60, wrap(x + 4), 64, '#3a4a60');
        rectW(pc, cx + 120, 64, 1, 70, '#2a3440');
      }
      for (let i = 0; i < 4; i++) {
        const x = 200 + i * 30;
        for (let y = 200; y < H; y += 30) rectW(pc, x, y, 30, 2, '#5a6a80');
        rectW(pc, x, 200, 2, 160, '#5a6a80');
      }
    }
  },
  casino: (pc, layer) => {
    if (layer === 'far') {
      fill(pc, '#2a0a14');
      pc.bloom(320, 115, 360, 290, '#b54166', 0.2);
      for (let y = 0; y < H; y += 12) for (let x = (y / 12) % 2 ? 6 : 0; x < W; x += 12) pc.rect(x + 4, y + 4, 3, 3, '#4a1424');
      for (let x = 0; x < W; x += 80) rectW(pc, x, 0, 4, H, '#c89030');
    }
  },
  docks: (pc, layer) => {
    if (layer === 'far') {
      sky(pc, '#3a2048', '#f08a4a', 0, 230);
      pc.circle(320, 228, 30, '#f8c840');
      pc.bloom(320, 204, 220, 140, '#ffb674', 0.32);
      sky(pc, '#2a4a7a', '#1a2a4a', 230, H);
      for (let y = 236; y < H; y += 6) for (let x = (y * 7) % 20; x < W; x += 20) pc.rect(x, y, 6, 1, '#4a6a9a');
      for (let y = 236; y < H; y += 4) {
        const span = 6 + (y - 230) * 0.5;
        pc.rect(320 - span, y, span * 2, 1, '#dca079', 150 - Math.floor((y - 230) * 0.7));
      }
      for (const sx of [90, 470]) {
        rectW(pc, sx, 214, 70, 12, '#1a1424');
        rectW(pc, sx + 10, 200, 30, 14, '#1a1424');
        rectW(pc, sx + 18, 186, 4, 14, '#1a1424');
      }
    } else {
      for (let i = 0; i < 10; i++) {
        const x = i * 64 + Math.floor(hash2(i, 0, 2) * 20);
        const stack = 1 + Math.floor(hash2(i, 1, 2) * 3);
        const cols = ['#5a2020', '#204a5a', '#5a4a20', '#2a5a2a'];
        for (let s = 0; s < stack; s++) {
          const c = cols[(i + s) % cols.length];
          rectW(pc, x, H - 30 - (s + 1) * 26, 56, 24, c);
          for (let rx = x + 3; rx < x + 54; rx += 4) rectW(pc, rx, H - 28 - (s + 1) * 26, 1, 20, shade(c, -0.25));
        }
      }
    }
  },
  office: (pc, layer) => {
    if (layer === 'far') {
      sky(pc, '#5a90d0', '#b8d8f0');
      clouds(pc, 5, 90, '#f0f6fc', 17);
      skyline(pc, H, 120, 260, '#8aa8c8', '#c8dcec', 41, 6);
    }
  },
  lab: (pc, layer) => {
    if (layer === 'far') {
      fill(pc, '#081a1c');
      for (let y = 0; y < H; y += 24) for (let x = 0; x < W; x += 32) {
        pc.rect(x + 1, y + 1, 30, 22, '#0c2428');
        if (hash2(x, y, 6) < 0.4) pc.rect(x + 4, y + 4, 2, 2, hash2(x, y, 7) < 0.5 ? P.teal : P.green2);
        if (hash2(x, y, 8) < 0.2) pc.rect(x + 8, y + 14, 16, 1, '#1a4a4a');
      }
      pc.bloom(290, 140, 330, 250, '#22b9aa', 0.14);
    }
  },
  leaf: (pc, layer) => {
    if (layer === 'far') {
      sky(pc, '#5aa0e0', '#a8d8f8', 0, 260);
      pc.rect(0, 260, W, H - 260, '#a8d8f8');
      clouds(pc, 6, 110, '#f0f8ff', 23);
      pc.bloom(460, 75, 210, 140, '#fff3c3', 0.32);
      mountains(pc, 300, 120, '#7aa0b8', 2.1, 2);
      mountains(pc, 320, 70, '#5a8a6a', 0.7, 3);
      roofs(pc, 318, 4);
      pc.rect(0, 318, W, H - 318, '#3a6a3a');
    } else {
      // giant trees in front of the village
      for (let i = 0; i < 5; i++) tree(pc, i * 130 + Math.floor(hash2(i, 5, 8) * 40), H, 150 + Math.floor(hash2(i, 6, 8) * 70), '#3a2618', i % 2 ? '#1e4a24' : '#24562a', i + 30);
      for (let x = 0; x < W; x += 4) pc.rect(x, H - 8 - ((x / 4) % 3), 4, 8 + ((x / 4) % 3), '#1a3a1c');
    }
  },
  ship: (pc, layer) => {
    if (layer === 'far') {
      sky(pc, '#3a80d0', '#a8d8f0', 0, 240);
      clouds(pc, 6, 120, '#f4faff', 41);
      pc.bloom(470, 60, 180, 140, '#fff1bd', 0.28);
      // distant islands on the horizon
      for (const [x, w2] of [[80, 90], [360, 60], [520, 120]] as const) {
        for (let r = 0; r < 14; r++) rectW(pc, x + r * 2, 240 - 14 + r, w2 - r * 4, 1, '#4a7a5a');
        rectW(pc, x + w2 / 2 - 1, 240 - 26, 3, 12, '#3a5a3a');
        pc.circle(wrap(x + w2 / 2), 240 - 28, 6, '#2a6a3a');
      }
      sky(pc, '#2a6ab0', '#123a70', 240, H);
      for (let y = 244; y < H; y += 7) for (let x = (y * 13) % 26; x < W; x += 26) pc.rect(x, y, 9, 1, '#6aa8e0');
    } else {
      // foam crests rolling past
      for (let i = 0; i < 14; i++) {
        const x = Math.floor(hash2(i, 0, 51) * W);
        const y = 300 + Math.floor(hash2(i, 1, 51) * 50);
        rectW(pc, x, y, 14, 2, '#d8f0ff');
        rectW(pc, x + 3, y - 1, 7, 1, '#ffffff');
      }
    }
  },
  alien: (pc, layer) => {
    if (layer === 'far') {
      sky(pc, '#1a0a3a', '#4a2a7a', 0, H);
      stars(pc, 110, 220, 61);
      pc.circle(140, 80, 34, '#e07a4a');
      pc.circle(128, 72, 8, '#c8603a');
      pc.circle(150, 96, 5, '#c8603a');
      pc.bloom(125, 65, 32, 32, '#ffd899', 0.5);
      pc.bloom(140, 80, 115, 110, '#dc799f', 0.13);
      pc.circle(500, 50, 14, '#8af0e0');
      pc.circle(505, 46, 13, '#1a0a3a');
      pc.bloom(500, 50, 85, 70, '#65e9dc', 0.14);
      mountains(pc, 330, 110, '#3a1a4a', 3.3, 3);
      for (let i = 0; i < 4; i++) floatingRock(pc, 60 + i * 160, 150 + Math.floor(hash2(i, 2, 7) * 60), 40, '#5a2a4a', '#4af0e0', i);
    } else {
      // glowing vegetation along the ground
      mountains(pc, 350, 40, '#2a1030', 5.2, 5);
      for (let i = 0; i < 26; i++) {
        const x = Math.floor(hash2(i, 0, 71) * W);
        const h = 10 + Math.floor(hash2(i, 1, 71) * 26);
        rectW(pc, x, H - 20 - h, 2, h, '#1a8a8a');
        pc.circle(wrap(x + 1), H - 22 - h, 3, i % 3 ? '#4af0e0' : '#c8f8a0');
      }
    }
  },
  mine: (pc, layer) => {
    if (layer === 'far') {
      fill(pc, '#120c08');
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const n = hash2(x >> 3, y >> 3, 12);
          if (n < 0.3) pc.set(x, y, '#1e140c');
          else if (n > 0.92 && hash2(x, y, 3) < 0.05) pc.set(x, y, P.teal);
        }
    } else {
      for (let x = 0; x < W; x += 120) {
        rectW(pc, x, 140, 6, 220, '#2a1a0e');
        rectW(pc, x + 60, 140, 6, 220, '#2a1a0e');
        rectW(pc, x - 4, 136, 74, 6, '#2a1a0e');
      }
    }
  },
};

/** Bake 'bg_<theme>_far' / 'bg_<theme>_near' (near may be absent). Returns the keys that exist. */
export function bakeBackground(scene: Phaser.Scene, theme: string): { far: string; near: string | null } {
  const painter = PAINTERS[theme] ?? PAINTERS.arena;
  const out = { far: `bg_${theme}_far`, near: `bg_${theme}_near` as string | null };
  for (const layer of ['far', 'near'] as const) {
    const key = `bg_${theme}_${layer}`;
    if (scene.textures.exists(key)) continue;
    const pc = new PixelCanvas(W, H);
    painter(pc, layer);
    if (layer === 'far') {
      // Horizon haze separates the distant scenery from the playable geometry.
      const haze = ({ leaf: '#b3dccb', construction: '#dce5ef', office: '#dce5ef', ship: '#b1def1', rooftops: '#977bbc', docks: '#edac83', alien: '#9570c6', factory: '#cb6b36' } as Record<string, string>)[theme] ?? '#727798';
      pc.bloom(W / 2, H - 65, W, 85, haze, 0.1);
    }
    // empty layer? skip it
    let any = false;
    for (let i = 0; i < pc.px.length && !any; i++) any = pc.px[i] !== 0;
    if (!any) {
      if (layer === 'near') out.near = null;
      continue;
    }
    scene.textures.addCanvas(key, pc.flush());
  }
  if (out.near && !scene.textures.exists(out.near)) out.near = null;
  return out;
}
