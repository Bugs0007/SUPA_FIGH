import type Phaser from 'phaser';
import { PixelCanvas } from './canvas';
import { P, shade } from './palette';

// Background decorations (map detailing pass): small procedural props painted per theme and placed
// on free wall / floor / ceiling spots by render/Decor.ts. Visual only — the sim never sees them.
// Colors are deliberately a step darker/muted than gameplay sprites so fighters, items and props
// always read in front of them.

export type DecorPlace =
  /** hangs on a back wall, all footprint cells must be open back wall */
  | 'wall'
  /** stands on a floor (solid or one-way tile below) */
  | 'floor'
  /** hangs from a ceiling (solid tile above) */
  | 'ceiling'
  /** painted onto the face of a solid building (non-breakable tiles all around) */
  | 'face'
  /** stands on a floor in the open air (no back wall needed: rooftops, decks) */
  | 'outdoor';

export interface DecorGlow {
  x: number;
  y: number;
  /** radius in px */
  r: number;
  color: string;
  alpha: number;
  flicker?: boolean;
}

export interface DecorDef {
  id: string;
  w: number;
  h: number;
  place: DecorPlace;
  /** relative frequency */
  weight: number;
  /** 2 = two animation frames (blinking lights, bubbles, fans) */
  frames?: number;
  /** seconds per frame when animated */
  period?: number;
  glow?: DecorGlow;
  paint: (pc: PixelCanvas, ox: number, oy: number, frame: number) => void;
}

const INK = P.ink;
const outline = (pc: PixelCanvas, ox: number, oy: number, w: number, h: number) => pc.outline(ox, oy, w, h, shade(INK, 0.15));

// ------------------------------------------------------------------ shared props

const hangingLamp = (shadeCol: string, bulb: string): DecorDef['paint'] => (pc, ox, oy) => {
  pc.rect(ox + 5, oy, 1, 4, P.steel0); // cord
  pc.rect(ox + 1, oy + 4, 10, 3, shadeCol);
  pc.rect(ox + 2, oy + 3, 8, 1, shade(shadeCol, 0.2));
  pc.rect(ox, oy + 7, 12, 1, shade(shadeCol, -0.3));
  pc.rect(ox + 4, oy + 8, 4, 2, bulb);
  outline(pc, ox, oy, 12, 10);
};

const crateStack: DecorDef['paint'] = (pc, ox, oy) => {
  const box = (x: number, y: number, w: number, h: number) => {
    pc.rect(ox + x, oy + y, w, h, '#7a5a3a');
    pc.rect(ox + x, oy + y, w, 1, '#94704a');
    pc.rect(ox + x + Math.floor(w / 2) - 1, oy + y, 2, h, '#c8b088'); // tape
  };
  box(0, 5, 9, 7);
  box(8, 4, 8, 8);
  box(3, 0, 8, 5);
  outline(pc, ox, oy, 16, 12);
};

const barrel: DecorDef['paint'] = (pc, ox, oy) => {
  pc.rect(ox + 1, oy, 8, 12, P.wood1);
  pc.rect(ox, oy + 2, 10, 8, P.wood1);
  pc.rect(ox + 2, oy + 1, 2, 10, P.wood2);
  for (const y of [2, 9]) pc.rect(ox, oy + y, 10, 1, P.steel1);
  outline(pc, ox, oy, 10, 12);
};

// ------------------------------------------------------------------ per theme

const factory: DecorDef[] = [
  {
    id: 'pipeV',
    w: 8,
    h: 48,
    place: 'wall',
    weight: 3,
    paint: (pc, ox, oy) => {
      pc.rect(ox + 2, oy, 4, 48, '#5a5048');
      pc.rect(ox + 3, oy, 1, 48, '#7a7066');
      for (let y = 4; y < 48; y += 16) {
        pc.rect(ox, oy + y, 8, 3, '#3e3630');
        pc.rect(ox + 1, oy + y, 1, 3, '#6a6058');
      }
      pc.rect(ox + 2, oy + 30, 4, 4, '#6a3a1a'); // rust patch
    },
  },
  {
    id: 'pipeH',
    w: 48,
    h: 8,
    place: 'wall',
    weight: 2,
    paint: (pc, ox, oy) => {
      pc.rect(ox, oy + 2, 48, 4, '#5a5048');
      pc.rect(ox, oy + 3, 48, 1, '#7a7066');
      for (let x = 6; x < 48; x += 16) pc.rect(ox + x, oy, 3, 8, '#3e3630');
      pc.rect(ox + 20, oy, 6, 2, '#8a2a22'); // valve wheel
    },
  },
  {
    id: 'gauge',
    w: 12,
    h: 14,
    place: 'wall',
    weight: 1,
    paint: (pc, ox, oy) => {
      pc.circle(ox + 6, oy + 6, 5, P.steel2);
      pc.circle(ox + 6, oy + 6, 4, '#d8d0b8');
      pc.line(ox + 6, oy + 6, ox + 9, oy + 4, P.red1);
      pc.rect(ox + 5, oy + 11, 2, 3, P.steel1);
      outline(pc, ox, oy, 12, 14);
    },
  },
  {
    id: 'cabinet',
    w: 16,
    h: 24,
    place: 'floor',
    weight: 2,
    frames: 2,
    period: 0.6,
    paint: (pc, ox, oy, f) => {
      pc.rect(ox, oy, 16, 24, '#4a4e5a');
      pc.rect(ox + 1, oy + 1, 14, 1, '#646a7a');
      pc.rect(ox + 2, oy + 4, 12, 8, '#2a2e38');
      for (let i = 0; i < 4; i++) pc.rect(ox + 3 + i * 3, oy + 6, 2, 2, (i + f) % 2 ? '#3ac85a' : '#1a3a22');
      pc.rect(ox + 3, oy + 9, 2, 2, f ? P.red2 : P.red0);
      pc.rect(ox + 2, oy + 15, 12, 6, '#3a3e48');
      pc.rect(ox + 7, oy + 17, 2, 2, P.yellow);
      outline(pc, ox, oy, 16, 24);
    },
  },
  {
    id: 'hazard',
    w: 12,
    h: 11,
    place: 'wall',
    weight: 1,
    paint: (pc, ox, oy) => {
      for (let y = 0; y < 10; y++) pc.rect(ox + 6 - Math.floor(y / 1.8) - 1, oy + y, Math.floor(y / 1.8) * 2 + 2, 1, P.yellow);
      pc.rect(ox + 5, oy + 3, 2, 4, INK);
      pc.rect(ox + 5, oy + 8, 2, 1, INK);
      outline(pc, ox, oy, 12, 11);
    },
  },
  {
    id: 'lamp',
    w: 12,
    h: 10,
    place: 'ceiling',
    weight: 3,
    glow: { x: 6, y: 14, r: 26, color: '#f8b860', alpha: 0.16, flicker: true },
    paint: hangingLamp('#3a4a3a', '#fff4a0'),
  },
  {
    id: 'fan',
    w: 16,
    h: 16,
    place: 'wall',
    weight: 2,
    frames: 2,
    period: 0.08,
    paint: (pc, ox, oy, f) => {
      pc.rect(ox, oy, 16, 16, '#3a3632');
      pc.circle(ox + 8, oy + 8, 6, '#24201e');
      if (f === 0) {
        pc.line(ox + 3, oy + 8, ox + 13, oy + 8, '#6a6058', 2);
        pc.line(ox + 8, oy + 3, ox + 8, oy + 13, '#6a6058', 2);
      } else {
        pc.line(ox + 4, oy + 4, ox + 12, oy + 12, '#6a6058', 2);
        pc.line(ox + 12, oy + 4, ox + 4, oy + 12, '#6a6058', 2);
      }
      pc.rect(ox + 7, oy + 7, 2, 2, '#8a8078');
      outline(pc, ox, oy, 16, 16);
    },
  },
  {
    id: 'window',
    w: 24,
    h: 16,
    place: 'wall',
    weight: 2,
    glow: { x: 12, y: 8, r: 20, color: '#f07a2a', alpha: 0.12 },
    paint: (pc, ox, oy) => {
      pc.rect(ox, oy, 24, 16, '#2a2420');
      for (let y = 0; y < 2; y++) for (let x = 0; x < 3; x++) pc.rect(ox + 2 + x * 7, oy + 2 + y * 6, 6, 5, y ? '#a0522a' : '#c8702a');
      pc.rect(ox + 3, oy + 3, 2, 1, '#f0a050');
      outline(pc, ox, oy, 24, 16);
    },
  },
];

const casino: DecorDef[] = [
  {
    id: 'painting',
    w: 22,
    h: 17,
    place: 'wall',
    weight: 2,
    paint: (pc, ox, oy) => {
      pc.rect(ox, oy, 22, 17, '#a8782a');
      pc.rect(ox + 1, oy + 1, 20, 15, '#d8a040');
      pc.rect(ox + 3, oy + 3, 16, 11, '#3a6aa8'); // sky
      pc.rect(ox + 3, oy + 10, 16, 4, '#2f6a3a'); // hills
      pc.circle(ox + 14, oy + 6, 2, '#f8e0a0'); // sun
      pc.line(ox + 3, oy + 10, ox + 9, oy + 7, '#2f6a3a');
      outline(pc, ox, oy, 22, 17);
    },
  },
  {
    id: 'sconce',
    w: 8,
    h: 11,
    place: 'wall',
    weight: 3,
    glow: { x: 4, y: 3, r: 22, color: '#ffc870', alpha: 0.2 },
    paint: (pc, ox, oy) => {
      pc.rect(ox + 3, oy + 5, 2, 6, '#c89040');
      pc.rect(ox + 1, oy + 9, 6, 2, '#a8782a');
      pc.rect(ox + 2, oy + 1, 4, 4, '#fff0c0');
      pc.rect(ox + 1, oy + 4, 6, 1, '#d8a040');
      outline(pc, ox, oy, 8, 11);
    },
  },
  {
    id: 'slots',
    w: 14,
    h: 24,
    place: 'floor',
    weight: 3,
    frames: 2,
    period: 0.35,
    glow: { x: 7, y: 3, r: 14, color: '#ff5a8a', alpha: 0.18, flicker: true },
    paint: (pc, ox, oy, f) => {
      pc.rect(ox, oy + 4, 14, 20, '#8a1a2a');
      pc.rect(ox + 1, oy + 5, 12, 1, '#b8283a');
      pc.rect(ox + 2, oy, 10, 4, f ? '#fff4a0' : '#d8a040'); // top light
      pc.rect(ox + 2, oy + 8, 10, 6, '#e8e4dc');
      for (let i = 0; i < 3; i++) pc.rect(ox + 3 + i * 3, oy + 10, 2, 2, (i + f) % 3 === 0 ? P.red1 : i === 1 ? '#f8c840' : P.green1);
      pc.rect(ox + 12, oy + 7, 2, 6, '#c8c8d0'); // lever
      pc.rect(ox + 12, oy + 5, 2, 2, P.red2);
      pc.rect(ox + 2, oy + 17, 10, 3, '#5a0e1c');
      outline(pc, ox, oy, 14, 24);
    },
  },
  {
    id: 'curtain',
    w: 16,
    h: 40,
    place: 'wall',
    weight: 1,
    paint: (pc, ox, oy) => {
      for (let x = 0; x < 16; x++) {
        const fold = x % 4 === 0 ? '#5a0a1a' : x % 4 === 2 ? '#a0182c' : '#7a1024';
        const len = 40 - (x > 3 && x < 12 ? 0 : 0);
        pc.rect(ox + x, oy, 1, len, fold);
      }
      pc.rect(ox, oy, 16, 3, '#c89040');
      pc.rect(ox + 2, oy + 20, 12, 2, '#d8a040'); // tie
      outline(pc, ox, oy, 16, 40);
    },
  },
  {
    id: 'neon',
    w: 30,
    h: 12,
    place: 'wall',
    weight: 1,
    frames: 2,
    period: 0.9,
    glow: { x: 15, y: 6, r: 24, color: '#ff4ab0', alpha: 0.18, flicker: true },
    paint: (pc, ox, oy, f) => {
      pc.rect(ox, oy, 30, 12, '#1a0a14');
      const c = f ? '#ff6ac0' : '#ff9ad8';
      // "777"
      for (let i = 0; i < 3; i++) {
        const x = ox + 3 + i * 9;
        pc.rect(x, oy + 2, 6, 1, c);
        pc.line(x + 5, oy + 3, x + 2, oy + 9, c);
      }
      outline(pc, ox, oy, 30, 12);
    },
  },
  {
    id: 'palm',
    w: 14,
    h: 22,
    place: 'floor',
    weight: 2,
    paint: (pc, ox, oy) => {
      pc.rect(ox + 4, oy + 15, 6, 7, '#a8782a');
      pc.rect(ox + 3, oy + 15, 8, 2, '#c89040');
      pc.rect(ox + 6, oy + 6, 2, 9, '#6e4228');
      for (const [x1, y1] of [[0, 4], [13, 3], [2, 10], [12, 9], [7, 0]]) pc.line(ox + 7, oy + 6, ox + x1, oy + y1, '#2f8a4a', 2);
      outline(pc, ox, oy, 14, 22);
    },
  },
];

const office: DecorDef[] = [
  {
    id: 'window',
    w: 30,
    h: 22,
    place: 'wall',
    weight: 4,
    glow: { x: 15, y: 11, r: 26, color: '#b8e0ff', alpha: 0.1 },
    paint: (pc, ox, oy) => {
      pc.rect(ox, oy, 30, 22, '#c3c9dc');
      for (let y = 2; y < 20; y++) pc.rect(ox + 2, oy + y, 26, 1, y < 10 ? '#8ac0f0' : '#a8d0f8');
      // skyline silhouettes
      for (const [x, h] of [[3, 7], [7, 11], [12, 6], [16, 13], [21, 8], [25, 10]]) pc.rect(ox + x, oy + 20 - h, 4, h, '#5a7aa8');
      for (const [x, y] of [[8, 12], [17, 10], [17, 14], [26, 14]]) pc.rect(ox + x, oy + y, 1, 1, '#fff4a0');
      pc.rect(ox + 14, oy + 2, 2, 18, '#c3c9dc'); // mullion
      outline(pc, ox, oy, 30, 22);
    },
  },
  {
    id: 'plant',
    w: 10,
    h: 16,
    place: 'floor',
    weight: 3,
    paint: (pc, ox, oy) => {
      pc.rect(ox + 2, oy + 10, 6, 6, '#e8e4dc');
      pc.rect(ox + 1, oy + 10, 8, 2, '#c3c9dc');
      for (const [x, y] of [[1, 2], [8, 1], [4, 0], [0, 6], [9, 6]]) pc.line(ox + 5, oy + 10, ox + x, oy + y, P.green1, 2);
      outline(pc, ox, oy, 10, 16);
    },
  },
  {
    id: 'cooler',
    w: 8,
    h: 20,
    place: 'floor',
    weight: 2,
    paint: (pc, ox, oy) => {
      pc.rect(ox + 1, oy, 6, 7, '#7ac8f0');
      pc.rect(ox + 2, oy + 1, 1, 5, '#c8ecff');
      pc.rect(ox, oy + 7, 8, 13, '#e8e4dc');
      pc.rect(ox + 2, oy + 10, 2, 2, P.blue2);
      pc.rect(ox + 4, oy + 10, 2, 2, P.red2);
      outline(pc, ox, oy, 8, 20);
    },
  },
  {
    id: 'cabinet',
    w: 12,
    h: 18,
    place: 'floor',
    weight: 2,
    paint: (pc, ox, oy) => {
      pc.rect(ox, oy, 12, 18, '#8d95b0');
      for (let i = 0; i < 3; i++) {
        pc.rect(ox + 1, oy + 1 + i * 6, 10, 5, '#a8b0c8');
        pc.rect(ox + 4, oy + 3 + i * 6, 4, 1, '#464b63');
      }
      outline(pc, ox, oy, 12, 18);
    },
  },
  {
    id: 'board',
    w: 26,
    h: 15,
    place: 'wall',
    weight: 2,
    paint: (pc, ox, oy) => {
      pc.rect(ox, oy, 26, 15, '#a8b0c8');
      pc.rect(ox + 1, oy + 1, 24, 13, '#f4f1ea');
      pc.line(ox + 3, oy + 11, ox + 9, oy + 6, P.blue1);
      pc.line(ox + 9, oy + 6, ox + 14, oy + 9, P.blue1);
      pc.line(ox + 14, oy + 9, ox + 21, oy + 3, P.blue1);
      pc.rect(ox + 16, oy + 10, 6, 1, P.red1);
      outline(pc, ox, oy, 26, 15);
    },
  },
  {
    id: 'clock',
    w: 9,
    h: 9,
    place: 'wall',
    weight: 1,
    paint: (pc, ox, oy) => {
      pc.circle(ox + 4, oy + 4, 4, '#e8e4dc');
      pc.rect(ox + 4, oy + 1, 1, 4, INK);
      pc.rect(ox + 4, oy + 4, 3, 1, INK);
      outline(pc, ox, oy, 9, 9);
    },
  },
  {
    id: 'light',
    w: 20,
    h: 4,
    place: 'ceiling',
    weight: 4,
    glow: { x: 10, y: 10, r: 26, color: '#e8f4ff', alpha: 0.13, flicker: true },
    paint: (pc, ox, oy) => {
      pc.rect(ox, oy, 20, 2, '#8d95b0');
      pc.rect(ox + 1, oy + 2, 18, 2, '#f4fbff');
      outline(pc, ox, oy, 20, 4);
    },
  },
];

const lab: DecorDef[] = [
  {
    id: 'monitor',
    w: 20,
    h: 14,
    place: 'wall',
    weight: 3,
    frames: 2,
    period: 0.5,
    glow: { x: 10, y: 6, r: 18, color: '#3ac85a', alpha: 0.12 },
    paint: (pc, ox, oy, f) => {
      pc.rect(ox, oy, 20, 13, '#2a3438');
      pc.rect(ox + 2, oy + 2, 16, 9, '#0a1e14');
      for (let x = 0; x < 15; x++) pc.set(ox + 3 + x, oy + 6 + Math.round(Math.sin(x * 0.9 + f) * 2), '#3ac85a');
      if (f) pc.rect(ox + 15, oy + 9, 2, 1, '#7af0a0');
      pc.rect(ox + 8, oy + 13, 4, 1, '#2a3438');
      outline(pc, ox, oy, 20, 14);
    },
  },
  {
    id: 'tube',
    w: 12,
    h: 30,
    place: 'floor',
    weight: 3,
    frames: 2,
    period: 0.45,
    glow: { x: 6, y: 14, r: 20, color: '#5af08a', alpha: 0.16, flicker: true },
    paint: (pc, ox, oy, f) => {
      pc.rect(ox, oy, 12, 3, P.steel1);
      pc.rect(ox, oy + 26, 12, 4, P.steel1);
      pc.rect(ox + 1, oy + 3, 10, 23, '#1e6a4a');
      pc.rect(ox + 2, oy + 3, 2, 23, '#4ac888');
      // something floating in there
      pc.rect(ox + 5, oy + 10, 3, 7, '#2a4a3a');
      pc.circle(ox + 6, oy + 9, 2, '#2a4a3a');
      for (let i = 0; i < 3; i++) pc.set(ox + 4 + i * 2, oy + 22 - ((i * 5 + f * 4) % 16), '#c8ffe0');
      outline(pc, ox, oy, 12, 30);
    },
  },
  {
    id: 'panel',
    w: 14,
    h: 18,
    place: 'wall',
    weight: 3,
    frames: 2,
    period: 0.4,
    paint: (pc, ox, oy, f) => {
      pc.rect(ox, oy, 14, 18, '#34403e');
      pc.rect(ox + 1, oy + 1, 12, 1, '#4a5a58');
      for (let y = 0; y < 3; y++)
        for (let x = 0; x < 3; x++) {
          const on = (x * 3 + y + f * 2) % 4 !== 0;
          pc.rect(ox + 2 + x * 4, oy + 3 + y * 4, 2, 2, on ? (y === 0 ? '#ff5a4a' : '#3ac85a') : '#1a2422');
        }
      pc.rect(ox + 2, oy + 15, 10, 1, '#2ab8a8');
      outline(pc, ox, oy, 14, 18);
    },
  },
  {
    id: 'server',
    w: 12,
    h: 28,
    place: 'floor',
    weight: 2,
    frames: 2,
    period: 0.3,
    paint: (pc, ox, oy, f) => {
      pc.rect(ox, oy, 12, 28, '#22282c');
      for (let y = 2; y < 26; y += 4) {
        pc.rect(ox + 1, oy + y, 10, 3, '#34403e');
        pc.rect(ox + 2, oy + y + 1, 1, 1, ((y + f * 4) / 4) % 2 ? '#3ac85a' : '#1a4a2a');
        pc.rect(ox + 4, oy + y + 1, 1, 1, ((y / 4 + f) % 3) === 0 ? '#4ab8ff' : '#1a2a3a');
      }
      outline(pc, ox, oy, 12, 28);
    },
  },
  {
    id: 'bio',
    w: 11,
    h: 11,
    place: 'wall',
    weight: 2,
    paint: (pc, ox, oy) => {
      pc.rect(ox, oy, 11, 11, P.yellow);
      pc.circle(ox + 5, oy + 5, 3, INK);
      pc.circle(ox + 5, oy + 5, 1, P.yellow);
      pc.rect(ox + 5, oy + 1, 1, 2, INK);
      outline(pc, ox, oy, 11, 11);
    },
  },
  {
    id: 'cables',
    w: 24,
    h: 9,
    place: 'ceiling',
    weight: 2,
    paint: (pc, ox, oy) => {
      for (let x = 0; x < 24; x++) {
        pc.set(ox + x, oy + Math.round(Math.sin((x / 23) * Math.PI) * 6), '#1a1e22');
        pc.set(ox + x, oy + 1 + Math.round(Math.sin((x / 23) * Math.PI) * 7), '#a82a2a');
        pc.set(ox + x, oy + Math.round(Math.sin((x / 23) * Math.PI) * 4), '#2a4ab8');
      }
    },
  },
];

const arena: DecorDef[] = [
  {
    id: 'shelf',
    w: 24,
    h: 28,
    place: 'floor',
    weight: 3,
    paint: (pc, ox, oy) => {
      pc.rect(ox, oy, 2, 28, '#3a5a8a');
      pc.rect(ox + 22, oy, 2, 28, '#3a5a8a');
      for (const y of [0, 9, 18, 26]) pc.rect(ox, oy + y, 24, 2, '#c87a2a');
      pc.rect(ox + 3, oy + 3, 7, 6, '#7a5a3a');
      pc.rect(ox + 12, oy + 4, 6, 5, '#8a6a42');
      pc.rect(ox + 4, oy + 12, 14, 6, '#6e5034');
      pc.rect(ox + 5, oy + 21, 6, 5, '#7a5a3a');
      outline(pc, ox, oy, 24, 28);
    },
  },
  {
    id: 'target',
    w: 14,
    h: 14,
    place: 'wall',
    weight: 1,
    paint: (pc, ox, oy) => {
      pc.circle(ox + 7, oy + 7, 6, P.white);
      pc.circle(ox + 7, oy + 7, 4, P.red1);
      pc.circle(ox + 7, oy + 7, 2, P.white);
      pc.rect(ox + 7, oy + 7, 1, 1, P.red1);
      outline(pc, ox, oy, 14, 14);
    },
  },
  {
    id: 'lamp',
    w: 12,
    h: 10,
    place: 'ceiling',
    weight: 3,
    glow: { x: 6, y: 14, r: 26, color: '#fff0c8', alpha: 0.13 },
    paint: hangingLamp('#3a3a48', '#fff4a0'),
  },
  {
    id: 'bag',
    w: 8,
    h: 24,
    place: 'ceiling',
    weight: 1,
    paint: (pc, ox, oy) => {
      pc.rect(ox + 3, oy, 2, 6, P.steel1);
      pc.rect(ox + 1, oy + 6, 6, 18, '#8a2a22');
      pc.rect(ox + 2, oy + 7, 1, 15, '#b8483a');
      pc.rect(ox + 1, oy + 10, 6, 1, '#5a1a16');
      outline(pc, ox, oy, 8, 24);
    },
  },
  { id: 'boxes', w: 16, h: 12, place: 'floor', weight: 3, paint: crateStack },
  {
    id: 'stripes',
    w: 32,
    h: 6,
    place: 'wall',
    weight: 1,
    paint: (pc, ox, oy) => {
      for (let x = 0; x < 32; x++) for (let y = 0; y < 6; y++) pc.set(ox + x, oy + y, ((x + y) >> 2) % 2 ? P.yellow : '#2a2420');
      outline(pc, ox, oy, 32, 6);
    },
  },
];

const mine: DecorDef[] = [
  {
    id: 'lantern',
    w: 7,
    h: 10,
    place: 'wall',
    weight: 4,
    glow: { x: 3, y: 6, r: 26, color: '#ffb050', alpha: 0.2, flicker: true },
    paint: (pc, ox, oy) => {
      pc.rect(ox + 3, oy, 1, 2, P.steel1);
      pc.rect(ox + 1, oy + 2, 5, 1, P.steel1);
      pc.rect(ox + 1, oy + 3, 5, 6, '#ffd070');
      pc.rect(ox + 2, oy + 4, 3, 4, '#fff4c0');
      pc.rect(ox, oy + 9, 7, 1, P.steel0);
      outline(pc, ox, oy, 7, 10);
    },
  },
  {
    id: 'support',
    w: 30,
    h: 32,
    place: 'floor',
    weight: 2,
    paint: (pc, ox, oy) => {
      pc.rect(ox + 2, oy + 2, 4, 30, '#5a3a22');
      pc.rect(ox + 24, oy + 2, 4, 30, '#5a3a22');
      pc.rect(ox, oy, 30, 4, '#6e4a2c');
      pc.rect(ox + 3, oy + 2, 1, 30, '#7a5434');
      pc.line(ox + 6, oy + 4, ox + 12, oy + 10, '#4a2e1a', 2);
      pc.line(ox + 24, oy + 4, ox + 18, oy + 10, '#4a2e1a', 2);
      outline(pc, ox, oy, 30, 32);
    },
  },
  {
    id: 'ore',
    w: 12,
    h: 9,
    place: 'wall',
    weight: 3,
    glow: { x: 6, y: 5, r: 12, color: '#5af0e0', alpha: 0.16 },
    paint: (pc, ox, oy) => {
      for (const [x, h] of [[1, 5], [4, 8], [7, 6], [9, 4]]) {
        pc.rect(ox + x, oy + 9 - h, 2, h, '#3ac8c0');
        pc.rect(ox + x, oy + 9 - h, 1, h, '#a8fff0');
      }
      outline(pc, ox, oy, 12, 9);
    },
  },
  {
    id: 'tools',
    w: 13,
    h: 13,
    place: 'wall',
    weight: 2,
    paint: (pc, ox, oy) => {
      pc.line(ox + 1, oy + 12, ox + 11, oy + 2, '#8a6a42', 2);
      pc.rect(ox + 8, oy, 5, 2, P.steel2); // pick head
      pc.line(ox + 11, oy + 12, ox + 2, oy + 3, '#6e4a2c', 2);
      pc.rect(ox, oy + 1, 4, 4, P.steel1); // shovel blade
      outline(pc, ox, oy, 13, 13);
    },
  },
  { id: 'barrel', w: 10, h: 12, place: 'floor', weight: 2, paint: barrel },
];

const ship: DecorDef[] = [
  {
    id: 'porthole',
    w: 14,
    h: 14,
    place: 'wall',
    weight: 4,
    frames: 2,
    period: 1.2,
    glow: { x: 7, y: 7, r: 16, color: '#7ac8ff', alpha: 0.13 },
    paint: (pc, ox, oy, f) => {
      pc.circle(ox + 7, oy + 7, 6, '#c89040');
      pc.circle(ox + 7, oy + 7, 4, '#5aa0e0');
      pc.rect(ox + 3, oy + 8 + f, 9, 3 - f, '#2f6ab8'); // sea
      pc.rect(ox + 5, oy + 5, 2, 1, '#c8ecff');
      for (const [x, y] of [[7, 1], [13, 7], [7, 13], [1, 7]]) pc.set(ox + x, oy + y, '#f8d070');
      outline(pc, ox, oy, 14, 14);
    },
  },
  {
    id: 'rope',
    w: 12,
    h: 12,
    place: 'wall',
    weight: 2,
    paint: (pc, ox, oy) => {
      pc.circle(ox + 6, oy + 6, 5, '#c8a060');
      pc.circle(ox + 6, oy + 6, 3, '#8a6a3a');
      pc.circle(ox + 6, oy + 6, 1, '#c8a060');
      pc.rect(ox + 5, oy, 2, 2, P.steel1);
      outline(pc, ox, oy, 12, 12);
    },
  },
  {
    id: 'barrels',
    w: 20,
    h: 12,
    place: 'floor',
    weight: 3,
    paint: (pc, ox, oy) => {
      barrel(pc, ox, oy, 0);
      barrel(pc, ox + 10, oy, 0);
    },
  },
  {
    id: 'lantern',
    w: 8,
    h: 14,
    place: 'ceiling',
    weight: 3,
    glow: { x: 4, y: 10, r: 24, color: '#ffb860', alpha: 0.18, flicker: true },
    paint: (pc, ox, oy) => {
      pc.rect(ox + 3, oy, 2, 5, '#3a2a1a');
      pc.rect(ox + 1, oy + 5, 6, 1, P.brass);
      pc.rect(ox + 1, oy + 6, 6, 6, '#ffd070');
      pc.rect(ox + 3, oy + 7, 2, 4, '#fff4c0');
      pc.rect(ox + 1, oy + 12, 6, 2, P.brass);
      outline(pc, ox, oy, 8, 14);
    },
  },
  {
    id: 'wheel',
    w: 16,
    h: 16,
    place: 'wall',
    weight: 1,
    paint: (pc, ox, oy) => {
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2;
        pc.line(ox + 8, oy + 8, ox + 8 + Math.round(Math.cos(ang) * 7), oy + 8 + Math.round(Math.sin(ang) * 7), '#7a5434');
      }
      pc.circle(ox + 8, oy + 8, 4, '#94603a');
      pc.circle(ox + 8, oy + 8, 3, '#3e2a1c');
      pc.circle(ox + 8, oy + 8, 1, P.brass);
      outline(pc, ox, oy, 16, 16);
    },
  },
  {
    id: 'map',
    w: 16,
    h: 12,
    place: 'wall',
    weight: 1,
    paint: (pc, ox, oy) => {
      pc.rect(ox, oy, 16, 12, '#e8d8a8');
      pc.rect(ox, oy, 16, 1, '#c8b080');
      pc.line(ox + 2, oy + 9, ox + 7, oy + 5, '#8a6a3a');
      pc.line(ox + 7, oy + 5, ox + 12, oy + 7, '#8a6a3a');
      pc.rect(ox + 11, oy + 6, 3, 1, P.red1);
      pc.rect(ox + 12, oy + 5, 1, 3, P.red1);
      outline(pc, ox, oy, 16, 12);
    },
  },
];

const train: DecorDef[] = [
  {
    id: 'rack',
    w: 28,
    h: 10,
    place: 'wall',
    weight: 3,
    paint: (pc, ox, oy) => {
      pc.rect(ox, oy + 7, 28, 2, P.steel2);
      pc.rect(ox + 1, oy + 9, 1, 1, P.steel1);
      pc.rect(ox + 26, oy + 9, 1, 1, P.steel1);
      pc.rect(ox + 2, oy + 1, 9, 6, '#7a3a2a');
      pc.rect(ox + 5, oy, 3, 1, '#4a2a1a');
      pc.rect(ox + 13, oy + 2, 11, 5, '#3a4a6a');
      outline(pc, ox, oy, 28, 10);
    },
  },
  {
    id: 'poster',
    w: 12,
    h: 16,
    place: 'wall',
    weight: 2,
    paint: (pc, ox, oy) => {
      pc.rect(ox, oy, 12, 16, '#f0d8a0');
      pc.rect(ox + 1, oy + 1, 10, 9, '#f07a2a');
      pc.circle(ox + 6, oy + 6, 2, '#fff4a0');
      pc.rect(ox + 1, oy + 8, 10, 2, '#4a2a7a');
      pc.rect(ox + 2, oy + 12, 8, 1, '#4a2a1a');
      outline(pc, ox, oy, 12, 16);
    },
  },
  {
    id: 'dome',
    w: 10,
    h: 4,
    place: 'ceiling',
    weight: 3,
    glow: { x: 5, y: 8, r: 20, color: '#fff0c8', alpha: 0.14, flicker: true },
    paint: (pc, ox, oy) => {
      pc.rect(ox, oy, 10, 1, P.steel1);
      pc.rect(ox + 1, oy + 1, 8, 2, '#fff4c0');
      pc.rect(ox + 3, oy + 3, 4, 1, '#fff4c0');
      outline(pc, ox, oy, 10, 4);
    },
  },
];

const leaf: DecorDef[] = [
  {
    id: 'scroll',
    w: 9,
    h: 18,
    place: 'wall',
    weight: 2,
    paint: (pc, ox, oy) => {
      pc.rect(ox, oy, 9, 2, '#6e4228');
      pc.rect(ox + 1, oy + 2, 7, 14, '#f0e0c0');
      for (let y = 4; y < 14; y += 3) pc.rect(ox + 3, oy + y, 3, 2, '#2a1e14');
      pc.rect(ox, oy + 16, 9, 2, '#6e4228');
      outline(pc, ox, oy, 9, 18);
    },
  },
  {
    id: 'paperLantern',
    w: 8,
    h: 13,
    place: 'ceiling',
    weight: 3,
    glow: { x: 4, y: 8, r: 22, color: '#ff7a4a', alpha: 0.18, flicker: true },
    paint: (pc, ox, oy) => {
      pc.rect(ox + 3, oy, 2, 3, '#2a1e14');
      pc.rect(ox + 1, oy + 3, 6, 9, '#e8483a');
      pc.rect(ox, oy + 5, 8, 5, '#e8483a');
      pc.rect(ox + 2, oy + 4, 1, 7, '#ff8a6a');
      pc.rect(ox + 1, oy + 12, 6, 1, '#2a1e14');
      outline(pc, ox, oy, 8, 13);
    },
  },
  {
    id: 'pot',
    w: 10,
    h: 10,
    place: 'floor',
    weight: 2,
    paint: (pc, ox, oy) => {
      pc.rect(ox + 1, oy + 2, 8, 8, '#a8603a');
      pc.rect(ox, oy + 4, 10, 4, '#a8603a');
      pc.rect(ox + 2, oy, 6, 2, '#8a4a2a');
      pc.rect(ox + 2, oy + 4, 2, 4, '#c8805a');
      outline(pc, ox, oy, 10, 10);
    },
  },
];

const alien: DecorDef[] = [
  {
    id: 'crystals',
    w: 14,
    h: 12,
    place: 'floor',
    weight: 3,
    glow: { x: 7, y: 6, r: 16, color: '#b07aff', alpha: 0.18, flicker: true },
    paint: (pc, ox, oy) => {
      for (const [x, h, c] of [[1, 6, '#7a4ab8'], [4, 11, '#9a6ae0'], [8, 8, '#7a4ab8'], [11, 5, '#2ab8a8']] as const) {
        pc.rect(ox + x, oy + 12 - h, 3, h, c);
        pc.rect(ox + x, oy + 12 - h, 1, h, shade(c, 0.4));
      }
      outline(pc, ox, oy, 14, 12);
    },
  },
  {
    id: 'glyph',
    w: 12,
    h: 12,
    place: 'wall',
    weight: 2,
    frames: 2,
    period: 0.8,
    glow: { x: 6, y: 6, r: 14, color: '#2af0d0', alpha: 0.14, flicker: true },
    paint: (pc, ox, oy, f) => {
      const c = f ? '#5af0d0' : '#2ab8a8';
      pc.circle(ox + 6, oy + 6, 5, '#1a1030');
      pc.rect(ox + 3, oy + 5, 6, 1, c);
      pc.rect(ox + 5, oy + 2, 1, 8, c);
      pc.rect(ox + 7, oy + 3, 1, 2, c);
      pc.rect(ox + 3, oy + 8, 2, 1, c);
      outline(pc, ox, oy, 12, 12);
    },
  },
];

const rooftops: DecorDef[] = [
  {
    id: 'window',
    w: 10,
    h: 12,
    place: 'face',
    weight: 6,
    frames: 2,
    period: 4.5,
    paint: (pc, ox, oy, f) => {
      pc.rect(ox, oy, 10, 12, '#2a1a22');
      const lit = f === 0;
      pc.rect(ox + 1, oy + 1, 8, 10, lit ? '#f8c860' : '#1e2238');
      if (lit) pc.rect(ox + 1, oy + 1, 8, 3, '#fff0a0');
      pc.rect(ox + 5, oy + 1, 1, 10, '#2a1a22');
      pc.rect(ox, oy + 11, 10, 1, '#4a3a42');
    },
  },
  {
    id: 'ac',
    w: 16,
    h: 11,
    place: 'outdoor',
    weight: 3,
    paint: (pc, ox, oy) => {
      pc.rect(ox, oy, 16, 11, '#8d95b0');
      pc.rect(ox + 1, oy + 1, 14, 1, '#c3c9dc');
      pc.circle(ox + 5, oy + 6, 3, '#464b63');
      for (let x = 10; x < 15; x += 2) pc.rect(ox + x, oy + 3, 1, 6, '#646b87');
      outline(pc, ox, oy, 16, 11);
    },
  },
  {
    id: 'antenna',
    w: 9,
    h: 26,
    place: 'outdoor',
    weight: 2,
    frames: 2,
    period: 0.7,
    paint: (pc, ox, oy, f) => {
      pc.rect(ox + 4, oy + 3, 1, 23, P.steel2);
      pc.rect(ox, oy + 8, 9, 1, P.steel2);
      pc.rect(ox + 1, oy + 14, 7, 1, P.steel2);
      pc.rect(ox + 3, oy, 3, 3, f ? P.red2 : P.red0);
    },
  },
];

export const DECOR: Record<string, DecorDef[]> = {
  arena,
  factory,
  casino,
  office,
  lab,
  mine,
  ship,
  train,
  leaf,
  alien,
  rooftops,
};

export interface DecorAtlas {
  key: string;
  /** frame name for decor id + animation frame */
  frame: (id: string, f: number) => string;
}

/** Bake every decoration of a theme into one texture with named frames. */
export function bakeDecor(scene: Phaser.Scene, theme: string): DecorAtlas | null {
  const defs = DECOR[theme];
  if (!defs?.length) return null;
  const key = 'decor_' + theme;
  const frame = (id: string, f: number) => `${id}_${f}`;
  if (scene.textures.exists(key)) return { key, frame };
  const pad = 2;
  let w = 0;
  let h = 0;
  for (const d of defs) {
    w += (d.w + pad) * (d.frames ?? 1);
    h = Math.max(h, d.h);
  }
  const pc = new PixelCanvas(w, h);
  const slots: { name: string; x: number; w: number; h: number }[] = [];
  let x = 0;
  for (const d of defs) {
    for (let f = 0; f < (d.frames ?? 1); f++) {
      d.paint(pc, x, 0, f);
      slots.push({ name: frame(d.id, f), x, w: d.w, h: d.h });
      x += d.w + pad;
    }
  }
  const tex = scene.textures.addCanvas(key, pc.flush())!;
  for (const s of slots) tex.add(s.name, 0, s.x, 0, s.w, s.h);
  return { key, frame };
}
