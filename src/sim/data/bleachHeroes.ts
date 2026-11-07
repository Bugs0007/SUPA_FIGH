import type { HeroDefinition } from './heroes';
import type { MeleeHit } from './weapons';

function swordCombo(power: number, reach: number, windup: number): MeleeHit[] {
  const cut: MeleeHit = {
    windup, active: 0.065, recover: 0.14, range: reach, damage: power,
    knockX: 48, knockY: 0, stun: 0.23, lunge: 35, arcFrom: -1.7, arcTo: 0.7,
  };
  return [
    cut,
    { ...cut, arcFrom: 1.15, arcTo: -0.9, lunge: 42 },
    { ...cut, windup: windup + 0.02, range: reach + 2, damage: power + 1, arcFrom: -2.35, arcTo: 0.95 },
    { ...cut, windup: 0.09, active: 0.09, recover: 0.23, range: reach + 3, damage: power + 4,
      knockX: 260, knockY: -140, stun: 0.34, knockdown: true, kick: true, heavy: true },
  ];
}

export const BLEACH_HEROES: Record<string, HeroDefinition> = {
  ichigo: {
    id: 'ichigo', anime: 'bleach', name: 'ICHIGO',
    blurb: 'HEAVY SWORD SWINGS AND AIMED CRESCENT WAVES.',
    stats: { speed: 1.02, hp: 106 },
    comboName: 'ZANGETSU COMBO', combo: swordCombo(5.2, 13, 0.06),
    base: {
      kind: 'rasengan', weapon: 'ichigo:base', name: 'ZANGETSU RUSH',
      desc: 'LUNGE WITH ZANGETSU. HOLD TO CARRY THE CUT FORWARD. UP OR DOWN TO AIM.',
      cooldown: 2.5,
      dash: { windup: 0.16, time: 0.23, maxTime: 0.56, speed: 455, recover: 0.18,
        damage: 15, knockX: 300, knockY: -130, stun: 0.36, radius: 7 },
    },
    second: {
      kind: 'fireball', name: 'GETSUGA TENSHO',
      desc: 'SEND AN AIMED CRESCENT OF SPIRIT ENERGY. THE CRESCENT GROWS WITH EACH FORM.',
      cooldown: 2.8,
      fireball: { windup: 0.23, recover: 0.2, speed: 510, range: 325, size: 7, sizePerLevel: 1.1,
        damage: 18, damagePerLevel: 2, radius: 0, radiusPerLevel: 0, ignite: 0, fire: 0, firePerLevel: 0 },
    },
    super: {
      kind: 'bomb', names: ['BLACK GETSUGA', 'HOLLOW GETSUGA', 'HOLLOW CERO', 'GETSUGA JUJISHO'],
      desc: 'RELEASE AN AIMED SPIRIT BLAST. IN THE FINAL FORM, TWO BLADES CUT A GOLDEN CROSS.',
      cooldown: 8.8,
      bomb: { windup: 1.4, speed: 520, speedByLevel: [520, 490, 460, 590], range: 490, size: 9, sizePerLevel: 2.3,
        damage: 28, damagePerLevel: 8, radius: 44, radiusPerLevel: 8, kind: 'ki' },
    },
    forms: [
      { name: 'TENSA ZANGETSU', speedMul: 1.13, damageMul: 1.11, knockMul: 1.1, reach: 2 },
      { name: 'HOLLOW MASK', speedMul: 1.16, damageMul: 1.23, knockMul: 1.19, reach: 4 },
      { name: 'FULL HOLLOW', speedMul: 1.2, damageMul: 1.34, knockMul: 1.28, reach: 6, flies: true },
      { name: 'HORN OF SALVATION', speedMul: 1.24, damageMul: 1.48, knockMul: 1.4, reach: 10, flies: true },
    ],
  },
  rukia: {
    id: 'rukia', anime: 'bleach', name: 'RUKIA',
    blurb: 'QUICK FROST CUTS, AN ICE LINE AND A CLOSE-RANGE BANKAI.',
    stats: { speed: 1.05, hp: 96 },
    comboName: 'SNOWBLADE COMBO', combo: swordCombo(4.5, 11, 0.047),
    base: {
      kind: 'rasengan', weapon: 'rukia:base', name: 'SHIRAFUNE',
      desc: 'A SHORT, FAST LUNGE WITH AN ICE BLADE. HOLD TO EXTEND IT.',
      cooldown: 0.38, charges: { max: 2, recharge: 3.25 },
      dash: { windup: 0.12, time: 0.16, maxTime: 0.31, speed: 430, recover: 0.16,
        damage: 10, knockX: 180, knockY: -75, stun: 0.54, radius: 5 },
    },
    second: {
      kind: 'beam', name: 'TSUGI NO MAI, HAKUREN',
      desc: 'RELEASE A NARROW FROST STREAM OR HOLD FOR A WIDER WAVE. AIM UP OR DOWN.',
      cooldown: 3.35,
      beam: { minCharge: 0.2, maxCharge: 0.76, range: 205, grow: 0.12, hold: 0.26,
        width: [2, 8], damage: [13, 24], knock: [140, 260], crowdDamageByLevel: [0.8, 0.83, 0.86] },
    },
    super: {
      kind: 'bomb', names: ['SOME NO MAI, TSUKISHIRO', 'WHITE HAZE', 'ABSOLUTE ZERO', 'HAKKA NO TOGAME'],
      desc: 'ICE ERUPTS INSTANTLY AROUND RUKIA. CATCH NEARBY ENEMIES IN THE FROST.',
      cooldown: 8.2,
      bomb: { centered: true, windup: 0, speed: 0, size: 0, sizePerLevel: 0,
        damage: 30, damagePerLevel: 8, radius: 45, radiusPerLevel: 9, kind: 'ki' },
    },
    forms: [
      { name: 'SODE NO SHIRAYUKI', speedMul: 1.12, damageMul: 1.1, knockMul: 1.09, reach: 2 },
      { name: 'WHITE HAZE', speedMul: 1.16, damageMul: 1.21, knockMul: 1.17, reach: 4 },
      { name: 'ABSOLUTE ZERO', speedMul: 1.19, damageMul: 1.32, knockMul: 1.25, reach: 6 },
      { name: 'HAKKA NO TOGAME', speedMul: 1.23, damageMul: 1.46, knockMul: 1.37, reach: 8, flies: true },
    ],
  },
  byakuya: {
    id: 'byakuya', anime: 'bleach', name: 'BYAKUYA',
    blurb: 'FLASH STEP BEHIND ENEMIES AND CONTROL SPACE WITH PETAL BLADES.',
    stats: { speed: 1.04, hp: 102 },
    comboName: 'SENBONZAKURA COMBO', combo: swordCombo(4.8, 12, 0.053),
    base: {
      kind: 'blink', weapon: 'byakuya:base', name: 'SHUNPO',
      desc: 'FLASH STEP IN THE AIMED DIRECTION. SLIP BEHIND A NEARBY OPPONENT TO SET UP A FOLLOW-UP.',
      cooldown: 0.3, charges: { max: 2, recharge: 3.5 },
      blink: { range: 106, minRange: 18, assist: 37, recover: 0.1, iframes: 0.19,
        damage: 0, knockX: 0, knockY: 0, stun: 0, radius: 0 },
    },
    second: {
      kind: 'fireball', name: 'SCATTER, SENBONZAKURA',
      desc: 'SEND A STREAM OF PETAL BLADES THROUGH UP TO THREE ENEMIES. UP OR DOWN TO AIM.',
      cooldown: 3.1,
      fireball: { windup: 0.19, recover: 0.2, speed: 365, range: 274, size: 5, sizePerLevel: 1.25,
        damage: 15, damagePerLevel: 1.8, radius: 0, radiusPerLevel: 0, ignite: 0, fire: 0, firePerLevel: 0, pierce: 2 },
    },
    super: {
      kind: 'bomb', names: ['PETAL WAVE', 'SENBONZAKURA KAGEYOSHI', 'SENKEI', 'SHUKEI HAKUTEIKEN'],
      desc: 'SEND PETAL BLADES THAT BURST ON IMPACT. SENKEI FIRES FOCUSED BLADES. HAKUTEIKEN FIRES A SWIFT WHITE EDGE.',
      cooldown: 8.6,
      bomb: { windup: 1.6, speed: 390, speedByLevel: [390, 360, 455, 500], range: 410,
        rangeByLevel: [410, 445, 360, 410], size: 10, sizePerLevel: 2.3,
        damage: 29, damagePerLevel: 8, radius: 49, radiusPerLevel: 9, kind: 'ki' },
    },
    forms: [
      { name: 'SENBONZAKURA', speedMul: 1.11, damageMul: 1.11, knockMul: 1.09, reach: 2 },
      { name: 'SENBONZAKURA KAGEYOSHI', speedMul: 1.15, damageMul: 1.22, knockMul: 1.18, reach: 4 },
      { name: 'SENKEI', speedMul: 1.19, damageMul: 1.33, knockMul: 1.27, reach: 6 },
      { name: 'SHUKEI HAKUTEIKEN', speedMul: 1.24, damageMul: 1.47, knockMul: 1.4, reach: 10, flies: true },
    ],
  },
};
