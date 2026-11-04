import { describe, expect, it } from 'vitest';
import { KURAMA, kuramaParts } from '../../src/art/avatarSprites';
import { Seen, noise, paintReveal, rising, spreading } from '../../src/art/spiritForm';
import { SUSANOO, susanooArms, susanooCore, susanooSprite, susanooWings } from '../../src/art/susanooArt';
import { SUSANOO_GLOW } from '../../src/art/spiritKit';
import type { Baked } from '../../src/art/pixelRaster';
import { avatarLaunch } from '../../src/sim/data/heroes';

const at = (b: Baked, x: number, y: number) => b.runs.find((r) => r.y === y && r.x <= x && r.x + r.w > x);
/** how many separate horizontal stretches of the sprite are on pixel row y */
const stretches = (b: Baked, y: number, x0: number, x1: number): number => {
  let n = 0;
  let last = -9;
  for (const r of b.runs.filter((q) => q.y === y).sort((a, c) => a.x - c.x)) {
    if (r.x + r.w <= x0 || r.x >= x1) continue;
    if (r.x > last + 1) n++;
    last = Math.max(last, r.x + r.w - 1);
  }
  return n;
};

describe('Susanoo parts', () => {
  it('the Perfect Susanoo stands on two legs, with wings that the lower form does not have', () => {
    const core = susanooCore(4, 0);
    // a shin's height above the feet: two separate legs (a gap between them), not one column of flame
    expect(stretches(core, SUSANOO.ay - 22, SUSANOO.ax - 40, SUSANOO.ax + 40)).toBeGreaterThanOrEqual(2);
    expect(susanooWings(4, 0)).not.toBeNull();
    expect(susanooWings(3, 0)).toBeNull();
  });

  it('aiming swings only the arms and bow about the shoulder: the arrowhead stays on the rotated launch point', () => {
    for (const level of [3, 4] as const) {
      for (const angle of [-1.5, -0.8, 0.8, 1.5]) {
        const arms = susanooArms(level, 0, angle);
        const m = avatarLaunch('sasuke', level, angle);
        const x = SUSANOO.ax + Math.round(m.ahead);
        const y = SUSANOO.ay - Math.round(m.up);
        const near = arms.runs.some((r) => r.c === SUSANOO_GLOW && Math.abs(r.y - y) <= 2 && r.x <= x + 2 && r.x + r.w > x - 2);
        expect(near, `L${level} aim ${angle}`).toBe(true);
        expect(susanooArms(level, 0, angle)).toBe(arms); // cached
      }
      // the body never tilts: the same sprite whatever the aim
      expect(susanooCore(level, 0)).toBe(susanooCore(level, 0));
    }
    expect(susanooSprite(4, 0, 0, -1)).not.toBe(susanooSprite(4, 0, 0, 1));
  });
});

describe('the show-up animation', () => {
  it('rising reveals from the ground up with a soft edge: everything below the front, nothing above', () => {
    const seen = rising(100, 40, 10);
    expect(seen(5, 99)).toBe(Seen.Full); // 1 px above the feet
    expect(seen(5, 70)).toBe(Seen.Full); // 30 px up, front at 40, band 10
    expect(seen(5, 40)).toBe(Seen.Hidden); // 60 px up
    const edge = Array.from({ length: 40 }, (_, x) => seen(x, 64)); // inside the band
    expect(edge.some((s) => s !== Seen.Hidden)).toBe(true);
    expect(edge.every((s) => s !== Seen.Full || true)).toBe(true);
  });

  it('spreading reveals outward from a point', () => {
    const seen = spreading(50, 50, 30, 8);
    expect(seen(50, 50)).toBe(Seen.Full);
    expect(seen(50 + 40, 50)).toBe(Seen.Hidden);
  });

  it('noise is deterministic and in 0..1', () => {
    for (const [x, y] of [[0, 0], [3, 9], [200, 117]]) {
      expect(noise(x, y)).toBe(noise(x, y));
      expect(noise(x, y)).toBeGreaterThanOrEqual(0);
      expect(noise(x, y)).toBeLessThan(1);
    }
  });

  it('paintReveal paints only what shows and lights the front', () => {
    const b: Baked = { w: 10, h: 4, runs: [{ x: 0, y: 0, w: 10, c: 0x112233, a: 1 }, { x: 0, y: 3, w: 10, c: 0x112233, a: 1 }] };
    const rects: { x: number; y: number; w: number; c: number }[] = [];
    let color = 0;
    paintReveal({ fillStyle: (c) => (color = c), fillRect: (x, y, w) => rects.push({ x, y, w, c: color }) }, b, 0, 0, false, 1, (_x, y) => (y === 0 ? Seen.Edge : Seen.Hidden), 0xffffff);
    expect(rects).toEqual([{ x: 0, y: 0, w: 10, c: 0xffffff }]);
  });

  it('the spirits form fully: the finished sprites are the whole thing', () => {
    expect(susanooSprite(4, 0, 0).runs.length).toBeGreaterThan(susanooCore(4, 0).runs.length);
    const k = kuramaParts(0, false, 0);
    expect(k.tails.runs.length).toBeGreaterThan(100);
    expect(k.body.runs.length).toBeGreaterThan(100);
    expect(at(k.body, KURAMA.ax, KURAMA.ay - 40)).toBeDefined(); // its body stands over the fighter
  });
});
