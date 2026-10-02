import { describe, expect, it } from 'vitest';
import { AIR_JUMPS, RUN_SPEED, SPRINT_MUL, TILE } from '../../src/sim/constants';
import type { MapDef } from '../../src/sim/map/mapData';
import { World } from '../../src/sim/world';
import { intent, makeWorld, run, spec } from './helpers';

const FLOOR_Y = 9 * TILE;

function apex(w: World, script: (t: number) => Partial<Parameters<typeof intent>[0]>, ticks = 90): number {
  const f = w.fighters[0];
  let minY = f.y;
  for (let t = 0; t < ticks; t++) {
    w.step([intent(script(t))]);
    minY = Math.min(minY, f.y);
  }
  return FLOOR_Y - minY;
}

describe('double jump', () => {
  it('a second press in the air jumps again, a third does nothing', () => {
    const single = apex(makeWorld(), (t) => ({ jump: t < 30 }));
    const w2 = makeWorld();
    const dbl = apex(w2, (t) => ({ jump: t < 14 || (t >= 16 && t < 40) }));
    expect(dbl).toBeGreaterThan(single + 25);
    expect(w2.fighters[0].airJumps).toBe(AIR_JUMPS); // landed again: refreshed
    const w3 = makeWorld();
    const triple = apex(w3, (t) => ({ jump: t < 14 || (t >= 16 && t < 24) || (t >= 26 && t < 40) }));
    expect(triple).toBeLessThan(dbl + 4);
  });

  it('walking off a ledge keeps the air jump', () => {
    const w = makeWorld();
    const f = w.fighters[0];
    run(w, 2);
    // stand on the one-way platform (row 5, cols 7..12) and walk off its right end
    f.x = f.px = 12 * TILE + 4;
    f.y = f.py = 5 * TILE;
    f.vx = f.vy = 0;
    run(w, 20, () => [intent({ moveX: 1 })]);
    expect(f.grounded).toBe(false);
    expect(f.airJumps).toBe(AIR_JUMPS);
    const vy0 = f.vy;
    run(w, 1, () => [intent({ moveX: 1, jump: true })]);
    expect(f.vy).toBeLessThan(Math.min(vy0, 0) - 200);
    expect(f.airJumps).toBe(AIR_JUMPS - 1);
  });
});

const SHAFT: MapDef = {
  id: 'shaft',
  name: 'shaft',
  theme: 'arena',
  rows: [
    '#........................#',
    '#........................#',
    '#........................#',
    '#........................#',
    '#........................#',
    '#........................#',
    '#........................#',
    '#........................#',
    '#........................#',
    '#........................#',
    '#........................#',
    '#S......................S#',
    '##########################',
  ],
};

describe('wall jump', () => {
  it('kicks off a wall, refreshes the air jump, but not twice off the same wall', () => {
    const w = new World(SHAFT, [spec('A'), spec('B')], { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 1);
    const f = w.fighters[0];
    run(w, 2);
    f.x = f.px = 3 * TILE;
    f.y = f.py = 12 * TILE;
    // jump straight up, spend the air jump, then drift into the left wall and jump off it
    run(w, 10, (t) => [intent({ jump: t < 8 })]);
    run(w, 2, () => [intent({ jump: true })]);
    expect(f.airJumps).toBe(0);
    for (let i = 0; i < 40 && f.x - f.w / 2 > TILE + 0.5; i++) w.step([intent({ moveX: -1 })]);
    expect(f.grounded).toBe(false);
    run(w, 1, () => [intent({ jump: true, moveX: -1 })]);
    expect(f.vx).toBeGreaterThan(100);
    expect(f.lastWallSide).toBe(-1);
    expect(f.airJumps).toBe(AIR_JUMPS);
    // straight back into the same wall: no second wall jump (the air jump is spent instead)
    run(w, 14, () => [intent({ moveX: -1 })]);
    run(w, 1, () => [intent({ jump: true, moveX: -1 })]);
    expect(f.airJumps).toBe(AIR_JUMPS - 1);
    run(w, 6, () => [intent({ moveX: -1 })]);
    run(w, 1, () => [intent({ jump: true, moveX: -1 })]);
    expect(f.vx).toBeLessThanOrEqual(0);
    // landing resets
    run(w, 120);
    expect(f.lastWallSide).toBe(0);
  });

  it('pressing into a wall slows the fall', () => {
    const w = new World(SHAFT, [spec('A'), spec('B')], { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 1);
    const f = w.fighters[0];
    run(w, 2);
    f.x = f.px = TILE + f.w / 2;
    f.y = f.py = 2 * TILE;
    f.grounded = false;
    run(w, 40, () => [intent({ moveX: -1 })]);
    expect(f.vy).toBeLessThanOrEqual(150.01);
  });
});

describe('sprint', () => {
  it('double-tap sprints, a single tap just runs', () => {
    const speed = (taps: boolean) => {
      const w = makeWorld();
      const f = w.fighters[0];
      run(w, 2);
      f.x = f.px = 60;
      if (taps) {
        run(w, 3, () => [intent({ moveX: 1 })]);
        run(w, 3, () => [intent()]);
      }
      let top = 0;
      for (let i = 0; i < 40; i++) {
        w.step([intent({ moveX: 1 })]);
        top = Math.max(top, Math.abs(f.vx));
      }
      return top;
    };
    expect(speed(false)).toBeLessThanOrEqual(RUN_SPEED + 0.01);
    expect(speed(true)).toBeGreaterThan(RUN_SPEED * (SPRINT_MUL - 0.05));
  });

  it('releasing the direction ends the sprint with a cooldown', () => {
    const w = makeWorld();
    const f = w.fighters[0];
    run(w, 2);
    f.x = f.px = 60;
    run(w, 3, () => [intent({ moveX: 1 })]);
    run(w, 3, () => [intent()]);
    run(w, 10, () => [intent({ moveX: 1 })]);
    expect(f.sprintDir).toBe(1);
    run(w, 1, () => [intent()]);
    expect(f.sprintDir).toBe(0);
    expect(f.sprintCooldown).toBeGreaterThan(0);
  });
});
