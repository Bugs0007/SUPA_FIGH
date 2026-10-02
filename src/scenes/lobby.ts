// Lobby data model: persisted match setup (10 slots + rules) and conversion to MatchSceneData.
// Kept free of Phaser so it can be unit tested.

import { randomAppearance, PLAYER_PRESETS, type Appearance } from '../art/appearance';
import { heroLook } from '../art/heroArt';
import { hexToNum, TEAM_COLORS } from '../art/palette';
import type { Difficulty } from '../ai/botData';
import { load, save } from '../game/storage';
import type { GameMode } from '../sim/match';
import type { MatchSceneData, PlayerSetup } from './MatchScene';
import { PLAYER_COLORS } from './ui';

export const SLOT_KINDS = ['empty', 'kb0', 'kb1', 'pad0', 'pad1', 'pad2', 'pad3', 'bot'] as const;
export type SlotKind = (typeof SLOT_KINDS)[number];
export const SLOT_KIND_LABELS: Record<SlotKind, string> = {
  empty: '- EMPTY -',
  kb0: 'KEYBOARD 1',
  kb1: 'KEYBOARD 2',
  pad0: 'GAMEPAD 1',
  pad1: 'GAMEPAD 2',
  pad2: 'GAMEPAD 3',
  pad3: 'GAMEPAD 4',
  bot: 'BOT',
};
export const DIFF_ORDER: Difficulty[] = ['easy', 'normal', 'hard', 'expert'];
export const WEAPON_RATES = [0, 1, 2];
export const WEAPON_RATE_LABELS = ['NONE', 'NORMAL', 'LOTS'];
export const SUDDEN_DEATH_OPTIONS = [0, 45, 75, 120];
export const TIME_OPTIONS = [60, 120, 180, 300];

export interface SlotCfg {
  kind: SlotKind;
  /** 0 = solo (free for all), 1..4 = teams */
  team: number;
  difficulty: Difficulty;
  look: Appearance;
  /** hero id (sim/data/heroes.ts), '' = scrapyard fighter with the custom look */
  hero: string;
}

export interface LobbyCfg {
  slots: SlotCfg[];
  mapId: string;
  mode: GameMode;
  roundsToWin: number;
  timeLimit: number;
  friendlyFire: boolean;
  weaponSpawnRate: number;
  suddenDeath: number;
  /** flip a chaos modifier card every round */
  chaos: boolean;
  /** rare hero power-up pickups (M9) */
  heroPowers: boolean;
}

export const MAX_SLOTS = 10;

export function defaultLobby(): LobbyCfg {
  const slots: SlotCfg[] = Array.from({ length: MAX_SLOTS }, (_, i) => ({
    kind: i === 0 ? 'kb0' : i === 1 ? 'kb1' : i < 5 ? 'bot' : 'empty',
    team: 0,
    difficulty: 'normal',
    look: i < 2 ? PLAYER_PRESETS[i] : randomAppearance(),
    hero: '',
  }));
  return { slots, mapId: 'test', mode: 'brawl', roundsToWin: 5, timeLimit: 180, friendlyFire: false, weaponSpawnRate: 1, suddenDeath: 75, chaos: false, heroPowers: true };
}

export function loadLobby(): LobbyCfg {
  const d = defaultLobby();
  const s = load<Partial<LobbyCfg> | null>('lobby', null);
  if (!s) return d;
  const out = { ...d, ...s };
  out.slots = d.slots.map((def, i) => ({ ...def, ...(s.slots?.[i] ?? {}) }));
  return out;
}

export function saveLobby(c: LobbyCfg): void {
  save('lobby', c);
}

/** Why the lobby can't start yet (null = ready). */
export function lobbyProblem(c: LobbyCfg): string | null {
  const active = c.slots.filter((s) => s.kind !== 'empty');
  if (active.length < 2) return 'NEED AT LEAST 2 FIGHTERS';
  if (c.mode === 'coop') {
    if (!active.some((s) => s.kind === 'bot')) return 'CO-OP NEEDS BOT SLOTS (THE ENEMY WAVES)';
    if (!active.some((s) => s.kind !== 'bot')) return 'CO-OP NEEDS AT LEAST ONE HUMAN';
  } else if (c.mode !== 'juggernaut' && c.mode !== 'gungame') {
    const teams = new Set(active.map((s, i) => (s.team > 0 ? s.team : 100 + i)));
    if (teams.size < 2) return 'EVERYONE IS ON THE SAME TEAM';
  }
  const inputs = active.filter((s) => s.kind !== 'bot').map((s) => s.kind);
  if (new Set(inputs).size !== inputs.length) return 'TWO SLOTS USE THE SAME CONTROLS';
  return null;
}

/** Build the match from the lobby. Humans get P1..P4 labels/colors in slot order. */
export function lobbyToMatch(c: LobbyCfg, seed: number): MatchSceneData {
  const players: PlayerSetup[] = [];
  let human = 0;
  let bot = 0;
  for (const s of c.slots) {
    if (s.kind === 'empty') continue;
    const isBot = s.kind === 'bot';
    const label = isBot ? 'B' + ++bot : 'P' + ++human;
    const color = s.team > 0 ? hexToNum(TEAM_COLORS[s.team]) : isBot ? hexToNum(TEAM_COLORS[0]) : PLAYER_COLORS[(human - 1) % PLAYER_COLORS.length];
    players.push({
      spawn: { name: label, team: s.team, isBot, upJumps: s.kind === 'kb0' || s.kind === 'kb1', hero: s.hero || undefined },
      look: heroLook(s.hero, s.look),
      color,
      label,
      input: s.kind,
      difficulty: s.difficulty,
    });
  }
  return {
    players,
    config: {
      mapId: c.mapId,
      mode: c.mode,
      fighters: players.map((p) => p.spawn),
      roundsToWin: c.roundsToWin,
      timeLimit: c.timeLimit,
      suddenDeath: c.suddenDeath,
      friendlyFire: c.friendlyFire,
      weaponSpawnRate: c.weaponSpawnRate,
      chaos: c.chaos,
      heroPowers: c.heroPowers,
      seed,
    },
  };
}
