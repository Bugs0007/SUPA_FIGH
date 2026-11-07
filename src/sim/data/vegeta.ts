import type { HeroDefinition } from './heroes';

export const VEGETA: HeroDefinition = {
  id: 'vegeta',
  name: 'VEGETA',
  anime: 'dragon-ball',
  blurb: 'SAIYAN PRINCE / FLIGHT / KI ARTILLERY',
  stats: { speed: 1.02, hp: 99 },
  alwaysFlies: true,
  base: {
    kind: 'rasengan', name: 'SUPER DASH', weapon: 'vegeta:dash', desc: 'HOLD TO DRIVE AN ARMORED SHOULDER THROUGH AN OPENING.', cooldown: 2.4,
    dash: { windup: 0.14, time: 0.19, maxTime: 0.44, speed: 310, recover: 0.24, damage: 14, knockX: 245, knockY: -80, stun: 0.32, radius: 7 },
  },
  second: {
    kind: 'fireball', name: 'BIG BANG ATTACK', desc: 'A FAST KI SPHERE THAT BURSTS ON IMPACT. AIM WITH UP OR DOWN.', cooldown: 3.9,
    fireball: { windup: 0.31, recover: 0.24, speed: 340, range: 216, size: 5, sizePerLevel: 1, damage: 14, damagePerLevel: 1, radius: 20, radiusPerLevel: 3, ignite: 0, fire: 0, firePerLevel: 0, spareOwner: true },
  },
  super: {
    kind: 'beam', names: ['GALICK GUN', 'FINAL FLASH', 'GOD FINAL FLASH', 'FINAL FLASH EVOLUTION'],
    desc: 'BRACE, GATHER KI, THEN SWEEP THE AIM LINE WITH ONE HEAVY BEAM.', cooldown: 13,
    beam: { minCharge: 0.95, maxCharge: 0.95, range: 295, grow: 0.24, hold: 0.4, width: [7, 9], widthPerLevel: 2, damage: [39, 43], damagePerLevel: 6, knock: [285, 320], breakTiles: true, crowdDamageByLevel: [1, 0.85, 0.82, 0.79, 0.76] },
  },
  forms: [
    { name: 'SUPER SAIYAN', speedMul: 1.08, damageMul: 1.12, knockMul: 1.06, reach: 1 },
    { name: 'SUPER SAIYAN 2', speedMul: 1.13, damageMul: 1.2, knockMul: 1.13, reach: 1 },
    { name: 'SUPER SAIYAN BLUE', speedMul: 1.19, damageMul: 1.28, knockMul: 1.2, reach: 2 },
    { name: 'BLUE EVOLUTION', speedMul: 1.24, damageMul: 1.38, knockMul: 1.29, reach: 3 },
  ],
  comboName: 'ROYAL COMBINATION',
  combo: [
    { windup: 0.07, active: 0.07, recover: 0.13, damage: 6, range: 12, knockX: 55, knockY: -14, stun: 0.16 },
    { windup: 0.08, active: 0.07, recover: 0.14, damage: 7, range: 13, knockX: 65, knockY: -25, stun: 0.18 },
    { windup: 0.1, active: 0.08, recover: 0.17, damage: 9, range: 14, knockX: 90, knockY: -55, stun: 0.24 },
    { windup: 0.15, active: 0.09, recover: 0.28, damage: 13, range: 16, knockX: 220, knockY: -105, stun: 0.42, kick: true, knockdown: true },
  ],
};
