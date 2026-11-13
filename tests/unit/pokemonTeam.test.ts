import { describe, expect, it } from 'vitest';
import { applyHit } from '../../src/sim/combat';
import { DT } from '../../src/sim/constants';
import { HEROES, POWER_ORB } from '../../src/sim/data/heroes';
import { POKEMON_PARTNERS, POKEMON_TIMING, TRAINER_HP, pokemonStage, pokemonTeam, type PokemonSpecies } from '../../src/sim/data/pokemon';
import { trainerProtected } from '../../src/sim/pokemon';
import { World } from '../../src/sim/world';
import { FLAT, intent, run, spec } from './helpers';

const ticks = (seconds: number) => Math.ceil(seconds / DT) + 2;
function battle(team: PokemonSpecies[] = ['charmander', 'squirtle', 'pikachu'], stage = 0) {
  const world = new World(FLAT, [{ ...spec('ASH', 1), hero: 'ash', pokemon: team[0], pokemonTeam: team, startForm: stage }, spec('RIVAL', 2)],
    { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 83);
  const [ash, rival] = world.fighters;
  ash.x = ash.px = 90;
  rival.x = rival.px = 300;
  ash.y = ash.py = rival.y = rival.py = 144;
  ash.invuln = rival.invuln = 0;
  run(world, 2);
  const selected = () => world.fighters[ash.trainer!.slot];
  const count = () => world.fighters.filter(f => f.master === ash.id && f.pokemon && f.alive && !f.gone).length;
  const choose = (species: PokemonSpecies) => {
    ash.active = ash.inv.findIndex(item => item?.pokemon === species);
    world.step([]);
  };
  const attack = () => { world.step([]); world.step([intent({ attack: true })]); };
  const summon = () => { attack(); run(world, ticks(POKEMON_TIMING.release)); };
  return { world, ash, rival, selected, count, choose, attack, summon };
}

describe('trainer partner teams', () => {
  it('keeps a single default and sanitizes explicit reserve choices', () => {
    expect(pokemonTeam(undefined, 'treecko')).toEqual(['treecko']);
    expect(pokemonTeam(['squirtle', 'squirtle', 'bad', null, 'froakie'], 'charmander')).toEqual(['charmander', 'squirtle', 'froakie']);
    const { ash, world } = battle();
    expect(ash.inv.filter(item => item?.pokemon).map(item => item!.pokemon)).toEqual(['charmander', 'squirtle', 'pikachu']);
    expect(new Set(ash.trainer!.team.map(member => member.slot)).size).toBe(3);
    expect(world.fighters.filter(f => f.pokemon)).toHaveLength(3);
    expect(ash.trainer!.active).toBe(-1);
  });

  it('cycles through every selected ball using the normal inventory command', () => {
    const { world, ash } = battle([...POKEMON_PARTNERS]);
    const seen = new Set<string>();
    for (let i = 0; i < 9; i++) {
      const item = ash.inv[ash.active];
      if (item?.pokemon) seen.add(item.pokemon);
      world.step([intent({ cycle: true })]);
      world.step([]);
    }
    expect([...seen].sort()).toEqual([...POKEMON_PARTNERS].sort());
  });

  it('selection recalls the current partner without automatically releasing the next one', () => {
    const { world, ash, selected, choose, summon, count } = battle();
    summon();
    const old = selected();
    choose('squirtle');
    expect(old.pokemon?.move).toBe('recall');
    expect(ash.trainer).toMatchObject({ species: 'squirtle', active: old.id });
    expect(trainerProtected(world, ash)).toBe(true);
    expect(count()).toBe(1);
    run(world, ticks(POKEMON_TIMING.recall));
    expect(count()).toBe(0);
    expect(ash.trainer!.active).toBe(-1);
    expect(selected().alive).toBe(false);
  });

  it('queues one requested release until the old ball has closed, with no overlapping partners', () => {
    const { world, selected, choose, summon, attack, count } = battle();
    summon();
    const old = selected();
    choose('squirtle');
    attack();
    const next = selected();
    expect(next.alive).toBe(false);
    for (let i = 0; i < ticks(POKEMON_TIMING.recall + POKEMON_TIMING.release); i++) {
      world.step([]);
      expect(count()).toBeLessThanOrEqual(1);
    }
    expect(old.alive).toBe(false);
    expect(next.alive).toBe(true);
    expect(next.pokemon?.species).toBe('squirtle');
  });

  it('stores health, evolution and attack cooldowns independently for each ball', () => {
    const { world, ash, selected, choose, summon } = battle();
    summon();
    const fire = selected();
    fire.hp -= 9;
    const hp = fire.hp;
    ash.trainer!.shotCd = 0.8;
    choose('squirtle');
    run(world, ticks(POKEMON_TIMING.recall));
    summon();
    const water = selected();
    expect(water.hp).toBe(water.maxHp);
    expect(ash.trainer!.shotCd).toBe(0);
    const orb = world.spawnWeapon(POWER_ORB, water.x, water.y);
    expect(world.pickUp(water, orb, true)).toBe(true);
    expect(ash.trainer!.stage).toBe(1);
    choose('charmander');
    run(world, ticks(POKEMON_TIMING.recall));
    summon();
    expect(selected().hp).toBe(hp);
    expect(ash.trainer!.stage).toBe(0);
    expect(ash.trainer!.team.find(member => member.species === 'squirtle')!.stage).toBe(1);
  });

  it('cancels a ranged windup and unmounts before switching', () => {
    const { world, ash, selected, choose, summon, count } = battle(undefined, 3);
    summon();
    const fire = selected();
    world.step([intent({ ability: true })]);
    fire.pokemon!.mounted = ash.trainer!.mounted = true;
    choose('squirtle');
    expect(fire.pokemon!.move).toBe('recall');
    expect(fire.pokemon!.mounted).toBe(false);
    expect(ash.trainer!.mounted).toBe(false);
    run(world, ticks(1));
    expect(world.bullets.some(b => b.active && b.pokemon === 'charmander')).toBe(false);
    expect(count()).toBe(0);
  });

  it('keeps a knocked-out member unavailable18seconds while a healthy reserve can fight', () => {
    const { world, ash, rival, selected, choose, summon, count } = battle();
    summon();
    const fire = selected();
    fire.invuln = 0;
    expect(applyHit(world, fire, { attacker: rival.id, weapon: 'test', kind: 'melee', damage: 999, kbX: 0, kbY: 0 })).toBe(true);
    expect(ash.trainer!.cooldown).toBe(18);
    expect(trainerProtected(world, ash)).toBe(true);
    choose('squirtle');
    run(world, ticks(POKEMON_TIMING.faint + POKEMON_TIMING.recall));
    summon();
    expect(selected().alive).toBe(true);
    expect(count()).toBe(1);
    choose('charmander');
    run(world, ticks(POKEMON_TIMING.recall));
    expect(ash.trainer!.cooldown).toBeGreaterThan(15);
    summon();
    expect(fire.alive).toBe(false);
    expect(ash.trainer!.cooldown).toBeGreaterThan(0);
    run(world, ticks(18));
    summon();
    expect(fire.alive).toBe(true);
  });

  it('only lets the visibly large body lines carry a trainer', () => {
    const large = new Set<PokemonSpecies>(['charmander', 'squirtle', 'bulbasaur', 'gible']);
    for (const species of POKEMON_PARTNERS) for (let stage = 0; stage <= pokemonStage(species, 0).maxStage; stage++) {
      expect(pokemonStage(species, stage).rideable, species + ' ' + stage).toBe(large.has(species) && stage >= 2);
    }
  });

  it.each(['naruto', 'sasuke'] as const)('%s base signature attack defeats an exposed human trainer', hero => {
    const { world, ash, rival } = battle(['charmander']);
    const damage = HEROES[hero].base.dash!.damage;
    expect(ash.hp).toBe(TRAINER_HP);
    expect(applyHit(world, ash, { attacker: rival.id, weapon: hero + ':base', kind: 'melee', damage, kbX: 0, kbY: 0 })).toBe(true);
    expect(ash.alive).toBe(false);
  });

  it('migrates a single-partner snapshot without losing its selected cooldown', () => {
    const { world, ash } = battle(['treecko']);
    ash.trainer!.cooldown = 7;
    const snapshot = world.snapshot();
    delete (snapshot.fighters[0].trainer as Partial<typeof ash.trainer>)!.team;
    delete (snapshot.fighters[0].trainer as Partial<typeof ash.trainer>)!.pending;
    world.restore(snapshot);
    expect(ash.trainer!.team).toHaveLength(1);
    expect(ash.trainer!.team[0]).toMatchObject({ species: 'treecko', cooldown: 7 });
    expect(ash.trainer!.pending).toBe('');
  });
});
