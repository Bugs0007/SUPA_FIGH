// The wire protocol between the game server and its clients (D70). JSON text frames, one message per frame.
// Shared by both sides; no Phaser, DOM or Node imports. Anything arriving from the network is untrusted, so the
// server runs every client frame through `parseClientMsg`, which returns a clean message or null.

import { DIFFICULTIES, type Difficulty } from '../ai/botData';
import { HEROES } from '../sim/data/heroes';
import type { SimEvent } from '../sim/events';
import type { Fighter } from '../sim/fighter';
import { MAPS } from '../sim/map/maps';
import type { GameMode, MatchConfig, MatchEvent } from '../sim/match';
import { MODIFIERS } from '../sim/data/modifiers';
import type { MatchRender, RenderSnapshot } from './renderState';

export const PROTOCOL_VERSION = 1;
/** most fighters in one match (humans + bots) */
export const MAX_FIGHTERS = 10;
/** local players one device may claim */
export const MAX_LOCAL = 2;
/** a snapshot is sent every this many 60 Hz ticks (30 Hz) */
export const SNAPSHOT_EVERY = 2;
/** frames bigger than this are dropped by the server (a look is < 1 KB) */
export const MAX_FRAME_BYTES = 8 * 1024;

export const MODES: readonly GameMode[] = ['brawl', 'deathmatch', 'koth', 'juggernaut', 'gungame', 'coop'];

// ------------------------------------------------------------------ room data

export interface BotSpec {
  /** hero id, '' = scrapyard fighter */
  hero: string;
  difficulty: Difficulty;
}

/** What the host edits in the lobby. */
export interface RoomConfig {
  mapId: string;
  mode: GameMode;
  roundsToWin: number;
  /** deathmatch length (s) */
  timeLimit: number;
  friendlyFire: boolean;
  weaponSpawnRate: number;
  heroPowers: boolean;
  chaos: boolean;
  modifiers: string[];
  bots: BotSpec[];
}

export const DEFAULT_ROOM_CONFIG: RoomConfig = {
  mapId: 'test',
  mode: 'brawl',
  roundsToWin: 5,
  timeLimit: 180,
  friendlyFire: false,
  weaponSpawnRate: 1,
  heroPowers: true,
  chaos: false,
  modifiers: [],
  bots: [],
};

/** One local player a device brings (a phone: 1, a laptop: up to 2). */
export interface SlotClaim {
  name: string;
  hero: string;
  /** keyboard / touch players jump with Up, pads with a button */
  upJumps: boolean;
  /** appearance, opaque to the server (flat object of strings / numbers), rendered by every client */
  look: Record<string, string | number | boolean>;
}

export interface PeerInfo {
  device: string;
  name: string;
  ready: boolean;
  connected: boolean;
  /** by local player index (0, 1): null where that player is not claimed */
  claims: (SlotClaim | null)[];
}

export interface RoomInfo {
  code: string;
  hostName: string;
  state: 'lobby' | 'playing';
  players: number;
  mapId: string;
  mode: GameMode;
}

// ------------------------------------------------------------------ client -> server

export type ClientMsg =
  | { t: 'hello'; v: number; device: string; name: string }
  | { t: 'list' }
  | { t: 'create' }
  | { t: 'join'; room: string }
  | { t: 'leave' }
  | { t: 'claim'; local: number; claim: SlotClaim }
  | { t: 'release'; local: number }
  | { t: 'config'; config: Partial<RoomConfig> }
  | { t: 'ready'; ready: boolean }
  | { t: 'start' }
  /** one local player's controls: packed intent (packIntent) + buttons pressed since the last frame (same bit layout) */
  | { t: 'in'; slot: number; seq: number; v: number; e: number; tick?: number; wid?: number }
  | { t: 'ping'; n: number };

// ------------------------------------------------------------------ server -> client

export type ServerMsg =
  /** `urls`: the addresses the server printed for friends to join at (shown in the lobby) */
  | { t: 'welcome'; v: number; device: string; urls?: string[] }
  | { t: 'rooms'; rooms: RoomInfo[] }
  | { t: 'room'; code: string; host: string; state: 'lobby' | 'playing'; config: RoomConfig; peers: PeerInfo[] }
  /** the match begins: build a mirror Match from `cfg`; `mine[local]` = this device's fighter index per claim */
  | { t: 'start'; cfg: MatchConfig; looks: SlotClaim['look'][]; mine: number[]; wid: number }
  | SnapMsg
  | PredMsg
  | { t: 'end' }
  | { t: 'err'; code: ErrorCode; msg: string }
  | { t: 'pong'; n: number };

export type ErrorCode = 'version' | 'badMessage' | 'noRoom' | 'notHost' | 'full' | 'notReady' | 'noPlayers' | 'state' | 'taken';

/**
 * Sent only to devices that predict (their `in` messages carry a `tick`), right after each snapshot: the complete,
 * exact state of the fighters that device plays, as of `tick`, so the client can re-run its own recent controls from
 * there (client-side prediction, D77). `late` counts control messages that reached the server after their tick.
 */
export interface PredMsg {
  t: 'pred';
  tick: number;
  wid: number;
  late: number;
  f: { slot: number; fighter: Fighter }[];
}

export interface SnapMsg {
  t: 'snap';
  /** world tick of this frame */
  tick: number;
  /** changes whenever the round's World is rebuilt (new round / new match): the mirror must be rebuilt too */
  wid: number;
  w: RenderSnapshot;
  /** match-level state, only when it changed (or every so often) */
  m?: MatchRender;
  /** sim events and match events since the previous snapshot */
  ev: SimEvent[];
  me: MatchEvent[];
}

// ------------------------------------------------------------------ validation

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  // printable text only: names are drawn in a bitmap font and shown to other players
  const s = v.replace(/[^\x20-\x7e]/g, '').trim();
  return s.slice(0, max);
}

function num(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

function int(v: unknown, min: number, max: number): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null;
}

export function sanitizeClaim(v: unknown): SlotClaim | null {
  if (!isObj(v)) return null;
  const name = str(v.name, 12);
  if (name === null) return null;
  const hero = typeof v.hero === 'string' && v.hero in HEROES ? v.hero : '';
  const look: SlotClaim['look'] = {};
  if (isObj(v.look)) {
    let n = 0;
    for (const [k, val] of Object.entries(v.look)) {
      if (++n > 24 || k.length > 24) break;
      if (typeof val === 'string') look[k] = val.slice(0, 24);
      else if (typeof val === 'number' && Number.isFinite(val)) look[k] = val;
      else if (typeof val === 'boolean') look[k] = val;
    }
  }
  return { name: name || 'PLAYER', hero, upJumps: v.upJumps === true, look };
}

/** Clean a partial room config from the host: unknown keys dropped, values clamped. */
export function sanitizeConfig(v: unknown): Partial<RoomConfig> | null {
  if (!isObj(v)) return null;
  const out: Partial<RoomConfig> = {};
  if (typeof v.mapId === 'string' && v.mapId in MAPS) out.mapId = v.mapId;
  if (typeof v.mode === 'string' && (MODES as readonly string[]).includes(v.mode)) out.mode = v.mode as GameMode;
  if ('roundsToWin' in v) out.roundsToWin = Math.round(num(v.roundsToWin, 1, 9, 5));
  if ('timeLimit' in v) out.timeLimit = Math.round(num(v.timeLimit, 30, 600, 180));
  if ('friendlyFire' in v) out.friendlyFire = v.friendlyFire === true;
  if ('weaponSpawnRate' in v) out.weaponSpawnRate = num(v.weaponSpawnRate, 0, 2, 1);
  if ('heroPowers' in v) out.heroPowers = v.heroPowers === true;
  if ('chaos' in v) out.chaos = v.chaos === true;
  if (Array.isArray(v.modifiers)) out.modifiers = v.modifiers.filter((m): m is string => typeof m === 'string' && MODIFIERS.some((d) => d.id === m)).slice(0, 8);
  if (Array.isArray(v.bots)) {
    out.bots = v.bots.slice(0, MAX_FIGHTERS).flatMap((b): BotSpec[] => {
      if (!isObj(b)) return [];
      const hero = typeof b.hero === 'string' && b.hero in HEROES ? b.hero : '';
      const difficulty = typeof b.difficulty === 'string' && b.difficulty in DIFFICULTIES ? (b.difficulty as Difficulty) : 'normal';
      return [{ hero, difficulty }];
    });
  }
  return out;
}

/** Parse one client frame. Returns null for anything malformed (the server drops it). */
export function parseClientMsg(text: string): ClientMsg | null {
  if (text.length > MAX_FRAME_BYTES) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(raw) || typeof raw.t !== 'string') return null;
  switch (raw.t) {
    case 'hello': {
      const device = str(raw.device, 40);
      const name = str(raw.name, 12);
      if (!device || name === null || typeof raw.v !== 'number') return null;
      return { t: 'hello', v: raw.v, device, name: name || 'PLAYER' };
    }
    case 'list':
    case 'create':
    case 'leave':
    case 'start':
      return { t: raw.t };
    case 'join': {
      const room = str(raw.room, 8);
      return room ? { t: 'join', room: room.toUpperCase() } : null;
    }
    case 'claim': {
      const local = int(raw.local, 0, MAX_LOCAL - 1);
      const claim = sanitizeClaim(raw.claim);
      return local === null || !claim ? null : { t: 'claim', local, claim };
    }
    case 'release': {
      const local = int(raw.local, 0, MAX_LOCAL - 1);
      return local === null ? null : { t: 'release', local };
    }
    case 'config': {
      const config = sanitizeConfig(raw.config);
      return config ? { t: 'config', config } : null;
    }
    case 'ready':
      return typeof raw.ready === 'boolean' ? { t: 'ready', ready: raw.ready } : null;
    case 'in': {
      const slot = int(raw.slot, 0, 63);
      const seq = int(raw.seq, 0, 0x7fffffff);
      const v = int(raw.v, 0, 0x7fff);
      const e = int(raw.e, 0, 0x7fff);
      if (slot === null || seq === null || v === null || e === null) return null;
      const msg: ClientMsg = { t: 'in', slot, seq, v, e };
      if (raw.tick !== undefined) {
        const tick = int(raw.tick, 0, 0x7fffffff);
        const wid = int(raw.wid, 0, 0x7fffffff);
        if (tick === null || wid === null) return null;
        msg.tick = tick;
        msg.wid = wid;
      }
      return msg;
    }
    case 'ping': {
      const n = int(raw.n, 0, 0x7fffffff);
      return n === null ? null : { t: 'ping', n };
    }
    default:
      return null;
  }
}
