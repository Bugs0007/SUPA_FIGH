import { describe, expect, it } from 'vitest';
import { MAX_HP, TILE } from '../../src/sim/constants';
import { SLOT, weaponDef } from '../../src/sim/data/weapons';
import { explode } from '../../src/sim/explosion';
import { spawnFire } from '../../src/sim/fire';
import type { Fighter } from '../../src/sim/fighter';
import type { MapDef } from '../../src/sim/map/mapData';
import { TK } from '../../src/sim/map/tiles';
import { World } from '../../src/sim/world';
import { intent, makeWorld, run, spec } from './helpers';

const FLOOR_Y = 9 * TILE;

function give(f: Fighter, id: string, ammo?: number): void {
  const def = weaponDef(id);
  f.inv[def.slot] = { id, ammo: ammo ?? def.gun?.ammo ?? def.throw?.count ?? def.gadget?.amount ?? 0, dur: def.melee?.durability ?? 1 };
  f.active = def.slot;
}

function place(f: Fighter, x: number, y = FLOOR_Y): void {
  f.x = f.px = x;
  f.y = f.py = y;
  f.vx = f.vy = 0;
  f.invuln = 0;
  f.facing = 1;
}

/** Two fighters on the flat map, settled, spawn protection off. */
function duel(map?: MapDef) {
  const w = map ? new World(map, [spec('A'), spec('B')], { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 7) : makeWorld();
  run(w, 2);
  const [a, b] = w.fighters;
  place(a, 100);
  place(b, 300);
  run(w, 2);
  return { w, a, b };
}

describe('explosions', () => {
  it('damage falls off with distance and knocks down', () => {
    const { w, a, b } = duel();
    place(b, 130);
    explode(w, 110, FLOOR_Y - 8, weaponDef('grenade').throw!.explosion!, -1, 'grenade');
    expect(a.hp).toBeLessThan(MAX_HP - 40);
    expect(b.hp).toBeLessThan(MAX_HP);
    expect(b.hp).toBeGreaterThan(a.hp);
    expect(a.state === 'knockdown' || !a.alive).toBe(true);
  });

  it('walls shield fighters from blasts', () => {
    const WALLED: MapDef = {
      id: 'walled',
      name: 'walled',
      theme: 'arena',
      rows: [
        '..............................',
        '..............................',
        '..............................',
        '..............................',
        '..............................',
        '..............................',
        '.........#....................',
        '.........#....................',
        '..S......#..............S.....',
        '##############################',
      ],
    };
    const { w, a, b } = duel(WALLED);
    place(a, 9 * TILE - 14); // left of the wall
    place(b, 10 * TILE + 34); // right of the wall
    const ex = weaponDef('grenade').throw!.explosion!;
    explode(w, 10 * TILE + 8, FLOOR_Y - 8, ex, -1, 'grenade');
    const hurtA = MAX_HP - a.hp;
    const hurtB = MAX_HP - b.hp;
    expect(hurtA).toBeGreaterThan(0);
    expect(hurtA).toBeLessThan(hurtB);
  });

  it('breaks glass and wood but not concrete', () => {
    const { w } = duel();
    w.map.set(10, 7, TK.GLASS);
    w.map.set(11, 7, TK.WOOD);
    w.map.set(12, 7, TK.CONCRETE);
    explode(w, 11 * TILE + 8, 7 * TILE + 8, { radius: 50, damage: 10, knock: 10, breakRadius: 30, shake: 0 }, -1, 'test');
    expect(w.map.get(10, 7)).toBe(TK.EMPTY);
    expect(w.map.get(11, 7)).toBe(TK.EMPTY);
    expect(w.map.get(12, 7)).toBe(TK.CONCRETE);
  });
});

describe('throwables', () => {
  it('thrown grenade arcs away and explodes on its fuse', () => {
    const { w, a, b } = duel();
    give(a, 'grenade');
    place(b, 250);
    run(w, 2, () => [intent({ attack: true })]);
    run(w, 20, () => [intent({ attack: true })]);
    run(w, 1, () => [intent({ attack: false })]);
    const g = w.items.find((it) => it.live && it.weaponId === 'grenade');
    expect(g).toBeDefined();
    expect(a.inv[SLOT.THROWABLE]?.ammo).toBe(2);
    expect(g!.vx).toBeGreaterThan(0);
    let exploded = false;
    for (let i = 0; i < 200 && !exploded; i++) {
      w.step([]);
      exploded = w.events.some((e) => e.t === 'explosion');
      w.events.length = 0;
    }
    expect(exploded).toBe(true);
    expect(g!.active).toBe(false);
    expect(a.hp).toBe(MAX_HP);
    expect(b.hp).toBeLessThan(MAX_HP);
  });

  it('a grenade cooked too long blows up in your hand', () => {
    const { w, a } = duel();
    give(a, 'grenade', 1);
    run(w, Math.ceil(weaponDef('grenade').throw!.fuse * 60) + 4, () => [intent({ attack: true })]);
    expect(a.hp).toBeLessThan(MAX_HP - 40);
    expect(a.inv[SLOT.THROWABLE]).toBeNull();
  });

  it('molotov bursts into fire that burns fighters over time', () => {
    const { w, a, b } = duel();
    give(a, 'molotov');
    place(b, 150);
    run(w, 3, () => [intent({ attack: true })]);
    run(w, 1, () => [intent({ attack: false })]);
    run(w, 90);
    expect(w.fires.some((p) => p.active)).toBe(true);
    expect(b.burn > 0 || b.hp < MAX_HP).toBe(true);
    const hp = b.hp;
    run(w, 60);
    expect(b.hp).toBeLessThan(hp);
  });

  it('C4 sticks and detonates on the second press', () => {
    const { w, a, b } = duel();
    give(a, 'c4', 1);
    place(b, 160);
    run(w, 3, () => [intent({ attack: true })]);
    run(w, 1, () => [intent({ attack: false })]);
    run(w, 60);
    const c4 = w.items.find((it) => it.live && it.weaponId === 'c4')!;
    expect(c4.active).toBe(true);
    expect(a.inv[SLOT.THROWABLE]?.ammo).toBe(0); // kept as detonator
    expect(b.hp).toBe(MAX_HP);
    run(w, 1, () => [intent({ attack: true })]);
    run(w, 5);
    expect(c4.active).toBe(false);
    expect(a.inv[SLOT.THROWABLE]).toBeNull();
  });

  it('mines arm and trigger on proximity', () => {
    const { w, a, b } = duel();
    give(a, 'mine', 1);
    run(w, 2, () => [intent({ attack: true })]);
    run(w, 1, () => [intent({ attack: false })]);
    run(w, 90);
    const mine = w.items.find((it) => it.live && it.weaponId === 'mine')!;
    expect(mine.armT).toBeGreaterThan(0.9);
    place(b, mine.x + 30);
    b.facing = -1;
    for (let i = 0; i < 60 && mine.active; i++) w.step([intent(), intent({ moveX: -1 })]);
    expect(mine.active).toBe(false);
    expect(b.hp).toBeLessThan(MAX_HP);
  });
});

describe('guns with special projectiles', () => {
  it('bazooka rockets explode on impact', () => {
    const { w, a, b } = duel();
    give(a, 'bazooka');
    run(w, 1, () => [intent({ attack: true })]);
    run(w, 1, () => [intent({ attack: false })]);
    let boom = false;
    for (let i = 0; i < 90 && !boom; i++) {
      w.step([]);
      boom = w.events.some((e) => e.t === 'explosion');
      w.events.length = 0;
    }
    expect(boom).toBe(true);
    expect(b.hp).toBeLessThan(MAX_HP - 30);
  });

  it('flamethrower sets targets on fire', () => {
    const { w, a, b } = duel();
    give(a, 'flamer');
    place(b, 160);
    run(w, 40, () => [intent({ attack: true })]);
    expect(b.burn).toBeGreaterThan(0);
  });

  it('minigun spins up before firing', () => {
    const { w, a } = duel();
    give(a, 'minigun');
    run(w, 10, () => [intent({ attack: true })]);
    expect(a.inv[SLOT.HEAVY]!.ammo).toBe(weaponDef('minigun').gun!.ammo);
    run(w, 40, () => [intent({ attack: true })]);
    expect(a.inv[SLOT.HEAVY]!.ammo).toBeLessThan(weaponDef('minigun').gun!.ammo - 5);
  });
});

describe('fire', () => {
  it('rolling puts you out faster', () => {
    const time = (roll: boolean) => {
      const { w, a } = duel();
      a.burn = 4;
      let ticks = 0;
      while (a.burn > 0 && ticks < 600) {
        w.step([roll && ticks % 30 < 2 ? intent({ moveX: 1, moveY: ticks % 30 === 1 ? 1 : 0 }) : intent({ moveX: roll ? 1 : 0 })]);
        ticks++;
      }
      return ticks;
    };
    expect(time(true)).toBeLessThan(time(false));
  });

  it('spreads along wooden platforms and burns them away', () => {
    const { w } = duel();
    // FLAT has a wooden platform at row 5, columns 7..12
    expect(w.map.get(8, 5)).toBe(TK.PLAT_WOOD);
    spawnFire(w, 8 * TILE + 8, 5 * TILE - 2, 0, 0, -1);
    run(w, 60 * 12);
    let left = 0;
    for (let x = 7; x <= 12; x++) if (w.map.get(x, 5) === TK.PLAT_WOOD) left++;
    expect(left).toBeLessThan(3);
  });
});

const PROPMAP: MapDef = {
  id: 'props',
  name: 'props',
  theme: 'arena',
  rows: [
    '..............................',
    '..............................',
    '..............................',
    '..............................',
    '..............................',
    '..............................',
    '..............................',
    '..............................',
    '..S.....c...b.b.........S.....',
    '##############################',
  ],
};

describe('props', () => {
  it('fighters can stand on crates', () => {
    const { w, a } = duel(PROPMAP);
    const crate = w.props.find((p) => p.type === 'crate')!;
    run(w, 30);
    place(a, crate.x, crate.y - crate.h - 20);
    run(w, 40);
    expect(a.y).toBeCloseTo(crate.y - crate.h, 3);
    expect(a.grounded).toBe(true);
  });

  it('shooting a barrel blows it up and chains to its neighbor', () => {
    const { w, a } = duel(PROPMAP);
    run(w, 30);
    const barrels = w.props.filter((p) => p.type === 'barrel');
    expect(barrels.length).toBe(2);
    place(a, 9 * TILE + 4);
    give(a, 'pistol');
    for (let k = 0; k < 4; k++) {
      run(w, 1, () => [intent({ attack: true })]);
      run(w, 15, () => [intent({ attack: false })]);
    }
    run(w, 60);
    expect(barrels.every((p) => !p.active)).toBe(true);
    expect(a.hp).toBeLessThan(MAX_HP);
  });

  it('crates break from melee', () => {
    const { w, a } = duel(PROPMAP);
    run(w, 30);
    const crate = w.props.find((p) => p.type === 'crate')!;
    place(a, crate.x - 14);
    give(a, 'sledge');
    for (let k = 0; k < 3 && crate.active; k++) {
      run(w, 1, () => [intent({ attack: true })]);
      run(w, 60);
      place(a, crate.x - 14);
    }
    expect(crate.active).toBe(false);
  });
});

describe('gadgets and powerups', () => {
  it('medkit heals and is consumed', () => {
    const { w, a } = duel();
    a.hp = 30;
    give(a, 'medkit');
    run(w, 1, () => [intent({ attack: true })]);
    expect(a.hp).toBe(80);
    expect(a.inv[SLOT.GADGET]).toBeNull();
  });

  it('jetpack lifts you after the jump peaks', () => {
    const { w, a } = duel();
    give(a, 'jetpack');
    a.active = SLOT.MELEE;
    let minY = a.y;
    for (let i = 0; i < 90; i++) {
      w.step([intent({ jump: true })]);
      minY = Math.min(minY, a.y);
    }
    expect(FLOOR_Y - minY).toBeGreaterThan(110);
    expect(a.inv[SLOT.GADGET]!.ammo).toBeLessThan(weaponDef('jetpack').gadget!.amount);
  });

  it('powerups apply on touch without taking a slot', () => {
    const { w, a } = duel();
    w.spawnWeapon('speed', a.x, a.y - 2);
    run(w, 3);
    expect(a.speedBoost).toBeGreaterThan(0);
    expect(a.inv[SLOT.GADGET]).toBeNull();
    const x0 = a.x;
    run(w, 30, () => [intent({ moveX: 1 })]);
    expect(a.x - x0).toBeGreaterThan(60);
  });

  it('bullet time gives its owner two updates per tick', () => {
    const { w, a, b } = duel();
    w.spawnWeapon('bullettime', a.x, a.y - 2);
    run(w, 3);
    expect(w.bulletTime).toBeGreaterThan(0);
    const ax = a.x;
    const bx = b.x;
    run(w, 30, () => [intent({ moveX: 1 }), intent({ moveX: 1 })]);
    expect(a.x - ax).toBeGreaterThan((b.x - bx) * 1.6);
  });
});

describe('M2 determinism', () => {
  it('explosive chaos replays identically from the same seed', () => {
    const sim = () => {
      const w = new World(PROPMAP, [spec('A'), spec('B'), spec('C')], { friendlyFire: false, weaponSpawnRate: 1, gravityScale: 1 }, 99);
      give(w.fighters[0], 'grenade');
      give(w.fighters[1], 'molotov');
      give(w.fighters[2], 'bazooka');
      for (let t = 0; t < 600; t++) {
        const atk = t % 50 < 25;
        w.step([intent({ attack: atk, moveX: t % 120 < 60 ? 1 : -1 }), intent({ attack: atk }), intent({ attack: !atk, moveX: -1 })]);
      }
      return JSON.stringify([w.fighters.map((f) => [f.x, f.y, f.hp]), w.props.map((p) => [p.x, p.y, p.hp, p.active]), w.fires.filter((p) => p.active).length]);
    };
    expect(sim()).toBe(sim());
  });
});
