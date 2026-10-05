import { CLOTH_COLORS, HAIR_COLORS, SKIN_TONES } from './palette';

export const HAIR_STYLES = ['none', 'buzz', 'short', 'spiky', 'long', 'mohawk', 'afro', 'ponytail', 'bob'] as const;
export const FACE_STYLES = ['plain', 'beard', 'stubble', 'shades', 'eyepatch', 'mustache', 'mask', 'goggles'] as const;
export const HAT_STYLES = ['none', 'cap', 'beanie', 'tophat', 'helmet', 'bandana', 'hardhat', 'fedora'] as const;
export const TOP_STYLES = ['tshirt', 'jacket', 'suit', 'hoodie', 'tank', 'vest'] as const;

// Hero parts (M9, art/heroArt.ts). Not in the random/creator lists above.
export type HairStyle = (typeof HAIR_STYLES)[number] | 'ninja' | 'saiyan' | 'saiyan3' | 'wild';
export type FaceStyle = (typeof FACE_STYLES)[number] | 'whiskers' | 'foxeyes' | 'scar';
export type HatStyle = (typeof HAT_STYLES)[number] | 'strawhat' | 'headband';
export type TopStyle = (typeof TOP_STYLES)[number] | 'tracksuit' | 'openvest' | 'gi';

/** Serializable look of a fighter (stored in profiles). */
export interface Appearance {
  skin: string;
  hair: HairStyle;
  hairColor: string;
  face: FaceStyle;
  hat: HatStyle;
  hatColor: string;
  top: TopStyle;
  topColor: string;
  accentColor: string;
  pantsColor: string;
  shoesColor: string;
  /** shorts: bare shins (heroes) */
  legs?: 'shorts';
  /** eye colour override (heroes' forms); default dark */
  eyes?: string;
  /** wrist bands / sash colour (gi, heroes) */
  trim?: string;
}

export function appearanceKey(a: Appearance): string {
  return [a.skin, a.hair, a.hairColor, a.face, a.hat, a.hatColor, a.top, a.topColor, a.accentColor, a.pantsColor, a.shoesColor, ...(a.legs ? [a.legs] : []), ...(a.eyes ? ['e' + a.eyes] : []), ...(a.trim ? ['t' + a.trim] : [])]
    .join('_')
    .replace(/#/g, '');
}

export function randomAppearance(rand: () => number = Math.random): Appearance {
  const pick = <T>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
  const hat = rand() < 0.45 ? pick(HAT_STYLES) : 'none';
  return {
    skin: pick(SKIN_TONES),
    hair: pick(HAIR_STYLES),
    hairColor: pick(HAIR_COLORS),
    face: rand() < 0.5 ? 'plain' : pick(FACE_STYLES),
    hat,
    hatColor: pick(CLOTH_COLORS),
    top: pick(TOP_STYLES),
    topColor: pick(CLOTH_COLORS),
    accentColor: pick(CLOTH_COLORS),
    pantsColor: pick(['#2a2a3a', '#1f3a7a', '#3a4a2a', '#4a3a2a', '#1e1e28', '#646b87', '#5a2a28']),
    shoesColor: pick(['#1e1614', '#3a2a20', '#f4f1ea', '#b8283a', '#2a2a3a']),
  };
}

/** Default looks for the human players. */
export const PLAYER_PRESETS: Appearance[] = [
  {
    skin: SKIN_TONES[1],
    hair: 'spiky',
    hairColor: HAIR_COLORS[1],
    face: 'plain',
    hat: 'bandana',
    hatColor: '#b8283a',
    top: 'tank',
    topColor: '#f4f1ea',
    accentColor: '#b8283a',
    pantsColor: '#1f3a7a',
    shoesColor: '#1e1614',
  },
  {
    skin: SKIN_TONES[3],
    hair: 'short',
    hairColor: HAIR_COLORS[0],
    face: 'shades',
    hat: 'none',
    hatColor: '#2f5ab8',
    top: 'jacket',
    topColor: '#2f5ab8',
    accentColor: '#f4f1ea',
    pantsColor: '#2a2a3a',
    shoesColor: '#f4f1ea',
  },
  {
    skin: SKIN_TONES[0],
    hair: 'long',
    hairColor: HAIR_COLORS[3],
    face: 'plain',
    hat: 'cap',
    hatColor: '#2f8a4a',
    top: 'hoodie',
    topColor: '#2f8a4a',
    accentColor: '#f8c840',
    pantsColor: '#3a4a2a',
    shoesColor: '#3a2a20',
  },
  {
    skin: SKIN_TONES[4],
    hair: 'afro',
    hairColor: HAIR_COLORS[0],
    face: 'beard',
    hat: 'none',
    hatColor: '#f8c840',
    top: 'suit',
    topColor: '#1e1e28',
    accentColor: '#f8c840',
    pantsColor: '#1e1e28',
    shoesColor: '#1e1614',
  },
];
