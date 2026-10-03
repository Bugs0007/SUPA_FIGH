// Hero power-ups (M9): transformation state, specials and shadow-clone effect entities.
// Data in data/heroes.ts. The fighter state machine calls into this module (sim/fighter.ts 'special').

import { applyHit } from './combat';
import { DT, SHOULDER_Y_STAND } from './constants';
import { CLONE, GENERIC_BOOST, GENERIC_DURATION, heroDef, POWERS, powerDef, type AbilityDefinition, type AbilitySpecial, type BaseAbility } from './data/heroes';
import { weaponDef, type MeleeHit } from './data/weapons';
import { segmentAabb } from './physics';
import type { Fighter } from './fighter';
import { damageProp, pushProp } from './prop';
import type { World } from './world';

/** Shadow clone: a short-lived effect that strikes once and vanishes. Never a fighter, never thinks. */
export interface Clone {
  owner: number;
  x: number;
  y: number;
  facing: 1 | -1;
  t: number;
  struck: number[];
  active: boolean;
  damageMul: number;
  knockMul: number;
}

/** The ability currently shaping this fighter (full transformation or the generic boost). */
export function ability(f: Fighter): AbilityDefinition | null {
  if (!f.power) return null;
  const p = POWERS[f.power];
  if (!p) return null;
  return f.powerFull ? p.ability : GENERIC_BOOST;
}

export function special(f: Fighter): AbilitySpecial | null {
  return ability(f)?.special ?? null;
}

/** Grab a hero power-up. Re-grabbing refreshes the timer. */
export function transform(w: World, f: Fighter, powerId: string): void {
  const p = powerDef(powerId);
  if (!p) return;
  const full = f.hero === p.hero;
  f.power = p.id;
  f.powerFull = full;
  f.powerMax = full ? p.duration : GENERIC_DURATION;
  f.powerTime = f.powerMax;
  f.specialCd = 0;
  f.charge = -1;
  w.emit({ t: 'transform', f: f.id, power: p.id, full, x: f.x, y: f.y });
}

/** Power runs out (or the fighter dies): back to normal attacks, no modifiers, no aura. */
export function endPower(w: World, f: Fighter): void {
  if (!f.power) return;
  const id = f.power;
  f.power = '';
  f.powerFull = false;
  f.powerTime = 0;
  f.powerMax = 0;
  f.specialCd = 0;
  f.charge = -1;
  f.stretchLen = 0;
  w.emit({ t: 'powerEnd', f: f.id, power: id });
}

export function updatePower(w: World, f: Fighter, dt: number): void {
  if (!f.power) return;
  if (f.specialCd > 0) f.specialCd -= dt;
  f.powerTime -= dt;
  if (f.powerTime <= 0) endPower(w, f);
}

/** Fire a projectile special. scale = ki charge multiplier (1 = tap). Returns the cooldown to apply. */
export function fireSpecial(w: World, f: Fighter, sp: AbilitySpecial, scale: number, aimUp: boolean): void {
  const pr = sp.projectile;
  if (!pr) return;
  const angle = aimUp ? -0.5 : 0;
  const dx = Math.cos(angle) * f.facing;
  const dy = Math.sin(angle);
  const sx = f.x + f.facing * 4;
  const sy = f.y - SHOULDER_Y_STAND;
  const ex = pr.explosion;
  const big = scale > 1.5;
  w.spawnBullet({
    x: sx,
    y: sy,
    vx: dx * pr.speed,
    vy: dy * pr.speed,
    ox: sx,
    oy: sy,
    owner: f.id,
    weapon: f.power + ':special',
    damage: pr.damage * scale,
    range: pr.range,
    falloff: 1,
    knock: pr.knock * (1 + (scale - 1) * 0.6),
    ricochet: false,
    pierce: 0,
    kind: pr.kind,
    gravity: pr.gravity ?? 0,
    size: pr.size * (1 + (scale - 1) * 0.7),
    explosion: ex
      ? ex
      : big
        ? { radius: 14 + 8 * scale, damage: 4 * scale, knock: 120 * scale, breakRadius: scale > 2.5 ? 10 : 0, shake: 0.15 * scale }
        : null,
  });
  // a little kickback sells the weight
  f.vx -= dx * 40 * scale;
  if (sp.charge) {
    const c = sp.charge;
    const k = (scale - 1) / (c.maxScale - 1);
    f.specialCd = c.minCooldown + (sp.cooldown - c.minCooldown) * k;
  } else f.specialCd = sp.cooldown;
  w.emit({ t: 'special', f: f.id, power: f.power, x: sx + dx * 6, y: sy, scale });
}

/** Ki charge (0..1) → stat multiplier. */
export function chargeScale(sp: AbilitySpecial, held: number): number {
  const c = sp.charge;
  if (!c) return 1;
  return 1 + (c.maxScale - 1) * Math.min(1, Math.max(0, held) / c.time);
}

/** Current reach of a stretch special at time t (px past the body edge, 0 when done). */
export function stretchReach(sp: AbilitySpecial, t: number): number {
  const s = sp.stretch;
  if (!s) return 0;
  if (t < s.out) return s.range * (t / s.out);
  if (t < s.out + s.hold) return s.range;
  const b = t - s.out - s.hold;
  return b < s.back ? s.range * (1 - b / s.back) : 0;
}

export function stretchDuration(sp: AbilitySpecial): number {
  const s = sp.stretch!;
  return s.out + s.hold + s.back;
}

/** Hitbox along a stretched arm: from the body edge to the fist, at shoulder height. Stops at walls. */
export function stretchHitbox(w: World, f: Fighter, sp: AbilitySpecial, reach: number): number {
  const s = sp.stretch!;
  const y = f.y - SHOULDER_Y_STAND;
  // the fist stops at the first solid tile
  const x0 = f.x + f.facing * (f.w / 2);
  let len = reach;
  for (let d = 0; d <= reach; d += 4) {
    if (w.map.solidAtPx(x0 + f.facing * d, y)) {
      len = Math.max(0, d - 2);
      break;
    }
  }
  const x1 = x0 + f.facing * len;
  const l = Math.min(x0, x1) - 2;
  const r = Math.max(x0, x1) + 3;
  const t = y - 4;
  const b = y + 4;
  const ab = ability(f);
  const knockMul = ab?.knockMul ?? 1;
  for (const p of w.props) {
    if (!p.active || f.swingProps.includes(p.id)) continue;
    if (p.x + p.w / 2 < l || p.x - p.w / 2 > r || p.y - p.h > b || p.y < t) continue;
    f.swingProps.push(p.id);
    pushProp(p, f.facing * s.knockX * 0.8, -80);
    damageProp(w, p, s.damage, f.id);
  }
  for (const o of w.fighters) {
    if (o === f || o.gone || f.swingHit.includes(o.id)) continue;
    if (o.x + o.w / 2 < l || o.x - o.w / 2 > r || o.y - o.h > b || o.y < t) continue;
    f.swingHit.push(o.id);
    const connected = applyHit(w, o, {
      damage: s.damage,
      kbX: f.facing * s.knockX * knockMul,
      kbY: s.knockY * knockMul,
      attacker: f.id,
      weapon: f.power + ':special',
      kind: 'melee',
      stun: 0.3,
      knockdown: true,
      x: o.x - f.facing * (o.w / 2),
      y,
    });
    if (connected) w.emit({ t: 'heroFx', fx: 'steam', heavy: true, x: o.x - f.facing * (o.w / 2), y });
  }
  return len;
}

// ------------------------------------------------------------------ base abilities (D51)

/** The hero's always-available signature move (null for scrapyard fighters). */
export function baseAbility(f: Fighter): BaseAbility | null {
  return heroDef(f.hero)?.base ?? null;
}

/** Melee-style damage/knockback multipliers (strength pickup, generic hero boost). */
function meleeMuls(f: Fighter): { dmg: number; knock: number } {
  const strength = f.strengthBoost > 0 ? (weaponDef('strength').powerup?.mult ?? 1) : 1;
  const ab = ability(f);
  return { dmg: strength * (ab?.damageMul ?? 1), knock: (1 + (strength - 1) * 0.5) * (ab?.knockMul ?? 1) };
}

/** Where the Rasengan orb sits (in front of the palm). */
export function rasenganPoint(f: Fighter): { x: number; y: number } {
  return { x: f.x + f.facing * (f.w / 2 + 4), y: f.y - SHOULDER_Y_STAND + 1 };
}

/** Rasengan contact: the first fighter the orb touches is blasted away. Props get shoved. True on a hit. */
export function rasenganHit(w: World, f: Fighter, d: NonNullable<BaseAbility['dash']>): boolean {
  const { x: hx, y: hy } = rasenganPoint(f);
  const r = d.radius;
  const m = meleeMuls(f);
  const touches = (l: number, t: number, rr: number, b: number) => {
    const nx = Math.max(l, Math.min(hx, rr));
    const ny = Math.max(t, Math.min(hy, b));
    return (nx - hx) ** 2 + (ny - hy) ** 2 <= r * r;
  };
  for (const p of w.props) {
    if (!p.active || f.swingProps.includes(p.id)) continue;
    if (!touches(p.x - p.w / 2, p.y - p.h, p.x + p.w / 2, p.y)) continue;
    f.swingProps.push(p.id);
    pushProp(p, f.facing * d.knockX * m.knock, d.knockY * 0.6);
    damageProp(w, p, d.damage * m.dmg, f.id);
  }
  for (const o of w.fighters) {
    if (o === f || o.gone || !o.alive || f.swingHit.includes(o.id)) continue;
    if (!touches(o.x - o.w / 2, o.y - o.h, o.x + o.w / 2, o.y)) continue;
    f.swingHit.push(o.id);
    const connected = applyHit(w, o, {
      damage: d.damage * m.dmg,
      kbX: f.facing * d.knockX * m.knock,
      kbY: d.knockY * m.knock,
      attacker: f.id,
      weapon: 'rasengan',
      kind: 'melee',
      stun: d.stun,
      knockdown: true,
      x: hx,
      y: hy,
    });
    if (connected) {
      w.emit({ t: 'heroFx', fx: 'rasengan', heavy: true, x: hx, y: hy });
      return true;
    }
  }
  return false;
}

/** Fist position of an angled stretch punch at a given reach (from the shoulder). */
export function stretchFist(f: Fighter, angle: number, reach: number): { x0: number; y0: number; x1: number; y1: number } {
  const x0 = f.x + f.facing * 2;
  const y0 = f.y - SHOULDER_Y_STAND + 1;
  return { x0, y0, x1: x0 + Math.cos(angle) * f.facing * (f.w / 2 + reach), y1: y0 + Math.sin(angle) * (f.w / 2 + reach) };
}

/**
 * Gum-Gum Pistol: the arm reaches `reach` px along `angle`. Hits every fighter/prop on the segment once.
 * Returns the actual arm length (stops at the first solid tile) and whether the fist touched a wall.
 */
export function pistolHits(w: World, f: Fighter, s: NonNullable<BaseAbility['stretch']>, angle: number, reach: number): { len: number; wall: boolean } {
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
  for (const p of w.props) {
    if (!p.active || f.swingProps.includes(p.id)) continue;
    if (segmentAabb(x0, y0, x1, y1, p.x - p.w / 2 - 2, p.y - p.h - 2, p.x + p.w / 2 + 2, p.y + 2) < 0) continue;
    f.swingProps.push(p.id);
    pushProp(p, dx * s.knockX * 0.8 * m.knock, -80);
    damageProp(w, p, s.damage * m.dmg, f.id);
  }
  for (const o of w.fighters) {
    if (o === f || o.gone || f.swingHit.includes(o.id)) continue;
    // a little fist radius so grazing hits count
    if (segmentAabb(x0, y0, x1, y1, o.x - o.w / 2 - 2, o.y - o.h - 2, o.x + o.w / 2 + 2, o.y + 2) < 0) continue;
    f.swingHit.push(o.id);
    const hx = Math.max(o.x - o.w / 2, Math.min(x1, o.x + o.w / 2));
    const connected = applyHit(w, o, {
      damage: s.damage * m.dmg,
      kbX: f.facing * s.knockX * m.knock,
      kbY: s.knockY * m.knock + dy * 120,
      attacker: f.id,
      weapon: 'gumgum',
      kind: 'melee',
      stun: 0.3,
      knockdown: true,
      x: hx,
      y: o.y - o.h / 2,
    });
    if (connected) w.emit({ t: 'heroFx', fx: 'steam', heavy: false, x: hx, y: o.y - o.h / 2 });
  }
  return { len, wall };
}

// ------------------------------------------------------------------ shadow clones

/** Clones flash in beside the owner: one ahead, one behind facing the other way. */
export function spawnClones(w: World, f: Fighter, hit: MeleeHit): void {
  const n = hit.clones ?? 0;
  const ab = ability(f);
  for (let i = 0; i < n; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const facing = (side === 1 ? f.facing : -f.facing) as 1 | -1;
    const x = f.x + f.facing * side * CLONE.offset * (1 + Math.floor(i / 2));
    // never inside a wall
    if (w.map.rectSolid(x - f.w / 2, f.y - f.h, x + f.w / 2, f.y - 1)) continue;
    const c: Clone = { owner: f.id, x, y: f.y, facing, t: 0, struck: [], active: true, damageMul: ab?.damageMul ?? 1, knockMul: ab?.knockMul ?? 1 };
    w.clones.push(c);
    w.emit({ t: 'clone', f: f.id, x, y: f.y, facing });
  }
}

export function updateClones(w: World): void {
  if (w.clones.length === 0) return;
  for (const c of w.clones) {
    if (!c.active) continue;
    c.t += DT;
    const owner = w.fighters[c.owner];
    if (c.t >= CLONE.life || !owner || !owner.alive) {
      c.active = false;
      w.emit({ t: 'cloneGone', x: c.x, y: c.y });
      continue;
    }
    if (c.t < CLONE.delay || c.t > CLONE.delay + CLONE.active) continue;
    const near = c.x + c.facing * 4;
    const far = c.x + c.facing * (6 + CLONE.range);
    const l = Math.min(near, far);
    const r = Math.max(near, far);
    const t = c.y - 18;
    const b = c.y - 4;
    for (const o of w.fighters) {
      if (o.id === c.owner || o.gone || !o.alive || c.struck.includes(o.id)) continue;
      if (o.x + o.w / 2 < l || o.x - o.w / 2 > r || o.y - o.h > b || o.y < t) continue;
      c.struck.push(o.id);
      const connected = applyHit(w, o, {
        damage: CLONE.damage * c.damageMul,
        kbX: c.facing * CLONE.knockX * c.knockMul,
        kbY: CLONE.knockY * c.knockMul,
        attacker: c.owner,
        weapon: 'clone',
        kind: 'melee',
        stun: 0.25,
        x: c.x + c.facing * 8,
        y: (t + b) / 2,
      });
      if (connected) w.emit({ t: 'heroFx', fx: 'chakra', heavy: false, x: c.x + c.facing * 8, y: (t + b) / 2 });
    }
  }
  if (w.tick % 60 === 0) w.clones = w.clones.filter((c) => c.active);
}
