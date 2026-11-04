import { describe, expect, it } from 'vitest';
import { HEROES, SASUKE_ARROW, ULT_WINDUP, bombRange, bombSpeed } from '../../src/sim/data/heroes';

describe('ultimate wind-up and Naruto\'s ladder', () => {
  it('every gathered ultimate takes the same, fair-to-counter time; Luffy has none', () => {
    expect(ULT_WINDUP).toBeGreaterThanOrEqual(2);
    expect(ULT_WINDUP).toBeLessThanOrEqual(3);
    for (const id of ['sasuke', 'naruto', 'goku']) expect(HEROES[id].super.bomb!.windup, id).toBe(ULT_WINDUP);
    expect(HEROES.luffy.super.bomb).toBeUndefined();
  });

  it('Naruto\'s ultimate gets faster and longer ranged with every form, ending at Sasuke\'s final arrow', () => {
    const n = HEROES.naruto.super.bomb!;
    const s = HEROES.sasuke.super.bomb!;
    const speeds = [1, 2, 3, 4].map((l) => bombSpeed('naruto', n, l));
    const ranges = [1, 2, 3, 4].map((l) => bombRange('naruto', n, l));
    for (let i = 1; i < 4; i++) {
      expect(speeds[i]).toBeGreaterThan(speeds[i - 1]);
      expect(ranges[i]).toBeGreaterThan(ranges[i - 1]);
    }
    expect(speeds[3]).toBeCloseTo(bombSpeed('sasuke', s, 4), 0);
    expect(ranges[3]).toBe(SASUKE_ARROW.lockRange);
    expect(bombRange('sasuke', s, 4)).toBe(SASUKE_ARROW.lockRange);
  });
});

import { transform } from '../../src/sim/hero';
import { World } from '../../src/sim/world';
import { FLAT, intent, run } from './helpers';
import { ULT_MAP_RANGE, spiritBounds } from '../../src/sim/data/heroes';

describe('final ultimates', () => {
  it('fly the whole map and are framed by the camera as a giant spirit', () => {
    expect(bombRange('sasuke', HEROES.sasuke.super.bomb!, 4)).toBe(ULT_MAP_RANGE);
    expect(bombRange('naruto', HEROES.naruto.super.bomb!, 4)).toBe(ULT_MAP_RANGE);
    expect(ULT_MAP_RANGE).toBeGreaterThan(FLAT.rows[0].length * 16 * 2);
    expect(spiritBounds('sasuke', 4)!.up).toBeGreaterThan(150);
    expect(spiritBounds('naruto', 4)!.back).toBeGreaterThan(150);
    expect(spiritBounds('naruto', 3)).toBeNull();
  });

  it('hold the caster in mid-air until the shot is away', () => {
    const w = new World(FLAT, [{ name: 'a', hero: 'sasuke', team: 1, isBot: false, upJumps: false }, { name: 'b', team: 2, isBot: false, upJumps: false }], { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 3);
    run(w, 5);
    const f = w.fighters[0];
    for (let i = 0; i < 4; i++) transform(w, f);
    f.x = f.px = 60;
    f.y = f.py = 60; // well above the floor
    f.vx = f.vy = 0;
    f.grounded = false;
    w.fighters[1].x = w.fighters[1].px = 400;
    w.step([intent({ ability: true, kick: true }), intent()]);
    const y0 = f.y;
    for (let i = 0; i < 100; i++) w.step([intent(), intent()]);
    expect(f.state).toBe('special');
    expect(Math.abs(f.y - y0)).toBeLessThan(1);
  });
});
