import type { Baked, Pt } from './pixelRaster';

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
