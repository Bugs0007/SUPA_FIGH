import { describe, expect, it } from 'vitest';
import { armSprite, KURAMA, KURAMA_MOUTH, KURAMA_COLOURS, kuramaSprite, SPIRIT_FRAMES, SUSANOO, SUSANOO_INK, SUSANOO_GLOW, SUSANOO_HALO, SUSANOO_COLOURS, susanooSprite, type ArmKind, type ArmSpec } from '../../src/art/avatarSprites';
import { ARROW, arrowSprite, FIRE, fireballSprite, heading, HEADINGS } from '../../src/art/fireSprites';
import { bake, bakeSpirit, inkLine, paintRuns, Raster, type Baked, type Ink, type SpiritMat } from '../../src/art/pixelRaster';
import { HEROES, SUSANOO_LAUNCH, KURAMA_LAUNCH } from '../../src/sim/data/heroes';

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

describe('bakeSpirit (translucent chakra, D88)', () => {
  const tones = [0xffffff, 0xcccccc, 0x888888, 0x444444] as const;
  const alpha = [1, 0.8, 0.6, 0.4] as const;
  const mass: SpiritMat = { tones, alpha, group: 1, layer: 0 };
  const part: SpiritMat = { tones: [0xff0000, 0xcc0000, 0x880000, 0x440000], alpha, group: 2, layer: 1 };
  const dot: SpiritMat = { tones: [0x00ff00, 0x00ff00, 0x00ff00, 0x00ff00], alpha: [0.9, 0.9, 0.9, 0.9], flat: true };
  const halo = { c: 0x123456, a: 0.3 };
  const alphas = (b: Baked) => {
    const m = new Map<string, number>();
    for (const r of b.runs) for (let i = 0; i < r.w; i++) m.set(`${r.x + i},${r.y}`, r.a ?? 1);
    return m;
  };

  it('bands a part from its edge inward (rim, inner, body, core), each with its own opacity, and haloes it', () => {
    const r = new Raster(16, 16);
    r.rect(2, 2, 11, 11, 1);
    const b = bakeSpirit(r, [mass], halo);
    const px = pixels(b);
    const al = alphas(b);
    expect(px.get('2,7')).toBe(tones[0]); // the edge: rim
    expect(al.get('2,7')).toBe(1);
    expect(px.get('3,7')).toBe(tones[1]); // one in: inner
    expect(px.get('4,7')).toBe(tones[2]); // then two of body
    expect(px.get('5,7')).toBe(tones[2]);
    expect(px.get('7,7')).toBe(tones[3]); // the core: darkest and most see-through
    expect(al.get('7,7')).toBeCloseTo(0.4);
    expect(px.get('1,7')).toBe(halo.c); // a faint halo all round, not on the diagonal corners
    expect(al.get('1,7')).toBeCloseTo(0.3);
    expect(px.has('1,1')).toBe(false);
  });

  it('a part on a higher layer gets its own rim; the mass under it keeps its bands; flat details cut nothing', () => {
    const r = new Raster(20, 20);
    r.rect(2, 2, 15, 15, 1);
    r.rect(8, 8, 3, 3, 2); // a small plate in the middle of the mass
    r.set(5, 9, 3); // a flat dot
    const b = bakeSpirit(r, [mass, part, dot], halo);
    const px = pixels(b);
    expect(px.get('9,9')).toBe(0xcc0000); // centre is in the second distance band
    expect(px.get('8,9')).toBe(0xff0000);
    expect(px.get('7,9')).toBe(tones[3]); // the mass right next to the plate is still core, not a rim
    expect(px.get('5,9')).toBe(0x00ff00);
    expect(px.get('6,9')).toBe(tones[3]); // and next to the flat dot too
    expect(px.get('4,9')).toBe(tones[2]);
  });

  it('runs keep one opacity each; paintRuns multiplies it by the fade', () => {
    const r = new Raster(12, 3);
    r.rect(0, 1, 12, 1, 1);
    const b = bakeSpirit(r, [mass], halo);
    for (const q of b.runs) expect(q.a).toBeGreaterThan(0);
    const styles: number[] = [];
    paintRuns({ fillStyle: (_c, a) => styles.push(a ?? 1), fillRect: () => 0 }, b, 0, 0, false, 0.5);
    expect(Math.max(...styles)).toBeLessThanOrEqual(0.5);
    expect(styles).toContain(0.5); // the rim (alpha 1) at half fade
    expect(styles.some((a) => Math.abs(a - 0.15) < 1e-6)).toBe(true); // the halo (0.3) at half fade
  });
});

const GLOW_AT = (b: Baked, at: string) => pixels(b).get(at) === SUSANOO_GLOW;

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
const key = (b: Baked) => b.runs.map((r) => `${r.x},${r.y},${r.w},${r.c},${r.a}`).join('|');
/** share of a sprite's pixels you can see through (opacity under 0.75) and how many are bright rim (0.9 and up) */
const translucency = (b: Baked) => {
  let n = 0;
  let see = 0;
  let rim = 0;
  for (const r of b.runs) {
    n += r.w;
    if ((r.a ?? 1) < 0.75) see += r.w;
    if ((r.a ?? 1) >= 0.9) rim += r.w;
  }
  return { see: see / n, rim: rim / n };
};
const FIGHTER_H = 22;

describe('spirit sprites (translucent, D88)', () => {
  it('Susanoo: both forms, every stage and frame fit their canvas, use only the palette, whole pixels, on the feet', () => {
    for (const level of [3, 4] as const) {
      for (let stage = 0; stage <= SUSANOO.rest; stage++) {
        for (let frame = 0; frame < SPIRIT_FRAMES; frame++) {
          const b = susanooSprite(level, stage, frame);
          const bb = bounds(b);
          expect(bb.minX, `L${level} s${stage} f${frame}`).toBeGreaterThan(0);
          expect(bb.minY).toBeGreaterThan(0);
          expect(bb.maxX).toBeLessThan(b.w - 1);
          expect(bb.maxY).toBeLessThan(b.h - 1);
          for (const r of b.runs) for (const n of [r.x, r.y, r.w]) expect(Number.isInteger(n)).toBe(true);
          for (const r of b.runs) expect((r.a ?? 1) > 0 && (r.a ?? 1) <= 1).toBe(true);
          for (const c of pixels(b).values()) expect(SUSANOO_COLOURS.has(c)).toBe(true);
          // the spirit stands on the fighter's feet: nothing below the floor row
          expect(bb.maxY).toBeLessThan(SUSANOO.ay);
        }
      }
    }
  });

  it('Susanoo is translucent like the one-tail cloak: a bright rim, a see-through interior', () => {
    for (const level of [3, 4] as const) {
      const t = translucency(susanooSprite(level, 1, 0));
      expect(t.see, `L${level}`).toBeGreaterThan(0.35);
      expect(t.rim).toBeGreaterThan(0.15);
    }
  });

  it('Susanoo animates: the bow draws back, the flames flicker over four frames, the shot flashes, the forms differ', () => {
    expect(key(susanooSprite(3, 0, 0))).not.toBe(key(susanooSprite(3, 3, 0)));
    for (let f = 1; f < SPIRIT_FRAMES; f++) {
      expect(key(susanooSprite(3, 0, 0))).not.toBe(key(susanooSprite(3, 0, f)));
      expect(key(susanooSprite(4, 0, 0))).not.toBe(key(susanooSprite(4, 0, f))); // and the wing beats
    }
    expect(susanooSprite(3, 0, SPIRIT_FRAMES)).toBe(susanooSprite(3, 0, 0)); // the frames loop
    expect(key(susanooSprite(3, SUSANOO.shot, 0))).not.toBe(key(susanooSprite(3, SUSANOO.rest, 0)));
    expect(key(susanooSprite(4, 0, 0))).not.toBe(key(susanooSprite(3, 0, 0)));
    expect(susanooSprite(4, 2, 1)).toBe(susanooSprite(4, 2, 1)); // cached
    expect(susanooSprite(3, 99, 0)).toBe(susanooSprite(3, SUSANOO.rest, 0)); // stages clamp
  });

  it('Susanoo is about three fighters tall (a little more for the Perfect crown and wing), the eye glows', () => {
    for (const level of [3, 4] as const) {
      const b = susanooSprite(level, 0, 0);
      const height = SUSANOO.ay - bounds(b).minY;
      expect(height, `L${level}`).toBeGreaterThanOrEqual(3 * FIGHTER_H);
      expect(height).toBeLessThanOrEqual(4 * FIGHTER_H);
      expect(new Set(pixels(b).values()).size).toBeLessThan(48);
      const glows = [...pixels(b).entries()].filter(([p, c]) => c === SUSANOO_GLOW && Number(p.split(',')[1]) < SUSANOO.ay - 55);
      expect(glows.length, 'the eye').toBeGreaterThan(0);
    }
  });

  it('the arrowhead sits exactly on the sim launch point while drawing; the shot flashes just past it', () => {
    for (const level of [3, 4] as const) {
      const { ahead, up } = SUSANOO_LAUNCH[level];
      const at = `${SUSANOO.ax + ahead},${SUSANOO.ay - up}`;
      for (let stage = 0; stage < SUSANOO.stages; stage++) {
        const b = susanooSprite(level, stage, 0);
        expect(GLOW_AT(b, at), `L${level} s${stage}`).toBe(true);
        expect(pixels(b).get(`${SUSANOO.ax + ahead + 1},${SUSANOO.ay - up}`)).toBe(SUSANOO_HALO.c); // the point, haloed
      }
      const shot = pixels(susanooSprite(level, SUSANOO.shot, 0));
      expect(shot.get(`${SUSANOO.ax + ahead + 4},${SUSANOO.ay - up}`)).toBe(SUSANOO_INK.flash);
      // the arrow has left: no arrowhead at rest
      expect(GLOW_AT(susanooSprite(level, SUSANOO.rest, 0), at)).toBe(false);
    }
  });

  it('the string is single-pixel ink whose middle is pulled back as the bow draws', () => {
    for (const level of [3, 4] as const) {
      const row = SUSANOO.ay - SUSANOO_LAUNCH[level].up;
      const strings = (stage: number) =>
        [...pixels(susanooSprite(level, stage, 0)).entries()].filter(([p, c]) => c === SUSANOO_INK.string && Number(p.split(',')[1]) === row).map(([p]) => Number(p.split(',')[0]));
      expect(Math.min(...strings(3))).toBeLessThan(Math.min(...strings(0)) - 20);
    }
  });

  it('Kurama: every frame and both poses fit the canvas, use only the palette, stand on the feet, are translucent', () => {
    for (const roar of [false, true]) {
      for (let f = 0; f < SPIRIT_FRAMES; f++) {
        const b = kuramaSprite(f, roar);
        const bb = bounds(b);
        expect(bb.minX, `frame ${f}`).toBeGreaterThan(0);
        expect(bb.minY).toBeGreaterThan(0);
        expect(bb.maxX).toBeLessThan(b.w - 1);
        expect(bb.maxY).toBeLessThan(KURAMA.ay);
        for (const c of pixels(b).values()) expect(KURAMA_COLOURS.has(c)).toBe(true);
        const height = KURAMA.ay - bb.minY;
        expect(height).toBeGreaterThanOrEqual(3 * FIGHTER_H);
        expect(height).toBeLessThanOrEqual(3.8 * FIGHTER_H);
        const t = translucency(b);
        expect(t.see).toBeGreaterThan(0.3);
        expect(t.rim).toBeGreaterThan(0.15);
      }
    }
    expect(key(kuramaSprite(0))).not.toBe(key(kuramaSprite(1)));
    expect(key(kuramaSprite(0))).not.toBe(key(kuramaSprite(0, true)));
    expect(kuramaSprite(0)).toBe(kuramaSprite(0));
    expect(kuramaSprite(SPIRIT_FRAMES, true)).toBe(kuramaSprite(0, true));
  });

  it('Kurama roars the Bijudama out of its open mouth: the launch point is right in front of the dark mouth', () => {
    for (let f = 0; f < SPIRIT_FRAMES; f++) {
      const px = pixels(kuramaSprite(f, true));
      expect(px.get(`${KURAMA.ax + KURAMA_LAUNCH.ahead - 6},${KURAMA.ay - KURAMA_LAUNCH.up}`), `frame ${f}`).toBe(KURAMA_MOUTH);
      // the mouth is wide open: dark pixels at least 8 rows tall around the launch column
      const col = [...px.entries()].filter(([p, c]) => c === KURAMA_MOUTH && Number(p.split(',')[0]) === KURAMA.ax + KURAMA_LAUNCH.ahead - 6);
      expect(col.length).toBeGreaterThanOrEqual(8);
    }
  });
});

describe('arm sprites (the transformed punches)', () => {
  const spec = (kind: ArmKind, ext: number, d: 1 | -1 = 1, step: 0 | 1 | 2 = 2): ArmSpec => {
    const sx = 100;
    const sy = 60;
    const hx = Math.round(sx + d * 36 * ext);
    return { kind, s: [sx, sy], e: [Math.round((sx + hx) / 2), 52], h: [hx, 56], d, thick: 5, step };
  };
  const KINDS: ArmKind[] = ['susanoo', 'susanooBone', 'kurama', 'claw'];

  it.each(KINDS)('%s: from windup to full reach the arm is whole, inside its canvas, and the fist leads', (kind) => {
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

  it('the spirit arms are translucent in their palettes; the red cloak arm stays solid', () => {
    for (const kind of ['susanoo', 'susanooBone', 'kurama'] as ArmKind[]) {
      const b = armSprite(spec(kind, 0.8)).baked;
      expect(b.runs.some((r) => (r.a ?? 1) < 0.75), kind).toBe(true);
      const palette = kind === 'kurama' ? KURAMA_COLOURS : SUSANOO_COLOURS;
      for (const c of pixels(b).values()) expect(palette.has(c), kind).toBe(true);
    }
    expect(armSprite(spec('claw', 0.8)).baked.runs.every((r) => r.a === undefined)).toBe(true);
  });

  it('the three-step punch: open claw, curling fingers, fist all differ; flames flicker on the chakra arm', () => {
    for (const kind of ['susanoo', 'susanooBone', 'kurama'] as ArmKind[]) {
      const steps = ([0, 1, 2] as const).map((s) => key(armSprite(spec(kind, 0.6, 1, s)).baked));
      expect(new Set(steps).size, kind).toBe(3);
    }
    expect(key(armSprite({ ...spec('kurama', 0.6), frame: 0 }).baked)).not.toBe(key(armSprite({ ...spec('kurama', 0.6), frame: 1 }).baked));
  });

  it('facing left mirrors the arm; the claws point where the fist faces', () => {
    for (const kind of KINDS) {
      const right = armSprite(spec(kind, 1, 1));
      const left = armSprite(spec(kind, 1, -1));
      expect(right.ox + bounds(right.baked).maxX, kind).toBeGreaterThan(100 + 30); // forward = +x
      expect(left.ox + bounds(left.baked).minX, kind).toBeLessThan(100 - 30); // forward = -x
    }
  });

  it('is deterministic, and baked once per shape: the same arm elsewhere reuses the runs at a shifted origin', () => {
    const a = armSprite(spec('susanoo', 0.6));
    const b = armSprite(spec('susanoo', 0.6));
    expect(a.baked.runs).toEqual(b.baked.runs);
    const moved = armSprite({ ...spec('susanoo', 0.6), s: [140, 90], e: [151, 82], h: [162, 86] });
    expect(moved.baked).toBe(a.baked);
    expect(moved.ox - a.ox).toBe(40);
    expect(moved.oy - a.oy).toBe(30);
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
