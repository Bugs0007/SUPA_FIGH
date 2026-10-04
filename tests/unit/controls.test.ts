import { describe, expect, it } from 'vitest';
import { TILE } from '../../src/sim/constants';
import { getMap } from '../../src/sim/map/maps';
import type { Intent } from '../../src/sim/intent';
import { World } from '../../src/sim/world';
import { FLAT, intent } from './helpers';

// D50: Up (W / ArrowUp) is a real jump button for keyboard players; double-tap Down drops through.

function world(upJumps: boolean, map = getMap('test')): World {
  const w = new World(
    map,
    [
      { name: 'A', team: 0, isBot: false, upJumps },
      { name: 'B', team: 0, isBot: false, upJumps: false },
    ],
    { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 },
    1,
  );
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

/** Lowest y (highest point) reached while holding an input. */
function peak(w: World, ticks: number, i: Partial<Intent>): number {
  let top = Infinity;
  for (let t = 0; t < ticks; t++) {
    w.step([intent(i)]);
    top = Math.min(top, w.fighters[0].y);
  }
  return top;
}

const OPEN_FLOOR = { x: 6 * TILE + 8, y: 27 * TILE }; // test arena ground floor, open above (one-way platform out of reach)

describe('Up is the jump button (keyboard players)', () => {
  it('jumps exactly as high as the jump button', () => {
    const a = world(true);
    place(a, OPEN_FLOOR.x, OPEN_FLOOR.y);
    const upPeak = peak(a, 40, { moveY: -1 });
    const b = world(false);
    place(b, OPEN_FLOOR.x, OPEN_FLOOR.y);
    const jumpPeak = peak(b, 40, { jump: true });
    expect(upPeak).toBeLessThan(OPEN_FLOOR.y - 30);
    expect(upPeak).toBeCloseTo(jumpPeak, 5);
  });

  it('variable height: a short tap of Up is a short hop', () => {
    const w = world(true);
    place(w, OPEN_FLOOR.x, OPEN_FLOOR.y);
    let top = peak(w, 3, { moveY: -1 });
    top = Math.min(top, peak(w, 40, {}));
    expect(OPEN_FLOOR.y - top).toBeLessThan(40);
    expect(OPEN_FLOOR.y - top).toBeGreaterThan(4);
  });

  it('a second Up press in the air double jumps', () => {
    const single = world(true);
    place(single, OPEN_FLOOR.x, OPEN_FLOOR.y);
    const p1 = peak(single, 60, { moveY: -1 });
    const dbl = world(true);
    place(dbl, OPEN_FLOOR.x, OPEN_FLOOR.y);
    let p2 = peak(dbl, 18, { moveY: -1 });
    p2 = Math.min(p2, peak(dbl, 2, {}));
    p2 = Math.min(p2, peak(dbl, 40, { moveY: -1 }));
    expect(p2).toBeLessThan(p1 - 20);
  });

  it('fighters without upJumps (pads, bots) do not jump with Up', () => {
    const w = world(false);
    place(w, OPEN_FLOOR.x, OPEN_FLOOR.y);
    expect(peak(w, 30, { moveY: -1 })).toBe(OPEN_FLOOR.y);
  });

  it('Up at a ladder climbs instead of jumping, and does not jump at the top', () => {
    const w = world(true);
    const f = w.fighters[0];
    place(w, 18 * TILE + 8, 27 * TILE);
    hold(w, 2, { moveY: -1 });
    expect(f.state).toBe('climb');
    hold(w, 200, { moveY: -1 });
    expect(f.state).toBe('normal');
    expect(f.y).toBe(14 * TILE);
    expect(f.grounded).toBe(true);
    // keep holding Up at the top: still no jump until it is released and pressed again
    expect(peak(w, 20, { moveY: -1 })).toBe(14 * TILE);
    hold(w, 2, {});
    expect(peak(w, 20, { moveY: -1 })).toBeLessThan(14 * TILE - 20);
  });

  it('Up while aiming a gun sweeps the aim and never jumps, even after letting go of attack', () => {
    const w = world(true);
    const f = w.fighters[0];
    place(w, OPEN_FLOOR.x, OPEN_FLOOR.y);
    f.inv[1] = { id: 'pistol', ammo: 10, dur: 1 };
    f.active = 1;
    hold(w, 2, { attack: true });
    expect(f.state).toBe('aim');
    const top = peak(w, 30, { attack: true, moveY: -1 });
    expect(top).toBe(OPEN_FLOOR.y);
    expect(f.aimAngle).toBeLessThan(-0.3);
    // release the trigger (fires) while still holding Up: no jump
    expect(peak(w, 30, { moveY: -1 })).toBe(OPEN_FLOOR.y);
  });
});

describe('double-tap Down drops through platforms', () => {
  it('a single press or a long crouch never drops', () => {
    const w = world(true);
    const f = w.fighters[0];
    place(w, 27 * TILE, 14 * TILE); // metal catwalk (one-way)
    hold(w, 60, { moveY: 1 });
    expect(f.state).toBe('crouch');
    hold(w, 5, {});
    hold(w, 3, { moveY: 1 }); // long hold, release, press: not a double TAP
    hold(w, 20, {});
    expect(f.y).toBe(14 * TILE);
  });

  it('crouch + jump is a normal jump now (not a drop)', () => {
    const w = world(false);
    const f = w.fighters[0];
    place(w, 27 * TILE, 14 * TILE);
    hold(w, 5, { moveY: 1 });
    expect(f.state).toBe('crouch');
    expect(peak(w, 20, { moveY: 1, jump: true })).toBeLessThan(14 * TILE - 20);
  });

  it('works while running (the first tap starts a roll)', () => {
    const w = world(true);
    const f = w.fighters[0];
    place(w, 24 * TILE, 14 * TILE);
    hold(w, 12, { moveX: 1 });
    hold(w, 2, { moveX: 1, moveY: 1 });
    hold(w, 2, { moveX: 1 });
    hold(w, 2, { moveX: 1, moveY: 1 });
    hold(w, 30, {});
    expect(f.y).toBeGreaterThan(14 * TILE + 20);
  });

  it('does nothing on solid ground', () => {
    const w = world(true, FLAT);
    const f = w.fighters[0];
    place(w, 5 * TILE, 9 * TILE);
    hold(w, 2, { moveY: 1 });
    hold(w, 2, {});
    hold(w, 2, { moveY: 1 });
    hold(w, 20, {});
    expect(f.y).toBe(9 * TILE);
    expect(f.alive).toBe(true);
  });
});
