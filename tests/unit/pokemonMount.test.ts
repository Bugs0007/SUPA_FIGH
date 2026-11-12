import { describe, expect, it } from 'vitest';
import { POKEMON_PARTNERS, POKEMON_TIMING, pokemonStage, type PokemonSpecies } from '../../src/sim/data/pokemon';
import { World } from '../../src/sim/world';
import { FLAT, intent, run, spec } from './helpers';

function summonAndMount(species: PokemonSpecies, stage: number) {
  const world = new World(FLAT, [
    { ...spec('ASH'), hero: 'ash', pokemon: species, startForm: stage },
    spec('RIVAL'),
  ], { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 42);
  const [ash, enemy] = world.fighters;
  ash.x = ash.px = 84;
  enemy.x = enemy.px = 240;
  ash.y = ash.py = enemy.y = enemy.py = 144;
  const trainer = ash.trainer!;
  const mount = world.fighters[trainer.slot];
  world.step([intent({ attack: true })]);
  run(world, Math.ceil(POKEMON_TIMING.release * 60) + 6);
  run(world, 85, () => [intent({ block: true })]);
  return { world, ash, enemy, trainer, mount };
}

describe('Pokémon mount classes', () => {
  it.each([[2, -1], [2, 1], [3, -1], [3, 1]])('stage %i sprints in direction %i only after a double tap', (stage, direction) => {
    const { world, ash, mount } = summonAndMount('charmander', stage);
    mount.x = mount.px = 230;
    run(world, 20, () => [intent({ moveX: direction })]);
    const cruisingSpeed = Math.abs(mount.vx);
    expect(mount.sprintDir).toBe(0);
    run(world, 18);
    world.step([intent({ moveX: direction })]);
    expect(mount.sprintDir).toBe(0);
    world.step([intent()]);
    world.step([intent({ moveX: direction })]);
    expect(mount.sprintDir).toBe(direction);
    run(world, 18, () => [intent({ moveX: direction })]);
    expect(Math.abs(mount.vx)).toBeGreaterThan(cruisingSpeed * 1.2);
    expect(ash.x).toBe(mount.x);
    world.step([intent()]);
    expect(mount.sprintDir).toBe(0);
  });

  for (const species of POKEMON_PARTNERS) {
    const last = pokemonStage(species, 0).maxStage;
    for (const stage of [last - 1, last]) {
      const form = pokemonStage(species, stage);
      it(`${form.name} uses its size and flight capability when mounting`, () => {
        const { trainer, mount } = summonAndMount(species, stage);
        const fits = form.name !== 'RAICHU';
        expect(form.rideable).toBe(fits);
        expect(trainer.mounted).toBe(fits);
        expect(mount.pokemon?.mounted).toBe(fits);
        expect(mount.flying).toBe(form.flies);
      });
    }
  }


});
