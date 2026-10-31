import { describe, expect, it } from 'vitest';
import { HEROES } from '../../src/sim/data/heroes';
import type { SimEvent } from '../../src/sim/events';
import type { Fighter } from '../../src/sim/fighter';
import { dashDir, rasenganPoint } from '../../src/sim/hero';
import type { Intent } from '../../src/sim/intent';
import type { MapDef } from '../../src/sim/map/mapData';
import { World } from '../../src/sim/world';
import { intent, run } from './helpers';

// A closed box: ceiling bottom at y = 16, floor top at y = 112, walls at x < 16 and x >= 400.
const BOX: MapDef = {
  id: 'box',
  name: 'box',
  theme: 'arena',
  rows: [
    '##########################',
    '#........................#',
    '#........................#',
    '#........................#',
    '#........................#',
    '#........................#',
    '#.S....................S.#',
    '##########################',
  ],
};
const FLOOR = 112;
const CEIL = 16;
const N = HEROES.naruto.base.dash!;
const S = HEROES.sasuke.base.dash!;

/** Fighters of the given heroes, placed by the caller ([x, y feet, facing]). */
function arena(heroes: string[], at: [number, number, 1 | -1][]): World {
  const w = new World(
    BOX,
    heroes.map((hero, i) => ({ name: 'P' + i, hero: hero || undefined, team: 0, isBot: false, upJumps: false })),
    { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1, heroPowers: false },
    7,
  );
  run(w, 5);
  // (Naruto reserves shadow-clone slots after the players: only place the players)
  w.fighters.slice(0, at.length).forEach((f, i) => {
    f.x = f.px = at[i][0];
    f.y = f.py = at[i][1];
    f.vx = f.vy = f.invuln = 0;
    f.facing = at[i][2];
    f.grounded = at[i][1] === FLOOR;
  });
  w.events.length = 0;
  return w;
}

/** Step with per-fighter intents (fighter 0 gets `a`, the rest `rest[i]` or nothing), collecting events. */
function steps(w: World, ticks: number, inputs: (Partial<Intent> | undefined)[], until?: () => boolean): SimEvent[] {
  const events: SimEvent[] = [];
  for (let t = 0; t < ticks; t++) {
    w.step(w.fighters.map((_, i) => intent(inputs[i] ?? {})));
    events.push(...w.events);
    w.events.length = 0;
    if (until?.()) break;
  }
  return events;
}

const dashing = (f: Fighter, windup: number) => f.state === 'special' && f.specialKind === 'rasengan' && f.recoverAt === 0 && f.stateTime >= windup;

/** Velocity on the first tick of the dash, with the stick held at (mx, my) the whole time. */
function dashVelocity(mx: number, my: number, y = 70, facing: 1 | -1 = 1): { vx: number; vy: number; f: Fighter } {
  const w = arena(['naruto'], [[200, y, facing]]);
  const f = w.fighters[0];
  steps(w, 40, [{ ability: true, moveX: mx, moveY: my }], () => dashing(f, N.windup));
  expect(dashing(f, N.windup)).toBe(true);
  return { vx: f.vx, vy: f.vy, f };
}

describe('directional Rasengan / Chidori dash', () => {
  it('goes in all 8 directions in the air, at the same speed on diagonals', () => {
    const c = Math.SQRT1_2 * N.speed;
    const cases: [number, number, number, number][] = [
      [1, 0, N.speed, 0], [-1, 0, -N.speed, 0], [0, -1, 0, -N.speed], [0, 1, 0, N.speed],
      [1, -1, c, -c], [-1, -1, -c, -c], [1, 1, c, c], [-1, 1, -c, c],
    ];
    for (const [mx, my, vx, vy] of cases) {
      const v = dashVelocity(mx, my);
      expect(v.vx, `${mx},${my} vx`).toBeCloseTo(vx, 6);
      expect(v.vy, `${mx},${my} vy`).toBeCloseTo(vy, 6);
      expect(Math.hypot(v.vx, v.vy)).toBeCloseTo(N.speed, 6);
      // facing follows the horizontal part; vertical dashes keep the facing they had
      expect(v.f.facing).toBe(mx === 0 ? 1 : mx);
    }
    expect(dashVelocity(0, -1, 70, -1).f.facing).toBe(-1);
  });

  it('neutral dashes straight ahead (facing), and the orb sits in front of the palm as before', () => {
    const v = dashVelocity(0, 0, FLOOR, -1);
    expect(v.vx).toBe(-N.speed);
    expect(v.vy).toBe(0);
    const o = rasenganPoint(v.f);
    expect(o.x).toBe(v.f.x - (v.f.w / 2 + 4));
    expect(o.y).toBe(v.f.y - 14);
  });

  it('on the ground, down and down-diagonals dash straight ahead (no burying into the floor)', () => {
    for (const mx of [0, 1, -1]) {
      const v = dashVelocity(mx, 1, FLOOR, 1);
      expect(v.vy, `mx ${mx}`).toBe(0);
      expect(v.vx, `mx ${mx}`).toBe((mx || 1) * N.speed);
    }
  });

  it('the input held when the dash starts wins (re-aim during the windup), then it is locked', () => {
    const w = arena(['naruto'], [[200, 70, 1]]);
    const f = w.fighters[0];
    // aim up-right for most of the windup, switch to down-left right before the dash
    steps(w, 5, [{ ability: true, moveX: 1, moveY: -1 }]);
    expect(f.dashAngle).toBeCloseTo(-Math.PI / 4, 6);
    steps(w, 30, [{ ability: true, moveX: -1, moveY: 1 }], () => dashing(f, N.windup));
    expect(f.facing).toBe(-1);
    expect(f.vx).toBeLessThan(0);
    expect(f.vy).toBeGreaterThan(0);
    // changing the stick mid-dash changes nothing
    steps(w, 2, [{ ability: true, moveX: 1, moveY: -1 }]);
    expect(f.facing).toBe(-1);
    expect(dashDir(f).y).toBeGreaterThan(0);
  });

  it('a dash straight down in the air ends on the floor', () => {
    const w = arena(['naruto'], [[200, 50, 1]]);
    const f = w.fighters[0];
    const ev = steps(w, 80, [{ ability: true, moveY: 1 }], () => f.recoverAt > 0);
    expect(f.recoverAt).toBeGreaterThan(0);
    expect(f.y).toBe(FLOOR);
    expect(f.x).toBe(200);
    expect(ev.some((e) => e.t === 'heroFx' && !e.heavy)).toBe(true);
  });

  it('a dash straight up ends on the ceiling, a sideways one on the wall', () => {
    const w = arena(['naruto', 'sasuke'], [[200, FLOOR, 1], [340, FLOOR, 1]]);
    const [n, s] = w.fighters;
    steps(w, 80, [{ ability: true, moveY: -1 }, { ability: true }], () => n.recoverAt > 0 && s.recoverAt > 0);
    expect(n.recoverAt).toBeGreaterThan(0);
    expect(n.y - n.h).toBe(CEIL);
    expect(n.x).toBe(200);
    expect(s.recoverAt).toBeGreaterThan(0);
    expect(s.x + s.w / 2).toBe(400);
  });

  it('a diagonal dash hits an enemy on that diagonal; a grounded victim is popped up, not driven into the floor', () => {
    const w = arena(['naruto', ''], [[100, 50, 1], [155, FLOOR, 1]]);
    const ev = steps(w, 60, [{ ability: true, moveX: 1, moveY: 1 }]);
    const hit = ev.find((e) => e.t === 'hit' && e.weapon === 'rasengan' && e.victim === 1);
    expect(hit).toBeDefined();
    if (hit?.t !== 'hit') return;
    expect(hit.dirX).toBeGreaterThan(0.5);
    expect(hit.dirY).toBeLessThan(0);
    expect(w.fighters[1].hp).toBe(100 - N.damage);
  });

  it('knockback follows the dash: sideways as before, straight up launches straight up', () => {
    const side = arena(['naruto', ''], [[100, FLOOR, 1], [150, FLOOR, 1]]);
    const h = steps(side, 40, [{ ability: true }]).find((e) => e.t === 'hit' && e.victim === 1);
    expect(h?.t === 'hit' && h.dirX).toBeCloseTo(N.knockX / Math.hypot(N.knockX, N.knockY), 6);
    expect(h?.t === 'hit' && h.dirY).toBeCloseTo(N.knockY / Math.hypot(N.knockX, N.knockY), 6);

    const up = arena(['naruto', ''], [[200, FLOOR, 1], [200, 60, 1]]);
    const u = steps(up, 40, [{ ability: true, moveY: -1 }]).find((e) => e.t === 'hit' && e.victim === 1);
    expect(u).toBeDefined();
    expect(u?.t === 'hit' && Math.abs(u.dirX)).toBeLessThan(1e-6);
    expect(u?.t === 'hit' && u.dirY).toBe(-1);

    // straight down onto an enemy in the air spikes them downward
    // (the victim is held in mid-air until struck)
    const down = arena(['naruto', ''], [[200, 30, 1], [200, 80, 1]]);
    const v = down.fighters[1];
    const ev: SimEvent[] = [];
    for (let t = 0; t < 30 && v.hp === 100; t++) {
      v.y = 80;
      v.vy = 0;
      ev.push(...steps(down, 1, [{ ability: true, moveY: 1 }]));
    }
    const d = ev.find((e) => e.t === 'hit' && e.victim === 1);
    expect(d).toBeDefined();
    expect(d?.t === 'hit' && d.dirY).toBeGreaterThan(0);
  });
});

describe('Rasengan / Chidori clash', () => {
  /**
   * Two fighters dashing at each other on the floor (holding the button). The first hero listed always starts on
   * the left; `swap` puts it in the second fighter slot instead (the sim updates fighters in slot order).
   */
  function clash(heroes: [string, string], swap = false, gap = 180) {
    const at: [number, number, 1 | -1][] = [[120, FLOOR, 1], [120 + gap, FLOOR, -1]];
    const w = swap ? arena([heroes[1], heroes[0]], [at[1], at[0]]) : arena(heroes, at);
    const ev = steps(w, 50, [{ ability: true }, { ability: true }]);
    return { w, ev, clashes: ev.filter((e) => e.t === 'clash') };
  }

  it('Naruto vs Sasuke: the same outcome for both, identical in either fighter order', () => {
    const results = [false, true].map((swap) => {
      const order = swap ? 'sasuke first' : 'naruto first';
      const { w, ev, clashes } = clash(['naruto', 'sasuke'], swap);
      const naruto = w.fighters.find((f) => f.hero === 'naruto' && f.master < 0)!;
      const sasuke = w.fighters.find((f) => f.hero === 'sasuke')!;
      expect(naruto.id).toBe(swap ? 1 : 0);
      expect(clashes, order).toHaveLength(1);
      // both take the average of the two orbs' damage
      expect(naruto.hp, order).toBeCloseTo(100 - (N.damage + S.damage) / 2, 6);
      expect(sasuke.hp, order).toBeCloseTo(naruto.hp, 6);
      const hits = ev.filter((e) => e.t === 'hit');
      expect(hits.filter((e) => e.t === 'hit' && e.victim === naruto.id && e.weapon === 'chidori')).toHaveLength(1);
      expect(hits.filter((e) => e.t === 'hit' && e.victim === sasuke.id && e.weapon === 'rasengan')).toHaveLength(1);
      // no Chidori shock on a clash
      expect(ev.some((e) => e.t === 'arc')).toBe(false);
      // the dashes are over
      expect(naruto.specialKind === 'rasengan' && naruto.state === 'special' && naruto.recoverAt === 0).toBe(false);
      expect(sasuke.specialKind === 'rasengan' && sasuke.state === 'special' && sasuke.recoverAt === 0).toBe(false);
      expect(naruto.swingHit).toContain(sasuke.id);
      expect(sasuke.swingHit).toContain(naruto.id);
      // the same state, timers and (mirrored) speed for both
      expect(naruto.state).toBe(sasuke.state);
      expect(naruto.flinchTime).toBe(sasuke.flinchTime);
      expect(naruto.stateTime).toBe(sasuke.stateTime);
      expect(naruto.vx).toBeCloseTo(-sasuke.vx, 6);
      expect(naruto.vy).toBeCloseTo(sasuke.vy, 6);
      const c = clashes[0];
      return {
        x: c.t === 'clash' ? c.x : NaN, y: c.t === 'clash' ? c.y : NaN, nx: naruto.x, sx: sasuke.x, nvx: naruto.vx, svx: sasuke.vx,
        nvy: naruto.vy, svy: sasuke.vy, nhp: naruto.hp, shp: sasuke.hp,
        nState: naruto.state, sState: sasuke.state, nStun: naruto.flinchTime, sStun: sasuke.flinchTime, nT: naruto.stateTime, sT: sasuke.stateTime,
      };
    });
    expect(results[0]).toEqual(results[1]);
  });

  it('Naruto vs Sasuke right after the clash: both blown apart by the Rasengan force, both dazed for the Chidori 1 s', () => {
    const w = arena(['naruto', 'sasuke'], [[120, FLOOR, 1], [300, FLOOR, -1]]);
    const [n, s] = w.fighters;
    steps(w, 50, [{ ability: true }, { ability: true }], () => n.hp < 100);
    for (const f of [n, s]) {
      expect(f.state).toBe('flinch');
      expect(f.flinchTime).toBe(S.stun);
      // the stronger knockback (Rasengan's) and its lift, for both
      expect(Math.abs(f.vx)).toBeCloseTo(N.knockX, 6);
      expect(f.vy).toBeCloseTo(N.knockY, 6);
    }
    expect(n.vx).toBeLessThan(0);
    expect(s.vx).toBeGreaterThan(0);
    // they actually fly apart (the daze does not cancel the flight), then stand there dazed until the stun is over
    const gap0 = s.x - n.x;
    steps(w, 20, []);
    expect(s.x - n.x).toBeGreaterThan(gap0 + 40);
    expect(n.state).toBe('flinch');
    expect(s.state).toBe('flinch');
    steps(w, Math.round(S.stun * 60) - 18, []);
    expect(n.state).not.toBe('flinch');
    expect(s.state).not.toBe('flinch');
  });

  it('equal fighters get the same outcome (Naruto vs Naruto: both knocked down; Sasuke vs Sasuke: both dazed)', () => {
    for (const hero of ['naruto', 'sasuke']) {
      const results = [false, true].map((swap) => {
        const { w, clashes } = clash([hero, hero], swap);
        const d = HEROES[hero].base.dash!;
        // (left fighter first: `swap` puts it in the second slot)
        const [a, b] = w.fighters.slice(0, 2).sort((p, q) => p.x - q.x);
        expect(clashes, hero).toHaveLength(1);
        expect(a.hp, hero).toBeCloseTo(100 - d.damage, 6);
        expect(b.hp, hero).toBeCloseTo(100 - d.damage, 6);
        expect(a.state).toBe(hero === 'naruto' ? 'knockdown' : 'flinch');
        expect(b.state).toBe(a.state);
        expect(a.flinchTime).toBe(b.flinchTime);
        expect(a.vx).toBeCloseTo(-b.vx, 6);
        expect(a.vy).toBeCloseTo(b.vy, 6);
        return { hp: [a.hp, b.hp], vx: [a.vx, b.vx], vy: [a.vy, b.vy], st: [a.state, b.state], x: [a.x, b.x] };
      });
      expect(results[0], hero).toEqual(results[1]);
    }
  });

  it('dashing head-on into an orb still forming in the windup clashes too', () => {
    // Naruto's windup is shorter than Sasuke's: he dashes into Sasuke's forming Chidori
    const w = arena(['naruto', 'sasuke'], [[150, FLOOR, 1], [215, FLOOR, -1]]);
    const [n, s] = w.fighters;
    const ev = steps(w, 40, [{ ability: true }, { ability: true }]);
    const c = ev.find((e) => e.t === 'clash');
    expect(c).toBeDefined();
    expect(n.hp).toBeCloseTo(100 - (N.damage + S.damage) / 2, 6);
    expect(s.hp).toBeCloseTo(n.hp, 6);
  });

  it('an orb from behind is a plain hit, not a clash', () => {
    // both aim right: Naruto catches Sasuke from behind while Sasuke is still winding up
    const w = arena(['naruto', 'sasuke'], [[150, FLOOR, 1], [190, FLOOR, 1]]);
    const [n, s] = w.fighters;
    const ev = steps(w, 5, [{ ability: true }]);
    ev.push(...steps(w, 25, [{ ability: true }, { ability: true }]));
    expect(s.state === 'special' || s.hp < 100).toBe(true);
    expect(ev.some((e) => e.t === 'clash')).toBe(false);
    expect(s.hp).toBe(100 - N.damage);
    expect(n.hp).toBe(100);
  });
});
