import { describe, expect, it } from 'vitest';
import { NavGraph } from '../../src/ai/nav';
import { runBotSim } from '../../src/ai/botsim';
import { MAP_LIST } from '../../src/sim/map/maps';
import { parseMap } from '../../src/sim/map/mapData';

describe.each(MAP_LIST.map((m) => [m.id, m] as const))('map %s', (_id, def) => {
  const parsed = parseMap(def);

  it('has 10 spawns, weapon spawns and consistent rows', () => {
    expect(parsed.spawns.length).toBe(10);
    expect(parsed.weaponSpawns.length).toBeGreaterThanOrEqual(4);
    const w = def.rows[0].length;
    for (const r of def.rows) expect(r.length).toBe(w);
  });

  it('every spawn can reach every other spawn (bot navigation)', () => {
    const g = new NavGraph(def);
    const nodes = parsed.spawns.map((p) => g.nodeAtPx(p.x, p.y));
    nodes.forEach((n, i) => expect(n, `spawn ${i} has no nav node`).toBeTruthy());
    const bad: string[] = [];
    for (const a of nodes) for (const b of nodes) if (a && b && !g.path(a.id, b.id)) bad.push(`${a.tx},${a.ty} -> ${b.tx},${b.ty}`);
    expect(bad, bad.slice(0, 6).join('  ')).toEqual([]);
  });

  it('weapon spawns are reachable', () => {
    const g = new NavGraph(def);
    const s = g.nodeAtPx(parsed.spawns[0].x, parsed.spawns[0].y)!;
    const bad = parsed.weaponSpawns.filter((p) => {
      const n = g.nearest(p.x, p.y);
      return !n || !g.path(s.id, n.id);
    });
    expect(bad.map((p) => `${p.x / 16 - 0.5},${p.y / 16 - 1}`)).toEqual([]);
  });

  it('hero power-up spawns (P) are reachable', () => {
    const g = new NavGraph(def);
    const s = g.nodeAtPx(parsed.spawns[0].x, parsed.spawns[0].y)!;
    for (const p of parsed.powerSpawns) {
      const n = g.nearest(p.x, p.y);
      expect(n && g.path(s.id, n.id), `power spawn ${p.x / 16 - 0.5},${p.y / 16 - 1}`).toBeTruthy();
    }
  });
});

describe('anime universe maps (M9)', () => {
  it.each(['leaf', 'ship', 'alien'])('%s has a contested power-up spot and a themed power bias', (id) => {
    const def = MAP_LIST.find((m) => m.id === id)!;
    expect(def).toBeDefined();
    expect(parseMap(def).powerSpawns.length).toBeGreaterThanOrEqual(1);
    expect(def.powerBias).toBeTruthy();
  });
});

describe('bots on every map', () => {
  it.each(MAP_LIST.map((m) => m.id))('%s: bots fight and never get stuck', (id) => {
    const r = runBotSim({ matches: 1, bots: 6, map: id, difficulty: 'normal', seed: 9, roundCap: 150 });
    expect(r.totalKills, id).toBeGreaterThan(5);
    expect(r.maxIdle, r.idleAt).toBeLessThan(10);
  });
});
