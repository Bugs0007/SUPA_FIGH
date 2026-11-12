import { describe, expect, it } from 'vitest';
import { applyHit } from '../../src/sim/combat';
import { DT, FIGHTER_H, FIGHTER_W } from '../../src/sim/constants';
import { POWER_ORB } from '../../src/sim/data/heroes';
import { POKE_BALL, POKEMON_TIMING, pokemonStage, type PokemonSpecies } from '../../src/sim/data/pokemon';
import type { Fighter } from '../../src/sim/fighter';
import { aimUltimate, beamHits } from '../../src/sim/hero';
import { World } from '../../src/sim/world';
import { FLAT, intent, run, spec } from './helpers';

const ticks = (seconds: number) => Math.ceil(seconds / DT) + 1;

function arena(species: PokemonSpecies = 'charmander', enemyPositions = [207]) {
  const fighters = [{ ...spec('ASH'), hero: 'ash', pokemon: species },
    ...enemyPositions.map((_, index) => spec(`RIVAL ${index + 1}`))];
  const world = new World(FLAT, fighters, { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 42);
  run(world, 5);
  const [ash, ...enemies] = world.fighters.slice(0, fighters.length);
  for (const [index, f] of [ash, ...enemies].entries()) {
    f.x = f.px = index ? enemyPositions[index - 1] : 90;
    f.y = f.py = 144;
    f.vx = f.vy = f.invuln = 0;
    f.facing = index ? -1 : 1;
  }
  const trainer = ash.trainer!;
  const partner = world.fighters[trainer.slot];
  return { world, ash, enemies, trainer, partner };
}

function summon(world: World): void {
  world.step([intent({ attack: true })]);
  run(world, ticks(POKEMON_TIMING.release));
}

function knockOut(world: World, partner: Fighter, enemy: Fighter): void {
  expect(applyHit(world, partner, {
    damage: partner.maxHp + 1, kbX: 0, kbY: 0, stun: 0,
    attacker: enemy.id, weapon: 'test', kind: 'melee', x: partner.x, y: partner.y,
  })).toBe(true);
}

describe('Ash and Pokémon in a match', () => {
  it('releases the chosen partner only by tapping Attack with its Poké Ball selected', () => {
    const { world, ash, trainer, partner } = arena('charmander');
    expect(partner.alive).toBe(false);
    expect(trainer.active).toBe(-1);
    expect(ash.inv[ash.active]?.id).toBe(POKE_BALL);
    world.step([intent({ gadget: true })]);
    expect(partner.alive).toBe(false);
    world.step([intent({ cycle: true })]);
    expect(ash.inv[ash.active]?.id).not.toBe(POKE_BALL);
    world.step([intent({ attack: true })]);
    expect(partner.alive).toBe(false);
    run(world, ticks(0.55));
    world.step([intent({ cycle: true })]);
    world.step([intent({ attack: true })]);
    expect(trainer.active).toBe(partner.id);
    expect(partner.alive).toBe(true);
    expect(partner.pokemon?.move).toBe('release');
    expect(partner.pokemon?.species).toBe(trainer.species);
    expect(ash.state).toBe('normal');
    run(world, ticks(POKEMON_TIMING.release));
    expect(partner.pokemon?.move).toBe('follow');
  });

  it('returns a deployed partner to the selected ball on hold and preserves its health when sent out again', () => {
    const { world, ash, trainer, partner } = arena();
    summon(world);
    partner.hp -= 7;
    const hp = partner.hp;
    world.step([intent({ cycle: true })]);
    run(world, ticks(POKEMON_TIMING.holdToRecall + POKEMON_TIMING.recall), () => [intent({ attack: true })]);
    expect(partner.alive).toBe(true);
    world.step([]);
    world.step([intent({ cycle: true })]);
    expect(ash.inv[ash.active]?.id).toBe(POKE_BALL);
    run(world, ticks(POKEMON_TIMING.holdToRecall), () => [intent({ attack: true })]);
    expect(partner.pokemon?.move).toBe('recall');
    run(world, ticks(POKEMON_TIMING.recall), () => [intent({ attack: true })]);
    expect(partner.alive).toBe(false);
    expect(trainer.active).toBe(-1);
    expect(trainer.cooldown).toBe(0);
    world.step([]);
    summon(world);
    expect(partner.hp).toBe(hp);
  });

  it('locks Ember onto the nearest visible enemy and hits through a real projectile', () => {
    const { world, ash, enemies: [far, near], partner } = arena('charmander', [298, 200]);
    summon(world);
    world.step([intent({ ability: true })]);
    expect(partner.pokemon?.target).toBe(near.id);
    expect(partner.pokemon?.move).toBe('shot');
    run(world, ticks(0.8));
    expect(near.hp).toBeLessThan(near.maxHp);
    expect(far.hp).toBe(far.maxHp);
    expect(world.events.some(e => e.t === 'hit' && e.victim === near.id && e.attacker === ash.id && e.weapon === 'ash:fireball')).toBe(true);
  });

  it('locks a partner attack onto the opposing Pokémon and sends it past its trainer', () => {
    const world = new World(FLAT, [
      { ...spec('ASH'), hero: 'ash', pokemon: 'charmander' },
      { ...spec('RIVAL ASH'), hero: 'ash', pokemon: 'charmander' },
    ], { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 42);
    run(world, 5);
    const [ash, rival] = world.fighters;
    ash.x = ash.px = 80;
    rival.x = rival.px = 175;
    ash.y = ash.py = rival.y = rival.py = 144;
    ash.facing = 1;
    rival.facing = -1;
    world.step([intent({ attack: true }), intent({ attack: true })]);
    run(world, ticks(0.55));
    const attacker = world.fighters[ash.trainer!.active];
    const defender = world.fighters[rival.trainer!.active];
    defender.x = defender.px = 201;
    defender.pokemon!.engaged = -2;
    world.step([intent({ ability: true })]);
    expect(attacker.pokemon!.target).toBe(defender.id);
    run(world, ticks(0.8));
    expect(defender.hp).toBeLessThan(defender.maxHp);
    expect(rival.hp).toBe(rival.maxHp);
  });

  it('prefers a trainer’s partner for player lock-on and falls back when it is out of range or recalled', () => {
    const { world, ash, enemies: [rival], partner } = arena();
    summon(world);
    partner.x = ash.x - 28;
    aimUltimate(world, rival, 0, 'ki', 170, 0.5);
    expect(rival.lockOn).toBe(partner.id);
    partner.invuln = 0;
    beamHits(world, rival, rival.stretchAngle, 170, 8, 20, 0, 'goku:super');
    expect(partner.hp).toBeLessThan(partner.maxHp);
    expect(ash.hp).toBe(ash.maxHp);
    aimUltimate(world, rival, 0, 'ki', 130, 0.5);
    expect(rival.lockOn).toBe(ash.id);
    partner.pokemon!.move = 'recall';
    aimUltimate(world, rival, 0, 'ki', 170, 0.5);
    expect(rival.lockOn).toBe(ash.id);
  });

  it('lets a nearby partner take a player swing that reaches both bodies', () => {
    const { world, ash, enemies: [rival], partner } = arena();
    summon(world);
    rival.x = rival.px = ash.x + 17;
    partner.x = partner.px = ash.x + 5;
    partner.invuln = 0;
    partner.pokemon!.engaged = -2;
    world.step([intent(), intent({ attack: true })]);
    run(world, ticks(0.25));
    expect(partner.hp).toBeLessThan(partner.maxHp);
    expect(ash.hp).toBe(ash.maxHp);
  });

  it('gives a shared projectile impact to the partner and protects Ash while it remains deployed', () => {
    const { world, ash, enemies: [rival], partner } = arena();
    summon(world);
    partner.x = partner.px = ash.x;
    partner.invuln = 0;
    partner.pokemon!.engaged = -2;
    const fire = () => {
      const x = ash.x + 8;
      const y = ash.y - 7;
      world.spawnBullet({ x, y, ox: x, oy: y, vx: -420, vy: 0, owner: rival.id, weapon: 'test',
        damage: 10, range: 120, falloff: 1, knock: 0, ricochet: false, pierce: 0, kind: 'ki' });
      world.step([]);
    };
    fire();
    expect(partner.hp).toBeLessThan(partner.maxHp);
    expect(ash.hp).toBe(ash.maxHp);
    partner.x = partner.px = ash.x + 40;
    fire();
    expect(ash.hp).toBe(ash.maxHp);
  });

  it.each(['melee', 'kick', 'throw'] as const)('scales Ash’s %s damage to one third and preserves partner damage', kind => {
    const { world, ash, enemies: [rival], partner } = arena();
    const hit = { damage: 30, kbX: 0, kbY: 0, kind, weapon: 'test' };
    expect(applyHit(world, rival, { ...hit, attacker: ash.id })).toBe(true);
    expect(rival.maxHp - rival.hp).toBe(10);
    summon(world);
    expect(applyHit(world, rival, { ...hit, attacker: partner.id })).toBe(true);
    expect(rival.maxHp - rival.hp).toBe(40);
  });

  it('routes Attack to the deployed partner, who stays on the rival until recalled', () => {
    const { world, ash, enemies: [far, near], partner } = arena('charmander', [300, 205]);
    summon(world);
    world.step([intent({ attack: true })]);
    world.step([]);
    expect(ash.state).toBe('normal');
    expect(partner.pokemon).toMatchObject({ move: 'punch', target: near.id, engaged: near.id });
    run(world, ticks(0.9));
    expect(near.hp).toBeLessThan(near.maxHp);
    expect(far.hp).toBe(far.maxHp);
    expect(world.events.some(e => e.t === 'hit' && e.victim === near.id && e.weapon === 'ash:punch')).toBe(true);
    expect(Math.abs(partner.x - near.x)).toBeLessThan(34);
    expect(partner.x - ash.x).toBeGreaterThan(80);

    const position = partner.x;
    world.step([intent({ block: true })]);
    expect(partner.state).not.toBe('block');
    expect(partner.x).toBeLessThan(position);
    world.step([]);
    run(world, ticks(0.7));
    expect(partner.state).toBe('block');
    expect(partner.x - ash.x).toBeLessThan(24);
    run(world, ticks(0.5));
    expect(partner.state).toBe('normal');
    expect(partner.pokemon?.engaged).toBe(-1);

    world.step([intent({ block: true })]);
    world.step([intent({ attack: true })]);
    world.step([]);
    expect(partner.pokemon?.move).toBe('punch');
    expect(partner.state).toBe('normal');
    run(world, ticks(0.55));
    near.alive = false;
    near.gone = true;
    run(world, 1);
    const parked = partner.x;
    run(world, ticks(0.55));
    expect(partner.x).toBeCloseTo(parked);
    expect(partner.x - ash.x).toBeGreaterThan(80);

    run(world, ticks(0.56), () => [intent({ block: true })]);
    expect(partner.pokemon?.engaged).toBe(-1);
    expect(partner.state).toBe('block');
    expect(partner.x).toBeGreaterThan(ash.x);
    expect(partner.x - ash.x).toBeLessThan(24);
  });

  it('tackles a real rival, then dashes to collect an orb for Ash', () => {
    const { world, ash, enemies: [enemy], trainer, partner } = arena();
    summon(world);
    world.step([intent({ kick: true })]);
    expect(partner.pokemon?.target).toBe(enemy.id);
    run(world, ticks(POKEMON_TIMING.dash));
    expect(enemy.hp).toBeLessThan(enemy.maxHp);
    expect(world.events.some(e => e.t === 'hit' && e.victim === enemy.id && e.weapon === 'ash:tackle')).toBe(true);

    run(world, ticks(1.3));
    const orb = world.spawnItem(POWER_ORB, 0, 1, ash.x + 87, ash.y);
    world.step([intent({ kick: true, moveY: -1 })]);
    expect(partner.pokemon?.target).toBe(-1);
    expect(partner.pokemon?.goalX).toBe(orb.x);
    run(world, ticks(POKEMON_TIMING.dash));
    expect(orb.active).toBe(false);
    expect(trainer.stage).toBe(1);
    expect(partner.name).toBe('CHARMELEON');
    expect(partner.pokemon?.move).toBe('evolve');
  });

  it('keeps Charmander ahead of Ash for clear attacks and braces closer when guarding', () => {
    const { world, ash, partner } = arena();
    summon(world);
    run(world, 30);
    expect(partner.x).toBeGreaterThan(ash.x + (ash.w + partner.w) / 2);
    run(world, ticks(0.45), () => [intent({ block: true })]);
    expect(ash.state).toBe('block');
    expect(partner.state).toBe('block');
    expect(partner.x).toBeGreaterThan(ash.x);
  });

  it('lets an orb clear the knockout cooldown and queues evolution until the next send-out', () => {
    const { world, ash, enemies: [enemy], trainer, partner } = arena();
    summon(world);
    run(world, ticks(0.5));
    knockOut(world, partner, enemy);
    expect(partner.pokemon?.move).toBe('ko');
    expect(trainer.active).toBe(partner.id);
    expect(trainer.cooldown).toBe(POKEMON_TIMING.knockout);
    world.step([intent({ attack: true, ability: true })]);
    expect(partner.alive).toBe(false);
    expect(ash.alive).toBe(true);
    expect(ash.state).toBe('melee');

    const orb = world.spawnItem(POWER_ORB, 0, 1, ash.x, ash.y);
    world.step([]);
    expect(orb.active).toBe(false);
    expect(trainer.active).toBe(partner.id);
    expect(partner.alive).toBe(false);
    expect(trainer.cooldown).toBe(0);
    world.step([intent({ attack: true })]);
    expect(trainer.active).toBe(partner.id);
    expect(partner.pokemon?.move).toBe('release');
    run(world, ticks(POKEMON_TIMING.release));
    expect(partner.pokemon).toMatchObject({ previousStage: 0, stage: 1, move: 'evolve' });
    expect(partner.hp).toBe(pokemonStage('charmander', 1).hp);
  });

  it('lets Ash send out the same partner after its cooldown expires', () => {
    const { world, enemies: [enemy], trainer, partner } = arena();
    summon(world);
    run(world, ticks(0.5));
    knockOut(world, partner, enemy);
    run(world, ticks(POKEMON_TIMING.knockout - 0.25));
    world.step([intent({ attack: true })]);
    expect(trainer.active).toBe(-1);
    expect(partner.alive).toBe(false);
    run(world, ticks(0.25));
    world.step([intent({ attack: true })]);
    expect(trainer.active).toBe(partner.id);
    expect(partner.alive).toBe(true);
    expect(partner.pokemon).toMatchObject({ stage: 0, move: 'release' });
  });

  it.each([['charmander', 'CHARIZARD']] as const)('%s mounts its final evolution and isolates rider health', (species, form) => {
    const { world, ash, enemies: [enemy], trainer, partner } = arena(species);
    summon(world);
    for (let stage = 1; stage <= 2; stage++) {
      const orb = world.spawnItem(POWER_ORB, 0, 1, ash.x, ash.y);
      world.step([]);
      expect(orb.active).toBe(false);
      expect(trainer.stage).toBe(stage);
      run(world, ticks(POKEMON_TIMING.evolve));
    }
    expect(partner.name).toBe(form);
    run(world, ticks(1.25), () => [intent({ block: true })]);
    expect(trainer.mounted).toBe(true);
    expect(partner.pokemon?.mounted).toBe(true);
    expect(ash.x).toBeCloseTo(partner.x);
    expect(ash.y).toBeLessThan(partner.y);
    world.step([intent({ jump: true })]);

    const ashHp = ash.hp;
    const partnerHp = partner.hp;
    const x = enemy.x - 12;
    const y = ash.y - ash.h * 0.6;
    world.spawnBullet({
      x, y, ox: x, oy: y, vx: -420, vy: 0, owner: enemy.id, weapon: 'test',
      damage: 12, range: 300, falloff: 1, knock: 0.2, ricochet: false, pierce: 0, kind: 'ki',
    });
    run(world, ticks(0.45));
    expect(partner.hp).toBeLessThan(partnerHp);
    expect(ash.hp).toBe(ashHp);
    expect(trainer.mounted).toBe(true);
    run(world, ticks(0.2));
    const before = partner.x;
    world.step([intent({ kick: true })]);
    expect(partner.pokemon?.move).toBe('kick');
    expect(partner.pokemon?.target).toBe(enemy.id);
    run(world, 8);
    expect(partner.x).toBeGreaterThan(before);
    expect(ash.x).toBeCloseTo(partner.x);
    world.step([intent({ gadget: true })]);
    expect(trainer.mounted).toBe(false);
    expect(partner.pokemon?.mounted).toBe(false);
    expect(ash.w).toBe(FIGHTER_W);
    expect(ash.h).toBe(FIGHTER_H);
    expect(ash.hp).toBe(ashHp);
  });

  it('flies through a one-way platform on Down and uses only the mount body', () => {
    const { world, ash, trainer, partner } = arena();
    summon(world);
    for (let stage = 0; stage < 2; stage++) {
      world.spawnItem(POWER_ORB, 0, 1, ash.x, ash.y);
      world.step([]);
      run(world, ticks(POKEMON_TIMING.evolve));
    }
    run(world, ticks(1.25), () => [intent({ block: true })]);
    expect(trainer.mounted).toBe(true);
    // FLAT's one-way ledge spans x = 112–208 at y = 80.
    partner.x = 156;
    partner.y = 80;
    partner.vx = partner.vy = 0;
    partner.grounded = true;
    run(world, ticks(0.16), () => [intent({ moveY: 1, jump: true })]);
    expect(partner.y).toBeGreaterThan(80);
    expect(partner.grounded).toBe(false);
    expect(ash.x).toBe(partner.x);
    expect(ash.y).toBeCloseTo(partner.y - partner.h * 0.34);
    expect(ash.vx).toBe(0);
    expect(ash.vy).toBe(0);
    expect(ash.flying).toBe(false);

    run(world, ticks(0.6), () => [intent({ moveY: 1 })]);
    expect(partner.y).toBe(144);
    expect(partner.grounded).toBe(true);
    run(world, ticks(0.57), () => [intent({ moveY: -1 })]);
    expect(partner.y).toBeLessThan(80);
    expect(ash.y).toBeCloseTo(partner.y - partner.h * 0.34);
  });
});
