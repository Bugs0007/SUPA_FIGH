// Shareable match setup: the lobby (rules + fighter slots) packed into a URL hash, so a plain hyperlink opens the
// game straight into Match Setup with the same arena, mode and fighters. Phaser-free; decoding never trusts the
// link (every field is whitelisted / clamped) and never throws.

import { PLAYER_PRESETS, sanitizeAppearance, type Appearance } from '../art/appearance';
import { HEROES } from '../sim/data/heroes';
import { pokemonSpecies, pokemonTeam } from '../sim/data/pokemon';
import { MAP_LIST } from '../sim/map/maps';
import { DIFF_ORDER, MAX_SLOTS, MODE_ORDER, SLOT_KINDS, SUDDEN_DEATH_OPTIONS, TIME_OPTIONS, WEAPON_RATES, defaultLobby, slotStartForm, type LobbyCfg, type SlotCfg } from './lobby';

/** Hash key of a share link: `https://game/#setup=<payload>`. */
export const SHARE_KEY = 'setup';
const VERSION = 1;
const LOOK_FIELDS = ['skin', 'hair', 'hairColor', 'face', 'hat', 'hatColor', 'top', 'topColor', 'accentColor', 'pantsColor', 'shoesColor'] as const;
const COLOR_FIELDS = new Set<string>(['skin', 'hairColor', 'hatColor', 'topColor', 'accentColor', 'pantsColor', 'shoesColor']);

type WireSlot = 0 | [number, number, number, string, number, string[]?, string?, string[]?, string?];
interface Wire {
  v: number;
  /** map, mode, rounds, time, sudden death, friendly fire, weapons, chaos, hero powers, fall death */
  r: [string, number, number, number, number, number, number, number, number, number];
  s: WireSlot[];
}

const toB64 = (s: string): string => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64 = (s: string): string => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

const int = (v: unknown, lo: number, hi: number, dflt: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : NaN;
  return n >= lo && n <= hi ? n : dflt;
};
const oneOf = <T extends number>(v: unknown, list: readonly T[], dflt: T): T => (list.includes(v as T) ? (v as T) : dflt);

/** The lobby as a compact URL-safe string (the part after `#setup=`). */
export function encodeLobby(c: LobbyCfg): string {
  const slots: WireSlot[] = c.slots.slice(0, MAX_SLOTS).map((s): WireSlot => {
    if (s.kind === 'empty') return 0;
    const hero = s.hero && HEROES[s.hero] ? s.hero : '';
    const abilityHero = !hero && s.abilityHero && HEROES[s.abilityHero] ? s.abilityHero : '';
    const row: WireSlot = [SLOT_KINDS.indexOf(s.kind), s.team, DIFF_ORDER.indexOf(s.difficulty), hero, hero || abilityHero ? slotStartForm(s) : 0];
    // heroes bring their own look; only custom fighters need theirs in the link
    if (!hero) row.push(LOOK_FIELDS.map((f) => String(s.look[f]).replace(/^#/, '')));
    if (hero === 'ash') {
      row[6] = pokemonSpecies(s.pokemon);
      row[7] = pokemonTeam(s.pokemonTeam, pokemonSpecies(s.pokemon));
    }
    if (abilityHero) row[8] = abilityHero;
    return row;
  });
  while (slots.length && slots[slots.length - 1] === 0) slots.pop();
  const wire: Wire = {
    v: VERSION,
    r: [c.mapId, MODE_ORDER.indexOf(c.mode), c.roundsToWin, c.timeLimit, c.suddenDeath, c.friendlyFire ? 1 : 0, c.weaponSpawnRate, c.chaos ? 1 : 0, c.heroPowers ? 1 : 0, c.fallDeath ? 1 : 0],
    s: slots,
  };
  return toB64(JSON.stringify(wire));
}

function decodeSlot(raw: unknown, fallback: SlotCfg): SlotCfg {
  if (!Array.isArray(raw)) return { ...fallback, kind: 'empty' };
  const kind = SLOT_KINDS[int(raw[0], 0, SLOT_KINDS.length - 1, 0)];
  const hero = typeof raw[3] === 'string' && HEROES[raw[3]] ? raw[3] : '';
  const abilityHero = !hero && typeof raw[8] === 'string' && HEROES[raw[8]] ? raw[8] : undefined;
  let look: Appearance = { ...fallback.look };
  if (!hero && Array.isArray(raw[5])) {
    const o: Record<string, unknown> = {};
    LOOK_FIELDS.forEach((f, i) => {
      const v = raw[5][i];
      o[f] = COLOR_FIELDS.has(f) && typeof v === 'string' ? '#' + v : v;
    });
    look = sanitizeAppearance(o, PLAYER_PRESETS[0]);
  }
  const slot: SlotCfg = {
    kind,
    team: int(raw[1], 0, 4, 0),
    difficulty: DIFF_ORDER[int(raw[2], 0, DIFF_ORDER.length - 1, 1)],
    hero,
    abilityHero,
    form: int(raw[4], 0, 9, 0),
    look,
    ...(hero === 'ash' ? { pokemon: pokemonSpecies(raw[6]), pokemonTeam: pokemonTeam(raw[7], pokemonSpecies(raw[6])) } : {}),
  };
  slot.form = slotStartForm(slot);
  return slot;
}

/** Parse the payload of a share link; null when it isn't one of ours. */
export function decodeLobby(payload: string): LobbyCfg | null {
  try {
    const wire = JSON.parse(fromB64(payload)) as Partial<Wire>;
    if (!wire || wire.v !== VERSION || !Array.isArray(wire.r) || !Array.isArray(wire.s)) return null;
    const d = defaultLobby();
    const [map, mode, rounds, time, sudden, ff, weapons, chaos, powers, fall] = wire.r as unknown[];
    const mapId = typeof map === 'string' && (map === 'random' || MAP_LIST.some((m) => m.id === map)) ? map : d.mapId;
    return {
      mapId,
      mode: MODE_ORDER[int(mode, 0, MODE_ORDER.length - 1, 0)],
      roundsToWin: int(rounds, 0, 10, d.roundsToWin),
      timeLimit: oneOf(time, TIME_OPTIONS, d.timeLimit),
      suddenDeath: oneOf(sudden, SUDDEN_DEATH_OPTIONS, d.suddenDeath),
      friendlyFire: ff === 1,
      weaponSpawnRate: oneOf(weapons, WEAPON_RATES, d.weaponSpawnRate),
      chaos: chaos === 1,
      heroPowers: powers !== 0,
      fallDeath: fall !== 0,
      slots: d.slots.map((def, i) => decodeSlot(wire.s![i] ?? 0, def)),
    };
  } catch {
    return null;
  }
}

/** The share link for a lobby, on top of `base` (the page URL: its query is kept, its hash replaced). */
export function shareUrl(c: LobbyCfg, base: string): string {
  const u = new URL(base);
  u.hash = `${SHARE_KEY}=${encodeLobby(c)}`;
  return u.toString();
}

/** The lobby a page hash (`location.hash`) carries, or null. */
export function lobbyFromHash(hash: string): LobbyCfg | null {
  const m = new RegExp(`^#?${SHARE_KEY}=([A-Za-z0-9_-]+)$`).exec(hash);
  return m ? decodeLobby(m[1]) : null;
}
