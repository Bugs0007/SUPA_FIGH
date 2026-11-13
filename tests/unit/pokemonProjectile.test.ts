import { describe, expect, it } from 'vitest';
import { applyWorld, BULLET_SPEC, encodeWorld } from '../../src/net/renderState';
import { DT, TILE } from '../../src/sim/constants';
import { createPokemon, createTrainer } from '../../src/sim/data/pokemon';
import { TK } from '../../src/sim/map/tiles';
import { newBullet, updateBullets, type Bullet, type BulletSpawn } from '../../src/sim/projectile';
import { World } from '../../src/sim/world';
import { FLAT, spec } from './helpers';

function arena(friendlyFire = false): World {
  const w = new World(FLAT, [spec('CASTER', 1), { ...spec('TARGET', 2), hero: 'luffy' }],
    { friendlyFire, weaponSpawnRate: 0, gravityScale: 1 }, 93);
  w.props.length = 0;
  w.fighters.forEach((f, i) => {
    f.x = f.px = i ? 400 : 60;
    f.y = f.py = 144;
    f.vx = f.vy = f.invuln = 0;
    f.facing = i ? -1 : 1;
  });
  return w;
}

function shot(w: World, extra: Partial<BulletSpawn> = {}): Bullet {
  return w.spawnBullet({
    x: 100, y: 40, ox: 100, oy: 40, vx: 300, vy: 0,
    owner: 0, weapon: 'ash:base', kind: 'ki', damage: 12, range: 700,
    falloff: 1, knock: 0, ricochet: false, pierce: 0,
    pokemon: 'charmander', form: 3, target: 1, homing: 2.4,
    ...extra,
  })!;
}

const angularDelta = (from: number, to: number): number => Math.atan2(Math.sin(to - from), Math.cos(to - from));

describe('Pokémon projectile identity and guidance', () => {
  it('resets source and guidance when a pooled elemental slot becomes an ordinary shot', () => {
    const w = arena();
    const first = shot(w);
    const serial = first.serial;
    first.active = false;
    first.hitIds.push(1);
    first.canHitOwner = true;
    const reused = shot(w, { pokemon: undefined, target: undefined, homing: undefined, weapon: 'pistol', kind: 'bullet' });
    expect(reused).toBe(first);
    expect(reused.serial).toBe(serial + 1);
    expect(reused).toMatchObject({ active: true, pokemon: '', target: -1, homing: 0, hitIds: [], canHitOwner: false });
    expect(newBullet()).toMatchObject({ pokemon: '', target: -1, homing: 0 });
  });

  it('steers by at most its turn rate per tick while preserving speed and source form', () => {
    const w = arena();
    const b = shot(w);
    const speed = Math.hypot(b.vx, b.vy);
    expect(w.map.clearShot(b.x, b.y, w.fighters[1].x, w.fighters[1].y - w.fighters[1].h / 2)).toBe(true);
    updateBullets(w);
    expect(Math.atan2(b.vy, b.vx)).toBeCloseTo(2.4 * DT, 10);
    expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(speed, 10);
    expect(Math.hypot(b.x - b.px, b.y - b.py)).toBeCloseTo(speed * DT, 10);
    expect(b).toMatchObject({ pokemon: 'charmander', form: 3, target: 1 });
    const previous = Math.atan2(b.vy, b.vx);
    w.fighters[1].y = 20;
    updateBullets(w);
    expect(angularDelta(previous, Math.atan2(b.vy, b.vx))).toBeCloseTo(-2.4 * DT, 10);
    expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(speed, 10);
  });

  it('takes the shortest turn across the negative/positive pi boundary', () => {
    const w = arena();
    w.fighters[1].x = 60;
    w.fighters[0].gone = true;
    const start = -Math.PI + 0.01;
    const b = shot(w, { x: 360, ox: 360, vx: Math.cos(start) * 300, vy: Math.sin(start) * 300 });
    updateBullets(w);
    expect(angularDelta(start, Math.atan2(b.vy, b.vx))).toBeCloseTo(-2.4 * DT, 10);
    expect(b.vx).toBeLessThan(0);
    expect(b.vy).toBeGreaterThan(0);
  });

  it('cannot steer through a wall and the wall stops the projectile', () => {
    const w = arena();
    for (let ty = 0; ty < 9; ty++) w.map.set(12, ty, TK.CONCRETE);
    const b = shot(w);
    const hp = w.fighters[1].hp;
    expect(w.map.clearShot(b.x, b.y, 400, 130)).toBe(false);
    updateBullets(w);
    expect(b.vy).toBe(0);
    for (let tick = 0; tick < 30 && b.active; tick++) updateBullets(w);
    expect(b.active).toBe(false);
    expect(b.x).toBeCloseTo(12 * TILE, 5);
    expect(w.fighters[1].hp).toBe(hp);
  });

  it.each([false, true])('never homes toward an ally (friendly fire %s)', (friendlyFire) => {
    const w = arena(friendlyFire);
    w.fighters[1].team = w.fighters[0].team;
    const b = shot(w);
    updateBullets(w);
    expect([b.vx, b.vy]).toEqual([300, 0]);
  });

  it.each(['dead', 'gone', 'mounted', 'recalling', 'missing'] as const)('keeps its course when its target is %s', (state) => {
    const w = arena();
    const target = w.fighters[1];
    if (state === 'dead') target.alive = false;
    if (state === 'gone') target.gone = true;
    if (state === 'mounted') {
      target.trainer = createTrainer('charmander');
      target.trainer.mounted = true;
    }
    if (state === 'recalling') {
      target.pokemon = createPokemon('squirtle');
      target.pokemon.move = 'recall';
    }
    const b = shot(w, { target: state === 'missing' ? 999 : target.id });
    updateBullets(w);
    expect([b.vx, b.vy]).toEqual([300, 0]);
    expect(b.active).toBe(true);
  });

  it('retains its Pokémon source through reflection and redirects guidance toward the original caster', () => {
    const w = arena();
    const defender = w.fighters[1];
    defender.x = defender.px = 220;
    defender.power = 'hero';
    defender.powerLevel = 4;
    defender.state = 'block';
    defender.guard = 100;
    const b = shot(w, { x: 200, ox: 60, y: 130, oy: 130, vx: 1200 });
    updateBullets(w);
    expect(w.events.some(e => e.t === 'reflect' && e.attacker === 0 && e.victim === 1)).toBe(true);
    expect(b).toMatchObject({ active: true, owner: 1, target: 0, pokemon: 'charmander', form: 3, homing: 2.4, hitIds: [1] });
    expect(b.vx).toBeLessThan(0);
    expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(1200, 8);
    const reflectedX = b.x;
    updateBullets(w);
    expect(b.x).toBeLessThan(reflectedX);
    expect(b.target).toBe(0);
  });
});

describe('Pokémon projectile snapshots', () => {
  it('carries source, target and turn rate through the JSON render protocol', () => {
    const real = arena();
    const mirror = arena();
    shot(real, { pokemon: 'riolu', form: 2, homing: 1.75 });
    applyWorld(mirror, JSON.parse(JSON.stringify(encodeWorld(real))));
    expect(mirror.bullets[0]).toMatchObject({ pokemon: 'riolu', target: 1, homing: 1.75, form: 2, active: true });
  });

  it('normalizes legacy render rows without leaking a previous projectile source or target', () => {
    const real = arena();
    const mirror = arena();
    shot(real);
    const frame = encodeWorld(real);
    applyWorld(mirror, frame);
    frame.bullets[0].splice(BULLET_SPEC.findIndex(([key]) => key === 'pokemon'));
    applyWorld(mirror, JSON.parse(JSON.stringify(frame)));
    expect(mirror.bullets[0]).toMatchObject({ pokemon: '', target: -1, homing: 0, form: 3, active: true });
    expect(() => updateBullets(mirror)).not.toThrow();
  });

  it('preserves the new fields in a full world rollback snapshot', () => {
    const real = arena();
    const mirror = arena();
    shot(real, { pokemon: 'froakie', homing: 1.3 });
    const saved = real.snapshot();
    mirror.restore(JSON.parse(JSON.stringify(saved)));
    expect(mirror.bullets[0]).toEqual(real.bullets[0]);
  });

  it('normalizes legacy full snapshots that predate Pokémon projectile guidance', () => {
    const real = arena();
    const mirror = arena();
    shot(real);
    const saved = real.snapshot();
    const legacy = saved.bullets[0] as Partial<Bullet>;
    delete legacy.pokemon;
    delete legacy.target;
    delete legacy.homing;
    mirror.restore(saved);
    expect(mirror.bullets[0]).toMatchObject({ pokemon: '', target: -1, homing: 0 });
    expect(legacy.pokemon).toBeUndefined();
    expect(() => updateBullets(mirror)).not.toThrow();
  });
});
