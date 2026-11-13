import { describe, expect, it } from 'vitest';
import { World } from '../../src/sim/world';
import { intent, run, spec } from './helpers';

const ARENA = {
  id: 'partner-combo', name: 'Partner combo', theme: 'arena' as const,
  rows: Array.from({ length: 12 }, (_, y) => y >= 10 ? '#'.repeat(90) : '.'.repeat(90)),
};

function battle() {
  const world = new World(ARENA, [{ ...spec('ASH', 1), hero: 'ash' }, spec('RIVAL', 2)],
    { friendlyFire: false, weaponSpawnRate: 0, noPickups: true, gravityScale: 1 }, 91);
  const [ash, rival] = world.fighters;
  ash.x = ash.px = 100;
  rival.x = rival.px = 190;
  ash.y = ash.py = rival.y = rival.py = 160;
  ash.invuln = rival.invuln = 0;
  world.step([intent({ attack: true })]);
  run(world, 32);
  const pokemon = world.fighters[ash.trainer!.slot];
  return { world, ash, rival, pokemon };
}

function until(world: World, condition: () => boolean) {
  for (let i = 0; i < 180 && !condition(); i++) world.step([]);
  expect(condition()).toBe(true);
}

describe('partner melee choreography', () => {
  it('queues alternating strikes and a stronger third-hit finisher from separate presses', () => {
    const { world, rival, pokemon } = battle();
    world.step([intent({ attack: true })]);
    until(world, () => !!pokemon.pokemon?.fired);
    expect(pokemon.combo).toBe(0);
    const first = rival.maxHp - rival.hp;
    expect(first).toBeGreaterThan(0);
    world.step([]);
    world.step([intent({ attack: true })]);
    expect(pokemon.pokemon?.queued).toBe(true);
    until(world, () => pokemon.combo === 1 && !!pokemon.pokemon?.fired);
    const secondHp = rival.hp;
    world.step([]);
    world.step([intent({ attack: true })]);
    until(world, () => pokemon.combo === 2 && !!pokemon.pokemon?.fired);
    expect(secondHp - rival.hp).toBeGreaterThan(first);
    expect(rival.state).toBe('knockdown');
  });

  it('does not restart approach or windup when attack is tapped again before contact', () => {
    const { world, rival, pokemon } = battle();
    rival.x = rival.px = 500;
    world.step([intent({ attack: true })]);
    run(world, 3);
    const before = pokemon.pokemon!.age;
    world.step([intent({ attack: true })]);
    expect(pokemon.pokemon!.age).toBeGreaterThan(before);
    expect(pokemon.combo).toBe(0);
  });

  it('block cancels an attack queued during recovery and returns physically to the trainer', () => {
    const { world, pokemon } = battle();
    world.step([intent({ attack: true })]);
    until(world, () => !!pokemon.pokemon?.fired);
    world.step([]);
    world.step([intent({ attack: true })]);
    expect(pokemon.pokemon?.queued).toBe(true);
    const oldX = pokemon.x;
    world.step([intent({ block: true })]);
    expect(pokemon.pokemon?.move).toBe('guard');
    expect(pokemon.pokemon?.queued).toBe(false);
    expect(Math.abs(pokemon.x - oldX)).toBeLessThan(8);
    run(world, 25);
    expect(pokemon.combo).toBe(0);
  });
});
