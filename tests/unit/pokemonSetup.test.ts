import { describe, expect, it } from 'vitest';
import { sanitizeClaim } from '../../src/net/protocol';
import { applyWorld, encodeWorld } from '../../src/net/renderState';
import { defaultLobby, lobbyToMatch } from '../../src/scenes/lobby';
import { decodeLobby, encodeLobby } from '../../src/scenes/shareLink';
import { POKEMON_PARTNERS, pokemonTeam } from '../../src/sim/data/pokemon';
import { World } from '../../src/sim/world';
import { FLAT, spec } from './helpers';

describe('Pokémon match setup', () => {
  it('keeps one default partner until reserves are explicitly chosen', () => {
    expect(pokemonTeam(undefined)).toEqual(['charmander']);
    expect(pokemonTeam(undefined, 'froakie')).toEqual(['froakie']);
    const lobby = defaultLobby();
    Object.assign(lobby.slots[0], { hero: 'ash', pokemon: 'treecko' });
    expect(lobbyToMatch(lobby, 4).players[0].spawn.pokemonTeam).toEqual(['treecko']);
  });

  it('passes all eight unique choices to the match in ball order', () => {
    const lobby = defaultLobby();
    Object.assign(lobby.slots[0], { hero: 'ash', pokemon: 'froakie', pokemonTeam: [...POKEMON_PARTNERS] });
    const setup = lobbyToMatch(lobby, 7);
    expect(setup.players[0].spawn.pokemonTeam).toEqual(['froakie', ...POKEMON_PARTNERS.filter(s => s !== 'froakie')]);
    expect(setup.config.fighters[0].pokemonTeam).toEqual(setup.players[0].spawn.pokemonTeam);
    expect(setup.players[1].spawn.pokemonTeam).toBeUndefined();
  });

  it('preserves the primary and reserve list in a shared setup link', () => {
    const lobby = defaultLobby();
    Object.assign(lobby.slots[2], { hero: 'ash', pokemon: 'squirtle', pokemonTeam: ['squirtle', 'gible', 'riolu'], form: 3 });
    const decoded = decodeLobby(encodeLobby(lobby))!;
    expect(decoded.slots[2]).toMatchObject({ hero: 'ash', pokemon: 'squirtle', pokemonTeam: ['squirtle', 'gible', 'riolu'], form: 3 });
    expect(lobbyToMatch(decoded, 7).players[2].spawn.pokemonTeam).toEqual(['squirtle', 'gible', 'riolu']);
  });

  it('validates untrusted online loadouts without adding invalid species or duplicates', () => {
    const claim = sanitizeClaim({ name: 'ASH', hero: 'ash', pokemon: 'pikachu',
      pokemonTeam: ['pikachu', 'bad', {}, 'gible', 'pikachu', 'riolu'], look: {} });
    expect(claim).toMatchObject({ pokemon: 'pikachu', pokemonTeam: ['pikachu', 'gible', 'riolu'] });
    expect(sanitizeClaim({ name: 'GOKU', hero: 'goku', pokemonTeam: [...POKEMON_PARTNERS], look: {} })?.pokemonTeam).toBeUndefined();
  });

  it('roundtrips independent cooldowns, ball identities and selected species to online viewers', () => {
    const specs = [{ ...spec('ASH'), hero: 'ash', pokemon: 'charmander' as const,
      pokemonTeam: ['charmander', 'squirtle', 'froakie'] as const }, spec('RIVAL')];
    const settings = { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 };
    const world = new World(FLAT, specs, settings, 3), mirror = new World(FLAT, specs, settings, 3);
    world.fighters[0].trainer!.team[1].cooldown = 12;
    world.fighters[0].trainer!.team[2].stage = 2;
    world.fighters[0].active = 6;
    const frame = encodeWorld(world);
    expect(frame.fighters.slice(2)).toEqual([0, 0, 0]);
    applyWorld(mirror, frame);
    expect(mirror.fighters[0].inv.slice(4).map(ball => ball?.pokemon)).toEqual(['charmander', 'squirtle', 'froakie']);
    expect(mirror.fighters[0].trainer!.team[1].cooldown).toBe(12);
    expect(mirror.fighters[0].trainer!.team[2].stage).toBe(2);
    expect(mirror.fighters[0].active).toBe(6);
  });
});
