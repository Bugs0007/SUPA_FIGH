import type { HeroDefinition } from './heroes';

export const ONE_PIECE_HEROES: Record<string, HeroDefinition> = {
  zoro: {
    id: 'zoro', anime: 'one-piece', name: 'RORONOA ZORO',
    blurb: 'THREE BLADES / HEAVY CUTS / PIERCING SLASH',
    stats: { speed: 0.98, hp: 104 },
    base: {
      kind: 'rasengan', weapon: 'zoro:oni-giri', name: 'ONI GIRI',
      desc: 'CROSS THREE BLADES AND DASH THROUGH THE AIR. HOLD TO EXTEND THE LUNGE.', cooldown: 2.65,
      dash: { windup: 0.19, time: 0.17, maxTime: 0.32, speed: 660, recover: 0.21, damage: 23, knockX: 380, knockY: -85, stun: 0.3, radius: 12 },
    },
    second: {
      kind: 'fireball', name: '108 POUND PHOENIX', desc: 'SEND A CRESCENT BLADE THROUGH UP TO THREE OPPONENTS.', cooldown: 3.9,
      fireball: { windup: 0.29, recover: 0.24, speed: 450, range: 290, size: 4, sizePerLevel: 0.6, damage: 17, damagePerLevel: 2, radius: 0, radiusPerLevel: 0, ignite: 0, fire: 0, firePerLevel: 0, pierce: 2 },
    },
    super: {
      kind: 'bomb', names: ['DRAGON TWISTER', 'BLACK ROPE DRAGON TWISTER', 'KING OF HELL: DRAGON DAMNATION', "ASURA: DEAD MAN'S GAME"],
      desc: 'CUT IMMEDIATELY AROUND YOU. THE FINAL FORM STRIKES WITH ASURA\'S NINE SWORDS.', cooldown: 10,
      bomb: { centered: true, windup: 0, speed: 0, size: 0, sizePerLevel: 0, damage: 38, damagePerLevel: 8, radius: 51, radiusPerLevel: 12 },
    },
    forms: [
      { name: 'ARMAMENT HAKI', speedMul: 1.035, damageMul: 1.10, knockMul: 1.12, reach: 2 },
      { name: 'ENMA UNLEASHED', speedMul: 1.07, damageMul: 1.20, knockMul: 1.21, reach: 4 },
      { name: 'KING OF HELL', speedMul: 1.105, damageMul: 1.30, knockMul: 1.32, reach: 6 },
      { name: 'NINE SWORD STYLE: ASURA', speedMul: 1.15, damageMul: 1.40, knockMul: 1.44, reach: 8 },
    ],
    comboName: 'THREE SWORD STYLE',
    combo: [
      { windup: 0.074, active: 0.075, recover: 0.14, range: 12, damage: 6, knockX: 114, knockY: -30, stun: 0.20, lunge: 42 },
      { windup: 0.080, active: 0.075, recover: 0.15, range: 14, damage: 7, knockX: 136, knockY: -38, stun: 0.23, lunge: 45 },
      { windup: 0.10, active: 0.075, recover: 0.17, range: 13, damage: 8, knockX: 110, knockY: -145, stun: 0.28, lunge: 37 },
      { windup: 0.135, active: 0.083, recover: 0.25, range: 17, damage: 12, knockX: 395, knockY: -120, stun: 0.37, lunge: 60, kick: true, knockdown: true },
    ],
  },
  sanji: {
    id: 'sanji', anime: 'one-piece', name: 'SANJI',
    blurb: 'AERIAL RUSHDOWN / FAST KICKS / FLAMING SWEEP',
    stats: { speed: 1.08, hp: 96 },
    base: {
      kind: 'rasengan', weapon: 'sanji:collier', name: 'COLLIER STRIKE',
      desc: 'KICK FORWARD OR DIAGONALLY. HOLD TO CARRY THE STRIKE FARTHER.', cooldown: 2.45,
      dash: { windup: 0.115, time: 0.155, maxTime: 0.34, speed: 590, recover: 0.19, damage: 17, knockX: 275, knockY: -140, stun: 0.32, radius: 10 },
    },
    second: {
      kind: 'gatling', name: 'CONCASSE BARRAGE', desc: 'CHAIN FAST KICKS AT CLOSE RANGE, ENDING IN A HEAVY BLOW.', cooldown: 3.65,
      gatling: { time: 0.55, every: 0.09, range: 28, damage: 3, knockX: 84, rehit: 0.125, finalKnock: 420, crowdDamageMul: 0.78 },
    },
    super: {
      kind: 'bomb', names: ['FLAMBAGE SHOT', 'HELL MEMORIES', 'BOEUF BURST', 'IFRIT JAMBE: BOEUF BURST'],
      desc: 'SWEEP NEARBY ENEMIES WITH AN IMMEDIATE HEEL KICK. IFRIT LEAVES A BLUE WAKE.', cooldown: 9.4,
      bomb: { centered: true, windup: 0, speed: 0, size: 0, sizePerLevel: 0, damage: 33, damagePerLevel: 8, radius: 38, radiusPerLevel: 9 },
    },
    forms: [
      { name: 'DIABLE JAMBE', speedMul: 1.05, damageMul: 1.09, knockMul: 1.07, reach: 1 },
      { name: 'HELL MEMORIES', speedMul: 1.105, damageMul: 1.19, knockMul: 1.17, reach: 3, flies: true, stamina: { drain: 42, rushDrain: 76, minStart: 22 } },
      { name: 'AWAKENED EXOSKELETON', speedMul: 1.15, damageMul: 1.28, knockMul: 1.26, reach: 4, flies: true, stamina: { drain: 34, rushDrain: 62, minStart: 18 } },
      { name: 'IFRIT JAMBE', speedMul: 1.20, damageMul: 1.36, knockMul: 1.36, reach: 6, flies: true, stamina: { drain: 23, rushDrain: 43, minStart: 15 } },
    ],
    comboName: 'BLACK LEG STYLE',
    combo: [
      { windup: 0.052, active: 0.067, recover: 0.13, range: 10, damage: 5, knockX: 92, knockY: -48, stun: 0.19, lunge: 53 },
      { windup: 0.062, active: 0.067, recover: 0.13, range: 12, damage: 6, knockX: 110, knockY: -65, stun: 0.20, lunge: 50 },
      { windup: 0.072, active: 0.070, recover: 0.15, range: 12, damage: 7, knockX: 140, knockY: -100, stun: 0.23, lunge: 47 },
      { windup: 0.110, active: 0.075, recover: 0.23, range: 16, damage: 11, knockX: 385, knockY: -132, stun: 0.34, lunge: 65, kick: true, knockdown: true },
    ],
  },
  law: {
    id: 'law', anime: 'one-piece', name: 'TRAFALGAR LAW',
    blurb: 'SHAMBLES / ROOM / PRECISE RANGED CUTS',
    stats: { speed: 1, hp: 98 },
    base: {
      kind: 'blink', name: 'SHAMBLES', desc: 'TELEPORT IN THE AIM DIRECTION OR SLIP BEHIND A NEARBY ENEMY.', cooldown: 0.31,
      charges: { max: 2, recharge: 5.1 },
      blink: { range: 116, minRange: 26, assist: 22, iframes: 0.14, recover: 0.11, damage: 0, knockX: 0, knockY: 0, stun: 0, radius: 0 },
    },
    second: {
      kind: 'beam', name: 'ROOM: AMPUTATE', desc: 'HOLD TO WIDEN THE CUT. RELEASE TO SLICE THROUGH ENEMIES, WOOD, AND GLASS.', cooldown: 4.8,
      beam: { minCharge: 0.27, maxCharge: 0.87, range: 205, grow: 0.10, hold: 0.16, width: [4, 8], damage: [12, 26], knock: [160, 330], breakTiles: true, crowdDamageByLevel: [0.77, 0.77, 0.79, 0.81, 0.83] },
    },
    super: {
      kind: 'beam', names: ['COUNTER SHOCK', 'GAMMA KNIFE', 'SHOCK WILLE', 'PUNCTURE WILLE'],
      desc: 'CHARGE KIKOKU AND THRUST A SHOCKWAVE THROUGH ENEMIES IN ITS PATH.', cooldown: 11.5,
      beam: { minCharge: 0.54, maxCharge: 1.22, range: 250, grow: 0.14, hold: 0.22, width: [6, 11], damage: [24, 37], knock: [270, 410], widthPerLevel: 1.75, damagePerLevel: 6, crowdDamageByLevel: [0.73, 0.73, 0.75, 0.77, 0.79] },
    },
    forms: [
      { name: "SURGEON'S FOCUS", speedMul: 1.035, damageMul: 1.085, knockMul: 1.08, reach: 2 },
      { name: 'EXPANDED ROOM', speedMul: 1.075, damageMul: 1.17, knockMul: 1.17, reach: 4 },
      { name: 'K-ROOM', speedMul: 1.11, damageMul: 1.26, knockMul: 1.27, reach: 6 },
      { name: 'OPE OPE AWAKENING', speedMul: 1.15, damageMul: 1.36, knockMul: 1.37, reach: 8 },
    ],
    comboName: 'KIKOKU',
    combo: [
      { windup: 0.077, active: 0.072, recover: 0.14, range: 12, damage: 5, knockX: 104, knockY: -25, stun: 0.20, lunge: 38 },
      { windup: 0.080, active: 0.072, recover: 0.15, range: 13, damage: 6, knockX: 120, knockY: -45, stun: 0.22, lunge: 42 },
      { windup: 0.096, active: 0.075, recover: 0.17, range: 14, damage: 7, knockX: 122, knockY: -123, stun: 0.26, lunge: 45 },
      { windup: 0.137, active: 0.08, recover: 0.25, range: 18, damage: 12, knockX: 370, knockY: -115, stun: 0.34, lunge: 54, kick: true, knockdown: true },
    ],
  },
};
