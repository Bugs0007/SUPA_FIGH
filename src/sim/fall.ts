// Falling out of the map. Fall death on (the default): the fighter dies (fighter.ts checkOutOfWorld).
// Fall death off (a match rule): the fighter is thrown back in from the top of the map over a safe column near
// where it fell, with a small HP penalty that can never kill (THROW_IN in constants.ts).
import { FIGHTER_H, LAST_HIT_CREDIT, THROW_IN, TILE } from './constants';
import { dropCooked, type Fighter } from './fighter';
import { releaseProp } from './prop';
import type { World } from './world';
import { trainerProtected } from './pokemon';

/** Has this fighter left the world (below the kill plane, or far off a side)? */
export function outOfWorld(w: World, f: Fighter): boolean {
  return f.y > w.killY || f.x < -160 || f.x > w.map.pxW + 160;
}

/** Does falling out of the map kill this fighter? Shadow clones always just poof. */
export function fallKills(w: World, f: Fighter): boolean {
  if (f.trainer && trainerProtected(w, f)) return false;
  return w.settings.fallDeath !== false || f.master >= 0 || (!!w.settings.fallDeathBots && f.isBot);
}

/**
 * Where a fighter dropping into tile column tx comes in, or null when the column is unsafe. The column is scanned
 * from the top (past a thin roof, if any) down to the first floor (solid or one-way); it needs a floor, no water on
 * the way down, room for a visible drop, and no map hazard (crusher, laser, tunnel, fissure) around the landing.
 */
export function dropColumn(w: World, tx: number): { x: number; y: number } | null {
  const m = w.map;
  if (tx < 1 || tx > m.w - 2) return null;
  let ty = 0;
  while (ty < m.h && m.isSolid(tx, ty)) ty++;
  if (ty > THROW_IN.maxRoof) return null;
  const top = ty;
  for (; ty < m.h; ty++) {
    if (m.def(tx, ty).hazard !== 'none') return null;
    if (m.isSolid(tx, ty) || m.isOneWay(tx, ty)) break;
  }
  if (ty >= m.h || ty - top < THROW_IN.minDrop) return null; // a pit, or too low to drop into
  const x = tx * TILE + TILE / 2;
  const floor = ty * TILE;
  for (const h of w.gimmicks.hazards) {
    const reach = (h.def.sweep ?? 0) * TILE;
    if (x + TILE > h.x && x - TILE < h.x + h.w + reach && floor + TILE > h.y && floor - FIGHTER_H - TILE < h.y + h.h) return null;
  }
  return { x, y: top === 0 ? -THROW_IN.above : top * TILE + FIGHTER_H + 1 };
}

/** The entry point for a fighter that left the map around x: the nearest safe column (inward first), else the nearest spawn. */
export function throwInSpot(w: World, x: number): { x: number; y: number } {
  const m = w.map;
  const tx0 = Math.max(1, Math.min(m.w - 2, Math.floor(x / TILE)));
  const inward = tx0 * TILE < m.pxW / 2 ? 1 : -1;
  for (let d = 0; d < m.w; d++) {
    for (const tx of d === 0 ? [tx0] : [tx0 + d * inward, tx0 - d * inward]) {
      const spot = dropColumn(w, tx);
      if (spot) return spot;
    }
  }
  let best = w.parsed.spawns[0] ?? { x: m.pxW / 2, y: TILE * 2 };
  for (const p of w.parsed.spawns) if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
  return { x: best.x, y: best.y };
}

/**
 * Fall death off: throw a fighter that fell out of the map back in. It keeps its weapons (a cooked grenade and a
 * carried prop are lost to the fall), takes THROW_IN.damage (never below 1 HP, credited to whoever knocked it out)
 * and comes back tumbling, invulnerable for a moment.
 */
export function throwIn(w: World, f: Fighter): void {
  const fromX = Math.max(0, Math.min(w.map.pxW, f.x));
  const fromY = Math.max(0, Math.min(w.map.pxH, f.y));
  w.releaseGrab(f);
  if (f.cook > 0) dropCooked(w, f);
  if (f.carry >= 0) {
    const p = w.props.find((q) => q.id === f.carry);
    if (p) releaseProp(w, p);
    f.carry = -1;
  }
  const spot = throwInSpot(w, f.x);
  f.x = f.px = spot.x;
  f.y = f.py = spot.y;
  f.h = FIGHTER_H;
  f.vx = (spot.x < w.map.pxW / 2 ? 1 : -1) * THROW_IN.vx;
  f.vy = THROW_IN.vy;
  f.grounded = false;
  f.jumping = false;
  f.coyote = 0;
  f.dropTimer = 0;
  f.flying = false;
  f.flyHold = false;
  f.rot = 0;
  f.vrot = 0;
  f.thrownBy = -1;
  f.state = 'flinch';
  f.stateTime = 0;
  f.flinchTime = THROW_IN.stun;
  f.invuln = Math.max(f.invuln, THROW_IN.invuln);
  const damage = f.trainer && trainerProtected(w, f) ? 0 : Math.min(THROW_IN.damage, Math.max(0, f.hp - 1));
  f.hp -= damage;
  const attacker = f.lastAttacker >= 0 && w.time - f.lastHitTime < LAST_HIT_CREDIT ? f.lastAttacker : -1;
  w.emit({ t: 'thrownIn', f: f.id, fromX, fromY, x: spot.x, y: spot.y, damage, attacker });
}
