// ALL weapon stats live in this file. Balance the game by editing numbers here.
// Units: damage in HP (fighters have 100), speeds px/s, times seconds, angles radians.

export const SLOT = { MELEE: 0, SIDEARM: 1, HEAVY: 2, THROWABLE: 3, GADGET: 4 } as const;
export const SLOT_NAMES = ['MELEE', 'SIDEARM', 'HEAVY', 'THROWABLE', 'GADGET'] as const;

export type HoldStyle = 'fist' | 'melee' | 'pistol' | 'rifle' | 'throw' | 'gadget';
export type ProjectileKind = 'bullet' | 'pellet' | 'sniper' | 'flame' | 'rocket' | 'flare' | 'chakra' | 'ki';

/** Radial blast. Damage/knockback fall off linearly to the edge; walls shield 65%. */
export interface ExplosionStats {
  radius: number;
  damage: number;
  /** knockback px/s at the center */
  knock: number;
  /** wood/glass tiles inside this radius are destroyed */
  breakRadius: number;
  /** burning patches scattered around (0 = none) */
  fire?: number;
  /** camera trauma (render only) */
  shake: number;
}

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
  /** projectile gravity px/s^2 (negative = rises, e.g. flames) */
  gravity?: number;
  /** projectile explodes on impact */
  explosion?: ExplosionStats;
  /** seconds of burning applied to fighters hit */
  ignite?: number;
  /** seconds of holding before an automatic starts firing (minigun) */
  spinUp?: number;
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
  /** hero powers (data/heroes.ts): shadow clones strike alongside this hit */
  clones?: number;
  /** render: the arm (or leg) visibly stretches out to the full reach */
  stretch?: boolean;
  /** impact effect flavor */
  fx?: 'chakra' | 'steam' | 'ki';
  /** extra hit-stop + shake on contact */
  heavy?: boolean;
}

export interface MeleeStats {
  combo: MeleeHit[];
  /** hits before the weapon breaks (Infinity = never) */
  durability: number;
}

/** Grenades & co. Hold attack to aim (and cook), release to throw. */
export interface ThrowStats {
  /** charges per pickup */
  count: number;
  /** seconds until detonation (0 = no timer) */
  fuse: number;
  /** the fuse starts when you pull the pin (attack pressed), not when thrown */
  cook: boolean;
  /** throw speed at full power (px/s) */
  speed: number;
  /** velocity kept when bouncing off walls/floors */
  bounce: number;
  explosion?: ExplosionStats;
  /** detonates on the first thing it touches */
  impact?: boolean;
  /** burning patches spawned when it bursts (molotov) */
  fire?: number;
  /** sticks to walls (C4) */
  sticky?: boolean;
  /** press attack again to detonate (C4) */
  remote?: boolean;
  /** placed proximity mine */
  mine?: boolean;
}

export interface GadgetStats {
  kind: 'medkit' | 'jetpack';
  /** medkit: HP healed. jetpack: seconds of fuel */
  amount: number;
}

/** Applied instantly on touch, never occupies a slot. */
export interface PowerupStats {
  kind: 'speed' | 'strength' | 'bulletTime' | 'hero';
  /** hero power-up id (data/heroes.ts POWERS); duration comes from there */
  power?: string;
  duration: number;
  /** speed/strength multiplier */
  mult: number;
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
  throw?: ThrowStats;
  gadget?: GadgetStats;
  powerup?: PowerupStats;
  /** multiplier on run speed while this weapon is active */
  moveSpeedMul?: number;
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
      { damage: 5, windup: 0.05, active: 0.06, recover: 0.13, range: 9, knockX: 55, knockY: 0, stun: 0.2, lunge: 45 },
      { damage: 5, windup: 0.05, active: 0.06, recover: 0.13, range: 9, knockX: 55, knockY: 0, stun: 0.2, lunge: 45 },
      {
        damage: 10,
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

/** Carried props (Interact next to a crate/barrel to lift it, Attack/Interact/Kick to throw) */
export const CARRY = { speedMul: 0.8, throwX: 320, throwY: -150, hitSpeed: 160, damage: 14, knockX: 260, knockY: -160, propSelfDamage: 8 };

/** A tossed weapon that hits someone */
export const TOSS = { speed: 300, damage: 9, knockX: 140, knockY: -70, stun: 0.25 };

/** Throwable aiming: power ramps from min to 1 over rampTime while attack is held. */
export const THROW_AIM = { minPower: 0.55, rampTime: 0.45, defaultAngle: -0.35 };

/** Burning status */
export const FIRE = {
  /** damage per second while burning */
  dps: 7,
  /** burning time added by touching a fire patch */
  touchBurn: 2.5,
  maxBurn: 6,
  /** burning decays this much faster while rolling / stop-drop-and-roll */
  rollMul: 3.5,
  /** fire patch lifetime range (s) */
  patchLife: [3.5, 6.5] as [number, number],
  /** seconds a wooden tile burns before it collapses */
  tileBurn: 3.2,
  /** chance per second that a burning tile ignites each wooden neighbor */
  spread: 0.55,
  maxPatches: 140,
};

// ---------------------------------------------------------------- weapons

const hit = (p: Partial<MeleeHit> & Pick<MeleeHit, 'damage' | 'windup' | 'active' | 'recover' | 'range'>): MeleeHit => ({
  knockX: 80,
  knockY: -20,
  stun: 0.22,
  lunge: 50,
  arcFrom: -2.2,
  arcTo: 0.9,
  ...p,
});

export const WEAPONS: Record<string, WeaponDef> = {
  // ---------------- melee
  knife: {
    id: 'knife',
    name: 'KNIFE',
    slot: SLOT.MELEE,
    hold: 'melee',
    spawnWeight: 6,
    melee: {
      durability: 40,
      combo: [
        hit({ damage: 9, windup: 0.04, active: 0.05, recover: 0.1, range: 10, knockX: 50, arcFrom: -0.6, arcTo: 0.4 }),
        hit({ damage: 9, windup: 0.04, active: 0.05, recover: 0.1, range: 10, knockX: 50, arcFrom: 0.6, arcTo: -0.4 }),
        hit({ damage: 15, windup: 0.08, active: 0.06, recover: 0.22, range: 12, knockX: 160, knockY: -60, lunge: 90, arcFrom: -0.1, arcTo: 0.1 }),
      ],
    },
  },
  machete: {
    id: 'machete',
    name: 'MACHETE',
    slot: SLOT.MELEE,
    hold: 'melee',
    spawnWeight: 5,
    melee: {
      durability: 30,
      combo: [
        hit({ damage: 13, windup: 0.07, active: 0.07, recover: 0.17, range: 14, knockX: 90 }),
        hit({ damage: 13, windup: 0.07, active: 0.07, recover: 0.17, range: 14, knockX: 90, arcFrom: 1.2, arcTo: -1.4 }),
        hit({ damage: 20, windup: 0.1, active: 0.08, recover: 0.3, range: 15, knockX: 220, knockY: -120, knockdown: true, lunge: 80, arcFrom: -2.6, arcTo: 1.2 }),
      ],
    },
  },
  bat: {
    id: 'bat',
    name: 'BASEBALL BAT',
    slot: SLOT.MELEE,
    hold: 'melee',
    spawnWeight: 5,
    melee: {
      durability: 25,
      combo: [
        hit({ damage: 12, windup: 0.1, active: 0.08, recover: 0.2, range: 15, knockX: 200, knockY: -60, arcFrom: -2.0, arcTo: 0.8 }),
        hit({ damage: 17, windup: 0.13, active: 0.09, recover: 0.32, range: 16, knockX: 380, knockY: -200, knockdown: true, arcFrom: 1.6, arcTo: -1.6 }),
      ],
    },
  },
  pipe: {
    id: 'pipe',
    name: 'LEAD PIPE',
    slot: SLOT.MELEE,
    hold: 'melee',
    spawnWeight: 5,
    melee: {
      durability: 35,
      combo: [
        hit({ damage: 11, windup: 0.08, active: 0.07, recover: 0.17, range: 14, knockX: 120 }),
        hit({ damage: 11, windup: 0.08, active: 0.07, recover: 0.17, range: 14, knockX: 120, arcFrom: 1.2, arcTo: -1.4 }),
        hit({ damage: 16, windup: 0.12, active: 0.08, recover: 0.3, range: 15, knockX: 260, knockY: -160, knockdown: true, arcFrom: -2.8, arcTo: 1.4 }),
      ],
    },
  },
  katana: {
    id: 'katana',
    name: 'KATANA',
    slot: SLOT.MELEE,
    hold: 'melee',
    spawnWeight: 3,
    melee: {
      durability: 40,
      combo: [
        hit({ damage: 16, windup: 0.06, active: 0.07, recover: 0.16, range: 17, knockX: 90, arcFrom: -2.4, arcTo: 1.0 }),
        hit({ damage: 16, windup: 0.06, active: 0.07, recover: 0.16, range: 17, knockX: 90, arcFrom: 1.3, arcTo: -1.6 }),
        hit({ damage: 24, windup: 0.12, active: 0.08, recover: 0.32, range: 19, knockX: 240, knockY: -140, knockdown: true, lunge: 140, arcFrom: -0.2, arcTo: 0.2 }),
      ],
    },
  },
  chair: {
    id: 'chair',
    name: 'CHAIR',
    slot: SLOT.MELEE,
    hold: 'melee',
    spawnWeight: 4,
    melee: {
      durability: 4,
      combo: [hit({ damage: 22, windup: 0.18, active: 0.09, recover: 0.3, range: 15, knockX: 330, knockY: -200, stun: 0.4, knockdown: true, arcFrom: -2.8, arcTo: 1.2 })],
    },
  },
  sledge: {
    id: 'sledge',
    name: 'SLEDGEHAMMER',
    slot: SLOT.MELEE,
    hold: 'melee',
    spawnWeight: 3,
    moveSpeedMul: 0.85,
    melee: {
      durability: 15,
      combo: [
        hit({
          damage: 34,
          windup: 0.3,
          active: 0.1,
          recover: 0.38,
          range: 17,
          knockX: 430,
          knockY: -280,
          stun: 0.4,
          knockdown: true,
          lunge: 60,
          arcFrom: -2.9,
          arcTo: 1.3,
        }),
      ],
    },
  },

  // ---------------- sidearms
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
  revolver: {
    id: 'revolver',
    name: 'MAGNUM',
    slot: SLOT.SIDEARM,
    hold: 'pistol',
    spawnWeight: 6,
    muzzle: [10, -2],
    gun: {
      damage: 32,
      fireRate: 1.8,
      auto: false,
      pellets: 1,
      spread: 0.01,
      bulletSpeed: 1150,
      range: 850,
      falloff: 0.8,
      ammo: 6,
      recoil: 70,
      knockback: 130,
      projectile: 'bullet',
      ricochet: true,
      pierce: 0,
      shake: 0.3,
    },
  },
  uzi: {
    id: 'uzi',
    name: 'UZI',
    slot: SLOT.SIDEARM,
    hold: 'pistol',
    spawnWeight: 6,
    muzzle: [8, -2],
    casing: true,
    gun: {
      damage: 7,
      fireRate: 13,
      auto: true,
      pellets: 1,
      spread: 0.09,
      bulletSpeed: 900,
      range: 420,
      falloff: 0.6,
      ammo: 40,
      recoil: 6,
      knockback: 18,
      projectile: 'bullet',
      ricochet: true,
      pierce: 0,
      shake: 0.05,
    },
  },
  flaregun: {
    id: 'flaregun',
    name: 'FLARE GUN',
    slot: SLOT.SIDEARM,
    hold: 'pistol',
    spawnWeight: 4,
    muzzle: [9, -2],
    gun: {
      damage: 10,
      fireRate: 1.2,
      auto: false,
      pellets: 1,
      spread: 0,
      bulletSpeed: 520,
      gravity: 380,
      range: 900,
      falloff: 1,
      ammo: 3,
      recoil: 40,
      knockback: 90,
      projectile: 'flare',
      ricochet: false,
      pierce: 0,
      ignite: 4.5,
      shake: 0.15,
    },
  },

  // ---------------- heavy
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
  smg: {
    id: 'smg',
    name: 'SMG',
    slot: SLOT.HEAVY,
    hold: 'rifle',
    spawnWeight: 7,
    muzzle: [10, -1],
    casing: true,
    gun: {
      damage: 9,
      fireRate: 10,
      auto: true,
      pellets: 1,
      spread: 0.06,
      bulletSpeed: 950,
      range: 550,
      falloff: 0.65,
      ammo: 45,
      recoil: 10,
      knockback: 25,
      projectile: 'bullet',
      ricochet: true,
      pierce: 0,
      shake: 0.07,
    },
  },
  rifle: {
    id: 'rifle',
    name: 'ASSAULT RIFLE',
    slot: SLOT.HEAVY,
    hold: 'rifle',
    spawnWeight: 6,
    muzzle: [14, -1],
    casing: true,
    gun: {
      damage: 13,
      fireRate: 8,
      auto: true,
      pellets: 1,
      spread: 0.035,
      bulletSpeed: 1150,
      range: 800,
      falloff: 0.8,
      ammo: 36,
      recoil: 14,
      knockback: 35,
      projectile: 'bullet',
      ricochet: true,
      pierce: 0,
      shake: 0.09,
    },
  },
  sniper: {
    id: 'sniper',
    name: 'SNIPER RIFLE',
    slot: SLOT.HEAVY,
    hold: 'rifle',
    spawnWeight: 4,
    muzzle: [16, -1],
    casing: true,
    gun: {
      damage: 75,
      fireRate: 0.9,
      auto: false,
      pellets: 1,
      spread: 0,
      bulletSpeed: 2200,
      range: 1800,
      falloff: 1,
      ammo: 5,
      recoil: 120,
      knockback: 260,
      projectile: 'sniper',
      ricochet: false,
      pierce: 2,
      laser: true,
      shake: 0.5,
    },
  },
  minigun: {
    id: 'minigun',
    name: 'MINIGUN',
    slot: SLOT.HEAVY,
    hold: 'rifle',
    spawnWeight: 2,
    muzzle: [14, -2],
    casing: true,
    moveSpeedMul: 0.55,
    gun: {
      damage: 7,
      fireRate: 18,
      auto: true,
      spinUp: 0.45,
      pellets: 1,
      spread: 0.1,
      bulletSpeed: 1000,
      range: 600,
      falloff: 0.6,
      ammo: 160,
      recoil: 9,
      knockback: 30,
      projectile: 'bullet',
      ricochet: true,
      pierce: 0,
      shake: 0.08,
    },
  },
  flamer: {
    id: 'flamer',
    name: 'FLAMETHROWER',
    slot: SLOT.HEAVY,
    hold: 'rifle',
    spawnWeight: 3,
    muzzle: [11, -2],
    gun: {
      damage: 2,
      fireRate: 22,
      auto: true,
      pellets: 1,
      spread: 0.15,
      bulletSpeed: 260,
      gravity: -80,
      range: 120,
      falloff: 1,
      ammo: 140,
      recoil: 2,
      knockback: 8,
      projectile: 'flame',
      ricochet: false,
      pierce: 4,
      ignite: 2.5,
      shake: 0.02,
    },
  },
  bazooka: {
    id: 'bazooka',
    name: 'BAZOOKA',
    slot: SLOT.HEAVY,
    hold: 'rifle',
    spawnWeight: 3,
    muzzle: [13, -2],
    moveSpeedMul: 0.85,
    gun: {
      damage: 20,
      fireRate: 0.8,
      auto: false,
      pellets: 1,
      spread: 0,
      bulletSpeed: 430,
      range: 1400,
      falloff: 1,
      ammo: 3,
      recoil: 170,
      knockback: 60,
      projectile: 'rocket',
      ricochet: false,
      pierce: 0,
      explosion: { radius: 52, damage: 70, knock: 430, breakRadius: 30, shake: 0.75 },
      shake: 0.3,
    },
  },

  // ---------------- throwables
  grenade: {
    id: 'grenade',
    name: 'GRENADE',
    slot: SLOT.THROWABLE,
    hold: 'throw',
    spawnWeight: 6,
    throw: {
      count: 3,
      fuse: 2.6,
      cook: true,
      speed: 380,
      bounce: 0.45,
      explosion: { radius: 48, damage: 75, knock: 400, breakRadius: 26, shake: 0.7 },
    },
  },
  molotov: {
    id: 'molotov',
    name: 'MOLOTOV',
    slot: SLOT.THROWABLE,
    hold: 'throw',
    spawnWeight: 4,
    throw: { count: 2, fuse: 0, cook: false, speed: 340, bounce: 0, impact: true, fire: 10 },
  },
  c4: {
    id: 'c4',
    name: 'C4',
    slot: SLOT.THROWABLE,
    hold: 'throw',
    spawnWeight: 2,
    throw: {
      count: 2,
      fuse: 0,
      cook: false,
      speed: 300,
      bounce: 0,
      sticky: true,
      remote: true,
      explosion: { radius: 60, damage: 90, knock: 480, breakRadius: 36, shake: 0.85 },
    },
  },
  mine: {
    id: 'mine',
    name: 'LANDMINE',
    slot: SLOT.THROWABLE,
    hold: 'throw',
    spawnWeight: 3,
    throw: {
      count: 2,
      fuse: 0,
      cook: false,
      speed: 160,
      bounce: 0.1,
      mine: true,
      explosion: { radius: 40, damage: 70, knock: 380, breakRadius: 20, shake: 0.6 },
    },
  },

  // ---------------- gadgets
  medkit: {
    id: 'medkit',
    name: 'MEDKIT',
    slot: SLOT.GADGET,
    hold: 'gadget',
    spawnWeight: 4,
    gadget: { kind: 'medkit', amount: 50 },
  },
  jetpack: {
    id: 'jetpack',
    name: 'JETPACK',
    slot: SLOT.GADGET,
    hold: 'gadget',
    spawnWeight: 3,
    gadget: { kind: 'jetpack', amount: 3.5 },
  },

  // ---------------- powerups (instant)
  speed: {
    id: 'speed',
    name: 'SPEED BOOST',
    slot: SLOT.GADGET,
    hold: 'gadget',
    spawnWeight: 2,
    powerup: { kind: 'speed', duration: 10, mult: 1.45 },
  },
  strength: {
    id: 'strength',
    name: 'STRENGTH',
    slot: SLOT.GADGET,
    hold: 'gadget',
    spawnWeight: 2,
    powerup: { kind: 'strength', duration: 12, mult: 1.7 },
  },
  bullettime: {
    id: 'bullettime',
    name: 'BULLET TIME',
    slot: SLOT.GADGET,
    hold: 'gadget',
    spawnWeight: 1.5,
    powerup: { kind: 'bulletTime', duration: 5, mult: 0.4 },
  },

  // ---------------- hero power-ups (M9): never at weapon spawns; the world's power spawner drops them
  chakrascroll: {
    id: 'chakrascroll',
    name: 'CHAKRA SCROLL',
    slot: SLOT.GADGET,
    hold: 'gadget',
    spawnWeight: 0,
    powerup: { kind: 'hero', power: 'kurama', duration: 20, mult: 1 },
  },
  strawtoken: {
    id: 'strawtoken',
    name: 'STRAW HAT TOKEN',
    slot: SLOT.GADGET,
    hold: 'gadget',
    spawnWeight: 0,
    powerup: { kind: 'hero', power: 'gear2', duration: 18, mult: 1 },
  },
  energycore: {
    id: 'energycore',
    name: 'ENERGY CORE',
    slot: SLOT.GADGET,
    hold: 'gadget',
    spawnWeight: 0,
    powerup: { kind: 'hero', power: 'ssj', duration: 20, mult: 1 },
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

/** Initial "ammo" for a fresh pickup: bullets, charges, or gadget amount (jetpack fuel, medkit HP). */
export function freshAmmo(def: WeaponDef): number {
  return def.gun?.ammo ?? def.throw?.count ?? def.gadget?.amount ?? 0;
}

/** Ammo counts merge when you pick up the same weapon (guns, throwables). */
export function stacks(def: WeaponDef): boolean {
  return !!def.gun || !!def.throw;
}
