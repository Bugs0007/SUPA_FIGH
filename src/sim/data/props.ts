import type { ExplosionStats } from './weapons';

// Dynamic map props. Placed in maps with 'c' (crate), 'b' (barrel), 'g' (gas canister).

export type PropType = 'crate' | 'barrel' | 'gas' | 'tnt' | 'chandelier';

export interface PropDef {
  w: number;
  h: number;
  hp: number;
  /** pushes are divided by this */
  mass: number;
  explosion?: ExplosionStats;
  /** chance a broken crate drops a random weapon */
  drop?: number;
  /** seconds between "killed" and detonation (chain reactions ripple instead of popping at once) */
  fuse?: number;
  /** goes flying like a rocket while its fuse burns (gas canister) */
  rocket?: boolean;
  /** HP lost per second while touching fire */
  burnDps: number;
  /** hangs in place (no gravity, can't be pushed) until destroyed, then falls */
  anchored?: boolean;
  /** damage to fighters it lands on when thrown/falling (default CARRY.damage) */
  crush?: number;
  /** too heavy/awkward to lift */
  noCarry?: boolean;
}

export const PROPS: Record<PropType, PropDef> = {
  crate: { w: 14, h: 14, hp: 40, mass: 1, drop: 0.45, burnDps: 6 },
  barrel: {
    w: 12,
    h: 16,
    hp: 30,
    mass: 1.4,
    fuse: 0.12,
    burnDps: 9,
    explosion: { radius: 58, damage: 80, knock: 460, breakRadius: 32, fire: 4, shake: 0.85 },
  },
  gas: {
    w: 8,
    h: 13,
    hp: 14,
    mass: 0.6,
    fuse: 0.75,
    rocket: true,
    burnDps: 12,
    explosion: { radius: 38, damage: 45, knock: 320, breakRadius: 16, fire: 8, shake: 0.55 },
  },
  tnt: {
    w: 12,
    h: 12,
    hp: 20,
    mass: 1,
    fuse: 0.1,
    burnDps: 10,
    explosion: { radius: 52, damage: 75, knock: 440, breakRadius: 30, shake: 0.8 },
  },
  chandelier: { w: 28, h: 12, hp: 8, mass: 3, burnDps: 0, anchored: true, crush: 70, noCarry: true },
};
