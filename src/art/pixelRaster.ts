// A tiny pixel-art rasterizer for effects that must look like the rest of the game: hard edges on the 1-pixel grid, a
// few flat tones per material and a dark outline. Shapes are drawn into a grid of material ids (no anti-aliasing, no
// translucency inside a sprite), then `bake` shades them (light from the top-left: lit edges, shaded edges, a
// highlight on the corner) and outlines them, and returns horizontal runs that a Phaser Graphics can fill.
// Phaser-free, so it is unit tested.

export type Pt = readonly [number, number];

/** four flat tones of one material, darkest to lightest */
export interface Material {
  dark: number;
  base: number;
  light: number;
  hi: number;
}

export interface Run {
  x: number;
  y: number;
  w: number;
  c: number;
}

export class Raster {
  /** material index (1-based) per pixel, 0 = empty */
  readonly m: Uint8Array;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.m = new Uint8Array(w * h);
  }

  get(x: number, y: number): number {
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.m[y * this.w + x];
  }

  set(x: number, y: number, mat: number): void {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.m[y * this.w + x] = mat;
  }

  rect(x: number, y: number, w: number, h: number, mat: number): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, mat);
  }

  /** Filled polygon (even-odd), sampled at pixel centres: no half-covered pixels. */
  poly(pts: readonly Pt[], mat: number): void {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of pts) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(this.h - 1, Math.ceil(maxY)); y++) {
      const yc = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[(i + 1) % pts.length];
        if ((y0 <= yc && y1 > yc) || (y1 <= yc && y0 > yc)) xs.push(x0 + ((yc - y0) / (y1 - y0)) * (x1 - x0));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.ceil(xs[k] - 0.5); x < Math.ceil(xs[k + 1] - 0.5); x++) this.set(x, y, mat);
      }
    }
  }

  /** A line of square pixels `thick` wide (Bresenham). */
  line(x0: number, y0: number, x1: number, y1: number, mat: number, thick = 1): void {
    let x = Math.round(x0);
    let y = Math.round(y0);
    const ex = Math.round(x1);
    const ey = Math.round(y1);
    const dx = Math.abs(ex - x);
    const dy = -Math.abs(ey - y);
    const sx = x < ex ? 1 : -1;
    const sy = y < ey ? 1 : -1;
    let err = dx + dy;
    const off = Math.floor((thick - 1) / 2);
    for (;;) {
      this.rect(x - off, y - off, thick, thick, mat);
      if (x === ex && y === ey) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  /** A polyline of `thick`-wide pixel lines. */
  stroke(pts: readonly Pt[], mat: number, thick = 1): void {
    for (let i = 0; i + 1 < pts.length; i++) this.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], mat, thick);
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, mat: number): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx;
        const ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny <= 1) this.set(x, y, mat);
      }
    }
  }

  /** Remove every pixel of `mat` (used to cut notches out of a shape). */
  erase(pts: readonly Pt[]): void {
    this.poly(pts, 0);
  }
}

export interface Baked {
  w: number;
  h: number;
  runs: Run[];
}

/**
 * Shade and outline a raster. `mats[i - 1]` colours material i. A pixel is lit when the pixel above or to its left is
 * not the same material, shaded when the one below or to its right is not; the corner gets the highlight. With
 * `dither`, the last two rows above a shaded edge alternate with the dark tone (a cheap sense of volume). Every empty
 * pixel next to a filled one becomes the outline colour.
 */
export function bake(r: Raster, mats: readonly Material[], outline: number, dither = true): Baked {
  const colors = new Int32Array(r.w * r.h).fill(-1);
  const same = (x: number, y: number, m: number) => r.get(x, y) === m;
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const m = r.get(x, y);
      if (!m) continue;
      const mat = mats[m - 1];
      const lit = !same(x, y - 1, m) || !same(x - 1, y, m);
      const shade = !same(x, y + 1, m) || !same(x + 1, y, m);
      let c = mat.base;
      if (lit && !shade) c = !same(x, y - 1, m) && !same(x - 1, y, m) ? mat.hi : mat.light;
      else if (shade && !lit) c = mat.dark;
      else if (dither && !shade && (x + y) % 2 === 0 && (!same(x, y + 2, m) || !same(x + 1, y + 1, m))) c = mat.dark;
      colors[y * r.w + x] = c;
    }
  }
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      if (r.get(x, y)) continue;
      if (r.get(x - 1, y) || r.get(x + 1, y) || r.get(x, y - 1) || r.get(x, y + 1)) colors[y * r.w + x] = outline;
    }
  }
  const runs: Run[] = [];
  for (let y = 0; y < r.h; y++) {
    let x = 0;
    while (x < r.w) {
      const c = colors[y * r.w + x];
      if (c < 0) {
        x++;
        continue;
      }
      let e = x + 1;
      while (e < r.w && colors[y * r.w + e] === c) e++;
      runs.push({ x, y, w: e - x, c });
      x = e;
    }
  }
  return { w: r.w, h: r.h, runs };
}

/** The slice of Phaser's Graphics this needs (so tests can pass a recorder). */
export interface RectPainter {
  fillStyle(color: number, alpha?: number): unknown;
  fillRect(x: number, y: number, w: number, h: number): unknown;
}

/**
 * Paint baked runs with the raster's origin at (ox, oy). `flip` mirrors around the origin column (a sprite is drawn
 * facing +x; facing left mirrors it). Everything lands on whole pixels.
 */
export function paintRuns(g: RectPainter, baked: Baked, ox: number, oy: number, flip = false, alpha = 1): void {
  let last = -1;
  for (const r of baked.runs) {
    if (r.c !== last) {
      g.fillStyle(r.c, alpha);
      last = r.c;
    }
    g.fillRect(Math.round(flip ? ox - r.x - r.w + 1 : ox + r.x), Math.round(oy + r.y), r.w, 1);
  }
}
