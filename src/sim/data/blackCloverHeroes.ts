import type { HeroDefinition } from './heroes';
import type { MeleeHit } from './weapons';

function combo(reach: number, damage: number, windup: number, fx: MeleeHit['fx']): MeleeHit[] {
  const jab: MeleeHit = {
    damage, windup, active: 0.06, recover: 0.13, range: reach,
    knockX: 62, knockY: 0, stun: 0.2, lunge: 44, fx,
  };
  return [
    jab,
    { ...jab, lunge: 52 },
    { ...jab, damage: damage + 1, windup: windup + 0.025, range: reach + 2, knockY: -28 },
    { ...jab, damage: damage + 4, windup: windup + 0.045, active: 0.08, recover: 0.23,
      range: reach + 1, knockX: 270, knockY: -140, stun: 0.3, lunge: 40, kick: true, knockdown: true, heavy: true },
  ];
}

export const BLACK_CLOVER_HEROES: Record<string, HeroDefinition> = {
  asta: {
    id: 'asta', anime: 'black-clover', name: 'ASTA',
    blurb: 'ANTI-MAGIC SWORDSMAN WITH HEAVY CUTS AND REFLECTING GUARDS.',
    stats: { speed: 1.01, hp: 106 },
    comboName: 'DEMON-SLAYER COMBO', combo: combo(11, 4, 0.055, 'chakra'),
    base: {
      kind: 'rasengan', weapon: 'asta:base', name: 'DEMON-SLAYER RUSH',
      desc: 'LUNGE WITH THE DEMON-SLAYER SWORD. HOLD TO EXTEND THE DASH.', cooldown: 3.1,
      dash: { windup: 0.19, time: 0.2, maxTime: 0.58, speed: 460, recover: 0.21,
        damage: 17, knockX: 310, knockY: -124, stun: 0.34, radius: 8 },
    },
    second: {
      kind: 'fireball', name: 'BLACK SLASH',
      desc: 'SEND A PIERCING ANTI-MAGIC CRESCENT THROUGH ENEMIES. AIM UP OR DOWN.', cooldown: 3.6,
      fireball: { windup: 0.2, recover: 0.23, speed: 390, range: 240, size: 6, sizePerLevel: 0.9,
        damage: 15, damagePerLevel: 1.5, radius: 0, radiusPerLevel: 0, ignite: 0, fire: 0, firePerLevel: 0, pierce: 2 },
    },
    super: {
      kind: 'bomb', names: ['BLACK DIVIDER', 'BLACK DIVIDER', 'UNION: BLACK DIVIDER', 'TRUE UNION: BLACK DIVIDER'],
      desc: 'CLEAVE INSTANTLY WITH THE ENLARGED DEMON-SLAYER AND HIT NEARBY FOES.', cooldown: 8.6,
      bomb: { centered: true, windup: 0, speed: 0, size: 12, sizePerLevel: 4,
        damage: 34, damagePerLevel: 8, radius: 53, radiusPerLevel: 10 },
    },
    forms: [
      { name: 'ANTI-MAGIC AWAKENING', speedMul: 1.08, damageMul: 1.13, knockMul: 1.12, reach: 2, reflects: true },
      { name: 'BLACK ASTA', speedMul: 1.15, damageMul: 1.23, knockMul: 1.18, reach: 4, flies: true, reflects: true },
      { name: 'DEVIL UNION', speedMul: 1.19, damageMul: 1.32, knockMul: 1.27, reach: 6, flies: true, reflects: true, reflectDamage: 0.15 },
      { name: 'TRUE DEVIL UNION', speedMul: 1.23, damageMul: 1.44, knockMul: 1.36, reach: 9, flies: true, reflects: true, reflectDamage: 0.2 },
    ],
  },
  yuno: {
    id: 'yuno', anime: 'black-clover', name: 'YUNO',
    blurb: 'WIND MAGE WHO USES AIR DASHES, SPIRIT FLIGHT AND RANGED SPELLS.',
    stats: { speed: 1.06, hp: 96 },
    comboName: 'WIND COMBO', combo: combo(10, 4, 0.042, 'steam'),
    base: {
      kind: 'rasengan', weapon: 'yuno:base', name: 'GALE STEP',
      desc: 'RIDE A SHORT BURST OF WIND IN YOUR AIM DIRECTION. TWO CHARGES.', cooldown: 0.44,
      charges: { max: 2, recharge: 3.2 },
      dash: { windup: 0.085, time: 0.16, maxTime: 0.3, speed: 560, recover: 0.14,
        damage: 8, knockX: 185, knockY: -112, stun: 0.22, radius: 6 },
    },
    second: {
      kind: 'fireball', name: 'TORNADO FANG',
      desc: 'FIRE A QUICK, AIMED VORTEX THAT PIERCES THROUGH A GROUP.', cooldown: 3,
      fireball: { windup: 0.17, recover: 0.18, speed: 430, range: 290, size: 5, sizePerLevel: 0.8,
        damage: 13, damagePerLevel: 1.4, radius: 0, radiusPerLevel: 0, ignite: 0, fire: 0, firePerLevel: 0, pierce: 3 },
    },
    super: {
      kind: 'beam', names: ['SPIRIT STORM', 'SPIRIT STORM', 'BOREAS: SPIRIT STORM', 'STAR MAGIC: SPIRIT STORM'],
      desc: 'CHANNEL SYLPH INTO A LONG WIND LANCE. THE STORM THICKENS IN HIGHER FORMS.', cooldown: 8.2,
      beam: { minCharge: 1.05, maxCharge: 1.05, range: 270, grow: 0.18, hold: 0.34,
        width: [8, 11], damage: [27, 31], knock: [325, 470], widthPerLevel: 2, damagePerLevel: 6 },
    },
    forms: [
      { name: 'SPIRIT DIVE', speedMul: 1.1, damageMul: 1.1, knockMul: 1.06, reach: 2, flies: true },
      { name: 'SPIRIT OF ZEPHYR', speedMul: 1.15, damageMul: 1.19, knockMul: 1.13, reach: 4, flies: true },
      { name: 'SPIRIT OF BOREAS', speedMul: 1.2, damageMul: 1.28, knockMul: 1.19, reach: 6, flies: true },
      { name: 'STAR MAGIC', speedMul: 1.24, damageMul: 1.39, knockMul: 1.26, reach: 8, flies: true },
    ],
  },
  yami: {
    id: 'yami', anime: 'black-clover', name: 'YAMI SUKEHIRO',
    blurb: 'BLACK BULLS CAPTAIN WITH A DARK KATANA AND HEAVY GUARD.',
    stats: { speed: 0.98, hp: 110 },
    comboName: 'DARK CLOAKED COMBO', combo: combo(12, 4, 0.064, 'ki'),
    base: {
      kind: 'rasengan', weapon: 'yami:base', name: 'DARK CLOAKED IAI SLASH',
      desc: 'DRAW THE KATANA INTO A SHORT, HARD-HITTING LUNGE.', cooldown: 3.4,
      dash: { windup: 0.15, time: 0.15, maxTime: 0.33, speed: 460, recover: 0.24,
        damage: 18, knockX: 295, knockY: -95, stun: 0.38, radius: 8 },
    },
    second: {
      kind: 'beam', name: 'DARK CLOAKED DEATH THRUST',
      desc: 'HOLD TO COMPRESS DARK MAGIC AT THE BLADE TIP. RELEASE TO THRUST.', cooldown: 3.9,
      beam: { minCharge: 0.22, maxCharge: 0.62, range: 122, grow: 0.12, hold: 0.16,
        width: [3, 7], damage: [17, 25], knock: [255, 460] },
    },
    super: {
      kind: 'bomb', names: ['DIMENSION SLASH', 'DIMENSION SLASH', 'DIMENSION SLASH: EQUINOX', 'EQUINOX'],
      desc: 'UNLEASH A LONG-RANGE CRESCENT OF DARK MAGIC THAT BURSTS ON IMPACT.', cooldown: 8.9,
      bomb: { windup: 1.35, speed: 550, size: 8, sizePerLevel: 2.5, damage: 33, damagePerLevel: 8,
        radius: 29, radiusPerLevel: 7, range: 460, kind: 'ki' },
    },
    forms: [
      { name: 'DARK CLOAK', speedMul: 1.06, damageMul: 1.14, knockMul: 1.1, reach: 2 },
      { name: 'MANA ZONE', speedMul: 1.11, damageMul: 1.24, knockMul: 1.2, reach: 4 },
      { name: 'BLACK MOON', speedMul: 1.14, damageMul: 1.34, knockMul: 1.28, reach: 7, reflects: true, reflectDamage: 0.15 },
      { name: 'SURPASS YOUR LIMITS', speedMul: 1.18, damageMul: 1.46, knockMul: 1.38, reach: 11, reflects: true, reflectDamage: 0.2 },
    ],
  },
};
