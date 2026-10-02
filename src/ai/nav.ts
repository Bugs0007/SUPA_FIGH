// Navigation graph for bots, built from map geometry.
//
// Nodes: every cell a fighter can stand in (feet on a solid/one-way tile, headroom for a standing
// fighter) plus ladder cells. Edges:
//   walk   — to the horizontally adjacent node (closed-loop: steer toward the node center)
//   climb  — up/down a ladder column
//   jump / fall / drop — found by SIMULATING the real fighter code in a sandbox world with scripted
//            inputs (MANEUVERS). Whatever the physics actually does is what the graph records, so bots
//            replay exactly the same input script and land where the graph says (open-loop).
// Built once per map definition (cached). Destructible tiles can invalidate edges at runtime; the bot
// notices (it doesn't arrive), penalizes the edge and re-plans.

import { DT, TILE } from '../sim/constants';
import { createFighter, type Fighter, type FighterSpawn } from '../sim/fighter';
import { emptyIntent, type Intent } from '../sim/intent';
import type { MapDef } from '../sim/map/mapData';
import type { TileMap } from '../sim/map/tilemap';
import { World } from '../sim/world';

export type EdgeKind = 'walk' | 'climb' | 'jump' | 'fall' | 'drop';

export interface NavEdge {
  to: number;
  kind: EdgeKind;
  /** estimated seconds */
  cost: number;
  /** maneuver index (jump/fall/drop) */
  m: number;
  dir: -1 | 0 | 1;
}

export interface NavNode {
  id: number;
  tx: number;
  ty: number;
  /** center x and feet y (px) */
  x: number;
  y: number;
  /** can stand here (otherwise it's a mid-air ladder cell) */
  stand: boolean;
  ladder: boolean;
  edges: NavEdge[];
}

/** Input policy for a scripted move. t = ticks since the maneuver started. */
export type Policy = (t: number, f: Fighter, dir: number, out: Intent) => void;

interface Maneuver {
  kind: 'jump' | 'fall' | 'drop';
  /** only from nodes standing on a one-way tile */
  oneWayOnly?: boolean;
  /** run for both directions (false = once, dir 0) */
  directional: boolean;
  policy: Policy;
}

const hold = (out: Intent, f: Fighter, dir: number) => {
  // hanging on a ledge: holding toward the wall climbs up
  out.moveX = f.state === 'ledge' ? f.facing : dir;
};

/** The scripted moves. Index = NavEdge.m. Keep stable: bots replay these by index. */
export const MANEUVERS: Maneuver[] = [
  // walk off the edge, keep running
  { kind: 'fall', directional: true, policy: (_t, f, d, o) => hold(o, f, d) },
  // walk off the edge, then let go (short fall)
  { kind: 'fall', directional: true, policy: (_t, f, d, o) => hold(o, f, f.grounded ? d : 0) },
  // full running jump
  { kind: 'jump', directional: true, policy: (t, f, d, o) => ((o.jump = t < 20), hold(o, f, d)) },
  // full jump, steer late (up then over)
  { kind: 'jump', directional: true, policy: (t, f, d, o) => ((o.jump = t < 20), hold(o, f, t >= 9 ? d : 0)) },
  // short hop
  { kind: 'jump', directional: true, policy: (t, f, d, o) => ((o.jump = t < 4), hold(o, f, d)) },
  // full jump, steer early then stop (lands short)
  { kind: 'jump', directional: true, policy: (t, f, d, o) => ((o.jump = t < 20), hold(o, f, t < 10 ? d : 0)) },
  // double jump with steering
  { kind: 'jump', directional: true, policy: (t, f, d, o) => ((o.jump = t < 12 || (t >= 15 && t < 34)), hold(o, f, d)) },
  // double jump near the apex, steer late
  { kind: 'jump', directional: true, policy: (t, f, d, o) => ((o.jump = t < 18 || (t >= 21 && t < 40)), hold(o, f, t >= 6 ? d : 0)) },
  // double jump straight up, then over
  { kind: 'jump', directional: true, policy: (t, f, d, o) => ((o.jump = t < 16 || (t >= 19 && t < 38)), hold(o, f, t >= 30 ? d : 0)) },
  // straight up (onto a one-way platform above)
  { kind: 'jump', directional: false, policy: (t, _f, _d, o) => ((o.jump = t < 20), (o.moveX = 0)) },
  // double straight up
  { kind: 'jump', directional: false, policy: (t, _f, _d, o) => ((o.jump = t < 16 || (t >= 19 && t < 38)), (o.moveX = 0)) },
  // drop through a one-way platform
  { kind: 'drop', oneWayOnly: true, directional: false, policy: (t, _f, _d, o) => ((o.moveY = t < 3 ? 1 : 0), (o.jump = t === 1)) },
  // drop through, then drift
  { kind: 'drop', oneWayOnly: true, directional: true, policy: (t, f, d, o) => ((o.moveY = t < 3 ? 1 : 0), (o.jump = t === 1), hold(o, f, t >= 6 ? d : 0)) },
];

const JUMP_PENALTY = 0.12;
const MAX_TICKS = 150;

export class NavGraph {
  readonly nodes: NavNode[] = [];
  readonly w: number;
  readonly h: number;
  /** node id per cell (-1 = none) */
  readonly cell: Int32Array;
  /** build time (ms) — reported by tests/tools */
  buildMs = 0;

  constructor(def: MapDef) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const spec: FighterSpawn = { name: 'nav', team: 0, isBot: true, upJumps: false };
    const sandbox = new World(def, [spec], { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 1);
    sandbox.props.length = 0;
    // static geometry only: no movers/hazards/supply drops; only permanent gravity zones affect jumps
    sandbox.gimmicks = {
      movers: [],
      hazards: [],
      drops: [],
      gravity: sandbox.gimmicks.gravity.filter((z) => !z.def.toggle),
    };
    const map = sandbox.map;
    this.w = map.w;
    this.h = map.h;
    this.cell = new Int32Array(map.w * map.h).fill(-1);

    for (let ty = 0; ty < map.h; ty++) {
      for (let tx = 0; tx < map.w; tx++) {
        const stand = standable(map, tx, ty);
        const ladder = map.isLadder(tx, ty) && !map.isSolid(tx, ty);
        if (!stand && !ladder) continue;
        const id = this.nodes.length;
        this.nodes.push({ id, tx, ty, x: tx * TILE + TILE / 2, y: (ty + 1) * TILE, stand, ladder, edges: [] });
        this.cell[ty * map.w + tx] = id;
      }
    }

    for (const n of this.nodes) {
      // walk: to an adjacent standable cell (from standing, or stepping off a ladder)
      for (const d of [-1, 1] as const) {
        const m = this.at(n.tx + d, n.ty);
        if (m && m.stand) n.edges.push({ to: m.id, kind: 'walk', cost: TILE / 118, m: -1, dir: d });
      }
      // climb
      if (n.ladder) {
        const up = this.at(n.tx, n.ty - 1);
        if (up) n.edges.push({ to: up.id, kind: 'climb', cost: TILE / 82 + 0.05, m: -1, dir: 0 });
      }
      if (map.isLadder(n.tx, n.ty + 1)) {
        const down = this.at(n.tx, n.ty + 1);
        if (down) n.edges.push({ to: down.id, kind: 'climb', cost: TILE / 82 + 0.05, m: -1, dir: 0 });
      }
    }

    // simulated maneuvers from every standable node
    const f = sandbox.fighters[0];
    const inp = emptyIntent();
    for (const n of this.nodes) {
      if (!n.stand) continue;
      const onOneWay = !map.isSolid(n.tx, n.ty + 1) && map.isOneWay(n.tx, n.ty + 1);
      const best = new Map<number, NavEdge>();
      for (const e of n.edges) best.set(e.to, e);
      MANEUVERS.forEach((mv, mi) => {
        if (mv.oneWayOnly && !onOneWay) return;
        const dirs: (-1 | 0 | 1)[] = mv.directional ? [-1, 1] : [0];
        for (const dir of dirs) {
          if (mv.kind === 'fall') {
            // only worth simulating at a ledge
            const ahead = this.at(n.tx + dir, n.ty);
            if (ahead && ahead.stand) continue;
            if (map.isSolid(n.tx + dir, n.ty)) continue;
          }
          const r = simulate(sandbox, f, spec, n, mv.policy, dir, inp);
          if (!r) continue;
          const target = this.nodeAtPx(r.x, r.y);
          if (!target || target.id === n.id || !target.stand) continue;
          const cost = r.ticks * DT + (mv.kind === 'jump' ? JUMP_PENALTY : 0.05);
          const prev = best.get(target.id);
          if (prev && prev.cost <= cost) continue;
          best.set(target.id, { to: target.id, kind: mv.kind, cost, m: mi, dir });
        }
      });
      n.edges = [...best.values()];
    }
    this.buildMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  }

  at(tx: number, ty: number): NavNode | null {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return null;
    const id = this.cell[ty * this.w + tx];
    return id >= 0 ? this.nodes[id] : null;
  }

  /** Node containing a feet position (x, y). */
  nodeAtPx(x: number, y: number): NavNode | null {
    return this.at(Math.floor(x / TILE), Math.floor((y - 1) / TILE));
  }

  /** Node a standing body is supported in: its center cell, else the cells under its feet edges. */
  nodeUnder(x: number, y: number, halfW: number): NavNode | null {
    return this.nodeAtPx(x, y) ?? this.nodeAtPx(x - halfW + 1, y) ?? this.nodeAtPx(x + halfW - 1, y);
  }

  /** Nearest node to a point: its own cell, then the cells below it (falling), then around it. */
  nearest(x: number, y: number): NavNode | null {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor((y - 1) / TILE);
    for (let d = 0; d < 12; d++) {
      const n = this.at(tx, ty + d);
      if (n) return n;
    }
    for (let r = 1; r < 6; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const n = this.at(tx + dx, ty + dy);
          if (n) return n;
        }
      }
    }
    return null;
  }

  /** Travel cost (s) from one node to every node (Infinity = unreachable), capped at maxCost. */
  costsFrom(from: number, maxCost = 30, extraCost?: (from: number, e: NavEdge) => number): Float64Array {
    const N = this.nodes.length;
    const g = new Float64Array(N).fill(Infinity);
    const closed = new Uint8Array(N);
    const heap = new MinHeap();
    g[from] = 0;
    heap.push(from, 0);
    while (heap.size > 0) {
      const cur = heap.pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (g[cur] > maxCost) break;
      for (const e of this.nodes[cur].edges) {
        const c = g[cur] + e.cost + (extraCost ? extraCost(cur, e) : 0);
        if (c < g[e.to]) {
          g[e.to] = c;
          heap.push(e.to, c);
        }
      }
    }
    return g;
  }

  /**
   * A* from one node to another. extraCost lets the caller penalize edges (failed edges, danger).
   * Returns the edge list (empty if start === goal), or null if unreachable.
   */
  path(from: number, to: number, extraCost?: (from: number, e: NavEdge) => number): { from: number; edge: NavEdge }[] | null {
    if (from === to) return [];
    const N = this.nodes.length;
    const g = new Float64Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const cameEdge: (NavEdge | null)[] = new Array(N).fill(null);
    const closed = new Uint8Array(N);
    const goal = this.nodes[to];
    const hfn = (n: NavNode) => Math.hypot(n.x - goal.x, n.y - goal.y) / 200;
    const heap = new MinHeap();
    g[from] = 0;
    heap.push(from, hfn(this.nodes[from]));
    let expanded = 0;
    while (heap.size > 0 && expanded < 6000) {
      const cur = heap.pop();
      if (closed[cur]) continue;
      if (cur === to) break;
      closed[cur] = 1;
      expanded++;
      for (const e of this.nodes[cur].edges) {
        if (closed[e.to]) continue;
        const c = g[cur] + e.cost + (extraCost ? extraCost(cur, e) : 0);
        if (c < g[e.to]) {
          g[e.to] = c;
          came[e.to] = cur;
          cameEdge[e.to] = e;
          heap.push(e.to, c + hfn(this.nodes[e.to]));
        }
      }
    }
    if (came[to] < 0) return null;
    const out: { from: number; edge: NavEdge }[] = [];
    for (let n = to; n !== from; n = came[n]) out.push({ from: came[n], edge: cameEdge[n]! });
    return out.reverse();
  }
}

/** Feet in this cell are supported and a standing fighter fits. */
export function standable(map: TileMap, tx: number, ty: number): boolean {
  if (ty < 1 || map.isSolid(tx, ty) || map.isSolid(tx, ty - 1)) return false;
  if (map.def(tx, ty).hazard !== 'none') return false;
  return map.isSolid(tx, ty + 1) || map.isOneWay(tx, ty + 1);
}

/** Run a maneuver in the sandbox from a node center. Returns where the fighter came to rest. */
function simulate(w: World, f: Fighter, spec: FighterSpawn, n: NavNode, policy: Policy, dir: number, out: Intent) {
  Object.assign(f, createFighter(0, spec, n.x, n.y));
  f.grounded = true;
  f.facing = dir < 0 ? -1 : 1;
  let airborne = false;
  for (let t = 0; t < MAX_TICKS; t++) {
    out.moveX = 0;
    out.moveY = 0;
    out.jump = false;
    policy(t, f, dir, out);
    w.step([out]);
    w.events.length = 0;
    if (!f.alive || f.y > w.map.pxH) return null; // fell out of the map: no edge
    if (!f.grounded) airborne = true;
    if (airborne && f.grounded && f.state === 'normal') return { x: f.x, y: f.y, ticks: t + 1 };
    if (!airborne && t > 25) return null; // never left the ground (blocked)
  }
  return null;
}

/** Tiny binary min-heap of (id, priority). */
class MinHeap {
  private ids: number[] = [];
  private pr: number[] = [];
  get size(): number {
    return this.ids.length;
  }
  push(id: number, p: number): void {
    const ids = this.ids;
    const pr = this.pr;
    let i = ids.length;
    ids.push(id);
    pr.push(p);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (pr[parent] <= pr[i]) break;
      [ids[i], ids[parent]] = [ids[parent], ids[i]];
      [pr[i], pr[parent]] = [pr[parent], pr[i]];
      i = parent;
    }
  }
  pop(): number {
    const ids = this.ids;
    const pr = this.pr;
    const top = ids[0];
    const lastId = ids.pop()!;
    const lastP = pr.pop()!;
    if (ids.length > 0) {
      ids[0] = lastId;
      pr[0] = lastP;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < ids.length && pr[l] < pr[m]) m = l;
        if (r < ids.length && pr[r] < pr[m]) m = r;
        if (m === i) break;
        [ids[i], ids[m]] = [ids[m], ids[i]];
        [pr[i], pr[m]] = [pr[m], pr[i]];
        i = m;
      }
    }
    return top;
  }
}

const cache = new WeakMap<MapDef, NavGraph>();

/** Shared, cached graph for a map definition. */
export function navFor(def: MapDef): NavGraph {
  let g = cache.get(def);
  if (!g) {
    g = new NavGraph(def);
    cache.set(def, g);
  }
  return g;
}

