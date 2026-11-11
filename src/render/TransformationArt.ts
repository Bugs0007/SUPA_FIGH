import type Phaser from 'phaser';
import { bake, paintRuns, Raster, type Baked } from '../art/pixelRaster';

type Graphics = Phaser.GameObjects.Graphics;
type Point = readonly [number, number];

interface Timing {
  reveal: number;
  duration: number;
  brace: number;
}

const TIMINGS: Readonly<Partial<Record<string, Timing>>> = {
  naruto: { reveal: 0.23, duration: 1.02, brace: 0.15 },
  sasuke: { reveal: 0.18, duration: 0.84, brace: 0.04 },
  luffy: { reveal: 0.26, duration: 1.08, brace: 0.21 },
  goku: { reveal: 0.25, duration: 0.94, brace: 0.18 },
  vegeta: { reveal: 0.22, duration: 0.88, brace: 0.13 },
  zoro: { reveal: 0.17, duration: 0.76, brace: 0.06 },
  sanji: { reveal: 0.16, duration: 0.83, brace: 0.11 },
  law: { reveal: 0.22, duration: 0.9, brace: 0.03 },
  ichigo: { reveal: 0.24, duration: 0.94, brace: 0.1 },
  rukia: { reveal: 0.27, duration: 1.03, brace: 0.02 },
  byakuya: { reveal: 0.25, duration: 1.08, brace: 0.025 },
  asta: { reveal: 0.19, duration: 0.89, brace: 0.16 },
  yuno: { reveal: 0.23, duration: 1.02, brace: 0.08 },
  yami: { reveal: 0.2, duration: 0.88, brace: 0.035 },
};

const FINAL_TIMINGS: Readonly<Partial<Record<string, Timing>>> = {
  naruto: { reveal: 0.5, duration: 1.56, brace: 0.16 },
  sasuke: { reveal: 0.42, duration: 1.42, brace: 0.05 },
  luffy: { reveal: 0.45, duration: 1.44, brace: 0.26 },
  goku: { reveal: 0.37, duration: 1.34, brace: 0.24 },
  vegeta: { reveal: 0.39, duration: 1.29, brace: 0.19 },
  zoro: { reveal: 0.31, duration: 1.18, brace: 0.08 },
  sanji: { reveal: 0.26, duration: 1.15, brace: 0.13 },
  law: { reveal: 0.33, duration: 1.19, brace: 0.06 },
  ichigo: { reveal: 0.35, duration: 1.27, brace: 0.14 },
  rukia: { reveal: 0.42, duration: 1.36, brace: 0.04 },
  byakuya: { reveal: 0.41, duration: 1.39, brace: 0.04 },
  asta: { reveal: 0.32, duration: 1.28, brace: 0.2 },
  yuno: { reveal: 0.38, duration: 1.32, brace: 0.09 },
  yami: { reveal: 0.32, duration: 1.2, brace: 0.06 },
};

const TAU = 2 * Math.PI;
const WHITE = 0xffffff;
const INK = 0x171422;
export const FINAL_SPIRIT_REVEAL_SCALE = { naruto: 0.66, sasuke: 0.73 } as const;
const clamp = (p: number) => Math.max(0, Math.min(1, p));
const easeOut = (p: number) => 1 - (1 - p) ** 3;

export function transformationTiming(hero: string, level: number): Timing | undefined {
  const timings = level === 4 ? FINAL_TIMINGS : TIMINGS;
  return Object.hasOwn(timings, hero) ? timings[hero] : undefined;
}

/** A grounded anticipation, one quick accent on the form swap, then a clean settle. */
export function transformationPose(timing: Timing, age: number): { before: boolean; squash: number; flash: number } {
  const before = age < timing.reveal;
  const release = Math.max(0, age - timing.reveal);
  const squash = before
    ? timing.brace * Math.sin(Math.PI * clamp(age / timing.reveal) * 0.5)
    : -timing.brace * 0.85 * Math.max(0, 1 - release / 0.21) ** 2;
  return { before, squash, flash: Math.max(0, 1 - release / 0.16) * Number(!before) };
}

function pixel(g: Graphics, x: number, y: number, w: number, h: number, color: number, a: number): void {
  g.fillStyle(color, a).fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

function trace(g: Graphics, points: readonly Point[], color: number, a: number, width = 1): void {
  g.fillStyle(color, a);
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / width));
    for (let step = 0; step <= steps; step++) {
      const p = step / steps;
      g.fillRect(Math.round(x0 + (x1 - x0) * p), Math.round(y0 + (y1 - y0) * p), width, width);
    }
  }
}

function arc(g: Graphics, x: number, y: number, rx: number, ry: number, angle: number, sweep: number, color: number, a: number, width = 1): void {
  g.fillStyle(color, a);
  const steps = Math.max(5, Math.ceil(Math.max(rx, ry) * Math.abs(sweep) / (width + 0.5)));
  for (let i = 0; i <= steps; i++) {
    const t = angle + sweep * i / steps;
    g.fillRect(Math.round(x + Math.cos(t) * rx), Math.round(y + Math.sin(t) * ry), width, width);
  }
}

function diamond(g: Graphics, x: number, y: number, rx: number, ry: number, color: number, a: number): void {
  g.fillStyle(color, a);
  for (let row = -Math.floor(ry); row <= ry; row++) {
    const w = Math.max(0, Math.round(rx * (1 - Math.abs(row) / ry)));
    g.fillRect(Math.round(x - w), Math.round(y + row), w * 2 + 1, 1);
  }
}

function cross(g: Graphics, x: number, y: number, radius: number, color: number, a: number): void {
  pixel(g, x - radius, y, radius * 2 + 1, 1, color, a);
  pixel(g, x, y - radius, 1, radius * 2 + 1, color, a);
}

function disc(g: Graphics, x: number, y: number, rx: number, ry: number, color: number, alpha: number): void {
  g.fillStyle(color, alpha);
  for (let v = -Math.floor(ry); v <= ry; v++) {
    const width = Math.round(rx * Math.sqrt(1 - (v / ry) ** 2));
    g.fillRect(Math.round(x - width), Math.round(y + v), width * 2 + 1, 1);
  }
}

const SASH_ANCHOR = [31, 18] as const;
const SASH_CURVE = [
  [-14, -4, 0.7], [-12, -6, 1], [-13, -9, 1.5], [-17, -9, 1.9], [-19, -6, 2.15],
  [-18, -3, 2.4], [-15, 0, 2.55], [-9, 2, 2.35], [-4, 3, 2.1], [2, 3, 2.2],
  [7, 1, 2.25], [10, -2, 2], [11, -5, 1.65], [9, -7, 1.35], [6, -6, 1.05], [6, -4, 0.65],
] as const;
const sashFrames = new Map<number, Baked>();

function gearFiveSash(phase: number, wind: number, climb: number): Baked {
  const key = phase + (wind + (climb + 1) * 3) * 8;
  const cached = sashFrames.get(key);
  if (cached) return cached;
  const r = new Raster(49, 27);
  const turn = phase * TAU / 8;
  const curve = SASH_CURVE.map(([x, y, radius]) => {
    const tail = Math.max(0, -x / 19);
    const flutter = Math.sin(turn + x * 0.31);
    return [SASH_ANCHOR[0] + x - tail * wind * 3, SASH_ANCHOR[1] + y + tail * climb * 3 + flutter * (0.4 + tail), radius];
  });
  for (let i = 1; i < curve.length; i++) {
    const [x0, y0, r0] = curve[i - 1];
    const [x1, y1, r1] = curve[i];
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5));
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const radius = r0 + (r1 - r0) * t;
      r.ellipse(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, radius, radius * 0.86, 1);
    }
  }
  const sprite = bake(r, [{ dark: 0xa8a0bc, base: 0xded8eb, light: 0xf6f2fd, hi: 0xfffdff }], 0x5e5576);
  sashFrames.set(key, sprite);
  return sprite;
}

/** Two tapering curls share a narrow sash that stretches along Luffy's path. */
export function drawGearFiveCloud(g: Graphics, x: number, y: number, facing: number, time: number, vx: number, vy: number): void {
  const wind = Math.min(2, Math.floor(Math.abs(vx) / 72));
  const climb = vy < -46 ? 1 : vy > 55 ? -1 : 0;
  const frame = gearFiveSash(Math.floor(time * 12) % 8, wind, climb);
  paintRuns(g, frame, Math.round(x) - SASH_ANCHOR[0] * facing, Math.round(y) - SASH_ANCHOR[1], facing < 0);
}

export interface TransformationCue {
  age: number;
  level: number;
  primary: number;
  highlight: number;
}

/** Each final form holds a readable silhouette before its energy breaks away. */
function drawFinalForm(
  back: Graphics, front: Graphics, hero: string, cue: TransformationCue,
  x: number, feet: number, facing: number, flying: boolean, charge: number, release: number,
): void {
  const { age, primary, highlight } = cue;
  const rise = easeOut(clamp(release * 2.7));
  const fade = 1 - clamp((release - 0.31) / 0.69);
  const anticipation = clamp(age * 17);
  const y = feet - 15;
  switch (hero) {
    case 'luffy': {
      const beat = (center: number, width: number) => Math.max(0, 1 - Math.abs(charge - center) / width) ** 2;
      const pulse = beat(0.3, 0.25) + beat(0.75, 0.25);
      if (release <= 0) {
        const line = 14 + pulse * 15;
        trace(front, [[x - line, y], [x - 8, y], [x - 3, y - 9 * pulse],
          [x + 2, y + 9 * pulse], [x + 7, y], [x + line, y]], 0xfff0f6, pulse * 0.9, 2);
        arc(back, x, y, 12 + pulse * 13, 9 + pulse * 9, 0, TAU, 0xedaad6, pulse * 0.65, 2);
      } else {
        const opening = 1 - release;
        for (let i = 0; i < 8; i++) {
          const theta = TAU * i / 8 + age * 1.7;
          const rx = 14 + 40 * release;
          const sx = x + Math.cos(theta) * rx;
          const sy = y + Math.sin(theta) * rx * 0.52 - release * 16;
          disc(back, sx, sy + 1, 2 + i % 3, 1 + i % 2, 0xb4a9ca, opening * 0.8);
          disc(back, sx, sy - 1, 2 + i % 3, 1 + i % 2, WHITE, opening * 0.86);
        }
      }
      break;
    }
    case 'goku': {
      const force = anticipation * (0.28 + charge * 0.44 + rise * 0.28) * fade;
      const width = 9 + charge * 9 + rise * 13;
      const height = 17 + charge * 18 + rise * 64;
      for (let i = -5; i <= 5; i++) {
        const lane = i / 5;
        const jitter = Math.sin(age * 45 + i * 2.15) * (2 + rise * 7);
        const top = height * (1 - Math.abs(lane) * 0.39) + jitter;
        const tip = x + lane * width * 1.62 + jitter * 0.6;
        trace(back, [[x + lane * width, feet], [x + lane * width * 0.74, feet - top * 0.38],
          [x + lane * width * 1.08, feet - top * 0.73], [tip, feet - top]], primary, force * 0.85, 5);
        trace(back, [[x + lane * width, feet - 3], [x + lane * width * 0.74, feet - top * 0.38],
          [x + lane * width * 1.08, feet - top * 0.73]], highlight, force * 0.94, 2);
      }
      if (release > 0) for (let i = 0; i < 3; i++) {
        const ring = clamp(release * 2 - i * 0.18);
        if (ring <= 0 || ring >= 1) continue;
        arc(back, x, feet - 1 - i * 8, 18 + ring * 86, 3 + ring * 12, 0, TAU, highlight, (1 - ring) * 0.86, 2);
      }
      break;
    }
    case 'vegeta': {
      // Ki is held under pressure, then sheds the levitating chunks of ground all at once.
      const reach = 49 - charge * 29 + rise * 20;
      for (const side of [-1, 1]) {
        for (let i = 0; i < 7; i++) {
          const throwOut = release * release * (29 + i * 7);
          const sx = x + side * (11 + i * 7 + throwOut);
          const sy = feet - (5 + charge * (8 + (i * 9) % 39) + rise * (5 + i % 3 * 7)) + release ** 3 * 25;
          diamond(back, sx, sy, 2 + i % 3, 2 + (i + 1) % 4, 0x42394c, fade * anticipation);
          pixel(back, sx - side, sy - i % 3, 2 + i % 2, 1, highlight, fade * anticipation * 0.7);
        }
        trace(back, [[x + side * reach, feet - 6], [x + side * (reach - 15), y - 8],
          [x + side * (reach - 8), y - 28], [x + side * 6, y - 34 - rise * 49]], primary, fade * anticipation, 5);
        trace(front, [[x + side * (11 + rise * 64), feet - 2], [x + side * (6 + rise * 42), feet - 5],
          [x + side * (12 + rise * 22), y - 5]], highlight, fade * rise, 2);
      }
      break;
    }
    case 'zoro': {
      // Three Asura silhouettes, then nine crossing blades.
      const apparition = anticipation * charge * fade;
      for (const side of [-1, 1]) {
        const sx = x + side * (8 + rise * 16);
        const sy = y - 10 - rise * 9;
        disc(back, sx, sy, 5 + rise * 2, 7 + rise * 2, 0x4b224b, apparition * 0.96);
        trace(back, [[sx - 4, sy + 3], [sx - 9, y + 3], [sx - 9, feet - 4],
          [sx + 9, feet - 4], [sx + 9, y + 3], [sx + 4, sy + 3]], primary, apparition * 0.7, 3);
        pixel(back, sx - 3, sy - 2, 6, 1, highlight, apparition);
      }
      for (let i = 0; i < 9; i++) {
        const releaseBlade = clamp(release * 2.7 - i * 0.05);
        if (releaseBlade <= 0 || releaseBlade >= 1) continue;
        const angle = (i - 4) * 0.24;
        const length = 23 + releaseBlade * 57;
        const slashAlpha = (1 - releaseBlade) * 0.95;
        trace(i % 3 === 1 ? front : back, [[x - Math.cos(angle) * length * facing, y - Math.sin(angle) * length],
          [x + Math.cos(angle) * length * facing, y + Math.sin(angle) * length]], i % 2 ? primary : highlight, slashAlpha, i % 3 === 1 ? 2 : 3);
      }
      break;
    }
    case 'sanji': {
      const pivot = x + facing * 7;
      const blue = 0x73d7ff;
      const height = 11 + charge * 7 + rise * 53;
      for (let i = 0; i < 20; i++) {
        const phase = i / 19;
        const theta = age * 19 + phase * 9;
        const rx = (5 + rise * 21) * (1 - phase * 0.62);
        const sx = pivot + Math.cos(theta) * rx;
        const sy = feet - phase * height;
        const layer = Math.sin(theta) > 0.47 && phase < 0.45 ? front : back;
        trace(layer, [[sx, sy], [sx - facing * (3 + rise * 4), sy - 3], [sx - facing * 2, sy - 9]],
          i % 3 ? blue : WHITE, fade * anticipation * 0.88, i % 3 ? 3 : 1);
      }
      if (release > 0) arc(front, pivot, feet, 9 + rise * 43, 2 + rise * 7, age * 6, Math.PI * 1.55, blue, fade, 2);
      break;
    }
    case 'law': {
      const radius = 7 + charge * 16 + rise * 55;
      const weight = fade * anticipation;
      arc(back, x, feet, radius, radius * 0.83, Math.PI, Math.PI, primary, weight * 0.95, 3);
      arc(back, x, feet, radius - 3, radius * 0.79, Math.PI, Math.PI, highlight, weight * 0.63);
      arc(front, x, feet, radius, radius * 0.27, 0, TAU, highlight, weight * 0.62);
      for (let i = 1; i <= 4; i++) {
        const fraction = i / 5;
        const scan = 0.4 + rise * 0.6;
        arc(back, x, feet - fraction * radius * 0.73, Math.max(3, radius * (1 - fraction ** 2) * scan),
          radius * 0.15, age * 3 + i, Math.PI * 1.45, primary, weight * 0.5);
      }
      if (release > 0) trace(front, [[x - facing * radius, y + 13], [x + facing * radius * 0.81, y - radius * 0.58]],
        highlight, Math.max(0, 1 - release * 3.4), 3);
      break;
    }
    case 'ichigo': {
      // A jagged Hollow silhouette closes around him before the crescent cuts it in two.
      const split = (1 - charge) * 20 + rise * 25;
      for (const side of [-1, 1]) {
        const sx = x + side * (7 + split);
        const sy = y - 23 - rise * 11;
        const mask = anticipation * fade * 0.93;
        trace(back, [[sx + side * 6, sy + 5], [sx + side * 12, sy - 11], [sx + side * 13, sy - 22],
          [sx + side * 5, sy - 11], [sx, sy - 5], [sx - side * 2, sy + 10], [sx + side * 5, sy + 19]], 0xf7e5db, mask, 4);
        trace(back, [[sx + side * 4, sy - 5], [sx + side * 1, sy + 3], [sx + side * 5, sy + 7]], 0xb02549, mask, 3);
        pixel(back, sx - 2, sy + 6, 5, 2, 0xfbb34f, mask);
      }
      if (release > 0) {
        const r = 19 + rise * 49;
        arc(back, x - facing * 15, y, r, r * 0.72, -2.25 + release * 2, 2.65, INK, fade, 6);
        arc(front, x - facing * 15, y, r + 3, r * 0.74, -2.22 + release * 2, 2.62, 0xeb4667, fade * 0.9, 2);
      }
      break;
    }
    case 'rukia': {
      const ice = 0xaadfff;
      const bloom = 0.36 * charge + 0.64 * rise;
      for (let i = -6; i <= 6; i++) {
        const v = i / 6;
        const tip = x + v * (19 + bloom * 51);
        const root = x + v * (8 + bloom * 12);
        const top = feet - (11 + bloom * 58) * (1 - Math.abs(v) * 0.68);
        trace(back, [[root, feet], [root + v * 8, top + 14], [tip, top], [tip + v * 7, top + 10],
          [root + v * 11, feet]], ice, anticipation * fade * 0.75, 3);
        trace(back, [[tip, top], [root + v * 3, top + 18]], WHITE, anticipation * fade, 2);
      }
      arc(front, x, feet - 1, 8 + 74 * bloom, 2 + 14 * bloom, 0, TAU, WHITE, anticipation * fade, 2);
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4;
        const r = 13 + rise * 28;
        trace(back, [[x + Math.cos(angle) * 7, y - 19 + Math.sin(angle) * 7],
          [x + Math.cos(angle) * r, y - 19 + Math.sin(angle) * r]], WHITE, anticipation * fade * 0.64, 2);
      }
      break;
    }
    case 'byakuya': {
      const r = 13 + charge * 9 + rise * 45;
      for (let i = 0; i < 75; i++) {
        const theta = i * 2.399 + age * 5.5;
        const lobe = (i % 5) / 4;
        const sx = x + Math.cos(theta) * r * (0.47 + lobe * 0.6);
        const sy = y + Math.sin(theta) * r * 0.54 - (i % 11) * (0.5 + rise * 3.1);
        diamond(i % 7 === 0 ? front : back, sx, sy, 1 + i % 3 * 0.5, 1 + i % 2, i % 3 ? primary : highlight,
          fade * anticipation * (0.67 + lobe * 0.33));
      }
      for (const side of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const sx = x + side * (11 + rise * (18 + i * 7));
          trace(back, [[x + side * 3, y + 6], [sx, y - 8 - i * 6], [sx + side * (9 + rise * 16), y - 17 - i * 8]],
            highlight, fade * rise * 0.74, 2);
        }
      }
      break;
    }
    case 'asta': {
      const wing = (charge * 0.29 + rise * 0.71) * 48;
      for (const side of flying ? [-facing] : [-1, 1]) {
        const edge = x + side * (11 + wing);
        trace(back, [[x + side * 2, y + 4], [x + side * (7 + wing * 0.38), y - wing * 0.72],
          [edge, y - wing - 8], [edge - side * (6 + wing * 0.21), y - wing * 0.35],
          [edge - side * 8, y + 6], [x + side * 4, feet - 3]], 0x302339, fade * anticipation, 5);
        trace(back, [[x + side * 3, y + 3], [x + side * (7 + wing * 0.38), y - wing * 0.72],
          [edge, y - wing - 8]], primary, fade * anticipation, 2);
      }
      if (release > 0) {
        const reach = 23 + rise * 57;
        trace(front, [[x - facing * reach, feet + 4], [x - facing * 13, y + 5],
          [x + facing * reach, y - 21]], 0x211723, fade, 7);
        trace(front, [[x - facing * reach, feet + 1], [x - facing * 13, y + 2],
          [x + facing * reach, y - 24]], highlight, fade * (1 - release), 2);
      }
      break;
    }
    case 'yuno': {
      const radius = 8 + charge * 13 + rise * 47;
      for (let i = 0; i < 6; i++) {
        arc(back, x, feet - 6 - i * (3 + rise * 6), radius * (1 - i * 0.08), 4 + rise * 10,
          age * 11 - i * 0.62, Math.PI * 1.41, i % 2 ? primary : highlight, fade * anticipation * 0.88, i < 2 ? 2 : 1);
      }
      const stars: Point[] = [];
      for (let i = 0; i < 4; i++) {
        const theta = TAU * i / 4 + age * 2.2;
        const sx = x + Math.cos(theta) * radius;
        const sy = y - 12 + Math.sin(theta) * radius * 0.55;
        stars.push([sx, sy]);
        cross(front, sx, sy, 2 + Math.round(rise * 3), 0xffe99c, fade * anticipation);
        diamond(front, sx, sy, 2, 2, WHITE, fade * anticipation);
      }
      trace(back, [...stars, stars[0]], 0xffe99c, fade * anticipation * (0.42 + 0.32 * rise));
      break;
    }
    case 'yami': {
      const moon = 6 + charge * 14 + rise * 44;
      const rift = 14 + charge * 8 + rise * 66;
      disc(back, x, y - 7, moon, moon * 0.69, 0x130f1d, fade * anticipation * 0.96);
      arc(back, x, y - 7, moon, moon * 0.69, -1.3, Math.PI * 1.65, primary, fade * anticipation, 2);
      if (release > 0) {
        const seam: Point[] = [[x - facing * rift, y + 22], [x - facing * rift * 0.32, y + 9],
          [x + facing * 4, y - 1], [x + facing * rift * 0.52, y - 17], [x + facing * rift, y - 29]];
        trace(front, seam, INK, fade, 8);
        trace(front, seam.map(([u, v]) => [u, v + 1]), primary, fade, 3);
        trace(front, seam.map(([u, v]) => [u, v - 2]), highlight, fade * (1 - release), 1);
      }
      break;
    }
  }
}

/**
 * Each fighter has a different gathering gesture and release silhouette.
 * All moving details are sampled from the same age so online event playback uses the same sequence.
 */
export function drawTransformation(
  back: Graphics, front: Graphics, hero: string, timing: Timing, cue: TransformationCue,
  x: number, feet: number, facing: number, flying: boolean,
): void {
  const { age, level, primary, highlight } = cue;
  const charge = clamp(age / timing.reveal);
  const after = age >= timing.reveal;
  const release = clamp((age - timing.reveal) / (timing.duration - timing.reveal));
  if (level === 4) {
    drawFinalForm(back, front, hero, cue, x, feet, facing, flying, charge, release);
    return;
  }
  const spread = easeOut(release);
  const a = clamp(age / 0.07) * (1 - release) ** 1.2;
  const kick = after ? 1 - clamp(release * 2.6) : 0;
  const size = 0.84 + Math.min(4, level) * 0.14;
  const y = feet - 15;

  switch (hero) {
    case 'naruto': {
      const count = [1, 4, 6, 9][Math.min(4, level) - 1];
      const fan = 0.3 + charge * 0.7 + kick * 0.28;
      const reach = (13 + 15 * charge + 9 * spread) * size;
      for (let i = 0; i < count; i++) {
        const angle = 0.14 + (i + 0.4) / count * 2.05 * fan;
        const points: Point[] = [[x - facing * 4, feet - 6]];
        for (let step = 1; step <= 6; step++) {
          const p = step / 6;
          const wave = Math.sin(p * 5 - age * 12 + i) * p * 4;
          points.push([x - facing * (Math.cos(angle) * reach * p + 3), feet - 6 - Math.sin(angle) * reach * p + wave]);
        }
        trace(back, points, primary, a * 0.6, 3);
        trace(back, points.slice(2), highlight, a * 0.68, 1);
      }
      const seal = 9 + charge * 4 + spread * 12;
      arc(front, x, y + 2, seal, seal * 0.56, -age * 7, TAU * 0.8, highlight, a, 2);
      for (let i = 0; i < 5; i++) {
        const theta = TAU * i / 5 - age * 7;
        pixel(front, x + Math.cos(theta) * seal, y + 2 + Math.sin(theta) * seal * 0.56, 2, 3, primary, a);
      }
      break;
    }
    case 'sasuke': {
      const radius = (8 + 11 * charge + 9 * spread) * size;
      const eye = level <= 2 ? 0xf64555 : primary;
      arc(back, x, y - 3, radius, radius * 0.69, 0, TAU, eye, a * 0.92, 2);
      arc(back, x, y - 3, radius * 0.84, radius * 0.55, 0, TAU, INK, a * 0.92, 2);
      for (let i = 0; i < 3; i++) {
        const theta = TAU * i / 3 + age * (level >= 3 ? 8 : 13);
        const tx = x + Math.cos(theta) * radius * 0.7;
        const ty = y - 3 + Math.sin(theta) * radius * 0.45;
        diamond(back, tx, ty, 3, 3, eye, a);
        trace(back, [[tx, ty], [tx - Math.sin(theta) * 5, ty + Math.cos(theta) * 4]], eye, a, 2);
      }
      if (after) {
        if (level >= 3) {
          for (const side of [-1, 1]) {
            const r = 12 + spread * 11;
            for (let i = 0; i < 3; i++) {
              trace(back, [[x, feet + 3 - i * 8], [x + side * r, feet - 9 - i * 8],
                [x + side * (r - 3), feet - 20 - i * 8], [x + side * 8, feet - 30 - i * 8]], primary, a * 0.7, 2);
            }
          }
        }
        trace(front, [[x - facing * 18 * spread, y - 10], [x + facing * (14 + 19 * spread), y - 10]], highlight, a * kick, 2);
      }
      break;
    }
    case 'luffy': {
      // A two-beat pulse swells into steam.
      const pulse = Math.sin(charge * TAU * 2) * (after ? 0 : 2.5);
      for (let i = 0; i < 7; i++) {
        const t = age * 5.2 + i * TAU / 7;
        const sx = x + Math.cos(t) * (10 + pulse + spread * 18) * size;
        const sy = feet - 4 - i * (1.7 + spread * 4.4) - charge * 5 + Math.sin(t) * 4;
        const puff = 2 + (i % 3) + charge * 2 + kick * 2;
        const layer = Math.cos(t) > 0.32 && i < 4 ? front : back;
        arc(layer, sx, sy, puff * 1.35, puff * 0.8, t, Math.PI * 1.55, highlight, a * 0.78, 2);
        pixel(layer, sx - puff, sy, 2, 2, primary, a * 0.5);
      }
      const width = 19 + spread * 16;
      trace(back, [[x - width, y], [x - 10, y], [x - 6, y - 7 - pulse], [x - 2, y + 7 + pulse],
        [x + 4, y - 4], [x + 7, y], [x + width, y]], 0xe76a79, a * 0.62);
      break;
    }
    case 'goku': {
      const stem = (22 + charge * 22 + kick * 24) * size;
      for (let i = -3; i <= 3; i++) {
        const root = x + i * 5;
        const tip = root + i * (3 + spread * 4);
        const h = stem * (1 - Math.abs(i) * 0.11) + Math.sin(i * 4 + age * 32) * 7;
        trace(back, [[x + i * 3, feet], [root, feet - h * 0.6], [tip, feet - h]], primary, a * 0.76, 3);
        trace(back, [[root, feet - 3], [root + i * 2, feet - h * 0.7]], highlight, a, 1);
      }
      if (after) {
        arc(back, x, feet - 2, 8 + 35 * spread, 2 + 5 * spread, 0, TAU, highlight, a * 0.74, 2);
        if (level > 1) for (const side of [-1, 1]) {
          const sideX = x + side * (11 + spread * 10);
          trace(front, [[sideX, feet - 30], [sideX + side * 5, feet - 24], [sideX - side * 1, feet - 19],
            [sideX + side * 7, feet - 12]], highlight, a * (0.65 + Math.sin(age * 42) * 0.2));
        }
      }
      break;
    }
    case 'vegeta': {
      // Angular ki locks inward while fragments rise off the floor.
      const reach = 35 - charge * 17 + spread * 17;
      for (const side of [-1, 1]) {
        const sx = x + side * reach * size;
        trace(back, [[sx, y + 13], [sx - side * 6, y - 4], [sx + side * 1, y - 20],
          [x + side * 8, y - (24 + kick * 13) * size]], primary, a, 2);
        trace(back, [[sx, y + 8], [sx - side * 8, y + 1], [x + side * 11, y + 3]], highlight, a * 0.76, 2);
        for (let i = 0; i < 4; i++) {
          const dx = (12 + i * 5 + spread * 14) * side;
          const dy = (3 + i * 3) * charge + spread * (10 + i * 5);
          diamond(front, x + dx, feet - dy - 2, i % 2 + 1, i % 2 + 1, i < 2 ? highlight : primary, a);
        }
      }
      if (after) trace(front, [[x - spread * 43, feet - 2], [x - 8, feet - 3], [x + 6, feet - 3],
        [x + spread * 43, feet - 2]], highlight, a * kick, 2);
      break;
    }
    case 'zoro': {
      const draw = (6 + charge * 7 + spread * 25) * size;
      for (let i = 0; i < 3; i++) {
        const sy = y + 8 - i * 7;
        const offset = facing * i * 3;
        trace(i === 1 ? front : back, [[x - facing * 10 + offset, sy + 8], [x + offset, sy],
          [x + facing * draw + offset, sy - (charge * 4 + spread * 9)]], i === 1 ? highlight : primary, a * (i === 1 ? 1 : 0.72), i === 1 ? 2 : 3);
      }
      for (let i = 0; i < 6; i++) {
        const sx = x + facing * (7 + i * 3 + spread * (14 + i));
        const sy = y + (i % 3 - 1) * 6 - spread * i * 2;
        pixel(front, sx, sy, 2 + i % 2, 1, highlight, a * charge);
      }
      break;
    }
    case 'sanji': {
      const pivot = x + facing * 7;
      const h = (9 + charge * 9 + spread * 24) * size;
      for (let i = 0; i < 8; i++) {
        const t = age * 14 + i * 0.81;
        const px = pivot + Math.cos(t) * (9 + spread * 12) * (1 - i / 12);
        const py = feet - 2 - h * i / 8;
        trace(i < 3 ? front : back, [[px - facing * 3, py + 3], [px, py], [px - facing * 2, py - 6 - kick * 4]],
          i % 3 ? primary : highlight, a, i < 5 ? 2 : 1);
      }
      arc(front, pivot, feet - 3, 5 + spread * 25, 2 + spread * 6, age * 12, TAU * 0.68, highlight, a, 2);
      if (after) trace(back, [[pivot, feet - 4], [pivot + facing * 10, y + 1], [pivot + facing * (16 + spread * 17), y - 14]],
        primary, a * kick, 3);
      break;
    }
    case 'law': {
      const room = (6 + charge * 12 + spread * 24) * size;
      arc(back, x, feet - 5, room, room * 0.91, Math.PI, Math.PI, primary, a * 0.88, 2);
      arc(back, x, feet - 5, room - 2, room * 0.86, Math.PI + age * 3 % 0.8, Math.PI * 0.7, highlight, a * 0.6);
      arc(front, x, feet - 5, room, room * 0.3, 0, TAU, highlight, a * 0.7);
      const cursor = room * 0.76;
      for (const side of [-1, 1]) trace(front, [[x + side * cursor, y - 4], [x + side * cursor, y - 9],
        [x + side * (cursor - 4), y - 9]], highlight, a);
      if (after) trace(front, [[x - facing * room * 0.76, y + 8], [x + facing * room * 0.78, y - 12]], highlight, a * kick, 2);
      break;
    }
    case 'ichigo': {
      const split = (1 - charge) * 24 + spread * 18;
      if (level > 1) for (const side of [-1, 1]) {
        const mx = x + side * (5 + split);
        const my = y - 13 - spread * 7;
        diamond(back, mx, my + 3, 5, 10, level >= 3 ? 0xf4e8dd : highlight, a * 0.8);
        trace(back, [[mx - side * 2, my - 3], [mx + side * 2, my], [mx - side * 1, my + 5]], 0x9f253e, a, 2);
        if (level >= 3) trace(back, [[mx + side * 2, my - 4], [mx + side * 7, my - 12]], highlight, a * 0.85, 2);
      }
      const sweep = (13 + 9 * charge + spread * 21) * size;
      arc(back, x - facing * 5, y - 2, sweep, sweep * 0.65, -1.6 + charge, 2.2, INK, a, 3);
      arc(front, x - facing * 5, y - 2, sweep, sweep * 0.65, -1.6 + charge, 1.2 + kick, primary, a, 2);
      if (after) trace(front, [[x - facing * 18 * spread, y + 12], [x + facing * (18 + spread * 18), y - 18]], highlight, a * kick, 2);
      break;
    }
    case 'rukia': {
      const reach = (5 + charge * 12 + spread * 25) * size;
      arc(back, x, feet - 2, reach, reach * 0.26, 0, TAU, highlight, a * 0.85);
      for (let i = -3; i <= 3; i++) {
        const height = (1 + charge * 10 + kick * 18) * (1 - Math.abs(i) * 0.17) * size;
        const bx = x + i * reach / 3.3;
        const dx = i * (1 + spread * 2);
        trace(i % 2 ? front : back, [[bx, feet], [bx + dx, feet - height]], primary, a * 0.85, 3);
        trace(front, [[bx + dx, feet - height], [bx + dx - i * 0.4, feet - height + 6]], highlight, a, 1);
        if (after) diamond(back, bx + dx, feet - height - spread * 18, 1.5, 3, highlight, a * 0.7);
      }
      const snow = 5 + charge * 4 + spread * 8;
      cross(back, x, y - 13, snow, highlight, a * 0.82);
      trace(back, [[x - snow * 0.7, y - 13 - snow * 0.7], [x + snow * 0.7, y - 13 + snow * 0.7]], highlight, a * 0.72);
      trace(back, [[x + snow * 0.7, y - 13 - snow * 0.7], [x - snow * 0.7, y - 13 + snow * 0.7]], highlight, a * 0.72);
      break;
    }
    case 'byakuya': {
      for (let i = 0; i < 24; i++) {
        const t = i * 2.399 + age * (after ? 4 : 9);
        const r = (28 - 13 * charge + spread * (16 + i % 9)) * size;
        const px = x + Math.cos(t) * r;
        const py = y + Math.sin(t) * r * 0.48 - spread * (i % 6) * 5;
        const layer = i % 4 === 0 ? front : back;
        diamond(layer, px, py, 1.5 + i % 2, i % 3 ? 1 : 2, i % 3 ? primary : highlight, a * 0.94);
      }
      if (after && level >= 3) for (const side of [-1, 1]) {
        const span = (12 + spread * 20) * size;
        for (let i = 0; i < 4; i++) {
          trace(back, [[x + side * 5, y], [x + side * (span - i * 2), y - 14 + i * 4],
            [x + side * (span + 8 - i * 5), y - 26 + i * 9]], highlight, a * (0.85 - i * 0.1), 2);
        }
      }
      break;
    }
    case 'asta': {
      const lift = (8 + charge * 14 + spread * 21) * size;
      for (const side of flying ? [-facing] : [-1, 1]) {
        const sx = x + side * (5 + spread * 12);
        trace(back, [[x - side * 6, feet], [sx, y + 4], [sx + side * lift, y - 9 - lift]], INK, a * 0.94, 5);
        trace(back, [[sx + side * 3, y + 1], [sx + side * lift, y - 9 - lift]], primary, a, 2);
        if (level >= 2) trace(back, [[x + side * 3, y - 5], [x + side * (11 + lift), y - 8 - lift * 0.4],
          [x + side * (8 + lift), feet - 4]], INK, a * 0.8, 3);
      }
      if (after) {
        trace(front, [[x - facing * (8 + spread * 31), feet - 6], [x + facing * (9 + spread * 33), y - 12]], primary, a * kick, 3);
        for (let i = 0; i < 6; i++) {
          pixel(front, x + (i - 2) * 11 * spread, y + 4 - i * 3 - spread * 5, 2, 2, highlight, a);
        }
      }
      break;
    }
    case 'yuno': {
      for (let i = 0; i < 5; i++) {
        const height = i * (5 + charge * 1.3);
        const r = (10 + 5 * charge + spread * 20 - i) * size;
        arc(i > 2 ? back : front, x, feet - 3 - height - spread * 14, r, r * 0.23, age * 15 - i * 0.9,
          Math.PI * 1.18, i % 2 ? primary : highlight, a * 0.83, i < 2 ? 2 : 1);
      }
      break;
    }
    case 'yami': {
      const moon = (8 + charge * 9 + spread * 15) * size;
      diamond(back, x - facing * 5, y - 3, moon, moon * 0.8, INK, a * 0.89);
      arc(back, x - facing * 5, y - 3, moon, moon * 0.8, 1.04 + age, Math.PI * 1.4, primary, a * 0.94, 2);
      const cut = (10 + charge * 6 + spread * 32) * size;
      trace(front, [[x - facing * cut, y + 5], [x + facing * 3, y + 1], [x + facing * cut, y - 3]], INK, a, 3);
      if (after) trace(front, [[x - facing * cut, y + 4], [x + facing * 3, y], [x + facing * cut, y - 4]], highlight, a * kick, 1);
      break;
    }
  }
}
