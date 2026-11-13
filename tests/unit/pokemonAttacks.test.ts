import { describe, expect, it } from 'vitest';
import { createPokemon, POKEMON_DAMAGE, POKEMON_PARTNERS, pokemonStage, type PokemonSpecies } from '../../src/sim/data/pokemon';
import { pokemonAttack, pokemonAttackDuration, pokemonEmission, type PokemonAttackMode } from '../../src/sim/data/pokemonAttacks';
import { DT } from '../../src/sim/constants';
import { TK } from '../../src/sim/map/tiles';
import { stepPokemonAttack } from '../../src/sim/pokemonAttacks';
import { updateBullets } from '../../src/sim/projectile';
import { World } from '../../src/sim/world';
import { FLAT, spec } from './helpers';

function cast(species: PokemonSpecies, stage = 0, mode: PokemonAttackMode = 'shot', xs = [200]) {
  const w = new World(FLAT, [{ ...spec('ASH', 1), hero: 'ash', pokemon: species },
    ...xs.map((_, i) => spec(`ENEMY ${i}`, 2))],
  { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 42);
  const owner = w.fighters[0];
  const f = w.fighters[owner.trainer!.slot];
  const p = f.pokemon!;
  const info = pokemonStage(species, stage);
  Object.assign(f, { alive: true, gone: false, x: 90, y: 144, px: 90, py: 144,
    vx: 0, vy: 0, w: info.width, h: info.height, hp: info.hp, maxHp: info.hp, invuln: 0, facing: 1 });
  Object.assign(owner, { x: 60, y: 144, invuln: 0 });
  owner.trainer!.active = f.id;
  const enemies = w.fighters.slice(1, xs.length + 1);
  enemies.forEach((v, i) => Object.assign(v, { x: xs[i], y: 144, px: xs[i], py: 144,
    vx: 0, vy: 0, invuln: 0, hp: 1000, maxHp: 1000, facing: -1 }));
  Object.assign(p, { stage, move: mode, age: 0, target: enemies[0].id,
    goalX: enemies[0].x, goalY: enemies[0].y - enemies[0].h / 2,
    fired: false, shots: 0, recalling: false, perched: false });
  const profile = pokemonAttack(species, stage, mode);
  const advance = (age: number) => { p.age = age; stepPokemonAttack(w, f, owner, p); };
  const complete = () => {
    for (let i = 0; i < profile.pulses; i++) advance(profile.windup + i * profile.interval);
  };
  return { w, owner, f, p, enemies, profile, advance, complete };
}

function wall(w: World, tx: number): void {
  for (let ty = 0; ty < 9; ty++) w.map.set(tx, ty, TK.CONCRETE);
}

describe('Pokémon attack profiles and clocks', () => {
  it('defines every supported form with an active clock that contains every pulse', () => {
    let forms = 0;
    const kinds = new Set<string>();
    for (const species of POKEMON_PARTNERS) {
      for (let stage = 0; stage <= pokemonStage(species, 0).maxStage; stage++) {
        forms++;
        for (const mode of ['shot', 'ultimate'] as const) {
          const p = pokemonAttack(species, stage, mode);
          expect(p.active + 1e-7).toBeGreaterThanOrEqual((p.pulses - 1) * p.interval);
          expect(pokemonAttackDuration(p)).toBeGreaterThan(p.windup + (p.pulses - 1) * p.interval);
          expect(p.pulses).toBeGreaterThan(0);
          expect(p.range).toBeGreaterThan(0);
          kinds.add(p.kind);
        }
        expect(pokemonEmission(species, stage).every(Number.isFinite)).toBe(true);
      }
    }
    expect(forms).toBe(30);
    expect(kinds.size).toBeGreaterThanOrEqual(12);
  });

  it('keeps close range ultimate windups short', () => {
    expect(pokemonAttack('riolu', 0, 'ultimate').windup).toBeLessThanOrEqual(0.16);
    expect(pokemonAttack('squirtle', 1, 'ultimate').windup).toBeLessThanOrEqual(0.16);
    expect(pokemonAttack('treecko', 0, 'ultimate').windup).toBeLessThanOrEqual(0.16);
  });
});

describe('Pokémon direct attacks', () => {
  it('spends Flamethrower damage across real contacts, once per pulse', () => {
    const { w, owner, f, p, enemies: [enemy], profile, advance, complete } = cast('charmander', 1);
    advance(profile.windup - 0.001);
    expect(enemy.hp).toBe(1000);
    advance(profile.windup);
    const first = enemy.hp;
    expect(first).toBeLessThan(1000);
    expect(first).toBeGreaterThan(1000 - POKEMON_DAMAGE.shot[1]);
    stepPokemonAttack(w, f, owner, p);
    expect(enemy.hp).toBe(first);
    complete();
    expect(enemy.hp).toBeCloseTo(1000 - POKEMON_DAMAGE.shot[1], 8);
    expect(p.shots).toBe(profile.pulses);
    expect(owner.hp).toBe(owner.maxHp);
    expect(f.hp).toBe(f.maxHp);
  });

  it.each(['guard', 'recall', 'follow', 'ko'] as const)('cancels further stream pulses when move becomes %s', move => {
    const { enemies: [enemy], p, profile, advance } = cast('squirtle');
    advance(profile.windup);
    const hp = enemy.hp;
    p.move = move;
    advance(5);
    expect(enemy.hp).toBe(hp);
  });

  it('clips Hydro Cannon and its drawn endpoint at walls', () => {
    const { w, enemies: [enemy], p, complete } = cast('squirtle', 3, 'ultimate');
    wall(w, 10);
    complete();
    expect(enemy.hp).toBe(1000);
    expect(p.goalX).toBeLessThan(160);
  });

  it('uses the normal front guard rules for Solar Beam', () => {
    const { enemies: [enemy], complete } = cast('bulbasaur', 3, 'ultimate');
    enemy.state = 'block';
    enemy.parryT = 0;
    complete();
    expect(enemy.hp).toBeGreaterThan(1000 - POKEMON_DAMAGE.ultimate[3]);
    expect(enemy.hp).toBeLessThan(1000);
  });

  it('makes Vacuum Wave a short ranged contact instead of an infinite projectile', () => {
    const near = cast('riolu', 0, 'shot', [165]);
    near.complete();
    expect(near.enemies[0].hp).toBe(990);
    expect(near.w.bullets).toHaveLength(0);
    const far = cast('riolu', 0, 'shot', [280]);
    far.complete();
    expect(far.enemies[0].hp).toBe(1000);
  });

  it('returns Mega Drain health only for damage actually dealt', () => {
    const { f, enemies: [enemy], complete } = cast('treecko', 0, 'ultimate', [160]);
    f.hp -= 20;
    const before = f.hp;
    complete();
    expect(enemy.hp).toBeCloseTo(971, 8);
    expect(f.hp - before).toBeCloseTo(29 * 0.3, 7);
  });
});

describe('Pokémon volleys and projectiles', () => {
  it('emits Bubble gradually and never replays a pulse on repeated ticks', () => {
    const { w, p, profile, advance, complete } = cast('froakie');
    advance(profile.windup);
    expect(w.bullets.filter(b => b.active)).toHaveLength(1);
    advance(profile.windup);
    expect(w.bullets.filter(b => b.active)).toHaveLength(1);
    complete();
    const bullets = w.bullets.filter(b => b.active);
    expect(bullets).toHaveLength(3);
    expect(bullets.reduce((sum, b) => sum + b.damage, 0)).toBeCloseTo(10, 8);
    expect(p.shots).toBe(3);
    expect(bullets.every(b => b.gravity < 0 && b.pokemon === 'froakie')).toBe(true);
  });

  it('fans Razor Leaf with a shared damage budget', () => {
    const { w, complete } = cast('bulbasaur', 3);
    complete();
    expect(w.bullets).toHaveLength(9);
    expect(w.bullets.reduce((sum, b) => sum + b.damage, 0)).toBeCloseTo(32, 8);
    expect(new Set(w.bullets.map(b => Math.atan2(b.vy, b.vx))).size).toBe(9);
  });

  it('gives Water Shuriken its own staged piercing volley', () => {
    const { w, complete } = cast('froakie', 3);
    complete();
    expect(w.bullets).toHaveLength(5);
    expect(w.bullets.every(b => b.pierce === 1 && b.pokemon === 'froakie' && b.size === 6)).toBe(true);
    expect(w.bullets.reduce((sum, b) => sum + b.damage, 0)).toBeCloseTo(32, 8);
  });

  it('makes Aura Sphere guided while Energy Ball remains a straight projectile', () => {
    const aura = cast('riolu', 2);
    aura.complete();
    expect(aura.w.bullets[0]).toMatchObject({ homing: 2, target: aura.enemies[0].id, pokemon: 'riolu', form: 2 });
    const seed = cast('treecko', 2);
    seed.complete();
    expect(seed.w.bullets[0]).toMatchObject({ homing: 0, pokemon: 'treecko' });
    expect(seed.w.bullets[0].explosion?.blastOnly).toBe(true);
  });

  it('damages only when a projectile contacts the opponent', () => {
    const { w, enemies: [enemy], complete } = cast('gible', 2);
    complete();
    expect(enemy.hp).toBe(1000);
    for (let tick = 0; tick < 40; tick++) updateBullets(w);
    expect(enemy.hp).toBeLessThan(1000);
    expect(enemy.hp).toBeGreaterThanOrEqual(1000 - POKEMON_DAMAGE.shot[2] - 0.001);
  });

  it('lets an explosive contact damage a giant Pokémon at its outer body', () => {
    const { w, enemies: [enemy], complete } = cast('gible', 2);
    enemy.pokemon = createPokemon('gible', 3);
    enemy.w = 76;
    enemy.h = 80;
    complete();
    expect(enemy.hp).toBe(1000);
    for (let tick = 0; tick < 40; tick++) updateBullets(w);
    expect(enemy.hp).toBeLessThan(1000);
    expect(enemy.hp).toBeGreaterThanOrEqual(1000 - POKEMON_DAMAGE.shot[2] - 0.001);
  });

  it('does not replay old fired snapshots with no pulse counter', () => {
    const { w, p, advance } = cast('treecko');
    p.fired = true;
    p.shots = NaN;
    advance(2);
    expect(w.bullets).toHaveLength(0);
  });

  it('does not replay an old fired cast after a full world restore', () => {
    const { w, f, owner, p } = cast('treecko');
    p.fired = true;
    p.age = 0.4;
    const snapshot = w.snapshot();
    delete (snapshot.fighters[f.id].pokemon as Partial<typeof p>).shots;
    w.restore(snapshot);
    const restored = w.fighters[f.id].pokemon!;
    stepPokemonAttack(w, w.fighters[f.id], w.fighters[owner.id], restored);
    expect(w.bullets).toHaveLength(0);
  });
});

describe('Pokémon area attacks', () => {
  it('chains electricity to visible opponents and skips allied bodies', () => {
    const { w, f, owner, enemies, complete } = cast('pikachu', 2, 'shot', [170, 215, 230]);
    enemies[1].team = owner.team;
    complete();
    expect(enemies[0].hp).toBe(968);
    expect(enemies[1].hp).toBe(1000);
    expect(enemies[2].hp).toBeLessThan(1000);
    expect(f.hp).toBe(f.maxHp);
    expect(w.events.filter(e => e.t === 'arc')).toHaveLength(2);
  });

  it('cannot chain electricity through a solid wall', () => {
    const { w, enemies, complete } = cast('pikachu', 2, 'shot', [140, 215]);
    wall(w, 11);
    complete();
    expect(enemies[0].hp).toBeLessThan(1000);
    expect(enemies[1].hp).toBe(1000);
  });

  it('advances Blast Burn across real floor and gives each opponent one full-budget hit', () => {
    const { w, enemies: [enemy], complete, profile } = cast('charmander', 3, 'ultimate', [145]);
    complete();
    expect(enemy.hp).toBe(935);
    const blasts = w.events.filter(e => e.t === 'explosion');
    expect(blasts).toHaveLength(profile.pulses);
    expect(blasts.map(e => e.x)).toEqual([...blasts.map(e => e.x)].sort((a, b) => a - b));
  });

  it('allows a high flying opponent to evade ground roots', () => {
    const { p, enemies: [enemy], complete } = cast('treecko', 3, 'ultimate', [170]);
    p.target = -1;
    p.goalX = enemy.x;
    p.goalY = 131;
    enemy.y = 75;
    complete();
    expect(enemy.hp).toBe(1000);
  });

  it('keeps Mega Sceptile Dragon Pulse distinct from its grass ultimate', () => {
    const shot = cast('treecko', 3, 'shot');
    shot.complete();
    expect(shot.w.bullets[0].weapon).toBe('ash:dragon');
    const ultimate = cast('treecko', 3, 'ultimate', [170]);
    ultimate.complete();
    const blasts = ultimate.w.events.filter(e => e.t === 'explosion');
    expect(blasts.length).toBeGreaterThan(0);
    expect(blasts.every(e => e.weapon === 'ash:grass')).toBe(true);
    expect(ultimate.w.events.filter(e => e.t === 'hit').every(e => e.weapon === 'ash:grass')).toBe(true);
  });

  it('Thunders once per enemy even when several lightning pulses overlap', () => {
    const { enemies: [enemy], complete } = cast('pikachu', 2, 'ultimate');
    complete();
    expect(enemy.hp).toBe(935);
  });

  it('gives Draco Meteor a marked falling volley with no damage before impact', () => {
    const { w, enemies: [enemy], profile, advance, complete } = cast('gible', 3, 'ultimate');
    advance(profile.windup - DT);
    expect(w.bullets).toHaveLength(0);
    complete();
    expect(enemy.hp).toBe(1000);
    expect(w.bullets).toHaveLength(6);
    expect(w.bullets.every(b => b.vy > 0 && b.pokemon === 'gible' && b.explosion?.spareOwner)).toBe(true);
    expect(w.bullets.reduce((sum, b) => sum + (b.explosion?.damage ?? 0), 0)).toBeCloseTo(65, 8);
    for (let tick = 0; tick < 35; tick++) updateBullets(w);
    expect(enemy.hp).toBeLessThan(1000);
    expect(enemy.hp).toBeGreaterThanOrEqual(935 - 0.001);
  });

  it('leaves Charizard Seismic Toss to its physical grab implementation', () => {
    const { w, enemies: [enemy], p, advance } = cast('charmander', 2, 'ultimate');
    advance(2);
    expect(w.bullets).toHaveLength(0);
    expect(enemy.hp).toBe(1000);
    expect(p.fired).toBe(false);
  });
});
