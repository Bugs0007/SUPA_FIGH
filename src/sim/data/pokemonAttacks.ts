import { pokemonStage, type PokemonSpecies } from './pokemon';

export type PokemonAttackKind = 'bolt' | 'stream' | 'burst' | 'fan' | 'shuriken' | 'homing' | 'beam' | 'chain' | 'thunder' | 'meteor' | 'ground' | 'palm' | 'spiral';
export type PokemonAttackMode = 'shot' | 'ultimate';

/** Simulation and drawing share this clock. Damage is a budget for the whole cast. */
export interface PokemonAttackProfile {
  readonly kind: PokemonAttackKind;
  readonly windup: number;
  readonly active: number;
  readonly recovery: number;
  readonly pulses: number;
  readonly interval: number;
  readonly range: number;
  readonly speed: number;
  readonly size: number;
  readonly width?: number;
  readonly radius?: number;
  /** Total fan angle in radians, not a separate full-damage shot. */
  readonly spread?: number;
  readonly count?: number;
  readonly chain?: number;
  readonly chainRange?: number;
  readonly homing?: number;
  readonly pierce?: number;
  readonly ignite?: number;
  readonly gravity?: number;
  readonly drain?: number;
}

function attack(kind: PokemonAttackKind, p: Partial<Omit<PokemonAttackProfile, 'kind'>>): PokemonAttackProfile {
  const pulses = p.pulses ?? 1;
  const interval = p.interval ?? (pulses > 1 ? (p.active ?? 0.03) / (pulses - 1) : 0);
  return Object.freeze({ windup: 0.15, active: 0.03, recovery: 0.22, pulses, interval,
    range: 360, speed: 340, size: 4, ...p, kind });
}

const SHOTS: Record<PokemonSpecies, readonly PokemonAttackProfile[]> = {
  charmander: [
    attack('bolt', { windup: 0.10, speed: 360, size: 3, range: 330, ignite: 0.3 }),
    attack('stream', { windup: 0.15, active: 0.30, pulses: 6, range: 260, width: 7, ignite: 0.4, recovery: 0.16 }),
    attack('stream', { windup: 0.20, active: 0.36, pulses: 7, range: 320, width: 10, ignite: 0.5, recovery: 0.18 }),
    attack('stream', { windup: 0.22, active: 0.42, pulses: 8, range: 355, width: 13, ignite: 0.6, recovery: 0.18 }),
  ],
  squirtle: [
    attack('stream', { windup: 0.10, active: 0.21, pulses: 4, range: 245, width: 4, recovery: 0.18 }),
    attack('bolt', { windup: 0.16, speed: 300, size: 6, radius: 14 }),
    attack('stream', { windup: 0.20, active: 0.28, pulses: 5, range: 350, width: 7, recovery: 0.18 }),
    attack('bolt', { windup: 0.24, speed: 320, range: 420, size: 9, radius: 20, recovery: 0.30 }),
  ],
  bulbasaur: [0, 1, 2, 3].map(stage => attack('fan', {
    windup: 0.12 + stage * 0.025, count: 3 + stage * 2, spread: 0.24 + stage * 0.13,
    speed: 330, range: 360 + stage * 15, size: 3 + stage * 0.5, pierce: stage >= 2 ? 1 : 0,
  })),
  pikachu: [0, 1, 2].map(stage => attack('chain', {
    windup: 0.10 + stage * 0.05, active: 0.06, range: 170 + stage * 50,
    size: 4 + stage * 2, chain: stage, chainRange: 80 + stage * 20, recovery: 0.20,
  })),
  froakie: [
    attack('burst', { windup: 0.10, active: 0.14, pulses: 3, interval: 0.07, speed: 200, range: 280, size: 4, gravity: -20, recovery: 0.18 }),
    attack('bolt', { windup: 0.14, speed: 330, size: 6, radius: 12, recovery: 0.23 }),
    attack('shuriken', { windup: 0.14, active: 0.11, pulses: 3, interval: 0.055, speed: 410, range: 380, size: 5, pierce: 1 }),
    attack('shuriken', { windup: 0.18, active: 0.22, pulses: 5, interval: 0.055, speed: 440, range: 420, size: 6, pierce: 1 }),
  ],
  treecko: [
    attack('burst', { windup: 0.09, active: 0.11, pulses: 3, interval: 0.055, speed: 430, size: 3, range: 330, recovery: 0.15 }),
    attack('burst', { windup: 0.12, active: 0.18, pulses: 5, interval: 0.045, speed: 450, size: 3, range: 360, recovery: 0.15 }),
    attack('bolt', { windup: 0.23, speed: 270, size: 8, radius: 20, range: 420, recovery: 0.26 }),
    attack('bolt', { windup: 0.26, speed: 390, size: 11, radius: 24, range: 450, recovery: 0.27 }),
  ],
  riolu: [
    attack('palm', { windup: 0.10, active: 0.04, range: 105, width: 12, recovery: 0.18 }),
    attack('homing', { windup: 0.22, speed: 250, size: 7, radius: 12, range: 430, homing: 1.7, recovery: 0.30 }),
    attack('homing', { windup: 0.27, speed: 275, size: 10, radius: 18, range: 480, homing: 2.0, recovery: 0.30 }),
  ],
  gible: [
    attack('stream', { windup: 0.12, active: 0.24, pulses: 5, range: 180, width: 8, recovery: 0.20 }),
    attack('stream', { windup: 0.16, active: 0.30, pulses: 6, range: 230, width: 10, recovery: 0.20 }),
    attack('bolt', { windup: 0.22, speed: 380, size: 9, radius: 18, range: 430, recovery: 0.30 }),
    attack('bolt', { windup: 0.28, speed: 400, size: 12, radius: 24, range: 460, recovery: 0.30 }),
  ],
};

const ULTIMATES: Record<PokemonSpecies, readonly PokemonAttackProfile[]> = {
  charmander: [
    attack('spiral', { windup: 0.32, speed: 280, size: 8, radius: 24, range: 400, ignite: 0.5, recovery: 0.28 }),
    attack('spiral', { windup: 0.38, speed: 300, size: 10, radius: 30, range: 420, ignite: 0.5, recovery: 0.28 }),
    // Seismic Toss is an existing physical grab/flight/impact sequence, not a projectile.
    attack('palm', { windup: 0.60, active: 0.25, range: 75, width: 24, recovery: 0 }),
    attack('ground', { windup: 0.55, active: 0.36, pulses: 5, interval: 0.09, range: 300, radius: 27, width: 18, ignite: 0.6, recovery: 0.30 }),
  ],
  squirtle: [
    attack('bolt', { windup: 0.30, speed: 310, size: 10, radius: 28, range: 400, recovery: 0.30 }),
    attack('palm', { windup: 0.14, range: 85, width: 23, recovery: 0.28 }),
    attack('beam', { windup: 0.55, active: 0.24, pulses: 4, interval: 0.08, range: 440, width: 11, recovery: 0.30 }),
    attack('beam', { windup: 0.62, active: 0.32, pulses: 5, interval: 0.08, range: 490, width: 15, recovery: 0.30 }),
  ],
  bulbasaur: [
    attack('bolt', { windup: 0.35, speed: 280, gravity: 130, size: 9, radius: 28, recovery: 0.30 }),
    attack('bolt', { windup: 0.42, speed: 300, gravity: 130, size: 11, radius: 34, recovery: 0.30 }),
    attack('beam', { windup: 0.55, active: 0.24, pulses: 5, interval: 0.06, range: 480, width: 9, recovery: 0.30 }),
    attack('beam', { windup: 0.65, active: 0.32, pulses: 5, interval: 0.08, range: 520, width: 13, recovery: 0.30 }),
  ],
  pikachu: [0, 1, 2].map(stage => attack('thunder', {
    windup: 0.42 + stage * 0.09, active: stage * 0.12 + 0.04, pulses: stage + 1,
    interval: 0.12, radius: 20 + stage * 8, range: 440, size: 8 + stage * 3, recovery: 0.28,
  })),
  froakie: [
    attack('bolt', { windup: 0.28, speed: 290, size: 10, radius: 26, range: 400 }),
    attack('ground', { windup: 0.40, active: 0.30, pulses: 4, interval: 0.10, range: 240, width: 25, radius: 30, recovery: 0.28 }),
    attack('shuriken', { windup: 0.45, speed: 330, size: 13, pierce: 2, range: 460, recovery: 0.30 }),
    attack('shuriken', { windup: 0.55, active: 0.18, pulses: 3, interval: 0.09, speed: 360, size: 14, pierce: 2, range: 480, recovery: 0.30 }),
  ],
  treecko: [
    attack('palm', { windup: 0.16, active: 0.16, pulses: 3, interval: 0.08, range: 95, width: 14, drain: 0.30, recovery: 0.24 }),
    attack('fan', { windup: 0.35, active: 0.20, pulses: 3, interval: 0.10, count: 3, spread: 0.55, speed: 370, range: 420, size: 5, pierce: 1, recovery: 0.28 }),
    attack('ground', { windup: 0.48, active: 0.27, pulses: 4, interval: 0.09, range: 260, radius: 22, width: 21, recovery: 0.28 }),
    attack('ground', { windup: 0.55, active: 0.36, pulses: 5, interval: 0.09, range: 310, radius: 28, width: 25, recovery: 0.28 }),
  ],
  riolu: [
    attack('palm', { windup: 0.12, active: 0.06, range: 68, width: 19, recovery: 0.34 }),
    attack('homing', { windup: 0.45, speed: 285, size: 14, radius: 28, range: 480, homing: 1.1, recovery: 0.30 }),
    attack('homing', { windup: 0.55, speed: 300, size: 17, radius: 34, range: 500, homing: 1.3, recovery: 0.30 }),
  ],
  gible: [0, 1, 2, 3].map(stage => attack('meteor', {
    windup: 0.45 + stage * 0.055, active: 0.18 + stage * 0.09, pulses: 3 + stage,
    interval: 0.09, speed: 400, size: 7 + stage, radius: 28 + stage * 3,
    range: 440, spread: 80 + stage * 20, recovery: 0.30,
  })),
};

export function pokemonAttack(species: PokemonSpecies, stage: number, mode: PokemonAttackMode): PokemonAttackProfile {
  const line = (mode === 'shot' ? SHOTS : ULTIMATES)[species];
  return line[Math.max(0, Math.min(line.length - 1, Math.floor(stage)))];
}

export function pokemonAttackDuration(profile: PokemonAttackProfile): number {
  return profile.windup + Math.max(profile.active, (profile.pulses - 1) * profile.interval) + profile.recovery;
}

/** Cast-frame emitters measured from the accepted body rigs; no art imports enter the sim. */
const EMISSION: Record<PokemonSpecies, readonly (readonly [number, number])[]> = {
  charmander: [[10, -9], [12, -18], [36, -32], [45, -40]],
  squirtle: [[8, -9], [11, -13], [14, -42], [32, -54]],
  bulbasaur: [[11, -3], [15, -5], [4, -33], [4, -39]],
  pikachu: [[4, -5], [5, -12], [7, -16]],
  froakie: [[8, -8], [9, -14], [25, -21], [28, -24]],
  treecko: [[12, -10], [13, -16], [21, -27], [24, -32]],
  riolu: [[16, -7], [19, -15], [23, -18]],
  gible: [[14, -7], [22, -19], [26, -30], [31, -36]],
};

export function pokemonEmission(species: PokemonSpecies, stage: number): readonly [number, number] {
  return EMISSION[species][Math.max(0, Math.min(EMISSION[species].length - 1, Math.floor(stage)))];
}

export interface PokemonMeleeProfile {
  readonly windup: number;
  readonly recovery: number;
  readonly reach: number;
  readonly hits: number;
  readonly interval: number;
  readonly knockX: number;
  readonly knockY: number;
  readonly stun: number;
}

/** Distinct contact rhythms; the caller divides the existing melee damage budget by hits. */
export function pokemonMelee(species: PokemonSpecies, stage: number, heavy: boolean): PokemonMeleeProfile {
  const info = pokemonStage(species, stage);
  const vines = species === 'bulbasaur' && stage > 0;
  const blades = species === 'treecko' && stage > 0;
  const flurry = heavy && ((species === 'riolu' && stage > 0) || (species === 'froakie' && stage > 1));
  const hits = flurry ? (species === 'riolu' ? 3 : 2) : 1;
  return {
    windup: vines ? 0.16 : blades ? 0.09 : species === 'pikachu' ? 0.07 : heavy ? 0.13 : 0.10,
    recovery: flurry ? 0.18 : heavy ? 0.26 : 0.20,
    reach: vines ? 24 + stage * 8 : blades ? 15 + stage * 2 : Math.max(9, info.width * 0.25),
    hits, interval: flurry ? 0.085 : 0,
    knockX: heavy ? (species === 'squirtle' ? 165 : 125) : 70,
    knockY: heavy ? (species === 'gible' ? -85 : -48) : -20,
    stun: heavy ? 0.16 : 0.10,
  };
}
