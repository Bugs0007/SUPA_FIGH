// ALL weapon stats live in this file. Balance the game by editing numbers here.
// Units: damage in HP (fighters have 100), speeds px/s, times seconds, angles radians.

export const SLOT = { MELEE: 0, SIDEARM: 1, HEAVY: 2, THROWABLE: 3, GADGET: 4 } as const;
export const SLOT_NAMES = ['MELEE', 'SIDEARM', 'HEAVY', 'THROWABLE', 'GADGET'] as const;

export type HoldStyle = 'fist' | 'melee' | 'pistol' | 'rifle' | 'throw' | 'gadget';
export type ProjectileKind = 'bullet' | 'pellet' | 'sniper';

export interface GunStats {
  damage: number;
  /** shots per second */
  fireRate: number;
  /** keeps firing while attack is held; otherwise fires on release */
  auto: boolean;
  pellets: number;
  /** max random deviation per pellet (rad) */
  spread: number;
  bulletSpeed: number;
  /** px travelled before the bullet disappears */
  range: number;
  /** damage multiplier reached at max range (1 = no falloff) */
  falloff: number;
  /** rounds in a freshly spawned gun (no reloads — scavenge more) */
  ammo: number;
  /** shooter pushback px/s (in the air this also pushes vertically) */
  recoil: number;
  /** target push px/s per projectile */
  knockback: number;
  projectile: ProjectileKind;
  ricochet: boolean;
  /** how many fighters a projectile passes through */
  pierce: number;
  laser?: boolean;
  /** camera shake trauma added per shot (0..1 scale, render only) */
  shake: number;
  /** multiplier on run speed while this weapon is active */
  moveSpeedMul?: number;
}

export interface MeleeHit {
  damage: number;
  windup: number;
  active: number;
  recover: number;
  /** reach in front of the body edge */
  range: number;
  knockX: number;
  knockY: number;
  /** victim flinch time (s) */
  stun: number;
  knockdown?: boolean;
  /** forward velocity at swing start (ground) */
  lunge?: number;
  /** render: arm swing arc (radians, local space) */
  arcFrom?: number;
  arcTo?: number;
}

export interface MeleeStats {
  combo: MeleeHit[];
  /** hits before the weapon breaks (Infinity = never) */
  durability: number;
}

export interface WeaponDef {
  id: string;
  name: string;
  slot: number;
  hold: HoldStyle;
  /** relative chance at map weapon spawns (0 = never spawns) */
  spawnWeight: number;
  gun?: GunStats;
  melee?: MeleeStats;
  /** muzzle offset from the grip, weapon-local px (x along barrel, y down) */
  muzzle?: [number, number];
  casing?: boolean;
}

// ---------------------------------------------------------------- fists & kicks

export const FISTS: WeaponDef = {
  id: 'fists',
  name: 'FISTS',
  slot: SLOT.MELEE,
  hold: 'fist',
  spawnWeight: 0,
  melee: {
    durability: Infinity,
    combo: [
      { damage: 6, windup: 0.05, active: 0.06, recover: 0.13, range: 9, knockX: 55, knockY: 0, stun: 0.2, lunge: 45 },
      { damage: 6, windup: 0.05, active: 0.06, recover: 0.13, range: 9, knockX: 55, knockY: 0, stun: 0.2, lunge: 45 },
      {
        damage: 11,
        windup: 0.09,
        active: 0.07,
        recover: 0.26,
        range: 10,
        knockX: 230,
        knockY: -140,
        stun: 0.3,
        knockdown: true,
        lunge: 70,
      },
    ],
  },
};

export const KICK: MeleeHit = {
  damage: 9,
  windup: 0.08,
  active: 0.09,
  recover: 0.24,
  range: 13,
  knockX: 270,
  knockY: -150,
  stun: 0.3,
  knockdown: true,
  lunge: 30,
};

export const AIR_KICK: MeleeHit = {
  damage: 11,
  windup: 0.05,
  active: 0.42,
  recover: 0.12,
  range: 11,
  knockX: 290,
  knockY: -120,
  stun: 0.3,
  knockdown: true,
};

export const KICK_COOLDOWN = 0.55;

/** Grab/throw numbers */
export const GRAB = {
  throwDamage: 4,
  kneeDamage: 5,
  maxKnees: 3,
  /** damage to a fighter hit by a thrown body */
  bodyslamDamage: 9,
  /** thrown body hitting a wall faster than this takes damage */
  wallSplatSpeed: 210,
  wallSplatMul: 0.07,
  struggleToEscape: 7,
};

/** A tossed weapon that hits someone */
export const TOSS = { speed: 300, damage: 9, knockX: 140, knockY: -70, stun: 0.25 };

// ---------------------------------------------------------------- weapons

export const WEAPONS: Record<string, WeaponDef> = {
  pistol: {
    id: 'pistol',
    name: 'PISTOL',
    slot: SLOT.SIDEARM,
    hold: 'pistol',
    spawnWeight: 10,
    muzzle: [8, -2],
    casing: true,
    gun: {
      damage: 15,
      fireRate: 4.5,
      auto: false,
      pellets: 1,
      spread: 0.02,
      bulletSpeed: 1000,
      range: 700,
      falloff: 0.75,
      ammo: 14,
      recoil: 20,
      knockback: 45,
      projectile: 'bullet',
      ricochet: true,
      pierce: 0,
      shake: 0.12,
    },
  },
  shotgun: {
    id: 'shotgun',
    name: 'SHOTGUN',
    slot: SLOT.HEAVY,
    hold: 'rifle',
    spawnWeight: 7,
    muzzle: [13, -2],
    casing: true,
    gun: {
      damage: 8,
      fireRate: 1.25,
      auto: false,
      pellets: 8,
      spread: 0.13,
      bulletSpeed: 820,
      range: 250,
      falloff: 0.3,
      ammo: 6,
      recoil: 150,
      knockback: 38,
      projectile: 'pellet',
      ricochet: false,
      pierce: 0,
      shake: 0.35,
    },
  },
};

WEAPONS.fists = FISTS;

export function weaponDef(id: string): WeaponDef {
  return WEAPONS[id] ?? FISTS;
}

/** Weapons that can appear at map weapon spawns, with weights. */
export function spawnableWeapons(): WeaponDef[] {
  return Object.values(WEAPONS).filter((w) => w.spawnWeight > 0);
}
