import { FIGHTER_H, FIGHTER_W } from '../constants';

export const POKEMON_PARTNERS = ['charmander', 'squirtle', 'bulbasaur', 'pikachu', 'froakie', 'treecko', 'riolu', 'gible'] as const;
export type PokemonSpecies = (typeof POKEMON_PARTNERS)[number];
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

const LINES: Record<PokemonSpecies, PokemonLine> = {
  charmander: {
    names: ['CHARMANDER', 'CHARMELEON', 'CHARIZARD', 'MEGA CHARIZARD X'],
    sizes: [[9, 14], [13, 25], [22, 40], [24, 44]],
    hp: [39, 60, 106, 146],
    shot: ['EMBER', 'FLAMETHROWER', 'FLAMETHROWER', 'BLUE FLAMETHROWER'],
    dash: ['SCRATCH', 'FLAME CHARGE', 'FLAME CHARGE', 'DRAGON CLAW'],
    ultimate: ['FIRE SPIN', 'FIRE SPIN', 'SEISMIC TOSS', 'BLAST BURN'],
    element: 'fire', flightStage: 2, final: 'mega',
  },
  squirtle: {
    names: ['SQUIRTLE', 'WARTORTLE', 'BLASTOISE', 'MEGA BLASTOISE'],
    sizes: [[11, 12], [15, 22], [26, 39], [28, 43]],
    hp: [44, 69, 114, 152],
    shot: ['WATER GUN', 'WATER PULSE', 'HYDRO PUMP', 'WATER PULSE'],
    dash: ['TACKLE', 'AQUA JET', 'AQUA JET', 'AQUA TAIL'],
    ultimate: ['WATER PULSE', 'AQUA TAIL', 'HYDRO CANNON', 'HYDRO CANNON'],
    element: 'water', final: 'mega',
  },
  bulbasaur: {
    names: ['BULBASAUR', 'IVYSAUR', 'VENUSAUR', 'MEGA VENUSAUR'], sizes: [[14, 14], [19, 22], [34, 38], [37, 44]], hp: [46, 72, 119, 155],
    shot: ['RAZOR LEAF', 'RAZOR LEAF', 'PETAL BLIZZARD', 'PETAL BLIZZARD'], dash: ['TACKLE', 'VINE WHIP', 'POWER WHIP', 'POWER WHIP'],
    ultimate: ['SEED BOMB', 'SEED BOMB', 'SOLAR BEAM', 'SOLAR BEAM'], element: 'grass', final: 'mega',
  },
  pikachu: {
    names: ['PIKACHU', 'RAICHU', 'MEGA RAICHU X'], sizes: [[9, 10], [13, 18], [17, 25]], hp: [34, 66, 130],
    shot: ['THUNDER SHOCK', 'THUNDERBOLT', 'THUNDERBOLT'], dash: ['QUICK ATTACK', 'VOLT TACKLE', 'VOLT TACKLE'],
    ultimate: ['THUNDER', 'THUNDER', 'THUNDER'], element: 'electric', final: 'mega',
  },
  froakie: {
    names: ['FROAKIE', 'FROGADIER', 'GRENINJA', 'ASH-GRENINJA'], sizes: [[9, 10], [12, 16], [16, 29], [17, 31]], hp: [35, 58, 98, 140],
    shot: ['BUBBLE', 'WATER PULSE', 'WATER SHURIKEN', 'WATER SHURIKEN'], dash: ['QUICK ATTACK', 'QUICK ATTACK', 'AERIAL ACE', 'NIGHT SLASH'],
    ultimate: ['WATER PULSE', 'SURF', 'GIANT WATER SHURIKEN', 'GIANT WATER SHURIKEN'], element: 'water', final: 'bond',
  },
  treecko: {
    names: ['TREECKO', 'GROVYLE', 'SCEPTILE', 'MEGA SCEPTILE'], sizes: [[10, 12], [13, 21], [22, 32], [23, 36]], hp: [38, 61, 102, 142],
    shot: ['BULLET SEED', 'BULLET SEED', 'ENERGY BALL', 'DRAGON PULSE'], dash: ['QUICK ATTACK', 'LEAF BLADE', 'LEAF BLADE', 'LEAF BLADE'],
    ultimate: ['MEGA DRAIN', 'LEAF STORM', 'FRENZY PLANT', 'FRENZY PLANT'], element: 'grass', final: 'mega',
  },
  riolu: {
    names: ['RIOLU', 'LUCARIO', 'MEGA LUCARIO'], sizes: [[10, 15], [14, 23], [16, 28]], hp: [42, 86, 138],
    shot: ['VACUUM WAVE', 'AURA SPHERE', 'AURA SPHERE'], dash: ['QUICK ATTACK', 'EXTREME SPEED', 'CLOSE COMBAT'],
    ultimate: ['FORCE PALM', 'FOCUS BLAST', 'FOCUS BLAST'], element: 'aura', final: 'mega',
  },
  gible: {
    names: ['GIBLE', 'GABITE', 'GARCHOMP', 'MEGA GARCHOMP'], sizes: [[13, 14], [16, 26], [24, 40], [28, 45]], hp: [46, 73, 119, 155],
    shot: ['DRAGON BREATH', 'DRAGON BREATH', 'DRAGON PULSE', 'DRAGON PULSE'], dash: ['TACKLE', 'DRAGON CLAW', 'DRAGON RUSH', 'DRAGON CLAW'],
    ultimate: ['DRACO METEOR', 'DRACO METEOR', 'DRACO METEOR', 'DRACO METEOR'], element: 'dragon', flightStage: 2, final: 'mega',
  },
};

export function pokemonSpecies(value: unknown): PokemonSpecies {
  return POKEMON_PARTNERS.find(species => species === value) ?? 'charmander';
}

export function pokemonStage(species: PokemonSpecies, stage: number) {
  const line = LINES[species];
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
  return { species, slot: -1, active: -1, stage: Math.max(0, Math.min(pokemonStage(species, 0).maxStage, Math.floor(stage))),
    cooldown: 0, shotCd: 0, dashCd: 0, ultimateCd: 0, blockHeld: 0, attackHeld: 0, mounted: false };
}

export function createPokemon(species: PokemonSpecies, stage = 0): PokemonState {
  return { species, stage, previousStage: stage, move: 'follow', age: 0, mounted: false, target: -1,
    engaged: -1, recalling: false, goalX: 0, goalY: 0, fired: false, holding: false,
    perched: false, stuckFor: 0, followDistance: -1 };
}
