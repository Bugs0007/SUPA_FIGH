// Hero looks (M9, reworked M11): the existing modular fighter, reskinned. Same pixel density as every
// fighter: a hero is an Appearance (hair/hat/face/top parts drawn in fighterArt.ts) plus one override
// set per transformation form, and an effect set per form (aura colours, tails...). Names/stats live in
// sim/data/heroes.ts; palettes live here.

import type { Appearance } from './appearance';
import { P } from './palette';

export interface FormFx {
  /** aura pixel colours [main, highlight] */
  aura: [string, string];
  /** chakra tails behind the fighter (Naruto) */
  tails: number;
  /** tail colours [body, tip] */
  tailColors: [string, string];
  /** how heavy the aura is: orbiting pixel count / rising motes */
  power: number;
  /** extra effect flavour */
  extra?: 'steam' | 'lightning' | 'clouds' | 'fire';
}

export interface HeroArt {
  look: Appearance;
  /** overrides for form level 1..N */
  forms: Partial<Appearance>[];
  fx: FormFx[];
}

const SKIN = '#f0c8a0';

export const HERO_ART: Record<string, HeroArt> = {
  naruto: {
    look: {
      skin: SKIN,
      hair: 'ninja',
      hairColor: '#f8d040',
      face: 'whiskers',
      hat: 'headband',
      hatColor: '#2f4a9a',
      top: 'tracksuit',
      topColor: '#f08a28',
      accentColor: '#22202c',
      pantsColor: '#e07a22',
      shoesColor: '#2f4a9a',
      legs: 'shorts',
      trim: '#f4f1ea',
    },
    forms: [
      // 1: red eyes, sharper whiskers, one tail of chakra
      { face: 'foxeyes', eyes: '#ea3a2a', skin: '#f2b890' },
      // 4 tails: the red chakra cloak takes over (red-orange body, black trim)
      { face: 'foxeyes', eyes: '#ea3a2a', skin: '#f2a070', topColor: '#d8441e', accentColor: '#3a0e0a', pantsColor: '#c4361a', shoesColor: '#3a0e0a', hairColor: '#ffb030' },
      // 6 tails: the black, corrupted cloak
      { face: 'foxeyes', eyes: '#ff3030', skin: '#b8806a', topColor: '#2a2230', accentColor: '#120e16', pantsColor: '#221a28', shoesColor: '#120e16', hairColor: '#7a1a1a', trim: '#8a2a2a' },
      // Kurama mode: all gold, black markings
      { face: 'foxeyes', eyes: '#1a1020', skin: '#ffe4a0', topColor: '#f8c028', accentColor: '#1a1410', pantsColor: '#f8c028', shoesColor: '#1a1410', hairColor: '#fff2a0', hatColor: '#1a1410', trim: '#fff2a0' },
    ],
    fx: [
      { aura: ['#ffb02a', '#ff7a1a'], tails: 1, tailColors: ['#f08a28', '#ffd060'], power: 1 },
      { aura: ['#ff5a1a', '#c8201a'], tails: 4, tailColors: ['#d8441e', '#ff9a40'], power: 2 },
      { aura: ['#7a1a2a', '#e83a3a'], tails: 6, tailColors: ['#22181e', '#c82a2a'], power: 3, extra: 'fire' },
      { aura: ['#ffd84a', '#fff8c0'], tails: 9, tailColors: ['#f8c028', '#fff8c0'], power: 4, extra: 'lightning' },
    ],
  },
  luffy: {
    look: {
      skin: '#e8b890',
      hair: 'short',
      hairColor: '#1e1614',
      face: 'scar',
      hat: 'strawhat',
      hatColor: '#e8c060',
      top: 'openvest',
      topColor: '#c82a2a',
      accentColor: '#c82a2a',
      pantsColor: '#2f5ab8',
      shoesColor: '#a0703a',
      legs: 'shorts',
      trim: '#e8c060',
    },
    forms: [
      // Gear Second: pink, steaming
      { skin: '#f4a0a0' },
      // Gear Third: flushed red-pink, inflated look (darker vest)
      { skin: '#f08080', topColor: '#a81e1e' },
      // Gear Fourth: Boundman, black body with orange markings, stiff hair
      { skin: '#2a262e', topColor: '#1c1a20', accentColor: '#f08030', pantsColor: '#1c1a20', shoesColor: '#f08030', hairColor: '#0e0a0c', trim: '#f08030', eyes: '#ffd060' },
      // Gear Fifth: Sun God Nika, white hair and clothes
      { skin: '#f6d8c0', hair: 'wild', hairColor: '#fafaf6', topColor: '#fafaf6', accentColor: '#fafaf6', pantsColor: '#fafaf6', shoesColor: '#e8e4dc', hatColor: '#fafaf6', trim: '#ffd84a', eyes: '#3a8ae8' },
    ],
    fx: [
      { aura: ['#ff9ad0', '#ffffff'], tails: 0, tailColors: ['#fff', '#fff'], power: 1, extra: 'steam' },
      { aura: ['#ff7a7a', '#ffffff'], tails: 0, tailColors: ['#fff', '#fff'], power: 2, extra: 'steam' },
      { aura: ['#2a2230', '#f08030'], tails: 0, tailColors: ['#fff', '#fff'], power: 3, extra: 'fire' },
      { aura: ['#ffffff', '#ffe890'], tails: 0, tailColors: ['#fff', '#fff'], power: 4, extra: 'clouds' },
    ],
  },
  goku: {
    look: {
      skin: SKIN,
      hair: 'saiyan',
      hairColor: '#1a1420',
      face: 'plain',
      hat: 'none',
      hatColor: P.ink,
      top: 'gi',
      topColor: '#f07a22',
      accentColor: '#2f4ab8',
      pantsColor: '#f07a22',
      shoesColor: '#2f4ab8',
      trim: '#2f4ab8',
    },
    forms: [
      // Super Saiyan: golden hair, teal eyes
      { hairColor: '#f8e040', eyes: '#2ad8c8' },
      // SSJ2: brighter, sharper
      { hairColor: '#fff060', eyes: '#2ad8c8' },
      // SSJ3: long mane, no brows
      { hair: 'saiyan3', hairColor: '#ffe840', eyes: '#2ad8c8' },
      // Super Saiyan Blue
      { hairColor: '#3fc0f8', eyes: '#1a6af0' },
    ],
    fx: [
      { aura: ['#f8e040', '#fff8c0'], tails: 0, tailColors: ['#fff', '#fff'], power: 1 },
      { aura: ['#fff060', '#ffffff'], tails: 0, tailColors: ['#fff', '#fff'], power: 2, extra: 'lightning' },
      { aura: ['#ffd020', '#fff8c0'], tails: 0, tailColors: ['#fff', '#fff'], power: 3, extra: 'lightning' },
      { aura: ['#3fc0f8', '#e8fbff'], tails: 0, tailColors: ['#fff', '#fff'], power: 4, extra: 'lightning' },
    ],
  },
};

/** Effect set of a hero's form level (1..N); level 0 / unknown -> the first form. */
export function formFx(hero: string, level: number): FormFx {
  const h = HERO_ART[hero];
  if (!h) return { aura: [P.white, P.white], tails: 0, tailColors: [P.white, P.white], power: 1 };
  return h.fx[Math.max(0, Math.min(h.fx.length - 1, level - 1))];
}

/** Aura colours of the generic boost from a power orb. */
export const BOOST_COLORS: [string, string] = ['#7ad8ff', '#ffffff'];

export function heroLook(hero: string, fallback: Appearance): Appearance {
  return HERO_ART[hero]?.look ?? fallback;
}

/** Look of a hero at form level 1..N (level 0 = the base look). */
export function formLook(hero: string, level: number): Appearance | null {
  const h = HERO_ART[hero];
  if (!h) return null;
  if (level <= 0) return h.look;
  return { ...h.look, ...h.forms[Math.min(h.forms.length, level) - 1] };
}

/** Number of form levels. */
export function formCount(hero: string): number {
  return HERO_ART[hero]?.forms.length ?? 0;
}
