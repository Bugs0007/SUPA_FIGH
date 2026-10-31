import { describe, expect, it } from 'vitest';
import { applyHit } from '../../src/sim/combat';
import { HEROES } from '../../src/sim/data/heroes';
import type { SimEvent } from '../../src/sim/events';
import { amaterasuReach, amaterasuTargets, chidoriReach, transform } from '../../src/sim/hero';
import type { Intent } from '../../src/sim/intent';
import { TK } from '../../src/sim/map/tiles';
import { World } from '../../src/sim/world';
import { FLAT, intent, run } from './helpers';

const S = HEROES.sasuke;

/** Sasuke at x = 70 on the floor of the flat test map, facing right, plus `others` fighters placed by the caller. */
function arena(level: number, others: { x: number; y?: number; team?: number; hero?: string }[], team = 0): World {
  const w = new World(
    FLAT,
    [
      { name: 'SASUKE', hero: 'sasuke', team, isBot: false, upJumps: false },
      ...others.map((o, i) => ({ name: 'E' + i, team: o.team ?? 0, hero: o.hero, isBot: false, upJumps: false })),
    ],
    { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 },
    51,
  );
  run(w, 5);
  w.fighters.forEach((f, i) => {
    f.x = f.px = i === 0 ? 70 : others[i - 1].x;
    f.y = f.py = i === 0 ? 144 : (others[i - 1].y ?? 144);
    f.vx = f.vy = f.invuln = 0;
    f.facing = 1;
  });
  for (let i = 0; i < level; i++) transform(w, w.fighters[0]);
  w.events.length = 0;
  return w;
}

function press(w: World, input: Partial<Intent>, ticks = 60): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    w.step(w.fighters.map((_, n) => (n === 0 ? intent(i === 0 ? input : {}) : intent())));
    events.push(...w.events);
    w.events.length = 0;
  }
  return events;
}

describe('Chidori stuns', () => {
  it('holds the victim for two seconds (not a knockdown), and a later short stun cannot cut it short', () => {
    const w = arena(0, [{ x: 130 }]);
    const [, victim] = w.fighters;
    press(w, { ability: true }, 40);
    expect(victim.state).toBe('flinch');
    expect(victim.flinchTime).toBe(2);
    expect(victim.hp).toBeLessThan(100);
    // still stunned 1.5 s later, free after 2 s
    const stunnedAt = w.time - 0; // (a few ticks after the hit)
    run(w, 80);
    expect(victim.state, `${(w.time - stunnedAt).toFixed(2)} s after`).toBe('flinch');
    // somebody else's 0.3 s stun lands in the middle of it: the rest of the two seconds stays
    const left = victim.flinchTime - victim.stateTime;
    applyHit(w, victim, { damage: 1, kbX: 0, kbY: 0, attacker: -1, weapon: 'test', kind: 'melee', stun: 0.3, ignoreInvuln: true });
    expect(victim.flinchTime).toBeGreaterThanOrEqual(left - 1e-6);
    run(w, 70);
    expect(victim.state).not.toBe('flinch');
  });

  it('a short stun still works as before (and still knocks down when it asks to)', () => {
    const w = arena(0, [{ x: 130 }]);
    const v = w.fighters[1];
    applyHit(w, v, { damage: 1, kbX: 0, kbY: 0, attacker: 0, weapon: 'test', kind: 'melee', stun: 0.3, ignoreInvuln: true });
    expect(v.state).toBe('flinch');
    expect(v.flinchTime).toBe(0.3);
    applyHit(w, v, { damage: 1, kbX: 0, kbY: 0, attacker: 0, weapon: 'test', kind: 'melee', stun: 0.2, knockdown: true, ignoreInvuln: true });
    expect(v.state).toBe('knockdown');
  });

  it('the reach (how many fighters, how far from the victim) grows with the form', () => {
    const spread = S.base.dash!.spread!;
    const reach = [0, 1, 2, 3, 4].map((l) => chidoriReach(spread, l));
    for (let l = 1; l <= 4; l++) {
      expect(reach[l].count).toBe(reach[l - 1].count + 1);
      expect(reach[l].radius).toBeGreaterThan(reach[l - 1].radius);
    }
    expect(reach[0].count).toBeGreaterThanOrEqual(1);
    expect(reach[4].count).toBeGreaterThan(reach[0].count);
  });

  for (let level = 0; level <= 4; level++) {
    it(`form ${level}: the shock stuns exactly the nearest ${1 + level} other enemies within ${40 + 14 * level} px of the victim`, () => {
      const reach = chidoriReach(S.base.dash!.spread!, level);
      // the victim at 130, then six more enemies stacked behind it at growing distances
      const dists = [14, 28, 42, 56, 70, 84];
      const w = arena(level, [{ x: 130 }, ...dists.map((d, i) => ({ x: 130 + d, y: i % 2 ? 144 : 144 }))]);
      const events = press(w, { ability: true }, 45);
      const victim = w.fighters[1];
      expect(victim.state).toBe('flinch');
      const stunned = w.fighters.slice(2).map((f) => f.state === 'flinch' && f.flinchTime >= 2);
      const within = dists.filter((d) => d <= reach.radius);
      const expected = Math.min(reach.count, within.length);
      expect(stunned.filter(Boolean).length, `form ${level}: ${JSON.stringify(stunned)}`).toBe(expected);
      // they are the NEAREST ones, in order
      stunned.slice(0, expected).forEach((s) => expect(s).toBe(true));
      expect(events.filter((e) => e.t === 'arc')).toHaveLength(expected);
      // the further ones are untouched
      w.fighters.slice(2 + expected).forEach((f) => expect(f.hp).toBe(100));
    });
  }

  it('never stuns friends (unless friendly fire is on), and clones of Sasuke are not enemies', () => {
    const w = arena(4, [{ x: 130, team: 2 }, { x: 150, team: 1 }, { x: 160, team: 2 }], 1);
    press(w, { ability: true }, 45);
    expect(w.fighters[1].state).toBe('flinch'); // an enemy
    expect(w.fighters[2].state).not.toBe('flinch'); // a teammate of Sasuke
    expect(w.fighters[2].hp).toBe(100);
    expect(w.fighters[3].state).toBe('flinch'); // another enemy, arced to
  });
});

describe('Sasuke fireball', () => {
  const cast = (level: number, others: { x: number; y?: number }[] = [{ x: 300 }]) => {
    const w = arena(level, others);
    press(w, { kick: true }, 24);
    return w;
  };

  it('is much bigger than before and every form has a bigger one', () => {
    const sizes = [0, 1, 2].map((l) => cast(l).bullets.find((b) => b.active && b.weapon === 'sasuke:second')!.size);
    expect(sizes[0]).toBeGreaterThanOrEqual(8);
    expect(sizes[1]).toBeGreaterThan(sizes[0]);
    expect(sizes[2]).toBeGreaterThan(sizes[1]);
    expect(sizes[0]).toBeCloseTo(S.second.fireball!.size);
    const blast = [0, 1, 2].map((l) => cast(l).bullets.find((b) => b.active && b.weapon === 'sasuke:second')!.explosion!.radius);
    expect(blast[1]).toBeGreaterThan(blast[0]);
    expect(blast[2]).toBeGreaterThan(blast[1]);
  });

  it('burns the character it hits and the ones in the blast', () => {
    const w = arena(1, [{ x: 150 }, { x: 170 }, { x: 290 }]);
    press(w, { kick: true }, 70);
    const [, hit, beside, far] = w.fighters;
    expect(hit.burn).toBeGreaterThan(0);
    expect(beside.burn).toBeGreaterThan(0); // standing in the blast
    expect(far.burn).toBe(0);
    expect(hit.burnBy).toBe(0);
  });

  it('scatters fire that sets the arena alight: wooden floor, wooden walls and crates', () => {
    // a wooden floor under the target
    const floor = arena(0, [{ x: 160 }]);
    for (let x = 8; x <= 12; x++) floor.map.set(x, 9, TK.WOOD);
    press(floor, { kick: true }, 90);
    expect(floor.fires.some((p) => p.active) || floor.burningTiles.size > 0).toBe(true);
    expect(floor.burningTiles.size).toBeGreaterThan(0);

    // a wooden wall in its path catches where it lands
    const wall = arena(0, [{ x: 400 }]);
    for (let y = 6; y <= 8; y++) wall.map.set(14, y, TK.WOOD);
    press(wall, { kick: true }, 60);
    expect(wall.burningTiles.size).toBeGreaterThan(0);

    // a crate takes burn damage
    const crate = arena(0, [{ x: 400 }]);
    const p = crate.spawnProp('crate', 175, 144);
    for (let x = 8; x <= 13; x++) crate.map.set(x, 9, TK.WOOD);
    press(crate, { kick: true }, 150);
    expect(p.hp < p.def.hp || !p.active).toBe(true);
  });
});

describe('Amaterasu', () => {
  it.each([3, 4])('form %i burns its quota of enemies, nearest first, and spills fire on the ground', (level) => {
    const quota = 3 + (level - 3);
    // six enemies in front at growing distance (all inside the range of both forms)
    const xs = [110, 125, 140, 160, 180, 200];
    const w = arena(level, xs.map((x) => ({ x })));
    const reach = amaterasuReach(w.fighters[0]);
    expect(reach.count).toBe(quota);
    for (let x = 6; x <= 14; x++) w.map.set(x, 9, TK.WOOD);
    const events = press(w, { kick: true }, 60);
    const burning = w.fighters.slice(1).map((f) => f.burn > 0 && f.burnStyle === 'amaterasu');
    expect(burning.filter(Boolean)).toHaveLength(quota);
    burning.slice(0, quota).forEach((b) => expect(b).toBe(true)); // the nearest ones
    const casts = events.filter((e) => e.t === 'amaterasu');
    expect(casts.map((e) => e.t === 'amaterasu' && e.index)).toEqual(Array.from({ length: quota }, (_, i) => i));
    expect(casts.every((e) => e.t === 'amaterasu' && e.target > 0)).toBe(true);
    // the environment burns too: black patches on the floor, wood catching fire
    expect(w.fires.some((p) => p.active && p.black)).toBe(true);
    expect(w.burningTiles.size).toBeGreaterThan(0);
  });

  it('the range grows with the form: an enemy 280 px away is out of reach of Mangekyo and in reach of the top form', () => {
    const w3 = arena(3, [{ x: 70 + 270 }]);
    const w4 = arena(4, [{ x: 70 + 270 }]);
    expect(amaterasuReach(w3.fighters[0]).range).toBe(S.second.amaterasu!.range);
    expect(amaterasuReach(w4.fighters[0]).range).toBeGreaterThan(amaterasuReach(w3.fighters[0]).range);
    w3.fighters[0].stretchAngle = 0;
    w4.fighters[0].stretchAngle = 0;
    expect(amaterasuTargets(w3, w3.fighters[0])).toHaveLength(0);
    expect(amaterasuTargets(w4, w4.fighters[0])).toHaveLength(1);
    press(w4, { kick: true }, 60);
    expect(w4.fighters[1].burn).toBeGreaterThan(0);
  });

  it('walls block it, friends are skipped and nobody in sight is reported once', () => {
    const w = arena(3, [{ x: 120 }, { x: 140, team: 1 }, { x: 160 }], 1);
    const targets = amaterasuTargets(w, w.fighters[0]);
    expect(targets.map((t) => t.id)).toEqual([1, 3]); // not the teammate
    for (let y = 6; y <= 9; y++) w.map.set(6, y, TK.CONCRETE); // a wall between Sasuke and everybody
    expect(amaterasuTargets(w, w.fighters[0])).toHaveLength(0);
    const events = press(arena(3, []), { kick: true }, 50);
    const none = events.filter((e) => e.t === 'amaterasu');
    expect(none).toHaveLength(1);
    expect(none[0].t === 'amaterasu' && none[0].target).toBe(-1);
  });
});

describe('ultimates lock onto the enemy being faced', () => {
  /** Press both ability buttons and watch for the arrow the moment it appears (so we see how it was aimed). */
  const fire = (w: World, _level = 4, input: Partial<Intent> = {}) => {
    let bullet: { vx: number; vy: number } | undefined;
    for (let i = 0; i < 80 && !bullet; i++) {
      w.step(w.fighters.map((_, n) => (n === 0 ? intent(i === 0 ? { ability: true, kick: true, ...input } : {}) : intent())));
      const b = w.bullets.find((q) => q.active && q.weapon === 'sasuke:super');
      if (b) bullet = { vx: b.vx, vy: b.vy };
      w.events.length = 0;
    }
    return { bullet };
  };

  it('aims at an enemy standing higher up: the arrow rises and hits, where a straight shot would pass under', () => {
    // on the raised platform of the test map
    const w = arena(4, [{ x: 160, y: 80 }]);
    const { bullet } = fire(w);
    expect(bullet).toBeDefined();
    expect(bullet!.vy).toBeLessThan(0);
    run(w, 90);
    expect(w.fighters[1].hp).toBeLessThan(100); // it arrived
  });

  it('locks onto the nearest enemy in front, never one behind or a teammate', () => {
    // Sasuke (team 1), an enemy behind, a teammate, a far enemy, a nearer enemy
    const w = arena(4, [{ x: 20 }, { x: 250, team: 1 }, { x: 420 }, { x: 300 }], 1);
    press(w, { ability: true, kick: true }, 10);
    expect(w.fighters[0].state).toBe('special');
    expect(w.fighters[0].lockOn).toBe(4);
  });

  it('remembers the lock during the windup and shows which enemy it picked', () => {
    const w = arena(4, [{ x: 20 }, { x: 420 }, { x: 300 }]);
    press(w, { ability: true, kick: true }, 10);
    expect(w.fighters[0].state).toBe('special');
    expect(w.fighters[0].lockOn).toBe(3); // 300 is nearer than 420; 20 is behind
  });

  it('leads a moving target', () => {
    const w = arena(4, [{ x: 300, y: 144 }]);
    const t = w.fighters[1];
    t.facing = -1;
    let hit = false;
    for (let i = 0; i < 160; i++) {
      w.step([intent(i === 0 ? { ability: true, kick: true } : {}), intent({ moveX: i < 80 ? 1 : 0 })]);
      if (w.events.some((e) => e.t === 'hit' && e.weapon === 'sasuke:super')) hit = true;
      w.events.length = 0;
    }
    expect(hit || t.hp < 100).toBe(true);
  });

  it('holding Up / Down still aims by hand (no lock-on)', () => {
    const w = arena(4, [{ x: 160, y: 80 }]);
    const { bullet } = fire(w, 4, { moveY: 1 });
    expect(bullet!.vy).toBeGreaterThanOrEqual(0);
  });

  for (const hero of ['goku', 'naruto'] as const) {
    it(`${hero}'s ultimate locks on as well`, () => {
      const w = new World(
        FLAT,
        [
          { name: 'H', hero, team: 0, isBot: false, upJumps: false },
          { name: 'T', team: 0, isBot: false, upJumps: false },
        ],
        { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 },
        52,
      );
      run(w, 5);
      w.fighters[0].x = w.fighters[0].px = 70;
      w.fighters[0].facing = 1;
      for (let tx = 18; tx <= 22; tx++) w.map.set(tx, 6, TK.PLAT_METAL); // a ledge for the target to stand on
      w.fighters[1].x = w.fighters[1].px = 320;
      w.fighters[1].y = w.fighters[1].py = 96;
      for (const f of w.fighters) f.vx = f.vy = f.invuln = 0;
      for (let i = 0; i < 2; i++) transform(w, w.fighters[0]);
      w.events.length = 0;
      press(w, { ability: true, kick: true }, 70);
      const b = w.bullets.find((q) => q.active && q.weapon === `${hero}:super`);
      expect(b, 'the ultimate was fired').toBeDefined();
      expect(b!.vy).toBeLessThan(0); // towards the enemy standing higher up
    });
  }
});
