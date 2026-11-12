import { bake, Raster, type Baked, type Material } from './pixelRaster';

const FLAME = [
  [{ dark: 0xb52f22, base: 0xf87024, light: 0xffa837, hi: 0xffbd50 },
    { dark: 0xf0a530, base: 0xffd050, light: 0xffe575, hi: 0xfff3a0 }],
  [{ dark: 0x1a479f, base: 0x2d97ef, light: 0x41c5ff, hi: 0x77eaff },
    { dark: 0x3bdafa, base: 0x8cecff, light: 0xbbfaff, hi: 0xe6ffff }],
] satisfies readonly Material[][];

const FLAME_TIPS = [-0.38, -0.23, 0.1, 0.35, 0.24, -0.02, -0.18, -0.31];
const flames = new Map<number, Baked>();

/** A pixel flame has a rolling outside tongue and a shorter, hotter core. */
export function dragonFlame(size: number, phase: number, blue: boolean): Baked {
  const key = size * 16 + phase + (blue ? 8 : 0);
  const cached = flames.get(key);
  if (cached) return cached;
  const r = new Raster(size * 2 + 5, size + 6);
  const x = size + 2;
  const y = size + 3;
  const tip = size * FLAME_TIPS[phase];
  const h = size * [0.91, 1, 0.95, 0.84, 0.9, 0.98, 0.86, 1][phase];
  const w = Math.max(1.6, size * 0.34);
  r.poly([[x + 1, y + 1], [x - w, y], [x - w - 1, y - h * 0.36], [x - w * 0.7, y - h * 0.71],
    [x + tip, y - h], [x + tip + w * 0.7, y - h * 0.67], [x + w * 0.38, y - h * 0.45],
    [x + w, y - h * 0.66], [x + w + 1, y - h * 0.28], [x + w * 0.62, y + 1]], 1);
  r.poly([[x - w * 0.44, y], [x - w * 0.55, y - h * 0.29], [x + tip * 0.52, y - h * 0.66],
    [x + w * 0.2, y - h * 0.32], [x + w * 0.55, y - h * 0.16], [x + w * 0.42, y]], 2);
  const sprite = bake(r, FLAME[Number(blue)], blue ? 0x1e3b79 : 0x87351f, false);
  flames.set(key, sprite);
  return sprite;
}
