// Heroes (M9, reworked M11): power-orb transformations with form levels, abilities 1 / 2, supers and
// shadow-clone effect entities. Data in data/heroes.ts. The state machine lives in sim/fighter.ts.

import { applyHit } from './combat';
import { DT, SHOULDER_Y_STAND, TILE } from './constants';
import {
  CLONE,
  FORM_BYPASS,
  FORM_HP,
  GENERIC_BOOST,
  GENERIC_DURATION,
  heroDef,
  maxLevel,
  type AbilityDefinition,
  type BaseAbility,
  type BeamStats,
  type SecondAbility,
  type StretchStats,
} from './data/heroes';
import { weaponDef, type MeleeHit } from './data/weapons';
import type { Fighter } from './fighter';
import { segmentAabb } from './physics';
import { damageProp, pushProp } from './prop';
import type { World } from './world';

/** Shadow clone: a short-lived effect that strikes and vanishes. Never a fighter, never thinks. */
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
  /** rushing clones (Naruto's ability 2) run forward and hit everyone they touch once */
  vx: number;
  life: number;
  damage: number;
  knockX: number;
  knockY: number;
}

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
  if (f.secondCd > 0) f.secondCd -= dt;
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

/** Can this fighter fly by holding Up (final forms of Naruto and Luffy)? */
export function holdFlies(f: Fighter): boolean {
  return f.power === 'hero' && !!heroDef(f.hero)?.forms[f.powerLevel - 1]?.flies;
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

// ------------------------------------------------------------------ rasengan (Naruto, ability 1)

/** Where the Rasengan orb sits (in front of the palm). */
export function rasenganPoint(f: Fighter): { x: number; y: number } {
  return { x: f.x + f.facing * (f.w / 2 + 4), y: f.y - SHOULDER_Y_STAND + 1 };
}

/** Rasengan contact: the first fighter the orb touches is blasted away. Props get shoved. True on a hit. */
export function rasenganHit(w: World, f: Fighter, d: NonNullable<BaseAbility['dash']>): boolean {
  const { x: hx, y: hy } = rasenganPoint(f);
  const r = d.radius + (f.power === 'hero' ? f.powerLevel : 0);
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

// ------------------------------------------------------------------ chakra bomb (Naruto super)

export function fireBomb(w: World, f: Fighter, b: NonNullable<import('./data/heroes').SuperAbility['bomb']>, level: number): void {
  const l = Math.max(1, level) - 1;
  const sx = f.x + f.facing * 8;
  const sy = f.y - SHOULDER_Y_STAND - 2;
  const m = meleeMuls(f);
  w.spawnBullet({
    x: sx,
    y: sy,
    vx: f.facing * b.speed,
    vy: 0,
    ox: sx,
    oy: sy,
    owner: f.id,
    weapon: f.hero + ':super',
    damage: (b.damage + b.damagePerLevel * l) * m.dmg,
    range: 320,
    falloff: 1,
    knock: 300 * m.knock,
    ricochet: false,
    pierce: 0,
    kind: 'chakra',
    gravity: 0,
    size: b.size + b.sizePerLevel * l,
    explosion: { radius: b.radius + b.radiusPerLevel * l, damage: (b.damage * 0.8 + b.damagePerLevel * l) * m.dmg, knock: 420 + 40 * l, breakRadius: 12 + 4 * l, shake: 0.5 + 0.1 * l },
  });
  f.vx -= f.facing * 60;
  w.emit({ t: 'special', f: f.id, power: f.hero, x: sx, y: sy, scale: 1 + l * 0.5 });
}

// ------------------------------------------------------------------ shadow clones

function newClone(f: Fighter, x: number, facing: 1 | -1, extra: Partial<Clone>): Clone {
  const ab = ability(f);
  return {
    owner: f.id,
    x,
    y: f.y,
    facing,
    t: 0,
    struck: [],
    active: true,
    damageMul: ab?.damageMul ?? 1,
    knockMul: ab?.knockMul ?? 1,
    vx: 0,
    life: CLONE.life,
    damage: CLONE.damage,
    knockX: CLONE.knockX,
    knockY: CLONE.knockY,
    ...extra,
  };
}

/** Combo clones (a combo hit with `clones`): flash in beside the owner, strike once. */
export function spawnClones(w: World, f: Fighter, hit: MeleeHit): void {
  const n = hit.clones ?? 0;
  for (let i = 0; i < n; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const facing = (side === 1 ? f.facing : -f.facing) as 1 | -1;
    const x = f.x + f.facing * side * CLONE.offset * (1 + Math.floor(i / 2));
    if (w.map.rectSolid(x - f.w / 2, f.y - f.h, x + f.w / 2, f.y - 1)) continue;
    w.clones.push(newClone(f, x, facing, {}));
    w.emit({ t: 'clone', f: f.id, x, y: f.y, facing });
  }
}

/** Naruto's ability 2: clones pop out beside him and rush ahead, hitting everyone they touch. */
export function spawnRushClones(w: World, f: Fighter, c: NonNullable<SecondAbility['clones']>): number {
  const n = Math.min(c.max, c.count + (f.power === 'hero' ? f.powerLevel : 0));
  let made = 0;
  for (let i = 0; i < n; i++) {
    const x = f.x + f.facing * (6 + (i % 3) * 5) - f.facing * Math.floor(i / 3) * 8;
    if (w.map.rectSolid(x - f.w / 2, f.y - f.h, x + f.w / 2, f.y - 1)) continue;
    w.clones.push(newClone(f, x, f.facing, { vx: f.facing * c.speed * (1 - i * 0.07), life: c.life + i * 0.04, damage: c.damage, knockX: c.knockX, knockY: c.knockY, t: -i * 0.04 }));
    w.emit({ t: 'clone', f: f.id, x, y: f.y, facing: f.facing });
    made++;
  }
  return made;
}

export function updateClones(w: World): void {
  if (w.clones.length === 0) return;
  for (const c of w.clones) {
    if (!c.active) continue;
    c.t += DT;
    const owner = w.fighters[c.owner];
    if (c.t >= c.life || !owner || !owner.alive) {
      c.active = false;
      w.emit({ t: 'cloneGone', x: c.x, y: c.y });
      continue;
    }
    if (c.t < 0) continue;
    const rush = c.vx !== 0;
    if (rush) {
      const nx = c.x + c.vx * DT;
      // a rushing clone poofs when it runs into a wall
      if (w.map.rectSolid(nx - 5, c.y - 20, nx + 5, c.y - 2)) {
        c.active = false;
        w.emit({ t: 'cloneGone', x: c.x, y: c.y });
        continue;
      }
      c.x = nx;
    } else if (c.t < CLONE.delay || c.t > CLONE.delay + CLONE.active) continue;
    const near = c.x + c.facing * (rush ? -2 : 4);
    const far = c.x + c.facing * (rush ? 9 : 6 + CLONE.range);
    const l = Math.min(near, far);
    const r = Math.max(near, far);
    const t = c.y - 20;
    const b = c.y - 3;
    for (const o of w.fighters) {
      if (o.id === c.owner || o.gone || !o.alive || c.struck.includes(o.id)) continue;
      if (o.x + o.w / 2 < l || o.x - o.w / 2 > r || o.y - o.h > b || o.y < t) continue;
      c.struck.push(o.id);
      const connected = applyHit(w, o, {
        damage: c.damage * c.damageMul,
        kbX: c.facing * c.knockX * c.knockMul,
        kbY: c.knockY * c.knockMul,
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
