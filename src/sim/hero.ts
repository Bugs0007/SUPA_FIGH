// Heroes (M9, reworked M11): power-orb transformations with form levels, abilities 1 / 2, supers,
// Goku's instant transmission, Luffy's grapple probe and Naruto's shadow-clone fighters.
// Data in data/heroes.ts. The state machine lives in sim/fighter.ts.

import { applyHit, hitWasBlocked, sameTeam } from './combat';
import { FIGHTER_H, SHOULDER_Y_STAND, TILE } from './constants';
import {
  cloneSpec,
  baseWeaponId,
  DASH_CLASH,
  FORM_BYPASS,
  FORM_HP,
  GENERIC_BOOST,
  GENERIC_DURATION,
  heroDef,
  maxLevel,
  SUPER_AREA,
  SUSANOO_LAUNCH,
  type AbilityDefinition,
  type BaseAbility,
  type BeamStats,
  type BlinkStats,
  type SecondAbility,
  type StretchStats,
  type SuperAbility,
} from './data/heroes';
import { weaponDef, type ExplosionStats } from './data/weapons';
import { areaFrac, COVER, explode, lineBlocked } from './explosion';
import type { Fighter } from './fighter';
import { segmentAabb } from './physics';
import { damageProp, pushProp } from './prop';
import { ignite, igniteTile, spawnFire } from './fire';
import type { World } from './world';

// ------------------------------------------------------------------ transformation state

/** Stat changes shaping this fighter now (hero form at its level, or the generic boost). */
export function ability(f: Fighter): AbilityDefinition | null {
  if (f.power === 'boost') return GENERIC_BOOST;
  if (f.power !== 'hero') return null;
  return heroDef(f.hero)?.forms[f.powerLevel - 1] ?? null;
}

/** Fully transformed hero (super available, form looks). */
export function transformed(f: Fighter): boolean {
  return f.power === 'hero' && f.powerLevel > 0;
}

/** Ultimate protection is derived from the move, so it cannot leak into a later action. */
export function superGuard(f: Fighter): boolean {
  return f.alive && transformed(f) && f.state === 'special' &&
    ['bomb', 'superFist', 'superCharge', 'superBeam'].includes(f.specialKind);
}

export function usesAmaterasu(f: Fighter): boolean {
  const a = heroDef(f.hero)?.second.amaterasu;
  return !!a && transformed(f) && f.powerLevel >= a.minLevel;
}

/** An enemy of `f` that a move may pick on: not a friend (unless friendly fire), not the fighter's own clones. */
function isEnemy(w: World, f: Fighter, o: Fighter): boolean {
  if (o === f || !o.alive || o.gone || (!w.settings.friendlyFire && sameTeam(f, o))) return false;
  if (o.master === f.id || (f.master >= 0 && (o.id === f.master || o.master === f.master))) return false;
  return true;
}

/** Is there open space (no solid tile) between two points? */
function clearView(w: World, x0: number, y0: number, x1: number, y1: number): boolean {
  let blocked = false;
  w.map.traverse(x0, y0, x1, y1, (tx, ty) => {
    if (!w.map.def(tx, ty).solid) return false;
    blocked = true;
    return true;
  });
  return !blocked;
}

/** How far Amaterasu reaches and how many enemies it burns at the caster's current form. */
export function amaterasuReach(f: Fighter): { range: number; count: number } {
  const a = heroDef(f.hero)?.second.amaterasu;
  if (!a) return { range: 0, count: 0 };
  const extra = Math.max(0, (f.power === 'hero' ? f.powerLevel : 0) - a.minLevel);
  return { range: a.range + a.rangePerLevel * extra, count: a.targets + a.targetsPerLevel * extra };
}

/**
 * The visible enemies in Sasuke's view, nearest first, as many as this form's Amaterasu can burn: anyone in front within
 * `range` and within `view` radians above or below straight ahead (his peripheral view, so enemies on platforms above
 * and below are caught too). Solid geometry always blocks the eye jutsu.
 */
export function amaterasuTargets(w: World, f: Fighter): Fighter[] {
  const a = heroDef(f.hero)?.second.amaterasu;
  if (!a) return [];
  const { range, count } = amaterasuReach(f);
  const sx = f.x, sy = f.y - SHOULDER_Y_STAND - 3;
  const seen: { o: Fighter; dist: number }[] = [];
  for (const o of w.fighters) {
    if (!isEnemy(w, f, o)) continue;
    const ox = o.x - sx, oy = o.y - o.h * .5 - sy, dist = Math.hypot(ox, oy);
    if (dist > range + .001 || (dist > 1 && Math.abs(Math.atan2(oy, ox * f.facing)) > a.view)) continue;
    if (clearView(w, sx, sy, o.x, o.y - o.h * .5)) seen.push({ o, dist });
  }
  return seen.sort((p, q) => p.dist - q.dist).slice(0, count).map((s) => s.o);
}

/** The nearest enemy Amaterasu would burn (null when nobody is in sight). */
export function amaterasuTarget(w: World, f: Fighter): Fighter | null {
  return amaterasuTargets(w, f)[0] ?? null;
}

// ------------------------------------------------------------------ locking an ultimate onto an enemy

/** widest angle from straight ahead (radians) at which an ultimate locks onto an enemy */
const LOCK_CONE = 0.95;

/**
 * The enemy an ultimate locks onto when it starts: the nearest one in front of the fighter (within `range`, inside a
 * cone around the facing direction) that is in clear view. null = nobody to lock onto.
 */
export function ultimateTarget(w: World, f: Fighter, range: number): Fighter | null {
  const sx = f.x, sy = f.y - SHOULDER_Y_STAND - 3;
  let best: Fighter | null = null;
  let bestDist = range;
  for (const o of w.fighters) {
    if (!isEnemy(w, f, o)) continue;
    const dx = (o.x - sx) * f.facing;
    const dy = o.y - o.h * .5 - sy;
    if (dx < 4) continue; // behind or beside
    const dist = Math.hypot(dx, dy);
    if (dist > bestDist || Math.abs(Math.atan2(dy, dx)) > LOCK_CONE) continue;
    if (!clearView(w, sx, sy, o.x, o.y - o.h * .5)) continue;
    best = o;
    bestDist = dist;
  }
  return best;
}

/**
 * Where to aim (facing-local angle, + = down) from (sx, sy) to hit `o` with a projectile of `speed`: at where they will
 * be when it arrives, leading by most of their speed.
 */
export function leadAngle(f: Fighter, sx: number, sy: number, o: Fighter, speed: number): number {
  const cx = o.x, cy = o.y - o.h * .5;
  const t = Math.hypot(cx - sx, cy - sy) / speed;
  const ax = cx + o.vx * t * 0.6, ay = cy + o.vy * t * 0.35;
  return Math.max(-1.2, Math.min(1.2, Math.atan2(ay - sy, Math.max(4, (ax - sx) * f.facing))));
}

/** Set the ultimate's aim as it starts: manual with Up / Down held, otherwise locked onto the enemy being faced. */
export function aimUltimate(w: World, f: Fighter, moveY: number, kind: 'chakra' | 'ki' | undefined, range: number, manual: number): void {
  f.lockOn = -1;
  if (Math.abs(moveY) > 0.5) {
    f.stretchAngle = kind === 'ki' ? (moveY < 0 ? -manual : f.grounded ? 0 : manual) : 0;
    return;
  }
  const target = ultimateTarget(w, f, range);
  f.stretchAngle = 0;
  if (!target) return;
  f.lockOn = target.id;
  f.stretchAngle = leadAngle(f, f.x, f.y - SHOULDER_Y_STAND - 3, target, 430);
}

/** Name of the current form ('' when not powered). */
export function formName(f: Fighter): string {
  if (f.power === 'boost') return 'POWERED UP';
  return ability(f) ? (heroDef(f.hero)?.forms[f.powerLevel - 1]?.name ?? '') : '';
}

/**
 * Power orb picked up (D58). Heroes go up one form level (capped) and the timer refills; anyone else
 * gets the generic boost. Returns the new level (0 for the boost).
 */
export function transform(w: World, f: Fighter): number {
  const hero = heroDef(f.hero);
  if (f.master >= 0) return 0; // shadow clones never eat power orbs
  if (hero) {
    const prev = f.power === 'hero' ? f.powerLevel : 0;
    f.power = 'hero';
    f.powerLevel = Math.min(maxLevel(f.hero), prev + 1);
    f.powerFull = true;
    // no timer: a new orb adds a fresh layer of form health (the cap is one full layer per level)
    f.powerMax = 0;
    f.powerTime = 0;
    f.formHp = Math.min(f.powerLevel * FORM_HP, (prev === 0 ? 0 : f.formHp) + FORM_HP);
    if (prev === 0) f.specialCd = 0;
    w.emit({ t: 'transform', f: f.id, hero: f.hero, level: f.powerLevel, full: true, x: f.x, y: f.y });
    return f.powerLevel;
  }
  f.power = 'boost';
  f.powerLevel = 0;
  f.powerFull = false;
  f.powerMax = GENERIC_DURATION;
  f.powerTime = GENERIC_DURATION;
  w.emit({ t: 'transform', f: f.id, hero: '', level: 0, full: false, x: f.x, y: f.y });
  return 0;
}

/** Power runs out (or the fighter dies): back to base form. */
export function endPower(w: World, f: Fighter): void {
  if (!f.power) return;
  f.power = '';
  f.powerLevel = 0;
  f.powerFull = false;
  f.powerTime = 0;
  f.powerMax = 0;
  f.formHp = 0;
  f.charge = -1;
  f.stretchLen = 0;
  if (f.flyHold) f.flying = false;
  f.flyHold = false;
  w.emit({ t: 'powerEnd', f: f.id, hero: f.hero });
}

export function updatePower(w: World, f: Fighter, dt: number): void {
  if (f.specialCd > 0) f.specialCd -= dt;
  // Naruto's clone cooldown only runs once every clone is dead or recalled
  if (f.secondCd > 0 && f.cloneCount === 0) f.secondCd -= dt;
  if (!f.power) return;
  if (f.power === 'hero') {
    // heroes: the form lasts until its form health is gone
    if (f.formHp <= 0) endPower(w, f);
    return;
  }
  f.powerTime -= dt;
  if (f.powerTime <= 0) endPower(w, f);
}

/** Layers of form health currently shown (one per FORM_HP, the top one may be partial). */
export function formLayers(f: Fighter): number {
  return f.power === 'hero' ? Math.ceil(Math.max(0, f.formHp) / FORM_HP) : 0;
}

/**
 * A hit's damage goes into the form health first. Returns the damage left over for the real health bar
 * (0 while the form holds). The form wears off when its health reaches zero.
 */
export function absorbForm(w: World, v: Fighter, dmg: number, kind: string): number {
  if (v.power !== 'hero' || v.formHp <= 0 || dmg <= 0) return dmg;
  if ((FORM_BYPASS as readonly string[]).includes(kind) || dmg >= 500) return dmg;
  const taken = Math.min(v.formHp, dmg);
  v.formHp -= taken;
  if (v.formHp <= 0.001) {
    v.formHp = 0;
    endPower(w, v);
  }
  return dmg - taken;
}

/** Can this fighter fly by holding Up (Goku always, Naruto and Luffy in their final forms)? */
export function holdFlies(f: Fighter): boolean {
  const def = heroDef(f.hero);
  if (!def) return false;
  if (def.alwaysFlies) return true;
  return f.power === 'hero' && !!def.forms[f.powerLevel - 1]?.flies;
}

export function baseAbility(f: Fighter): BaseAbility | null {
  return heroDef(f.hero)?.base ?? null;
}

export function secondAbility(f: Fighter): SecondAbility | null {
  return heroDef(f.hero)?.second ?? null;
}

/** Melee-style damage/knockback multipliers (strength pickup, hero form / generic boost). */
export function meleeMuls(f: Fighter): { dmg: number; knock: number } {
  const strength = f.strengthBoost > 0 ? (weaponDef('strength').powerup?.mult ?? 1) : 1;
  const ab = ability(f);
  return { dmg: strength * (ab?.damageMul ?? 1), knock: (1 + (strength - 1) * 0.5) * (ab?.knockMul ?? 1) };
}

// ------------------------------------------------------------------ rasengan / chidori (Naruto, Sasuke: ability 1)

type DashStats = NonNullable<BaseAbility['dash']>;

/**
 * Unit vector (world space, y down) the Rasengan / Chidori is aimed or dashing along. `dashAngle` is facing-local
 * (0 = straight ahead, + = down), so the horizontal component always follows `facing`.
 */
export function dashDir(f: Fighter): { x: number; y: number } {
  const c = Math.cos(f.dashAngle);
  return { x: Math.abs(c) < 1e-9 ? 0 : f.facing * c, y: Math.sin(f.dashAngle) };
}

/** Where the Rasengan orb sits: in front of the palm, along the aim / dash direction (above the head for straight up). */
export function rasenganPoint(f: Fighter): { x: number; y: number } {
  const d = dashDir(f);
  return { x: f.x + d.x * (f.w / 2 + 4), y: f.y - SHOULDER_Y_STAND + 1 + d.y * (f.h - SHOULDER_Y_STAND + 5) };
}

/** Orb radius (grows one px per form level). */
function orbRadius(f: Fighter, d: DashStats): number {
  return d.radius + (f.power === 'hero' ? f.powerLevel : 0);
}

/** Does a circle touch a fighter's body box? */
function orbTouches(hx: number, hy: number, r: number, o: { x: number; y: number; w: number; h: number }): boolean {
  const nx = Math.max(o.x - o.w / 2, Math.min(hx, o.x + o.w / 2));
  const ny = Math.max(o.y - o.h, Math.min(hy, o.y));
  return (nx - hx) ** 2 + (ny - hy) ** 2 <= r * r;
}

/** The dash stats while this fighter's orb can strike or clash: formed in the windup, or out in the dash. */
function liveOrb(f: Fighter): DashStats | null {
  if (!f.alive || f.gone || f.state !== 'special' || f.specialKind !== 'rasengan' || f.recoverAt !== 0) return null;
  const d = baseAbility(f)?.dash;
  return d && f.stateTime >= d.windup * DASH_CLASH.formedFrac ? d : null;
}

/** Is `a` aiming its orb at `b` (body centres)? */
function aimsAt(a: Fighter, b: Fighter): boolean {
  const d = dashDir(a);
  return d.x * (b.x - a.x) + d.y * (b.y - b.h / 2 - (a.y - a.h / 2)) > 0;
}

/**
 * Do the two fighters' orbs meet? Both orbs out (at least one of them dashing), enemies, neither has hit the other
 * this move, and either the orbs overlap or one orb reaches the other fighter while both aim at each other.
 */
function clashing(w: World, a: Fighter, b: Fighter): boolean {
  const da = liveOrb(a);
  const db = liveOrb(b);
  if (!da || !db || !isEnemy(w, a, b) || !isEnemy(w, b, a)) return false;
  if (a.stateTime < da.windup && b.stateTime < db.windup) return false; // nobody is dashing yet
  if (a.swingHit.includes(b.id) || b.swingHit.includes(a.id)) return false;
  const pa = rasenganPoint(a);
  const pb = rasenganPoint(b);
  const ra = orbRadius(a, da);
  const rb = orbRadius(b, db);
  if (Math.hypot(pa.x - pb.x, pa.y - pb.y) <= ra + rb + DASH_CLASH.slack) return true;
  if (!orbTouches(pa.x, pa.y, ra, b) && !orbTouches(pb.x, pb.y, rb, a)) return false;
  return aimsAt(a, b) && aimsAt(b, a);
}

/** The attacker's numbers for one orb strike, read before any hit of a clash lands (a hit can end a form). */
interface OrbPower {
  m: { dmg: number; knock: number };
  level: number;
  dir: { x: number; y: number };
}

function orbPower(f: Fighter): OrbPower {
  return { m: meleeMuls(f), level: f.power === 'hero' ? f.powerLevel : 0, dir: dashDir(f) };
}

/**
 * `f`'s orb lands on `o`: blasted along the dash direction with a little lift (a downward strike on a grounded
 * victim pops them up instead of driving them into the floor); Chidori's shock spreads. True if it connected.
 */
function orbStrike(w: World, f: Fighter, o: Fighter, d: DashStats, p: OrbPower, x: number, y: number, burst = true): boolean {
  const lift = d.knockY * (p.dir.y < 0 ? 1 + p.dir.y : 1);
  let kbY = p.dir.y * d.knockX + lift;
  if (o.grounded) kbY = Math.min(kbY, d.knockY);
  const connected = applyHit(w, o, {
    damage: d.damage * p.m.dmg,
    kbX: p.dir.x * d.knockX * p.m.knock,
    kbY: kbY * p.m.knock,
    attacker: f.id,
    weapon: baseWeaponId(baseAbility(f)!),
    kind: 'melee',
    stun: d.stun,
    // a stun of a second or more holds the victim in place; a short one still knocks them down
    knockdown: d.stun < 1,
    x,
    y,
  });
  if (connected) {
    if (burst) w.emit({ t: 'heroFx', fx: f.hero === 'sasuke' ? 'ki' : 'rasengan', heavy: true, x, y });
    if (d.spread && !hitWasBlocked()) chidoriShock(w, f, o, d, p); // (a guard stops the shock too)
  }
  return connected;
}

/**
 * Two orbs meeting (Rasengan vs Chidori, or either against itself) settle in one place once every fighter has
 * moved this tick, so the outcome never depends on fighter order: both dashes end and BOTH fighters take the
 * other's full hit (each from its owner's numbers, read before either lands).
 */
export function resolveOrbClashes(w: World): void {
  const fs = w.fighters;
  for (let i = 0; i < fs.length; i++) {
    if (!liveOrb(fs[i])) continue;
    for (let j = i + 1; j < fs.length; j++) {
      const a = fs[i];
      const b = fs[j];
      if (!clashing(w, a, b)) continue;
      const da = liveOrb(a)!;
      const db = liveOrb(b)!;
      const pa = orbPower(a);
      const pb = orbPower(b);
      const oa = rasenganPoint(a);
      const ob = rasenganPoint(b);
      const x = (oa.x + ob.x) / 2;
      const y = (oa.y + ob.y) / 2;
      for (const [f, o] of [[a, b], [b, a]] as const) {
        f.swingHit.push(o.id);
        f.recoverAt = f.stateTime;
        f.vx = 0;
        f.vy = 0;
      }
      w.emit({ t: 'clash', a: a.id, b: b.id, x, y });
      orbStrike(w, a, b, da, pa, x, y, false);
      orbStrike(w, b, a, db, pb, x, y, false);
      break; // a's move is over
    }
  }
}

/** How many fighters Chidori's shock reaches, and how far from the victim, at a form level. */
export function chidoriReach(d: NonNullable<NonNullable<BaseAbility['dash']>['spread']>, level: number): { count: number; radius: number } {
  return { count: d.count + d.countPerLevel * level, radius: d.radius + d.radiusPerLevel * level };
}

/** The shock arcs from the stunned victim to the nearest enemies around them: they take part of the hit and the same stun. */
function chidoriShock(w: World, f: Fighter, victim: Fighter, d: DashStats, p: OrbPower): void {
  const reach = chidoriReach(d.spread!, p.level);
  const m = p.m;
  const vx = victim.x;
  const vy = victim.y - victim.h * 0.5;
  const near: { o: Fighter; dist: number }[] = [];
  for (const o of w.fighters) {
    if (o === f || o === victim || !o.alive || o.gone || !isEnemy(w, f, o)) continue;
    const dist = Math.hypot(o.x - vx, o.y - o.h * 0.5 - vy);
    if (dist <= reach.radius) near.push({ o, dist });
  }
  near.sort((a, b) => a.dist - b.dist);
  for (const { o } of near.slice(0, reach.count)) {
    const connected = applyHit(w, o, {
      damage: d.damage * m.dmg * d.spread!.damageFrac,
      kbX: Math.sign(o.x - vx || f.facing) * 90 * m.knock,
      kbY: -50,
      attacker: f.id,
      weapon: baseWeaponId(baseAbility(f)!),
      kind: 'melee',
      stun: d.stun,
      x: o.x,
      y: o.y - o.h * 0.5,
    });
    if (connected) {
      w.emit({ t: 'arc', f: f.id, x0: vx, y0: vy, x1: o.x, y1: o.y - o.h * 0.5 });
      w.emit({ t: 'heroFx', fx: 'ki', heavy: false, x: o.x, y: o.y - o.h * 0.5 });
    }
  }
}

/**
 * Rasengan contact: the first fighter the orb touches is blasted along the dash. Props get shoved. True on a hit.
 * A fighter whose own orb is coming the other way is left alone here: that is a clash (resolveOrbClashes).
 */
export function rasenganHit(w: World, f: Fighter, d: DashStats): boolean {
  const { x: hx, y: hy } = rasenganPoint(f);
  const r = orbRadius(f, d);
  const p = orbPower(f);
  for (const pr of w.props) {
    if (!pr.active || f.swingProps.includes(pr.id)) continue;
    if (!orbTouches(hx, hy, r, pr)) continue;
    f.swingProps.push(pr.id);
    pushProp(pr, p.dir.x * d.knockX * p.m.knock, (p.dir.y * d.knockX * p.m.knock + d.knockY) * 0.6);
    damageProp(w, pr, d.damage * p.m.dmg, f.id);
  }
  for (const o of w.fighters) {
    if (o === f || o.gone || !o.alive || f.swingHit.includes(o.id)) continue;
    if (!orbTouches(hx, hy, r, o) || clashing(w, f, o)) continue;
    f.swingHit.push(o.id);
    if (orbStrike(w, f, o, d, p, hx, hy)) return true;
  }
  return false;
}

// ------------------------------------------------------------------ stretch punches (Luffy)

/** Fist position of an angled stretch punch at a given reach (from the shoulder). */
export function stretchFist(f: Fighter, angle: number, reach: number): { x0: number; y0: number; x1: number; y1: number } {
  const x0 = f.x + f.facing * 2;
  const y0 = f.y - SHOULDER_Y_STAND + 1;
  return { x0, y0, x1: x0 + Math.cos(angle) * f.facing * (f.w / 2 + reach), y1: y0 + Math.sin(angle) * (f.w / 2 + reach) };
}

/**
 * A stretched arm reaching `reach` px along `angle`: hits every fighter/prop on the segment once
 * (the fist has radius `fist`). Returns the actual arm length (stops at the first solid tile) and
 * whether the fist touched a wall.
 */
export function pistolHits(
  w: World,
  f: Fighter,
  s: StretchStats,
  angle: number,
  reach: number,
  opts: { weapon?: string; damage?: number; fist?: number } = {},
): { len: number; wall: boolean } {
  const dx = Math.cos(angle) * f.facing;
  const dy = Math.sin(angle);
  const { x0, y0 } = stretchFist(f, angle, 0);
  const total = f.w / 2 + reach;
  let len = total;
  let wall = false;
  for (let d = 0; d <= total; d += 2) {
    if (w.map.solidAtPx(x0 + dx * d, y0 + dy * d)) {
      len = Math.max(0, d - 2);
      wall = true;
      break;
    }
  }
  const x1 = x0 + dx * len;
  const y1 = y0 + dy * len;
  const m = meleeMuls(f);
  const pad = 2 + (opts.fist ?? 0);
  const damage = (opts.damage ?? s.damage) * m.dmg;
  for (const p of w.props) {
    if (!p.active || f.swingProps.includes(p.id)) continue;
    if (segmentAabb(x0, y0, x1, y1, p.x - p.w / 2 - pad, p.y - p.h - pad, p.x + p.w / 2 + pad, p.y + pad) < 0) continue;
    f.swingProps.push(p.id);
    pushProp(p, dx * s.knockX * 0.8 * m.knock, -80);
    damageProp(w, p, damage, f.id);
  }
  for (const o of w.fighters) {
    if (o === f || o.gone || f.swingHit.includes(o.id)) continue;
    if (segmentAabb(x0, y0, x1, y1, o.x - o.w / 2 - pad, o.y - o.h - pad, o.x + o.w / 2 + pad, o.y + pad) < 0) continue;
    f.swingHit.push(o.id);
    const hx = Math.max(o.x - o.w / 2, Math.min(x1, o.x + o.w / 2));
    const connected = applyHit(w, o, {
      damage,
      kbX: f.facing * s.knockX * m.knock,
      kbY: s.knockY * m.knock + dy * 120,
      attacker: f.id,
      weapon: opts.weapon ?? 'gumgum',
      kind: 'melee',
      stun: 0.3,
      knockdown: true,
      x: hx,
      y: o.y - o.h / 2,
    });
    if (connected) w.emit({ t: 'heroFx', fx: 'steam', heavy: !!opts.fist, x: hx, y: o.y - o.h / 2 });
  }
  return { len, wall };
}

/**
 * Luffy's giant fist lands (full reach, or the wall that stopped it) at (x, y): a shockwave of `radius` px hits every
 * enemy around it that the arm itself has not hit yet, with the super area falloff (SUPER_AREA) and wall cover.
 */
export function fistShock(w: World, f: Fighter, s: StretchStats, x: number, y: number, radius: number, weapon: string): void {
  const m = meleeMuls(f);
  w.emit({ t: 'shockwave', f: f.id, x, y, radius });
  for (const p of w.props) {
    if (!p.active || f.swingProps.includes(p.id)) continue;
    if (Math.hypot(p.x - x, p.y - p.h / 2 - y) - Math.max(p.w, p.h) / 2 >= radius) continue;
    f.swingProps.push(p.id);
    pushProp(p, Math.sign(p.x - x || f.facing) * s.knockX * 0.6 * m.knock, -100);
    damageProp(w, p, s.damage * m.dmg * SUPER_AREA.edge, f.id);
  }
  for (const o of w.fighters) {
    if (!isEnemy(w, f, o) || f.swingHit.includes(o.id)) continue;
    const cy = o.y - o.h / 2;
    const d = Math.max(0, Math.hypot(o.x - x, cy - y) - 6);
    if (d >= radius) continue;
    const share = areaFrac(d / radius, SUPER_AREA.core, SUPER_AREA.edge) * (lineBlocked(w, x, y, o.x, cy) ? COVER : 1);
    f.swingHit.push(o.id);
    const dir = Math.sign(o.x - x) || f.facing;
    const connected = applyHit(w, o, {
      damage: s.damage * m.dmg * share,
      kbX: dir * s.knockX * m.knock * (0.35 + 0.65 * share),
      kbY: s.knockY * m.knock,
      attacker: f.id,
      weapon,
      kind: 'melee',
      stun: 0.3,
      knockdown: true,
      x: o.x - dir * (o.w / 2),
      y: cy,
    });
    if (connected) w.emit({ t: 'heroFx', fx: 'steam', heavy: true, x: o.x - dir * (o.w / 2), y: cy });
  }
}

/** Reach of a stretch move (out / hold / back) at time t. */
export function stretchAt(s: StretchStats, t: number): number {
  if (t < s.out) return s.range * (t / s.out);
  if (t < s.out + s.hold) return s.range;
  return Math.max(0, s.range * (1 - (t - s.out - s.hold) / s.back));
}

/**
 * Gum-Gum Gatling: one round of punches in front (every `every` seconds). Targets can be hit again
 * after `rehit`. `final` = the last punch of the flurry (big knockback).
 */
export function gatlingHit(w: World, f: Fighter, g: NonNullable<SecondAbility['gatling']>, final: boolean): void {
  const near = f.x + f.facing * (f.w / 2 - 2);
  const far = f.x + f.facing * (f.w / 2 + g.range + (ability(f)?.reach ?? 0) * 2);
  const l = Math.min(near, far);
  const r = Math.max(near, far);
  const t = f.y - 21;
  const b = f.y - 5;
  const m = meleeMuls(f);
  for (const p of w.props) {
    if (!p.active || f.swingProps.includes(p.id)) continue;
    if (p.x + p.w / 2 < l || p.x - p.w / 2 > r || p.y - p.h > b || p.y < t) continue;
    f.swingProps.push(p.id);
    pushProp(p, f.facing * g.knockX * m.knock, -40);
    damageProp(w, p, g.damage * m.dmg, f.id);
  }
  for (const o of w.fighters) {
    if (o === f || o.gone || f.swingHit.includes(o.id)) continue;
    if (o.x + o.w / 2 < l || o.x - o.w / 2 > r || o.y - o.h > b || o.y < t) continue;
    // stop at walls: no punching through them
    if (!w.map.clearShot(f.x, f.y - 14, o.x, o.y - 12)) continue;
    f.swingHit.push(o.id);
    const connected = applyHit(w, o, {
      damage: g.damage * m.dmg * (final ? 2 : 1),
      kbX: f.facing * (final ? g.finalKnock : g.knockX) * m.knock,
      kbY: final ? -160 : -20,
      attacker: f.id,
      weapon: f.hero + ':second',
      kind: 'melee',
      stun: final ? 0.3 : 0.18,
      knockdown: final,
      x: o.x - f.facing * (o.w / 2),
      y: o.y - 14,
    });
    if (connected) w.emit({ t: 'heroFx', fx: 'steam', heavy: final, x: o.x - f.facing * (o.w / 2), y: o.y - 14 });
  }
}

// ------------------------------------------------------------------ beams (Goku)

/** Charge (seconds held) -> 0..1 */
export function beamPower(b: BeamStats, charge: number): number {
  if (b.maxCharge <= b.minCharge) return 1;
  return Math.max(0, Math.min(1, (charge - b.minCharge) / (b.maxCharge - b.minCharge)));
}

/**
 * The beam a fighter is firing right now (Kamehameha, or a super beam): its stats, half thickness, damage (before
 * the form multiplier), knockback and reach at this moment (grown, before walls). null = not firing a beam.
 */
export function beamNow(f: Fighter): { b: BeamStats; isSuper: boolean; half: number; dmg: number; knock: number; len: number; active: boolean } | null {
  if (f.state !== 'special' || (f.specialKind !== 'beam' && f.specialKind !== 'superBeam')) return null;
  const isSuper = f.specialKind === 'superBeam';
  const h = heroDef(f.hero);
  const sb = isSuper ? h?.super.beam : undefined;
  const b = isSuper ? sb : h?.second.beam;
  if (!b) return null;
  const lvl = Math.max(0, f.powerLevel - 1);
  const pw = isSuper ? 1 : beamPower(b, f.charge);
  const t = f.stateTime;
  return {
    b,
    isSuper,
    half: sb ? sb.width[0] + sb.widthPerLevel * lvl : b.width[0] + (b.width[1] - b.width[0]) * pw,
    dmg: sb ? sb.damage[0] + sb.damagePerLevel * lvl : b.damage[0] + (b.damage[1] - b.damage[0]) * pw,
    knock: b.knock[0] + (b.knock[1] - b.knock[0]) * pw,
    len: t < b.grow ? b.range * (t / b.grow) : b.range,
    active: t < b.grow + b.hold,
  };
}

/** Origin of a beam (between Goku's palms). */
export function beamOrigin(f: Fighter): { x: number; y: number } {
  return { x: f.x + f.facing * (f.w / 2 + 2), y: f.y - SHOULDER_Y_STAND + 2 };
}

/**
 * An energy beam out to `len` px along `angle`, `half` px thick. Hits every fighter/prop on it once.
 * Stops at solid tiles; with `breakTiles` glass and wood in the way shatter and it keeps going.
 * Returns the actual length.
 */
export function beamHits(
  w: World,
  f: Fighter,
  angle: number,
  len: number,
  half: number,
  damage: number,
  knock: number,
  weapon: string,
  breakTiles = false,
): number {
  const { x: x0, y: y0 } = beamOrigin(f);
  const dx = Math.cos(angle) * f.facing;
  const dy = Math.sin(angle);
  let actual = len;
  for (let d = 0; d <= len; d += 3) {
    const px = x0 + dx * d;
    const py = y0 + dy * d;
    if (!w.map.solidAtPx(px, py)) continue;
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    if (breakTiles && w.map.def(tx, ty).breakable) {
      w.breakTile(tx, ty);
      continue;
    }
    actual = d;
    break;
  }
  const x1 = x0 + dx * actual;
  const y1 = y0 + dy * actual;
  const m = meleeMuls(f);
  for (const p of w.props) {
    if (!p.active || f.swingProps.includes(p.id)) continue;
    if (segmentAabb(x0, y0, x1, y1, p.x - p.w / 2 - half, p.y - p.h - half, p.x + p.w / 2 + half, p.y + half) < 0) continue;
    f.swingProps.push(p.id);
    pushProp(p, dx * knock * m.knock, dy * knock - 60);
    damageProp(w, p, damage * m.dmg, f.id);
  }
  for (const o of w.fighters) {
    if (o === f || o.gone || f.swingHit.includes(o.id)) continue;
    if (segmentAabb(x0, y0, x1, y1, o.x - o.w / 2 - half, o.y - o.h - half, o.x + o.w / 2 + half, o.y + half) < 0) continue;
    f.swingHit.push(o.id);
    const hx = Math.max(o.x - o.w / 2, Math.min(o.x + o.w / 2, x1));
    const connected = applyHit(w, o, {
      damage: damage * m.dmg,
      kbX: dx * knock * m.knock,
      kbY: dy * knock * m.knock - knock * 0.35,
      attacker: f.id,
      weapon,
      kind: 'melee',
      stun: 0.3,
      knockdown: true,
      x: hx,
      y: o.y - o.h / 2,
    });
    if (connected) w.emit({ t: 'heroFx', fx: 'ki', heavy: true, x: hx, y: o.y - o.h / 2 });
  }
  return actual;
}

// ------------------------------------------------------------------ explosive hero balls (Naruto / Goku supers)

/** Sasuke's travelling fire jutsu. Uses the normal projectile collision and burn rules. */
export function fireJutsu(w: World, f: Fighter): void {
  const s = secondAbility(f)?.fireball;
  if (!s) return;
  const level = f.power === 'hero' ? f.powerLevel : 0;
  if (usesAmaterasu(f)) {
    const a = heroDef(f.hero)!.second.amaterasu!;
    const targets = amaterasuTargets(w,f);
    let index = 0;
    for (const target of targets) {
      const connected = applyHit(w,target,{ damage:a.damage*meleeMuls(f).dmg,kbX:0,kbY:0,
        attacker:f.id,weapon:'amaterasu',kind:'fire',x:target.x,y:target.y-target.h*.5 });
      if (!connected) continue;
      ignite(w,target,a.duration,f.id,'amaterasu');
      scorchGround(w,target,a.patches,f.id);
      w.emit({t:'amaterasu',f:f.id,target:target.id,x:target.x,y:target.y-target.h*.5,index:index++});
    }
    if (index === 0) w.emit({t:'amaterasu',f:f.id,target:-1,x:f.x+f.facing*amaterasuReach(f).range,y:f.y-18,index:0});
    return;
  }
  const size = s.size + s.sizePerLevel * level;
  const dx = f.facing * Math.cos(f.stretchAngle), dy = Math.sin(f.stretchAngle);
  const x = f.x + dx * (size + 9), y = f.y - SHOULDER_Y_STAND - 3 + dy * (size + 9);
  const m = meleeMuls(f);
  const damage = (s.damage + s.damagePerLevel * level) * m.dmg;
  w.spawnBullet({ x, y, ox: x, oy: y, vx: dx * s.speed, vy: dy * s.speed,
    owner: f.id, weapon: f.hero + ':second', damage, range: s.range, falloff: 1,
    knock: 150 * m.knock, ricochet: false, pierce: 0, kind: 'ki', gravity: 0, size,
    ignite: s.ignite, tier: 1, form: level,
    explosion: { radius: s.radius + level * s.radiusPerLevel, damage: damage * 0.45, knock: 180, breakRadius: 0, shake: 0.18, fire: s.fire + s.firePerLevel * level, ignite: s.ignite },
  });
  w.emit({ t: 'special', f: f.id, power: f.hero, x, y, scale: 0.8 + level * 0.2 });
}

/** Black flames spill from a victim onto the ground: wooden tiles beside them catch, and patches burn crates and whoever steps in. */
function scorchGround(w: World, o: Fighter, patches: number, owner: number): void {
  const tx = Math.floor(o.x / TILE), ty = Math.floor((o.y + 1) / TILE);
  for (let dx = -1; dx <= 1; dx++) igniteTile(w, tx + dx, ty, owner);
  for (let i = 0; i < patches; i++) spawnFire(w, o.x + w.rng.range(-5, 5), o.y - 2, w.rng.range(-40, 40), w.rng.range(-90, -30), owner, true);
}

/** The area blast of a bomb super at a form level: one hit per fighter, full damage in the core (SUPER_AREA). */
export function superBlast(f: Fighter, b: NonNullable<SuperAbility['bomb']>, level: number): ExplosionStats {
  const l = Math.max(1, level) - 1;
  return {
    radius: b.radius + b.radiusPerLevel * l,
    damage: (b.damage + b.damagePerLevel * l) * meleeMuls(f).dmg,
    knock: 420 + 40 * l,
    breakRadius: 12 + 4 * l,
    shake: 0.5 + 0.1 * l,
    core: SUPER_AREA.core,
    edge: SUPER_AREA.edge,
    blastOnly: true,
    spareOwner: true,
  };
}

/**
 * A super leaves from well ahead of the hero (the Susanoo bow, Kurama's mouth, the orb overhead). Whoever stands in
 * between (from the hero's body to that point, feet to launch height) or a wall there sets it off at once, so it
 * works at point-blank: returns the nearest such contact point, null when the way is clear.
 */
export function launchBlock(w: World, f: Fighter, sx: number, sy: number, size: number): { x: number; y: number } | null {
  const lo = Math.min(f.x, sx), hi = Math.max(f.x, sx);
  const top = Math.min(sy, f.y - f.h) - size;
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (const o of w.fighters) {
    if (!isEnemy(w, f, o) || o.invuln > 0) continue;
    if (o.x + o.w / 2 < lo || o.x - o.w / 2 > hi || o.y < top || o.y - o.h > f.y) continue;
    const d = Math.abs(o.x - f.x);
    if (d >= bestD) continue;
    bestD = d;
    best = { x: Math.max(lo, Math.min(hi, o.x - f.facing * (o.w / 2))), y: Math.max(top, o.y - o.h / 2) };
  }
  // a wall between the chest and the launch point
  const cy = f.y - SHOULDER_Y_STAND - 3;
  const wall = w.map.raycastSolid(f.x, cy, sx, sy);
  if (wall && wall.t > 0 && Math.abs(wall.x - f.x) < bestD) best = { x: wall.x - f.facing * 2, y: wall.y };
  return best;
}

export function fireBomb(w: World, f: Fighter, b: NonNullable<SuperAbility['bomb']>, level: number): void {
  const l = Math.max(1, level) - 1;
  const size = b.size + b.sizePerLevel * l;
  const spirit = b.kind === 'ki';
  const kurama = f.hero === 'naruto' && level === 4;
  const archer = f.hero === 'sasuke' && level >= 3;
  const bow = SUSANOO_LAUNCH[level >= 4 ? 4 : 3];
  const sx = f.x + f.facing * (kurama ? 53 : archer ? bow.ahead : spirit ? size + 12 : 8);
  const sy = f.y - (kurama ? 27 : archer ? bow.up : SHOULDER_Y_STAND + 2);
  const m = meleeMuls(f);
  const blast = superBlast(f, b, level);
  const weapon = f.hero + ':super';
  f.vx -= f.facing * 60;
  w.emit({ t: 'special', f: f.id, power: f.hero, x: sx, y: sy, scale: 1 + l * 0.5 });
  // enemies ganging up on the hero (inside the launch zone) take it at once
  const close = launchBlock(w, f, sx, sy, size);
  if (close) {
    explode(w, close.x, close.y, blast, f.id, weapon);
    return;
  }
  // aimed when the move started (manual with Up / Down, else locked onto the enemy being faced); the shot leaves the
  // bow / mouth / hand, so it re-aims from there at where the locked enemy is by now
  const target = f.lockOn >= 0 ? w.fighters[f.lockOn] : null;
  const angle = target && target.alive && !target.gone ? leadAngle(f, sx, sy, target, b.speed) : f.stretchAngle;
  w.spawnBullet({
    x: sx,
    y: sy,
    vx: f.facing * b.speed * Math.cos(angle),
    vy: Math.sin(angle) * b.speed,
    ox: sx,
    oy: sy,
    owner: f.id,
    weapon,
    // (only props feel the contact damage: on a fighter the blast is the whole hit)
    damage: blast.damage,
    range: b.range ?? 320,
    falloff: 1,
    knock: 300 * m.knock,
    ricochet: false,
    pierce: 0,
    kind: b.kind ?? 'chakra',
    gravity: 0,
    size,
    explosion: blast,
    tier: 2,
    form: level,
  });
}

// ------------------------------------------------------------------ instant transmission (Goku)

/**
 * Where an instant transmission toward (dx, dy) lands: appears behind the nearest enemy in that direction
 * when there is one within range + assist, otherwise as far along the line as there is room.
 * null = nowhere to go (a wall right in front).
 */
export function blinkDestination(w: World, f: Fighter, b: BlinkStats, dx: number, dy: number): { x: number; y: number; target: number } | null {
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const fits = (x: number, y: number) =>
    x - f.w / 2 > 2 && x + f.w / 2 < w.map.pxW - 2 && y - FIGHTER_H > 2 && y < w.map.pxH - 2 && !w.map.rectSolid(x - f.w / 2, y - FIGHTER_H, x + f.w / 2, y - 0.01);
  const cy = f.y - FIGHTER_H / 2;
  // lock-on
  let best: Fighter | null = null;
  let bestAlong = Infinity;
  for (const o of w.fighters) {
    if (o === f || !o.alive || o.gone || sameTeam(o, f)) continue;
    const ox = o.x - f.x;
    const oy = o.y - o.h / 2 - cy;
    const along = ox * ux + oy * uy;
    const across = Math.abs(ox * uy - oy * ux);
    if (along < 6 || along > b.range + b.assist || across > 16) continue;
    if (!w.map.clearShot(f.x, cy, o.x, o.y - o.h / 2)) continue;
    if (along < bestAlong) {
      bestAlong = along;
      best = o;
    }
  }
  if (best) {
    // appear on the far side of them, in the line of the jump
    for (const back of [14, 10, 18]) {
      const tx = best.x + ux * back;
      const ty = Math.abs(uy) > 0.5 ? best.y + uy * back : best.y;
      if (fits(tx, ty)) return { x: tx, y: ty, target: best.id };
    }
  }
  for (let d = b.range; d >= b.minRange; d -= 4) {
    const x = f.x + ux * d;
    const y = f.y + uy * d;
    if (fits(x, y) && w.map.clearShot(f.x, cy, x, y - FIGHTER_H / 2)) return { x, y, target: -1 };
  }
  return null;
}

/** The arrival strike: everyone within `radius` of the landing point is hit once. */
export function blinkStrike(w: World, f: Fighter, b: BlinkStats): void {
  const m = meleeMuls(f);
  for (const o of w.fighters) {
    if (o === f || o.gone || !o.alive) continue;
    if (Math.abs(o.x - f.x) > b.radius + o.w / 2 || o.y - o.h > f.y || o.y < f.y - FIGHTER_H) continue;
    const dir = o.x >= f.x ? 1 : -1;
    const connected = applyHit(w, o, {
      damage: b.damage * m.dmg,
      kbX: dir * b.knockX * m.knock,
      kbY: b.knockY * m.knock,
      attacker: f.id,
      weapon: 'blink',
      kind: 'melee',
      stun: b.stun,
      knockdown: true,
      x: o.x - dir * (o.w / 2),
      y: o.y - o.h / 2,
    });
    if (connected) w.emit({ t: 'heroFx', fx: 'ki', heavy: true, x: o.x - dir * (o.w / 2), y: o.y - o.h / 2 });
  }
}

// ------------------------------------------------------------------ grapple (Luffy's Gum-Gum Pistol)

/** What a stretching arm grabbed: a wall, the underside of a ceiling, a floor, a platform or a ladder. */
export type GripKind = 'wall' | 'ceiling' | 'floor' | 'platform' | 'ladder';

export interface Grip {
  kind: GripKind;
  /** arm length (px from the shoulder) at the contact */
  len: number;
  /** contact point */
  x: number;
  y: number;
  /** tile of the contact */
  tx: number;
  ty: number;
}

/**
 * Marches along the arm from the shoulder (up to `reach` px past the body edge) and reports the first
 * thing the fist can grab. Solid tiles are walls / ceilings (the arm came up under them) / floors,
 * one-way platforms only count when the arm points up or down, ladders always (except the one you are on).
 */
export function grabProbe(w: World, f: Fighter, angle: number, reach: number): Grip | null {
  const dx = Math.cos(angle) * f.facing;
  const dy = Math.sin(angle);
  const { x0, y0 } = stretchFist(f, angle, 0);
  const total = f.w / 2 + reach;
  const startTx = Math.floor(x0 / TILE);
  const startTy = Math.floor(y0 / TILE);
  let ptx = startTx;
  let pty = startTy;
  const steep = Math.abs(dy) > 0.3;
  for (let d = 2; d <= total; d += 2) {
    const px = x0 + dx * d;
    const py = y0 + dy * d;
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    const def = w.map.def(tx, ty);
    if (def.solid) {
      const enteredVert = ty !== pty && tx === ptx;
      const enteredHorz = tx !== ptx && ty === pty;
      const vertical = enteredVert || (!enteredHorz && Math.abs(dy) > Math.abs(dx));
      const kind: GripKind = vertical ? (dy < 0 ? 'ceiling' : 'floor') : 'wall';
      return { kind, len: d, x: px, y: py, tx, ty };
    }
    if (def.ladder && !(tx === startTx && ty === startTy)) return { kind: 'ladder', len: d, x: px, y: py, tx, ty };
    if (def.oneWay && steep && !(tx === startTx && ty === startTy)) return { kind: 'platform', len: d, x: px, y: py, tx, ty };
    ptx = tx;
    pty = ty;
  }
  return null;
}

/** Where the body is pulled to for a grip (shoulder-height target): beside a wall, on top of a platform, on a ladder. */
export function gripTarget(g: Grip): { x: number; y: number } {
  const cx = g.tx * TILE + TILE / 2;
  // (a few px above the platform top: he gets there, stops, and drops onto it)
  if (g.kind === 'platform') return { x: cx, y: g.ty * TILE - SHOULDER_Y_STAND + 1 - 10 };
  if (g.kind === 'ladder') return { x: cx, y: g.y };
  return { x: g.x, y: g.y };
}

// ------------------------------------------------------------------ shadow clones (Naruto, ability 2)

/** Living clones of a fighter. */
export function clonesOf(w: World, f: Fighter): Fighter[] {
  return w.fighters.filter((c) => c.master === f.id && c.alive);
}

/** A clone vanishes in a puff of smoke (killed, recalled, or its master fell). */
export function dismissClone(w: World, c: Fighter): void {
  if (c.master < 0 || (!c.alive && c.gone)) return;
  w.releaseGrab(c);
  w.emit({ t: 'cloneGone', x: c.x, y: c.y });
  c.alive = false;
  c.gone = true;
  c.hp = 0;
  c.state = 'dead';
  c.flying = false;
  c.specialKind = '';
  c.stretchLen = 0;
}

/**
 * Naruto summons his clones: `cloneSpec` many (base 2, +1 per form up to the form before the last; the
 * final form makes 2 exact copies of his CURRENT health). They are real fighters from the clone slots
 * reserved in the world; they only know the Rasengan. Returns how many appeared.
 */
export function summonClones(w: World, f: Fighter): number {
  const spec = cloneSpec(f.hero, f.power === 'hero' ? f.powerLevel : 0);
  if (!spec) return 0;
  const slots = w.fighters.filter((c) => c.master === f.id && !c.alive);
  let made = 0;
  for (let i = 0; i < spec.count && made < slots.length; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const x = f.x + f.facing * side * (11 + Math.floor(i / 2) * 9);
    if (w.map.rectSolid(x - f.w / 2, f.y - FIGHTER_H, x + f.w / 2, f.y - 1)) continue;
    const frac = heroDef(f.hero)?.second.clones?.hpFrac ?? 0.2;
    const maxHp = spec.full ? f.maxHp : Math.max(1, Math.round(f.maxHp * frac));
    // a hurt Naruto makes equally hurt clones: the same fraction of their (smaller) health
    const hp = Math.max(1, spec.full ? f.hp : Math.round(maxHp * Math.min(1, Math.max(0, f.hp / f.maxHp))));
    w.spawnClone(slots[made], f, x, f.y, hp, maxHp, side === 1 ? f.facing : (-f.facing as 1 | -1));
    made++;
  }
  return made;
}

/** Called back with the ability button: every clone of `f` vanishes. Returns how many. */
export function recallClones(w: World, f: Fighter): number {
  const out = clonesOf(w, f);
  for (const c of out) dismissClone(w, c);
  return out.length;
}
