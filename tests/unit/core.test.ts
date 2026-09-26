import { describe, expect, it } from 'vitest';
import { computeDamage, sameTeam, teamKey } from '../../src/sim/combat';
import { emptyIntent, packIntent, unpackIntent } from '../../src/sim/intent';
import { MAP_LIST } from '../../src/sim/map/maps';
import { parseMap } from '../../src/sim/map/mapData';
import { Rng } from '../../src/sim/rng';

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = new Rng(123);
    const b = new Rng(123);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('stays in range', () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
    }
  });
});

describe('intent packing', () => {
  it('round-trips buttons and neutral/full axes', () => {
    const i = { ...emptyIntent(), moveX: -1, moveY: 0, attack: true, cycle: true };
    const o = unpackIntent(packIntent(i));
    expect(o.moveX).toBeCloseTo(-1);
    expect(o.moveY).toBeCloseTo(0);
    expect(o.attack).toBe(true);
    expect(o.cycle).toBe(true);
    expect(o.jump).toBe(false);
  });
});

describe('damage', () => {
  it('applies falloff linearly with distance', () => {
    expect(computeDamage({ base: 10, falloff: 0.5, distFrac: 0 })).toBe(10);
    expect(computeDamage({ base: 10, falloff: 0.5, distFrac: 1 })).toBe(5);
    expect(computeDamage({ base: 10, falloff: 0.5, distFrac: 0.5 })).toBe(7.5);
    expect(computeDamage({ base: 10, falloff: 0.5, distFrac: 3 })).toBe(5);
  });
  it('applies multipliers and never goes negative', () => {
    expect(computeDamage({ base: 10, mult: 2 })).toBe(20);
    expect(computeDamage({ base: -5 })).toBe(0);
  });
  it('treats team 0 as solo', () => {
    expect(sameTeam({ id: 1, team: 0 }, { id: 2, team: 0 })).toBe(false);
    expect(sameTeam({ id: 1, team: 2 }, { id: 2, team: 2 })).toBe(true);
    expect(teamKey({ id: 3, team: 0 })).not.toBe(teamKey({ id: 4, team: 0 }));
  });
});

describe('maps', () => {
  for (const def of MAP_LIST) {
    it(`${def.id} is well formed`, () => {
      const w = def.rows[0].length;
      for (const r of def.rows) expect(r.length).toBe(w);
      const p = parseMap(def);
      expect(p.spawns.length).toBeGreaterThanOrEqual(10);
      expect(p.weaponSpawns.length).toBeGreaterThan(0);
      // every spawn stands on something solid or a platform
      for (const s of p.spawns) {
        const tx = Math.floor(s.x / 16);
        const ty = s.y / 16;
        const below = p.tiles[ty * p.w + tx];
        expect(below, `spawn at ${tx},${ty - 1} floats`).not.toBe(0);
      }
    });
  }
});
