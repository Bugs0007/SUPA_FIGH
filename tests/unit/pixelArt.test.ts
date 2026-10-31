import { describe, expect, it } from 'vitest';
import { armSprite, KURAMA_MATS, kuramaSprite, SUSANOO, SUSANOO_INK, SUSANOO_MATS, SUSANOO_OUTLINE, susanooSprite, type ArmKind } from '../../src/art/avatarSprites';
import { ARROW, arrowSprite, FIRE, fireballSprite, heading, HEADINGS } from '../../src/art/fireSprites';
import { bake, inkLine, paintRuns, Raster, type Baked, type Ink } from '../../src/art/pixelRaster';
import { HEROES, SUSANOO_LAUNCH } from '../../src/sim/data/heroes';

const cells = (r: Raster, m = 1) => {
  const out: string[] = [];
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (r.get(x, y) === m) out.push(`${x},${y}`);
  return out;
};

/** every pixel of a baked sprite as "x,y" -> colour */
const pixels = (b: Baked) => {
  const m = new Map<string, number>();
  for (const r of b.runs) for (let i = 0; i < r.w; i++) m.set(`${r.x + i},${r.y}`, r.c);
  return m;
};

describe('Raster', () => {
  it('fills polygons on pixel centres: a rectangle covers exactly its pixels, no half-covered ones', () => {
    const r = new Raster(10, 10);
    r.poly([[2, 3], [6, 3], [6, 7], [2, 7]], 1);
    expect(cells(r)).toHaveLength(16);
    expect(r.get(2, 3)).toBe(1);
    expect(r.get(5, 6)).toBe(1);
    expect(r.get(6, 3)).toBe(0);
    expect(r.get(2, 7)).toBe(0);
  });

  it('even-odd: a hole stays a hole, and a triangle is about half its box', () => {
    const r = new Raster(20, 20);
    r.poly([[0, 0], [12, 0], [12, 12], [0, 12], [0, 0], [4, 4], [8, 4], [8, 8], [4, 8], [4, 4]], 1);
    expect(r.get(6, 6)).toBe(0);
    expect(r.get(1, 1)).toBe(1);
    const t = new Raster(20, 20);
    t.poly([[0, 0], [10, 0], [0, 10]], 2);
    expect(cells(t, 2).length).toBeGreaterThan(40);
    expect(cells(t, 2).length).toBeLessThan(60);
  });

  it('lines are connected and exactly as thick as asked; ellipses are symmetric; erase cuts', () => {
    const r = new Raster(30, 30);
    r.line(2, 2, 20, 9, 1, 3);
    for (let x = 3; x < 20; x++) expect([0, 1, 2].some((k) => r.get(x, Math.round(2 + ((x - 2) * 7) / 18) - 1 + k) === 1)).toBe(true);
    const e = new Raster(30, 30);
    e.ellipse(15, 15, 6, 4, 1);
    for (let x = 0; x < 30; x++) for (let y = 0; y < 30; y++) expect(e.get(x, y)).toBe(e.get(29 - x, y));
    e.erase([[12, 12], [18, 12], [18, 18], [12, 18]]);
    expect(e.get(15, 15)).toBe(0);
  });
});

describe('bake', () => {
  const mat = { dark: 0x111111, base: 0x888888, light: 0xcccccc, hi: 0xffffff };

  it('outlines a shape one pixel all around and shades it from the top left', () => {
    const r = new Raster(9, 9);
    r.rect(2, 2, 5, 5, 1);
    const px = pixels(bake(r, [mat], 0x000000, false));
    expect(px.get('1,4')).toBe(0); // outline on all four sides
    expect(px.get('7,4')).toBe(0);
    expect(px.get('4,1')).toBe(0);
    expect(px.get('4,7')).toBe(0);
    expect(px.has('1,1')).toBe(false); // but not on the diagonal corners
    expect(px.get('2,2')).toBe(mat.hi); // lit corner
    expect(px.get('4,2')).toBe(mat.light); // top edge
    expect(px.get('4,6')).toBe(mat.dark); // bottom edge
    expect(px.get('6,4')).toBe(mat.dark); // right edge
    expect(px.get('4,4')).toBe(mat.base); // the middle
  });

  it('merges neighbouring pixels of one colour into runs', () => {
    const r = new Raster(12, 3);
    r.rect(1, 1, 10, 1, 1);
    const b = bake(r, [mat], 0, false);
    const middle = b.runs.filter((q) => q.y === 1);
    expect(middle.length).toBeLessThanOrEqual(3); // lit/shaded ends, one run of the same colour between
    expect(b.runs.reduce((n, q) => n + q.w, 0)).toBe(pixels(b).size);
  });

  it('ink pixels are painted last, unoutlined and unshaded, and stay inside the canvas', () => {
    const r = new Raster(12, 6);
    r.rect(2, 2, 3, 2, 1);
    const ink: Ink[] = [];
    inkLine(ink, 0, 0, 11, 0, 0xabcdef);
    ink.push({ x: 3, y: 2, c: 0x123456 }, { x: 40, y: 2, c: 0x123456 });
    const px = pixels(bake(r, [mat], 0x000000, false, ink));
    for (let x = 0; x < 12; x++) expect(px.get(`${x},0`)).toBe(0xabcdef);
    expect(px.get('3,2')).toBe(0x123456);
    expect(px.get('3,1')).toBe(0x000000); // the shape's outline is untouched; the ink line has none of its own
    expect([...px.keys()].every((k) => Number(k.split(',')[0]) < 12)).toBe(true);
  });

  it('paintRuns puts everything on whole pixels and mirrors exactly', () => {
    const r = new Raster(8, 4);
    r.rect(1, 1, 3, 2, 1);
    const b = bake(r, [mat], 0, false);
    const record = (flip: boolean) => {
      const out: string[] = [];
      paintRuns({ fillStyle: () => 0, fillRect: (x, y, w, h) => out.push(`${x},${y},${w},${h}`) }, b, 100, 50, flip, 0.5);
      return out;
    };
    const normal = record(false);
    const flipped = record(true);
    for (const q of [...normal, ...flipped]) for (const n of q.split(',')) expect(Number.isInteger(Number(n))).toBe(true);
    // a column c lands at 100 + c normally and at 100 - c mirrored
    const col = (list: string[], row: number) => list.filter((q) => q.split(',')[1] === String(50 + row)).map((q) => q.split(',').map(Number));
    const n = col(normal, 1);
    const f = col(flipped, 1);
    const nCols = new Set(n.flatMap(([x, , w]) => Array.from({ length: w }, (_, i) => x - 100 + i)));
    const fCols = new Set(f.flatMap(([x, , w]) => Array.from({ length: w }, (_, i) => 100 - (x + i))));
    expect([...fCols].sort()).toEqual([...nCols].sort());
  });
});

const ALLOWED = new Set<number>([SUSANOO_OUTLINE, ...Object.values(SUSANOO_INK), ...SUSANOO_MATS.flatMap((m) => [m.dark, m.base, m.light, m.hi])]);
const GLOWS = new Set([SUSANOO_MATS[4].dark, SUSANOO_MATS[4].base, SUSANOO_MATS[4].light, SUSANOO_MATS[4].hi]);

const bounds = (b: Baked) => {
  let minX = Infinity;
  let maxX = -1;
  let minY = Infinity;
  let maxY = -1;
  for (const r of b.runs) {
    minX = Math.min(minX, r.x);
    maxX = Math.max(maxX, r.x + r.w - 1);
    minY = Math.min(minY, r.y);
    maxY = Math.max(maxY, r.y);
  }
  return { minX, maxX, minY, maxY };
};
const key = (b: Baked) => b.runs.map((r) => `${r.x},${r.y},${r.w},${r.c}`).join('|');

describe('spirit sprites', () => {
  it('Susanoo: both forms, every stage and frame fit their canvas (nothing clipped) and use only the palette', () => {
    for (const level of [3, 4] as const) {
      for (let stage = 0; stage <= SUSANOO.rest; stage++) {
        for (let frame = 0; frame < 3; frame++) {
          const b = susanooSprite(level, stage, frame);
          const bb = bounds(b);
          expect(bb.minX, `L${level} s${stage} f${frame}`).toBeGreaterThan(0);
          expect(bb.minY).toBeGreaterThan(0);
          expect(bb.maxX).toBeLessThan(b.w - 1);
          expect(bb.maxY).toBeLessThan(b.h - 1);
          for (const r of b.runs) for (const n of [r.x, r.y, r.w]) expect(Number.isInteger(n)).toBe(true);
          for (const c of pixels(b).values()) expect(ALLOWED.has(c)).toBe(true);
          // the spirit stands on the fighter's feet: nothing below the floor row
          expect(bb.maxY).toBeLessThan(SUSANOO.ay);
        }
      }
    }
  });

  it('Susanoo animates: the bow draws back, the flames flicker, the shot flashes, the Perfect form differs', () => {
    expect(key(susanooSprite(3, 0, 0))).not.toBe(key(susanooSprite(3, 3, 0)));
    expect(key(susanooSprite(3, 0, 0))).not.toBe(key(susanooSprite(3, 0, 1)));
    expect(key(susanooSprite(4, 0, 0))).not.toBe(key(susanooSprite(4, 0, 1))); // the wings beat
    expect(key(susanooSprite(3, SUSANOO.shot, 0))).not.toBe(key(susanooSprite(3, SUSANOO.rest, 0)));
    expect(key(susanooSprite(4, 0, 0))).not.toBe(key(susanooSprite(3, 0, 0)));
    expect(susanooSprite(4, 2, 1)).toBe(susanooSprite(4, 2, 1)); // cached
    expect(susanooSprite(3, 99, 0)).toBe(susanooSprite(3, SUSANOO.rest, 0)); // stages clamp
  });

  it('Susanoo is 2-3 fighters tall (fighters are 22 px), a few distinct colours, the eye glows', () => {
    for (const level of [3, 4] as const) {
      const b = susanooSprite(level, 0, 0);
      const height = SUSANOO.ay - bounds(b).minY;
      expect(height, `L${level}`).toBeGreaterThanOrEqual(2 * 22);
      expect(height).toBeLessThanOrEqual(3.8 * 22); // (crown spikes and wing tips included)
      const colours = new Set(pixels(b).values());
      expect(colours.size).toBeLessThan(40);
      expect(colours.has(SUSANOO_MATS[4].base) || colours.has(SUSANOO_MATS[4].light)).toBe(true);
    }
  });

  it('the arrowhead sits exactly on the sim launch point while drawing; the shot flashes just past it', () => {
    for (const level of [3, 4] as const) {
      const { ahead, up } = SUSANOO_LAUNCH[level];
      // the body is drawn to the same proportions the launch point was chosen for
      expect(Math.abs(ahead - 30 * SUSANOO.scale[level])).toBeLessThanOrEqual(1.5);
      expect(Math.abs(up - 31 * SUSANOO.scale[level])).toBeLessThanOrEqual(1.5);
      const at = `${SUSANOO.ax + ahead},${SUSANOO.ay - up}`;
      for (let stage = 0; stage < SUSANOO.stages; stage++) {
        const px = pixels(susanooSprite(level, stage, 0));
        expect(GLOWS.has(px.get(at)!), `L${level} s${stage}`).toBe(true);
        expect(px.get(`${SUSANOO.ax + ahead + 1},${SUSANOO.ay - up}`)).toBe(SUSANOO_OUTLINE); // the point, outlined
      }
      const shot = pixels(susanooSprite(level, SUSANOO.shot, 0));
      expect(shot.get(`${SUSANOO.ax + ahead + 4},${SUSANOO.ay - up}`)).toBe(SUSANOO_INK.flash);
      // the arrow has left: no arrowhead at rest
      expect(GLOWS.has(pixels(susanooSprite(level, SUSANOO.rest, 0)).get(at) ?? -1)).toBe(false);
    }
  });

  it('the string is single-pixel ink whose middle is pulled back as the bow draws', () => {
    const row = SUSANOO.ay - SUSANOO_LAUNCH[3].up;
    const strings = (stage: number) =>
      [...pixels(susanooSprite(3, stage, 0)).entries()].filter(([p, c]) => c === SUSANOO_INK.string && Number(p.split(',')[1]) === row).map(([p]) => Number(p.split(',')[0]));
    expect(Math.min(...strings(3))).toBeLessThan(Math.min(...strings(0)) - 10);
  });

  it('Kurama: nine tails fit the canvas (no clipping), the sprite is deterministic and its animation differs', () => {
    for (let f = 0; f < 3; f++) {
      const b = kuramaSprite(f);
      const bb = bounds(b);
      expect(bb.minX, `frame ${f}`).toBeGreaterThan(0);
      expect(bb.minY).toBeGreaterThan(0);
      expect(bb.maxX).toBeLessThan(b.w - 1);
      expect(bb.maxY).toBeLessThan(b.h - 1);
      const allowed = new Set<number>(KURAMA_MATS.flatMap((m) => [m.dark, m.base, m.light, m.hi]));
      for (const c of pixels(b).values()) expect(allowed.has(c) || c === 0x3b1a0c).toBe(true);
    }
    expect(key(kuramaSprite(0))).not.toBe(key(kuramaSprite(1)));
    expect(kuramaSprite(0)).toBe(kuramaSprite(0));
  });
});

describe('arm sprites (the transformed punches)', () => {
  const spec = (kind: ArmKind, ext: number, d: 1 | -1 = 1) => {
    const sx = 100;
    const sy = 60;
    const hx = Math.round(sx + d * 36 * ext);
    return { kind, s: [sx, sy] as [number, number], e: [Math.round((sx + hx) / 2), 52] as [number, number], h: [hx, 56] as [number, number], d, thick: 5 };
  };

  it.each(['susanoo', 'kurama', 'claw'] as ArmKind[])('%s: from windup to full reach the arm is whole, inside its canvas, and the fist leads', (kind) => {
    let lastReach = -1;
    for (const ext of [0.15, 0.4, 0.7, 1]) {
      const a = armSprite(spec(kind, ext));
      const bb = bounds(a.baked);
      expect(bb.minX, `${kind} ${ext}`).toBeGreaterThan(0);
      expect(bb.minY).toBeGreaterThan(0);
      expect(bb.maxX).toBeLessThan(a.baked.w - 1);
      expect(bb.maxY).toBeLessThan(a.baked.h - 1);
      const reach = a.ox + bb.maxX; // the claws / fist are the furthest thing forward
      expect(reach).toBeGreaterThan(lastReach);
      lastReach = reach;
      expect(reach).toBeGreaterThanOrEqual(spec(kind, ext).h[0] + 5); // the fist is drawn past the hand point
    }
  });

  it('facing left mirrors the arm; the claws point where the fist faces', () => {
    const right = armSprite(spec('claw', 1, 1));
    const left = armSprite(spec('claw', 1, -1));
    const rb = bounds(right.baked);
    const lb = bounds(left.baked);
    expect(right.ox + rb.maxX).toBeGreaterThan(100 + 30); // forward = +x
    expect(left.ox + lb.minX).toBeLessThan(100 - 30); // forward = -x
  });

  it('is deterministic (same arm, same pixels)', () => {
    const a = armSprite(spec('susanoo', 0.6));
    const b = armSprite(spec('susanoo', 0.6));
    expect(a.baked.runs).toEqual(b.baked.runs);
    expect(new Set(pixels(a.baked).values()).size).toBeLessThan(25);
  });
});

describe('fire jutsu sprites (Sasuke)', () => {
  const fb = HEROES.sasuke.second.fireball!;
  const FIRE_COLOURS = new Set([FIRE.outline, FIRE.red, FIRE.orange, FIRE.yellow, FIRE.core]);
  /** world pixels of a world sprite placed on (0, 0) */
  const world = (s: { baked: Baked; ox: number; oy: number }) => {
    const m = new Map<string, number>();
    for (const r of s.baked.runs) for (let i = 0; i < r.w; i++) m.set(`${s.ox + r.x + i},${s.oy + r.y}`, r.c);
    return m;
  };

  it('the fireball is drawn to the hitbox: its leading edge is the sim radius ahead of the centre, at every form', () => {
    for (const level of [0, 1, 2]) {
      const radius = fb.size + fb.sizePerLevel * level;
      for (let frame = 0; frame < 4; frame++) {
        const px = world(fireballSprite(radius, heading(1, 0), frame));
        let front = 0;
        while (px.has(`${front + 1},0`)) front++;
        // the last filled pixel ahead is the outline, one past the rim
        expect(Math.abs(front - (radius + 1)), `level ${level} frame ${frame}`).toBeLessThanOrEqual(1.5);
        expect(px.get(`${front},0`)).toBe(FIRE.outline);
        expect(px.get('2,0')).toBe(FIRE.core); // white-hot core, a little ahead of the middle
        // a short tail: tongues behind the ball, never more than about twice the radius back
        const behind = [...px.keys()].map((k) => Number(k.split(',')[0])).filter((x) => x < -radius - 1);
        expect(behind.length).toBeGreaterThan(0);
        expect(Math.min(...behind)).toBeGreaterThan(-radius * 2.4 - 2);
      }
    }
  });

  it('fireball frames: whole pixels, only fire colours, an outline all round, frames differ, cached and deterministic', () => {
    const a = fireballSprite(11.4, 0, 0);
    for (const r of a.baked.runs) for (const n of [r.x, r.y, r.w]) expect(Number.isInteger(n)).toBe(true);
    expect(Number.isInteger(a.ox) && Number.isInteger(a.oy)).toBe(true);
    for (const c of pixels(a.baked).values()) expect(FIRE_COLOURS.has(c)).toBe(true);
    const bb = bounds(a.baked);
    expect(bb.minX).toBeGreaterThan(0);
    expect(bb.minY).toBeGreaterThan(0);
    expect(bb.maxX).toBeLessThan(a.baked.w - 1);
    expect(bb.maxY).toBeLessThan(a.baked.h - 1);
    expect(key(fireballSprite(11.4, 0, 1).baked)).not.toBe(key(a.baked));
    expect(fireballSprite(11.4, 0, 4)).toBe(a); // four frames loop
    expect(fireballSprite(11.4, 0, 0)).toBe(a);
    // the bigger form is a bigger ball
    expect(pixels(fireballSprite(13.8, 0, 0).baked).size).toBeGreaterThan(pixels(fireballSprite(9, 0, 0).baked).size);
  });

  it('headings: 32 directions, a ball flying left is the one flying right turned half round', () => {
    expect(heading(1, 0)).toBe(0);
    expect(heading(-1, 0)).toBe(HEADINGS / 2);
    expect(heading(0, 1)).toBe(HEADINGS / 4);
    expect(heading(1, -1e-9)).toBe(0);
    const right = world(fireballSprite(9, 0, 2));
    const left = world(fireballSprite(9, HEADINGS / 2, 2));
    expect(left.size).toBe(right.size);
    for (const [k, c] of right) {
      const [x, y] = k.split(',').map(Number);
      expect(left.get(`${-x},${-y}`)).toBe(c); // (a half turn: the same pixels)
    }
  });

  it("Susanoo's arrow in flight points where it flies", () => {
    for (const dir of [0, 4, 16]) {
      const s = arrowSprite(7, dir, 0);
      const a = (dir / HEADINGS) * Math.PI * 2;
      let best = -Infinity;
      let bestC = -1;
      for (const [k, c] of world(s)) {
        const [x, y] = k.split(',').map(Number);
        const f = x * Math.cos(a) + y * Math.sin(a);
        if (f > best) {
          best = f;
          bestC = c;
        }
      }
      expect([ARROW.head, ARROW.outline]).toContain(bestC);
      expect(best).toBeLessThanOrEqual(3);
    }
  });
});
