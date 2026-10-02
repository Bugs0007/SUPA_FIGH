// Map gimmicks: data in MapDef.gimmicks (map/mapData.ts), behavior here. Pure sim.
//   movers  — kinematic platforms (elevators, swinging girders, crane hooks, minecarts). Their top is a
//             one-way platform; whatever stands on them is carried. Carts hurt what they drive into.
//   hazards — timed kill/damage rectangles (crushers, laser grids, train tunnels), telegraphed by a warn phase
//   gravity — zones with a gravity multiplier (optionally toggling)
//   drops   — supply crates falling from the sky at intervals
// Conveyor belts are tiles (tiles.ts `conveyor`), applied via conveyorPush().

import { applyHit } from './combat';
import { DT, TILE } from './constants';
import type { Fighter } from './fighter';
import type { DropDef, GravityDef, HazardDef, MoverDef } from './map/mapData';
import type { Body } from './physics';
import { damageProp } from './prop';
import type { World } from './world';

export const CONVEYOR_SPEED = 45;

export interface Mover {
  id: number;
  def: MoverDef;
  /** top-left px */
  x: number;
  y: number;
  px: number;
  py: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  t: number;
  /** path state */
  seg: number;
  dir: 1 | -1;
  wait: number;
  /** per-fighter hit cooldowns (carts) */
  hitCd: number[];
}

export interface Hazard {
  def: HazardDef;
  /** current rect px */
  x: number;
  y: number;
  w: number;
  h: number;
  t: number;
  active: boolean;
  warn: boolean;
  hitCd: number[];
}

export interface GravZone {
  def: GravityDef;
  l: number;
  t: number;
  r: number;
  b: number;
  active: boolean;
}

export interface Gimmicks {
  movers: Mover[];
  hazards: Hazard[];
  gravity: GravZone[];
  drops: { def: DropDef; timer: number }[];
}

export function buildGimmicks(w: World): Gimmicks {
  const g: Gimmicks = { movers: [], hazards: [], gravity: [], drops: [] };
  for (const d of w.def.gimmicks ?? []) {
    if (d.type === 'mover') {
      const m: Mover = {
        id: g.movers.length,
        def: d,
        x: d.x * TILE,
        y: d.y * TILE,
        px: 0,
        py: 0,
        w: d.w * TILE,
        h: d.h ?? 6,
        vx: 0,
        vy: 0,
        t: 0,
        seg: 0,
        dir: 1,
        wait: 0,
        hitCd: [],
      };
      if (d.swing) placeSwing(m, 0);
      m.px = m.x;
      m.py = m.y;
      g.movers.push(m);
    } else if (d.type === 'hazard') {
      g.hazards.push({ def: d, x: d.x * TILE, y: d.y * TILE, w: d.w * TILE, h: d.h * TILE, t: d.phase ?? 0, active: false, warn: false, hitCd: [] });
    } else if (d.type === 'gravity') {
      g.gravity.push({ def: d, l: d.x * TILE, t: d.y * TILE, r: (d.x + d.w) * TILE, b: (d.y + d.h) * TILE, active: true });
    } else if (d.type === 'drops') {
      g.drops.push({ def: d, timer: w.rng.range(d.every[0], d.every[1]) });
    }
  }
  return g;
}

function placeSwing(m: Mover, t: number): void {
  const s = m.def.swing!;
  const a = s.amp * Math.sin((t / s.period) * Math.PI * 2);
  const cx = m.def.x * TILE + Math.sin(a) * s.length;
  const cy = m.def.y * TILE + Math.cos(a) * s.length;
  m.x = cx - m.w / 2;
  m.y = cy;
}

/** Bodies standing on the mover's top (checked before it moves). */
function riders(w: World, m: Mover): Body[] {
  const out: Body[] = [];
  const test = (b: Body) => Math.abs(b.y - m.y) < 1.5 && b.x + b.w / 2 > m.x + 1 && b.x - b.w / 2 < m.x + m.w - 1 && b.vy >= -1;
  for (const f of w.fighters) if (!f.gone && f.state !== 'climb' && f.state !== 'ledge' && test(f)) out.push(f);
  for (const it of w.items) if (it.active && test(it)) out.push(it);
  for (const p of w.props) if (p.active && p.carriedBy < 0 && test(p)) out.push(p);
  for (const p of w.fires) if (p.active && test(p)) out.push(p);
  return out;
}

function updateMover(w: World, m: Mover): void {
  m.px = m.x;
  m.py = m.y;
  m.t += DT;
  const d = m.def;
  const carried = riders(w, m);
  if (d.swing) {
    placeSwing(m, m.t);
  } else if (d.path && d.path.length > 0) {
    if (m.wait > 0) m.wait -= DT;
    else {
      const pts: [number, number][] = [[0, 0], ...d.path];
      const next = d.loop ? (m.seg + 1) % pts.length : m.seg + m.dir;
      const tx = (d.x + pts[next][0]) * TILE;
      const ty = (d.y + pts[next][1]) * TILE;
      const dx = tx - m.x;
      const dy = ty - m.y;
      const dist = Math.hypot(dx, dy);
      const step = (d.speed ?? 50) * DT;
      if (dist <= step) {
        m.x = tx;
        m.y = ty;
        m.seg = next;
        m.wait = d.pause ?? 0;
        if (!d.loop) {
          if (m.seg >= pts.length - 1) m.dir = -1;
          else if (m.seg <= 0) m.dir = 1;
        }
      } else {
        m.x += (dx / dist) * step;
        m.y += (dy / dist) * step;
      }
    }
  }
  const mdx = m.x - m.px;
  const mdy = m.y - m.py;
  m.vx = mdx / DT;
  m.vy = mdy / DT;
  for (const b of carried) {
    const nx = b.x + mdx;
    if (!w.map.rectSolid(nx - b.w / 2, b.y - b.h, nx + b.w / 2, b.y)) b.x = nx;
    b.y = m.y;
    if ('px' in b && mdy < 0) b.vy = Math.min(b.vy, 0);
  }
  // carts and hooks hurt what they drive into
  if (d.hits && Math.abs(m.vx) + Math.abs(m.vy) > 40) {
    for (const f of w.fighters) {
      if (!f.alive || f.gone) continue;
      if ((m.hitCd[f.id] ?? 0) > w.time) continue;
      if (f.x + f.w / 2 < m.x || f.x - f.w / 2 > m.x + m.w || f.y <= m.y + 2 || f.y - f.h > m.y + m.h) continue;
      m.hitCd[f.id] = w.time + 0.6;
      const dir = Math.sign(m.vx) || (f.x < m.x + m.w / 2 ? -1 : 1);
      applyHit(w, f, {
        damage: d.hits.damage,
        kbX: dir * d.hits.knock,
        kbY: -d.hits.knock * 0.5,
        attacker: -1,
        weapon: d.kind === 'cart' ? 'minecart' : d.kind,
        kind: 'hazard',
        knockdown: true,
        ignoreInvuln: true,
      });
    }
  }
}

function updateHazard(w: World, h: Hazard): void {
  const d = h.def;
  h.t += DT;
  const period = d.on + d.off;
  const c = ((h.t % period) + period) % period;
  const wasActive = h.active;
  h.active = c >= d.off;
  h.warn = !h.active && c >= d.off - (d.warn ?? 0.6);
  if (d.sweep) {
    const p = h.active ? (c - d.off) / d.on : 0;
    h.x = d.x * TILE + d.sweep * TILE * p;
  }
  if (h.active && !wasActive) w.emit({ t: 'hazard', kind: d.kind, x: h.x + h.w / 2, y: h.y + h.h / 2, on: true });
  if (!h.active) return;
  for (const f of w.fighters) {
    if (!f.alive || f.gone) continue;
    if ((h.hitCd[f.id] ?? 0) > w.time) continue;
    if (f.x + f.w / 2 <= h.x || f.x - f.w / 2 >= h.x + h.w || f.y <= h.y || f.y - f.h >= h.y + h.h) continue;
    h.hitCd[f.id] = w.time + 0.5;
    const dir = d.sweep ? 1 : f.x < h.x + h.w / 2 ? -1 : 1;
    applyHit(w, f, {
      damage: d.damage,
      kbX: dir * (d.knockX ?? 120),
      kbY: d.knockY ?? -120,
      attacker: -1,
      weapon: d.kind,
      kind: 'hazard',
      knockdown: (d.knockX ?? 120) > 150,
      ignoreInvuln: true,
    });
  }
  if (d.kind === 'crusher') {
    for (const p of w.props) {
      if (p.active && p.x + p.w / 2 > h.x && p.x - p.w / 2 < h.x + h.w && p.y > h.y && p.y - p.h < h.y + h.h) damageProp(w, p, 999, -1);
    }
  }
}

function updateDrops(w: World, g: Gimmicks): void {
  for (const dr of g.drops) {
    dr.timer -= DT;
    if (dr.timer > 0) continue;
    dr.timer = w.rng.range(dr.def.every[0], dr.def.every[1]);
    const tx = dr.def.xs[w.rng.int(0, dr.def.xs.length - 1)];
    const x = tx * TILE + TILE / 2;
    const p = w.spawnProp('crate', x, -TILE);
    p.loot = dr.def.pool;
    p.vy = 60;
    w.emit({ t: 'supplyDrop', x, y: 0 });
  }
}

export function updateGimmicks(w: World): void {
  const g = w.gimmicks;
  for (const m of g.movers) updateMover(w, m);
  for (const h of g.hazards) updateHazard(w, h);
  for (const z of g.gravity) {
    if (z.def.toggle) {
      const per = z.def.toggle.on + z.def.toggle.off;
      const was = z.active;
      z.active = w.time % per < z.def.toggle.on;
      if (z.active !== was) w.emit({ t: 'gravity', on: z.active, x: (z.l + z.r) / 2, y: (z.t + z.b) / 2 });
    }
  }
  updateDrops(w, g);
}

/** Gravity multiplier at a point (map/settings scale × active zones). */
export function gravityMult(w: World, x: number, y: number): number {
  let m = w.gravityScale;
  for (const z of w.gimmicks.gravity) if (z.active && x >= z.l && x < z.r && y >= z.t && y < z.b) m *= z.def.mult;
  return m;
}

/** Push a grounded body along the conveyor it stands on. */
export function conveyorPush(w: World, b: Body): void {
  if (!b.grounded) return;
  const d = w.map.def(Math.floor(b.x / TILE), Math.floor((b.y + 1) / TILE));
  if (!d.conveyor) return;
  const nx = b.x + d.conveyor * CONVEYOR_SPEED * DT;
  if (!w.map.rectSolid(nx - b.w / 2, b.y - b.h, nx + b.w / 2, b.y - 0.01)) b.x = nx;
}

/** Is a fighter inside (or about to be inside) an active/warning hazard? Used by bots. */
export function hazardNear(w: World, f: Fighter, pad = 10): Hazard | null {
  for (const h of w.gimmicks.hazards) {
    if (!h.active && !h.warn) continue;
    const x0 = h.def.sweep ? h.def.x * TILE : h.x;
    const x1 = h.def.sweep ? (h.def.x + h.def.sweep) * TILE + h.w : h.x + h.w;
    if (f.x + f.w / 2 + pad > x0 && f.x - f.w / 2 - pad < x1 && f.y + pad > h.y && f.y - f.h - pad < h.y + h.h) return h;
  }
  return null;
}
