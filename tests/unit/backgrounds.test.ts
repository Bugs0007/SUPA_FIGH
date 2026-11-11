import { beforeAll, describe, expect, it } from 'vitest';
import { MAP_LIST } from '../../src/sim/map/maps';
import { parseMap } from '../../src/sim/map/mapData';
import { TILE_DEFS } from '../../src/sim/map/tiles';

// The art modules paint into a PixelCanvas, which wants a DOM canvas: a minimal stand-in is enough here
// because the painters only touch the pixel buffer (flush() is never called).
beforeAll(() => {
  (globalThis as { document?: unknown }).document ??= {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: () => undefined }),
    }),
  };
});

const art = async () => ({
  bg: await import('../../src/art/backgroundArt'),
  tiles: await import('../../src/art/tileArt'),
  arena: await import('../../src/art/arenaArt'),
  decor: await import('../../src/art/decorArt'),
});

describe('map backgrounds and themes', () => {
  it('every map theme has a background, a painter, a tileset theme, arena colours and decor', async () => {
    const { bg, tiles, arena, decor } = await art();
    for (const m of MAP_LIST) {
      expect(bg.BACKGROUNDS[m.theme], m.id).toBeDefined();
      expect(bg.BACKGROUND_THEMES, m.id).toContain(m.theme);
      expect(tiles.THEMES[m.theme], m.id).toBeDefined();
      expect(arena.ARENA_COLORS[m.theme], m.id).toBeDefined();
    }
    for (const t of ['dojo', 'museum']) expect(decor.DECOR[t]?.length).toBeGreaterThanOrEqual(5);
  });

  it('the far layer is an opaque backdrop and painting is deterministic', async () => {
    const { bg } = await art();
    for (const theme of Object.keys(bg.BACKGROUNDS)) {
      const a = bg.paintBackgroundLayer(theme, 'far');
      const b = bg.paintBackgroundLayer(theme, 'far');
      expect(a.px.every((v) => v >>> 24 === 255), `${theme} far has holes`).toBe(true);
      expect(Buffer.from(a.px.buffer).equals(Buffer.from(b.px.buffer)), theme).toBe(true);
    }
  });

  it('declared optional layers paint something and animation frames actually change', async () => {
    const { bg } = await art();
    const filled = (pc: { px: Uint32Array }) => pc.px.some((v) => v !== 0);
    for (const [theme, def] of Object.entries(bg.BACKGROUNDS)) {
      if (def.clouds) expect(filled(bg.paintBackgroundLayer(theme, 'clouds')), `${theme} clouds`).toBe(true);
      if (def.mid !== undefined) expect(filled(bg.paintBackgroundLayer(theme, 'mid')), `${theme} mid`).toBe(true);
      if (def.fx) {
        expect(def.fx.frames).toBeGreaterThanOrEqual(2);
        const frames = Array.from({ length: def.fx.frames }, (_, f) => Buffer.from(bg.paintBackgroundLayer(theme, 'fx', f).px.buffer).toString('base64'));
        expect(new Set(frames).size, `${theme} fx frames are all identical`).toBeGreaterThan(1);
      }
    }
  });
});

describe('open indoor halls (built for hero fights)', () => {
  /** Longest run of floor columns with 4 tiles of clear air above (a fighter + a jump arc). */
  const openRun = (id: string) => {
    const def = MAP_LIST.find((m) => m.id === id)!;
    const p = parseMap(def);
    const solid = (x: number, y: number) => TILE_DEFS[p.tiles[y * p.w + x]].solid;
    const floor = p.h - 3;
    let best = 0;
    let run = 0;
    for (let x = 0; x < p.w; x++) {
      const clear = solid(x, floor) && [1, 2, 3, 4].every((k) => !solid(x, floor - k));
      run = clear ? run + 1 : 0;
      best = Math.max(best, run);
    }
    return best;
  };

  it.each(['dojo', 'museum'])('%s has a wide unbroken fighting floor, power orbs and spread spawns', (id) => {
    const def = MAP_LIST.find((m) => m.id === id)!;
    const p = parseMap(def);
    expect(openRun(id)).toBeGreaterThanOrEqual(36); // >= 576 px: room for a super's flight
    expect(p.powerSpawns.length).toBeGreaterThanOrEqual(2);
    const xs = p.spawns.map((s) => s.x).sort((a, b) => a - b);
    const openingWidth = def.district?.column ?? p.w;
    expect(xs[xs.length - 1] - xs[0]).toBeGreaterThan(openingWidth * 16 * 0.75);
  });

  it('the old segmented maps are narrower than the halls (what the halls are for)', () => {
    expect(openRun('dojo')).toBeGreaterThan(openRun('leaf'));
    expect(openRun('museum')).toBeGreaterThan(openRun('leaf'));
  });
});
