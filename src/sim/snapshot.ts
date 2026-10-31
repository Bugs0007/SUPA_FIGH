// Exact simulation snapshots (D70). A snapshot is a tree of plain JSON-safe data (numbers, strings, booleans,
// null, arrays, plain objects): restoring one into a freshly constructed World / Match and stepping on gives
// the same result as never having stopped. Static data (map, weapon and prop tables) is never part of a
// snapshot; it is rebuilt from the same constructor arguments.

import type { Bullet } from './projectile';
import type { BurningTile, FirePatch } from './fire';
import type { Fighter } from './fighter';
import type { Item } from './item';
import type { Prop } from './prop';
import type { SimEvent } from './events';

/** Deep copy of plain data. Typed arrays become plain arrays so the result survives JSON. */
export function clonePlain<T>(v: T): T {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(clonePlain) as unknown as T;
  if (ArrayBuffer.isView(v)) return Array.from(v as unknown as ArrayLike<number>) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v)) out[k] = clonePlain((v as Record<string, unknown>)[k]);
  return out as T;
}

/** A copy of an object without its `def` (a reference into static data that the restoring side already has). */
export function withoutDef<T extends { def: unknown }>(o: T): Omit<T, 'def'> {
  const { def: _def, ...rest } = o;
  return clonePlain(rest);
}

export type PropState = Omit<Prop, 'def'>;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Per-gimmick state, in the order `buildGimmicks` creates them (the `def` of each is rebuilt from the map). */
export interface GimmickSnapshot {
  movers: Record<string, unknown>[];
  hazards: Record<string, unknown>[];
  gravity: Record<string, unknown>[];
  drops: Record<string, unknown>[];
  waves: Record<string, unknown>[];
  cannons: Record<string, unknown>[];
}

export interface WorldSnapshot {
  tick: number;
  time: number;
  rng: number;
  bulletTime: number;
  bulletTimeOwner: number;
  suddenDeath: number;
  objective: Rect | null;
  drainAcc: number;
  fireStormTimer: number;
  nextItemId: number;
  nextPropId: number;
  weaponTimer: number;
  powerTimer: number;
  fighters: Fighter[];
  bullets: Bullet[];
  items: Item[];
  props: PropState[];
  fires: FirePatch[];
  burning: [number, BurningTile][];
  /** every tile (breakable maps change at runtime) */
  tiles: number[];
  gimmicks: GimmickSnapshot;
  events: SimEvent[];
}

export interface MatchSnapshot {
  round: number;
  phase: string;
  phaseTime: number;
  scores: [number, number][];
  roundWinner: number | null;
  matchWinner: number | null;
  stats: Record<string, number>[];
  events: Record<string, unknown>[];
  timeScale: number;
  cinematic: { x: number; y: number; ticks: number } | null;
  cineScale: number;
  slowmoTicks: number;
  slowmoLen: number;
  decideTimer: number;
  recentKills: { killer: number; tick: number }[];
  respawnAt: [number, number][];
  overtime: boolean;
  hill: Rect | null;
  hillTeam: number | null;
  hillTime: [number, number][];
  juggernaut: number;
  gunLevel: number[];
  wave: number;
  lives: number;
  waveBreak: number;
  waveBots: number[];
  reviveProgress: number[];
  roundModifiers: string[];
  world: WorldSnapshot;
}
