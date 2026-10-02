// Heroes and hero power-ups (M9). ALL hero/power numbers live here; looks/palettes live in
// art/heroArt.ts. Names are data, so the heroes can be renamed/re-skinned without code changes.
//
//   HeroDefinition     a selectable fighter (base stats + which power-up is "theirs")
//   PowerUpDefinition  a rare world pickup (item id, duration, the ability it grants)
//   AbilityDefinition  what a transformation changes: stat multipliers, a replacement fist combo /
//                      kick, and a special attack on the ABILITY button
// Any fighter can grab any power-up. The matching hero gets the full transformation; everyone else
// gets GENERIC_BOOST for a shorter time (D43). Runtime state ("TransformationState") lives on the
// Fighter: power, powerTime, powerMax, powerFull, specialCd, charge (see sim/hero.ts).

import type { ExplosionStats, MeleeHit } from './weapons';

export type SpecialProjectile = 'chakra' | 'ki';

export interface AbilitySpecial {
  /** sim behavior: a projectile, or a stretching punch (hitbox grows out from the shoulder) */
  kind: 'projectile' | 'stretch';
  /** kill-feed / HUD label */
  name: string;
  /** seconds before the special can be used again */
  cooldown: number;
  /** projectile specials */
  projectile?: {
    kind: SpecialProjectile;
    speed: number;
    damage: number;
    knock: number;
    range: number;
    /** hit radius (px) added around fighters/props */
    size: number;
    gravity?: number;
    explosion?: ExplosionStats;
  };
  /** hold the button to charge (ki blast): stats scale from 1x to maxScale over `time` seconds */
  charge?: { time: number; maxScale: number; minCooldown: number };
  /** stretch specials: reach (px past the body), extend/hold/retract times */
  stretch?: { range: number; out: number; hold: number; back: number; damage: number; knockX: number; knockY: number };
  /** seconds the fighter is locked after firing a projectile special */
  recover: number;
}

export interface AbilityDefinition {
  speedMul: number;
  /** melee + kick damage multiplier (fists, weapons, kicks) */
  damageMul: number;
  /** melee + kick knockback multiplier */
  knockMul: number;
  /** extra melee reach in px (all melee weapons) */
  reach: number;
  /** replaces the 3-hit fist combo while transformed (weapons keep their own combos) */
  combo?: MeleeHit[];
  kick?: MeleeHit;
  special?: AbilitySpecial;
}

export interface PowerUpDefinition {
  id: string;
  /** shown when transforming / in the HUD */
  name: string;
  /** WEAPONS item id of the pickup (data/weapons.ts, powerup kind 'hero') */
  item: string;
  /** hero that gets the full transformation */
  hero: string;
  /** full transformation seconds */
  duration: number;
  /** relative chance when the world spawns a hero power-up */
  weight: number;
  ability: AbilityDefinition;
  /** kill-feed label for the transformed fist combo */
  comboName: string;
}

export interface HeroDefinition {
  id: string;
  name: string;
  /** one line for the select screen */
  blurb: string;
  /** power-up id that fully transforms this hero */
  power: string;
  /** base stat multipliers (kept within a few % of the scrapyard fighter) */
  stats: { speed: number; hp: number };
}

/** Shadow clone strikes (Kurama combo hit 3): timings in seconds, offsets/range in px. */
export const CLONE = { offset: 13, delay: 0.08, active: 0.1, life: 0.38, range: 10, damage: 5, knockX: 200, knockY: -110 };

/** Everyone who grabs someone else's power-up gets this (aura in the power's color). */
export const GENERIC_BOOST: AbilityDefinition = { speedMul: 1.12, damageMul: 1.2, knockMul: 1.15, reach: 0 };
export const GENERIC_DURATION = 12;

/** Fist combo hit helper (fists timings by default). */
const hit = (p: Partial<MeleeHit> & Pick<MeleeHit, 'damage'>): MeleeHit => ({
  windup: 0.05,
  active: 0.06,
  recover: 0.13,
  range: 9,
  knockX: 60,
  knockY: 0,
  stun: 0.2,
  lunge: 45,
  ...p,
});

export const POWERS: Record<string, PowerUpDefinition> = {
  kurama: {
    id: 'kurama',
    name: 'KURAMA MODE',
    item: 'chakrascroll',
    hero: 'naruto',
    duration: 20,
    weight: 1,
    comboName: 'CHAKRA FIST',
    ability: {
      speedMul: 1.2,
      damageMul: 1.3,
      knockMul: 1.3,
      reach: 1,
      combo: [
        hit({ damage: 5 }),
        hit({ damage: 5 }),
        // third hit: shadow clones flash in beside him and strike too
        hit({ damage: 8, windup: 0.08, active: 0.08, recover: 0.26, range: 11, knockX: 240, knockY: -150, stun: 0.3, knockdown: true, lunge: 70, clones: 2, fx: 'chakra' }),
      ],
      special: {
        kind: 'projectile',
        name: 'CHAKRA BOMB',
        cooldown: 5,
        recover: 0.3,
        projectile: {
          kind: 'chakra',
          speed: 230,
          damage: 14,
          knock: 260,
          range: 280,
          size: 5,
          explosion: { radius: 34, damage: 22, knock: 380, breakRadius: 14, shake: 0.6 },
        },
      },
    },
  },
  gear2: {
    id: 'gear2',
    name: 'GEAR SECOND',
    item: 'strawtoken',
    hero: 'luffy',
    duration: 18,
    weight: 1,
    comboName: 'RUBBER FIST',
    ability: {
      speedMul: 1.3,
      damageMul: 1.15,
      knockMul: 1.25,
      reach: 4,
      // stretchy arms: longer reach, quicker recovery
      combo: [
        hit({ damage: 5, windup: 0.04, recover: 0.1, range: 22, stretch: true, fx: 'steam' }),
        hit({ damage: 5, windup: 0.04, recover: 0.1, range: 22, stretch: true, fx: 'steam' }),
        hit({ damage: 10, windup: 0.07, active: 0.08, recover: 0.22, range: 28, knockX: 260, knockY: -150, stun: 0.3, knockdown: true, lunge: 60, stretch: true, fx: 'steam' }),
      ],
      kick: { damage: 9, windup: 0.07, active: 0.1, recover: 0.22, range: 22, knockX: 290, knockY: -160, stun: 0.3, knockdown: true, lunge: 30, stretch: true },
      special: {
        kind: 'stretch',
        name: 'RUBBER BULLET',
        cooldown: 1.8,
        recover: 0.1,
        stretch: { range: 120, out: 0.13, hold: 0.05, back: 0.14, damage: 16, knockX: 360, knockY: -150 },
      },
    },
  },
  ssj: {
    id: 'ssj',
    name: 'SUPER SAIYAN',
    item: 'energycore',
    hero: 'goku',
    duration: 20,
    weight: 1,
    comboName: 'SAIYAN FIST',
    ability: {
      speedMul: 1.2,
      damageMul: 1.3,
      knockMul: 1.35,
      reach: 1,
      combo: [
        hit({ damage: 7, windup: 0.06, knockX: 90 }),
        hit({ damage: 4, windup: 0.03, active: 0.05, recover: 0.08 }),
        hit({ damage: 10, windup: 0.08, active: 0.08, recover: 0.24, range: 11, knockX: 260, knockY: -160, stun: 0.3, knockdown: true, lunge: 75, fx: 'ki', heavy: true }),
      ],
      kick: { damage: 12, windup: 0.08, active: 0.09, recover: 0.24, range: 14, knockX: 320, knockY: -170, stun: 0.3, knockdown: true, lunge: 40, fx: 'ki', heavy: true },
      special: {
        kind: 'projectile',
        name: 'KI BLAST',
        cooldown: 2.6,
        recover: 0.2,
        charge: { time: 1, maxScale: 3, minCooldown: 0.6 },
        projectile: { kind: 'ki', speed: 340, damage: 7, knock: 150, range: 300, size: 2 },
      },
    },
  },
};

export const HEROES: Record<string, HeroDefinition> = {
  naruto: {
    id: 'naruto',
    name: 'NARUTO',
    blurb: 'KURAMA MODE: SHADOW CLONE STRIKES + CHAKRA BOMB',
    power: 'kurama',
    stats: { speed: 1.03, hp: 100 },
  },
  luffy: {
    id: 'luffy',
    name: 'LUFFY',
    blurb: 'GEAR SECOND: STRETCHY REACH + RUBBER BULLET',
    power: 'gear2',
    stats: { speed: 1.0, hp: 105 },
  },
  goku: {
    id: 'goku',
    name: 'GOKU',
    blurb: 'SUPER SAIYAN: HEAVY HITS + CHARGED KI BLAST',
    power: 'ssj',
    stats: { speed: 1.0, hp: 100 },
  },
};

/** '' = the regular scrapyard fighter. Order of the select screen. */
export const HERO_ORDER = ['', 'naruto', 'luffy', 'goku'] as const;

export function heroDef(id: string | undefined): HeroDefinition | null {
  return id ? (HEROES[id] ?? null) : null;
}

export function powerDef(id: string): PowerUpDefinition | null {
  return POWERS[id] ?? null;
}

/** Power-up whose pickup item is `itemId`. */
export function powerForItem(itemId: string): PowerUpDefinition | null {
  for (const p of Object.values(POWERS)) if (p.item === itemId) return p;
  return null;
}

/** Labels for hero attacks in the kill feed (weapon ids used by sim/hero.ts). */
export function heroAttackLabel(id: string): string | null {
  for (const p of Object.values(POWERS)) {
    if (id === p.id) return p.comboName;
    if (id === p.id + ':special') return p.ability.special?.name ?? null;
  }
  if (id === 'clone') return 'SHADOW CLONE';
  return null;
}
