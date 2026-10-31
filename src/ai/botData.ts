// Bot tuning tables. Balance bot behavior by editing data here, not code in bot.ts.

export type Difficulty = 'easy' | 'normal' | 'hard' | 'expert';

export interface DifficultyDef {
  /** seconds between decisions */
  think: number;
  /** seconds before reacting to a newly seen enemy / incoming projectile */
  reaction: number;
  /** random aim offset (radians, re-rolled per shot) */
  aimError: number;
  /** fire when the aim is within this many radians of the target */
  aimTolerance: number;
  /** chance to dodge a projectile that would hit */
  dodge: number;
  /** throw landing error (px) */
  throwError: number;
  /** chance per decision to use a throwable when it makes sense */
  throwChance: number;
  /** view distance (px) */
  sight: number;
  // ---- close fights (bot.ts: hero moves at every range, blocking, beating a guard, making space)
  /** chance per tick to start a hero move that fits right now */
  heroMove: number;
  /** chance to cancel the recovery of a late combo hit (3rd / finisher) into a hero move, decided once per swing */
  comboCancel: number;
  /** chance to raise the guard against an attack seen coming (decided once per attack) */
  block: number;
  /** seconds between seeing the attack and pressing the guard */
  blockReact: number;
  /** chance to time the guard as a perfect block when the hit's arrival can be predicted */
  parry: number;
  /** hero bots: chance to make space after a close exchange (and to run from a super charging next to them) */
  disengage: number;
  /** chance per tick to grab an enemy guarding in reach (throws beat the guard) */
  guardGrab: number;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyDef> = {
  easy: {
    think: 0.4, reaction: 0.45, aimError: 0.14, aimTolerance: 0.09, dodge: 0.05, throwError: 45, throwChance: 0.15, sight: 300,
    heroMove: 0.02, comboCancel: 0.1, block: 0.12, blockReact: 0.3, parry: 0, disengage: 0.2, guardGrab: 0.02,
  },
  normal: {
    think: 0.25, reaction: 0.28, aimError: 0.08, aimTolerance: 0.05, dodge: 0.25, throwError: 25, throwChance: 0.3, sight: 380,
    heroMove: 0.05, comboCancel: 0.3, block: 0.35, blockReact: 0.18, parry: 0.1, disengage: 0.4, guardGrab: 0.05,
  },
  hard: {
    think: 0.15, reaction: 0.16, aimError: 0.045, aimTolerance: 0.03, dodge: 0.5, throwError: 12, throwChance: 0.45, sight: 460,
    heroMove: 0.09, comboCancel: 0.55, block: 0.6, blockReact: 0.1, parry: 0.3, disengage: 0.6, guardGrab: 0.1,
  },
  expert: {
    think: 0.1, reaction: 0.08, aimError: 0.02, aimTolerance: 0.018, dodge: 0.8, throwError: 5, throwChance: 0.55, sight: 540,
    heroMove: 0.14, comboCancel: 0.75, block: 0.85, blockReact: 0.05, parry: 0.6, disengage: 0.75, guardGrab: 0.18,
  },
};

/**
 * Close fights, the same for every difficulty (the chances above scale how often each option is taken).
 * Distances in px, times in s.
 */
export const BOT_FIGHT = {
  /** an enemy this close in front (and about level) can start a combo on us any moment */
  meleeThreat: 34,
  level: 14,
  /** ... when it steps in faster than this (px/s) or is between combo hits; share of `block` used against such
   *  pressure (no attack started yet: the guard is a guess) */
  pressureSpeed: 30,
  pressure: 0.5,
  /** a Rasengan / Chidori aimed at us from this close is worth guarding (farther: it may stop short or be dodged) */
  dashThreat: 200,
  /** the longest guard, then it stays down at least `guardRest` */
  guardMax: 0.8,
  guardRest: 0.35,
  /** keep the guard up this long after the threat is over */
  guardLinger: 0.12,
  /** don't raise the guard with less meter than this (a break is coming): get away instead */
  guardLow: 25,
  /** a guarding enemy this close in front: no punching into it (grab it, use an ability, or wait) */
  guardWait: 44,
  /** a hero standing this close inside an enemy steps back when its Rasengan / Chidori is ready (room to dash) */
  overlap: 7,
  /** "close" for the exchange clock; after `exchange` s close up, maybe make space for `space` s */
  close: 36,
  exchange: [0.5, 1.4] as [number, number],
  space: [0.35, 0.75] as [number, number],
  /** stop backing off once this far away */
  spaceDist: 96,
  /** after making space: hero-move chance multiplier for `rangedWindow` s */
  rangedBoost: 4,
  rangedWindow: 0.9,
  /** hero-move chance multiplier against a guarding enemy, and with the super ready and an enemy within `close` */
  vsGuard: 3,
  closeSuper: 3,
  /** move weights when several fit: super, ability 1, ability 2 (the super x `vsGuardSuper` on a guard) */
  wSuper: 4,
  wBase: 3,
  wSecond: 2,
  vsGuardSuper: 2,
};

export interface Personality {
  name: string;
  /** desire to close in and fight (0..1) */
  aggression: number;
  /** desire to grab better gear (0..1) */
  greed: number;
  /** how early it flees from danger / heals (0..1) */
  caution: number;
  /** multiplier on preferred engagement distance */
  rangeBias: number;
  /** extra preference for melee weapons */
  meleeLove: number;
  /** multiplier on throwChance */
  throwLove: number;
}

export const PERSONALITIES: Personality[] = [
  { name: 'BRAWLER', aggression: 0.9, greed: 0.4, caution: 0.2, rangeBias: 0.8, meleeLove: 25, throwLove: 0.6 },
  { name: 'GUNNER', aggression: 0.65, greed: 0.7, caution: 0.4, rangeBias: 1, meleeLove: 0, throwLove: 1 },
  { name: 'SNIPER', aggression: 0.4, greed: 0.6, caution: 0.6, rangeBias: 1.5, meleeLove: -10, throwLove: 0.8 },
  { name: 'SCAVENGER', aggression: 0.5, greed: 1, caution: 0.5, rangeBias: 1.1, meleeLove: 5, throwLove: 1 },
  { name: 'MANIAC', aggression: 1, greed: 0.3, caution: 0, rangeBias: 0.9, meleeLove: 10, throwLove: 2 },
];

export type AiKind = 'melee' | 'gun' | 'explosive' | 'throw' | 'gadget' | 'powerup';

export interface WeaponAi {
  /** how much a bot wants it (0..100) */
  value: number;
  /** effective engagement distance band (px) */
  range: [number, number];
  kind: AiKind;
}

const melee = (value: number, reach = 20): WeaponAi => ({ value, range: [0, reach], kind: 'melee' });
const gun = (value: number, min: number, max: number): WeaponAi => ({ value, range: [min, max], kind: 'gun' });

export const WEAPON_AI: Record<string, WeaponAi> = {
  fists: melee(0, 16),
  knife: melee(20),
  machete: melee(30, 22),
  katana: melee(38, 24),
  bat: melee(28, 22),
  pipe: melee(26, 22),
  chair: melee(24, 22),
  sledge: melee(34, 24),
  pistol: gun(35, 0, 420),
  revolver: gun(45, 0, 460),
  uzi: gun(42, 0, 260),
  flaregun: gun(34, 40, 380),
  shotgun: gun(55, 0, 140),
  smg: gun(55, 0, 330),
  rifle: gun(62, 0, 520),
  sniper: gun(60, 90, 900),
  minigun: gun(70, 0, 380),
  flamer: gun(50, 0, 95),
  bazooka: { value: 65, range: [80, 600], kind: 'explosive' },
  grenade: { value: 40, range: [70, 240], kind: 'throw' },
  molotov: { value: 32, range: [60, 220], kind: 'throw' },
  c4: { value: 30, range: [60, 200], kind: 'throw' },
  mine: { value: 22, range: [20, 140], kind: 'throw' },
  medkit: { value: 30, range: [0, 0], kind: 'gadget' },
  jetpack: { value: 12, range: [0, 0], kind: 'gadget' },
  speed: { value: 30, range: [0, 0], kind: 'powerup' },
  strength: { value: 32, range: [0, 0], kind: 'powerup' },
  bullettime: { value: 45, range: [0, 0], kind: 'powerup' },
  // hero power-ups (M9): anyone wants them; the matching hero even more (bot.ts)
  powerorb: { value: 60, range: [0, 0], kind: 'powerup' },
};

export function weaponAi(id: string): WeaponAi {
  return WEAPON_AI[id] ?? { value: 10, range: [0, 300], kind: 'gun' };
}
