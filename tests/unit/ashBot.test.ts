import { describe, expect, it } from 'vitest';
import { BotController } from '../../src/ai/bot';
import { PERSONALITIES } from '../../src/ai/botData';
import { POKEMON_TIMING, type PokemonSpecies } from '../../src/sim/data/pokemon';
import { POWER_ORB } from '../../src/sim/data/heroes';
import { knockOutPokemon } from '../../src/sim/pokemon';
import { World } from '../../src/sim/world';
import { intent, run, spec } from './helpers';

const ARENA = {
  id: 'ash-bot-arena', name: 'Trainer tactics', theme: 'arena' as const,
  rows: Array.from({ length: 12 }, (_, y) => y >= 10 ? '#'.repeat(72) : '.'.repeat(72)),
};

function battle(team: PokemonSpecies[] = ['charmander'], stage = 0, release = true) {
  const world = new World(ARENA, [
    { ...spec('ASH', 1), hero: 'ash', pokemon: team[0], pokemonTeam: team, startForm: stage },
    { ...spec('RIVAL', 2), hero: 'naruto' },
  ], { weaponSpawnRate: 0, noPickups: true, gravityScale: 1, friendlyFire: false, fallDeath: false }, 53);
  const [ash, rival] = world.fighters;
  ash.x = ash.px = 420;
  rival.x = rival.px = 625;
  ash.y = ash.py = rival.y = rival.py = 160;
  ash.invuln = rival.invuln = 0;
  rival.hp = rival.maxHp = 5000;
  if (release) {
    world.step([intent({ attack: true })]);
    run(world, 32);
  }
  const partner = world.fighters[ash.trainer!.slot];
  const bot = new BotController(() => world, ash.id, { difficulty: 'expert', personality: PERSONALITIES[0], seed: 47 });
  return { world, ash, rival, partner, bot };
}

describe('Ash bot commands and survival', () => {
  it('sends out a ready selected Pokémon without charging the enemy himself', () => {
    const { world, ash, bot } = battle(['charmander'], 0, false);
    const initial = ash.x;
    for (let tick = 0; tick < 80; tick++) world.step([{ ...bot.poll() }]);
    const partner = world.fighters[ash.trainer!.active];
    expect(partner?.alive).toBe(true);
    expect(partner?.pokemon?.species).toBe('charmander');
    expect(ash.x).toBeLessThan(initial + 40);
  });

  it('mixes actual ranged, heavy, ultimate and combo commands while keeping Ash behind the battle', () => {
    const { world, ash, rival, partner, bot } = battle();
    const moves = new Set<string>();
    let trainerPunch = false;
    let recalled = false;
    for (let tick = 0; tick < 1200; tick++) {
      world.step([{ ...bot.poll() }]);
      moves.add(partner.pokemon!.move);
      recalled ||= partner.pokemon!.move === 'recall';
      trainerPunch ||= world.events.some(e => e.t === 'hit' && e.attacker === ash.id && e.victim === rival.id && e.weapon === 'fists');
      world.events.length = 0;
    }
    expect([...moves]).toEqual(expect.arrayContaining(['shot', 'kick', 'ultimate', 'punch']));
    expect(rival.hp).toBeLessThan(rival.maxHp);
    expect(trainerPunch).toBe(false);
    expect(recalled).toBe(false);
    expect(Math.abs(rival.x - ash.x)).toBeGreaterThan(80);
  });

  it('uses the partner orb dash instead of walking Ash into an exposed pickup', () => {
    const { world, ash, rival, partner, bot } = battle();
    world.settings.noPickups = false;
    rival.alive = false;
    rival.gone = true;
    const orb = world.spawnWeapon(POWER_ORB, partner.x + 115, 148);
    let dashed = false;
    for (let tick = 0; tick < 120; tick++) {
      const controls = { ...bot.poll() };
      dashed ||= controls.kick && controls.moveY < 0;
      world.step([controls]);
      world.events.length = 0;
    }
    expect(dashed).toBe(true);
    expect(orb.active).toBe(false);
    expect(ash.trainer!.stage).toBeGreaterThan(0);
  });

  it('uses a brief guard command against an incoming ability without accidentally holding to mount', () => {
    const { world, ash, rival, partner, bot } = battle(['froakie'], 3);
    world.spawnBullet({ x: ash.x + 70, y: ash.y - 12, ox: rival.x, oy: rival.y - 12,
      vx: -240, vy: 0, owner: rival.id, weapon: 'naruto:base', damage: 13, range: 500,
      falloff: 1, knock: 30, ricochet: false, pierce: 0, kind: 'chakra', tier: 1, size: 3 });
    let guard = false;
    let held = 0;
    let longest = 0;
    for (let tick = 0; tick < 100; tick++) {
      const controls = { ...bot.poll() };
      held = controls.block ? held + 1 : 0;
      if (controls.block) expect(controls.moveX).toBeGreaterThanOrEqual(0);
      longest = Math.max(longest, held);
      guard ||= controls.block;
      world.step([controls]);
      world.events.length = 0;
    }
    expect(guard).toBe(true);
    expect(longest / 60).toBeLessThan(POKEMON_TIMING.holdToMount);
    expect(partner.pokemon!.mounted).toBe(false);
  });

  it('only runs and evades during a defeated team cooldown, then redeploys after regeneration', () => {
    const { world, ash, rival, partner, bot } = battle();
    knockOutPokemon(world, partner);
    const initialDistance = Math.abs(rival.x - ash.x);
    let firstRelease = -1;
    for (let tick = 0; tick < Math.ceil((POKEMON_TIMING.knockout + 2) * 60); tick++) {
      const controls = { ...bot.poll() };
      if (tick < Math.floor((POKEMON_TIMING.knockout - 0.1) * 60)) {
        expect(controls.attack || controls.ability || controls.kick || controls.interact).toBe(false);
      }
      world.step([controls]);
      if (tick === 180) expect(Math.abs(rival.x - ash.x)).toBeGreaterThan(initialDistance + 70);
      if (partner.alive) { firstRelease = tick; break; }
    }
    expect(firstRelease).toBeGreaterThanOrEqual(Math.floor(POKEMON_TIMING.knockout * 60) - 2);
    expect(firstRelease).toBeLessThan((POKEMON_TIMING.knockout + 1) * 60);
  });

  it('selects and deploys a ready reserve after the first partner faints', () => {
    const { world, ash, partner, bot } = battle(['charmander', 'squirtle', 'froakie']);
    knockOutPokemon(world, partner);
    for (let tick = 0; tick < 180; tick++) world.step([{ ...bot.poll() }]);
    const active = world.fighters[ash.trainer!.active];
    expect(active?.alive).toBe(true);
    expect(active?.pokemon?.species).toBe('squirtle');
    expect(ash.inv[ash.active]?.pokemon).toBe('squirtle');
    expect(world.fighters.filter(f => f.master === ash.id && f.pokemon && f.alive && !f.gone)).toHaveLength(1);
    expect(ash.trainer!.team.find(member => member.species === 'charmander')!.cooldown).toBeGreaterThan(10);
  });

  it('uses a genuinely large flying partner to reach an enemy on an upper platform', () => {
    const upper = { ...ARENA, id: 'ash-bot-upper', rows: ARENA.rows.map((row, y) => y === 5
      ? '.'.repeat(31) + '----------' + '.'.repeat(31) : row) };
    const world = new World(upper, [
      { ...spec('ASH', 1), hero: 'ash', pokemon: 'charmander', startForm: 2 }, spec('RIVAL', 2),
    ], { weaponSpawnRate: 0, noPickups: true, gravityScale: 1, friendlyFire: false }, 53);
    const [ash, rival] = world.fighters;
    ash.x = ash.px = 420;
    ash.y = ash.py = 160;
    rival.x = rival.px = 560;
    rival.y = rival.py = 80;
    rival.hp = rival.maxHp = 5000;
    ash.invuln = rival.invuln = 0;
    world.step([intent({ attack: true })]);
    run(world, 32);
    const bot = new BotController(() => world, ash.id, { difficulty: 'expert', personality: PERSONALITIES[0], seed: 47 });
    let mounted = false;
    let climbed = false;
    for (let tick = 0; tick < 220; tick++) {
      world.step([{ ...bot.poll() }]);
      mounted ||= ash.trainer!.mounted;
      const partner = world.fighters[ash.trainer!.active];
      climbed ||= !!partner && partner.flying && partner.vy < -20;
    }
    expect(mounted && climbed).toBe(true);
  });
});
