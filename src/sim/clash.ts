// Hero ranged attacks meeting in the air. Every hero ranged attack has a CALIBER: tier (super 2, ability 1) and the
// caster's form level. When two rival attacks touch, the higher caliber (tier first, then form) overpowers the other
// and flies on unchanged; equal calibers CLASH: both are destroyed and an area blast goes off where they met.
// Ordinary weapon bullets have tier 0 and never take part. Data: CLASH / SUPER_AREA in data/heroes.ts.
//
// Attacks: hero projectiles (bombs, arrows, Spirit Bomb, fireball), beams (Kamehameha / super beams: the beam that
// loses to a projectile is cut where it crosses for as long as it is in the way) and Luffy's giant fist head (tier 2).
// Runs once per tick after the fighters move and before the bullets do (world.step); pairs are resolved in a fixed
// order (bullets by pool index, then fighters by id) so the result never depends on who updated first.

import { sameTeam } from './combat';
import { DT } from './constants';
import { CLASH, SUPER_AREA, superFistFor } from './data/heroes';
import type { ExplosionStats } from './data/weapons';
import { explode } from './explosion';
import { cancelMove, type Fighter } from './fighter';
import { beamNow, beamOrigin, meleeMuls, stretchFist } from './hero';
import type { Bullet } from './projectile';
import type { World } from './world';

interface Attack {
  kind: 'bullet' | 'beam' | 'fist';
  bullet: Bullet | null;
  /** caster (beam / fist), or the bullet's owner */
  f: Fighter;
  owner: number;
  tier: number;
  form: number;
  /** body: a capsule from (x0, y0) to (x1, y1) of radius r; bullets also move by (vx, vy) * DT this tick */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  r: number;
  vx: number;
  vy: number;
  /** beams: reach px from the origin (for the cut) */
  len: number;
  /** its blast for a clash */
  radius: number;
  damage: number;
  weapon: string;
  gone: boolean;
}

/** Strength order: a super beats an ability whatever the forms; same tier: the higher form. */
export function caliber(tier: number, form: number): number {
  return tier * 10 + form;
}

function collect(w: World): Attack[] {
  const out: Attack[] = [];
  for (const b of w.bullets) {
    if (!b.active || b.tier <= 0) continue;
    const f = w.fighters[b.owner];
    if (!f) continue;
    const ex = b.explosion;
    out.push({
      kind: 'bullet', bullet: b, f, owner: b.owner, tier: b.tier, form: b.form,
      x0: b.x, y0: b.y, x1: b.x, y1: b.y, r: Math.max(2, b.size), vx: b.vx, vy: b.vy, len: 0,
      radius: ex ? ex.radius : Math.max(16, b.size * 3), damage: Math.max(b.damage, ex?.damage ?? 0), weapon: b.weapon, gone: false,
    });
  }
  for (const f of w.fighters) {
    if (!f.alive || f.gone || f.state !== 'special') continue;
    const form = f.power === 'hero' ? f.powerLevel : 0;
    const dx = Math.cos(f.stretchAngle) * f.facing;
    const dy = Math.sin(f.stretchAngle);
    const beam = beamNow(f);
    if (beam && beam.active && beam.len > 0) {
      const o = beamOrigin(f);
      // the reach it would have without any cut: up to its grown length or the first wall
      const wall = w.map.raycastSolid(o.x, o.y, o.x + dx * beam.len, o.y + dy * beam.len);
      const len = wall && !beam.b.breakTiles ? beam.len * wall.t : beam.len;
      out.push({
        kind: 'beam', bullet: null, f, owner: f.id, tier: beam.isSuper ? 2 : 1, form,
        x0: o.x, y0: o.y, x1: o.x + dx * len, y1: o.y + dy * len, r: beam.half, vx: 0, vy: 0, len,
        radius: CLASH.beamRadius + CLASH.beamRadiusPerLevel * form, damage: beam.dmg * meleeMuls(f).dmg,
        weapon: f.hero + (beam.isSuper ? ':super' : ':second'), gone: false,
      });
    } else if (f.specialKind === 'superFist' && f.stretchLen > 0) {
      const s = superFistFor(f.hero, f.powerLevel);
      if (!s) continue;
      const tip = stretchFist(f, f.stretchAngle, f.stretchLen);
      out.push({
        kind: 'fist', bullet: null, f, owner: f.id, tier: 2, form,
        x0: tip.x1, y0: tip.y1, x1: tip.x1, y1: tip.y1, r: s.fist ?? 4, vx: 0, vy: 0, len: 0,
        radius: s.shock, damage: s.damage * meleeMuls(f).dmg, weapon: f.hero + ':super', gone: false,
      });
    }
  }
  return out;
}

/** Attacks of these two casters can meet: never your own (or your clones'), friends only with friendly fire. */
function rivals(w: World, a: Fighter, b: Fighter): boolean {
  if (a === b) return false;
  if (a.master === b.id || b.master === a.id || (a.master >= 0 && a.master === b.master)) return false;
  return w.settings.friendlyFire || !sameTeam(a, b);
}

/** Closest point of segment (x0, y0)-(x1, y1) to (px, py): parameter 0..1 and distance. */
function nearestOnSeg(px: number, py: number, x0: number, y0: number, x1: number, y1: number): { t: number; x: number; y: number; d: number } {
  const ex = x1 - x0;
  const ey = y1 - y0;
  const l2 = ex * ex + ey * ey;
  const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((px - x0) * ex + (py - y0) * ey) / l2)) : 0;
  const x = x0 + ex * t;
  const y = y0 + ey * t;
  return { t, x, y, d: Math.hypot(px - x, py - y) };
}

/**
 * Where two segments come closest: distance, the point on A and the point on B. Two 2D
 * segments that do not cross are closest at an endpoint of one of them, so the four endpoint checks plus the
 * crossing test are exact.
 */
function segContact(
  ax0: number, ay0: number, ax1: number, ay1: number,
  bx0: number, by0: number, bx1: number, by1: number,
): { d: number; ax: number; ay: number; bx: number; by: number } {
  const rx = ax1 - ax0, ry = ay1 - ay0, qx = bx1 - bx0, qy = by1 - by0;
  const den = rx * qy - ry * qx;
  if (Math.abs(den) > 1e-9) {
    const s = ((bx0 - ax0) * qy - (by0 - ay0) * qx) / den;
    const u = ((bx0 - ax0) * ry - (by0 - ay0) * rx) / den;
    if (s >= 0 && s <= 1 && u >= 0 && u <= 1) {
      const x = ax0 + rx * s, y = ay0 + ry * s;
      return { d: 0, ax: x, ay: y, bx: x, by: y };
    }
  }
  let best = { d: Infinity, ax: ax0, ay: ay0, bx: bx0, by: by0 };
  for (const [px, py] of [[bx0, by0], [bx1, by1]]) {
    const n = nearestOnSeg(px, py, ax0, ay0, ax1, ay1);
    if (n.d < best.d) best = { d: n.d, ax: n.x, ay: n.y, bx: px, by: py };
  }
  for (const [px, py] of [[ax0, ay0], [ax1, ay1]]) {
    const n = nearestOnSeg(px, py, bx0, by0, bx1, by1);
    if (n.d < best.d) best = { d: n.d, ax: px, ay: py, bx: n.x, by: n.y };
  }
  return best;
}

/** Do two attacks touch this tick? Returns the meeting point. */
function contact(a: Attack, b: Attack): { x: number; y: number } | null {
  const reach = a.r + b.r;
  if (a.kind !== 'beam' && b.kind !== 'beam') {
    // two moving circles (a fist head stands still): closest approach during this tick
    const px = a.x0 - b.x0, py = a.y0 - b.y0;
    const vx = (a.vx - b.vx) * DT, vy = (a.vy - b.vy) * DT;
    const v2 = vx * vx + vy * vy;
    const t = v2 > 1e-9 ? Math.max(0, Math.min(1, -(px * vx + py * vy) / v2)) : 0;
    if (Math.hypot(px + vx * t, py + vy * t) > reach) return null;
    const ax = a.x0 + a.vx * DT * t, ay = a.y0 + a.vy * DT * t;
    const bx = b.x0 + b.vx * DT * t, by = b.y0 + b.vy * DT * t;
    // the meeting point: between the two bodies, weighted by their size
    const k = a.r / reach;
    return { x: ax + (bx - ax) * k, y: ay + (by - ay) * k };
  }
  const [beam, other] = a.kind === 'beam' ? [a, b] : [b, a];
  // the other one as a segment: a beam, or what a projectile sweeps this tick
  const ox1 = other.kind === 'beam' ? other.x1 : other.x0 + other.vx * DT;
  const oy1 = other.kind === 'beam' ? other.y1 : other.y0 + other.vy * DT;
  const c = segContact(beam.x0, beam.y0, beam.x1, beam.y1, other.x0, other.y0, ox1, oy1);
  if (other.kind === 'beam') {
    // two beams head on (overlapping tips): they meet halfway between the tips
    const ta = nearestOnSeg(beam.x1, beam.y1, other.x0, other.y0, other.x1, other.y1);
    const tb = nearestOnSeg(other.x1, other.y1, beam.x0, beam.y0, beam.x1, beam.y1);
    if (ta.d <= reach && tb.d <= reach) return { x: (beam.x1 + other.x1) / 2, y: (beam.y1 + other.y1) / 2 };
  }
  if (c.d > reach) return null;
  const k = beam.r / reach;
  return { x: c.ax + (c.bx - c.ax) * k, y: c.ay + (c.by - c.ay) * k };
}

/** The weaker attack is overpowered: a projectile or fist is destroyed, a beam is cut short of the meeting point. */
function overpower(w: World, loser: Attack, winner: Attack, at: { x: number; y: number }): void {
  if (loser.kind === 'beam') {
    const along = nearestOnSeg(at.x, at.y, loser.x0, loser.y0, loser.x1, loser.y1).t * loser.len;
    const cut = Math.max(0, along - winner.r);
    loser.f.beamCut = loser.f.beamCut >= 0 ? Math.min(loser.f.beamCut, cut) : cut;
    return;
  }
  destroy(w, loser);
  w.emit({ t: 'projectileFizzle', x: at.x, y: at.y });
}

function destroy(w: World, a: Attack): void {
  a.gone = true;
  if (a.bullet) a.bullet.active = false;
  else cancelMove(w, a.f);
}

/** Equal calibers: both go, and a big blast goes off where they met. Credit goes to the bigger attack's caster. */
function clash(w: World, a: Attack, b: Attack, at: { x: number; y: number }): void {
  destroy(w, a);
  destroy(w, b);
  const big = b.damage > a.damage ? b : a;
  const ex: ExplosionStats = {
    radius: Math.max(a.radius, b.radius) * CLASH.radiusMul,
    damage: (a.damage + b.damage) / 2,
    knock: CLASH.knock,
    breakRadius: CLASH.breakRadius,
    shake: CLASH.shake,
    core: SUPER_AREA.core,
    edge: SUPER_AREA.edge,
  };
  w.emit({ t: 'projectileClash', x: at.x, y: at.y, radius: ex.radius });
  explode(w, at.x, at.y, ex, big.owner, big.weapon);
}

/** One pass per tick: find every pair of rival hero attacks that touch and settle them. */
export function resolveClashes(w: World): void {
  for (const f of w.fighters) f.beamCut = -1;
  const list = collect(w);
  if (list.length < 2) return;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (a.gone) break;
      if (b.gone || !rivals(w, a.f, b.f)) continue;
      const c = contact(a, b);
      if (!c) continue;
      const ca = caliber(a.tier, a.form);
      const cb = caliber(b.tier, b.form);
      if (ca === cb) clash(w, a, b, c);
      else if (ca > cb) overpower(w, b, a, c);
      else overpower(w, a, b, c);
    }
  }
}
