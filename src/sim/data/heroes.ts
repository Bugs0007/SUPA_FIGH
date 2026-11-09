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
import { BLACK_CLOVER_HEROES } from './blackCloverHeroes';
import { BLEACH_HEROES } from './bleachHeroes';
import { ONE_PIECE_HEROES } from './onePieceHeroes';
import { rosterSpecial } from './rosterSpecials';
import { VEGETA } from './vegeta';

export const HERO_ANIME = ['naruto', 'one-piece', 'dragon-ball', 'bleach', 'black-clover'] as const;
export type HeroAnime = (typeof HERO_ANIME)[number];

/** ABILITY 1: Goku instant transmission, Naruto rasengan, Luffy gum-gum pistol (grapple). */
export interface BaseAbility {
  kind: 'blink' | 'rasengan' | 'pistol';
  name: string;
  /** Distinct kill-credit id when a hero shares an existing move state machine. */
  weapon?: string;
  /** short menu description */
  desc: string;
  /** seconds between uses */
  cooldown: number;
  /**
   * Charges instead of one cooldown: `max` uses in a row; each used charge refills `recharge` seconds after the
   * previous one (the HUD bar is split into `max` segments). `cooldown` is then only the gap between presses.
   */
  charges?: { max: number; recharge: number };
  /**
   * Rasengan: a gravity-free dash. A tap dashes for `time`; HOLDING the ability button keeps the dash going
   * (up to `maxTime`) until it hits someone, a wall, or the button is released.
   */
  dash?: {
    windup: number;
    time: number;
    maxTime: number;
    speed: number;
    recover: number;
    damage: number;
    knockX: number;
    knockY: number;
    /** seconds the victim is stunned (a stun of a second or more holds them in place instead of knocking them down) */
    stun: number;
    radius: number;
    /**
     * Chidori: the shock arcs from the victim to the nearest other enemies, which are stunned too. The number of
     * fighters (`count` + `countPerLevel` per form, at most `maxCount`) and the distance grow with the form level;
     * `damageFrac` is the share of the hit's damage they take.
     */
    spread?: { count: number; countPerLevel: number; maxCount: number; radius: number; radiusPerLevel: number; damageFrac: number };
  };
  /** Gum-Gum Pistol: a stretching arm that hits, grabs (walls, ceilings, platforms, ladders) and pulls / swings */
  stretch?: StretchStats;
  /** Instant transmission: teleport up to `range` px (8 directions), behind a locked enemy without attacking. */
  blink?: BlinkStats;
}

export interface BlinkStats {
  /** Recovery after a passive teleport; attacking Vanish Strike has its own timing. */
  recover?: number;
  range: number;
  minRange: number;
  /** locks onto the nearest enemy in the aimed direction within range + assist and appears behind them */
  assist: number;
  /** seconds of invulnerability around the jump */
  iframes: number;
  /** Arrival attack stats for Vanish Strike; normal Instant Transmission does not attack. */
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
  /** a release within this many seconds is a tap: the hand snaps to the nearest anchor along the aim line */
  tap?: number;
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
  /** Damage shared when a beam catches multiple opposing teams; indexed by form, base = 0. */
  crowdDamageByLevel?: number[];
}

/** ABILITY 2 (KICK button for heroes). */
export interface SecondAbility {
  kind: 'beam' | 'clones' | 'gatling' | 'fireball';
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
  clones?: { count: number; perLevel: number; finalCount: number; hpFrac: number; baseDamageMul?: number; finalDamageMul?: number; controlMul?: number; /** Base-count per-clone damage; larger swarms share the same total budget. */ damageMul?: number };
  /** flurry of stretched punches: duration, seconds between punches, reach, per-hit damage, re-hit delay */
  gatling?: { time: number; every: number; range: number; damage: number; knockX: number; rehit: number; finalKnock: number; crowdDamageByLevel?: number[]; crowdDamageMul?: number };
  /** `radius` is the blast, `fire` burning patches it scatters (it also sets fighters in the blast alight for `ignite` s) */
  fireball?: { windup: number; recover: number; speed: number; range: number; size: number; sizePerLevel: number; damage: number; damagePerLevel: number; radius: number; radiusPerLevel: number; ignite: number; fire: number; firePerLevel: number; spareOwner?: boolean; pierce?: number };
  /** Higher forms replace the projectile with a line-of-sight eye jutsu. Range is in world pixels. */
  amaterasu?: {
    cooldown?: number;
    minLevel: number;
    /** range and number of enemies at `minLevel`; both grow by `...PerLevel` for every form above it */
    range: number;
    rangePerLevel: number;
    targets: number;
    targetsPerLevel: number;
    /** 0 = instant: the eye jutsu burns its targets on the press (like the shadow clones), then a short `recover` pose */
    windup: number;
    recover: number;
    damage: number;
    duration: number;
    dps: number;
    /** peripheral view: enemies in front within this angle (radians) above or below straight ahead can be burned */
    view: number;
    /** black flame patches left on the ground under each victim (they burn wood, crates and whoever steps in) */
    patches: number;
  };
}

/** The super move (both abilities at once, transformed only). */
export interface SuperAbility {
  kind: 'bomb' | 'fist' | 'beam';
  /** name per form level (index = level - 1) */
  names: string[];
  desc: string;
  cooldown: number;
  /**
   * Tailed beast bomb / arrow / Spirit Bomb: wind-up, projectile speed, size and an area blast per level. `damage`
   * (+ `damagePerLevel` per form above the first, x the form's damage multiplier) is the WHOLE hit: the projectile goes
   * off on the first enemy it touches and everyone inside `radius` takes one blast hit (SUPER_AREA falloff).
   */
  bomb?: { damageByLevel?: number[]; windup: number; speed: number; /** per-form projectile speed / reach (index = level - 1), else `speed` / `range` */ speedByLevel?: number[]; rangeByLevel?: number[]; size: number; sizePerLevel: number; damage: number; damagePerLevel: number; radius: number; radiusPerLevel: number; range?: number; kind?: 'chakra' | 'ki'; centered?: boolean };
  /** giant fist: hits everyone the arm sweeps through, then a shockwave of `shock` px (+ per form) where the fist lands */
  fist?: StretchStats & { fistPerLevel: number; damagePerLevel: number; fistGrowth?: number; rangeGrowth?: number; shock: number; shockPerLevel: number };
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
  /** flight mode (jump again after the double jump): the final form of every hero */
  flies?: boolean;
  /** a raised guard throws projectiles back at the shooter (Gear Fifth: the floor bulges like rubber) */
  reflects?: boolean;
  /** share of its damage a reflected shot keeps (default REFLECT.damageMul) */
  reflectDamage?: number;
  /** flight on a stamina meter: drains while flying (faster in a sprint rush), refills on the ground; no take-off below `minStart` */
  stamina?: { drain: number; rushDrain: number; minStart: number };
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
  anime: HeroAnime;
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
  /** holding Up in the air flies in every form, base included (Goku) */
  alwaysFlies?: boolean;
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
/**
 * Flight mode (Goku always, other heroes in their flying forms): press jump again after the double jump to take off;
 * Up / jump climbs, Down descends, nothing hovers, and a sprint (double-tap a direction) is the fast level "superman" glide.
 * Lands to end. `sprint` multiplies the cruise speed, `liftoff` is the pop upward on take-off.
 */
export const HOLD_FLY = { speed: 120, accel: 1000, liftoff: 70, sprint: 2 };
/** A reflected projectile keeps its speed but carries this fraction of its damage; the reflect costs this fraction of the normal guard drain. */
export const REFLECT = { damageMul: 0.1, guardCost: 0.5 };
/** Stamina meter of the metered flights (Gear Fourth): full at max, refilled this fast (per second) while standing on the ground. */
export const STAMINA = { max: 100, regen: 45 };
/** seconds both ability buttons may be apart and still count as "together" (super) */
export const SUPER_WINDOW = 0.1;
/**
 * Area of every super's blast (bombs and Luffy's fist shockwave): full damage within `core` x radius, then easing down
 * to `edge` x damage at the rim. Each fighter takes the blast once; the caster and his own clones never do.
 */
export const SUPER_AREA = { core: 0.55, edge: 0.5 };
/**
 * Hero ranged attacks meeting in the air (sim/clash.ts). Caliber = tier (super 2, ability 1) then form level: the
 * higher caliber overpowers the other and flies on; equal calibers CLASH in an area blast at the meeting point whose
 * radius is the larger of the two attacks' blasts x `radiusMul` and whose damage is the average of the two.
 * A beam's blast for this is `beamRadius` (+ per form level).
 */
export const CLASH = { radiusMul: 1.25, beamRadius: 36, beamRadiusPerLevel: 8, knock: 520, breakRadius: 20, shake: 0.9 };
/** pickup item of the power orb (data/weapons.ts) */
export const POWER_ORB = 'powerorb';

/** Shadow clones: strike timings for the combo clones (kept from M9 for Kurama's finisher) */
export const CLONE = { offset: 13, delay: 0.08, active: 0.1, life: 0.38, range: 10, damage: 5, knockX: 200, knockY: -110 };

/**
 * Rasengan / Chidori clash: two orbs meet when their centres are within the sum of their radii plus `slack` px
 * (or one orb reaches the other fighter while both aim at each other). An orb still forming in the windup counts
 * from `formedFrac` of the windup on, so it can be dashed into head-on.
 */
export const DASH_CLASH = { slack: 3, formedFrac: 0.5 };

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

/**
 * Where Susanoo's arrow leaves the bow (Sasuke's ultimate in forms 3 / 4), in whole pixels ahead of and above the
 * fighter's feet. The pixel-art Susanoo (art/avatarSprites.ts) is drawn around this point: its arrowhead sits on it.
 */
export const SUSANOO_LAUNCH: Record<3 | 4, { ahead: number; up: number }> = {
  3: { ahead: 88, up: 82 },
  4: { ahead: 93, up: 102 },
};
/** The shoulder the Susanoo's arms and bow swing about when the shot is aimed up or down. */
export const SUSANOO_PIVOT: Record<3 | 4, { ahead: number; up: number }> = {
  3: { ahead: 25, up: 91 },
  4: { ahead: 16, up: 102 },
};

/**
 * Where Naruto's final Bijudama leaves (Kurama mode): Kurama's open mouth, in whole pixels ahead of and above the
 * fighter's feet. The pixel-art Kurama (art/avatarSprites.ts) is drawn around it.
 */
export const KURAMA_LAUNCH = { ahead: 125, up: 87 };
export const KURAMA_NECK = { ahead: 53, up: 95 };
// Launch geometry for the final-form sprite sheet. The older raster offsets above still serve its art previews.
export const PERFECT_SUSANOO_LAUNCH = { ahead: 107, up: 109 };
export const PERFECT_SUSANOO_PIVOT = { ahead: -28, up: 110 };
export const FINAL_KURAMA_LAUNCH = { ahead: 124, up: 38 };
export const FINAL_KURAMA_NECK = { ahead: 54, up: 47 };
export const avatarAim = (angle:number):number => Math.round(angle*64)/64;
/**
 * The Perfect Susanoo aims like an archer: the upper body leans into the shot about the waist (a share of the aim,
 * capped), and the bow arm swings the rest about the front shoulder. The arrow always leaves along the full aim.
 */
export const PERFECT_SUSANOO_RIG = { waist: { ahead: 0, up: 80 }, shoulder: { ahead: -6, up: 112 }, lean: 0.38, maxLean: 0.36 };
/** the torso lean for a (quantized) aim angle */
export const susanooLean = (a:number):number => Math.max(-PERFECT_SUSANOO_RIG.maxLean, Math.min(PERFECT_SUSANOO_RIG.maxLean, a*PERFECT_SUSANOO_RIG.lean));
type Local = {ahead:number;up:number};
/** p turned by angle a (+ = down) about pivot o */
const turn=(p:Local,o:Local,a:number):Local=>{
  const c=Math.cos(a),s=Math.sin(a),x=p.ahead-o.ahead,y=o.up-p.up;
  return {ahead:o.ahead+x*c-y*s,up:o.up-x*s-y*c};
};
/** where the Perfect Susanoo's front shoulder is once the torso leans */
export function susanooShoulder(a:number):Local{
  const R=PERFECT_SUSANOO_RIG;
  return turn(R.shoulder,R.waist,susanooLean(a));
}
/** the Perfect Susanoo's arrow tip at aim a: the leaned shoulder, then the bow arm turned by the whole aim */
function susanooLaunch(a:number):Local{
  const s=susanooShoulder(a),arm=turn(PERFECT_SUSANOO_LAUNCH,PERFECT_SUSANOO_RIG.shoulder,a);
  return {ahead:s.ahead+arm.ahead-PERFECT_SUSANOO_RIG.shoulder.ahead,up:s.up+arm.up-PERFECT_SUSANOO_RIG.shoulder.up};
}
/** Facing-local muzzle position after a rigid body tilt or an articulated fox head turn. */
export function avatarLaunch(hero:string,level:number,angle:number):{ahead:number;up:number}{
  const a=avatarAim(angle);
  if(hero==='sasuke'&&level>=4)return susanooLaunch(a);
  const base=hero==='sasuke'?SUSANOO_LAUNCH[3]:FINAL_KURAMA_LAUNCH;
  const pivot=hero==='sasuke'?SUSANOO_PIVOT[3]:FINAL_KURAMA_NECK;
  return turn(base,pivot,a);
}
/** Solve the firing angle with the moving muzzle offset included. */
export function avatarTargetAngle(hero:string,level:number,x:number,y:number):number{
  if(hero==='sasuke'&&level>=4){
    // the muzzle swings with the aim (lean + arm), so solve for the angle whose shot line passes through the target:
    // bisect the signed miss (target's distance off the line), which grows steadily as the aim turns down
    const miss=(a:number)=>{const m=susanooLaunch(a);return (x-m.ahead)*Math.sin(a)-(y+m.up)*Math.cos(a);};
    let lo=-Math.PI/2,hi=Math.PI/2;
    if(miss(lo)>0)return avatarAim(lo);
    if(miss(hi)<0)return avatarAim(hi);
    for(let i=0;i<32;i++){const mid=(lo+hi)/2;if(miss(mid)<0)lo=mid;else hi=mid;}
    return avatarAim((lo+hi)/2);
  }
  const base=hero==='sasuke'?SUSANOO_LAUNCH[3]:FINAL_KURAMA_LAUNCH;
  const pivot=hero==='sasuke'?SUSANOO_PIVOT[3]:FINAL_KURAMA_NECK;
  const dx=x-pivot.ahead,dy=y+pivot.up,r=Math.hypot(dx,dy)||1;
  return avatarAim(Math.atan2(dy,dx)-Math.asin(Math.max(-1,Math.min(1,(pivot.up-base.up)/r))));
}
/** The final ultimates (Susanoo's arrow, the Bijudama) fly the whole map: nobody is out of their reach. */
export const ULT_MAP_RANGE = 4000;
export const SASUKE_ARROW = { speedMul: 1.8, lockRange: ULT_MAP_RANGE };

/**
 * How far a spirit reaches around the fighter's feet (px behind, ahead, and up), for the camera to keep all of it in
 * view while it is out. null = this hero's ultimate has no spirit at that form.
 */
export function spiritBounds(hero: string, level: number): { back: number; front: number; up: number } | null {
  if (hero === 'sasuke' && level >= 3) return level >= 4 ? { back: 231, front: 135, up: 205 } : { back: 100, front: 115, up: 175 };
  if (hero === 'naruto' && level >= 4) return { back: 214, front: 150, up: 226 };
  return null;
}

/**
 * Every hero ultimate that gathers (Sasuke's arrow, Naruto's Bijudama, Goku's Spirit Bomb) takes this long to load, so
 * the others get the same fair window to run, block or break it. (Luffy's giant fist is not a gathered ultimate.) The
 * spirits (Susanoo, Kurama) form around the fighter during it.
 */
export const ULT_WINDUP = 2.4;

type BombStats = NonNullable<SuperAbility['bomb']>;
/** Projectile speed of a hero's ultimate at a form level: per-form ladder, Sasuke's archer forms add the arrow multiplier. */
/** Radial melee supers release on the input tick. Launched supers telegraph their cast. */
export function bombWindup(b: BombStats): number {
  return b.centered ? 0 : b.windup;
}

export function bombSpeed(hero: string, b: BombStats, level: number): number {
  const ladder = b.speedByLevel;
  const base = ladder ? ladder[Math.max(0, Math.min(ladder.length, level) - 1)] : b.speed;
  return base * (hero === 'sasuke' && level >= 3 ? SASUKE_ARROW.speedMul : 1);
}
/** How far the ultimate flies at a form level (Sasuke's archer forms: the arrow's lock range). */
export function bombRange(hero: string, b: BombStats, level: number): number {
  if (hero === 'sasuke' && level >= 3) return SASUKE_ARROW.lockRange;
  const ladder = b.rangeByLevel;
  return ladder ? ladder[Math.max(0, Math.min(ladder.length, level) - 1)] : b.range ?? 320;
}
export const FORM_COMBO = { cooldown: 6, windup: 0.24, duration: 0.7, range: 360, damage: 22, radius: 30, speed: 520, cloneRange: 70, recallHold: 0.55 };
export const DRAGON_FIST = { level: 3, windup: 0.09, active: 0.34, duration: 0.64, range: 220, speed: 620, reach: 11, radius: 14 };
export const gokuFormComboName = (level: number) => level === DRAGON_FIST.level ? 'DRAGON FIST' : 'VANISH STRIKE';
export const CLONE_SLINGSHOT = { windup: 0.6, duration: 1, speed: 1040, turns: 1.5, swingRadius: 22 };
export const JET_BAZOOKA = { closeRange:42, targetRange:480, anchorRange:180, windup:.32, duration:1, speed:900, damage:30, kickDamage:40, kickKnock:700, kickLift:-120, kickStun:.4, hitRadius:24 };
export const KIRIN = { stun: 1.5, radius:18, radiusPerForm:6, scaleBase:.8, scalePerForm:.3, impactTime:.85, blastRadius:42, blastRadiusPerForm:10, shakeBase:.7, shakePerForm:.05 };
export const SASUKE_DRAGON_FIRE_LEVEL = 2;

export const HEROES: Record<string, HeroDefinition> = {
  sasuke: {
    id: 'sasuke', name: 'SASUKE', anime: 'naruto',
    blurb: 'SHARINGAN > CURSE MARK > MANGEKYO > RINNEGAN / PERFECT SUSANOO',
    stats: { speed: 1.04, hp: 108 }, wallWalk: true,
    sprintArmsBack: { base: true, levels: [1, 2, 3, 4] },
    comboName: 'UCHIHA COMBO', combo: heroCombo('ki'),
    base: {
      kind: 'rasengan', weapon: 'chidori', name: 'CHIDORI',
      desc: 'LIGHTNING PALM DASH. STUNS FOR 1 SECOND; SHOCKS UP TO TWO EXTRA ENEMIES. CHIDORI + PUNCH CALLS KIRIN.',
      cooldown: 0.4, charges: { max: 3, recharge: 2.8 },
      dash: { windup: 0.18, time: 0.25, maxTime: 0.85, speed: 720, recover: 0.18, damage: 18, knockX: 140, knockY: -60, stun: 1, radius: 6, spread: { count: 1, countPerLevel: 1, maxCount: 2, radius: 40, radiusPerLevel: 14, damageFrac: 0.5 } },
    },
    second: {
      kind: 'fireball', name: 'FIRE STYLE: FIREBALL',
      desc: 'BIG FIREBALL THAT BURNS THE ARENA. FROM MANGEKYO: AMATERASU BURNS 3 ENEMIES (4 AT THE TOP FORM). UP / DOWN TO AIM.',
      cooldown: 3,
      fireball: { windup: 0.18, recover: 0.2, speed: 330, range: 300, size: 9, sizePerLevel: 2.4, damage: 24, damagePerLevel: 2, radius: 44, radiusPerLevel: 6, ignite: 2.5, fire: 3, firePerLevel: 1, spareOwner: true },
      amaterasu: { minLevel: 3, cooldown: 4.2, range: 360, rangePerLevel: 60, targets: 3, targetsPerLevel: 1, windup: 0, recover: 0.18, damage: 8, duration: 3, dps: 4.5, view: 1.25, patches: 2 },
    },
    super: {
      kind: 'bomb', names: ['CHIDORI SHARP SPEAR', 'ONYX CHIDORI SPEAR', 'SUSANOO ARROW', "INDRA'S ARROW"],
      desc: 'AIM A LIGHTNING SPEAR. HIGHER FORMS SUMMON SUSANOO TO FIRE AN EXPLOSIVE ARROW.',
      cooldown: 9,
      bomb: { windup: ULT_WINDUP, speed: 430, size: 4, sizePerLevel: 1.2, damage: 37, damagePerLevel: 13, radius: 54, radiusPerLevel: 10, range: 550, kind: 'ki' },
    },
    forms: [
      { name: 'SHARINGAN', speedMul: 1.12, damageMul: 1.15, knockMul: 1.1, reach: 1 },
      { name: 'CURSE MARK', speedMul: 1.17, damageMul: 1.3, knockMul: 1.2, reach: 2 },
      { name: 'MANGEKYO SHARINGAN', speedMul: 1.2, damageMul: 1.35, knockMul: 1.3, reach: 14 },
      { name: 'RINNEGAN / PERFECT SUSANOO', speedMul: 1.25, damageMul: 1.5, knockMul: 1.4, reach: 22, flies: true },
    ],
  },
  naruto: {
    id: 'naruto', anime: 'naruto',
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
      desc: 'REAL CLONES THAT FIGHT WITH RASENGAN. HOLD TO DISMISS. TAP NEAR CLONES TO BE THROWN; FROM FORM 1: CLONES + PUNCH. HOLD UP TO TARGET A POWER ORB.',
      cooldown: 6,
      clones: { count: 2, perLevel: 1, finalCount: 2, hpFrac: 0.15, baseDamageMul: 0.4, damageMul: 0.5, finalDamageMul: 0.5, controlMul: 0.55 },
    },
    super: {
      kind: 'bomb',
      names: ['RASENSHURIKEN', 'TAILED BEAST BOMB', 'TAILED BEAST BOMB', 'KURAMA BIJUDAMA'],
      desc: 'A GIANT CHAKRA BOMB. BIGGER IN EVERY FORM.',
      cooldown: 8,
      bomb: { windup: ULT_WINDUP, speed: 380, speedByLevel: [380, 500, 630, 774], rangeByLevel: [320, 440, 580, ULT_MAP_RANGE], size: 5, sizePerLevel: 1.5, damage: 27, damagePerLevel: 13, radius: 56, radiusPerLevel: 10 },
    },
    forms: [
      { name: 'THREE-TAIL CLOAK', speedMul: 1.1, damageMul: 1.12, knockMul: 1.1, reach: 2 },
      { name: 'FOUR-TAIL CLOAK', speedMul: 1.15, damageMul: 1.15, knockMul: 1.2, reach: 4 },
      { name: 'SIX-TAIL FORM', speedMul: 1.2, damageMul: 1.45, knockMul: 1.3, reach: 10 },
      { name: 'KURAMA MODE', speedMul: 1.28, damageMul: 1.6, knockMul: 1.4, reach: 18, flies: true },
    ],
  },
  luffy: {
    id: 'luffy', anime: 'one-piece',
    name: 'LUFFY',
    blurb: 'GEAR SECOND > GEAR THIRD > GEAR FOURTH > GEAR FIFTH',
    stats: { speed: 1.05, hp: 105 },
    comboName: 'RUBBER COMBO',
    combo: heroCombo('steam', true),
    base: {
      kind: 'pistol',
      name: 'GUM-GUM PISTOL',
      desc: 'TAP TO SNAP TO THE NEAREST LADDER / WALL / PLATFORM. HOLD TO REACH PAST THEM: RELEASE GRABS THE LAST ANCHOR PASSED, FULL REACH THE FARTHEST. PRESS AGAIN TO CANCEL. UP / DOWN TO AIM.',
      cooldown: 0.25,
      charges: { max: 3, recharge: 2 },
      stretch: {
        range: 125,
        out: 0.12,
        hold: 0.05,
        back: 0.12,
        // a traversal tool, not a weapon: it shoves but never hurts
        damage: 0,
        knockX: 220,
        knockY: -120,
        upAngle: -0.9,
        downAngle: 0.8,
        rocketSpeed: 980,
        rocketTime: 1.2,
        extendSpeed: 2100,
        retractSpeed: 2800,
        maxRange: 560,
        // a tap (released within this many seconds) snaps to the nearest anchor on the aim line
        tap: 0.16,
        swing: { pump: 520, reel: 60, maxTime: 4 },
      },
    },
    second: {
      kind: 'gatling',
      name: 'GUM-GUM GATLING',
      desc: 'A LONG-REACH FLURRY THAT KEEPS ENEMIES CLOSE, THEN LAUNCHES THEM WITH A HEAVY FINISHER. REACH GROWS WITH EACH GEAR.',
      cooldown: 2.8,
      gatling: { time: 0.7, every: 0.06, range: 84, damage: 3.2, knockX: 25, rehit: 0.12, finalKnock: 420, crowdDamageMul: 0.75, crowdDamageByLevel: [0.5] },
    },
    super: {
      kind: 'fist',
      names: ['JET PISTOL', 'ELEPHANT GUN', 'KING KONG GUN', 'BAJRANG GUN'],
      desc: 'A GIANT FIST THAT FLATTENS EVERYTHING IN ITS PATH.',
      cooldown: 6.5,
      fist: { range: 150, out: 0.13, hold: 0.12, back: 0.14, damage: 28, knockX: 460, knockY: -200, upAngle: -0.5, downAngle: 0.5, rocketSpeed: 0, rocketTime: 0, fist: 5, fistPerLevel: 0, fistGrowth: 2, rangeGrowth: 1.6, damagePerLevel: 10, shock: 38, shockPerLevel: 12 },
    },
    forms: [
      { name: 'GEAR SECOND', speedMul: 1.25, damageMul: 1.3, knockMul: 1.15, reach: 4 },
      { name: 'GEAR THIRD', speedMul: 1.15, damageMul: 1.4, knockMul: 1.35, reach: 8 },
      { name: 'GEAR FOURTH', speedMul: 1.25, damageMul: 1.75, knockMul: 1.45, reach: 12, flies: true, reflects: true, reflectDamage: 0.25, stamina: { drain: 18, rushDrain: 40, minStart: 30 } },
      { name: 'GEAR FIFTH', speedMul: 1.3, damageMul: 1.95, knockMul: 1.6, reach: 16, flies: true, reflects: true },
    ],
  },
  goku: {
    id: 'goku', anime: 'dragon-ball',
    name: 'GOKU',
    blurb: 'SUPER SAIYAN > SUPER SAIYAN 2 > SUPER SAIYAN 3 > SUPER SAIYAN BLUE (ALWAYS FLIES)',
    stats: { speed: 1.0, hp: 100 },
    alwaysFlies: true,
    comboName: 'SAIYAN COMBO',
    combo: heroCombo('ki').map(h => ({ ...h, damage: h.damage * 1.8 })),
    base: {
      kind: 'blink',
      name: 'INSTANT TRANSMISSION',
      desc: 'TELEPORT IN THE DIRECTION YOU HOLD. APPEAR BEHIND A LOCKED ENEMY WITHOUT ATTACKING, THEN CHOOSE YOUR FOLLOW-UP.',
      cooldown: 2.2,
      blink: { range: 120, minRange: 24, assist: 40, recover: 0.08, iframes: 0.26, damage: 7, knockX: 240, knockY: -150, stun: 0.3, radius: 14 },
    },
    second: {
      kind: 'beam',
      name: 'KAMEHAMEHA',
      desc: 'HOLD TO CHARGE, LET GO TO FIRE AN ENERGY BEAM.',
      cooldown: 2.6,
      beam: { minCharge: 0.16, maxCharge: 0.8, range: 280, grow: 0.08, hold: 0.24, width: [5, 8], damage: [16, 30], knock: [180, 360], crowdDamageByLevel: [0.75] },
    },
    super: {
      kind: 'bomb',
      names: ['SPIRIT BOMB', 'SUPER SPIRIT BOMB', 'GIANT SPIRIT BOMB', 'UNIVERSAL SPIRIT BOMB'],
      desc: 'GATHER ENERGY OVERHEAD, THEN THROW A GIANT EXPLOSIVE SPIRIT BOMB. BIGGER IN EVERY FORM.',
      cooldown: 8,
      bomb: { damageByLevel: [32], windup: ULT_WINDUP, speed: 260, size: 18, sizePerLevel: 6, damage: 37, damagePerLevel: 13, radius: 60, radiusPerLevel: 12, range: 520, kind: 'ki' },
    },
    forms: [
      { name: 'SUPER SAIYAN', speedMul: 1.15, damageMul: 1.05, knockMul: 1.25, reach: 3 },
      { name: 'SUPER SAIYAN 2', speedMul: 1.2, damageMul: 1.15, knockMul: 1.35, reach: 5 },
      { name: 'SUPER SAIYAN 3', speedMul: 1.2, damageMul: 1.35, knockMul: 1.45, reach: 8 },
      { name: 'SUPER SAIYAN BLUE', speedMul: 1.3, damageMul: 1.5, knockMul: 1.55, reach: 12, flies: true },
    ],
  },
  vegeta: VEGETA,
  ...ONE_PIECE_HEROES,
  ...BLEACH_HEROES,
  ...BLACK_CLOVER_HEROES,
};

/** '' = the regular scrapyard fighter. Keep the original quick-cycle order. */
const LEGACY_ORDER = ['naruto', 'luffy', 'goku', 'sasuke'];
export const HERO_ORDER = ['', ...LEGACY_ORDER, ...Object.keys(HEROES).filter(id => !LEGACY_ORDER.includes(id))];
export const heroHasFormCombo = (id: string): boolean => LEGACY_ORDER.includes(id);

export function heroDef(id: string | undefined): HeroDefinition | null {
  return id && Object.hasOwn(HEROES, id) ? HEROES[id] : null;
}

/** Highest form level of a hero. */
export function maxLevel(hero: string): number {
  return HEROES[hero]?.forms.length ?? 0;
}

/** One source of truth for a super's actual reach, hit radius, damage and landing shockwave radius at the current form. */
export function superFistFor(hero: string, level: number): (StretchStats & { shock: number }) | null {
  const s = HEROES[hero]?.super.fist;
  if (!s) return null;
  const n = Math.max(0, Math.min(maxLevel(hero), level) - 1);
  return {
    ...s,
    range: Math.round(s.range * (s.rangeGrowth ?? 1) ** n),
    fist: s.fistGrowth ? (s.fist ?? 4) * s.fistGrowth ** n : (s.fist ?? 4) + s.fistPerLevel * n,
    damage: s.damage + s.damagePerLevel * n,
    shock: s.shock + s.shockPerLevel * n,
  };
}

/** The second-slot move shown for a particular form in the fighter viewer. */
export function secondMoveName(hero: string, level: number): string {
  const second = HEROES[hero]?.second;
  if (hero === 'sasuke') {
    if (level >= (second?.amaterasu?.minLevel ?? Infinity)) return 'AMATERASU';
    if (level === SASUKE_DRAGON_FIRE_LEVEL) return 'GREAT DRAGON FIRE';
  }
  return second?.name ?? 'KICK';
}

/** Kill-feed labels for hero weapon ids. */
export function heroAttackLabel(id: string): string | null {
  if (id.endsWith(':special')) return rosterSpecial(id === 'scrapper:special' ? '' : id.slice(0, -':special'.length))?.name ?? null;
  if (id === 'goku:dragonFist') return gokuFormComboName(DRAGON_FIST.level);
  if(id==='luffy:jetKick')return 'JET BAZOOKA KICK';
  if(id==='luffy:formCombo')return 'JET BAZOOKA';
  if (id === 'amaterasu') return 'AMATERASU';
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
  return b.weapon ?? (b.kind === 'pistol' ? 'gumgum' : b.kind);
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

/** Optional per-form overrides keep early super tuning independent of higher-form scaling. */
export function superBombDamage(b: NonNullable<SuperAbility['bomb']>, level: number): number {
  const n = Math.max(0, level - 1);
  return b.damageByLevel?.[n] ?? b.damage + b.damagePerLevel * n;
}

/** Chakra is divided among the configured number of copies, not multiplied by every extra clone. */
export function cloneDamageScale(hero: string, level: number): number {
  const c = HEROES[hero]?.second.clones, spec = cloneSpec(hero, level);
  if (!c || !spec) return 1;
  const damage = level === 0 ? c.baseDamageMul ?? c.damageMul ?? 1
    : spec.full ? c.finalDamageMul ?? c.damageMul ?? 1 : c.damageMul ?? 1;
  return damage * c.count / spec.count;
}
