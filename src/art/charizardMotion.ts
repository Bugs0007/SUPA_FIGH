import { bake, Raster, type Baked, type Material, type Pt } from './pixelRaster';
import type { PokemonPose } from './pokemonArt';

export const MEGA_CHARIZARD_HEIGHT_SCALE = 1.27;

interface FireRig {
  tail: Pt;
  flameSize: number;
  muzzle?: Pt;
  hips?: readonly [near: Pt, far: Pt];
}

export const FIRE_RIGS: readonly FireRig[] = [
  { tail: [0, 5], flameSize: 3 },
  { tail: [2, 10], flameSize: 6 },
  { tail: [6, 24], flameSize: 7, muzzle: [71, 10], hips: [[43, 30], [57, 29]] },
  { tail: [5, 27], flameSize: 16, muzzle: [40, 10], hips: [[22, 34], [34, 32]] },
];

export function fireSpriteCut(stage: number, x: number, y: number, color: string): boolean {
  if (stage === 0) return x < 3 && y < 5;
  if (stage === 1) return x < 6 && y < 10;
  if (stage === 2) return x < 8 && y < 28 || y >= 32 || x >= 55 && y >= 31;
  return y >= 37 && x >= 16 || y >= 34 && x >= 29
    || y >= 8 && y < 28 && x < (y < 13 ? 4 : y < 19 ? 6 : 11)
    || x >= 28 && y >= 5 && y <= 11 && '2458bcdhi'.includes(color);
}

const ORANGE: Material = { dark: 0x944829, base: 0xea8832, light: 0xf3aa48, hi: 0xf8c079 };
const GRAPHITE: Material = { dark: 0x262e3b, base: 0x515d67, light: 0x677681, hi: 0x8798a5 };
const CLAW: Material = { dark: 0x8c8581, base: 0xccc3b5, light: 0xe5dfd3, hi: 0xf8f6ec };
const SHADOW: Material = { dark: 0x724028, base: 0xa75829, light: 0xc57637, hi: 0xe99746 };
const DARK_SHADOW: Material = { dark: 0x232b37, base: 0x3c4452, light: 0x505c6b, hi: 0x647989 };

/** Separate hip, knee and ankle paths give each foot its own swing and contact phase. */
export function dragonLegs(
  stage: number, pose: PokemonPose, phase: number, flightPhase: number, contact: number, width: number, height: number, padding: number,
): readonly Baked[] {
  const hips = FIRE_RIGS[stage].hips!;
  const running = pose === 'run' || pose === 'dash';
  const airborne = flightPhase >= 0;
  const kick = pose === 'kick' ? Math.max(0, 1 - phase / 7) : 0;
  const guard = pose === 'guard' || pose === 'windup';
  const palette = [stage === 3 ? GRAPHITE : ORANGE, CLAW, stage === 3 ? DARK_SHADOW : SHADOW];
  return [true, false].map(far => {
    const r = new Raster(width, height);
    const [hipX, hipY] = hips[far ? 1 : 0];
    const angle = phase * Math.PI / 4 + (far ? Math.PI : 0);
    const stride = running && !airborne ? Math.sin(angle) * (pose === 'dash' ? 7 : 5) : 0;
    const swing = running && !airborne ? Math.max(0, Math.cos(angle)) * 4 : 0;
    const tuck = airborne ? 7 + Math.cos(flightPhase * Math.PI / 4 - 0.65 + (far ? 0.6 : 0)) * 1.25 : 0;
    const strike = far ? 0 : kick;
    const hip: Pt = [padding + hipX + (guard ? -1 : 0), padding + hipY + (guard ? 2 : 0)];
    const ankle: Pt = [hip[0] + (far ? 1 : -3) + stride - tuck + strike * 11, contact - 3 - swing - tuck - strike * 7];
    const knee: Pt = [(hip[0] + ankle[0]) / 2 + (far ? -2 : 2) + tuck * 0.22,
      (hip[1] + ankle[1]) / 2 - strike * 2 + tuck * 0.25];
    const color = far ? 3 : 1;
    const thigh = far ? 2.6 : 3.8;
    r.ellipse(hip[0], hip[1], thigh, thigh * 0.88, color);
    r.poly([[hip[0] - thigh, hip[1] - 1], [hip[0] + thigh, hip[1] - 1], [knee[0] + thigh * 0.68, knee[1] + 1],
      [ankle[0] + 1.7, ankle[1]], [ankle[0] - 1.6, ankle[1]], [knee[0] - thigh * 0.75, knee[1] + 1]], color);
    r.poly([[ankle[0] - 2, ankle[1] - 1], [ankle[0] + 3, ankle[1] - 1],
      [ankle[0] + 6, ankle[1] + 1], [ankle[0] - 2, ankle[1] + 1]], color);
    r.set(Math.round(ankle[0] + 2), Math.round(ankle[1]), 2);
    r.set(Math.round(ankle[0] + 4), Math.round(ankle[1] + 1), 2);
    return bake(r, palette, stage === 3 ? 0x161b25 : 0x713722, false);
  });
}

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
