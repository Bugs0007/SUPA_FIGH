// Player profiles for the two keyboard players: name, fighter (hero or scrapyard look). Set on the title
// screen, shared with the lobby's KEYBOARD 1/2 slots, persisted in localStorage.

import { PLAYER_PRESETS, type Appearance } from '../art/appearance';
import { HERO_ORDER } from '../sim/data/heroes';
import { load, save } from './storage';

export interface Profile {
  name: string;
  /** hero id ('' = scrapyard fighter with `look`) */
  hero: string;
  look: Appearance;
}

export const NAME_MAX = 8;
/** characters the pixel fonts can draw (names are shown in HUD, tags and the kill feed) */
const NAME_CHARS = /[A-Z0-9 .!?'\-_]/;

export function defaultName(i: number): string {
  return 'P' + (i + 1);
}

/** Uppercase, drop characters the font can't draw, trim, cap the length. Empty -> default name. */
export function sanitizeName(raw: string, i: number): string {
  const s = raw
    .toUpperCase()
    .split('')
    .filter((c) => NAME_CHARS.test(c))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);
  return s || defaultName(i);
}

function defaults(): Profile[] {
  return [0, 1].map((i) => ({ name: defaultName(i), hero: '', look: PLAYER_PRESETS[i] }));
}

export const profiles: Profile[] = (() => {
  const d = defaults();
  const stored = load<Partial<Profile>[] | null>('profiles', null);
  if (!Array.isArray(stored)) return d;
  return d.map((p, i) => {
    const s = stored[i] ?? {};
    const hero = typeof s.hero === 'string' && (HERO_ORDER as readonly string[]).includes(s.hero) ? s.hero : p.hero;
    return { name: sanitizeName(typeof s.name === 'string' ? s.name : p.name, i), hero, look: { ...p.look, ...(s.look ?? {}) } };
  });
})();

export function saveProfiles(): void {
  save('profiles', profiles);
}
