// The show-up animation of the big spirits: a baked sprite is not drawn whole but revealed, pixel by pixel, while the
// spirit forms around the fighter (rising from the ground up, or fanning out from a point). Phaser-free, deterministic.

import type { Baked, RectPainter } from './pixelRaster';

/** deterministic noise in 0..1 for a pixel (a dither for the soft, flickering edge of the reveal) */
export function noise(x: number, y: number, seed = 0): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** the smooth ease the reveals use: quick at first, settling at the end */
export const easeOut = (t: number): number => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 2.2);

/** What shows of a pixel: nothing, a faint ghost, the pixel, or the bright construction edge of the reveal. */
export const Seen = { Hidden: 0, Ghost: 1, Full: 2, Edge: 3 } as const;
export type Seen = (typeof Seen)[keyof typeof Seen];

/**
 * Paint a baked sprite through a visibility function (sprite-pixel coordinates). The sprite's rim colour is replaced by
 * `edge` where the reveal is passing, so the front of the build-up glows. Runs are split wherever the visibility changes.
 */
export function paintReveal(g: RectPainter, baked: Baked, ox: number, oy: number, flip: boolean, alpha: number, seen: (x: number, y: number) => Seen, edge: number): void {
  let last = -1;
  let lastA = -1;
  const put = (x: number, y: number, w: number, c: number, a: number) => {
    if (c !== last || a !== lastA) {
      g.fillStyle(c, a);
      last = c;
      lastA = a;
    }
    g.fillRect(Math.round(flip ? ox - x - w + 1 : ox + x), Math.round(oy + y), w, 1);
  };
  for (const run of baked.runs) {
    const base = alpha * (run.a ?? 1);
    let start = run.x;
    let mode = seen(run.x, run.y);
    const flush = (end: number) => {
      const w = end - start;
      if (w <= 0 || mode === Seen.Hidden) return;
      if (mode === Seen.Edge) put(start, run.y, w, edge, Math.min(1, base + 0.35));
      else put(start, run.y, w, run.c, mode === Seen.Ghost ? base * 0.35 : base);
    };
    for (let x = run.x + 1; x < run.x + run.w; x++) {
      const m = seen(x, run.y);
      if (m !== mode) {
        flush(x);
        start = x;
        mode = m;
      }
    }
    flush(run.x + run.w);
  }
}

/** Reveal from the ground up: everything below `front` px above the feet row `feetY` shows, with a soft dithered edge `band` px tall. */
export function rising(feetY: number, front: number, band: number, seed = 0): (x: number, y: number) => Seen {
  return (x, y) => {
    const d = front - (feetY - y);
    if (d >= band) return Seen.Full;
    if (d < 0) return Seen.Hidden;
    const k = d / band;
    if (d < 2.2) return noise(x, y, seed) < 0.75 ? Seen.Edge : Seen.Ghost;
    return noise(x, y, seed) < k ? Seen.Full : Seen.Ghost;
  };
}

/** Reveal outward from a point: everything within `front` px of (cx, cy) shows, with a soft dithered edge. */
export function spreading(cx: number, cy: number, front: number, band: number, seed = 0): (x: number, y: number) => Seen {
  return (x, y) => {
    const d = front - Math.hypot(x - cx, y - cy);
    if (d >= band) return Seen.Full;
    if (d < 0) return Seen.Hidden;
    const k = d / band;
    if (d < 2.2) return noise(x, y, seed) < 0.7 ? Seen.Edge : Seen.Ghost;
    return noise(x, y, seed) < k ? Seen.Full : Seen.Ghost;
  };
}
