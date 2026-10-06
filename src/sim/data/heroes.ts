// Heroes (M9, reworked in M11). ALL hero numbers live here; looks/palettes live in art/heroArt.ts.
// Names are data, so the heroes can be renamed/re-skinned without code changes (D49).
//
//   HeroDefinition   a selectable fighter: base stats, three moves and a ladder of transformation forms
//     base           ABILITY 1 (ABILITY button): always available
//     second         ABILITY 2 (the KICK button; heroes kick as the 4th hit of their combo instead)
//     super          both ability buttons together, only while transformed; scales with the form level
//     forms          level 1..N: every POWER ORB picked up raises the level (D58)
// Anyone can grab a power orb: heroes climb their form ladder, scrapyard fighters get GENERIC_BOOST.
// Runtime state lives on the Fighter: power ('' | 'hero' | 'boost'), powerLevel, formHp... (sim/hero.ts).

import type { MeleeHit } from './weapons';

/** ABILITY 1: Goku instant transmission, Naruto rasengan, Luffy gum-gum pistol (grapple). */
export interface BaseAbility {
  kind: 'blink' | 'rasengan' | 'pistol';
  name: string;
  /** short menu description */
  desc: string;
  /** seconds between uses */
  cooldown: number;
  /**
   * Rasengan: a gravity-free dash. A tap dashes for `time`; HOLDING the ability button keeps the dash going
   * (up to `maxTime`) until it hits someone, a wall, or the button is released.
   */
  dash?: { windup: number; time: number; maxTime: number; speed: number; recover: number; damage: number; knockX: number; knockY: number; stun: number; radius: number };
  /** Gum-Gum Pistol: a stretching arm that hits, grabs (walls, ceilings, platforms, ladders) and pulls / swings */
  stretch?: StretchStats;
  /** Instant transmission: teleport up to `range` px (8 directions); lands a short strike on arrival */
  blink?: BlinkStats;
}

export interface BlinkStats {
  range: number;
  minRange: number;
  /** locks onto the nearest enemy in the aimed direction within range + assist and appears behind them */
  assist: number;
  /** seconds of invulnerability around the jump */
  iframes: number;
  damage: number;
  knockX: number;
  knockY: number;
  stun: number;
  /** arrival strike box (px around the arrival point) */
  radius: number;
}

export interface StretchStats {
  range: number;
  out: number;
  hold: number;
  back: number;
  damage: number;
  knockX: number;
  knockY: number;
  upAngle: number;
  downAngle: number;
  rocketSpeed: number;
  rocketTime: number;
  /** fist radius (px) — the super's giant fist */
  fist?: number;
  /**
   * Grapple (Gum-Gum Pistol): the arm keeps stretching at `extendSpeed` px/s while the ability button is
   * held, up to `maxRange` (`range` is the length of a plain tap). Touching a wall / platform / ladder while
   * held pulls Luffy to it; a ceiling makes him swing from it. `retractSpeed` brings the arm back.
   */
  extendSpeed?: number;
  retractSpeed?: number;
  maxRange?: number;
  /** swing: sideways pump accel (px/s²), reel speed (px/s) and the longest swing (s) */
  swing?: { pump: number; reel: number; maxTime: number };
}

/** A charged energy beam (Kamehameha): grows out to `range`, holds, hits each fighter once. */
export interface BeamStats {
  /** min / max charge seconds (hold the button; released early = the min) */
  minCharge: number;
  maxCharge: number;
  range: number;
  grow: number;
  hold: number;
  /** half thickness px at no charge / full charge */
  width: [number, number];
  damage: [number, number];
  knock: [number, number];
  breakTiles?: boolean;
}

/** ABILITY 2 (KICK button for heroes). */
export interface SecondAbility {
  kind: 'beam' | 'clones' | 'gatling';
  name: string;
  desc: string;
  cooldown: number;
  beam?: BeamStats;
  /**
   * Shadow clones: real Naruto fighters that only know the Rasengan (they never make more clones).
   * `count` in the base form, +`perLevel` per form level up to the form before the last; the final form makes
   * `finalCount` clones that are exact copies of Naruto's CURRENT health, every other form makes clones with
   * `hpFrac` of his max health. The cooldown only starts once all clones are dead or recalled (ability 2 again).
   */
  clones?: { count: number; perLevel: number; finalCount: number; hpFrac: number };
  /** flurry of stretched punches: duration, seconds between punches, reach, per-hit damage, re-hit delay */
  gatling?: { time: number; every: number; range: number; damage: number; knockX: number; rehit: number; finalKnock: number };
}

/** The super move (both abilities at once, transformed only). */
export interface SuperAbility {
  kind: 'bomb' | 'fist' | 'beam';
  /** name per form level (index = level - 1) */
  names: string[];
  desc: string;
  cooldown: number;
  /** tailed beast bomb: wind-up, projectile speed, size and blast per level */
  bomb?: { windup: number; speed: number; size: number; sizePerLevel: number; damage: number; damagePerLevel: number; radius: number; radiusPerLevel: number };
  fist?: StretchStats & { fistPerLevel: number; damagePerLevel: number };
  beam?: BeamStats & { widthPerLevel: number; damagePerLevel: number };
}

/** One rung of a hero's transformation ladder. */
export interface HeroForm {
  name: string;
  speedMul: number;
  /** melee, kick and ability damage multiplier */
  damageMul: number;
  knockMul: number;
  /** extra melee reach (px) */
  reach: number;
  /** holding Up in the air flies (the final form of every hero) */
  flies?: boolean;
}

/** Stat changes while powered (a hero form, or the generic boost). */
export interface AbilityDefinition {
  speedMul: number;
  damageMul: number;
  knockMul: number;
  reach: number;
}

export interface HeroDefinition {
  id: string;
  name: string;
  /** one line for the select screen */
  blurb: string;
  /** base stat multipliers (kept within a few % of the scrapyard fighter) */
  stats: { speed: number; hp: number };
  base: BaseAbility;
  second: SecondAbility;
  super: SuperAbility;
  forms: HeroForm[];
  /** fist combo (punch, punch, punch, kick); the kick hit has `kick: true` */
  combo: MeleeHit[];
  /** can walk and run up walls (hold toward a wall + Up / Down) */
  wallWalk?: boolean;
  /** sprint pose with the arms trailing behind in the air: in the base form and at these form levels */
  sprintArmsBack?: { base: boolean; levels: number[] };
  /** kill-feed label of the combo */
  comboName: string;
}

/** Everyone who isn't a hero gets this from a power orb. */
export const GENERIC_BOOST: AbilityDefinition = { speedMul: 1.12, damageMul: 1.2, knockMul: 1.15, reach: 0 };
export const GENERIC_DURATION = 12;
/**
 * Transformations never time out: each form level adds a stacked "form health" layer of this many HP on
 * top of the normal health bar (level 3 = three layers). Damage hits the form layers first; when they are
 * gone the transformation wears off. Eating another orb adds a fresh layer (D61).
 */
export const FORM_HP = 30;
/** damage kinds that go straight through the form layers (the world, not a fight) */
export const FORM_BYPASS = ['fall', 'water', 'drain'] as const;
/** hold-to-fly (final forms of heroes whose `flies` is set): speed / acceleration */
export const HOLD_FLY = { speed: 120, accel: 1000, liftoff: 70 };
/** seconds both ability buttons may be apart and still count as "together" (super) */
export const SUPER_WINDOW = 0.1;
/** pickup item of the power orb (data/weapons.ts) */
export const POWER_ORB = 'powerorb';

/** Shadow clones: strike timings for the combo clones (kept from M9 for Kurama's finisher) */
export const CLONE = { offset: 13, delay: 0.08, active: 0.1, life: 0.38, range: 10, damage: 5, knockX: 200, knockY: -110 };

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

/** punch, punch, punch, KICK (knockdown finisher) */
const heroCombo = (fx: 'chakra' | 'steam' | 'ki', stretch = false): MeleeHit[] => [
  hit({ damage: 4, range: stretch ? 14 : 9, stretch, fx }),
  hit({ damage: 4, range: stretch ? 14 : 9, stretch, fx }),
  hit({ damage: 5, windup: 0.06, range: stretch ? 16 : 10, stretch, fx }),
  hit({ damage: 9, windup: 0.08, active: 0.09, recover: 0.24, range: stretch ? 18 : 13, knockX: 280, knockY: -150, stun: 0.3, knockdown: true, lunge: 40, kick: true, fx, heavy: true }),
];

export const HEROES: Record<string, HeroDefinition> = {
  naruto: {
    id: 'naruto',
    name: 'NARUTO',
    blurb: 'NINE-TAILS FORMS: 1 TAIL > 4 TAILS > 6 TAILS (DARK) > KURAMA MODE (GOLD)',
    stats: { speed: 1.03, hp: 100 },
    comboName: 'NINJA COMBO',
    combo: heroCombo('chakra'),
    wallWalk: true,
    sprintArmsBack: { base: true, levels: [4] },
    base: {
      kind: 'rasengan',
      name: 'RASENGAN',
      desc: 'SPIRAL STRIKE. HOLD THE BUTTON TO KEEP CHARGING UNTIL YOU HIT SOMEONE.',
      cooldown: 3.2,
      dash: { windup: 0.14, time: 0.3, maxTime: 1.6, speed: 330, recover: 0.16, damage: 13, knockX: 330, knockY: -190, stun: 0.35, radius: 7 },
    },
    second: {
      kind: 'clones',
      name: 'SHADOW CLONES',
      desc: 'REAL CLONES THAT FIGHT WITH RASENGAN. MORE IN EVERY FORM; AGAIN TO RECALL.',
      cooldown: 6,
      clones: { count: 2, perLevel: 1, finalCount: 2, hpFrac: 0.2 },
    },
    super: {
      kind: 'bomb',
      names: ['RASENSHURIKEN', 'TAILED BEAST BOMB', 'TAILED BEAST BOMB', 'KURAMA BIJUDAMA'],
      desc: 'A GIANT CHAKRA BOMB. BIGGER IN EVERY FORM.',
      cooldown: 8,
      bomb: { windup: 0.45, speed: 190, size: 5, sizePerLevel: 1.5, damage: 16, damagePerLevel: 7, radius: 30, radiusPerLevel: 9 },
    },
    forms: [
      { name: 'ONE-TAIL CLOAK', speedMul: 1.1, damageMul: 1.15, knockMul: 1.1, reach: 0 },
      { name: 'FOUR-TAIL CLOAK', speedMul: 1.15, damageMul: 1.3, knockMul: 1.2, reach: 1 },
      { name: 'SIX-TAIL FORM', speedMul: 1.2, damageMul: 1.45, knockMul: 1.3, reach: 1 },
      { name: 'KURAMA MODE', speedMul: 1.28, damageMul: 1.6, knockMul: 1.4, reach: 2, flies: true },
    ],
  },
  luffy: {
    id: 'luffy',
    name: 'LUFFY',
    blurb: 'GEAR SECOND > GEAR THIRD > GEAR FOURTH > GEAR FIFTH',
    stats: { speed: 1.0, hp: 105 },
    comboName: 'RUBBER COMBO',
    combo: heroCombo('steam', true),
    base: {
      kind: 'pistol',
      name: 'GUM-GUM PISTOL',
      desc: 'STRETCHING ARM (UP / DOWN TO AIM). HOLD TO KEEP REACHING; GRABS WALLS, PLATFORMS AND LADDERS AND PULLS YOU TO THEM; SWINGS FROM CEILINGS.',
      cooldown: 1.0,
      stretch: {
        range: 100,
        out: 0.12,
        hold: 0.05,
        back: 0.12,
        damage: 4.5,
        knockX: 220,
        knockY: -120,
        upAngle: -0.9,
        downAngle: 0.8,
        rocketSpeed: 460,
        rocketTime: 1.2,
        extendSpeed: 760,
        retractSpeed: 1100,
        maxRange: 340,
        swing: { pump: 520, reel: 60, maxTime: 4 },
      },
    },
    second: {
      kind: 'gatling',
      name: 'GUM-GUM GATLING',
      desc: 'A FLURRY OF STRETCHY PUNCHES IN FRONT OF HIM.',
      cooldown: 4,
      gatling: { time: 0.7, every: 0.06, range: 64, damage: 2, knockX: 50, rehit: 0.12, finalKnock: 280 },
    },
    super: {
      kind: 'fist',
      names: ['JET PISTOL', 'ELEPHANT GUN', 'KING KONG GUN', 'BAJRANG GUN'],
      desc: 'A GIANT FIST THAT FLATTENS EVERYTHING IN ITS PATH.',
      cooldown: 8,
      fist: { range: 150, out: 0.16, hold: 0.12, back: 0.14, damage: 18, knockX: 420, knockY: -200, upAngle: -0.5, downAngle: 0.5, rocketSpeed: 0, rocketTime: 0, fist: 5, fistPerLevel: 3, damagePerLevel: 8 },
    },
    forms: [
      { name: 'GEAR SECOND', speedMul: 1.25, damageMul: 1.15, knockMul: 1.15, reach: 3 },
      { name: 'GEAR THIRD', speedMul: 1.15, damageMul: 1.4, knockMul: 1.35, reach: 6 },
      { name: 'GEAR FOURTH', speedMul: 1.25, damageMul: 1.55, knockMul: 1.45, reach: 6 },
      { name: 'GEAR FIFTH', speedMul: 1.3, damageMul: 1.7, knockMul: 1.6, reach: 8, flies: true },
    ],
  },
  goku: {
    id: 'goku',
    name: 'GOKU',
    blurb: 'SUPER SAIYAN > SUPER SAIYAN 2 > SUPER SAIYAN 3 > SUPER SAIYAN BLUE (FLIES)',
    stats: { speed: 1.0, hp: 100 },
    comboName: 'SAIYAN COMBO',
    combo: heroCombo('ki'),
    base: {
      kind: 'blink',
      name: 'INSTANT TRANSMISSION',
      desc: 'TELEPORT IN THE DIRECTION YOU HOLD. LOCKS ONTO A FIGHTER IN THAT DIRECTION AND HITS ON ARRIVAL.',
      cooldown: 2.2,
      blink: { range: 120, minRange: 24, assist: 40, iframes: 0.18, damage: 7, knockX: 240, knockY: -150, stun: 0.3, radius: 14 },
    },
    second: {
      kind: 'beam',
      name: 'KAMEHAMEHA',
      desc: 'HOLD TO CHARGE, LET GO TO FIRE AN ENERGY BEAM.',
      cooldown: 3.5,
      beam: { minCharge: 0.25, maxCharge: 1.2, range: 230, grow: 0.12, hold: 0.28, width: [3, 6], damage: [8, 20], knock: [180, 360] },
    },
    super: {
      kind: 'beam',
      names: ['SUPER KAMEHAMEHA', 'SUPER KAMEHAMEHA', 'DRAGON FIST BEAM', 'GOD KAMEHAMEHA'],
      desc: 'A HUGE BEAM THAT BREAKS GLASS AND WOOD. BIGGER IN EVERY FORM.',
      cooldown: 8,
      beam: { minCharge: 0.5, maxCharge: 0.5, range: 360, grow: 0.15, hold: 0.45, width: [8, 8], damage: [24, 24], knock: [460, 460], breakTiles: true, widthPerLevel: 2, damagePerLevel: 9 },
    },
    forms: [
      { name: 'SUPER SAIYAN', speedMul: 1.15, damageMul: 1.25, knockMul: 1.25, reach: 1 },
      { name: 'SUPER SAIYAN 2', speedMul: 1.2, damageMul: 1.4, knockMul: 1.35, reach: 1 },
      { name: 'SUPER SAIYAN 3', speedMul: 1.2, damageMul: 1.55, knockMul: 1.45, reach: 2 },
      { name: 'SUPER SAIYAN BLUE', speedMul: 1.3, damageMul: 1.7, knockMul: 1.55, reach: 2, flies: true },
    ],
  },
};

/** '' = the regular scrapyard fighter. Order of the select screen. */
export const HERO_ORDER = ['', 'naruto', 'luffy', 'goku'] as const;

export function heroDef(id: string | undefined): HeroDefinition | null {
  return id ? (HEROES[id] ?? null) : null;
}

/** Highest form level of a hero. */
export function maxLevel(hero: string): number {
  return HEROES[hero]?.forms.length ?? 0;
}

/** Kill-feed weapon ids of hero moves: '<hero>:combo', 'rasengan', 'gumgum', 'clone', '<hero>:second', '<hero>:super'. */
export function heroAttackLabel(id: string): string | null {
  if (id === 'clone') return 'SHADOW CLONE';
  for (const h of Object.values(HEROES)) {
    if (id === baseWeaponId(h.base)) return h.base.name;
    if (id === h.id + ':combo') return h.comboName;
    if (id === h.id + ':second') return h.second.name;
    if (id === h.id + ':super') return h.super.names[h.super.names.length - 1];
  }
  return null;
}

/** Kill-credit weapon id of a base ability ('rasengan', 'gumgum', 'blink'). */
export function baseWeaponId(b: BaseAbility): string {
  return b.kind === 'pistol' ? 'gumgum' : b.kind;
}

/** Shadow clones a hero's ability 2 makes at a form level (0 = base form) and whether they copy full health. */
export function cloneSpec(hero: string, level: number): { count: number; full: boolean } | null {
  const h = HEROES[hero];
  const c = h?.second.clones;
  if (!h || !c) return null;
  if (level >= h.forms.length) return { count: c.finalCount, full: true };
  return { count: c.count + c.perLevel * level, full: false };
}

/** Most clones a hero can have out at once (the number of clone slots reserved in the world). */
export function maxClones(hero: string): number {
  const h = HEROES[hero];
  const c = h?.second.clones;
  if (!h || !c) return 0;
  let m = c.finalCount;
  for (let l = 0; l < h.forms.length; l++) m = Math.max(m, cloneSpec(hero, l)!.count);
  return m;
}
