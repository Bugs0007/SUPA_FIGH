import { FIGHTER_H, FIGHTER_W } from '../constants';

// Internal effect discriminants are retained while the playable catalog contains one approved line.
export type PokemonSpecies = 'charmander' | 'squirtle' | 'bulbasaur' | 'pikachu' | 'froakie' | 'treecko' | 'riolu' | 'gible';
export const POKEMON_PARTNERS: readonly PokemonSpecies[] = ['charmander'];
export type PokemonElement = 'fire' | 'water' | 'grass' | 'electric' | 'aura' | 'dragon';
export const POKE_BALL = 'pokeball';
export const TRAINER_HP = 40;
export type PokemonMove = 'release' | 'recall' | 'evolve' | 'follow' | 'punch' | 'kick' | 'shot' | 'dash' | 'guard' | 'ultimate' | 'mount' | 'carry' | 'ko';

export interface PokemonState {
  species: PokemonSpecies;
  stage: number;
  previousStage: number;
  move: PokemonMove;
  age: number;
  mounted: boolean;
  target: number;
  /** -1 follows Ash, -2 holds position, otherwise tracks the engaged fighter. */
  engaged: number;
  recalling: boolean;
  goalX: number;
  goalY: number;
  fired: boolean;
  holding: boolean;
  /** A small partner riding the trainer through terrain it cannot traverse. */
  perched: boolean;
  stuckFor: number;
  followDistance: number;
}

export interface TrainerState {
  species: PokemonSpecies;
  slot: number;
  active: number;
  stage: number;
  cooldown: number;
  shotCd: number;
  dashCd: number;
  ultimateCd: number;
  blockHeld: number;
  attackHeld: number;
  mounted: boolean;
}

export const POKEMON_TIMING = {
  release: 0.36, evolve: 0.78, ascend: 1.18, shot: 0.36, shotFire: 0.12, dash: 0.55,
  ultimate: 0.85, ultimateHit: 0.60, holdToMount: 0.7, knockout: 7.5,
  holdToRecall: 0.42, recall: 0.28, faint: 0.3,
} as const;

// Ash and the partner fight as a pair at base level. Later damage grows faster to
// compete with full roster forms, which gain a separate 30 HP layer per level.
export const POKEMON_DAMAGE = {
  shot: [10, 14, 21, 32],
  ultimate: [29, 37, 49, 65],
  punch: [8, 11, 15, 21],
  kick: [12, 18, 25, 35],
  seismicToss: 46,
} as const;

interface PokemonLine {
  names: readonly string[];
  sizes: readonly (readonly [number, number])[];
  hp: readonly number[];
  shot: readonly string[];
  dash: readonly string[];
  ultimate: readonly string[];
  element: PokemonElement;
  flightStage?: number;
  final: 'mega' | 'bond';
}

const CHARMANDER: PokemonLine = {
    names: ['CHARMANDER', 'CHARMELEON', 'CHARIZARD', 'MEGA CHARIZARD X'],
    sizes: [[9, 14], [13, 25], [22, 40], [24, 44]],
    hp: [39, 60, 106, 146],
    shot: ['EMBER', 'FLAMETHROWER', 'FLAMETHROWER', 'BLUE FLAMETHROWER'],
    dash: ['SCRATCH', 'FLAME CHARGE', 'FLAME CHARGE', 'DRAGON CLAW'],
    ultimate: ['FIRE SPIN', 'FIRE SPIN', 'SEISMIC TOSS', 'BLAST BURN'],
    element: 'fire', flightStage: 2, final: 'mega',
  };

export function pokemonSpecies(value: unknown): PokemonSpecies {
  return 'charmander';
}

export function pokemonStage(species: PokemonSpecies, stage: number) {
  const line = CHARMANDER;
  const maxStage = line.names.length - 1;
  const level = Math.max(0, Math.min(maxStage, Math.floor(stage)));
  const [width, height] = line.sizes[level];
  const flies = level >= (line.flightStage ?? Infinity);
  const damageTier = level === maxStage ? 3 : level;
  return {
    name: line.names[level], width, height, hp: line.hp[level], shot: line.shot[level],
    dash: line.dash[level], ultimate: line.ultimate[level], element: line.element, maxStage,
    flies, damageTier, trainerBonusHp: 0,
    // The ordinary final evolution precedes the Mega or Bond stage.
    rideable: flies || (level >= maxStage - 1 && width > FIGHTER_W && height > FIGHTER_H),
    special: level === maxStage ? line.final : undefined,
  };
}

export function pokemonEvolutionTime(species: PokemonSpecies, stage: number, previous: number): number {
  return stage > previous && pokemonStage(species, stage).special ? POKEMON_TIMING.ascend : POKEMON_TIMING.evolve;
}

export function createTrainer(species: PokemonSpecies, stage = 0): TrainerState {
  return { species: pokemonSpecies(species), slot: -1, active: -1, stage: Math.max(0, Math.min(pokemonStage(species, 0).maxStage, Math.floor(stage))),
    cooldown: 0, shotCd: 0, dashCd: 0, ultimateCd: 0, blockHeld: 0, attackHeld: 0, mounted: false };
}

export function createPokemon(species: PokemonSpecies, stage = 0): PokemonState {
  return { species: pokemonSpecies(species), stage, previousStage: stage, move: 'follow', age: 0, mounted: false, target: -1,
    engaged: -1, recalling: false, goalX: 0, goalY: 0, fired: false, holding: false,
    perched: false, stuckFor: 0, followDistance: -1 };
}
