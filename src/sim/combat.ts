import { LAST_HIT_CREDIT } from './constants';
import type { HitKind } from './events';
import type { Fighter } from './fighter';
import { absorbForm } from './hero';
import type { World } from './world';

export interface Hit {
  damage: number;
  kbX: number;
  kbY: number;
  /** fighter id, or -1 for the environment */
  attacker: number;
  weapon: string;
  kind: HitKind;
  /** victim flinch seconds (0 = none) */
  stun?: number;
  knockdown?: boolean;
  x?: number;
  y?: number;
  /** hits even during roll i-frames */
  ignoreInvuln?: boolean;
}

export interface DamageInput {
  base: number;
  /** damage multiplier at max range */
  falloff?: number;
  /** 0..1 fraction of max range travelled */
  distFrac?: number;
  /** extra multipliers (strength boost, modifiers...) */
  mult?: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Pure damage formula. Rounded to 0.1 HP. */
export function computeDamage(inp: DamageInput): number {
  let d = inp.base;
  if (inp.falloff !== undefined && inp.distFrac !== undefined) {
    d *= 1 + (inp.falloff - 1) * clamp01(inp.distFrac);
  }
  if (inp.mult !== undefined) d *= inp.mult;
  return Math.max(0, Math.round(d * 10) / 10);
}

/** Team key: fighters on team 0 ("solo") are each their own team. */
export function teamKey(f: { id: number; team: number }): number {
  return f.team > 0 ? f.team : 100 + f.id;
}

export function sameTeam(a: { id: number; team: number }, b: { id: number; team: number }): boolean {
  return teamKey(a) === teamKey(b);
}

/**
 * Apply a hit to a fighter (alive or corpse). Returns true if it connected.
 * Handles friendly fire, i-frames, kill credit, knockback and hit reactions.
 */
export function applyHit(w: World, v: Fighter, hit: Hit): boolean {
  if (v.gone) return false;
  const hx = hit.x ?? v.x;
  const hy = hit.y ?? v.y - v.h / 2;
  const len = Math.hypot(hit.kbX, hit.kbY) || 1;

  if (!v.alive) {
    // Corpses get shoved around. Great for comedy, zero gameplay cost.
    v.vx += hit.kbX * 0.7;
    v.vy += hit.kbY * 0.7 - (hit.kind === 'bullet' ? 25 : 0);
    v.vrot += (hit.kbX >= 0 ? 1 : -1) * 3;
    v.grounded = false;
    w.emit({
      t: 'hit',
      victim: v.id,
      attacker: hit.attacker,
      damage: hit.damage,
      x: hx,
      y: hy,
      dirX: hit.kbX / len,
      dirY: hit.kbY / len,
      kind: hit.kind,
      weapon: hit.weapon,
      corpse: true,
    });
    return true;
  }

  if (v.invuln > 0 && !hit.ignoreInvuln) return false;
  const attacker = hit.attacker >= 0 ? w.fighters[hit.attacker] : undefined;
  if (attacker && attacker !== v && !w.settings.friendlyFire && sameTeam(attacker, v)) return false;

  let dmg = Math.max(0, hit.damage);
  if (w.mods.has('glassJaw') && hit.kind !== 'drain') dmg *= 3;
  const dealt = dmg;
  dmg = absorbForm(w, v, dmg, hit.kind);
  v.hp -= dmg;
  if (attacker && attacker !== v && attacker.alive && w.mods.has('vampires')) attacker.hp = Math.min(attacker.maxHp, attacker.hp + dealt * 0.5);
  if (attacker && attacker !== v) {
    v.lastAttacker = attacker.id;
    v.lastWeapon = hit.weapon;
    v.lastHitTime = w.time;
  }
  w.emit({
    t: 'hit',
    victim: v.id,
    attacker: hit.attacker,
    damage: dealt,
    x: hx,
    y: hy,
    dirX: hit.kbX / len,
    dirY: hit.kbY / len,
    kind: hit.kind,
    weapon: hit.weapon,
    corpse: false,
  });

  if (v.hp <= 0) {
    killFighter(w, v, hit);
    return true;
  }

  v.vx += hit.kbX * v.knockMul;
  v.vy += hit.kbY * v.knockMul;
  if (hit.kbY < -1) v.grounded = false;

  if (hit.knockdown && (v.knockMul >= 0.6 || hit.kind === 'explosion')) {
    w.releaseGrab(v);
    v.state = 'knockdown';
    v.stateTime = 0;
  } else if (hit.stun && hit.stun > 0 && v.state !== 'knockdown' && v.state !== 'grabbed') {
    if (v.state === 'grabbing' && hit.kind !== 'bullet') w.releaseGrab(v);
    if (v.state !== 'grabbing') {
      v.state = 'flinch';
      v.stateTime = 0;
      v.flinchTime = hit.stun;
    }
  }
  return true;
}

export function killFighter(w: World, v: Fighter, hit: Hit): void {
  if (!v.alive) return;
  w.releaseGrab(v);
  v.alive = false;
  v.hp = 0;
  v.state = 'dead';
  v.stateTime = 0;
  v.h = 10;
  v.invuln = 0;
  v.vx = v.vx * 0.4 + hit.kbX * 1.4;
  v.vy = Math.min(v.vy, 0) + Math.min(hit.kbY * 1.2, -80) - 60;
  v.grounded = false;
  const dir = hit.kbX !== 0 ? Math.sign(hit.kbX) : -v.facing;
  v.vrot = dir * w.rng.range(8, 14);
  w.dropAllWeapons(v);

  let killer = -1;
  let env = false;
  if (hit.attacker >= 0) {
    killer = hit.attacker;
  } else if (v.lastAttacker >= 0 && w.time - v.lastHitTime < LAST_HIT_CREDIT) {
    killer = v.lastAttacker;
    env = true;
  }
  w.emit({
    t: 'kill',
    victim: v.id,
    killer,
    weapon: env ? v.lastWeapon : hit.weapon,
    cause: hit.kind,
    env,
    x: v.x,
    y: v.y - 8,
  });
}
