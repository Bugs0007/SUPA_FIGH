// Hero looks: signature costumes and form anatomy on the existing modular fighter. Same pixel density as every
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
  /** the tails are made of aura (translucent, no solid body): Naruto's first form */
  ghostTails?: boolean;
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
  sasuke: {
    look: { design: 'sasuke', form: 0, skin: '#edcbb3', hair: 'uchiha', hairColor: '#191c30',
      face: 'plain', hat: 'none', hatColor: '#252338', top: 'openrobe', topColor: '#c6c7d3',
      accentColor: '#8270ac', pantsColor: '#28263d', shoesColor: '#222638', eyes: '#292a3d' },
    forms: [
      { eyes: '#ef364d' },
      { skin: '#a39aa8', hairColor: '#272337', topColor: '#9c97ad', eyes: '#dcb34b', trim: '#383049' },
      { eyes: '#f52a47', topColor: '#cbd0dc', accentColor: '#8062ad' },
      { eyes: '#b593f4', topColor: '#d6d6e8', accentColor: '#936acb', trim: '#baa4e9' },
    ],
    fx: [
      { aura: ['#82caff', '#e5f5ff'], tails: 0, tailColors: ['#fff', '#fff'], power: 1 },
      { aura: ['#9057cf', '#c9a8ff'], tails: 0, tailColors: ['#fff', '#fff'], power: 2, extra: 'lightning' },
      { aura: ['#8052ca', '#e1adff'], tails: 0, tailColors: ['#fff', '#fff'], power: 3, extra: 'fire' },
      { aura: ['#a37aec', '#e8d9ff'], tails: 0, tailColors: ['#fff', '#fff'], power: 4, extra: 'lightning' },
    ],
  },
  naruto: {
    look: {
      design: 'naruto',
      form: 0,
      skin: SKIN,
      hair: 'ninja',
      hairColor: '#f8d040',
      face: 'whiskers',
      hat: 'headband',
      hatColor: '#20222e',
      top: 'tracksuit',
      topColor: '#f08a28',
      accentColor: '#22202c',
      pantsColor: '#e07a22',
      shoesColor: '#2f4a9a',
      eyes: '#4b98db',
    },
    forms: [
      // 1: red eyes, sharper whiskers; a tail is shaped by the crimson aura (no physical tail)
      { face: 'foxeyes', eyes: '#ea3a2a', skin: '#f2b890' },
      // Four tails: a crimson beast silhouette with white eyes, no clothes or headband.
      { face: 'foxeyes', eyes: '#fff4dd', skin: '#a81724', top: 'chakra', hat: 'none', hair: 'fox', topColor: '#ad182b', accentColor: '#420d21', pantsColor: '#921324', shoesColor: '#671225', hairColor: '#b81929' },
      // Six tails: a dark crimson cloak with exposed pale skeletal markings.
      { face: 'foxeyes', eyes: '#fff4dd', skin: '#361624', top: 'chakra', hat: 'none', hair: 'fox', topColor: '#381421', accentColor: '#ecdfc4', pantsColor: '#2b1020', shoesColor: '#521324', hairColor: '#a02432', trim: '#e5dac6' },
      // Kurama mode: all gold, black markings, no tails (the form is the cloak itself)
      { face: 'foxeyes', eyes: '#de7b29', skin: '#ffe4a0', topColor: '#ffcf43', accentColor: '#251820', pantsColor: '#f8c028', shoesColor: '#251820', hairColor: '#fff2a0', hatColor: '#251820', trim: '#fff2a0' },
    ],
    fx: [
      { aura: ['#ff2a2a', '#c8101a'], tails: 1, ghostTails: true, tailColors: ['#ff3a2a', '#ff9a60'], power: 1 },
      { aura: ['#bc1633', '#ff6a52'], tails: 4, tailColors: ['#95152c', '#ff6254'], power: 2, extra: 'fire' },
      { aura: ['#7a1a2a', '#e83a3a'], tails: 6, tailColors: ['#351423', '#d93748'], power: 3, extra: 'fire' },
      { aura: ['#ffd84a', '#fff8c0'], tails: 0, tailColors: ['#f8c028', '#fff8c0'], power: 4, extra: 'lightning' },
    ],
  },
  luffy: {
    look: {
      design: 'luffy',
      form: 0,
      skin: '#e8b890',
      hair: 'spiky',
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
    },
    forms: [
      // Gear Second: pink, steaming
      { skin: '#f4a0a0' },
      // Gear Third: normal costume, with bone-inflated hands drawn by the rig and move effects.
      { skin: '#efbc96' },
      // Gear Fourth: Boundman, a broad bare torso and black/red Haki forearms.
      { skin: '#e5a27f', top: 'boundman', topColor: '#e5a27f', accentColor: '#891c35', hat: 'none', pantsColor: '#3f67a0', shoesColor: '#8c5e35', hair: 'wild', hairColor: '#15141e', eyes: '#17141d' },
      // Gear Fifth: Sun God Nika, white hair and clothes
      { skin: '#f6d8c0', hair: 'wild', hairColor: '#fafaf6', hat: 'none', topColor: '#fafaf6', accentColor: '#fafaf6', pantsColor: '#fafaf6', shoesColor: '#956744', eyes: '#d85870' },
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
      design: 'goku',
      form: 0,
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
      { hair: 'saiyan2', hairColor: '#fff060', eyes: '#2ad8c8' },
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
  return { ...h.look, ...h.forms[Math.min(h.forms.length, level) - 1], form: Math.min(h.forms.length, level) };
}

/** Number of form levels. */
export function formCount(hero: string): number {
  return HERO_ART[hero]?.forms.length ?? 0;
}
