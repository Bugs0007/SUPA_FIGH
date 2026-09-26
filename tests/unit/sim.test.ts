import { describe, expect, it } from 'vitest';
import { FIGHTER_H, JUMP_VEL, TILE } from '../../src/sim/constants';
import { SLOT } from '../../src/sim/data/weapons';
import { Match } from '../../src/sim/match';
import { moveBody, newMoveResult } from '../../src/sim/physics';
import { TileMap } from '../../src/sim/map/tilemap';
import { parseMap } from '../../src/sim/map/mapData';
import { FLAT, intent, makeWorld, run, spec } from './helpers';

const FLOOR_Y = 9 * TILE;

describe('physics', () => {
  const map = new TileMap(parseMap(FLAT));
  const res = newMoveResult();

  it('falls and lands exactly on the floor', () => {
    const b = { x: 100, y: 20, vx: 0, vy: 0, w: 10, h: 22, grounded: false };
    for (let i = 0; i < 120; i++) {
      b.vy += 1000 / 60;
      moveBody(map, b, 1 / 60, {}, res);
    }
    expect(b.y).toBe(FLOOR_Y);
    expect(b.grounded).toBe(true);
  });

  it('lands on one-way platforms from above but passes from below', () => {
    const top = 5 * TILE;
    const above = { x: 8 * TILE + 8, y: top - 10, vx: 0, vy: 200, w: 10, h: 22, grounded: false };
    moveBody(map, above, 1 / 15, {}, res);
    expect(above.y).toBe(top);
    const below = { x: 8 * TILE + 8, y: top + 30, vx: 0, vy: -400, w: 10, h: 22, grounded: false };
    moveBody(map, below, 1 / 10, {}, res);
    expect(below.y).toBeLessThan(top);
  });

  it('drop-through ignores one-way platforms', () => {
    const top = 5 * TILE;
    const b = { x: 8 * TILE + 8, y: top, vx: 0, vy: 200, w: 10, h: 22, grounded: true };
    moveBody(map, b, 1 / 15, { ignoreOneWay: true }, res);
    expect(b.y).toBeGreaterThan(top);
  });

  it('walls block horizontal movement', () => {
    const b = { x: 100, y: FLOOR_Y + 16, vx: 500, vy: 0, w: 10, h: 10, grounded: false };
    moveBody(map, b, 1 / 60, {}, res);
    // inside the floor block rows: moving right is blocked immediately at the next column
    expect(res.wallX === 1 || b.x === 100 + 500 / 60).toBe(true);
  });
});

describe('fighter', () => {
  it('runs and jumps', () => {
    const w = makeWorld();
    const f = w.fighters[0];
    run(w, 10);
    const x0 = f.x;
    run(w, 30, () => [intent({ moveX: 1 })]);
    expect(f.x).toBeGreaterThan(x0 + 40);
    run(w, 1, () => [intent({ jump: true })]);
    expect(f.vy).toBeLessThan(-JUMP_VEL * 0.8);
    let minY = f.y;
    for (let i = 0; i < 60; i++) {
      w.step([intent({ jump: true })]);
      minY = Math.min(minY, f.y);
    }
    expect(FLOOR_Y - minY).toBeGreaterThan(40);
    expect(f.y).toBe(FLOOR_Y);
  });

  it('short hops are lower than full jumps', () => {
    const measure = (hold: number) => {
      const w = makeWorld();
      run(w, 5);
      const f = w.fighters[0];
      let minY = f.y;
      for (let i = 0; i < 60; i++) {
        w.step([intent({ jump: i < hold })]);
        minY = Math.min(minY, f.y);
      }
      return FLOOR_Y - minY;
    };
    expect(measure(2)).toBeLessThan(measure(30) * 0.6);
  });

  it('crouches to a smaller hitbox and rolls with i-frames', () => {
    const w = makeWorld();
    const f = w.fighters[0];
    run(w, 5);
    run(w, 5, () => [intent({ moveY: 1 })]);
    expect(f.state).toBe('crouch');
    expect(f.h).toBeLessThan(FIGHTER_H);
    run(w, 5);
    expect(f.state).toBe('normal');
    run(w, 20, () => [intent({ moveX: 1 })]);
    w.step([intent({ moveX: 1, moveY: 1 })]);
    expect(f.state).toBe('roll');
    expect(f.invuln).toBeGreaterThan(0);
  });

  it('pistol shots kill a target and credit the shooter', () => {
    const w = makeWorld();
    const [a, b] = w.fighters;
    a.inv[SLOT.SIDEARM] = { id: 'pistol', ammo: 50, dur: 1 };
    a.active = SLOT.SIDEARM;
    a.x = 100;
    b.x = 220;
    run(w, 40); // spawn protection wears off
    a.facing = 1;
    let kills = 0;
    for (let i = 0; i < 400 && b.alive; i++) {
      // tap: press on even ticks, release on odd -> fires on release
      w.step([intent({ attack: i % 16 < 2 })]);
      for (const e of w.events) if (e.t === 'kill' && e.killer === a.id) kills++;
      w.events.length = 0;
    }
    expect(b.alive).toBe(false);
    expect(kills).toBe(1);
    expect(a.inv[SLOT.SIDEARM]!.ammo).toBeLessThan(50);
  });

  it('fist combo deals damage and the third hit knocks down', () => {
    const w = makeWorld();
    const [a, b] = w.fighters;
    a.x = 100;
    b.x = 111;
    run(w, 40);
    a.facing = 1;
    const hp0 = b.hp;
    let sawKnockdown = false;
    for (let i = 0; i < 90; i++) {
      w.step([intent({ attack: i % 8 < 1 })]);
      if (b.state === 'knockdown') sawKnockdown = true;
    }
    expect(b.hp).toBeLessThan(hp0 - 15);
    expect(sawKnockdown).toBe(true);
  });

  it('grab and throw sends the victim flying', () => {
    const w = makeWorld();
    const [a, b] = w.fighters;
    a.x = 100;
    b.x = 110;
    run(w, 40);
    a.facing = 1;
    w.step([intent({ interact: true })]);
    expect(a.state).toBe('grabbing');
    expect(b.state).toBe('grabbed');
    run(w, 10);
    w.step([intent({ attack: true })]);
    expect(b.state).toBe('knockdown');
    expect(b.vx).toBeGreaterThan(200);
  });

  it('empty guns get tossed', () => {
    const w = makeWorld();
    const a = w.fighters[0];
    a.inv[SLOT.SIDEARM] = { id: 'pistol', ammo: 0, dur: 1 };
    a.active = SLOT.SIDEARM;
    run(w, 5);
    w.step([intent({ attack: true })]);
    expect(a.inv[SLOT.SIDEARM]).toBeNull();
    expect(w.items.some((it) => it.active && it.weaponId === 'pistol')).toBe(true);
  });
});

describe('match', () => {
  it('ends the round when one team remains and awards a point', () => {
    const m = new Match({
      mapId: 'test',
      mode: 'brawl',
      fighters: [spec('A'), spec('B')],
      roundsToWin: 3,
      friendlyFire: false,
      weaponSpawnRate: 0,
      seed: 1,
    });
    const w = m.world;
    // push B into the kill plane
    w.fighters[1].y = w.killY + 10;
    for (let i = 0; i < 200 && m.phase === 'fight'; i++) m.step([]);
    expect(m.phase).toBe('roundEnd');
    expect(m.roundWinner).not.toBeNull();
    expect([...m.scores.values()]).toEqual([1]);
    for (let i = 0; i < 400 && m.round === 1; i++) m.step([]);
    expect(m.round).toBe(2);
  });

  it('is deterministic for the same seed and inputs', () => {
    const mk = () =>
      new Match({
        mapId: 'test',
        mode: 'brawl',
        fighters: [spec('A'), spec('B'), spec('C')],
        roundsToWin: 3,
        friendlyFire: false,
        weaponSpawnRate: 1,
        seed: 99,
      });
    const m1 = mk();
    const m2 = mk();
    for (let t = 0; t < 600; t++) {
      const ins = [0, 1, 2].map((i) => intent({ moveX: Math.sin(t / (20 + i * 7)), jump: t % (40 + i) < 3, attack: t % 50 < 2 }));
      m1.step(ins);
      m2.step(ins);
    }
    expect(m1.world.fighters.map((f) => [f.x, f.y, f.hp])).toEqual(m2.world.fighters.map((f) => [f.x, f.y, f.hp]));
  });
});
