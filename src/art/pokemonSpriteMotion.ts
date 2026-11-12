import { dragonLegs, FIRE_RIGS, fireSpriteCut, MEGA_CHARIZARD_HEIGHT_SCALE } from './charizardMotion';
import { toRuns, type Baked, type Pt } from './pixelRaster';
import type { PokemonPose } from './pokemonArt';
import type { PokemonSprite } from './pokemonSprites';
import type { PokemonSpecies } from '../sim/data/pokemon';

const STRIKE = [1, 0.96, 0.84, 0.65, 0.43, 0.24, 0.08, 0];
const RECOIL = [-0.18, -0.6, 1, 0.82, 0.55, 0.33, 0.14, 0];
const FLAP = [-1, -0.83, -0.27, 0.82, 1, 0.78, 0.1, -0.57];
const ARM_Y: Partial<Record<PokemonSpecies, readonly number[]>> = {
  charmander: [0.47, 0.61, 0.63, 0.62],
  squirtle: [0.52, 0.58, 0.63, 0.66],
  gible: [0.78, 0.61, 0.61, 0.6],
};
const TAU = Math.PI * 2;
const unit = (n: number) => Math.max(0, Math.min(1, n));

function region(x: number, y: number, cx: number, cy: number, rx: number, ry: number): number {
  const u = (x - cx) / rx;
  const v = (y - cy) / ry;
  const t = unit(1 - u * u - v * v);
  return t * t * (3 - 2 * t);
}

export interface ReferenceFrame {
  sprite: Baked;
  originX: number;
  originY: number;
  saddle?: readonly [number, number];
  grip?: Pt;
  muzzle?: Pt;
  fire?: { tail: Pt; size: number; muzzle?: Pt };
}

/** Scale around the foot anchor, including contact points used for riding and effects. */
export function scalePokemonFrame(art: ReferenceFrame, left: number, right: number, vertical: number): ReferenceFrame {
  const { sprite, originX, originY, saddle, fire, grip, muzzle } = art;
  const scaleX = (x: number) => Math.round(x * (x < 0 ? left : right));
  const scaleY = (y: number) => Math.round(y * vertical);
  const point = ([x, y]: Pt): Pt => [scaleX(x), scaleY(y)];
  const ox = -scaleX(-originX);
  const oy = -scaleY(-originY);
  const runs = sprite.runs.flatMap(run => {
    const x = scaleX(run.x - originX);
    const end = scaleX(run.x + run.w - originX);
    const top = scaleY(run.y - originY);
    const bottom = scaleY(run.y + 1 - originY);
    return Array.from({ length: bottom - top }, (_, i) => ({ ...run, x: x + ox, y: top + i + oy, w: end - x }));
  });
  return {
    sprite: { w: scaleX(sprite.w - originX) + ox, h: scaleY(sprite.h - originY) + oy, runs },
    originX: ox, originY: oy, saddle: saddle && point(saddle), grip: grip && point(grip), muzzle: muzzle && point(muzzle),
    fire: fire && { ...fire, tail: point(fire.tail), muzzle: fire.muzzle && point(fire.muzzle) },
  };
}

/** Inverse-sample a local pixel mesh so stretching a limb does not tear holes in the silhouette. */
export function animatePokemonSprite(
  art: PokemonSprite, species: PokemonSpecies, stage: number, pose: PokemonPose, phase: number, flightPhase: number,
): ReferenceFrame {
  const { width, height, originX, originY, rows, palette, rideX, rideY, wing: hinge } = art;
  const fire = species === 'charmander' ? FIRE_RIGS[stage] : undefined;
  const dragon = fire?.hips !== undefined;
  const mega = dragon && stage === 3;
  const padding = Math.ceil(height * 0.28) + 1;
  const w = width + padding * 2;
  const h = height + padding * 2;
  const pixels = new Int32Array(w * h).fill(-1);
  if (dragon) {
    for (const leg of dragonLegs(stage, pose, phase, flightPhase, originY + padding, w, h, padding)) {
      for (const run of leg.runs) pixels.fill(run.c, run.y * w + run.x, run.y * w + run.x + run.w);
    }
  }
  const gait = Math.sin(phase * TAU / 8);
  const lift = Math.abs(gait);
  const running = pose === 'run' || pose === 'dash';
  const flying = flightPhase >= 0;
  const low = species === 'bulbasaur' || species === 'pikachu';
  const hip = originX / width;
  const shoulder = low ? 0.73 : Math.min(0.88, hip + 0.13);
  const armY = ARM_Y[species]?.[stage] ?? (low ? 0.72 : 0.64);
  const punch = pose === 'punch' ? STRIKE[phase] : 0;
  const kick = pose === 'kick' ? STRIKE[phase] : 0;
  const cast = pose === 'cast' ? RECOIL[phase] : 0;
  const openJaw = dragon && pose === 'cast' ? [0.25, 0.6, 1, 1, 0.8, 0.55, 0.25, 0][phase] : 0;
  const guard = pose === 'guard';
  const loading = pose === 'windup';
  const flightLean = flying ? (dragon ? 0.085 : 0.13) : 0;
  const lean = flightLean + (pose === 'dash' ? 0.22 : running ? 0.08 : punch * 0.09 + kick * 0.055 - cast * 0.06 - (guard ? 0.05 : 0));
  const rise = running ? lift * 0.065 : !guard && !flying ? (1 - Math.cos(phase * TAU / 8)) * (dragon ? 0.032 : 0.013) : 0;
  const compression = guard ? 0.14 : loading ? 0.1 : cast < 0 ? 0.045 : 0;
  const hingeX = (hinge?.[0] ?? originX) / width;
  const hingeY = (hinge?.[1] ?? height * 0.4) / height;
  const flap = flying ? FLAP[flightPhase] : gait * 0.12;
  const tail = Math.sin((flying ? flightPhase : phase) * TAU / 8 - 1.3) * (flying ? 0.12 : running ? 0.085 : 0.032);
  const glideTuck = flying ? (dragon ? 0.025 : 0.12) : 0;
  let tailAnchor: Pt | undefined;
  let mouthAnchor: Pt | undefined;

  for (let py = 0; py < h; py++) {
    const y = (py - padding) / height;
    const aboveFeet = Math.max(0, 1 - y);
    const legs = unit((y - 0.68) / 0.32);
    const yBody = (rise - compression) * aboveFeet;
    for (let px = 0; px < w; px++) {
      const x = (px - padding) / width;
      const body = region(x, y, hip, 0.57, 0.62, 0.64);
      const back = unit((hip - x) / 0.44);
      const arm = region(x, y, shoulder + punch * 0.07, armY, 0.34, 0.25);
      const shin = region(x, y, shoulder - 0.04 + kick * 0.1, 0.91 - kick * 0.1, 0.32, 0.29);
      const hind = Math.max(-1, Math.min(1, (hip - x) * 12));
      const foot = hind * gait * legs;
      const footLift = Math.max(0, Math.cos(phase * TAU / 8) * hind) * legs;
      const wing = hinge
        ? unit((hingeX - x) / 0.46) * unit((hingeY + 0.24 - y) / 0.34)
        : 0;
      const farWing = hinge && dragon ? region(x, y, hingeX + 0.045, 0.07, 0.19, 0.29) * (1 - wing) : 0;
      const jaw = fire?.muzzle ? region(x, y, fire.muzzle[0] / width, (fire.muzzle[1] + 2) / height, 0.15, 0.08) : 0;
      const tailTip = back * back * unit((y - 0.38) / 0.34) * (1 - wing);
      const neck = flying && dragon ? region(x, y, 0.88, 0.24, 0.24, 0.26) * (1 - wing) : 0;
      const sweptFin = flying && species === 'gible' ? region(x, y, hip + 0.12, 0.62, 0.32, 0.3) : 0;
      const sx = Math.round(px - padding - height * (
        lean * aboveFeet * (1 - back * 0.67)
        + arm * (punch * 0.17 + (guard ? 0.05 : 0) - (loading ? 0.15 : 0) + (dragon && running ? gait * 0.045 : 0))
        + jaw * openJaw * 0.04 + neck * 0.07 - sweptFin * (0.09 + flap * 0.024)
        + (dragon ? 0 : shin * kick * 0.15 + (running && !flying ? foot * 0.15 : 0) - glideTuck * legs * body)
      ) - width * wing * (flap * 0.025 + Math.abs(flap) * 0.09));
      const sy = Math.round(py - padding + height * (
        yBody + arm * (punch * 0.045 + (guard ? 0.1 : 0))
        + (dragon ? 0 : shin * kick * 0.13 + (running && !flying ? footLift * 0.16 : 0) + (flying ? legs * 0.23 * body : 0))
        - jaw * openJaw * 0.09
        - (wing * 0.35 + farWing * 0.15) * flap
        + neck * 0.065 + sweptFin * 0.045
        + tailTip * tail
      ));
      if (fire) {
        if (sx === fire.tail[0] && sy === fire.tail[1]) tailAnchor ??= [px - originX - padding, py - originY - padding];
        if (sx === fire.muzzle?.[0] && sy === fire.muzzle[1]) mouthAnchor ??= [px - originX - padding, py - originY - padding];
      }
      const color = rows[sy]?.[sx];
      if (color && color !== '.' && (!fire || !fireSpriteCut(stage, sx, sy, color))) pixels[py * w + px] = palette[parseInt(color, 36)];
    }
  }

  // The saddle is pinned to the torso. It follows lean and compression but never rides the wing tips.
  const saddle = rideX !== undefined && rideY !== undefined ? [
    rideX - originX + Math.round(height * lean * (1 - rideY / height)),
    rideY - originY - Math.round((rise - compression) * (height - rideY)),
  ] as const : undefined;
  const relative = ([x, y]: Pt): Pt => [x - originX, y - originY];
  const reference: ReferenceFrame = {
    sprite: toRuns(pixels, w, h), originX: originX + padding, originY: originY + padding, saddle,
    fire: fire && { tail: tailAnchor ?? relative(fire.tail), size: fire.flameSize,
      muzzle: fire.muzzle && (mouthAnchor ?? relative(fire.muzzle)) },
  };
  // Broaden the Mega silhouette behind the hips more than the face and chest.
  return mega ? scalePokemonFrame(reference, 2.04, 1.63, MEGA_CHARIZARD_HEIGHT_SCALE) : reference;
}
