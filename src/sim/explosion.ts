import { applyHit } from './combat';
import { TILE } from './constants';
import type { ExplosionStats } from './data/weapons';
import { isFlammableTile, spawnFire } from './fire';
import { TK } from './map/tiles';
import { damageProp, pushProp } from './prop';
import type { World } from './world';

/** Does a bullet-stopping tile lie between two points? (ignores the starting cell) */
export function lineBlocked(w: World, x0: number, y0: number, x1: number, y1: number): boolean {
  let hit = false;
  w.map.traverse(x0, y0, x1, y1, (tx, ty, t) => {
    if (t <= 0) return false;
    const d = w.map.def(tx, ty);
    if (d.solid && !d.bulletPass) {
      hit = true;
      return true;
    }
    return false;
  });
  return hit;
}

/** Shielded targets behind walls take this fraction. */
const COVER = 0.35;

/**
 * Radial blast: damage + knockback (knocks down) on fighters and corpses, shoves items/props,
 * chain-detonates explosives, breaks wood/glass, optionally scatters fire.
 */
export function explode(w: World, x: number, y: number, ex: ExplosionStats, owner: number, weapon: string): void {
  if (w.map.solidAtPx(x, y)) y -= 4;
  w.emit({ t: 'explosion', x, y, radius: ex.radius, weapon, shake: ex.shake });
  const r = ex.radius;

  const falloff = (tx: number, ty: number, pad: number) => {
    const d = Math.max(0, Math.hypot(tx - x, ty - y) - pad);
    if (d >= r) return 0;
    let k = 1 - d / r;
    if (lineBlocked(w, x, y, tx, ty)) k *= COVER;
    return k;
  };
  const dir = (tx: number, ty: number) => {
    let nx = tx - x;
    let ny = ty - y;
    const len = Math.hypot(nx, ny);
    if (len < 1) {
      nx = 0;
      ny = -1;
    } else {
      nx /= len;
      ny /= len;
    }
    ny -= 0.6; // blasts throw things up — it reads better and gets bodies off the floor
    const l2 = Math.hypot(nx, ny) || 1;
    return [nx / l2, ny / l2];
  };

  for (const f of w.fighters) {
    if (f.gone) continue;
    const cy = f.y - f.h / 2;
    const k = falloff(f.x, cy, 6);
    if (k <= 0.02) continue;
    const [nx, ny] = dir(f.x, cy);
    const kb = ex.knock * (0.35 + 0.65 * k);
    applyHit(w, f, {
      damage: ex.damage * (0.2 + 0.8 * k),
      kbX: nx * kb,
      kbY: ny * kb,
      attacker: owner,
      weapon,
      kind: 'explosion',
      stun: 0.3,
      knockdown: k > 0.2,
      ignoreInvuln: true,
      x: f.x,
      y: cy,
    });
  }

  for (const it of w.items) {
    if (!it.active) continue;
    const k = falloff(it.x, it.y - it.h / 2, 3);
    if (k <= 0) continue;
    if (it.live) {
      // sympathetic detonation, slightly staggered so chains ripple
      if (it.fuse < 0 || it.fuse > 0.2) it.fuse = w.rng.range(0.08, 0.2);
      continue;
    }
    const [nx, ny] = dir(it.x, it.y - it.h / 2);
    it.vx += nx * ex.knock * k;
    it.vy += ny * ex.knock * k;
    it.vrot += w.rng.range(-20, 20);
    it.grounded = false;
  }

  for (const p of w.props) {
    if (!p.active) continue;
    const k = falloff(p.x, p.y - p.h / 2, Math.max(p.w, p.h) / 2);
    if (k <= 0) continue;
    const [nx, ny] = dir(p.x, p.y - p.h / 2);
    pushProp(p, nx * ex.knock * k, ny * ex.knock * k);
    damageProp(w, p, ex.damage * (0.3 + 0.9 * k), owner, true);
  }

  // tiles: smash glass and wood
  const br = ex.breakRadius;
  const tx0 = Math.floor((x - br) / TILE);
  const tx1 = Math.floor((x + br) / TILE);
  const ty0 = Math.floor((y - br) / TILE);
  const ty1 = Math.floor((y + br) / TILE);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const kind = w.map.get(tx, ty);
      if (kind !== TK.GLASS && !isFlammableTile(kind)) continue;
      const cx = tx * TILE + TILE / 2;
      const cy = ty * TILE + TILE / 2;
      if (Math.hypot(cx - x, cy - y) <= br) w.breakTile(tx, ty);
    }
  }

  const fire = ex.fire ?? 0;
  for (let i = 0; i < fire; i++) {
    spawnFire(w, x + w.rng.range(-6, 6), y - 2, w.rng.range(-170, 170), w.rng.range(-220, -60), owner);
  }
}
