import { describe, expect, it } from 'vitest';
import { TILE } from '../../src/sim/constants';
import { getMap } from '../../src/sim/map/maps';
import type { Intent } from '../../src/sim/intent';
import { World } from '../../src/sim/world';
import { intent, spec } from './helpers';

// Uses the real Test Arena geometry (see src/sim/map/maps/testArena.ts).
function arena(): World {
  const w = new World(getMap('test'), [spec('A'), spec('B')], { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 1);
  w.fighters[1].x = 60; // park B far away
  w.fighters[1].y = 27 * TILE;
  return w;
}

function place(w: World, x: number, y: number): void {
  const f = w.fighters[0];
  f.x = f.px = x;
  f.y = f.py = y;
  f.vx = f.vy = 0;
  f.state = 'normal';
  for (let i = 0; i < 5; i++) w.step([]);
}

function hold(w: World, ticks: number, i: Partial<Intent>): void {
  for (let t = 0; t < ticks; t++) w.step([intent(i)]);
}

describe('moveset on the test arena', () => {
  it('climbs a ladder to the top and stands on it', () => {
    const w = arena();
    const f = w.fighters[0];
    place(w, 18 * TILE + 8, 27 * TILE);
    hold(w, 2, { moveY: -1 });
    expect(f.state).toBe('climb');
    hold(w, 200, { moveY: -1 });
    expect(f.state).toBe('normal');
    expect(f.y).toBe(14 * TILE);
    // and back down from the top
    hold(w, 3, { moveY: 1 });
    expect(f.state).toBe('climb');
    hold(w, 200, { moveY: 1 });
    expect(f.y).toBe(27 * TILE);
  });

  it('grabs a ledge that is too high to jump onto, then climbs up', () => {
    const w = arena();
    const f = w.fighters[0];
    place(w, 44 * TILE - 20, 27 * TILE); // left of the 4-tile metal block
    let grabbed = false;
    w.step([intent({ moveX: 1, jump: true })]);
    for (let t = 0; t < 60 && !grabbed; t++) {
      w.step([intent({ moveX: 1, jump: true })]);
      if (f.state === 'ledge') grabbed = true;
    }
    expect(grabbed).toBe(true);
    w.step([intent({ moveX: 1 })]);
    w.step([intent({ moveX: 1, moveY: -1 })]);
    hold(w, 30, {});
    expect(f.state).toBe('normal');
    expect(f.y).toBe(23 * TILE);
    expect(f.x).toBeGreaterThan(44 * TILE);
  });

  it('drops through a one-way platform with down + jump', () => {
    const w = arena();
    const f = w.fighters[0];
    place(w, 27 * TILE, 14 * TILE); // on the metal catwalk
    expect(f.grounded).toBe(true);
    hold(w, 3, { moveY: 1 });
    hold(w, 2, { moveY: 1, jump: true });
    hold(w, 30, {});
    expect(f.y).toBeGreaterThan(14 * TILE + 20);
  });

  it('crawls under the low slab only when crouched', () => {
    const w = arena();
    const f = w.fighters[0];
    place(w, 48 * TILE, 27 * TILE);
    hold(w, 60, { moveX: 1 });
    expect(f.x).toBeLessThan(50 * TILE); // blocked standing
    hold(w, 90, { moveX: 1, moveY: 1 });
    expect(f.x).toBeGreaterThan(51 * TILE); // crawled in
    expect(f.state).toBe('crouch');
    hold(w, 10, {});
    expect(f.state).toBe('crouch'); // no headroom to stand
  });

  it('bullets shatter glass and pass through', () => {
    const w = arena();
    const f = w.fighters[0];
    place(w, 33 * TILE, 27 * TILE); // left of the glass column at x=36
    f.facing = 1;
    f.inv[1] = { id: 'pistol', ammo: 10, dur: 1 };
    f.active = 1;
    w.step([intent({ attack: true })]);
    w.step([intent({ attack: false })]);
    let broke = false;
    for (let t = 0; t < 30; t++) {
      w.step([]);
      if (w.events.some((e) => e.t === 'tileBreak')) broke = true;
    }
    expect(broke).toBe(true);
  });
});
