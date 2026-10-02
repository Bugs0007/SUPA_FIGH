import { applyHit } from './combat';
import { DT, GRAVITY, MAX_FALL, TILE } from './constants';
import { FIRE } from './data/weapons';
import type { Fighter } from './fighter';
import { TK } from './map/tiles';
import { moveBody, newMoveResult, type Body } from './physics';
import { damageProp, supportOnProps } from './prop';
import type { World } from './world';

/** A small burning puddle (molotov, flamethrower drips, exploding gas). Falls, then burns in place. */
export interface FirePatch extends Body {
  active: boolean;
  life: number;
  max: number;
  owner: number;
  px: number;
  py: number;
}

export interface BurningTile {
  tx: number;
  ty: number;
  t: number;
  by: number;
}

const res = newMoveResult();

export function isFlammableTile(kind: number): boolean {
  return kind === TK.WOOD || kind === TK.PLAT_WOOD;
}

export function spawnFire(w: World, x: number, y: number, vx: number, vy: number, owner: number): FirePatch | null {
  let p: FirePatch | null = null;
  for (const c of w.fires) {
    if (!c.active) {
      p = c;
      break;
    }
  }
  if (!p) {
    if (w.fires.length >= FIRE.maxPatches) return null;
    p = { active: false, life: 0, max: 1, owner: -1, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, w: 6, h: 4, grounded: false };
    w.fires.push(p);
  }
  p.active = true;
  p.x = p.px = x;
  p.y = p.py = y;
  p.vx = vx;
  p.vy = vy;
  p.grounded = false;
  p.owner = owner;
  p.max = p.life = w.rng.range(FIRE.patchLife[0], FIRE.patchLife[1]);
  return p;
}

/** Set a fighter on fire (or top up the burn). */
export function ignite(w: World, f: Fighter, seconds: number, by: number): void {
  if (!f.alive || f.gone) return;
  if (w.map.hazardAtPx(f.x, f.y - 3) === 'water') return;
  if (f.burn <= 0) w.emit({ t: 'ignite', f: f.id });
  f.burn = Math.min(FIRE.maxBurn, Math.max(f.burn, seconds));
  if (by >= 0 || f.burnBy < 0) f.burnBy = by;
}

export function igniteTile(w: World, tx: number, ty: number, by: number): void {
  if (!isFlammableTile(w.map.get(tx, ty))) return;
  const key = ty * w.map.w + tx;
  if (w.burningTiles.has(key)) return;
  w.burningTiles.set(key, { tx, ty, t: FIRE.tileBurn * w.rng.range(0.8, 1.2), by });
  w.emit({ t: 'tileIgnite', tx, ty });
}

const overlaps = (f: Fighter, l: number, t: number, r: number, b: number) =>
  f.x + f.w / 2 > l && f.x - f.w / 2 < r && f.y > t && f.y - f.h < b;

export function updateFire(w: World): void {
  // ---- patches
  for (const p of w.fires) {
    if (!p.active) continue;
    p.px = p.x;
    p.py = p.y;
    p.life -= DT;
    if (!p.grounded) {
      p.vy = Math.min(p.vy + GRAVITY * w.gravityScale * DT, MAX_FALL);
      const prevY = p.y;
      moveBody(w.map, p, DT, {}, res);
      if (res.wallX !== 0) p.vx = 0;
      if (!p.grounded) supportOnProps(w, p, prevY, -1);
    }
    if (p.grounded) {
      p.vx *= 0.8;
      p.vy = 0;
      const below = w.map.get(Math.floor(p.x / TILE), Math.floor((p.y + 1) / TILE));
      if (isFlammableTile(below)) igniteTile(w, Math.floor(p.x / TILE), Math.floor((p.y + 1) / TILE), p.owner);
      // keep falling if the floor burned away
      p.grounded = res.landed || w.map.solidAtPx(p.x, p.y + 1) || w.map.isOneWay(Math.floor(p.x / TILE), Math.floor((p.y + 1) / TILE));
    }
    if (p.life <= 0 || p.y > w.killY || w.map.hazardAtPx(p.x, p.y - 1) === 'water') {
      p.active = false;
      continue;
    }
    for (const f of w.fighters) {
      if (f.alive && overlaps(f, p.x - 5, p.y - 8, p.x + 5, p.y)) ignite(w, f, FIRE.touchBurn, p.owner);
    }
    for (const pr of w.props) {
      if (!pr.active) continue;
      if (Math.abs(pr.x - p.x) < pr.w / 2 + 4 && p.y > pr.y - pr.h - 2 && p.y - 6 < pr.y) {
        damageProp(w, pr, pr.def.burnDps * DT, p.owner, true);
      }
    }
  }

  // ---- burning wooden tiles (spread, then collapse)
  if (w.burningTiles.size > 0) {
    const done: number[] = [];
    for (const [key, bt] of w.burningTiles) {
      bt.t -= DT;
      const l = bt.tx * TILE - 2;
      const t = bt.ty * TILE - 6;
      for (const f of w.fighters) if (f.alive && overlaps(f, l, t, l + TILE + 4, t + TILE + 8)) ignite(w, f, FIRE.touchBurn, bt.by);
      for (const [dx, dy] of NEIGHBORS) {
        if (w.rng.chance(FIRE.spread * DT)) igniteTile(w, bt.tx + dx, bt.ty + dy, bt.by);
      }
      if (bt.t <= 0 || !isFlammableTile(w.map.get(bt.tx, bt.ty))) done.push(key);
    }
    for (const key of done) {
      const bt = w.burningTiles.get(key)!;
      w.burningTiles.delete(key);
      if (isFlammableTile(w.map.get(bt.tx, bt.ty))) {
        w.breakTile(bt.tx, bt.ty);
        if (w.rng.chance(0.6)) spawnFire(w, bt.tx * TILE + 8, bt.ty * TILE + 8, w.rng.range(-30, 30), 0, bt.by);
      }
    }
  }
}

const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, -1],
  [0, 1],
];

/** Burning status for one fighter: damage over time, spreading by touch, water/rolling put it out. */
export function updateBurning(w: World, f: Fighter): void {
  if (f.burn <= 0 || f.gone) return;
  if (w.map.hazardAtPx(f.x, f.y - 3) === 'water') {
    f.burn = 0;
    w.emit({ t: 'extinguish', f: f.id });
    return;
  }
  const rolling = f.state === 'roll' || (f.state === 'knockdown' && f.grounded);
  f.burn -= DT * (rolling ? FIRE.rollMul : 1);
  if (!f.alive) {
    if (f.burn <= 0) f.burn = 0;
    return;
  }
  f.burnAcc += FIRE.dps * DT;
  if (f.burnAcc >= FIRE.dps * 0.25) {
    const dmg = f.burnAcc;
    f.burnAcc = 0;
    const by = f.burnBy >= 0 && f.burnBy !== f.id ? f.burnBy : -1;
    applyHit(w, f, { damage: dmg, kbX: 0, kbY: 0, attacker: by, weapon: 'fire', kind: 'fire', ignoreInvuln: true });
    if (!f.alive) return;
  }
  // spread to whoever we're touching
  for (const o of w.fighters) {
    if (o === f || !o.alive || o.burn > 0) continue;
    if (Math.abs(o.x - f.x) < (o.w + f.w) / 2 && Math.abs(o.y - f.y) < 12 && w.rng.chance(1.5 * DT)) ignite(w, o, 2, f.burnBy);
  }
  if (f.burn <= 0) {
    f.burn = 0;
    f.burnAcc = 0;
    w.emit({ t: 'extinguish', f: f.id });
  }
}
