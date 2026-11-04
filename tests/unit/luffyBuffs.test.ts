import { describe, expect, it } from 'vitest';
import { HEROES, JET_BAZOOKA, REFLECT } from '../../src/sim/data/heroes';
import { SLOT } from '../../src/sim/data/weapons';
import type { Fighter } from '../../src/sim/fighter';
import { reflects, transform } from '../../src/sim/hero';
import type { Intent } from '../../src/sim/intent';
import { World } from '../../src/sim/world';
import { FLAT, intent, spec } from './helpers';

const FLOOR = 144;

function duel(luffyLevel: number, gap = 90): World {
  const w = new World(FLAT, [{ ...spec('A'), hero: 'luffy' }, spec('B')], { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 7);
  for (let i = 0; i < 5; i++) w.step([]);
  const [a, b] = w.fighters;
  for (const [f, x, face] of [[a, 100, 1], [b, 100 + gap, -1]] as const) {
    f.x = f.px = x;
    f.y = f.py = FLOOR;
    f.vx = f.vy = f.invuln = 0;
    f.facing = face;
    f.state = 'normal';
  }
  for (let i = 0; i < luffyLevel; i++) transform(w, a);
  w.step([]);
  w.events.length = 0;
  return w;
}

const step = (w: World, ticks: number, a: Partial<Intent> = {}, b: Partial<Intent> = {}) => {
  for (let t = 0; t < ticks; t++) w.step([intent(a), intent(b)]);
};

/** B (the enemy) shoots a pistol at A; A guards the whole time. Returns A after the shot has landed or bounced. */
function shootAtLuffy(level: number): { w: World; a: Fighter; b: Fighter } {
  const w = duel(level, 150);
  const [a, b] = w.fighters;
  b.inv[SLOT.SIDEARM] = { id: 'pistol', ammo: 12, dur: 1 };
  b.active = SLOT.SIDEARM;
  step(w, 30, { block: true }, {});
  step(w, 20, { block: true }, { attack: true });
  return { w, a, b };
}

describe('Gear Fifth: the guard throws projectiles back', () => {
  it('only Gear Fifth (and only while guarding) reflects', () => {
    for (let lvl = 0; lvl <= 4; lvl++) {
      const w = duel(lvl);
      const a = w.fighters[0];
      step(w, 30, { block: true });
      expect(a.state).toBe('block');
      expect(reflects(a), 'level ' + lvl).toBe(lvl === 4);
    }
    const w = duel(4);
    expect(reflects(w.fighters[0])).toBe(false); // not guarding
  });

  it('a shot is flung back at the shooter: same speed, 10% of the damage, credited to Luffy', () => {
    const { w, a, b } = shootAtLuffy(4);
    const ev: string[] = [];
    let speedIn = 0;
    let speedOut = 0;
    let reflected = false;
    for (let t = 0; t < 80; t++) {
      const bu = w.bullets.find((x) => x.active);
      if (bu && !reflected && bu.owner === b.id) speedIn = Math.hypot(bu.vx, bu.vy);
      w.step([intent({ block: true }), intent()]);
      for (const e of w.events) ev.push(e.t);
      const after = w.bullets.find((x) => x.active && x.owner === a.id);
      if (after && !reflected) {
        reflected = true;
        speedOut = Math.hypot(after.vx, after.vy);
        expect(after.vx).toBeGreaterThan(0); // heading back to B
        expect(after.damage).toBeCloseTo(11 * REFLECT.damageMul * 1, 0); // pistol damage x 0.1 (about 1)
      }
      w.events.length = 0;
    }
    expect(ev).toContain('reflect');
    expect(reflected).toBe(true);
    expect(speedOut).toBeCloseTo(speedIn, 3);
    expect(b.hp).toBeLessThan(b.maxHp);
    expect(b.hp).toBeGreaterThan(b.maxHp - 5); // a tenth of a pistol shot
    expect(a.hp).toBe(a.maxHp);
  });

  it('lower gears just block it like anyone else', () => {
    const { w, a, b } = shootAtLuffy(3);
    for (let t = 0; t < 80; t++) w.step([intent({ block: true }), intent()]);
    expect(b.hp).toBe(b.maxHp);
    expect(a.hp).toBeLessThanOrEqual(a.maxHp);
  });

  it('a shot from behind is not reflected', () => {
    const w = duel(4, 150);
    const [a, b] = w.fighters;
    b.inv[SLOT.SIDEARM] = { id: 'pistol', ammo: 12, dur: 1 };
    b.active = SLOT.SIDEARM;
    step(w, 30, { block: true }, {});
    step(w, 4, { block: true, moveX: -1 }, {}); // Luffy turns his back (still guarding)
    expect(a.facing).toBe(-1);
    step(w, 20, { block: true }, { attack: true });
    step(w, 40, { block: true });
    expect(a.hp + a.formHp).toBeLessThan(a.maxHp + 4 * 30);
    expect(b.hp).toBe(b.maxHp);
  });
});

describe('Luffy: Jet Bazooka is a base-form move', () => {
  it('Punch + Ability starts it without a power orb, from base form', () => {
    const w = duel(0, 140);
    const a = w.fighters[0];
    expect(a.powerLevel).toBe(0);
    step(w, 1, { attack: true, ability: true });
    expect(a.state).toBe('special');
    expect(a.specialKind).toBe('formCombo');
  });

  it('hits harder than before (slingshot 22 -> 30, grab-and-kick 30 -> 40)', () => {
    expect(JET_BAZOOKA.damage).toBeGreaterThanOrEqual(28);
    expect(JET_BAZOOKA.kickDamage).toBeGreaterThanOrEqual(38);
    const w = duel(0, 40);
    const [a, b] = w.fighters;
    step(w, 1, { attack: true, ability: true });
    expect(a.specialKind).toBe('formCombo');
    const hp = b.hp;
    step(w, 60, {});
    expect(b.hp).toBeLessThan(hp - 25);
  });

  it('the grapple tunables stay below nothing else: Gear Fifth is the one that reflects', () => {
    const reflecting = HEROES.luffy.forms.filter((f) => f.reflects);
    expect(reflecting.map((f) => f.name)).toEqual(['GEAR FIFTH']);
  });
});
