import { describe, expect, it } from 'vitest';
import { armSprite, KURAMA_MATS, kuramaSprite, SUSANOO, SUSANOO_MATS, SUSANOO_OUTLINE, susanooSprite, type ArmKind } from '../../src/art/avatarSprites';
import { bake, paintRuns, Raster, type Baked } from '../../src/art/pixelRaster';

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

const ALLOWED = new Set<number>([SUSANOO_OUTLINE, ...SUSANOO_MATS.flatMap((m) => [m.dark, m.base, m.light, m.hi])]);

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

describe('spirit sprites', () => {
  it('Susanoo: both forms fit their canvas (nothing clipped), use only the palette, and animate', () => {
    for (const level of [3, 4] as const) {
      for (let stage = 0; stage < SUSANOO.stages; stage++) {
        for (let frame = 0; frame < 3; frame++) {
          const b = susanooSprite(level, stage, frame);
          const bb = bounds(b);
          expect(bb.minX, `L${level} s${stage} f${frame}`).toBeGreaterThan(0);
          expect(bb.minY).toBeGreaterThan(0);
          expect(bb.maxX).toBeLessThan(b.w - 1);
          expect(bb.maxY).toBeLessThan(b.h - 1);
          for (const c of pixels(b).values()) expect(ALLOWED.has(c)).toBe(true);
        }
      }
    }
    const key = (b: Baked) => b.runs.map((r) => `${r.x},${r.y},${r.w},${r.c}`).join('|');
    expect(key(susanooSprite(3, 0, 0))).not.toBe(key(susanooSprite(3, 3, 0))); // the bow is drawn back
    expect(key(susanooSprite(3, 0, 0))).not.toBe(key(susanooSprite(3, 0, 1))); // the hem flickers
    expect(key(susanooSprite(4, 0, 0))).not.toBe(key(susanooSprite(3, 0, 0))); // the Perfect form has wings
    expect(susanooSprite(4, 2, 1)).toBe(susanooSprite(4, 2, 1)); // cached
  });

  it('Susanoo and Kurama are pixel art: no fractional coordinates, few distinct colours, the eye glows', () => {
    const s = susanooSprite(3, 0, 0);
    const colours = new Set(pixels(s).values());
    expect(colours.size).toBeLessThan(30);
    for (const r of s.runs) for (const n of [r.x, r.y, r.w]) expect(Number.isInteger(n)).toBe(true);
    expect(colours.has(SUSANOO_MATS[4].base)).toBe(true); // the glowing eye
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
    const key = (b: Baked) => b.runs.map((r) => `${r.x},${r.y},${r.w},${r.c}`).join('|');
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
