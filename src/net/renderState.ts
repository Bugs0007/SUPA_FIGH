// The render subset of the simulation (D71): everything the renderer, Juice, the HUD and the camera read, and
// nothing else. A server turns a World / Match into these small JSON-safe arrays every snapshot; a client
// applies them onto a "mirror" World / Match (built from the same config, never stepped) so the existing
// WorldRenderer, Juice, HUD and CameraDirector work unchanged. No Phaser, no DOM, no Node APIs.

import type { Fighter } from '../sim/fighter';
import { createItem, type Item } from '../sim/item';
import { createProp, type Prop } from '../sim/prop';
import type { FirePatch } from '../sim/fire';
import type { Match } from '../sim/match';
import { newBullet, type Bullet } from '../sim/projectile';
import { clonePlain, type Rect } from '../sim/snapshot';
import type { World } from '../sim/world';
import type { PropType } from '../sim/data/props';

// ------------------------------------------------------------------ field tables

/** n = number (2 decimals), b = boolean (0 / 1), s = string, i = fighter inventory */
type Kind = 'n' | 'b' | 's' | 'i';
type Cell = number | string | Cell[];
type Spec<T> = readonly (readonly [keyof T & string, Kind])[];

/**
 * Fighter fields that change during a round and are read by rendering / HUD / camera / audio. Static ones
 * (id, name, team, isBot, hero, master, upJumps) come from the match config on both sides; px / py are derived
 * by the interpolation. `tests/unit/netRender.test.ts` fails when render code reads a Fighter field that is
 * neither listed here nor known to be static.
 */
export const FIGHTER_SPEC: Spec<Fighter> = [
  ['x', 'n'], ['y', 'n'], ['vx', 'n'], ['vy', 'n'], ['w', 'n'], ['h', 'n'], ['grounded', 'b'], ['facing', 'n'],
  ['state', 's'], ['stateTime', 'n'], ['hp', 'n'], ['maxHp', 'n'], ['alive', 'b'], ['gone', 'b'], ['invuln', 'n'],
  ['wallSlide', 'n'], ['sprintDir', 'n'], ['airJumpTime', 'n'], ['aimAngle', 'n'], ['aimHeld', 'b'], ['crouchAim', 'b'],
  ['lastShotTime', 'n'], ['inv', 'i'], ['active', 'n'], ['combo', 'n'], ['airKick', 'b'], ['thrownBy', 'n'], ['rot', 'n'],
  ['burn', 'n'], ['speedBoost', 'n'], ['strengthBoost', 'n'], ['cook', 'n'], ['jetting', 'b'], ['carry', 'n'],
  ['ghost', 'b'], ['gx', 'n'], ['gy', 'n'], ['ghostCd', 'n'],
  ['power', 's'], ['powerLevel', 'n'], ['formHp', 'n'], ['powerTime', 'n'], ['powerMax', 'n'], ['specialCd', 'n'],
  ['charge', 'n'], ['specialKind', 's'], ['stretchLen', 'n'], ['stretchAngle', 'n'], ['baseCd', 'n'], ['baseUsed', 'n'],
  ['baseRecharge', 'n'], ['secondCd', 'n'], ['beamWidth', 'n'], ['flying', 'b'], ['anchorX', 'n'], ['anchorY', 'n'],
  ['recoverAt', 'n'], ['cloneCount', 'n'], ['cloneForm', 'n'], ['wallDir', 'n'], ['armReach', 'n'], ['armBack', 'b'],
  ['ropeLen', 'n'], ['grip', 's'],
];

/** Fighter fields both sides already have (they come from the spec the match was built with). */
export const FIGHTER_STATIC: readonly string[] = ['id', 'name', 'team', 'isBot', 'hero', 'master', 'upJumps', 'px', 'py'];

export const BULLET_SPEC: Spec<Bullet> = [
  ['x', 'n'], ['y', 'n'], ['vx', 'n'], ['vy', 'n'], ['ox', 'n'], ['oy', 'n'], ['owner', 'n'], ['weapon', 's'], ['kind', 's'],
  ['size', 'n'], ['traveled', 'n'], ['gravity', 'n'],
];
export const ITEM_SPEC: Spec<Item> = [
  ['id', 'n'], ['weaponId', 's'], ['ammo', 'n'], ['dur', 'n'], ['x', 'n'], ['y', 'n'], ['vx', 'n'], ['vy', 'n'], ['w', 'n'],
  ['h', 'n'], ['rot', 'n'], ['age', 'n'], ['thrownBy', 'n'], ['live', 'b'], ['stuck', 'b'], ['fuse', 'n'], ['armT', 'n'],
  ['grounded', 'b'],
];
export const PROP_SPEC: Spec<Prop> = [
  ['id', 'n'], ['type', 's'], ['x', 'n'], ['y', 'n'], ['vx', 'n'], ['vy', 'n'], ['w', 'n'], ['h', 'n'], ['rot', 'n'],
  ['hp', 'n'], ['fuse', 'n'], ['carriedBy', 'n'], ['thrownBy', 'n'], ['released', 'b'], ['grounded', 'b'],
];
export const FIRE_SPEC: Spec<FirePatch> = [
  ['x', 'n'], ['y', 'n'], ['vx', 'n'], ['vy', 'n'], ['w', 'n'], ['h', 'n'], ['life', 'n'], ['max', 'n'], ['owner', 'n'],
  ['grounded', 'b'],
];

// movers / hazards / zones / cannons: the sim objects hold a `def` that both sides rebuild from the map
// (seg / wait let a predicting client keep path movers running between snapshots)
const MOVER_FIELDS = ['x', 'y', 'vx', 'vy', 't', 'dir', 'seg', 'wait'] as const;
const HAZARD_FIELDS = ['x', 'y', 'w', 'h', 't', 'active', 'warn'] as const;
const CANNON_FIELDS = ['cd', 'shotAt'] as const;

const r2 = (v: number): number => Math.round(v * 100) / 100;

function encodeValue(v: unknown, kind: Kind): Cell {
  if (kind === 'n') return r2(v as number);
  if (kind === 'b') return v ? 1 : 0;
  if (kind === 's') return v as string;
  // inventory: [id, ammo, dur] per slot, 0 = empty
  return (v as ({ id: string; ammo: number; dur: number } | null)[]).map((s) => (s ? [s.id, s.ammo, r2(s.dur)] : 0));
}

function decodeValue(c: Cell, kind: Kind): unknown {
  if (kind === 'n') return c as number;
  if (kind === 'b') return c === 1;
  if (kind === 's') return c as string;
  return (c as (Cell[] | 0)[]).map((s) => (s ? { id: s[0] as string, ammo: s[1] as number, dur: s[2] as number } : null));
}

function encodeRow<T>(o: T, spec: Spec<T>): Cell[] {
  return spec.map(([k, kind]) => encodeValue(o[k], kind));
}

function decodeRow<T>(o: T, spec: Spec<T>, row: readonly Cell[]): T {
  spec.forEach(([k, kind], i) => {
    (o as Record<string, unknown>)[k] = decodeValue(row[i], kind);
  });
  return o;
}

// ------------------------------------------------------------------ world

/** A world frame. `fighters` has one entry per world slot: a row, or 0 for a clone slot that is out of play. */
export interface RenderSnapshot {
  tick: number;
  time: number;
  bulletTime: number;
  bulletTimeOwner: number;
  suddenDeath: number;
  fighters: (Cell[] | 0)[];
  bullets: Cell[][];
  items: Cell[][];
  props: Cell[][];
  fires: Cell[][];
  /** burning wooden tiles: [tx, ty, t, by] */
  burning: number[][];
  /** tiles that differ from the map as built: [index, kind] */
  tiles: [number, number][];
  movers: number[][];
  hazards: number[][];
  /** gravity zone on / off, cannons */
  zones: number[];
  cannons: number[][];
}

export function encodeWorld(w: World): RenderSnapshot {
  const base = w.parsed.tiles;
  const tiles: [number, number][] = [];
  for (let i = 0; i < base.length; i++) if (w.map.tiles[i] !== base[i]) tiles.push([i, w.map.tiles[i]]);
  const g = w.gimmicks;
  return {
    tick: w.tick,
    time: r2(w.time),
    bulletTime: r2(w.bulletTime),
    bulletTimeOwner: w.bulletTimeOwner,
    suddenDeath: w.suddenDeath,
    fighters: w.fighters.map((f) => (f.master >= 0 && f.gone && !f.alive ? 0 : encodeRow(f, FIGHTER_SPEC))),
    bullets: w.bullets.filter((b) => b.active).map((b) => encodeRow(b, BULLET_SPEC)),
    items: w.items.filter((i) => i.active).map((i) => encodeRow(i, ITEM_SPEC)),
    props: w.props.filter((p) => p.active).map((p) => encodeRow(p, PROP_SPEC)),
    fires: w.fires.filter((f) => f.active).map((f) => encodeRow(f, FIRE_SPEC)),
    burning: [...w.burningTiles.values()].map((b) => [b.tx, b.ty, r2(b.t), b.by]),
    tiles,
    movers: g.movers.map((m) => MOVER_FIELDS.map((k) => r2(m[k]))),
    hazards: g.hazards.map((h) => HAZARD_FIELDS.map((k) => (typeof h[k] === 'boolean' ? (h[k] ? 1 : 0) : r2(h[k] as number)))),
    zones: g.gravity.map((z) => (z.active ? 1 : 0)),
    cannons: g.cannons.map((c) => CANNON_FIELDS.map((k) => r2(c[k]))),
  };
}

/** The previous frame's positions, so the renderer can interpolate (px / py) from there to here. */
export interface PrevPositions {
  fighters: ({ x: number; y: number } | null)[];
  items: Map<number, { x: number; y: number }>;
  props: Map<number, { x: number; y: number }>;
  movers: { x: number; y: number }[];
}

export function positionsOf(w: World): PrevPositions {
  return {
    fighters: w.fighters.map((f) => ({ x: f.x, y: f.y })),
    items: new Map(w.items.map((i) => [i.id, { x: i.x, y: i.y }])),
    props: new Map(w.props.map((p) => [p.id, { x: p.x, y: p.y }])),
    movers: w.gimmicks.movers.map((m) => ({ x: m.x, y: m.y })),
  };
}

/**
 * Overwrite a mirror world with a frame. `prev` (the positions the mirror had before) feeds px / py so the
 * renderer's alpha blends between the two frames; without it entities snap (alpha has no effect).
 */
export function applyWorld(w: World, s: RenderSnapshot, prev?: PrevPositions): void {
  w.tick = s.tick;
  w.time = s.time;
  w.bulletTime = s.bulletTime;
  w.bulletTimeOwner = s.bulletTimeOwner;
  w.suddenDeath = s.suddenDeath;

  s.fighters.forEach((row, i) => {
    const f = w.fighters[i];
    if (row === 0) {
      f.alive = false;
      f.gone = true;
      f.hp = 0;
      f.state = 'dead';
      f.px = f.x;
      f.py = f.y;
      return;
    }
    const was = prev?.fighters[i];
    decodeRow(f, FIGHTER_SPEC, row);
    // a respawn / clone appearing must not slide across the map
    const jump = was && Math.hypot(f.x - was.x, f.y - was.y) > 64;
    f.px = was && !jump ? was.x : f.x;
    f.py = was && !jump ? was.y : f.y;
  });

  w.bullets = s.bullets.map((row) => {
    const b = decodeRow(newBullet(), BULLET_SPEC, row);
    b.active = true;
    b.px = b.x;
    b.py = b.y;
    return b;
  });
  w.items = s.items.map((row) => {
    const it = createItem(row[0] as number, row[1] as string, row[2] as number, row[3] as number, 0, 0);
    decodeRow(it, ITEM_SPEC, row);
    const was = prev?.items.get(it.id);
    it.px = was?.x ?? it.x;
    it.py = was?.y ?? it.y;
    return it;
  });
  w.props = s.props.map((row) => {
    const p = createProp(row[0] as number, row[1] as PropType, 0, 0);
    decodeRow(p, PROP_SPEC, row);
    const was = prev?.props.get(p.id);
    p.px = was?.x ?? p.x;
    p.py = was?.y ?? p.y;
    return p;
  });
  w.fires = s.fires.map((row) => {
    const p: FirePatch = { active: true, life: 0, max: 1, owner: -1, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, w: 6, h: 4, grounded: false };
    decodeRow(p, FIRE_SPEC, row);
    p.px = p.x;
    p.py = p.y;
    return p;
  });
  w.burningTiles = new Map(s.burning.map(([tx, ty, t, by]) => [ty * w.map.w + tx, { tx, ty, t, by }]));

  // tiles: back to the built map, then the edits (map.set queues the changes the renderer redraws)
  const base = w.parsed.tiles;
  const edits = new Map(s.tiles);
  for (let i = 0; i < base.length; i++) {
    const want = edits.get(i) ?? base[i];
    if (w.map.tiles[i] !== want) w.map.set(i % w.map.w, Math.floor(i / w.map.w), want);
  }

  const g = w.gimmicks;
  g.movers.forEach((m, i) => {
    const r = s.movers[i];
    m.px = prev?.movers[i]?.x ?? r[0];
    m.py = prev?.movers[i]?.y ?? r[1];
    MOVER_FIELDS.forEach((k, j) => {
      (m as unknown as Record<string, number>)[k] = r[j];
    });
  });
  g.hazards.forEach((h, i) => {
    HAZARD_FIELDS.forEach((k, j) => {
      (h as unknown as Record<string, number | boolean>)[k] = typeof h[k] === 'boolean' ? s.hazards[i][j] === 1 : s.hazards[i][j];
    });
  });
  g.gravity.forEach((z, i) => {
    z.active = s.zones[i] === 1;
  });
  g.cannons.forEach((c, i) => {
    CANNON_FIELDS.forEach((k, j) => {
      c[k] = s.cannons[i][j];
    });
  });
}

// ------------------------------------------------------------------ match

/** Match-level state the HUD / camera / world renderer read. Small; sent whenever it changes. */
export interface MatchRender {
  round: number;
  roundModifiers: string[];
  phase: string;
  phaseTime: number;
  scores: [number, number][];
  roundWinner: number | null;
  matchWinner: number | null;
  stats: Record<string, number>[];
  timeScale: number;
  cinematic: { x: number; y: number; ticks: number } | null;
  overtime: boolean;
  hill: Rect | null;
  hillTeam: number | null;
  juggernaut: number;
  gunLevel: number[];
  wave: number;
  lives: number;
  reviveProgress: number[];
}

export function encodeMatch(m: Match): MatchRender {
  return {
    round: m.round,
    roundModifiers: [...m.roundModifiers],
    phase: m.phase,
    phaseTime: r2(m.phaseTime),
    scores: [...m.scores],
    roundWinner: m.roundWinner,
    matchWinner: m.matchWinner,
    stats: clonePlain(m.stats) as unknown as Record<string, number>[],
    timeScale: r2(m.timeScale),
    cinematic: m.cinematic ? { ...m.cinematic } : null,
    overtime: m.overtime,
    hill: m.hill ? { ...m.hill } : null,
    hillTeam: m.hillTeam,
    juggernaut: m.juggernaut,
    gunLevel: [...m.gunLevel],
    wave: m.wave,
    lives: m.lives,
    reviveProgress: m.reviveProgress.map(r2),
  };
}

/** Apply match-level state onto a mirror Match whose world is already for `s.round`. */
export function applyMatch(m: Match, s: MatchRender): void {
  m.round = s.round;
  m.roundModifiers = s.roundModifiers;
  m.phase = s.phase as Match['phase'];
  m.phaseTime = s.phaseTime;
  m.scores = new Map(s.scores);
  m.roundWinner = s.roundWinner;
  m.matchWinner = s.matchWinner;
  m.stats = s.stats as unknown as Match['stats'];
  m.timeScale = s.timeScale;
  m.cinematic = s.cinematic;
  m.overtime = s.overtime;
  m.hill = s.hill;
  m.world.objective = s.hill;
  m.hillTeam = s.hillTeam;
  m.juggernaut = s.juggernaut;
  m.gunLevel = s.gunLevel;
  m.wave = s.wave;
  m.lives = s.lives;
  m.reviveProgress = s.reviveProgress;
}
