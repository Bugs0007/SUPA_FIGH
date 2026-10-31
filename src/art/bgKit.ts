import { hash2, packColor, type PixelCanvas } from './canvas';
import { hexToRgb, mix, shade } from './palette';

// Pixel-clean painting kit for the parallax backgrounds (backgroundArt.ts). Every layer is BG_W x BG_H and
// tiles horizontally, so everything here wraps x. Rules of the look: hard-edged silhouettes, a few flat
// tones per shape, light as stepped bands with 4x4 ordered dither between steps (never smooth blur), and
// atmospheric perspective by mixing distant shapes toward the sky colour. Hot loops write packed pixels.

export const BG_W = 640;
export const BG_H = 360;

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Ordered-dither threshold in (0, 1) for a pixel. */
export const bayer = (x: number, y: number): number => (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
export const wrapX = (x: number): number => (((x | 0) % BG_W) + BG_W) % BG_W;

/** Packed opaque colour (cached). */
export const pk = (hex: string, a = 255): number => packColor(hex, a);

function put(pc: PixelCanvas, x: number, y: number, v: number): void {
  y |= 0;
  if (y < 0 || y >= pc.h) return;
  pc.px[y * pc.w + wrapX(x)] = v;
}

/** Wrapped filled rectangle. */
export function box(pc: PixelCanvas, x: number, y: number, w: number, h: number, hex: string, a = 255): void {
  const v = pk(hex, a);
  const y0 = Math.max(0, Math.round(y));
  const y1 = Math.min(pc.h, Math.round(y + h));
  const x0 = Math.round(x);
  for (let yy = y0; yy < y1; yy++) for (let i = 0; i < Math.round(w); i++) pc.px[yy * pc.w + wrapX(x0 + i)] = v;
}

export function dot(pc: PixelCanvas, x: number, y: number, hex: string, a = 255): void {
  put(pc, Math.round(x), Math.round(y), pk(hex, a));
}

/** Wrapped filled disc. */
export function disc(pc: PixelCanvas, cx: number, cy: number, r: number, hex: string): void {
  const v = pk(hex);
  const R = Math.ceil(r);
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) if (x * x + y * y <= r * r + r * 0.6) put(pc, Math.round(cx) + x, Math.round(cy) + y, v);
}

/** Wrapped filled ellipse, optionally cut flat below `flat` (cloud bottoms). */
export function ellipse(pc: PixelCanvas, cx: number, cy: number, rx: number, ry: number, hex: string, flat = Infinity): void {
  const v = pk(hex);
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry) && y < flat; y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) put(pc, x, y, v);
}

/** Blend an existing opaque pixel toward a colour (keeps alpha). */
function lightPx(pc: PixelCanvas, i: number, r: number, g: number, b: number, t: number): void {
  const v = pc.px[i];
  if (!(v >>> 24)) return;
  const vr = v & 255;
  const vg = (v >>> 8) & 255;
  const vb = (v >>> 16) & 255;
  pc.px[i] = ((v >>> 24) << 24 | Math.round(vb + (b - vb) * t) << 16 | Math.round(vg + (g - vg) * t) << 8 | Math.round(vr + (r - vr) * t)) >>> 0;
}

/**
 * Multi-stop sky, quantised to `bands` flat bands per stop pair with an ordered dither at each band
 * boundary (the classic pixel-art gradient: no smooth ramps).
 */
export function skyGrad(pc: PixelCanvas, stops: string[], y0 = 0, y1 = BG_H, bands = 6): void {
  const n = stops.length - 1;
  const packs: number[][] = [];
  for (let s = 0; s < n; s++) {
    const row: number[] = [];
    for (let b = 0; b <= bands; b++) row.push(pk(mix(stops[s], stops[s + 1], b / bands)));
    packs.push(row);
  }
  for (let y = Math.max(0, y0); y < Math.min(pc.h, y1); y++) {
    const t = ((y - y0) / Math.max(1, y1 - y0)) * n;
    const s = Math.min(n - 1, Math.floor(t));
    const f = (t - s) * bands;
    const b = Math.floor(f);
    const frac = f - b;
    const lo = packs[s][b];
    const hi = packs[s][Math.min(bands, b + 1)];
    // dither only in the last third of each band: wide flat bands, thin dithered seams
    const d = (frac - 0.66) / 0.34;
    for (let x = 0; x < pc.w; x++) pc.px[y * pc.w + x] = d > 0 && d > bayer(x, y) ? hi : lo;
  }
}

/** Stepped, dithered radial glow (sun / moon / lamp halos). Lightens what is already painted. */
export function halo(pc: PixelCanvas, cx: number, cy: number, rx: number, ry: number, hex: string, strength: number, bands = 4): void {
  const [r, g, b] = hexToRgb(hex);
  for (let y = Math.max(0, Math.floor(cy - ry)); y < Math.min(pc.h, cy + ry); y++)
    for (let x = Math.floor(cx - rx); x < cx + rx; x++) {
      const d = Math.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2);
      if (d >= 1) continue;
      const lv = (1 - d) * bands;
      let step = Math.floor(lv);
      if (lv - step > bayer(x, y)) step++;
      if (step > 0) lightPx(pc, y * pc.w + wrapX(x), r, g, b, (strength * step) / bands);
    }
}

/**
 * Stepped glow that also works on transparent layers: lightens painted pixels and lays translucent colour
 * on empty ones (lamp pools on the mid / near layers).
 */
export function glow(pc: PixelCanvas, cx: number, cy: number, rx: number, ry: number, hex: string, strength: number, bands = 3): void {
  const [r, g, b] = hexToRgb(hex);
  for (let y = Math.max(0, Math.floor(cy - ry)); y < Math.min(pc.h, cy + ry); y++)
    for (let x = Math.floor(cx - rx); x < cx + rx; x++) {
      const d = Math.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2);
      if (d >= 1) continue;
      const lv = (1 - d) * bands;
      let step = Math.floor(lv);
      if (lv - step > bayer(x, y)) step++;
      if (step <= 0) continue;
      const i = y * pc.w + wrapX(x);
      const t = (strength * step) / bands;
      if (pc.px[i] >>> 24) lightPx(pc, i, r, g, b, t);
      else pc.px[i] = ((Math.round(255 * t) << 24) | (b << 16) | (g << 8) | r) >>> 0;
    }
}

/** Horizontal haze that thickens toward `y1` in stepped dithered bands (horizon mist, smog, floor glow). */
export function hazeBand(pc: PixelCanvas, y0: number, y1: number, hex: string, strength: number, bands = 4, invert = false): void {
  const [r, g, b] = hexToRgb(hex);
  for (let y = Math.max(0, y0); y < Math.min(pc.h, y1); y++) {
    let t = (y - y0) / Math.max(1, y1 - y0);
    if (invert) t = 1 - t;
    for (let x = 0; x < pc.w; x++) {
      const lv = t * bands;
      let step = Math.floor(lv);
      if (lv - step > bayer(x, y)) step++;
      if (step > 0) lightPx(pc, y * pc.w + x, r, g, b, (strength * step) / bands);
    }
  }
}

/** Atmospheric perspective: mix every painted pixel in rows y0..y1 toward a colour. */
export function tint(pc: PixelCanvas, hex: string, amount: number, y0 = 0, y1 = BG_H): void {
  const [r, g, b] = hexToRgb(hex);
  for (let y = Math.max(0, y0); y < Math.min(pc.h, y1); y++) for (let x = 0; x < pc.w; x++) lightPx(pc, y * pc.w + x, r, g, b, amount);
}

/**
 * Atmospheric perspective that deepens down the layer: the mix amount ramps from a0 (top) to a1 (bottom)
 * in stepped, dithered increments (no visible seam where it starts).
 */
export function tintRamp(pc: PixelCanvas, hex: string, a0: number, a1: number, steps = 6): void {
  const [r, g, b] = hexToRgb(hex);
  for (let y = 0; y < pc.h; y++) {
    const lv = (y / pc.h) * steps;
    for (let x = 0; x < pc.w; x++) {
      let st = Math.floor(lv);
      if (lv - st > bayer(x, y)) st++;
      lightPx(pc, y * pc.w + x, r, g, b, a0 + ((a1 - a0) * st) / steps);
    }
  }
}

/** Blend a colour onto a painted pixel by `t` (translucent light such as searchlight beams). */
export function blendDot(pc: PixelCanvas, x: number, y: number, hex: string, t: number): void {
  x = Math.round(x);
  y = Math.round(y);
  if (y < 0 || y >= pc.h) return;
  const [r, g, b] = hexToRgb(hex);
  lightPx(pc, y * pc.w + wrapX(x), r, g, b, t);
}

/** Periodic 1D value noise over the layer width (so silhouettes tile seamlessly). */
export function noise1(x: number, seed: number, cell: number): number {
  const cells = Math.max(1, Math.round(BG_W / cell));
  const fx = (wrapX(x) / BG_W) * cells;
  const i = Math.floor(fx);
  const t = fx - i;
  const s = t * t * (3 - 2 * t);
  const a = hash2(i % cells, 17, seed);
  const b = hash2((i + 1) % cells, 17, seed);
  return a + (b - a) * s;
}

export interface RidgeOpts {
  /** baseline (screen y of the valley floor) */
  base: number;
  /** peak height above the baseline */
  amp: number;
  color: string;
  seed: number;
  /** horizontal feature size in px (bigger = broader mountains) */
  scale?: number;
  /** 0..1 how jagged (adds smaller octaves) */
  rough?: number;
  /** sunlit face colour (default slightly lighter) and shaded face (default slightly darker) */
  lit?: string;
  dark?: string;
  /** snow above this many px below the peak line */
  snow?: { color: string; depth: number };
  /** paint to the bottom of the layer (default) or only a band this tall */
  fill?: number;
}

/**
 * Mountain / hill silhouette built from overlapping peaks with straight-ish flanks and jagged crests. Each
 * peak has a sunlit left face and a shaded right face split by a slanting ridge line (light from the left);
 * high peaks carry a snow cap with a ragged lower edge. Returns the crest height per column.
 */
export function ridge(pc: PixelCanvas, o: RidgeOpts): number[] {
  const scale = o.scale ?? 160;
  const rough = o.rough ?? 0.5;
  const n = Math.max(2, Math.round(BG_W / scale) * 2);
  const peaks: { x: number; h: number; k: number }[] = [];
  for (let i = 0; i < n; i++)
    peaks.push({ x: ((i + hash2(i, 1, o.seed) * 0.8) / n) * BG_W, h: 0.35 + hash2(i, 2, o.seed) * 0.65, k: 0.7 + hash2(i, 3, o.seed) * 0.8 });
  const tops: number[] = [];
  const owner: number[] = [];
  for (let x = 0; x < BG_W; x++) {
    let best = -1e9;
    let who = 0;
    for (let i = 0; i < n; i++) {
      let dx = Math.abs(x - peaks[i].x);
      dx = Math.min(dx, BG_W - dx);
      const v = peaks[i].h * o.amp - (dx * peaks[i].k * o.amp) / scale;
      if (v > best) {
        best = v;
        who = i;
      }
    }
    const jag = (noise1(x, o.seed + 5, 10) - 0.5) * o.amp * 0.07 * rough + (noise1(x, o.seed + 6, 34) - 0.5) * o.amp * 0.12 * rough;
    tops.push(Math.round(o.base - Math.max(0, best + jag)));
    owner.push(who);
  }
  const lit = pk(o.lit ?? mix(o.color, '#ffffff', 0.08));
  const body = pk(o.color);
  const dark = pk(o.dark ?? shade(o.color, -0.12));
  const snow = o.snow ? pk(o.snow.color) : 0;
  const snowDark = o.snow ? pk(mix(o.snow.color, o.dark ?? shade(o.color, -0.12), 0.35)) : 0;
  const bottom = o.fill ? Math.min(pc.h, o.base + o.fill) : pc.h;
  for (let x = 0; x < BG_W; x++) {
    const top = tops[x];
    const fade = 0.5 + noise1(x, o.seed + 8, 24) * 0.25;
    for (let y = Math.max(0, top); y < bottom; y++) {
      // valleys between peaks slant down-left like the ridge lines, instead of a vertical seam
      const p = peaks[owner[wrapX(x - Math.round((y - top) * 0.45))]];
      const peakY = o.base - p.h * o.amp;
      let dxp = x - p.x;
      if (dxp > BG_W / 2) dxp -= BG_W;
      if (dxp < -BG_W / 2) dxp += BG_W;
      const depth = y - peakY;
      // ridge line drifts right as it descends; the face colour fades into the body further down
      const shadowSide = dxp > depth * 0.35 + (noise1(y * 3, o.seed + 9, 12) - 0.5) * 4;
      let v = shadowSide ? dark : lit;
      if (!shadowSide && depth > p.h * o.amp * fade) v = body;
      if (o.snow && p.h > 0.6) {
        const line = peakY + o.snow.depth * (p.h - 0.45) * 2 + (noise1(x, o.seed + 7, 8) - 0.5) * 8;
        if (y < line) v = shadowSide ? snowDark : snow;
      }
      pc.px[y * pc.w + x] = v;
    }
  }
  return tops;
}

export interface CloudStyle {
  light: string;
  mid: string;
  dark: string;
}

/** A puffy pixel cloud: a few overlapping lobes, flat bottom, three flat tones (lit top, body, shaded belly). */
export function cloud(pc: PixelCanvas, cx: number, cy: number, w: number, st: CloudStyle, seed: number): void {
  const lobes = 3 + Math.floor(hash2(seed, 1) * 3);
  const h = Math.max(6, Math.round(w * 0.28));
  const flat = cy + 2;
  const parts: [number, number, number][] = [];
  for (let k = 0; k < lobes; k++) {
    const t = lobes === 1 ? 0.5 : k / (lobes - 1);
    const r = h * (0.55 + Math.sin(t * Math.PI) * 0.55) * (0.8 + hash2(k, seed, 3) * 0.4);
    parts.push([cx - w / 2 + r + t * (w - 2 * r), cy - r * 0.55, r]);
  }
  for (const [x, y, r] of parts) ellipse(pc, x, y + 2, r, r * 0.8, st.dark, flat);
  for (const [x, y, r] of parts) ellipse(pc, x, y, r * 0.96, r * 0.74, st.mid, flat - 2);
  for (const [x, y, r] of parts) ellipse(pc, x - r * 0.18, y - r * 0.22, r * 0.62, r * 0.42, st.light, flat - 3);
}

/** Thin streak clouds (sunsets, high cirrus). */
export function streak(pc: PixelCanvas, x: number, y: number, w: number, hex: string, hi?: string): void {
  box(pc, x, y, w, 2, hex);
  box(pc, x + w * 0.15, y - 1, w * 0.6, 1, hi ?? hex);
  box(pc, x + w * 0.3, y + 2, w * 0.5, 1, hex);
}

/** Static star field (dim); `twinkleStars` paints the bright subset for animation frames. */
export function stars(pc: PixelCanvas, n: number, maxY: number, seed: number, dim: string, bright: string): void {
  for (let i = 0; i < n; i++) {
    const x = Math.floor(hash2(i, 1, seed) * BG_W);
    const y = Math.floor(hash2(i, 2, seed) * maxY);
    dot(pc, x, y, hash2(i, 3, seed) < 0.3 ? bright : dim);
  }
}

export function twinkleStars(pc: PixelCanvas, n: number, maxY: number, seed: number, frame: number, frames: number, hex: string): void {
  for (let i = 0; i < n; i++) {
    if (Math.floor(hash2(i, 5, seed) * frames) !== frame) continue;
    const x = Math.floor(hash2(i, 1, seed) * BG_W);
    const y = Math.floor(hash2(i, 2, seed) * maxY);
    dot(pc, x, y, hex);
    if (hash2(i, 6, seed) < 0.25) {
      dot(pc, x - 1, y, hex, 150);
      dot(pc, x + 1, y, hex, 150);
      dot(pc, x, y - 1, hex, 150);
      dot(pc, x, y + 1, hex, 150);
    }
  }
}

/** Moon with craters and a soft stepped halo. */
export function moon(pc: PixelCanvas, cx: number, cy: number, r: number, body: string, shadow: string, haloHex: string, sky?: string): void {
  halo(pc, cx, cy, r * 4.2, r * 4.2, haloHex, 0.22, 4);
  disc(pc, cx, cy, r, body);
  disc(pc, cx + r * 0.35, cy + r * 0.2, r * 0.25, shadow);
  disc(pc, cx - r * 0.3, cy - r * 0.35, r * 0.18, shadow);
  disc(pc, cx - r * 0.1, cy + r * 0.5, r * 0.12, shadow);
  if (sky) disc(pc, cx + r * 0.55, cy - r * 0.25, r * 0.85, sky); // crescent bite
}

// ------------------------------------------------------------------ cities

export interface Tower {
  x: number;
  w: number;
  h: number;
  roof: 'flat' | 'step' | 'spire' | 'tank' | 'antenna' | 'dome';
  seed: number;
}

/** Deterministic skyline layout (shared by the base layer and its animated light frames). */
export function cityLayout(seed: number, minH: number, maxH: number, minW = 18, maxW = 46, gap = 2): Tower[] {
  const out: Tower[] = [];
  const roofs: Tower['roof'][] = ['flat', 'flat', 'step', 'spire', 'tank', 'antenna', 'dome'];
  let x = Math.floor(hash2(0, 9, seed) * 10);
  for (let i = 0; x < BG_W; i++) {
    const w = minW + Math.floor(hash2(i, 0, seed) * (maxW - minW));
    const h = minH + Math.floor(Math.pow(hash2(i, 1, seed), 1.3) * (maxH - minH));
    out.push({ x, w, h, roof: roofs[Math.floor(hash2(i, 2, seed) * roofs.length)], seed: seed * 31 + i });
    x += w + gap + Math.floor(hash2(i, 3, seed) * gap * 2);
  }
  return out;
}

export interface CityStyle {
  body: string;
  /** side plane (shaded) */
  side: string;
  /** roof-edge highlight */
  rim: string;
  /** unlit window */
  win: string;
  /** lit window colours */
  lit: string[];
  /** fraction of windows lit in the base layer */
  litRate: number;
  /** window grid pitch [x, y] and size [w, h] */
  pitch?: [number, number];
  size?: [number, number];
}

function roofTop(t: Tower, base: number): number {
  return base - t.h;
}

/** Paint a skyline: blocky towers with roof furniture, a shaded side plane and window grids. */
export function paintCity(pc: PixelCanvas, towers: Tower[], base: number, st: CityStyle): void {
  const [px, py] = st.pitch ?? [4, 5];
  const [ww, wh] = st.size ?? [2, 2];
  for (const t of towers) {
    const top = roofTop(t, base);
    box(pc, t.x, top, t.w, t.h, st.body);
    const sideW = Math.max(3, Math.floor(t.w * 0.22));
    box(pc, t.x + t.w - sideW, top, sideW, t.h, st.side);
    box(pc, t.x, top, t.w, 1, st.rim);
    switch (t.roof) {
      case 'step':
        box(pc, t.x + 3, top - 6, t.w - 6, 6, st.body);
        box(pc, t.x + 3, top - 6, t.w - 6, 1, st.rim);
        box(pc, t.x + Math.floor(t.w / 2) - 3, top - 11, 6, 5, st.body);
        break;
      case 'spire':
        for (let k = 0; k < 14; k++) box(pc, t.x + Math.floor(t.w / 2) - Math.max(0, 3 - Math.floor(k / 4)), top - k - 1, Math.max(1, 6 - Math.floor(k / 2.4)), 1, st.body);
        box(pc, t.x + Math.floor(t.w / 2), top - 22, 1, 8, st.body);
        break;
      case 'tank':
        box(pc, t.x + 4, top - 9, 8, 7, st.side);
        box(pc, t.x + 3, top - 10, 10, 2, st.body);
        box(pc, t.x + 5, top - 2, 1, 2, st.side);
        box(pc, t.x + 10, top - 2, 1, 2, st.side);
        break;
      case 'antenna':
        box(pc, t.x + Math.floor(t.w / 3), top - 14, 1, 14, st.body);
        box(pc, t.x + Math.floor(t.w / 3) - 2, top - 9, 5, 1, st.body);
        break;
      case 'dome':
        ellipse(pc, t.x + t.w / 2, top, t.w / 2 - 2, 6, st.body, top);
        break;
      default:
        box(pc, t.x + 2, top - 2, 5, 2, st.side); // a roof box
    }
    for (let wy = top + 4; wy < base - 3; wy += py)
      for (let wx = t.x + 2; wx < t.x + t.w - sideW - 1; wx += px) {
        const h = hash2(wx, wy, t.seed);
        const lit = h < st.litRate;
        box(pc, wx, wy, ww, wh, lit ? st.lit[Math.floor(hash2(wx, wy, t.seed + 1) * st.lit.length)] : st.win);
      }
  }
}

/** Animation frame for a skyline: a few windows switch on and off, roof beacons blink on frame 0. */
export function paintCityLights(pc: PixelCanvas, towers: Tower[], base: number, st: CityStyle, frame: number, frames: number, beacon?: string): void {
  const [px, py] = st.pitch ?? [4, 5];
  const [ww, wh] = st.size ?? [2, 2];
  for (const t of towers) {
    const top = roofTop(t, base);
    const sideW = Math.max(3, Math.floor(t.w * 0.22));
    for (let wy = top + 4; wy < base - 3; wy += py)
      for (let wx = t.x + 2; wx < t.x + t.w - sideW - 1; wx += px) {
        const h = hash2(wx, wy, t.seed);
        if (h < st.litRate || h > st.litRate + 0.07) continue; // only a thin band of windows flickers
        if (Math.floor(hash2(wx, wy, t.seed + 7) * frames) === frame) box(pc, wx, wy, ww, wh, st.lit[Math.floor(hash2(wx, wy, t.seed + 1) * st.lit.length)]);
      }
    if (beacon && frame === 0 && (t.roof === 'antenna' || t.roof === 'spire')) {
      const bx = t.roof === 'antenna' ? t.x + Math.floor(t.w / 3) : t.x + Math.floor(t.w / 2);
      const by = top - (t.roof === 'antenna' ? 15 : 23);
      dot(pc, bx, by, beacon);
      dot(pc, bx - 1, by, beacon, 120);
      dot(pc, bx + 1, by, beacon, 120);
    }
  }
}

// ------------------------------------------------------------------ nature

/** Band of tree silhouettes: 'pine' (stacked triangles) or 'round' (lumpy canopies), two tones. */
export function treeLine(pc: PixelCanvas, base: number, h: number, hex: string, seed: number, kind: 'pine' | 'round', density = 1, lit?: string): void {
  const n = Math.round((BG_W / (kind === 'pine' ? 9 : 16)) * density);
  const hi = lit ?? mix(hex, '#ffffff', 0.07);
  for (let i = 0; i < n; i++) {
    const x = Math.floor(((i + hash2(i, 0, seed) * 0.8) / n) * BG_W);
    const th = h * (0.6 + hash2(i, 1, seed) * 0.5);
    if (kind === 'pine') {
      for (let y = 0; y < th; y++) {
        const half = Math.floor((y / th) * th * 0.28 + 1) - (y % 6 < 2 ? 1 : 0);
        box(pc, x - half, base - th + y, half * 2 + 1, 1, hex);
        if (y > 2) box(pc, x - half, base - th + y, Math.max(1, Math.floor(half * 0.5)), 1, hi);
      }
    } else {
      const r = th * 0.42;
      ellipse(pc, x, base - th + r, r, r * 0.9, hex);
      ellipse(pc, x - r * 0.6, base - th + r * 1.5, r * 0.8, r * 0.7, hex);
      ellipse(pc, x + r * 0.6, base - th + r * 1.4, r * 0.8, r * 0.7, hex);
      ellipse(pc, x - r * 0.3, base - th + r * 0.7, r * 0.45, r * 0.35, hi);
      box(pc, x - 1, base - th * 0.3, 3, th * 0.3, hex);
    }
  }
  box(pc, 0, base, BG_W, BG_H - base, hex);
}

/** Water surface rows with flat colour bands and short static highlight dashes. */
export function water(pc: PixelCanvas, y0: number, y1: number, top: string, bottom: string, dash: string, seed: number): void {
  skyGrad(pc, [top, bottom], y0, y1, 4);
  for (let y = y0 + 2; y < y1; y += 3)
    for (let k = 0; k < 10 + (y - y0) / 3; k++) {
      const x = Math.floor(hash2(k, y, seed) * BG_W);
      box(pc, x, y, 2 + Math.floor(((y - y0) / (y1 - y0)) * 8), 1, dash);
    }
}

/** Animated glitter on a water surface: dashes that change place each frame (denser around `cx`). */
export function glitter(pc: PixelCanvas, y0: number, y1: number, hex: string, seed: number, frame: number, cx?: number, spread = 80): void {
  for (let y = y0 + 1; y < y1; y += 2)
    for (let k = 0; k < 8; k++) {
      const h = hash2(k, y * 7 + frame, seed);
      const x = cx === undefined ? Math.floor(h * BG_W) : Math.floor(cx + (h - 0.5) * 2 * (spread * (0.4 + (y - y0) / Math.max(1, y1 - y0))));
      box(pc, x, y, 1 + Math.floor(hash2(k, y, seed + frame) * 4), 1, hex);
    }
}

/** Wrapped Bresenham line (for strokes that may cross the layer's seam). */
export function lineW(pc: PixelCanvas, x0: number, y0: number, x1: number, y1: number, hex: string, thick = 1): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) box(pc, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, thick, thick, hex);
}

/**
 * Clumpy foliage canopy: many small lobes inside an ellipse, then re-toned per pixel from the light
 * direction (upper left) plus a cluster noise, so it reads as leaf masses rather than one blob.
 */
export function canopy(pc: PixelCanvas, cx: number, cy: number, rx: number, ry: number, tones: [string, string, string, string], seed: number): void {
  const base = pk(tones[1]);
  for (let i = 0; i < Math.round((rx * ry) / 18); i++) {
    const a = hash2(i, 0, seed) * Math.PI * 2;
    const d = Math.sqrt(hash2(i, 1, seed));
    const r = 3 + hash2(i, 2, seed) * Math.min(rx, ry) * 0.35;
    ellipse(pc, cx + Math.cos(a) * d * (rx - r), cy + Math.sin(a) * d * (ry - r * 0.8), r, r * 0.85, tones[1]);
  }
  const packs = tones.map((t) => pk(t));
  for (let y = Math.max(0, Math.floor(cy - ry - 2)); y < Math.min(pc.h, cy + ry + 2); y++)
    for (let x = Math.floor(cx - rx - 2); x < cx + rx + 2; x++) {
      const i = y * pc.w + wrapX(x);
      if (pc.px[i] !== base) continue;
      const sun = ((cx - x) / rx + (cy - y) / ry) * 0.5;
      const tone = sun + (hash2(x >> 2, y >> 2, seed + 50) - 0.5) * 0.7 + (bayer(x, y) - 0.5) * 0.15;
      pc.px[i] = packs[tone > 0.38 ? 3 : tone > 0.05 ? 2 : tone < -0.3 ? 0 : 1];
    }
}

/** Waving banner on a pole (3-frame flutter). */
export function flag(pc: PixelCanvas, x: number, y: number, w: number, h: number, hex: string, hi: string, frame: number): void {
  for (let i = 0; i < w; i++) {
    const off = Math.round(Math.sin((i / w) * Math.PI * 1.6 - frame * 2.1) * 1.5 * (i / w));
    box(pc, x + i, y + off, 1, h, ((i + frame) & 3) === 0 ? hi : hex);
  }
}
