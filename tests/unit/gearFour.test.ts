import { describe, expect, it } from 'vitest';
import { HEROES, STAMINA } from '../../src/sim/data/heroes';
import { canTakeOff, flightStamina, holdFlies, transform } from '../../src/sim/hero';
import type { Intent } from '../../src/sim/intent';
import { World } from '../../src/sim/world';
import { FLAT, intent, spec } from './helpers';

const FLOOR = 144;
const ST = HEROES.luffy.forms[2].stamina!;

function world(level: number): World {
  const w = new World(FLAT, [{ ...spec('A'), upJumps: true, hero: 'luffy' }, spec('B')], { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 3);
  for (let i = 0; i < 3; i++) w.step([]);
  const [a, b] = w.fighters;
  for (const [f, x] of [[a, 100], [b, 440]] as const) {
    f.x = f.px = x;
    f.y = f.py = FLOOR;
    f.vx = f.vy = 0;
  }
  for (let i = 0; i < level; i++) transform(w, a);
  w.step([]);
  return w;
}

const hold = (w: World, ticks: number, i: Partial<Intent> = {}) => {
  for (let t = 0; t < ticks; t++) w.step([intent(i), intent()]);
};

/** jump, double jump, jump again */
function takeOff(w: World): void {
  for (let n = 0; n < 3; n++) {
    w.step([intent({ moveY: -1 }), intent()]);
    hold(w, 8);
  }
}

describe('Gear Fourth: a superman flight on a stamina meter', () => {
  it('Gear Fourth flies on a meter, Gear Third does not, Gear Fifth flies free', () => {
    expect(holdFlies(world(3).fighters[0])).toBe(true);
    expect(flightStamina(world(3).fighters[0])).not.toBeNull();
    expect(holdFlies(world(2).fighters[0])).toBe(false);
    expect(holdFlies(world(4).fighters[0])).toBe(true);
    expect(flightStamina(world(4).fighters[0])).toBeNull();
  });

  it('takes off, burns stamina while flying (faster in a sprint rush), and drops when it runs out', () => {
    const w = world(3);
    const a = w.fighters[0];
    takeOff(w);
    expect(a.flying).toBe(true);
    const s0 = a.stamina;
    hold(w, 30, { moveY: -1 });
    expect(a.stamina).toBeLessThan(s0);
    // a rush straight up (double-tap Up) burns faster than plain flying
    const plain = s0 - a.stamina;
    const w2 = world(3);
    const b = w2.fighters[0];
    takeOff(w2);
    const t0 = b.stamina;
    for (let t = 0; t < 3; t++) {
      w2.step([intent({ moveY: -1 }), intent()]);
      w2.step([intent({ moveY: 0 }), intent()]);
    }
    hold(w2, 30, { moveY: -1 });
    expect(b.flyRush).toBe(-1);
    expect(t0 - b.stamina).toBeGreaterThan(plain);
    // keep flying until empty
    let ended = false;
    for (let t = 0; t < 60 * 12 && !ended; t++) {
      w.step([intent({ moveY: -1 }), intent()]);
      for (const e of w.events) if (e.t === 'flyEnd' && e.empty) ended = true;
      w.events.length = 0;
    }
    expect(ended).toBe(true);
    expect(a.flying).toBe(false);
    expect(a.stamina).toBe(0);
  });

  it('refills on the ground, and cannot take off while nearly empty', () => {
    const w = world(3);
    const a = w.fighters[0];
    a.stamina = ST.minStart - 5;
    expect(canTakeOff(a)).toBe(false);
    takeOff(w);
    expect(a.flying).toBe(false);
    hold(w, 60 * 3);
    expect(a.grounded).toBe(true);
    expect(a.stamina).toBe(STAMINA.max);
    expect(canTakeOff(a)).toBe(true);
  });

  it('the superman sprint pose reads from the sim: sprintDir / flyRush while flying', () => {
    const w = world(3);
    const a = w.fighters[0];
    takeOff(w);
    w.step([intent({ moveX: 1 }), intent()]);
    w.step([intent({ moveX: 0 }), intent()]);
    hold(w, 20, { moveX: 1 }); // (the second press of the double-tap, held)
    expect(a.flying).toBe(true);
    expect(a.sprintDir).toBe(1);
    expect(a.vx).toBeGreaterThan(150);
  });
});
