import { describe, expect, it } from 'vitest';
import { applyHit } from '../../src/sim/combat';
import { POKEMON_TIMING, TRAINER_HP } from '../../src/sim/data/pokemon';
import { trainerProtected } from '../../src/sim/pokemon';
import { World } from '../../src/sim/world';
import { intent, run, spec } from './helpers';

const CLIMB_MAP = {
  id: 'partner-commands', name: 'Partner commands', theme: 'arena' as const,
  rows: Array.from({ length: 11 }, (_, row) => row >= 9 ? '#'.repeat(110)
    : row === 8 ? '.....H....S......................................................S'.padEnd(110, '.')
      : '.....H'.padEnd(110, '.')),
};

function battle(stage = 0) {
  const world = new World(CLIMB_MAP, [
    { ...spec('ASH', 1), hero: 'ash', startForm: stage },
    { ...spec('TRAINER', 2), hero: 'ash' }, spec('RIVAL', 2),
  ], { friendlyFire: false, weaponSpawnRate: 0, noPickups: true, gravityScale: 1 }, 9);
  const [ash, trainer, rival] = world.fighters;
  ash.x = ash.px = 88;
  trainer.x = trainer.px = 260;
  rival.x = rival.px = 420;
  for (const f of [ash, trainer, rival]) {
    f.y = f.py = 144;
    f.invuln = 0;
  }
  world.step([intent({ attack: true })]);
  run(world, 31);
  const pokemon = world.fighters[ash.trainer!.slot];
  return { world, ash, trainer, rival, pokemon };
}

const hit = { damage: 10, kbX: 0, kbY: 0, stun: 0, attacker: 2, weapon: 'test', kind: 'melee' as const };

describe('trainer commands and protection', () => {
  it('attacks a regular fighter on press before considering a nearer opposing trainer', () => {
    const { world, trainer, rival, pokemon } = battle();
    trainer.x = 140;
    rival.x = 700;
    world.step([intent({ attack: true })]);
    expect(pokemon.pokemon).toMatchObject({ move: 'punch', target: rival.id });
    run(world, 180);
    expect(rival.hp).toBeLessThan(rival.maxHp);
  });

  it('chooses the nearest opposing Pokémon and falls back to a trainer only when needed', () => {
    const { world, trainer, rival, pokemon } = battle();
    world.step([intent(), intent({ attack: true })]);
    run(world, 31);
    const opposing = world.fighters[trainer.trainer!.slot];
    opposing.x = opposing.px = 190;
    world.step([intent({ attack: true })]);
    expect(pokemon.pokemon?.target).toBe(opposing.id);
    opposing.alive = false;
    opposing.gone = true;
    rival.alive = false;
    rival.gone = true;
    world.step([intent()]);
    world.step([intent({ attack: true })]);
    expect(pokemon.pokemon?.target).toBe(trainer.id);
  });

  it('runs back after a block tap and raises guard only after reaching the trainer', () => {
    const { world, ash, rival, pokemon } = battle();
    pokemon.x = pokemon.px = 620;
    pokemon.pokemon!.engaged = rival.id;
    world.step([intent({ block: true })]);
    expect(pokemon.state).not.toBe('block');
    expect(pokemon.x).toBeGreaterThan(610);
    expect(pokemon.pokemon?.recalling).toBe(true);
    let arrived = false;
    for (let tick = 0; tick < 160; tick++) {
      const previous = pokemon.x;
      world.step([]);
      expect(Math.abs(pokemon.x - previous)).toBeLessThan(8);
      if (pokemon.state === 'block') { arrived = true; break; }
    }
    expect(arrived).toBe(true);
    expect((pokemon.x - ash.x) * ash.facing).toBeGreaterThan(0);
    expect(Math.abs(pokemon.x - ash.x)).toBeLessThan(26);
  });

  it('carries a nearby small Pokémon up a ladder without snapping a distant partner onto it', () => {
    const { world, ash, pokemon } = battle();
    world.step([intent({ moveY: -1 })]);
    expect(ash.state).toBe('climb');
    expect(pokemon.pokemon?.perched).toBe(true);
    run(world, 20, () => [intent({ moveY: -1 })]);
    expect(Math.abs(pokemon.x - ash.x)).toBeLessThan(16);
    expect(pokemon.y).toBeLessThan(ash.y);

    const distant = battle();
    distant.pokemon.x = distant.pokemon.px = 620;
    distant.world.step([intent({ moveY: -1 })]);
    expect(distant.pokemon.pokemon?.perched).toBe(false);
    expect(distant.pokemon.x).toBeGreaterThan(610);
  });

  it('recalls a trainer-sized partner when the trainer climbs inaccessible terrain', () => {
    const { world, pokemon } = battle(1);
    world.step([intent({ moveY: -1 })]);
    expect(pokemon.pokemon?.move).toBe('recall');
    expect(pokemon.pokemon?.perched).toBe(false);
  });

  it('locks the 40HP trainer through the return animation and unlocks after the ball closes', () => {
    const { world, ash, pokemon } = battle(3);
    expect(ash.maxHp).toBe(TRAINER_HP);
    expect(applyHit(world, ash, { ...hit, ignoreInvuln: true })).toBe(false);
    expect(ash.hp).toBe(TRAINER_HP);
    world.step([intent({ attack: true })]);
    run(world, Math.ceil(POKEMON_TIMING.holdToRecall * 60), () => [intent({ attack: true })]);
    expect(pokemon.pokemon?.move).toBe('recall');
    expect(trainerProtected(world, ash)).toBe(true);
    expect(applyHit(world, ash, hit)).toBe(false);
    run(world, Math.ceil(POKEMON_TIMING.recall * 60) + 2);
    expect(trainerProtected(world, ash)).toBe(false);
    expect(applyHit(world, ash, hit)).toBe(true);
    expect(ash.hp).toBe(TRAINER_HP - hit.damage);
  });

  it('returns a defeated partner to its ball before exposing the trainer during cooldown', () => {
    const { world, ash, pokemon } = battle();
    expect(applyHit(world, pokemon, { ...hit, damage: 999, ignoreInvuln: true })).toBe(true);
    expect(pokemon.pokemon?.move).toBe('ko');
    expect(trainerProtected(world, ash)).toBe(true);
    expect(applyHit(world, ash, hit)).toBe(false);
    run(world, Math.ceil((POKEMON_TIMING.faint + POKEMON_TIMING.recall) * 60) + 2);
    expect(pokemon.gone).toBe(true);
    expect(ash.trainer!.cooldown).toBeGreaterThan(0);
    expect(trainerProtected(world, ash)).toBe(false);
    expect(applyHit(world, ash, hit)).toBe(true);
  });
});
