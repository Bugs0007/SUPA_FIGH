import { BLOCK, LAST_HIT_CREDIT } from './constants';
import { heroAttackLabel } from './data/heroes';
import type { HitKind } from './events';
import type { Fighter } from './fighter';
import { absorbForm, dismissClone, superGuard } from './hero';
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

// ------------------------------------------------------------------ blocking (hold PUNCH, BLOCK in constants.ts)

/** Hit kinds a raised guard stops (from the front). Fire, drain, hazards, falls, splats, bodyslams, grabs and throws go through. */
const BLOCKABLE: readonly HitKind[] = ['melee', 'kick', 'bullet', 'explosion'];

let blockedLast = false;

/** Did the last applyHit() land on a raised guard (it returns true then too: the attack was stopped)? */
export function hitWasBlocked(): boolean {
  return blockedLast;
}

/** Hero abilities and supers (any hero move id except the '<hero>:combo' punches) and explosions hit a guard harder. */
export function heavyOnGuard(hit: Pick<Hit, 'kind' | 'weapon'>): boolean {
  if (hit.kind === 'explosion') return true;
  if (hit.weapon.endsWith(':combo')) return false;
  return heroAttackLabel(hit.weapon) !== null;
}

/**
 * Is the hit coming from the side the victim faces? `srcX` = where it comes from (the striker for melee, the
 * impact point for bullets); without one the knockback tells: a hit that shoves you backwards came from the front.
 */
function fromFront(v: Fighter, hit: Hit, srcX: number | undefined): boolean {
  if (srcX !== undefined) return (srcX - v.x) * v.facing >= -BLOCK.frontTol;
  return hit.kbX * v.facing < 0;
}

/**
 * A frontal hit on a raised guard: a perfect block (parry) costs nothing and staggers a close melee attacker;
 * otherwise chip damage, a small pushback, blockstun and guard meter drain. Returns false when the meter runs
 * out (GUARD BREAK): the caller then lands the hit in full.
 */
function guardHit(w: World, v: Fighter, hit: Hit, dmg: number, striker: Fighter | undefined): boolean {
  const hx = hit.x ?? v.x + v.facing * (v.w / 2);
  const hy = hit.y ?? v.y - v.h / 2;
  if (v.parryT > 0) {
    v.vx += hit.kbX * BLOCK.pushback * v.knockMul;
    const melee = hit.kind === 'melee' || hit.kind === 'kick';
    if (melee && striker && striker !== v && striker.alive && !superGuard(striker) && Math.abs(striker.x - v.x) <= BLOCK.parryRange) {
      w.releaseGrab(striker);
      const left = striker.state === 'flinch' ? striker.flinchTime - striker.stateTime : 0;
      striker.state = 'flinch';
      striker.stateTime = 0;
      striker.flinchTime = Math.max(BLOCK.parryStagger, left);
      striker.vx *= 0.2;
    }
    w.emit({ t: 'parry', victim: v.id, attacker: hit.attacker, x: hx, y: hy });
    return true;
  }
  const heavy = heavyOnGuard(hit);
  v.guard -= dmg * (heavy ? BLOCK.costHeavy : hit.kind === 'kick' ? BLOCK.costKick : BLOCK.cost);
  v.guardWait = BLOCK.regenDelay;
  if (v.guard <= 0) {
    v.guard = BLOCK.breakRefill;
    w.emit({ t: 'guardBreak', victim: v.id, x: v.x, y: v.y - v.h / 2 });
    return false;
  }
  v.vx += hit.kbX * BLOCK.pushback * v.knockMul;
  v.blockStun = Math.max(v.blockStun, Math.min(BLOCK.stunMax, BLOCK.stunBase + BLOCK.stunPerDamage * dmg));
  const chip = Math.round(dmg * (heavy ? BLOCK.chipHeavy : BLOCK.chip) * 10) / 10;
  w.emit({ t: 'block', victim: v.id, attacker: hit.attacker, x: hx, y: hy, chip });
  if (chip > 0) {
    v.hp -= absorbForm(w, v, chip, hit.kind);
    const attacker = hit.attacker >= 0 ? w.fighters[hit.attacker] : undefined;
    if (attacker && attacker !== v) {
      v.lastAttacker = attacker.id;
      v.lastWeapon = hit.weapon;
      v.lastHitTime = w.time;
    }
    if (v.hp <= 0) killFighter(w, v, hit);
  }
  return true;
}

/**
 * Apply a hit to a fighter (alive or corpse). Returns true if it connected (a blocked hit counts: see
 * hitWasBlocked()). Handles friendly fire, i-frames, blocking, kill credit, knockback and hit reactions.
 */
export function applyHit(w: World, v: Fighter, hit: Hit): boolean {
  blockedLast = false;
  if (v.gone) return false;
  // Supers cannot be cancelled by damage, stun, knockback, or burning (even ignoreInvuln hits).
  if (superGuard(v)) return false;
  // who the hit physically comes from (a shadow clone, not the master it is credited to): blocking / parries
  const striker = hit.attacker >= 0 ? w.fighters[hit.attacker] : undefined;
  // a shadow clone's hits (and kills) count for its master
  if (hit.attacker >= 0) {
    const a = w.fighters[hit.attacker];
    if (a && a.master >= 0) {
      // clones never hurt their master or each other
      if (v.id === a.master || v.master === a.master) return false;
      hit = { ...hit, attacker: a.master };
    }
  }
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
  if (v.state === 'block' && BLOCKABLE.includes(hit.kind)) {
    const melee = hit.kind === 'melee' || hit.kind === 'kick';
    const srcX = melee && striker ? striker.x : hit.kind === 'explosion' ? undefined : (hit.x ?? striker?.x);
    if (fromFront(v, hit, srcX)) {
      if (guardHit(w, v, hit, dmg, striker)) {
        blockedLast = true;
        return true;
      }
      // GUARD BREAK: this hit lands in full, then a long stun (no knockdown: they stand there dazed)
      hit = { ...hit, stun: Math.max(hit.stun ?? 0, BLOCK.breakStun), knockdown: false };
    }
    // hit from behind (or a broken guard): the guard drops
    v.state = 'normal';
    v.stateTime = 0;
    v.blockStun = 0;
    v.parryT = 0;
  }
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
      // a long stun (Chidori's) must not be cut short by a later, shorter one
      const left = v.state === 'flinch' ? v.flinchTime - v.stateTime : 0;
      v.state = 'flinch';
      v.stateTime = 0;
      v.flinchTime = Math.max(hit.stun, left);
    }
  }
  return true;
}

export function killFighter(w: World, v: Fighter, hit: Hit): void {
  if (!v.alive) return;
  if (v.master >= 0) {
    // clones don't die, they poof: no corpse, no kill feed, no score
    dismissClone(w, v);
    return;
  }
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
