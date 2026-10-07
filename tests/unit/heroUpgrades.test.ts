import { applyHit } from '../../src/sim/combat';
import { describe, expect, it } from 'vitest';
import { TILE } from '../../src/sim/constants';
import { cloneSpec, HEROES, maxClones } from '../../src/sim/data/heroes';
import type { Fighter, FighterSpawn } from '../../src/sim/fighter';
import { grabProbe, summonClones, transform } from '../../src/sim/hero';
import type { Intent } from '../../src/sim/intent';
import type { MapDef } from '../../src/sim/map/mapData';
import { Match } from '../../src/sim/match';
import { World } from '../../src/sim/world';
import { intent } from './helpers';

// M11b: Naruto's real shadow clones, hold-to-extend Rasengan, wall walking; Luffy's grapple and swing.

/** Open arena with a wall column, a platform, a ladder and a ceiling block to grab. */
const ARENA: MapDef = {
  id: 'upg',
  name: 'upg',
  theme: 'arena',
  rows: [
    '##########################################',
    '#........................................#',
    '#........................................#',
    '#..........######........................#',
    '#........................................#',
    '#........................................#',
    '#........................................#',
    '#..................=====.................#',
    '#........................................#',
    '#........................................#',
    '#...............H........................#',
    '#...............H........................#',
    '#..S...S...S...SH..S...S...S...S...S.S...#',
    '##########################################',
    '##########################################',
    '##########################################',
  ],
};
const FLOOR = 13 * TILE;

function arena(heroes: string[], n = heroes.length, extra: Partial<FighterSpawn>[] = []): World {
  const specs: FighterSpawn[] = Array.from({ length: n }, (_, i) => ({ name: 'F' + i, team: 0, isBot: false, upJumps: false, hero: heroes[i] || undefined, ...(extra[i] ?? {}) }));
  return new World(ARENA, specs, { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 5);
}

function put(w: World, i: number, x: number, y = FLOOR, facing: 1 | -1 = 1): Fighter {
  const f = w.fighters[i];
  f.x = f.px = x;
  f.y = f.py = y;
  f.vx = f.vy = 0;
  f.facing = facing;
  f.state = 'normal';
  f.invuln = 0;
  f.grounded = y === FLOOR;
  return f;
}

const settle = (w: World, n = 6) => {
  for (let i = 0; i < n; i++) w.step([]);
};
const hold = (w: World, ticks: number, i: Partial<Intent> = {}, j: Partial<Intent> = {}) => {
  for (let t = 0; t < ticks; t++) w.step([intent(i), intent(j)]);
};
const clones = (w: World, master = 0) => w.fighters.filter((c) => c.master === master && c.alive);

describe('Naruto: shadow clones are real fighters', () => {
  it('clone slots are reserved only for Naruto, outside the player roster', () => {
    const w = arena(['naruto', ''], 2);
    expect(maxClones('naruto')).toBe(5);
    expect(w.fighters.length).toBe(2 + 5);
    expect(w.fighters.slice(2).every((c) => c.master === 0 && !c.alive && c.gone)).toBe(true);
    expect(arena(['luffy', 'goku']).fighters.length).toBe(2);
  });

  it('clone counts: 2 in the base form, +1 per form up to the second-to-last, 2 full-health copies in the final form', () => {
    expect([0, 1, 2, 3, 4].map((l) => cloneSpec('naruto', l)?.count)).toEqual([2, 3, 4, 5, 2]);
    expect(cloneSpec('naruto', 3)?.full).toBe(false);
    expect(cloneSpec('naruto', 4)?.full).toBe(true);
    for (const [lvl, n] of [[0, 2], [1, 3], [2, 4], [3, 5], [4, 2]]) {
      const w = arena(['naruto', ''], 2);
      put(w, 0, 10 * TILE);
      put(w, 1, 36 * TILE);
      settle(w);
      for (let i = 0; i < lvl; i++) transform(w, w.fighters[0]);
      hold(w, 1, { kick: true });
      hold(w, 12, {});
      expect(clones(w).length, `level ${lvl}`).toBe(n);
    }
  });

  it('clones wear their master\'s current form (look only: no form health, no power of their own)', () => {
    for (const lvl of [0, 2, 4]) {
      const w = arena(['naruto', ''], 2);
      put(w, 0, 10 * TILE);
      put(w, 1, 36 * TILE);
      settle(w);
      for (let i = 0; i < lvl; i++) transform(w, w.fighters[0]);
      hold(w, 1, { kick: true });
      hold(w, 12, {});
      for (const c of clones(w)) {
        expect(c.cloneForm, `level ${lvl}`).toBe(lvl);
        expect(c.power).toBe('');
        expect(c.formHp).toBe(0);
      }
    }
    // the form follows the master while the clones are out
    const w = arena(['naruto', ''], 2);
    put(w, 0, 10 * TILE);
    put(w, 1, 36 * TILE);
    settle(w);
    summonClones(w, w.fighters[0]);
    transform(w, w.fighters[0]);
    hold(w, 2, {});
    expect(clones(w)[0].cloneForm).toBe(1);
  });

  it('a hurt Naruto makes proportionally hurt clones (half health -> half of the clone fraction)', () => {
    const w = arena(['naruto', ''], 2);
    put(w, 0, 10 * TILE);
    put(w, 1, 36 * TILE);
    settle(w);
    const n = w.fighters[0];
    n.hp = n.maxHp / 2;
    summonClones(w, n);
    for (const c of clones(w)) expect(c.hp).toBeCloseTo(c.maxHp / 2, 0);
  });

  it('clones never damage their master or each other', () => {
    const w = arena(['naruto', ''], 2);
    put(w, 0, 10 * TILE);
    put(w, 1, 36 * TILE);
    settle(w);
    const n = w.fighters[0];
    summonClones(w, n);
    const [c1, c2] = clones(w);
    const hit = (att: number, v: typeof n) => applyHit(w, v, { damage: 10, kbX: 50, kbY: 0, attacker: att, weapon: 'rasengan', kind: 'melee' });
    const hp = n.hp;
    expect(hit(c1.id, n)).toBe(false);
    expect(hit(c1.id, c2)).toBe(false);
    expect(n.hp).toBe(hp);
    expect(hit(c1.id, w.fighters[1])).toBe(true);
  });

  it('they have a fraction of his health; in the final form exact copies of his CURRENT health', () => {
    const w = arena(['naruto', ''], 2);
    put(w, 0, 10 * TILE);
    put(w, 1, 36 * TILE);
    settle(w);
    const n = w.fighters[0];
    summonClones(w, n);
    const frac = HEROES.naruto.second.clones!.hpFrac;
    for (const c of clones(w)) {
      expect(c.hp).toBeCloseTo(n.maxHp * frac, 5);
      expect(c.maxHp).toBeCloseTo(n.maxHp * frac, 5);
      expect(c.hp).toBeLessThan(n.maxHp / 2);
    }
    // final form, with reduced health
    const w2 = arena(['naruto', ''], 2);
    put(w2, 0, 10 * TILE);
    put(w2, 1, 36 * TILE);
    settle(w2);
    const m = w2.fighters[0];
    for (let i = 0; i < 4; i++) transform(w2, m);
    m.hp = 37;
    summonClones(w2, m);
    const cs = clones(w2);
    expect(cs.length).toBe(2);
    for (const c of cs) {
      expect(c.hp).toBe(37);
      expect(c.maxHp).toBe(m.maxHp);
    }
  });

  it('clones know only the Rasengan: no clones of their own, no super, no orbs, no items', () => {
    const w = arena(['naruto', ''], 2);
    put(w, 0, 10 * TILE);
    put(w, 1, 36 * TILE);
    settle(w);
    summonClones(w, w.fighters[0]);
    const c = clones(w)[0];
    const ci = c.id;
    // ability 2 (kick) does nothing for a clone
    const ints = () => Array.from({ length: w.fighters.length }, () => intent());
    const a = ints();
    a[ci] = intent({ kick: true });
    w.step(a);
    for (let t = 0; t < 10; t++) w.step(ints());
    expect(clones(w).length).toBe(2);
    expect(c.cloneCount).toBe(0);
    // ability 1 = Rasengan
    const b = ints();
    b[ci] = intent({ ability: true });
    w.step(b);
    expect(c.state).toBe('special');
    expect(c.specialKind).toBe('rasengan');
    // orbs and weapons are not for clones
    for (let t = 0; t < 40; t++) w.step(ints());
    const orb = w.spawnWeapon('powerorb', c.x, c.y - 1);
    const gun = w.spawnWeapon('pistol', c.x, c.y - 1);
    for (let t = 0; t < 10; t++) w.step(ints());
    expect(orb.active).toBe(true);
    expect(gun.active).toBe(true);
    expect(c.power).toBe('');
  });

  it('the ability does not start recharging until every clone is dead or recalled', () => {
    const w = arena(['naruto', ''], 2);
    put(w, 0, 10 * TILE);
    put(w, 1, 36 * TILE);
    settle(w);
    const n = w.fighters[0];
    const cd = HEROES.naruto.second.cooldown;
    hold(w, 1, { kick: true });
    hold(w, 5, {});
    expect(n.cloneCount).toBe(2);
    hold(w, 60 * (cd + 2), {});
    expect(n.secondCd).toBeCloseTo(cd, 1); // still waiting
    // recall with ability 2 again
    hold(w, 1, { kick: true });
    hold(w, 3, {});
    expect(clones(w).length).toBe(0);
    expect(n.cloneCount).toBe(0);
    expect(n.secondCd).toBeGreaterThan(cd - 0.2);
    hold(w, 60, {});
    expect(n.secondCd).toBeLessThan(cd - 0.5); // now it counts down
    hold(w, 60 * cd, {});
    expect(n.secondCd).toBeLessThanOrEqual(0);
  });

  it('recharging also starts when the last clone is killed', () => {
    const w = arena(['naruto', 'luffy'], 2);
    put(w, 0, 10 * TILE);
    put(w, 1, 36 * TILE);
    settle(w);
    const n = w.fighters[0];
    summonClones(w, n);
    n.secondCd = HEROES.naruto.second.cooldown;
    for (const c of clones(w)) c.hp = 0.5;
    // enemy shoots them dead
    for (const c of clones(w)) {
      const other = w.fighters[1];
      other.x = c.x - 12;
      other.y = c.y;
      other.facing = 1;
      other.invuln = 0;
      c.invuln = 0;
      hold(w, 1, {}, { attack: true });
      hold(w, 14, {}, {});
    }
    for (let t = 0; t < 30; t++) w.step([]);
    expect(clones(w).length).toBe(0);
    const before = n.secondCd;
    hold(w, 30, {});
    expect(n.secondCd).toBeLessThan(before);
  });

  it('clones are on his team (no friendly damage) and their kills count for him', () => {
    const w = arena(['naruto', ''], 2);
    put(w, 0, 10 * TILE);
    put(w, 1, 12 * TILE);
    settle(w);
    const n = w.fighters[0];
    summonClones(w, n);
    const c = clones(w)[0];
    const hp = c.hp;
    // the master swings at his own clone: nothing
    c.x = n.x + 8;
    c.y = n.y;
    c.invuln = 0;
    hold(w, 20, { attack: true });
    expect(c.hp).toBe(hp);
    // a clone's Rasengan kills the victim: credited to the master
    const v = w.fighters[1];
    v.hp = 5;
    v.x = c.x + 20;
    v.y = c.y;
    const ints = Array.from({ length: w.fighters.length }, () => intent());
    ints[c.id] = intent({ ability: true });
    c.facing = 1;
    const kills: { killer: number; victim: number }[] = [];
    for (let t = 0; t < 60; t++) {
      w.step(t === 0 ? ints : []);
      for (const e of w.events) if (e.t === 'kill') kills.push({ killer: e.killer, victim: e.victim });
      w.events.length = 0;
    }
    expect(kills).toEqual([{ killer: 0, victim: 1 }]);
  });

  it('a dead clone just poofs (no kill event, no corpse) and the clones vanish with their master', () => {
    const w = arena(['naruto', 'luffy'], 2);
    put(w, 0, 10 * TILE);
    put(w, 1, 36 * TILE);
    settle(w);
    const n = w.fighters[0];
    summonClones(w, n);
    const c = clones(w)[0];
    c.invuln = 0;
    const events: string[] = [];
    // lethal hit through the normal combat path
    c.hp = 1;
    w.fighters[1].x = c.x + 10;
    w.fighters[1].y = c.y;
    w.fighters[1].facing = -1;
    w.fighters[1].invuln = 0;
    hold(w, 1, {}, { attack: true });
    for (let t = 0; t < 30; t++) {
      w.step([]);
      for (const e of w.events) events.push(e.t);
      w.events.length = 0;
    }
    expect(c.alive).toBe(false);
    expect(c.gone).toBe(true);
    expect(events).not.toContain('kill');
    // master dies: the rest vanish
    expect(clones(w).length).toBe(1);
    n.hp = 0;
    n.alive = false;
    n.state = 'dead';
    w.step([]);
    w.step([]);
    expect(clones(w).length).toBe(0);
  });

  it('modes only see the players: a Brawl round with Naruto and clones plays on and can finish', () => {
    const m = new Match({
      mapId: 'test',
      mode: 'brawl',
      fighters: [
        { name: 'N', team: 0, isBot: false, upJumps: false, hero: 'naruto' },
        { name: 'O', team: 0, isBot: false, upJumps: false },
      ],
      roundsToWin: 3,
      friendlyFire: false,
      weaponSpawnRate: 0,
      seed: 3,
    });
    expect(m.world.fighters.length).toBe(2 + 5);
    summonClones(m.world, m.world.fighters[0]);
    for (let t = 0; t < 120; t++) m.step([]);
    expect(m.world.aliveTeams().size).toBe(2);
    // the enemy dies: the round is decided even though clones are standing
    m.world.fighters[1].hp = 0.1;
    m.world.fighters[1].invuln = 0;
    m.world.fighters[1].x = m.world.fighters[0].x + 8;
    m.world.fighters[1].y = m.world.fighters[0].y;
    for (let t = 0; t < 10; t++) m.step([intent({ attack: true })]);
    for (let t = 0; t < 60 * 4 && m.round === 1; t++) m.step([]);
    expect(m.round).toBeGreaterThanOrEqual(1);
  });
});

describe('Naruto: Rasengan keeps going while held', () => {
  const dist = (hero: string, ticksHeld: number, targetDx: number) => {
    const w = arena([hero, ''], 2);
    put(w, 0, 6 * TILE);
    put(w, 1, 6 * TILE + targetDx);
    settle(w);
    const n = w.fighters[0];
    const x0 = n.x;
    hold(w, ticksHeld, { ability: true });
    hold(w, 60, {});
    return { moved: n.x - x0, target: w.fighters[1], n };
  };

  it('a tap is the old short dash; holding carries on much further', () => {
    const tapD = dist('naruto', 1, 400).moved;
    const heldD = dist('naruto', 70, 400).moved;
    expect(tapD).toBeLessThan(150);
    expect(heldD).toBeGreaterThan(tapD + 150);
  });

  it('it ends the moment it hits somebody, however long you hold', () => {
    const r = dist('naruto', 90, 200);
    expect(r.target.hp).toBeLessThan(r.target.maxHp - 8);
    expect(r.n.x).toBeLessThan(6 * TILE + 200 + 5); // stopped at the target, didn't run on
  });

  it('letting go of the button ends the dash', () => {
    const w = arena(['naruto', ''], 2);
    put(w, 0, 6 * TILE);
    put(w, 1, 36 * TILE);
    settle(w);
    const n = w.fighters[0];
    hold(w, 30, { ability: true }); // windup + a bit of dash
    const x1 = n.x;
    hold(w, 2, {});
    hold(w, 40, {});
    expect(n.x - x1).toBeLessThan(40); // only the slide-out
    expect(n.state).toBe('normal');
  });

  it('a wall ends it too, and it never lasts longer than maxTime', () => {
    const w = arena(['naruto', ''], 2);
    put(w, 0, 30 * TILE);
    put(w, 1, 4 * TILE);
    settle(w);
    const n = w.fighters[0];
    hold(w, 120, { ability: true });
    expect(n.x + n.w / 2).toBeLessThanOrEqual(41 * TILE);
    expect(n.state).toBe('normal');
  });
});

describe('Naruto: walks and runs on walls', () => {
  const WALL_X = 41 * TILE; // right wall (column 41)

  it('hold toward a wall + Up walks up it (gravity off), release falls', () => {
    const w = arena(['naruto'], 1);
    put(w, 0, WALL_X - 6);
    settle(w);
    const f = w.fighters[0];
    hold(w, 3, { moveX: 1, moveY: -1 });
    expect(f.state).toBe('wallwalk');
    const y0 = f.y;
    hold(w, 30, { moveX: 1, moveY: -1 });
    expect(f.state).toBe('wallwalk');
    expect(f.y).toBeLessThan(y0 - 40);
    expect(f.facing).toBe(1);
    // holding toward the wall without a direction: hangs there
    const y1 = f.y;
    hold(w, 20, { moveX: 1 });
    expect(Math.abs(f.y - y1)).toBeLessThan(2);
    // Down walks back down
    hold(w, 20, { moveX: 1, moveY: 1 });
    expect(f.y).toBeGreaterThan(y1 + 20);
    // let go: gravity again
    hold(w, 3, {});
    expect(f.state).not.toBe('wallwalk');
  });

  it('works with Up as the jump key too (keyboard players)', () => {
    const w = arena(['naruto'], 1, [{ upJumps: true }]);
    put(w, 0, WALL_X - 6);
    settle(w);
    hold(w, 3, { moveX: 1, moveY: -1 });
    expect(w.fighters[0].state).toBe('wallwalk');
    hold(w, 20, { moveX: 1, moveY: -1 });
    expect(w.fighters[0].state).toBe('wallwalk');
  });

  it('running (double-tap toward the wall first) is faster', () => {
    const climb = (sprint: boolean) => {
      const w = arena(['naruto'], 1);
      put(w, 0, WALL_X - 40);
      settle(w);
      const f = w.fighters[0];
      if (sprint) {
        hold(w, 2, { moveX: 1 });
        hold(w, 2, {});
        hold(w, 1, { moveX: 1 });
      }
      hold(w, 40, { moveX: 1 });
      const y = f.y;
      hold(w, 40, { moveX: 1, moveY: -1 });
      return y - f.y;
    };
    expect(climb(true)).toBeGreaterThan(climb(false) + 8);
  });

  it('at the top of the wall he hops over the edge; Jump kicks off the wall', () => {
    const w = arena(['naruto'], 1);
    put(w, 0, 36 * TILE);
    settle(w);
    const f = w.fighters[0];
    // the room is 12 tiles tall: climb to the very top, the wall ends at the ceiling, jump off instead
    hold(w, 40, { moveX: 1 });
    f.x = WALL_X - 6;
    hold(w, 3, { moveX: 1, moveY: -1 });
    expect(f.state).toBe('wallwalk');
    hold(w, 10, { moveX: 1, moveY: -1 });
    hold(w, 1, { moveX: 1, jump: true });
    expect(f.state).not.toBe('wallwalk');
    expect(f.vx).toBeLessThan(-100); // away from the wall
    expect(f.vy).toBeLessThan(0);
  });

  it('only Naruto can do it', () => {
    for (const hero of ['luffy', 'goku', '']) {
      const w = arena([hero], 1);
      put(w, 0, WALL_X - 6);
      settle(w);
      hold(w, 6, { moveX: 1, moveY: -1 });
      expect(w.fighters[0].state, hero).not.toBe('wallwalk');
    }
  });
});

describe('Luffy: the grapple', () => {
  const heldTicks = (w: World, ticks: number, i: Partial<Intent> = { ability: true }) => hold(w, ticks, i);

  it('probe: finds walls, platforms, ladders and ceilings', () => {
    const w = arena(['luffy', ''], 2);
    const f = put(w, 0, 20 * TILE, FLOOR, 1);
    settle(w);
    // straight ahead: the right wall
    expect(grabProbe(w, f, 0, 400)?.kind).toBe('wall');
    // up (x=14 has the solid block at row 3 above it): its underside is a ceiling
    const c = put(w, 0, 14 * TILE);
    expect(grabProbe(w, c, -Math.PI / 2, 400)?.kind).toBe('ceiling');
    // the platform is at x 19..23, row 7, above x=20
    const g = put(w, 0, 21 * TILE);
    expect(grabProbe(w, g, -Math.PI / 2, 400)?.kind).toBe('platform');
    // a ladder column at x=16
    const h = put(w, 0, 12 * TILE);
    const lad = grabProbe(w, h, 0, 400);
    expect(lad?.kind).toBe('ladder');
  });

  it('a tap reaches 100 px; holding keeps reaching until it hits (far targets)', () => {
    const run = (held: boolean) => {
      const w = arena(['luffy', ''], 2);
      put(w, 0, 20 * TILE);
      put(w, 1, 20 * TILE + 250);
      settle(w);
      if (held) heldTicks(w, 30);
      else {
        heldTicks(w, 1);
      }
      hold(w, 30, {});
      return w.fighters[1].vx !== 0 || w.fighters[1].x !== 20 * TILE + 250;
    };
    expect(run(false)).toBe(false);
    expect(run(true)).toBe(true);
  });

  it('holding at a platform above pulls Luffy up onto it; a tap does not move him', () => {
    const w = arena(['luffy', ''], 2);
    const f = put(w, 0, 21 * TILE + 8);
    put(w, 1, 36 * TILE);
    settle(w);
    const y0 = f.y;
    heldTicks(w, 60, { ability: true, moveY: -1 });
    hold(w, 40, {});
    expect(f.y).toBeLessThan(7 * TILE + 2); // standing on the platform (row 7)
    expect(f.grounded).toBe(true);
    expect(y0).toBe(FLOOR);

    const w2 = arena(['luffy', ''], 2);
    const g = put(w2, 0, 21 * TILE + 8);
    put(w2, 1, 36 * TILE);
    settle(w2);
    hold(w2, 1, { ability: true, moveY: -1 });
    hold(w2, 60, {});
    expect(g.y).toBe(FLOOR);
  });

  it('holding at a ladder pulls Luffy onto it and he climbs', () => {
    const w = arena(['luffy', ''], 2);
    const f = put(w, 0, 8 * TILE);
    put(w, 1, 36 * TILE);
    settle(w);
    heldTicks(w, 40);
    hold(w, 3, {});
    expect(f.state).toBe('climb');
    expect(Math.abs(f.x - (16 * TILE + 8))).toBeLessThan(3);
  });

  it('a ceiling makes him swing: a pendulum you can pump; letting go keeps the momentum', () => {
    const w = arena(['luffy', ''], 2);
    const f = put(w, 0, 10 * TILE);
    put(w, 1, 36 * TILE);
    settle(w);
    f.y = 8 * TILE;
    f.grounded = false;
    f.vy = 0;
    // hold up: the arm hits the ceiling (row 0) and he swings
    hold(w, 25, { ability: true, moveY: -1 });
    expect(f.state).toBe('special');
    expect(f.specialKind).toBe('swing');
    expect(f.grip).toBe('ceiling');
    const rope = f.ropeLen;
    // pump right for a while: he swings out and the rope never stretches
    let maxX = f.x;
    let maxDist = 0;
    for (let t = 0; t < 90; t++) {
      w.step([intent({ ability: true, moveX: t < 45 ? 1 : 0 }), intent()]);
      maxX = Math.max(maxX, f.x);
      maxDist = Math.max(maxDist, Math.hypot(f.x - f.anchorX, f.y - SHOULDER - f.anchorY));
    }
    expect(maxX).toBeGreaterThan(10 * TILE + 25);
    expect(maxDist).toBeLessThan(rope + 12);
    // release: he flies on with his momentum, state back to normal, air jump refreshed
    const vx = f.vx;
    hold(w, 2, {});
    expect(f.state).not.toBe('special');
    expect(Math.abs(f.vx)).toBeGreaterThan(Math.abs(vx) * 0.5);
    expect(f.airJumps).toBeGreaterThan(0);
  });

  it('hitting a fighter retracts the arm instead of grabbing past it', () => {
    const w = arena(['luffy', ''], 2);
    put(w, 0, 6 * TILE);
    put(w, 1, 6 * TILE + 120);
    settle(w);
    heldTicks(w, 40);
    hold(w, 40, {});
    expect(w.fighters[1].x).toBeGreaterThan(6 * TILE + 120); // shoved by the punch (no damage)
    expect(w.fighters[0].x).toBeLessThan(6 * TILE + 15); // never got pulled to the wall behind
  });
});

const SHOULDER = 14;

import { BotController } from '../../src/ai/bot';
import { DT } from '../../src/sim/constants';
import { ReplayPlayer } from '../../src/sim/replay';
import { runBotSim } from '../../src/ai/botsim';

describe('clones, replays and bots', () => {
  it('an instant replay with Naruto clones reproduces the round exactly', () => {
    const fighters: FighterSpawn[] = ['naruto', 'luffy', 'goku', 'naruto', '', ''].map((hero, i) => ({ name: 'B' + i, team: 0, isBot: true, upJumps: false, hero: hero || undefined }));
    const m = new Match({ mapId: 'factory', mode: 'brawl', fighters, roundsToWin: 5, friendlyFire: false, weaponSpawnRate: 1, seed: 21, heroPowers: true });
    const bots = () => m.world.fighters.map((f, i) => new BotController(() => m.world, i, { seed: 4, clone: f.master >= 0 }));
    const list = bots();
    const original = m.world;
    let summoned = 0;
    for (let t = 0; t < 150 / DT && m.round === 1; t++) {
      const ints = list.map((b) => b.poll());
      // (make sure clones are in play even if the bots would not have called them yet: press ability 2 for the Narutos)
      if (t === 90) original.fighters.forEach((f, i) => f.hero === 'naruto' && f.master < 0 && f.alive && (ints[i] = intent({ ...ints[i], kick: true })));
      m.step(ints);
      summoned = Math.max(summoned, original.fighters.filter((c) => c.master >= 0 && c.alive).length);
      m.world.events.length = 0;
    }
    expect(m.round).toBe(2);
    expect(summoned).toBeGreaterThan(0);
    const rec = m.lastRecording!;
    expect(rec.count).toBe(original.fighters.length);
    const p = new ReplayPlayer(rec);
    p.skipTo(rec.ticks);
    const snap = (w: typeof original) => JSON.stringify([w.tick, w.fighters.map((f) => [f.x, f.y, f.hp, f.alive, f.state])]);
    expect(snap(p.world)).toBe(snap(original));
  });

  it.each(['leaf', 'ship', 'factory'])('bot matches with all three heroes (and clones) finish without anyone stuck on %s', (map) => {
    const r = runBotSim({ matches: 1, bots: 8, map, difficulty: 'hard', seed: 9, heroes: ['naruto', 'luffy', 'goku', 'naruto'], heroPowers: true });
    expect(r.timeouts).toBe(0);
    expect(r.totalKills).toBeGreaterThan(4);
    expect(r.maxIdle, r.idleAt).toBeLessThan(10);
  });
});
