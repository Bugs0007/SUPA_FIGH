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
}

export const DIFFICULTIES: Record<Difficulty, DifficultyDef> = {
  easy: { think: 0.4, reaction: 0.45, aimError: 0.14, aimTolerance: 0.09, dodge: 0.05, throwError: 45, throwChance: 0.15, sight: 300 },
  normal: { think: 0.25, reaction: 0.28, aimError: 0.08, aimTolerance: 0.05, dodge: 0.25, throwError: 25, throwChance: 0.3, sight: 380 },
  hard: { think: 0.15, reaction: 0.16, aimError: 0.045, aimTolerance: 0.03, dodge: 0.5, throwError: 12, throwChance: 0.45, sight: 460 },
  expert: { think: 0.1, reaction: 0.08, aimError: 0.02, aimTolerance: 0.018, dodge: 0.8, throwError: 5, throwChance: 0.55, sight: 540 },
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
};

export function weaponAi(id: string): WeaponAi {
  return WEAPON_AI[id] ?? { value: 10, range: [0, 300], kind: 'gun' };
}
