import { CLOTH_COLORS, HAIR_COLORS, SKIN_TONES } from './palette';

export const HAIR_STYLES = ['none', 'buzz', 'short', 'spiky', 'long', 'mohawk', 'afro', 'ponytail', 'bob'] as const;
export const FACE_STYLES = ['plain', 'beard', 'stubble', 'shades', 'eyepatch', 'mustache', 'mask', 'goggles'] as const;
export const HAT_STYLES = ['none', 'cap', 'beanie', 'tophat', 'helmet', 'bandana', 'hardhat', 'fedora'] as const;
export const TOP_STYLES = ['tshirt', 'jacket', 'suit', 'hoodie', 'tank', 'vest'] as const;

// Hero parts (M9, art/heroArt.ts). Not in the random/creator lists above.
export type HairStyle = (typeof HAIR_STYLES)[number] | 'ninja' | 'saiyan' | 'saiyan2' | 'saiyan3' | 'wild' | 'fox' | 'uchiha';
export type FaceStyle = (typeof FACE_STYLES)[number] | 'whiskers' | 'foxeyes' | 'scar';
export type HatStyle = (typeof HAT_STYLES)[number] | 'strawhat' | 'headband';
export type TopStyle = (typeof TOP_STYLES)[number] | 'tracksuit' | 'openvest' | 'gi' | 'chakra' | 'boundman' | 'openrobe';

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
  /** Signature anatomy and costume details; absent on custom scrappers. */
  design?: 'naruto' | 'luffy' | 'goku' | 'sasuke';
  /** Visual transformation level; used by the sprite baker, never by physics. */
  form?: number;
}

const HERO_HAIR = ['ninja', 'saiyan', 'saiyan2', 'saiyan3', 'wild', 'fox', 'uchiha'];
const HERO_FACE = ['whiskers', 'foxeyes', 'scar'];
const HERO_HAT = ['strawhat', 'headband'];
const HERO_TOP = ['tracksuit', 'openvest', 'gi', 'chakra', 'boundman', 'openrobe'];
const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * A look that came over the network (another player's choice) turned into a safe Appearance: every style must
 * be a known one and every colour a #rrggbb, anything else falls back to `fallback`'s value.
 */
export function sanitizeAppearance(raw: Record<string, unknown>, fallback: Appearance): Appearance {
  const style = <T extends string>(k: string, ok: readonly string[], dflt: T): T => (typeof raw[k] === 'string' && ok.includes(raw[k] as string) ? (raw[k] as T) : dflt);
  const color = (k: string, dflt: string): string => (typeof raw[k] === 'string' && HEX.test(raw[k] as string) ? (raw[k] as string) : dflt);
  const out: Appearance = {
    skin: color('skin', fallback.skin),
    hair: style('hair', [...HAIR_STYLES, ...HERO_HAIR], fallback.hair),
    hairColor: color('hairColor', fallback.hairColor),
    face: style('face', [...FACE_STYLES, ...HERO_FACE], fallback.face),
    hat: style('hat', [...HAT_STYLES, ...HERO_HAT], fallback.hat),
    hatColor: color('hatColor', fallback.hatColor),
    top: style('top', [...TOP_STYLES, ...HERO_TOP], fallback.top),
    topColor: color('topColor', fallback.topColor),
    accentColor: color('accentColor', fallback.accentColor),
    pantsColor: color('pantsColor', fallback.pantsColor),
    shoesColor: color('shoesColor', fallback.shoesColor),
  };
  return out;
}

/** The look a profile sends over the network: the Appearance as flat primitives. */
export function lookToWire(a: Appearance): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(a)) if (typeof v === 'string' || typeof v === 'number') out[k] = v;
  return out;
}

export function appearanceKey(a: Appearance): string {
  return [a.skin, a.hair, a.hairColor, a.face, a.hat, a.hatColor, a.top, a.topColor, a.accentColor, a.pantsColor, a.shoesColor, ...(a.legs ? [a.legs] : []), ...(a.eyes ? ['e' + a.eyes] : []), ...(a.trim ? ['t' + a.trim] : []), ...(a.design ? [a.design, String(a.form ?? 0)] : [])]
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
