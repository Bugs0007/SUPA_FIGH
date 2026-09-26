import { applyHit } from './combat';
import { DT, GRAVITY, MAX_FALL } from './constants';
import { TOSS, weaponDef } from './data/weapons';
import { moveBody, newMoveResult, type Body } from './physics';
import type { World } from './world';

/** A weapon lying on (or flying over) the map. */
export interface Item extends Body {
  id: number;
  active: boolean;
  weaponId: string;
  ammo: number;
  dur: number;
  px: number;
  py: number;
  rot: number;
  vrot: number;
  age: number;
  /** fighter who tossed it (-1 = none) */
  thrownBy: number;
  /** damage dealt if it hits someone while flying fast */
  thrownDmg: number;
  noPickupBy: number;
  noPickupTimer: number;
}

const res = newMoveResult();

export function createItem(id: number, weaponId: string, ammo: number, dur: number, x: number, y: number): Item {
  return {
    id,
    active: true,
    weaponId,
    ammo,
    dur,
    x,
    y,
    px: x,
    py: y,
    vx: 0,
    vy: 0,
    w: 10,
    h: 6,
    grounded: false,
    rot: 0,
    vrot: 0,
    age: 0,
    thrownBy: -1,
    thrownDmg: 0,
    noPickupBy: -1,
    noPickupTimer: 0,
  };
}

export function updateItems(w: World): void {
  for (const it of w.items) {
    if (!it.active) continue;
    it.px = it.x;
    it.py = it.y;
    it.age += DT;
    if (it.noPickupTimer > 0) it.noPickupTimer -= DT;
    it.vy = Math.min(it.vy + GRAVITY * w.gravityScale * DT, MAX_FALL);
    if (!it.grounded) it.rot += it.vrot * DT;
    moveBody(w.map, it, DT, {}, res);
    if (res.wallX !== 0) {
      it.vx = -res.impactVx * 0.4;
      it.vrot = -it.vrot * 0.5;
    }
    if (res.landed) {
      if (res.impactVy > 120) {
        it.vy = -res.impactVy * 0.35;
        it.vrot *= 0.5;
        it.grounded = false;
        w.emit({ t: 'itemLand', x: it.x, y: it.y, speed: res.impactVy });
      } else {
        it.vrot = 0;
      }
    }
    if (it.grounded) {
      it.vx *= 0.8;
      // settle flat
      const r = Math.atan2(Math.sin(it.rot), Math.cos(it.rot));
      const target = Math.abs(r) > Math.PI / 2 ? Math.PI * Math.sign(r || 1) : 0;
      it.rot = r + (target - r) * 0.35;
    }

    const speed = Math.abs(it.vx) + Math.abs(it.vy);
    if (it.thrownDmg > 0) {
      if (speed < 140) {
        it.thrownDmg = 0;
      } else {
        for (const f of w.fighters) {
          if (!f.alive || f.gone) continue;
          if (f.id === it.thrownBy && it.age < 0.35) continue;
          if (Math.abs(f.x - it.x) > (f.w + it.w) / 2 || it.y - it.h > f.y || it.y < f.y - f.h) continue;
          const dir = Math.sign(it.vx) || 1;
          const hit = applyHit(w, f, {
            damage: it.thrownDmg,
            kbX: dir * TOSS.knockX,
            kbY: TOSS.knockY,
            attacker: it.thrownBy,
            weapon: it.weaponId,
            kind: 'throw',
            stun: TOSS.stun,
            x: it.x,
            y: it.y - 3,
          });
          if (hit) {
            it.thrownDmg = 0;
            it.vx = -it.vx * 0.3;
            it.vy = -120;
            w.emit({ t: 'bonk', x: it.x, y: it.y });
            break;
          }
        }
      }
    }

    const def = weaponDef(it.weaponId);
    const emptyGun = !!def.gun && it.ammo <= 0;
    if ((emptyGun && it.age > 5) || it.y > w.killY + 100 || it.age > 90) it.active = false;
  }
}
