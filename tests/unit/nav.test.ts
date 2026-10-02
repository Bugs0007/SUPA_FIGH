import { describe, expect, it } from 'vitest';
import { navFor, NavGraph } from '../../src/ai/nav';
import { getMap } from '../../src/sim/map/maps';
import { parseMap } from '../../src/sim/map/mapData';

describe('nav graph', () => {
  const def = getMap('test');
  const g = new NavGraph(def);

  it('builds fast enough to do at round start', () => {
    console.log(`nav: ${g.nodes.length} nodes, ${g.nodes.reduce((s, n) => s + n.edges.length, 0)} edges, ${g.buildMs.toFixed(0)} ms`);
    expect(g.nodes.length).toBeGreaterThan(100);
    expect(g.buildMs).toBeLessThan(1500);
  });

  it('every spawn point can reach every other spawn point', () => {
    const spawns = parseMap(def).spawns.map((p) => g.nodeAtPx(p.x, p.y)!);
    expect(spawns.every(Boolean)).toBe(true);
    for (const a of spawns) for (const b of spawns) expect(g.path(a.id, b.id), `${a.tx},${a.ty} -> ${b.tx},${b.ty}`).not.toBeNull();
  });

  it('uses every kind of edge on the test arena', () => {
    const kinds = new Set(g.nodes.flatMap((n) => n.edges.map((e) => e.kind)));
    for (const k of ['walk', 'climb', 'jump', 'fall', 'drop']) expect(kinds.has(k as never), k).toBe(true);
  });

  it('is cached per map definition', () => {
    expect(navFor(def)).toBe(navFor(def));
  });
});
