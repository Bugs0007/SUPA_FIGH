import { applyHit, computeDamage } from './combat';
import { DT } from './constants';
import type { ExplosionStats, ProjectileKind } from './data/weapons';
import { explode } from './explosion';
import { ignite, igniteTile, isFlammableTile, spawnFire } from './fire';
import { segmentAabb } from './physics';
import { damageProp, pushProp } from './prop';
import type { World } from './world';

export interface Bullet {
  active: boolean;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  /** tracer origin (muzzle, or last ricochet point) */
  ox: number;
  oy: number;
  owner: number;
  weapon: string;
  damage: number;
  range: number;
  traveled: number;
  falloff: number;
  knock: number;
  ricochet: boolean;
  bounces: number;
  pierce: number;
  hitIds: number[];
  canHitOwner: boolean;
  kind: ProjectileKind;
  gravity: number;
  explosion: ExplosionStats | null;
  ignite: number;
  /** hit radius around fighters/props (energy orbs); 0 = a point */
  size: number;
}

export interface BulletSpawn {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ox: number;
  oy: number;
  owner: number;
  weapon: string;
  damage: number;
  range: number;
  falloff: number;
  knock: number;
  ricochet: boolean;
  pierce: number;
  kind: ProjectileKind;
  gravity?: number;
  explosion?: ExplosionStats | null;
  ignite?: number;
  size?: number;
}

export function newBullet(): Bullet {
  return {
    active: false,
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    vx: 0,
    vy: 0,
    ox: 0,
    oy: 0,
    owner: -1,
    weapon: '',
    damage: 0,
    range: 0,
    traveled: 0,
    falloff: 1,
    knock: 0,
    ricochet: false,
    bounces: 0,
    pierce: 0,
    hitIds: [],
    canHitOwner: false,
    kind: 'bullet',
    gravity: 0,
    explosion: null,
    ignite: 0,
    size: 0,
  };
}

export function initBullet(b: Bullet, s: BulletSpawn): Bullet {
  b.active = true;
  b.x = b.px = s.x;
  b.y = b.py = s.y;
  b.vx = s.vx;
  b.vy = s.vy;
  b.ox = s.ox;
  b.oy = s.oy;
  b.owner = s.owner;
  b.weapon = s.weapon;
  b.damage = s.damage;
  b.range = s.range;
  b.traveled = 0;
  b.falloff = s.falloff;
  b.knock = s.knock;
  b.ricochet = s.ricochet;
  b.bounces = s.ricochet ? 2 : 0;
  b.pierce = s.pierce;
  b.hitIds.length = 0;
  b.canHitOwner = false;
  b.kind = s.kind;
  b.gravity = s.gravity ?? 0;
  b.explosion = s.explosion ?? null;
  b.ignite = s.ignite ?? 0;
  b.size = s.size ?? 0;
  return b;
}

/** Kinds that don't pass through wood/glass (they burn or blow up on it instead). */
const SOLID_HITTERS: ReadonlySet<ProjectileKind> = new Set<ProjectileKind>(['flame', 'rocket', 'flare', 'chakra', 'ki', 'cannonball']);

function burst(w: World, b: Bullet, x: number, y: number): void {
  if (b.explosion) explode(w, x - Math.sign(b.vx) * 2, y - Math.sign(b.vy) * 2, b.explosion, b.owner, b.weapon);
}

/** Flames and flares light up what they land on. */
function scorch(w: World, b: Bullet, x: number, y: number, tx: number, ty: number): void {
  if (b.kind !== 'flame' && b.kind !== 'flare') return;
  if (isFlammableTile(w.map.get(tx, ty))) igniteTile(w, tx, ty, b.owner);
  const chance = b.kind === 'flare' ? 1 : 0.06;
  if (w.rng.chance(chance)) spawnFire(w, x - Math.sign(b.vx) * 3, y - 3, -b.vx * 0.05, -40, b.owner);
}

interface WallHit {
  t: number;
  nx: number;
  ny: number;
  ricochet: boolean;
  material: string;
  tx: number;
  ty: number;
}

/** Advance every active bullet by one tick: swept vs fighters and tiles. */
export function updateBullets(w: World): void {
  const map = w.map;
  for (const b of w.bullets) {
    if (!b.active) continue;
    b.px = b.x;
    b.py = b.y;
    if (b.gravity !== 0) b.vy += b.gravity * DT;
    if (b.kind === 'flame') {
      b.vx *= 0.97;
      b.vy *= 0.97;
    }
    let remaining = DT;
    // a tick can split into several segments (ricochets, pierced fighters)
    for (let seg = 0; seg < 5 && remaining > 1e-6 && b.active; seg++) {
      const nx = b.x + b.vx * remaining;
      const ny = b.y + b.vy * remaining;
      const segLen = Math.hypot(nx - b.x, ny - b.y);

      // nearest fighter / corpse
      let bestT = 2;
      let bestF = -1;
      for (const f of w.fighters) {
        if (f.gone) continue;
        if (f.id === b.owner && !b.canHitOwner) continue;
        if (b.hitIds.includes(f.id)) continue;
        if (f.alive && f.invuln > 0) continue;
        const r = b.size;
        const t = segmentAabb(b.x, b.y, nx, ny, f.x - f.w / 2 - r, f.y - f.h - r, f.x + f.w / 2 + r, f.y + r);
        if (t >= 0 && t < bestT) {
          bestT = t;
          bestF = f.id;
        }
      }
      // props are solid targets (stop every projectile)
      let bestP = -1;
      for (let i = 0; i < w.props.length; i++) {
        const p = w.props[i];
        if (!p.active) continue;
        const r = b.size;
        const t = segmentAabb(b.x, b.y, nx, ny, p.x - p.w / 2 - r, p.y - p.h - r, p.x + p.w / 2 + r, p.y + r);
        if (t >= 0 && t < bestT) {
          bestT = t;
          bestP = i;
          bestF = -1;
        }
      }

      // tiles up to the fighter
      let wall: WallHit | null = null;
      const x0 = b.x;
      const y0 = b.y;
      map.traverse(x0, y0, nx, ny, (tx, ty, t, cnx, cny) => {
        if (t > bestT) return true;
        const d = map.def(tx, ty);
        if (!d.solid) return false;
        if (d.bulletPass && !SOLID_HITTERS.has(b.kind)) {
          if (t > 0) {
            b.damage *= d.passMul;
            if (d.breakable) w.breakTile(tx, ty);
            else w.emit({ t: 'splinter', x: x0 + (nx - x0) * t, y: y0 + (ny - y0) * t });
          }
          return false;
        }
        wall = { t, nx: cnx, ny: cny, ricochet: d.ricochet, material: d.material, tx, ty };
        return true;
      });

      const wh = wall as WallHit | null;
      if (wh && wh.t <= bestT) {
        const hx = x0 + (nx - x0) * wh.t;
        const hy = y0 + (ny - y0) * wh.t;
        b.traveled += segLen * wh.t;
        remaining *= 1 - wh.t;
        if (wh.t === 0 && wh.nx === 0 && wh.ny === 0) {
          // spawned inside a wall
          w.emit({ t: 'impact', x: hx, y: hy, nx: 0, ny: 0, material: wh.material });
          burst(w, b, hx, hy);
          b.active = false;
          break;
        }
        const bouncy = w.mods.has('bouncy') && b.kind !== 'flame' && b.kind !== 'rocket';
        if ((wh.ricochet || bouncy) && (b.ricochet || bouncy) && b.bounces > 0 && (bouncy || w.rng.chance(0.8))) {
          if (wh.nx !== 0) b.vx = -b.vx;
          if (wh.ny !== 0) b.vy = -b.vy;
          const jitter = w.rng.range(-0.18, 0.18);
          const c = Math.cos(jitter);
          const s = Math.sin(jitter);
          const vx = b.vx * c - b.vy * s;
          b.vy = b.vx * s + b.vy * c;
          b.vx = vx;
          b.bounces--;
          b.damage *= 0.75;
          b.canHitOwner = true;
          b.hitIds.length = 0;
          b.x = hx + wh.nx * 0.5;
          b.y = hy + wh.ny * 0.5;
          b.ox = b.x;
          b.oy = b.y;
          w.emit({ t: 'ricochet', x: hx, y: hy });
          continue;
        }
        if (b.kind !== 'flame') w.emit({ t: 'impact', x: hx, y: hy, nx: wh.nx, ny: wh.ny, material: wh.material });
        b.x = hx;
        b.y = hy;
        b.active = false;
        burst(w, b, hx, hy);
        scorch(w, b, hx, hy, wh.tx, wh.ty);
        break;
      }

      if (bestP >= 0) {
        const p = w.props[bestP];
        const hx = b.x + (nx - b.x) * bestT;
        const hy = b.y + (ny - b.y) * bestT;
        const speed = Math.hypot(b.vx, b.vy) || 1;
        b.x = hx;
        b.y = hy;
        b.active = false;
        if (b.kind !== 'flame') w.emit({ t: 'impact', x: hx, y: hy, nx: -Math.sign(b.vx), ny: 0, material: p.type === 'crate' ? 'wood' : 'metal' });
        pushProp(p, (b.vx / speed) * b.knock * 0.8, (b.vy / speed) * b.knock * 0.4 - 10);
        damageProp(w, p, b.damage, b.owner);
        burst(w, b, hx, hy);
        break;
      }

      if (bestF >= 0) {
        const f = w.fighters[bestF];
        const hx = b.x + (nx - b.x) * bestT;
        const hy = b.y + (ny - b.y) * bestT;
        const speed = Math.hypot(b.vx, b.vy) || 1;
        const dist = b.traveled + segLen * bestT;
        const dmg = computeDamage({ base: b.damage, falloff: b.falloff, distFrac: dist / b.range });
        const connected = applyHit(w, f, {
          damage: dmg,
          kbX: (b.vx / speed) * b.knock,
          kbY: (b.vy / speed) * b.knock * 0.5,
          attacker: b.owner,
          weapon: b.weapon,
          kind: b.kind === 'flame' ? 'fire' : 'bullet',
          x: hx,
          y: hy,
        });
        if (connected && b.ignite > 0) ignite(w, f, b.ignite, b.owner);
        b.hitIds.push(f.id);
        if (b.explosion) {
          b.active = false;
          burst(w, b, hx, hy);
          break;
        }
        b.x = hx;
        b.y = hy;
        b.traveled = dist;
        if (b.pierce > 0) {
          // keep flying from the hit point; hitIds stops us re-hitting the same fighter
          b.pierce--;
          b.damage *= 0.7;
          remaining *= 1 - bestT;
          continue;
        }
        b.active = false;
        break;
      }

      b.x = nx;
      b.y = ny;
      b.traveled += segLen;
      remaining = 0;
    }
    if (b.traveled >= b.range && b.active) {
      b.active = false;
      burst(w, b, b.x, b.y);
    }
    if (b.x < -300 || b.x > map.pxW + 300 || b.y < -300 || b.y > map.pxH + 300) b.active = false;
  }
}
