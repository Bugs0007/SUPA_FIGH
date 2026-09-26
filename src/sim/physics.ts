import { TILE } from './constants';
import type { TileMap } from './map/tilemap';

/** Axis-aligned body. x = center, y = feet (bottom). */
export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  grounded: boolean;
}

export interface MoveOpts {
  /** pass through one-way platforms (dropping through, climbing ladders) */
  ignoreOneWay?: boolean;
  /**
   * Called when the body is about to collide with a solid tile. Return true to pass through
   * (e.g. a thrown body smashing glass — the callback should break the tile).
   */
  onSolid?: (tx: number, ty: number, axis: 'x' | 'y', speed: number) => boolean;
}

export interface MoveResult {
  wallX: -1 | 0 | 1;
  ceil: boolean;
  landed: boolean;
  impactVx: number;
  impactVy: number;
}

export function newMoveResult(): MoveResult {
  return { wallX: 0, ceil: false, landed: false, impactVx: 0, impactVy: 0 };
}

const EPS = 0.001;
const MAX_SUBSTEP = 6;

/**
 * Move a body through the tilemap with swept per-axis resolution. Movement is split into
 * sub-steps of at most 6 px so nothing tunnels through 16 px tiles.
 */
export function moveBody(map: TileMap, b: Body, dt: number, opts: MoveOpts, res: MoveResult): MoveResult {
  res.wallX = 0;
  res.ceil = false;
  res.landed = false;
  res.impactVx = 0;
  res.impactVy = 0;

  const totalDx = b.vx * dt;
  const totalDy = b.vy * dt;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(totalDx), Math.abs(totalDy)) / MAX_SUBSTEP));
  const sdx = totalDx / steps;
  const sdy = totalDy / steps;
  let xBlocked = false;
  let yBlocked = false;

  for (let s = 0; s < steps; s++) {
    // ---- X axis
    if (sdx !== 0 && !xBlocked) {
      const nx = b.x + sdx;
      const edge = sdx > 0 ? nx + b.w / 2 : nx - b.w / 2;
      const tx = Math.floor(sdx > 0 ? (edge - EPS) / TILE : edge / TILE);
      const prevEdge = sdx > 0 ? b.x + b.w / 2 : b.x - b.w / 2;
      const prevTx = Math.floor(sdx > 0 ? (prevEdge - EPS) / TILE : prevEdge / TILE);
      let blocked = false;
      if (tx !== prevTx) {
        const ty0 = Math.floor((b.y - b.h) / TILE);
        const ty1 = Math.floor((b.y - EPS) / TILE);
        for (let ty = ty0; ty <= ty1; ty++) {
          if (!map.isSolid(tx, ty)) continue;
          if (opts.onSolid && opts.onSolid(tx, ty, 'x', b.vx)) continue;
          blocked = true;
          break;
        }
      }
      if (blocked) {
        b.x = sdx > 0 ? tx * TILE - b.w / 2 : (tx + 1) * TILE + b.w / 2;
        res.impactVx = b.vx;
        res.wallX = sdx > 0 ? 1 : -1;
        b.vx = 0;
        xBlocked = true;
      } else {
        b.x = nx;
      }
    }

    // ---- Y axis
    if (sdy !== 0 && !yBlocked) {
      const ny = b.y + sdy;
      const tx0 = Math.floor((b.x - b.w / 2) / TILE);
      const tx1 = Math.floor((b.x + b.w / 2 - EPS) / TILE);
      if (sdy > 0) {
        const ty = Math.floor((ny - EPS) / TILE);
        const prevRow = Math.floor((b.y - EPS) / TILE);
        let hit = false;
        if (ty > prevRow) {
          for (let tx = tx0; tx <= tx1; tx++) {
            if (map.isSolid(tx, ty)) {
              if (opts.onSolid && opts.onSolid(tx, ty, 'y', b.vy)) continue;
              hit = true;
              break;
            }
            if (!opts.ignoreOneWay && map.isOneWay(tx, ty) && b.y <= ty * TILE + 0.01) {
              hit = true;
              break;
            }
          }
        }
        if (hit) {
          b.y = ty * TILE;
          res.impactVy = b.vy;
          res.landed = true;
          b.vy = 0;
          yBlocked = true;
        } else {
          b.y = ny;
        }
      } else {
        const ty = Math.floor((ny - b.h) / TILE);
        const prevTop = Math.floor((b.y - b.h) / TILE);
        let hit = false;
        if (ty < prevTop) {
          for (let tx = tx0; tx <= tx1; tx++) {
            if (!map.isSolid(tx, ty)) continue;
            if (opts.onSolid && opts.onSolid(tx, ty, 'y', b.vy)) continue;
            hit = true;
            break;
          }
        }
        if (hit) {
          b.y = (ty + 1) * TILE + b.h;
          res.impactVy = b.vy;
          res.ceil = true;
          b.vy = 0;
          yBlocked = true;
        } else {
          b.y = ny;
        }
      }
    }
  }

  b.grounded = res.landed || (b.vy >= 0 && isSupported(map, b, !!opts.ignoreOneWay));
  return res;
}

/** Feet exactly on top of a solid (or one-way) tile. */
export function isSupported(map: TileMap, b: Body, ignoreOneWay = false): boolean {
  const row = Math.round(b.y / TILE);
  if (Math.abs(b.y - row * TILE) > 0.05) return false;
  const tx0 = Math.floor((b.x - b.w / 2) / TILE);
  const tx1 = Math.floor((b.x + b.w / 2 - EPS) / TILE);
  for (let tx = tx0; tx <= tx1; tx++) {
    if (map.isSolid(tx, row)) return true;
    if (!ignoreOneWay && map.isOneWay(tx, row)) return true;
  }
  return false;
}

/** Standing only on one-way tiles (so Down+Jump can drop through). */
export function onOneWayOnly(map: TileMap, b: Body): boolean {
  const row = Math.round(b.y / TILE);
  if (Math.abs(b.y - row * TILE) > 0.05) return false;
  const tx0 = Math.floor((b.x - b.w / 2) / TILE);
  const tx1 = Math.floor((b.x + b.w / 2 - EPS) / TILE);
  let any = false;
  for (let tx = tx0; tx <= tx1; tx++) {
    if (map.isSolid(tx, row)) return false;
    if (map.isOneWay(tx, row)) any = true;
  }
  return any;
}

/** Can the body occupy height h at its current feet position? */
export function hasHeadroom(map: TileMap, b: Body, h: number): boolean {
  return !map.rectSolid(b.x - b.w / 2, b.y - h, b.x + b.w / 2, b.y);
}

/** Segment vs AABB (slab test). Returns entry t in [0,1] or -1. */
export function segmentAabb(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  l: number,
  t: number,
  r: number,
  b: number,
): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let tmin = 0;
  let tmax = 1;
  if (Math.abs(dx) < 1e-9) {
    if (x0 < l || x0 > r) return -1;
  } else {
    let t1 = (l - x0) / dx;
    let t2 = (r - x0) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  if (Math.abs(dy) < 1e-9) {
    if (y0 < t || y0 > b) return -1;
  } else {
    let t1 = (t - y0) / dy;
    let t2 = (b - y0) / dy;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  return tmin;
}

export function aabbOverlap(
  al: number,
  at: number,
  ar: number,
  ab: number,
  bl: number,
  bt: number,
  br: number,
  bb: number,
): boolean {
  return al < br && ar > bl && at < bb && ab > bt;
}
