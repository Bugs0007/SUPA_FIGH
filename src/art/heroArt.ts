// Hero looks (M9): the existing modular fighter, reskinned. Same pixel density as every fighter:
// a hero is an Appearance (hair/hat/face/top parts drawn in fighterArt.ts) + a powered variant.
// Names/stats live in sim/data/heroes.ts; palettes live here.

import type { Appearance } from './appearance';
import { P } from './palette';

export interface HeroArt {
  look: Appearance;
  /** overrides while fully transformed (hair turns yellow, eyes go red...) */
  powered: Partial<Appearance>;
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
      hatColor: '#3a4a8a',
      top: 'tracksuit',
      topColor: '#f08a28',
      accentColor: '#22202c',
      pantsColor: '#e07a22',
      shoesColor: '#22202c',
    },
    powered: { face: 'foxeyes' },
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
    },
    // Gear 2: steaming, flushed pink skin
    powered: { skin: '#f09a9a' },
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
    },
    powered: { hairColor: '#f8e848' },
  },
};

/** Aura / effect colors per power-up: [main, highlight] */
export const POWER_COLORS: Record<string, [string, string]> = {
  kurama: ['#ff6a1a', '#c8202a'],
  gear2: ['#ff9ad0', '#ffffff'],
  ssj: ['#f8e040', '#fff8c0'],
};

export function heroLook(hero: string, fallback: Appearance): Appearance {
  return HERO_ART[hero]?.look ?? fallback;
}

export function poweredLook(hero: string): Appearance | null {
  const h = HERO_ART[hero];
  return h ? { ...h.look, ...h.powered } : null;
}
