// Supers hit an AREA, not one fighter (user report: Sasuke's ult on a gang of Naruto's shadow clones took out only one).
import { describe, expect, it } from 'vitest';
import { HEROES, SUPER_AREA, superFistFor } from '../../src/sim/data/heroes';
import type { SimEvent } from '../../src/sim/events';
import { areaFrac, COVER, explode } from '../../src/sim/explosion';
import { superBlast, summonClones, transform } from '../../src/sim/hero';
import { TK } from '../../src/sim/map/tiles';
import { World } from '../../src/sim/world';
import { FLAT, intent, run } from './helpers';

type Other = { x: number; y?: number; team?: number; hero?: string };

/** `hero` at x = 70 on the floor of the flat map, facing right, at form `level`, plus `others`. */
function arena(hero: string, level: number, others: Other[], team = 0, friendlyFire = false): World {
  const w = new World(
    FLAT,
    [
      { name: 'H', hero, team, isBot: false, upJumps: false },
      ...others.map((o, i) => ({ name: 'E' + i, team: o.team ?? 0, hero: o.hero, isBot: false, upJumps: false })),
    ],
    { friendlyFire, weaponSpawnRate: 0, gravityScale: 1 },
    61,
  );
  run(w, 5);
  w.fighters.forEach((f, i) => {
    if (i > others.length) return; // (clone slots)
    f.x = f.px = i === 0 ? 70 : others[i - 1].x;
    f.y = f.py = i === 0 ? 144 : (others[i - 1].y ?? 144);
    f.vx = f.vy = f.invuln = 0;
    f.facing = 1;
  });
  for (let i = 0; i < level; i++) transform(w, w.fighters[0]);
  w.events.length = 0;
  return w;
}

/** Fire the super (both ability buttons) and add up the super damage each fighter took. */
function fire(w: World, ticks = 150): { dmg: Map<number, number>; events: SimEvent[] } {
  const weapon = w.fighters[0].hero + ':super';
  const dmg = new Map<number, number>();
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    w.step(w.fighters.map((_, n) => intent(n === 0 && i === 0 ? { ability: true, kick: true } : {})));
    for (const e of w.events) if (e.t === 'hit' && e.weapon === weapon && !e.corpse) dmg.set(e.victim, (dmg.get(e.victim) ?? 0) + e.damage);
    events.push(...w.events);
    w.events.length = 0;
  }
  return { dmg, events };
}

/** The super's full (core) damage at a form level, after the form's damage multiplier. */
function core(hero: string, level: number): number {
  const h = HEROES[hero];
  const mul = h.forms[level - 1].damageMul;
  return h.super.kind === 'fist' ? superFistFor(hero, level)!.damage * mul : (h.super.bomb!.damage + h.super.bomb!.damagePerLevel * (level - 1)) * mul;
}

const HERO_IDS = ['sasuke', 'naruto', 'goku', 'luffy'];
const RANGES: Record<string, number[]> = {
  'point-blank': [82, 94, 106, 118, 130],
  'mid range': [200, 212, 224, 236, 248],
};

describe('every super hits the whole group (the user scenario)', () => {
  for (const hero of HERO_IDS) {
    for (const level of [1, 4]) {
      for (const [where, xs] of Object.entries(RANGES)) {
        it(`${hero} form ${level}, ${where}: all 5 enemies standing 12 px apart are hit, each with at least half the core damage`, () => {
          const w = arena(hero, level, xs.map((x) => ({ x })));
          const { dmg } = fire(w);
          const full = core(hero, level);
          for (let i = 1; i <= xs.length; i++) {
            const d = dmg.get(i) ?? 0;
            expect(d, `enemy at ${xs[i - 1]}`).toBeGreaterThanOrEqual(full * SUPER_AREA.edge - 0.2);
            expect(d, `enemy at ${xs[i - 1]} is hit only once`).toBeLessThanOrEqual(full + 0.2);
          }
          expect(w.fighters[0].hp).toBe(w.fighters[0].maxHp); // never the caster
        });
      }
    }
  }

  it("Sasuke's top-form arrow wipes out a gang of Naruto's shadow clones at point-blank", () => {
    // an enemy Naruto far behind his clones; five clones (20 % health each) crowd right in front of Sasuke
    const w = arena('sasuke', 4, [{ x: 440, hero: 'naruto' }]);
    const naruto = w.fighters[1];
    for (let i = 0; i < 3; i++) transform(w, naruto);
    expect(summonClones(w, naruto)).toBe(5);
    const clones = w.fighters.filter((c) => c.master === naruto.id && c.alive);
    clones.forEach((c, i) => {
      c.x = c.px = 80 + i * 13;
      c.y = c.py = 144;
      c.vx = c.vy = c.invuln = 0;
      c.facing = -1;
    });
    w.events.length = 0;
    fire(w, 90);
    expect(clones.filter((c) => c.alive)).toHaveLength(0);
  });

  it('a wall between the hero and the launch point sets the shot off there (it never comes out on the far side)', () => {
    // Sasuke's top-form bow is ~66 px ahead of him: a wall at 96..112 px, an enemy behind it at 140
    const w = arena('sasuke', 4, [{ x: 140 }]);
    for (let y = 0; y <= 8; y++) w.map.set(6, y, TK.CONCRETE);
    const { dmg, events } = fire(w, 60);
    const boom = events.find((e) => e.t === 'explosion');
    expect(boom && boom.t === 'explosion' && boom.x).toBeLessThan(100);
    expect(dmg.get(1) ?? 0).toBeLessThanOrEqual(core('sasuke', 4) * COVER + 0.2); // only through cover
  });
});

describe('area numbers', () => {
  it('full damage in the inner 55 % of the radius, easing to half at the rim', () => {
    expect(areaFrac(0, 0.55, 0.5)).toBe(1);
    expect(areaFrac(0.55, 0.55, 0.5)).toBe(1);
    expect(areaFrac(0.775, 0.55, 0.5)).toBeCloseTo(0.75);
    expect(areaFrac(0.999, 0.55, 0.5)).toBeCloseTo(0.5, 2);
    expect(areaFrac(1, 0.55, 0.5)).toBe(0);
  });

  it('the blast radius covers a ~60 px group at form 1 and grows with every form', () => {
    for (const hero of ['sasuke', 'naruto', 'goku']) {
      const w = arena(hero, 4, []);
      const radii = [1, 2, 3, 4].map((l) => superBlast(w.fighters[0], HEROES[hero].super.bomb!, l).radius);
      expect(radii[0], hero).toBeGreaterThanOrEqual(54);
      for (let l = 1; l < 4; l++) expect(radii[l]).toBeGreaterThan(radii[l - 1]);
      expect(radii[3]).toBeGreaterThanOrEqual(80);
    }
    const shock = [1, 2, 3, 4].map((l) => superFistFor('luffy', l)!.shock);
    expect(shock).toEqual([32, 42, 52, 62]);
  });

  it('the blast falloff in the sim: core, mid-way, rim and wall cover', () => {
    const w = arena('naruto', 4, [{ x: 200 }, { x: 250 }, { x: 290 }, { x: 160 }]);
    const ex = superBlast(w.fighters[0], HEROES.naruto.super.bomb!, 4);
    const at = 200;
    const cy = 144 - w.fighters[1].h / 2;
    for (let y = 0; y <= 8; y++) w.map.set(11, y, TK.CONCRETE); // a wall at 176..192 between the centre and the fighter at 160
    const dmg = new Map<number, number>();
    explode(w, at, cy, ex, 0, 'naruto:super');
    for (const e of w.events) if (e.t === 'hit') dmg.set(e.victim, e.damage);
    const share = (x: number) => areaFrac(Math.max(0, Math.abs(x - at) - 6) / ex.radius, SUPER_AREA.core, SUPER_AREA.edge);
    expect(dmg.get(1)).toBeCloseTo(ex.damage, 1); // under it
    expect(dmg.get(2)).toBeCloseTo(ex.damage * share(250), 1); // inside the core
    expect(dmg.get(3)).toBeCloseTo(ex.damage * share(290), 1); // near the rim (radius 86)
    expect(share(290)).toBeLessThan(0.7);
    expect(dmg.get(4)).toBeCloseTo(ex.damage * share(160) * COVER, 1); // behind the wall
  });
});

describe('who the super never hurts', () => {
  it("allies, the caster's own clones and the caster are untouched; the enemies around them are hit", () => {
    // Naruto (team 1) at form 3 with his clones out, a teammate and two enemies in front
    const w = arena('naruto', 3, [{ x: 112, team: 1 }, { x: 124, team: 2 }, { x: 136, team: 2 }], 1);
    const naruto = w.fighters[0];
    expect(summonClones(w, naruto)).toBeGreaterThan(0);
    const own = w.fighters.filter((c) => c.master === naruto.id && c.alive);
    own.forEach((c, i) => {
      c.x = c.px = 90 + i * 3;
      c.y = c.py = 144;
      c.vx = c.vy = c.invuln = 0;
    });
    const hp = own.map((c) => c.hp);
    w.events.length = 0;
    const { dmg } = fire(w, 100);
    expect(own.every((c) => c.alive)).toBe(true);
    expect(own.map((c) => c.hp)).toEqual(hp);
    expect(dmg.get(1) ?? 0).toBe(0); // the teammate
    expect(dmg.get(2) ?? 0).toBeGreaterThan(0);
    expect(dmg.get(3) ?? 0).toBeGreaterThan(0);
    expect(naruto.hp).toBe(naruto.maxHp);
  });

  it('with friendly fire on the teammate is caught too, but never the caster or his own clones', () => {
    const w = arena('naruto', 3, [{ x: 112, team: 1 }, { x: 124, team: 2 }], 1, true);
    const naruto = w.fighters[0];
    summonClones(w, naruto);
    const own = w.fighters.filter((c) => c.master === naruto.id && c.alive);
    own.forEach((c) => {
      c.x = c.px = 100;
      c.vx = c.vy = c.invuln = 0;
    });
    w.events.length = 0;
    const { dmg } = fire(w, 100);
    expect(dmg.get(1) ?? 0).toBeGreaterThan(0);
    expect(own.every((c) => c.alive && c.hp === c.maxHp)).toBe(true);
    expect(naruto.hp).toBe(naruto.maxHp);
  });

  it('a friend standing in the way does not stop the shot: it flies on to the enemy group', () => {
    const w = arena('sasuke', 2, [{ x: 100, team: 1 }, { x: 260, team: 2 }, { x: 272, team: 2 }], 1);
    const { dmg } = fire(w, 120);
    expect(dmg.get(1) ?? 0).toBe(0);
    expect(dmg.get(2) ?? 0).toBeGreaterThan(0);
    expect(dmg.get(3) ?? 0).toBeGreaterThan(0);
  });
});

describe('single-target damage stays close to before the area change', () => {
  // measured before the change (direct hit + its own blast), one enemy at 200 px
  const BEFORE: Record<string, number[]> = {
    sasuke: [42, 64.8, 91.4, 121.5],
    naruto: [30.7, 51.6, 76.4, 104.7],
    goku: [45.8, 69.4, 96.8, 128],
    luffy: [20.7, 36.4, 52.7, 71.4],
  };
  for (const hero of HERO_IDS) {
    it(`${hero}: within 3 % at every form`, () => {
      for (let level = 1; level <= 4; level++) {
        const { dmg } = fire(arena(hero, level, [{ x: 200 }]));
        const d = dmg.get(1) ?? 0;
        expect(Math.abs(d - BEFORE[hero][level - 1]) / BEFORE[hero][level - 1], `form ${level}: ${d}`).toBeLessThan(0.03);
      }
    });
  }
});

describe("Luffy's giant fist", () => {
  it('hits every fighter the arm sweeps through (each once, full damage)', () => {
    const w = arena('luffy', 2, [{ x: 100 }, { x: 140 }, { x: 180 }, { x: 220 }]);
    const { dmg } = fire(w, 60);
    for (let i = 1; i <= 4; i++) expect(dmg.get(i)).toBeCloseTo(core('luffy', 2), 1);
  });

  for (const level of [1, 2]) {
    it(`form ${level}: the landing shockwave catches the enemies around the fist that the arm missed`, () => {
      const s = superFistFor('luffy', level)!;
      const tip = 70 + 2 + 5 + s.range;
      const w = arena('luffy', level, [{ x: tip + 20 }, { x: tip + 30 }, { x: tip + s.shock + 20 }]);
      const { dmg, events } = fire(w, 60);
      expect(events.some((e) => e.t === 'shockwave' && e.radius === s.shock)).toBe(true);
      expect(dmg.get(1) ?? 0).toBeGreaterThanOrEqual(core('luffy', level) * SUPER_AREA.edge - 0.2);
      expect(dmg.get(2) ?? 0).toBeGreaterThanOrEqual(core('luffy', level) * SUPER_AREA.edge - 0.2);
      expect(dmg.get(3) ?? 0).toBe(0); // out of reach
    });
  }

  it('the shockwave never hits someone twice, nor a teammate', () => {
    const s = superFistFor('luffy', 1)!;
    const tip = 70 + 2 + 5 + s.range;
    const w = arena('luffy', 1, [{ x: tip - 4, team: 2 }, { x: tip + 18, team: 1 }], 1);
    const { dmg } = fire(w, 60);
    expect(dmg.get(1)).toBeCloseTo(core('luffy', 1), 1);
    expect(dmg.get(2) ?? 0).toBe(0);
  });
});
