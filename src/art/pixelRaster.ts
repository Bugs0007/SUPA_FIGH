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
  /** opacity of this run (translucent spirit sprites, `bakeSpirit`); absent = opaque */
  a?: number;
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

/** What the shape helpers draw with: a raster, or a `ScaledPen` that enlarges everything drawn through it. */
export type Pen = Pick<Raster, 'poly' | 'line' | 'stroke' | 'ellipse' | 'rect' | 'set' | 'get' | 'erase'>;

/**
 * Draws a design made in small "design units" onto a bigger raster: a point (x, y) of the design lands at
 * `anchor + (x - designAnchor) * scale`, radii and widths grow by `scale` (never thinner than one pixel). The art code
 * keeps its coordinates, so a spirit can be re-proportioned just by changing the scale.
 */
export class ScaledPen implements Pen {
  constructor(
    readonly inner: Raster,
    private readonly design: Pt,
    private readonly anchor: Pt,
    private readonly scale: number,
  ) {}

  private X(x: number): number {
    return this.anchor[0] + (x - this.design[0]) * this.scale;
  }

  private Y(y: number): number {
    return this.anchor[1] + (y - this.design[1]) * this.scale;
  }

  private pts(pts: readonly Pt[]): Pt[] {
    return pts.map(([x, y]) => [this.X(x), this.Y(y)] as Pt);
  }

  private thick(t: number): number {
    return Math.max(1, Math.round(t * this.scale));
  }

  get(x: number, y: number): number {
    return this.inner.get(Math.round(this.X(x)), Math.round(this.Y(y)));
  }

  set(x: number, y: number, mat: number): void {
    const n = this.thick(1);
    this.inner.rect(Math.round(this.X(x)), Math.round(this.Y(y)), n, n, mat);
  }

  rect(x: number, y: number, w: number, h: number, mat: number): void {
    this.inner.rect(Math.round(this.X(x)), Math.round(this.Y(y)), this.thick(w), this.thick(h), mat);
  }

  poly(pts: readonly Pt[], mat: number): void {
    this.inner.poly(this.pts(pts), mat);
  }

  line(x0: number, y0: number, x1: number, y1: number, mat: number, thick = 1): void {
    this.inner.line(this.X(x0), this.Y(y0), this.X(x1), this.Y(y1), mat, this.thick(thick));
  }

  stroke(pts: readonly Pt[], mat: number, thick = 1): void {
    this.inner.stroke(this.pts(pts), mat, this.thick(thick));
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, mat: number): void {
    this.inner.ellipse(this.X(cx), this.Y(cy), rx * this.scale, ry * this.scale, mat);
  }

  erase(pts: readonly Pt[]): void {
    this.inner.erase(this.pts(pts));
  }
}

export interface Baked {
  w: number;
  h: number;
  runs: Run[];
}

/** A single pixel of a fixed colour painted over a baked raster (strings, arrow shafts, sparks): no outline, no shading. */
export interface Ink {
  x: number;
  y: number;
  c: number;
  /** opacity (only `bakeSpirit` reads it; default 1) */
  a?: number;
}

/** Bresenham pixels from (x0, y0) to (x1, y1) in colour `c`, appended to `out` (for `bake`'s ink layer). */
export function inkLine(out: Ink[], x0: number, y0: number, x1: number, y1: number, c: number, a?: number): void {
  let x = Math.round(x0);
  let y = Math.round(y0);
  const ex = Math.round(x1);
  const ey = Math.round(y1);
  const dx = Math.abs(ex - x);
  const dy = -Math.abs(ey - y);
  const sx = x < ex ? 1 : -1;
  const sy = y < ey ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push(a === undefined ? { x, y, c } : { x, y, c, a });
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

/** Turn a colour per pixel (-1 = empty) into horizontal runs; with `alphas`, a run also keeps one opacity. */
export function toRuns(colors: Int32Array, w: number, h: number, alphas?: Float32Array): Baked {
  const runs: Run[] = [];
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      const i = y * w + x;
      const c = colors[i];
      if (c < 0) {
        x++;
        continue;
      }
      let e = x + 1;
      while (e < w && colors[y * w + e] === c && (!alphas || alphas[y * w + e] === alphas[i])) e++;
      runs.push(alphas ? { x, y, w: e - x, c, a: alphas[i] } : { x, y, w: e - x, c });
      x = e;
    }
  }
  return { w, h, runs };
}

/**
 * Shade and outline a raster. `mats[i - 1]` colours material i. A pixel is lit when the pixel above or to its left is
 * not the same material, shaded when the one below or to its right is not; the corner gets the highlight. With
 * `dither`, the last two rows above a shaded edge alternate with the dark tone (a cheap sense of volume). Every empty
 * pixel next to a filled one becomes the outline colour. `ink` pixels are painted last, over everything, unoutlined:
 * they are part of the same sprite, so it still fades as one.
 */
export function bake(r: Raster, mats: readonly Material[], outline: number, dither = true, ink: readonly Ink[] = []): Baked {
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
  for (const p of ink) if (p.x >= 0 && p.y >= 0 && p.x < r.w && p.y < r.h) colors[p.y * r.w + p.x] = p.c;
  return toRuns(colors, r.w, r.h);
}

/**
 * A translucent chakra material (Susanoo, Kurama and their arms, D88): the same treatment as Naruto's one-tail cloak
 * (pure aura, no ink outline, see-through), scaled up. Four flat tones banded from the edge of the part inward, each
 * with its own opacity: a bright, nearly opaque rim, a lighter inner band, then a darker and more transparent body and
 * core. No gradients: every band is whole pixels of one colour and one opacity.
 */
export interface SpiritMat {
  /** colours of the bands: rim (1 px), inner (1 px), body (2 px), core (the rest) */
  tones: readonly [number, number, number, number];
  /** opacity of each band */
  alpha: readonly [number, number, number, number];
  /** parts of one group shade as one mass (default: every material is its own group) */
  group?: number;
  /**
   * stacking: a part on a higher layer is drawn over the lower ones without cutting them (the mass behind keeps its
   * bands under it, the part gets its own rim against the mass); parts on the same layer rim each other
   */
  layer?: number;
  /** a flat detail (an eye, a seal ring, a fang, a seam): tones[0] at alpha[0] everywhere, never an edge for others */
  flat?: boolean;
  /** how deep each band reaches for this material (default `SPIRIT_BANDS`); wider bands = a brighter, glowing body */
  bands?: readonly [number, number, number];
  /** checker the core with the body tone (a lighter, textured interior; classic pixel-art shading) */
  dither?: boolean;
}

/** how deep (in pixels from the part's edge) each band reaches: rim, inner, body; deeper is core */
export const SPIRIT_BANDS = [1, 2, 4] as const;

/**
 * Bake a raster as translucent spirit: every pixel gets the band of its distance (4-neighbour, in whole pixels) to
 * the edge of its group, and every empty pixel touching the sprite becomes a faint halo (instead of `bake`'s dark
 * outline, like the soft rim of the one-tail cloak). `ink` pixels go on last (their own opacity, default 1).
 */
export function bakeSpirit(r: Raster, mats: readonly SpiritMat[], halo: { c: number; a: number }, ink: readonly Ink[] = []): Baked {
  const n = r.w * r.h;
  const colors = new Int32Array(n).fill(-1);
  const alphas = new Float32Array(n);
  const groupOf = (m: number) => mats[m - 1].group ?? -m;
  const layerOf = (m: number) => mats[m - 1].layer ?? 0;
  const dist = new Int32Array(n);
  const groups = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const m = r.m[i];
    if (m && !mats[m - 1].flat) groups.set(groupOf(m), layerOf(m));
  }
  const BIG = 1 << 20;
  for (const [g, layer] of groups) {
    // the mass of this group: its own pixels plus whatever lies over it (higher layers, flat details)
    const inside = (x: number, y: number): boolean => {
      const m = r.get(x, y);
      if (!m) return false;
      const mm = mats[m - 1];
      return mm.flat || groupOf(m) === g || layerOf(m) > layer;
    };
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) dist[y * r.w + x] = inside(x, y) ? BIG : 0;
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= r.w || y >= r.h ? 0 : dist[y * r.w + x]);
    for (let y = 0; y < r.h; y++) {
      for (let x = 0; x < r.w; x++) {
        const i = y * r.w + x;
        if (dist[i]) dist[i] = Math.min(dist[i], at(x - 1, y) + 1, at(x, y - 1) + 1);
      }
    }
    for (let y = r.h - 1; y >= 0; y--) {
      for (let x = r.w - 1; x >= 0; x--) {
        const i = y * r.w + x;
        if (dist[i]) dist[i] = Math.min(dist[i], at(x + 1, y) + 1, at(x, y + 1) + 1);
      }
    }
    for (let i = 0; i < n; i++) {
      const m = r.m[i];
      if (!m || mats[m - 1].flat || groupOf(m) !== g) continue;
      const d = dist[i];
      const b = mats[m - 1].bands ?? SPIRIT_BANDS;
      let band = d <= b[0] ? 0 : d <= b[1] ? 1 : d <= b[2] ? 2 : 3;
      if (band === 3 && mats[m - 1].dither && ((i % r.w) + Math.floor(i / r.w)) % 2 === 0) band = 2;
      colors[i] = mats[m - 1].tones[band];
      alphas[i] = mats[m - 1].alpha[band];
    }
  }
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const i = y * r.w + x;
      const m = r.m[i];
      if (m && mats[m - 1].flat) {
        colors[i] = mats[m - 1].tones[0];
        alphas[i] = mats[m - 1].alpha[0];
      } else if (!m && (r.get(x - 1, y) || r.get(x + 1, y) || r.get(x, y - 1) || r.get(x, y + 1))) {
        colors[i] = halo.c;
        alphas[i] = halo.a;
      }
    }
  }
  for (const p of ink) {
    if (p.x < 0 || p.y < 0 || p.x >= r.w || p.y >= r.h) continue;
    colors[p.y * r.w + p.x] = p.c;
    alphas[p.y * r.w + p.x] = p.a ?? 1;
  }
  return toRuns(colors, r.w, r.h, alphas);
}

/** The slice of Phaser's Graphics this needs (so tests can pass a recorder). */
export interface RectPainter {
  fillStyle(color: number, alpha?: number): unknown;
  fillRect(x: number, y: number, w: number, h: number): unknown;
}

/**
 * Paint baked runs with the raster's origin at (ox, oy). `flip` mirrors around the origin column (a sprite is drawn
 * facing +x; facing left mirrors it). Everything lands on whole pixels. `alpha` fades the whole sprite as one (times
 * each run's own opacity, for translucent spirits).
 */
export function paintRuns(g: RectPainter, baked: Baked, ox: number, oy: number, flip = false, alpha = 1): void {
  let last = -1;
  let lastA = -1;
  for (const r of baked.runs) {
    const a = alpha * (r.a ?? 1);
    if (r.c !== last || a !== lastA) {
      g.fillStyle(r.c, a);
      last = r.c;
      lastA = a;
    }
    g.fillRect(Math.round(flip ? ox - r.x - r.w + 1 : ox + r.x), Math.round(oy + r.y), r.w, 1);
  }
}
