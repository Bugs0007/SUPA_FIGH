import { describe, expect, it } from 'vitest';
import { DT, MAX_HP, TILE } from '../../src/sim/constants';
import { SLOT } from '../../src/sim/data/weapons';
import type { GimmickDef, MapDef } from '../../src/sim/map/mapData';
import { World } from '../../src/sim/world';
import { intent, run, spec } from './helpers';

const ROWS = [
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..S.....................S.....',
  '##############################',
];

function worldWith(gimmicks: GimmickDef[], rows = ROWS, n = 2): World {
  const def: MapDef = { id: 'g' + Math.random(), name: 'g', theme: 'arena', rows, gimmicks };
  const w = new World(def, Array.from({ length: n }, (_, i) => spec('F' + i)), { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 1);
  run(w, 2);
  for (const f of w.fighters) f.invuln = 0;
  return w;
}

function place(w: World, i: number, x: number, y: number) {
  const f = w.fighters[i];
  f.x = f.px = x;
  f.y = f.py = y;
  f.vx = f.vy = 0;
  f.grounded = false;
  return f;
}

describe('movers', () => {
  it('an elevator carries a fighter up', () => {
    const w = worldWith([{ type: 'mover', kind: 'elevator', x: 10, y: 8, w: 2, h: 8, path: [[0, -5]], speed: 40, pause: 0.5 }]);
    const f = place(w, 0, 11 * TILE, 8 * TILE - 2);
    run(w, 10);
    expect(f.grounded).toBe(true);
    const y0 = f.y;
    run(w, 60);
    expect(f.y).toBeLessThan(y0 - 30);
    expect(Math.abs(f.y - w.gimmicks.movers[0].y)).toBeLessThan(0.5);
  });

  it('a swinging girder moves its riders sideways', () => {
    const w = worldWith([{ type: 'mover', kind: 'girder', x: 12, y: 1, w: 3, swing: { length: 80, amp: 0.5, period: 3 } }]);
    const m = w.gimmicks.movers[0];
    const f = place(w, 0, m.x + m.w / 2, m.y - 1);
    run(w, 5);
    const x0 = f.x;
    run(w, 40);
    expect(Math.abs(f.x - x0)).toBeGreaterThan(10);
    expect(Math.abs(f.y - m.y)).toBeLessThan(1);
  });

  it('a minecart running into a fighter knocks them down', () => {
    const w = worldWith([{ type: 'mover', kind: 'cart', x: 2, y: 8.25, w: 2, h: 12, path: [[20, 0]], speed: 140, hits: { damage: 25, knock: 300 } }]);
    const f = place(w, 1, 12 * TILE, 9 * TILE);
    place(w, 0, 27 * TILE, 9 * TILE);
    run(w, 100);
    expect(f.hp).toBeLessThan(MAX_HP);
  });
});

describe('hazards', () => {
  it('lasers cycle and hurt only while on', () => {
    const w = worldWith([{ type: 'hazard', kind: 'laser', x: 9, y: 6, w: 1, h: 3, on: 1, off: 1, damage: 20 }]);
    const f = place(w, 0, 9.5 * TILE, 9 * TILE);
    run(w, Math.round(0.8 / DT));
    expect(f.hp).toBe(MAX_HP);
    run(w, Math.round(0.4 / DT));
    expect(f.hp).toBeLessThan(MAX_HP);
  });

  it('crushers kill', () => {
    const w = worldWith([{ type: 'hazard', kind: 'crusher', x: 9, y: 6, w: 2, h: 3, on: 0.5, off: 0.5, damage: 999 }]);
    const f = place(w, 0, 10 * TILE, 9 * TILE);
    run(w, 60);
    expect(f.alive).toBe(false);
  });

  it('tunnel beams sweep and can be ducked under', () => {
    const tunnel: GimmickDef = { type: 'hazard', kind: 'tunnel', x: 0, y: 7.25, w: 1, h: 0.5, on: 1, off: 0.5, damage: 30, sweep: 28 };
    const standing = worldWith([tunnel]);
    const a = place(standing, 0, 15 * TILE, 9 * TILE);
    run(standing, 120);
    expect(a.hp).toBeLessThan(MAX_HP);
    const ducking = worldWith([tunnel]);
    const b = place(ducking, 0, 15 * TILE, 9 * TILE);
    run(ducking, 120, () => [intent({ moveY: 1 })]);
    expect(b.hp).toBe(MAX_HP);
  });
});

describe('gravity zones', () => {
  it('jumps go higher in low gravity, and toggles switch it', () => {
    const height = (g: GimmickDef[]) => {
      const w = worldWith(g);
      const f = place(w, 0, 6 * TILE, 9 * TILE);
      run(w, 3);
      let minY = f.y;
      for (let i = 0; i < 120; i++) {
        w.step([intent({ jump: i < 30 })]);
        minY = Math.min(minY, f.y);
      }
      return 9 * TILE - minY;
    };
    const normal = height([]);
    const low = height([{ type: 'gravity', x: 0, y: 0, w: 30, h: 10, mult: 0.45 }]);
    expect(low).toBeGreaterThan(normal * 1.6);
    const w = worldWith([{ type: 'gravity', x: 0, y: 0, w: 30, h: 10, mult: 0.5, toggle: { on: 1, off: 1 } }]);
    const at = () => w.gravityAt(50, 50);
    const seen = new Set<number>();
    for (let i = 0; i < 150; i++) {
      w.step([]);
      seen.add(at());
    }
    expect(seen.has(0.5) && seen.has(1)).toBe(true);
  });
});

describe('drops, conveyors, chandeliers', () => {
  it('supply crates fall from the sky with their loot', () => {
    const w = worldWith([{ type: 'drops', every: [1, 1], xs: [14], pool: ['minigun'] }]);
    run(w, 90);
    const crate = w.props.find((p) => p.loot);
    expect(crate).toBeDefined();
    run(w, 120);
    expect(crate!.grounded).toBe(true);
    crate!.hp = 1;
    const f = place(w, 0, crate!.x - 14, 9 * TILE);
    f.facing = 1;
    run(w, 3); // settle on the floor (otherwise it's a flying kick)
    run(w, 1, () => [intent({ kick: true })]);
    run(w, 30);
    // dropped on the floor, or already auto-picked up by the kicker
    expect(w.items.some((it) => it.active && it.weaponId === 'minigun') || f.inv[SLOT.HEAVY]?.id === 'minigun').toBe(true);
  });

  it('conveyors push whatever stands on them', () => {
    const rows = [...ROWS];
    rows[9] = '######>>>>>>>>>>##############';
    const w = worldWith([], rows);
    const f = place(w, 0, 8 * TILE, 9 * TILE);
    run(w, 60);
    expect(f.x).toBeGreaterThan(8 * TILE + 30);
  });

  it('a shot-down chandelier crushes whoever stands under it', () => {
    const rows = [...ROWS];
    rows[3] = '..............l...............';
    const w = worldWith([], rows);
    const ch = w.props.find((p) => p.type === 'chandelier')!;
    run(w, 30);
    expect(ch.y).toBeLessThan(5 * TILE); // still hanging
    const [shooter, victim] = w.fighters;
    place(w, 1, ch.x, 9 * TILE);
    place(w, 0, ch.x - 60, 9 * TILE);
    shooter.facing = 1;
    shooter.inv[SLOT.SIDEARM] = { id: 'pistol', ammo: 9, dur: 1 };
    shooter.active = SLOT.SIDEARM;
    // aim up at the chandelier and fire until it drops
    for (let k = 0; k < 6 && !ch.released; k++) {
      run(w, 1, () => [intent({ attack: true })]);
      run(w, 14, () => [intent({ attack: true, moveY: -1 })]);
      run(w, 20, () => [intent()]);
    }
    expect(ch.released).toBe(true);
    run(w, 90);
    expect(victim.hp).toBeLessThan(MAX_HP - 40);
    expect(ch.active).toBe(false);
  });
});

describe('ship and alien gimmicks (M9)', () => {
  it('waves slide loose props and nudge grounded fighters a little', () => {
    const w = worldWith([{ type: 'waves', every: [0.5, 0.5], push: 70 }]);
    const p = w.spawnProp('barrel', 15 * TILE, 9 * TILE);
    run(w, 20);
    const x0 = p.x;
    const f = w.fighters[0];
    run(w, 30);
    const wave = w.gimmicks.waves[0];
    expect(wave.last).not.toBe(0);
    expect(Math.sign(p.x - x0)).toBe(wave.last);
    // fighters only get a gentle nudge (never thrown around)
    expect(Math.abs(f.vx)).toBeLessThan(60);
  });

  it('interact at a cannon fires an explosive ball credited to the gunner', () => {
    const w = worldWith([{ type: 'cannon', x: 4, y: 8, dir: 1, cooldown: 3 }], ROWS, 2);
    const gunner = place(w, 0, 4 * TILE + 8 - 10, 9 * TILE);
    const victim = place(w, 1, 14 * TILE, 9 * TILE);
    run(w, 5);
    victim.invuln = 0;
    run(w, 1, () => [intent({ interact: true })]);
    const ball = w.bullets.find((b) => b.active && b.kind === 'cannonball');
    expect(ball).toBeDefined();
    expect(ball!.owner).toBe(gunner.id);
    expect(w.gimmicks.cannons[0].cd).toBeGreaterThan(2.9);
    // on cooldown: a second press does nothing
    run(w, 2);
    run(w, 1, () => [intent({ interact: true })]);
    expect(w.bullets.filter((b) => b.active && b.kind === 'cannonball').length).toBe(1);
    run(w, 90);
    expect(victim.hp).toBeLessThan(MAX_HP);
    expect(victim.lastAttacker).toBe(gunner.id);
  });

  it('an energy fissure launches whoever stands on it when it erupts', () => {
    const w = worldWith([{ type: 'hazard', kind: 'fissure', x: 10, y: 6, w: 2, h: 3, on: 1, off: 1, warn: 0.5, damage: 20, knockX: 60, knockY: -420 }]);
    const f = place(w, 0, 11 * TILE, 9 * TILE);
    run(w, Math.ceil(1.2 / DT));
    expect(f.hp).toBeLessThan(MAX_HP);
    expect(f.vy < 0 || f.y < 9 * TILE - 4).toBe(true);
  });

  it('cannons are skipped when no cannon is near (interact still picks up items)', () => {
    const w = worldWith([{ type: 'cannon', x: 2, y: 8, dir: 1, cooldown: 3 }]);
    const f = place(w, 0, 20 * TILE, 9 * TILE);
    run(w, 5);
    const it = w.spawnWeapon('pistol', f.x, f.y);
    run(w, 2);
    f.inv[SLOT.SIDEARM] = null;
    run(w, 1, () => [intent({ interact: true })]);
    expect(it.active).toBe(false);
  });
});
