import { applyHit, hitWasBlocked, sameTeam } from './combat';
import { TILE } from './constants';
import { POKEMON_DAMAGE, pokemonStage, type PokemonSpecies, type PokemonState } from './data/pokemon';
import { pokemonAttack, pokemonEmission, type PokemonAttackProfile } from './data/pokemonAttacks';
import type { Fighter } from './fighter';
import { ignite } from './fire';
import { segmentAabb } from './physics';
import type { World } from './world';

type Point = { x: number; y: number };
const center = (f: Fighter): Point => ({ x: f.x, y: f.y - f.h * 0.5 });
const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/** Allocate tenths of HP, including the remainder, so a volley never multiplies its budget. */
function portion(total: number, index: number, count: number): number {
  const units = Math.round(total * 10);
  return (Math.floor(units * (index + 1) / count) - Math.floor(units * index / count)) / 10;
}

function weapon(species: PokemonSpecies, stage: number, ultimate: boolean): string {
  if (species === 'charmander') return stage >= 3 ? 'ash:blueFire' : 'ash:fireball';
  if (species === 'squirtle' || species === 'froakie') return ultimate && species === 'squirtle' && stage >= 2 ? 'ash:hydroCannon' : 'ash:waterGun';
  if (species === 'treecko' && stage >= 3 && !ultimate) return 'ash:dragon';
  return `ash:${pokemonStage(species, stage).element}`;
}

/** Same terrain policy as ordinary energy projectiles, including bullet-passable platforms. */
function clipped(w: World, from: Point, to: Point): Point {
  let fraction = 1;
  w.map.traverse(from.x, from.y, to.x, to.y, (tx, ty, t) => {
    const tile = w.map.def(tx, ty);
    if (!tile.solid || tile.bulletPass) return false;
    fraction = Math.max(0, t - 0.001);
    return true;
  });
  return { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction };
}

function muzzle(w: World, f: Fighter, p: PokemonState): Point {
  const [x, y] = pokemonEmission(p.species, p.stage);
  return clipped(w, center(f), { x: f.x + x * f.facing, y: f.y + y });
}

function eligible(w: World, v: Fighter, f: Fighter, owner: Fighter): boolean {
  if (!v.alive || v.gone || v.id === f.id || v.id === owner.id || v.master === owner.id) return false;
  if (!w.settings.friendlyFire && sameTeam(owner, v)) return false;
  if (v.pokemon && (v.pokemon.move === 'recall' || v.pokemon.move === 'ko' || v.pokemon.perched)) return false;
  // A deployed partner owns the opponent's hurtbox. Do not waste a chain jump on its protected trainer.
  const active = v.trainer && w.fighters[v.trainer.active];
  return !(active?.alive && active.pokemon && active.pokemon.move !== 'recall' && active.pokemon.move !== 'ko');
}

function hit(w: World, f: Fighter, owner: Fighter, v: Fighter, p: PokemonState,
  profile: PokemonAttackProfile, damage: number, at: Point, ultimate: boolean, scale = 1): void {
  const before = v.hp + (v.formHp ?? 0);
  const dx = v.x - f.x;
  const connected = applyHit(w, v, {
    damage, attacker: f.id, weapon: weapon(p.species, p.stage, ultimate), kind: 'bullet',
    kbX: Math.sign(dx || f.facing) * (ultimate ? 135 : 58) * scale,
    kbY: (ultimate ? -60 : -16) * scale,
    stun: profile.kind === 'chain' ? 0.14 : Math.min(0.13, profile.interval || 0.10),
    knockdown: ultimate && scale >= 0.9 && profile.pulses === 1,
    x: at.x, y: at.y,
  });
  if (!connected || hitWasBlocked()) return;
  if (profile.ignite) ignite(w, v, profile.ignite, owner.id);
  if (profile.drain) {
    const gained = Math.min(f.maxHp - f.hp, Math.max(0, before - v.hp - (v.formHp ?? 0)) * profile.drain);
    if (gained > 0) {
      f.hp += gained;
      w.emit({ t: 'heal', f: f.id, amount: gained });
    }
  }
}

function rayPulse(w: World, f: Fighter, owner: Fighter, p: PokemonState, profile: PokemonAttackProfile,
  origin: Point, damage: number, ultimate: boolean): void {
  const to = clipped(w, origin, {
    x: origin.x + Math.cos(f.aimAngle) * profile.range,
    y: origin.y + Math.sin(f.aimAngle) * profile.range,
  });
  p.goalX = to.x;
  p.goalY = to.y;
  const radius = (profile.width ?? profile.size) * 0.5;
  for (const v of w.fighters) {
    if (!eligible(w, v, f, owner)) continue;
    const t = segmentAabb(origin.x, origin.y, to.x, to.y,
      v.x - v.w * 0.5 - radius, v.y - v.h - radius, v.x + v.w * 0.5 + radius, v.y + radius);
    if (t < 0) continue;
    const point = { x: origin.x + (to.x - origin.x) * t, y: origin.y + (to.y - origin.y) * t };
    if (!w.map.clearShot(origin.x, origin.y, point.x, point.y)) continue;
    hit(w, f, owner, v, p, profile, damage, point, ultimate, 1 / Math.sqrt(profile.pulses));
  }
}

function chainPulse(w: World, f: Fighter, owner: Fighter, p: PokemonState, profile: PokemonAttackProfile,
  origin: Point, damage: number): void {
  let from = origin;
  const used = new Set<number>();
  for (let jump = 0; jump <= (profile.chain ?? 0); jump++) {
    const reach = jump ? profile.chainRange ?? 100 : profile.range;
    let best: Fighter | undefined;
    let bestDist = Infinity;
    for (const v of w.fighters) {
      if (used.has(v.id) || !eligible(w, v, f, owner)) continue;
      const point = center(v);
      const d = distance(from, point);
      if (d > reach || !w.map.clearShot(from.x, from.y, point.x, point.y)) continue;
      if (!jump && (point.x - f.x) * f.facing < -v.w * 0.5) continue;
      // Prefer the locked opponent for the first arc; subsequent arcs choose the closest visible enemy.
      const priority = d - (!jump && v.id === p.target ? reach : 0);
      if (priority < bestDist) { best = v; bestDist = priority; }
    }
    if (!best) break;
    const point = center(best);
    used.add(best.id);
    w.emit({ t: 'arc', f: f.id, x0: from.x, y0: from.y, x1: point.x, y1: point.y });
    hit(w, f, owner, best, p, profile, Math.round(damage * Math.pow(0.55, jump) * 10) / 10, from, false, jump ? 0.5 : 1);
    from = point;
  }
}

/** Find a genuine nearby floor; plants and the surf front cannot erupt in empty air. */
function groundAt(w: World, x: number, y: number): Point | undefined {
  const tx = Math.floor(x / TILE);
  const start = Math.max(0, Math.floor((y - TILE * 2) / TILE));
  const end = Math.min(w.map.h - 1, Math.floor((y + TILE * 3) / TILE));
  let nearest: Point | undefined;
  for (let ty = start; ty <= end; ty++) {
    if (!w.map.def(tx, ty).solid || w.map.def(tx, ty - 1).solid) continue;
    const point = { x, y: ty * TILE };
    if (!nearest || Math.abs(point.y - y) < Math.abs(nearest.y - y)) nearest = point;
  }
  return nearest;
}

function markedPulse(w: World, f: Fighter, owner: Fighter, p: PokemonState, profile: PokemonAttackProfile,
  origin: Point, budget: number, pulse: number): void {
  const ground = profile.kind === 'ground';
  const t = (pulse + 1) / profile.pulses;
  let at: Point = { x: p.goalX, y: p.goalY };
  if (ground) {
    const dx = clamp(p.goalX - f.x, -profile.range, profile.range);
    const floor = groundAt(w, f.x + dx * t, f.y + (p.goalY - f.y) * t);
    if (!floor) return;
    at = floor;
    if (!w.map.clearShot(f.x, f.y - 5, at.x, at.y - 5)) return;
  } else {
    // Thunder is cast at a visible marker. A roof can shelter a fighter beneath it.
    if (!w.map.clearShot(origin.x, origin.y, at.x, at.y)) return;
    const sky = { x: at.x, y: Math.max(1, at.y - 120) };
    const end = clipped(w, sky, at);
    if (distance(end, at) > 1) return;
    w.emit({ t: 'arc', f: f.id, x0: sky.x, y0: sky.y, x1: at.x, y1: at.y });
  }
  const radius = profile.radius ?? 24;
  w.emit({ t: 'explosion', x: at.x, y: at.y, radius,
    weapon: weapon(p.species, p.stage, true), form: p.stage, shake: 0.08 });
  for (const v of w.fighters) {
    if (!eligible(w, v, f, owner) || f.swingHit.includes(v.id)) continue;
    // Clamp to the actual body instead of its center, so grounded giant Pokémon remain hittable.
    const near = { x: clamp(at.x, v.x - v.w * 0.5, v.x + v.w * 0.5), y: clamp(at.y, v.y - v.h, v.y) };
    if (distance(at, near) > radius || (ground && v.y < at.y - (profile.width ?? 20))) continue;
    const source = { x: at.x, y: at.y - (ground ? 5 : 0) };
    if (!w.map.clearShot(source.x, source.y, near.x, Math.min(near.y, at.y - 1))) continue;
    f.swingHit.push(v.id);
    // Stations are successive opportunities to catch an enemy, never repeated full-damage hits.
    hit(w, f, owner, v, p, profile, budget, source, true);
  }
}

function projectilePulse(w: World, f: Fighter, owner: Fighter, p: PokemonState, profile: PokemonAttackProfile,
  origin: Point, budget: number, pulse: number, ultimate: boolean): void {
  const count = profile.count ?? 1;
  for (let n = 0; n < count; n++) {
    const index = pulse * count + n;
    const damage = portion(budget, index, profile.pulses * count);
    let angle = f.aimAngle;
    let start = origin;
    if (profile.kind === 'fan') {
      angle += (n / Math.max(1, count - 1) - 0.5) * (profile.spread ?? 0.4);
    } else if (profile.kind === 'shuriken' && !ultimate) {
      angle += ((pulse % 3) - 1) * 0.045;
    } else if (profile.kind === 'burst' && p.species === 'froakie') {
      angle += ((pulse % 3) - 1) * 0.08;
    } else if (profile.kind === 'meteor') {
      // Every meteor travels to the marker. Damage happens on impact, not when the sky flashes.
      const lateral = (pulse / Math.max(1, profile.pulses - 1) - 0.5) * (profile.spread ?? 100);
      start = { x: p.goalX + lateral, y: Math.max(2, p.goalY - 110 - (pulse % 2) * 16) };
      angle = Math.atan2(p.goalY - start.y, p.goalX - start.x);
    }
    const gravity = profile.gravity ?? 0;
    // Seed Bomb compensates its launch arc, retaining actual gravity and wall collision in flight.
    const flight = Math.min(profile.range, Math.hypot(p.goalX - origin.x, p.goalY - origin.y)) / profile.speed;
    const vx = Math.cos(angle) * profile.speed;
    const vy = Math.sin(angle) * profile.speed - (gravity > 0 ? gravity * flight * 0.5 : 0);
    const radius = profile.radius ?? 0;
    const bullet = w.spawnBullet({
      x: start.x, y: start.y, ox: start.x, oy: start.y, vx, vy, owner: owner.id,
      weapon: weapon(p.species, p.stage, ultimate), damage: radius ? 0 : damage,
      range: profile.kind === 'meteor' ? 220 : profile.range, falloff: 1,
      knock: (ultimate ? 140 : 60) / Math.sqrt(profile.pulses * count),
      ricochet: false, pierce: profile.pierce ?? 0, kind: 'ki', gravity,
      size: profile.size, ignite: profile.ignite ?? 0, tier: ultimate ? 2 : 1, form: p.stage,
      pokemon: p.species, target: p.target, homing: profile.homing ?? 0,
      explosion: radius ? {
        radius, damage, knock: ultimate ? 145 / Math.sqrt(profile.pulses) : 65,
        breakRadius: 0, shake: ultimate ? 0.16 : 0.05, core: 0.65, edge: 0.3,
        spareOwner: true, blastOnly: true,
      } : undefined,
    });
    // A protected trainer must not absorb or detonate the attack en route to its partner.
    const target = w.fighters[p.target];
    if (bullet && target?.pokemon && target.master >= 0) bullet.hitIds.push(target.master);
    w.emit({ t: 'shot', f: f.id, weapon: weapon(p.species, p.stage, ultimate), x: start.x, y: start.y, angle });
  }
}

/**
 * Advance only the current cast. There are no timers or queued hit callbacks to survive a recall,
 * guard, KO or interrupted move. Emitted projectiles remain genuine independent world objects.
 */
export function stepPokemonAttack(w: World, f: Fighter, owner: Fighter, p: PokemonState): void {
  if (!f.alive || f.gone || !owner.alive || p.recalling || p.perched || (p.move !== 'shot' && p.move !== 'ultimate')) return;
  const ultimate = p.move === 'ultimate';
  // The parent runtime owns the complete Seismic Toss grab, carrying and ground impact.
  if (ultimate && p.species === 'charmander' && p.stage === 2) return;
  const profile = pokemonAttack(p.species, p.stage, ultimate ? 'ultimate' : 'shot');
  if (!Number.isFinite(p.shots)) p.shots = p.fired ? profile.pulses : 0;
  const origin = muzzle(w, f, p);
  if (p.shots === 0) {
    const target = w.fighters[p.target];
    if (target && eligible(w, target, f, owner)) {
      const point = center(target);
      p.goalX = point.x;
      p.goalY = point.y;
    } else if (!Number.isFinite(p.goalX) || !Number.isFinite(p.goalY) || (p.goalX === 0 && p.goalY === 0)) {
      p.goalX = origin.x + f.facing * profile.range;
      p.goalY = origin.y;
    }
    const dx = p.goalX - origin.x;
    const dy = p.goalY - origin.y;
    const length = Math.hypot(dx, dy);
    if (length > profile.range) {
      p.goalX = origin.x + dx / length * profile.range;
      p.goalY = origin.y + dy / length * profile.range;
    }
    f.aimAngle = Math.atan2(p.goalY - origin.y, p.goalX - origin.x);
  }
  const stage = pokemonStage(p.species, p.stage);
  const budget = POKEMON_DAMAGE[ultimate ? 'ultimate' : 'shot'][stage.damageTier];
  while (p.shots < profile.pulses && p.age + 1e-7 >= profile.windup + p.shots * profile.interval) {
    const pulse = p.shots++;
    if (!p.fired) {
      p.fired = true;
      f.swingHit.length = 0;
      if (profile.kind === 'beam') w.emit({ t: 'beam', f: f.id, power: p.stage, super: ultimate });
      if (profile.kind === 'stream' || profile.kind === 'palm') w.emit({ t: 'shot', f: f.id,
        weapon: weapon(p.species, p.stage, ultimate), x: origin.x, y: origin.y, angle: f.aimAngle });
    }
    if (profile.kind === 'stream' || profile.kind === 'beam' || profile.kind === 'palm') {
      rayPulse(w, f, owner, p, profile, origin, portion(budget, pulse, profile.pulses), ultimate);
    } else if (profile.kind === 'chain') {
      chainPulse(w, f, owner, p, profile, origin, budget);
    } else if (profile.kind === 'ground' || profile.kind === 'thunder') {
      markedPulse(w, f, owner, p, profile, origin, budget, pulse);
    } else {
      projectilePulse(w, f, owner, p, profile, origin, budget, pulse, ultimate);
    }
  }
}
