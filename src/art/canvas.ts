import { hexToRgb, P } from './palette';

const colorCache = new Map<string, number>();

/** '#rrggbb' -> packed ABGR (little-endian canvas pixel). */
export function packColor(hex: string, alpha = 255): number {
  const key = hex + alpha;
  let v = colorCache.get(key);
  if (v === undefined) {
    const [r, g, b] = hexToRgb(hex);
    v = ((alpha << 24) | (b << 16) | (g << 8) | r) >>> 0;
    colorCache.set(key, v);
  }
  return v;
}

/** Tiny software pixel buffer. Draw into it, then flush() to its canvas and hand it to Phaser. */
export class PixelCanvas {
  readonly w: number;
  readonly h: number;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  private img: ImageData;
  readonly px: Uint32Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    this.img = this.ctx.createImageData(w, h);
    this.px = new Uint32Array(this.img.data.buffer);
  }

  set(x: number, y: number, hex: string, alpha = 255): void {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = packColor(hex, alpha);
  }

  setRaw(x: number, y: number, v: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = v;
  }

  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.px[y * this.w + x];
  }

  alphaAt(x: number, y: number): number {
    return this.get(x, y) >>> 24;
  }

  rect(x: number, y: number, w: number, h: number, hex: string, alpha = 255): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, hex, alpha);
  }

  clearRect(x: number, y: number, w: number, h: number): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.setRaw(x + i, y + j, 0);
  }

  /** Bresenham line; thick = stamp size (1 or 2). */
  line(x0: number, y0: number, x1: number, y1: number, hex: string, thick = 1): void {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < 512; guard++) {
      if (thick === 1) this.set(x0, y0, hex);
      else this.rect(x0, y0, thick, thick, hex);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  circle(cx: number, cy: number, r: number, hex: string, alpha = 255): void {
    for (let y = -Math.ceil(r); y <= Math.ceil(r); y++)
      for (let x = -Math.ceil(r); x <= Math.ceil(r); x++) if (x * x + y * y <= r * r + r * 0.8) this.set(cx + x, cy + y, hex, alpha);
  }

  /** Draw an ASCII pixel map. palette maps chars to colors; '.' and ' ' are transparent. */
  ascii(x: number, y: number, rows: readonly string[], palette: Record<string, string>, flipX = false): void {
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j];
      for (let i = 0; i < row.length; i++) {
        const c = row[i];
        if (c === '.' || c === ' ') continue;
        const col = palette[c];
        if (!col) continue;
        this.set(flipX ? x + row.length - 1 - i : x + i, y + j, col);
      }
    }
  }

  /**
   * 1px outline around opaque pixels inside a region (so sheet frames don't bleed into each other).
   * diagonal=false gives the classic 4-neighbor pixel-art outline.
   */
  outline(rx = 0, ry = 0, rw = this.w, rh = this.h, hex: string = P.ink, diagonal = false): void {
    const col = packColor(hex);
    const marks: number[] = [];
    for (let y = ry; y < ry + rh; y++) {
      for (let x = rx; x < rx + rw; x++) {
        if (this.alphaAt(x, y) > 0) continue;
        const inside = (xx: number, yy: number) => xx >= rx && yy >= ry && xx < rx + rw && yy < ry + rh && this.alphaAt(xx, yy) > 0;
        let n = inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1);
        if (!n && diagonal) n = inside(x - 1, y - 1) || inside(x + 1, y - 1) || inside(x - 1, y + 1) || inside(x + 1, y + 1);
        if (n) marks.push(y * this.w + x);
      }
    }
    for (const i of marks) this.px[i] = col;
  }

  flush(): HTMLCanvasElement {
    this.ctx.putImageData(this.img, 0, 0);
    return this.canvas;
  }
}

/** Deterministic hash noise in [0,1) for procedural textures. */
export function hash2(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
