import { DT, GRAVITY, MAX_FALL } from './constants';
import { PROPS, type PropDef, type PropType } from './data/props';
import { explode } from './explosion';
import { moveBody, newMoveResult, type Body } from './physics';
import type { World } from './world';

/** Crates, explosive barrels, gas canisters. Dynamic bodies you can stand on, shoot, kick and blow up. */
export interface Prop extends Body {
  id: number;
  type: PropType;
  def: PropDef;
  active: boolean;
  hp: number;
  px: number;
  py: number;
  rot: number;
  vrot: number;
  /** fighter credited for whatever this prop does when it breaks */
  lastBy: number;
  /** >= 0: counting down to detonation */
  fuse: number;
}

const res = newMoveResult();

export function createProp(id: number, type: PropType, x: number, y: number): Prop {
  const def = PROPS[type];
  return {
    id,
    type,
    def,
    active: true,
    hp: def.hp,
    x,
    y,
    px: x,
    py: y,
    vx: 0,
    vy: 0,
    w: def.w,
    h: def.h,
    grounded: false,
    rot: 0,
    vrot: 0,
    lastBy: -1,
    fuse: -1,
  };
}

/**
 * Let a falling body land on top of props (one-way from above, like a platform).
 * prevY = the body's feet before this tick's move. Returns true if it landed.
 */
export function supportOnProps(w: World, b: Body, prevY: number, selfId: number): boolean {
  if (b.vy < 0) return false;
  for (const p of w.props) {
    if (!p.active || p.id === selfId) continue;
    const top = p.y - p.h;
    if (b.x + b.w / 2 <= p.x - p.w / 2 + 1 || b.x - b.w / 2 >= p.x + p.w / 2 - 1) continue;
    if (prevY > top + 1.5 || b.y < top) continue;
    b.y = top;
    b.vy = 0;
    b.grounded = true;
    return true;
  }
  return false;
}

/** Is the body standing exactly on a prop? */
export function onProp(w: World, b: Body, selfId = -1): boolean {
  for (const p of w.props) {
    if (!p.active || p.id === selfId) continue;
    if (b.x + b.w / 2 <= p.x - p.w / 2 + 1 || b.x - b.w / 2 >= p.x + p.w / 2 - 1) continue;
    if (Math.abs(b.y - (p.y - p.h)) < 0.6) return true;
  }
  return false;
}

export function damageProp(w: World, p: Prop, dmg: number, by: number, quiet = false): void {
  if (!p.active || p.hp <= 0) return;
  p.hp -= dmg;
  if (by >= 0) p.lastBy = by;
  if (!quiet) w.emit({ t: 'propHit', x: p.x, y: p.y - p.h / 2, type: p.type });
  if (p.hp > 0) return;
  p.hp = 0;
  if (p.def.fuse !== undefined) {
    p.fuse = p.def.fuse;
    if (p.def.rocket) {
      // the valve blows: it takes off spinning
      p.vx = w.rng.range(-1, 1) * 220;
      p.vy = -w.rng.range(220, 320);
      p.vrot = w.rng.range(-25, 25);
      p.grounded = false;
    }
  } else {
    destroyProp(w, p);
  }
}

export function pushProp(p: Prop, vx: number, vy: number): void {
  p.vx += vx / p.def.mass;
  p.vy += vy / p.def.mass;
  if (vy < -1) p.grounded = false;
  p.vrot += (vx / p.def.mass) * 0.02;
}

function destroyProp(w: World, p: Prop): void {
  p.active = false;
  const cy = p.y - p.h / 2;
  w.emit({ t: 'propBreak', x: p.x, y: cy, type: p.type });
  if (p.def.explosion) explode(w, p.x, cy, p.def.explosion, p.lastBy, p.type);
  if (p.def.drop && w.rng.chance(p.def.drop)) {
    const id = w.randomWeaponId();
    if (id) {
      const it = w.spawnWeapon(id, p.x, p.y - 2);
      it.vy = -120;
    }
  }
}

export function updateProps(w: World): void {
  for (const p of w.props) {
    if (!p.active) continue;
    p.px = p.x;
    p.py = p.y;
    if (p.fuse >= 0) {
      p.fuse -= DT;
      if (p.def.rocket && !p.grounded) p.vy -= 500 * DT; // thrust
      if (p.fuse <= 0) {
        destroyProp(w, p);
        continue;
      }
    }
    p.vy = Math.min(p.vy + GRAVITY * w.gravityScale * DT, MAX_FALL);
    const prevY = p.y;
    moveBody(w.map, p, DT, {}, res);
    if (!p.grounded) supportOnProps(w, p, prevY, p.id);
    if (res.wallX !== 0) {
      p.vx = -res.impactVx * 0.3;
      p.vrot *= -0.5;
    }
    if (res.landed && res.impactVy > 260) {
      p.vy = -res.impactVy * 0.2;
      p.grounded = false;
      w.emit({ t: 'itemLand', x: p.x, y: p.y, speed: res.impactVy });
      if (res.impactVy > 420) damageProp(w, p, (res.impactVy - 420) * 0.1, p.lastBy);
    }
    if (p.grounded) {
      p.vx *= 0.82;
      if (Math.abs(p.vx) < 2) p.vx = 0;
      const r = Math.atan2(Math.sin(p.rot), Math.cos(p.rot));
      const q = Math.round(r / (Math.PI / 2)) * (Math.PI / 2);
      p.rot = r + (q - r) * 0.3;
      p.vrot = 0;
    } else {
      p.rot += p.vrot * DT;
    }
    if (p.y > w.killY + 50) p.active = false;
  }
}
