// Hero traversal for bots: the moves a human uses to get around, not to fight (those live in bot.ts useBase).
//
//   Goku    hold Up in the air to fly (ascend + steer), release to glide down
//   Naruto  walk up a wall (hold toward it + Up); Rasengan as a fast gravity-free dash along a clear lane
//   Luffy   Gum-Gum grapple: hold the ability toward a platform / wall / ladder to be pulled there, or under a
//           ceiling to swing from it
//
// BotController.navigate() offers the current travel target to `consider()`; once a move starts, `step()` owns
// the inputs until it ends (act() calls it before anything else). Pure TS like the rest of src/ai.

import { FIGHTER_H, SHOULDER_Y_STAND, TILE } from '../sim/constants';
import { wallContact, type Fighter } from '../sim/fighter';
import { heroDef } from '../sim/data/heroes';
import { baseAbility, grabProbe, gripTarget, holdFlies, type Grip } from '../sim/hero';
import type { Intent } from '../sim/intent';
import type { World } from '../sim/world';
import type { NavGraph } from './nav';

type Kind = 'fly' | 'wall' | 'dash' | 'grapple';

interface Move {
  kind: Kind;
  /** world time it started */
  t0: number;
  /** travel target (feet) */
  tx: number;
  ty: number;
  /** wall: side; dash/grapple: horizontal direction */
  dir: number;
  /** grapple: stick direction held while the arm launches */
  mx: number;
  my: number;
  /** dash: how long to hold the button (s) */
  holdFor: number;
  /** grapple: the anchor (swing release logic) */
  ax: number;
  ay: number;
  swing: boolean;
  /** fly: best (smallest) feet y reached and when it last improved */
  bestY: number;
  progressAt: number;
  /** ticks since the move started */
  age: number;
}

const GRAPPLE_HOLD_TICKS = 9;

export class HeroMobility {
  private m: Move | null = null;
  private nextTry = 0;
  private flyBan = 0;
  private wallBan = 0;

  reset(): void {
    this.m = null;
    this.nextTry = 0;
    this.flyBan = 0;
    this.wallBan = 0;
  }

  /** a move is in progress (so the bot must not do anything else with its inputs) */
  get active(): boolean {
    return this.m !== null;
  }

  /** flying (a fight can interrupt it: hero moves work from the air) */
  get flying(): boolean {
    return this.m?.kind === 'fly';
  }

  /** Stop the current move (the bot does something else with its inputs now). */
  cancel(now: number): void {
    if (this.m) this.end(now, 0.5, this.m.kind);
  }

  /**
   * Called every tick while a move is running. Fills `out` and returns true while the move owns the bot,
   * false once it is over (state restored, bans set).
   */
  step(w: World, f: Fighter, out: Intent, now: number): boolean {
    const m = this.m;
    if (!m) return false;
    m.age++;
    if (!f.alive || f.gone) return this.end(now, 0);
    switch (m.kind) {
      case 'fly':
        return this.stepFly(w, f, out, m, now);
      case 'wall':
        return this.stepWall(w, f, out, m, now);
      case 'dash':
        return this.stepDash(f, out, m, now);
      default:
        return this.stepGrapple(f, out, m, now);
    }
  }

  private end(now: number, ban: number, kind?: Kind): false {
    if (kind === 'fly') this.flyBan = now + ban;
    if (kind === 'wall') this.wallBan = now + ban;
    this.nextTry = now + 0.35;
    this.m = null;
    return false;
  }

  // ------------------------------------------------------------------ starting a move

  /**
   * The bot wants to get to (x, y) (feet). Returns true if a hero move was started and drove this tick.
   * `noPath` = the nav graph has no route there (flyers cross whatever is in the way).
   */
  consider(w: World, f: Fighter, g: NavGraph, x: number, y: number, now: number, out: Intent, noPath: boolean): boolean {
    if (this.m || !f.hero || now < this.nextTry) return false;
    if (f.state !== 'normal' || f.carry >= 0 || f.burn > 0) return false;
    const def = heroDef(f.hero);
    if (!def) return false;
    const dx = x - f.x;
    const dy = y - f.y;
    const base = baseAbility(f);
    this.nextTry = now + 0.2;

    // --- flight: anything noticeably above us, or a place the graph can't reach
    if (holdFlies(f) && now >= this.flyBan && (dy < -26 || (noPath && Math.abs(dx) > 20)) && Math.abs(dx) < 340) {
      this.m = newMove('fly', now, x, y);
      this.m.bestY = f.y;
      this.m.progressAt = now;
      return this.stepFly(w, f, out, this.m, now);
    }

    // --- Naruto: run up a wall that ends about where the target stands
    if (def.wallWalk && f.grounded && now >= this.wallBan && dy < -36 && Math.abs(dx) < 320) {
      const wall = findWall(w, f, x, y);
      if (wall) {
        this.m = newMove('wall', now, x, y);
        this.m.dir = wall;
        this.m.bestY = f.x - 99;
        return this.stepWall(w, f, out, this.m, now);
      }
    }

    if (!base || f.baseCd > 0 || (base.charges && f.baseUsed >= base.charges.max)) return false;

    // --- Naruto: Rasengan dash across a long clear lane at our own height
    if (base.kind === 'rasengan' && base.dash && f.grounded && Math.abs(dy) <= 10 && Math.abs(dx) >= 110) {
      const d = base.dash;
      const dir = dx > 0 ? 1 : -1;
      const reach = Math.min(Math.abs(dx) - 6, d.speed * d.maxTime * 0.85);
      const endX = f.x + dir * reach;
      const cy = f.y - 14;
      if (w.map.clearShot(f.x, cy, endX + dir * 8, cy) && w.map.clearShot(f.x, f.y - 5, endX + dir * 8, f.y - 5) && g.nodeUnder(endX, f.y, 6)) {
        this.m = newMove('dash', now, x, y);
        this.m.dir = dir;
        this.m.holdFor = d.windup + reach / d.speed;
        return this.stepDash(f, out, this.m, now);
      }
    }

    // --- Luffy: grapple toward a platform / wall / ladder, or swing from a ceiling
    if (base.kind === 'pistol' && base.stretch && (dy < -30 || Math.abs(dx) > 120)) {
      const pick = pickGrapple(w, f, base.stretch, x, y);
      if (pick) {
        this.m = newMove('grapple', now, x, y);
        Object.assign(this.m, pick);
        return this.stepGrapple(f, out, this.m, now);
      }
    }
    return false;
  }

  // ------------------------------------------------------------------ the moves

  private stepFly(_w: World, f: Fighter, out: Intent, m: Move, now: number): boolean {
    const dx = m.tx - f.x;
    const reached = f.y <= m.ty - 8;
    if (now - m.t0 > 4.5) return this.end(now, 2.5, 'fly');
    if (f.grounded && m.age > 20 && !f.flying && m.age > 40) return this.end(now, 1.5, 'fly'); // never got off the ground
    if (f.y < m.bestY - 4) {
      m.bestY = f.y;
      m.progressAt = now;
    } else if (f.flying && now - m.progressAt > 0.55) {
      return this.end(now, 3, 'fly'); // a ceiling in the way
    }
    if (Math.abs(dx) > 5) out.moveX = Math.sign(dx);
    if (f.grounded) {
      out.jump = true;
      return true;
    }
    if (reached) {
      // high enough: let go and drift down onto the spot
      if (f.y >= m.ty - 2 && Math.abs(dx) < 10 && f.vy > 0) return this.end(now, 0.6, 'fly');
      if (f.vy > 0 && Math.abs(dx) <= 6) return this.end(now, 0.5, 'fly');
      return true;
    }
    if (f.flying || f.vy >= -40) out.moveY = -1;
    return true;
  }

  private stepWall(w: World, f: Fighter, out: Intent, m: Move, now: number): boolean {
    const side = m.dir;
    if (now - m.t0 > 6) return this.end(now, 4, 'wall');
    if (f.state === 'wallwalk') {
      out.moveX = side;
      if (f.y > m.ty - 18) out.moveY = -1;
      else {
        // level with the target but the wall goes on: let go toward it
        out.moveX = Math.sign(m.tx - f.x) || -side;
        out.moveY = 0;
      }
      return true;
    }
    if (f.state !== 'normal') return this.end(now, 3, 'wall');
    if (m.age > 8 && f.stateTime > 0.3 && !f.grounded && f.y < m.ty + 20 && f.vy > 0) return this.end(now, 4, 'wall'); // came off the top
    if (f.grounded) {
      out.moveX = side;
      if (wallContact(w, f, side) === side) out.moveY = -1;
      else if (Math.abs(f.x - m.bestY) > 1.5) {
        m.bestY = f.x; // (x last seen) still walking toward the wall
        m.progressAt = now;
      } else if (now - m.progressAt > 0.5) return this.end(now, 4, 'wall'); // something (a crate...) is in the way
      if (m.age > 150) return this.end(now, 4, 'wall'); // can't reach the wall
      return true;
    }
    // airborne: the hop over the top, or a fall: steer toward the target
    out.moveX = Math.sign(m.tx - f.x);
    if (f.vy > 0 && f.y <= m.ty + 6) return this.end(now, 3, 'wall');
    if (m.age > 20 && f.grounded) return this.end(now, 3, 'wall');
    return true;
  }

  private stepDash(f: Fighter, out: Intent, m: Move, now: number): boolean {
    const t = (now - m.t0) as number;
    const special = f.state === 'special';
    if (m.age > 12 && !special) return this.end(now, 0);
    if (m.age <= 3) out.moveX = m.dir;
    out.ability = t < m.holdFor + 0.02;
    if (t > 2.5) return this.end(now, 0);
    return true;
  }

  private stepGrapple(f: Fighter, out: Intent, m: Move, now: number): boolean {
    const special = f.state === 'special';
    if (m.age > GRAPPLE_HOLD_TICKS && !special) return this.end(now, 0);
    if (now - m.t0 > 4.5) return this.end(now, 0);
    if (m.age <= GRAPPLE_HOLD_TICKS) {
      out.moveX = m.mx;
      out.moveY = m.my;
    }
    out.ability = true;
    if (f.specialKind === 'swing') {
      // pendulum: pump toward the target, let go once we are past the anchor and moving that way
      const dir = Math.sign(m.tx - m.ax) || m.dir;
      out.moveX = dir;
      out.moveY = f.y - m.ay > 70 ? -1 : 0;
      const past = (f.x - f.anchorX) * dir > 22;
      if ((past && f.vx * dir > 70) || f.stateTime > 2.2) out.ability = false;
    }
    return true;
  }
}

function newMove(kind: Kind, t0: number, tx: number, ty: number): Move {
  return { kind, t0, tx, ty, dir: 0, mx: 0, my: 0, holdFor: 0, ax: 0, ay: 0, swing: false, bestY: 0, progressAt: t0, age: 0 };
}

// ---------------------------------------------------------------------- Naruto: wall choice

/**
 * A wall within ~100 px (either side) that climbs to about the target's height. Returns the side (-1 / 1) or 0.
 * Prefers the side toward the target.
 */
function findWall(w: World, f: Fighter, tx: number, ty: number): number {
  const first = tx >= f.x ? 1 : -1;
  for (const side of [first, -first]) {
    let wx = -1;
    for (let d = f.w / 2 + 2; d <= 140; d += 4) {
      const x = f.x + side * d;
      // (a real wall: as tall as a fighter, or chakra feet won't stick - a one-tile step doesn't count)
      if (w.map.rectSolid(x - 0.5, f.y - FIGHTER_H + 3, x + 0.5, f.y - 3)) {
        wx = x;
        break;
      }
      if (!w.map.rectSolid(x - 0.5, f.y + 1, x + 0.5, f.y + 3)) break; // a pit before the wall
    }
    if (wx < 0) continue;
    // how far up does it go?
    let topY = f.y - 8;
    while (topY > ty - 40 && w.map.rectSolid(wx - 0.5, topY - TILE, wx + 0.5, topY - TILE + 2)) topY -= TILE;
    const top = topY - 8; // (roughly the platform edge the wall ends at)
    // clear ground-to-top lane in front of the wall (no ceiling over our head while we walk up)
    if (top <= ty + 24 && top >= ty - 40 && !w.map.rectSolid(f.x - 4, top - 4, f.x + 4, f.y - 30)) return side;
  }
  return 0;
}

// ---------------------------------------------------------------------- Luffy: grapple choice

interface GrapplePick {
  dir: number;
  mx: number;
  my: number;
  ax: number;
  ay: number;
  swing: boolean;
}

/** The arm direction (stick) whose catch lands us closest to the target. null if nothing helps enough. */
function pickGrapple(w: World, f: Fighter, s: NonNullable<ReturnType<typeof baseAbility>>['stretch'] & object, tx: number, ty: number): GrapplePick | null {
  const toward = tx >= f.x ? 1 : -1;
  const reach = (s.maxRange ?? s.range) - 20;
  const here = Math.hypot(tx - f.x, ty - f.y);
  const cands: { mx: number; my: number; facing: number }[] = [
    { mx: 0, my: -1, facing: toward },
    { mx: toward, my: -1, facing: toward },
    { mx: toward, my: 0, facing: toward },
  ];
  if (!f.grounded) cands.push({ mx: toward, my: 1, facing: toward });
  let best: GrapplePick | null = null;
  let bestGain = 38;
  for (const c of cands) {
    const angle = c.my < 0 ? (Math.abs(c.mx) > 0.5 ? s.upAngle : -Math.PI / 2 + 0.05) : c.my > 0 && !f.grounded ? s.downAngle : 0;
    const probe = { ...f, facing: c.facing } as Fighter;
    const g: Grip | null = grabProbe(w, probe, angle, reach);
    if (!g || g.len < 28) continue;
    let ax: number;
    let ay: number;
    let swing = false;
    let gain: number;
    if (g.kind === 'ceiling') {
      // a swing carries us across: useful only toward a target that is off to the side and not far below
      swing = true;
      ax = g.x;
      ay = g.y;
      const horizontal = Math.abs(tx - f.x);
      if (horizontal < 80 || (tx - g.x) * toward < -10 || ty - f.y > 60) continue;
      gain = Math.min(horizontal, 160) * 0.8 - g.len * 0.15;
    } else if (g.kind === 'floor') {
      continue;
    } else {
      const a = gripTarget(g);
      ax = a.x;
      ay = a.y + SHOULDER_Y_STAND - 1; // (feet)
      gain = here - Math.hypot(tx - ax, ty - ay) - g.len * 0.05;
      if ((g.kind === 'platform' || g.kind === 'wall') && ay > f.y - (g.kind === 'wall' ? 40 : 20)) continue;
    }
    if (gain > bestGain) {
      bestGain = gain;
      best = { dir: c.facing, mx: c.mx, my: c.my, ax, ay, swing };
    }
  }
  return best;
}
