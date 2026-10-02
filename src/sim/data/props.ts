import type { ExplosionStats } from './weapons';

// Dynamic map props. Placed in maps with 'c' (crate), 'b' (barrel), 'g' (gas canister).

export type PropType = 'crate' | 'barrel' | 'gas';

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
};
