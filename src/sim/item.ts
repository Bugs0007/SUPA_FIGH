import { applyHit } from './combat';
import { DT, GRAVITY, MAX_FALL } from './constants';
import { TOSS, weaponDef } from './data/weapons';
import { explode } from './explosion';
import { ignite, spawnFire } from './fire';
import { moveBody, newMoveResult, type Body } from './physics';
import { supportOnProps } from './prop';
import { conveyorPush } from './gimmicks';
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
  /** an armed throwable in flight / on the ground (grenade, molotov, C4, mine). Can't be picked up. */
  live: boolean;
  /** >= 0: seconds until detonation */
  fuse: number;
  /** stuck to a wall (C4) */
  stuck: boolean;
  /** mines: seconds since landing (arms after MINE_ARM) */
  armT: number;
}

export const MINE_ARM = 0.9;

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
    live: false,
    fuse: -1,
    stuck: false,
    armT: 0,
  };
}

/** Blow up / burst a live throwable. */
export function detonate(w: World, it: Item): void {
  if (!it.active) return;
  it.active = false;
  const th = weaponDef(it.weaponId).throw;
  if (!th) return;
  if (th.explosion) explode(w, it.x, it.y - 3, th.explosion, it.thrownBy, it.weaponId);
  if (th.fire) {
    w.emit({ t: 'burst', x: it.x, y: it.y - 3, weapon: it.weaponId });
    for (let i = 0; i < th.fire; i++) {
      spawnFire(w, it.x, it.y - 4, w.rng.range(-150, 150) + it.vx * 0.2, w.rng.range(-170, -40), it.thrownBy);
    }
  }
}

function touchingFighter(w: World, it: Item, skipOwner: boolean) {
  for (const f of w.fighters) {
    if (!f.alive || f.gone) continue;
    if (skipOwner && f.id === it.thrownBy) continue;
    if (Math.abs(f.x - it.x) > (f.w + it.w) / 2 || it.y - it.h > f.y || it.y < f.y - f.h) continue;
    return f;
  }
  return null;
}

function updateLive(w: World, it: Item): void {
  const th = weaponDef(it.weaponId).throw;
  if (!th) {
    it.live = false;
    return;
  }
  if (it.fuse >= 0) {
    it.fuse -= DT;
    if (it.fuse <= 0) {
      detonate(w, it);
      return;
    }
  }
  if (!it.stuck) {
    it.vy = Math.min(it.vy + GRAVITY * w.gravityAt(it.x, it.y) * DT, MAX_FALL);
    it.rot += it.vrot * DT;
    const prevY = it.y;
    moveBody(w.map, it, DT, {}, res);
    if (!it.grounded && supportOnProps(w, it, prevY, -1)) res.landed = true;
    const hitSomething = res.wallX !== 0 || res.landed || res.ceil;
    if (th.impact) {
      const f = touchingFighter(w, it, it.age < 0.15);
      if (f) {
        if (th.fire) ignite(w, f, 3, it.thrownBy);
        detonate(w, it);
        return;
      }
      if (hitSomething) {
        detonate(w, it);
        return;
      }
    }
    if (th.sticky && hitSomething) {
      it.stuck = true;
      it.vx = 0;
      it.vy = 0;
      it.vrot = 0;
      w.emit({ t: 'stick', x: it.x, y: it.y });
      return;
    }
    if (res.wallX !== 0) {
      it.vx = -res.impactVx * th.bounce;
      it.vrot = -it.vrot * 0.6;
    }
    if (res.ceil) it.vy = -res.impactVy * th.bounce;
    if (res.landed) it.vx *= 0.7;
    if (res.landed && res.impactVy > 60 && th.bounce > 0.2) {
      it.vy = -res.impactVy * th.bounce;
      it.grounded = false;
      w.emit({ t: 'itemLand', x: it.x, y: it.y, speed: res.impactVy });
    }
    if (it.grounded) {
      it.vx *= th.mine ? 0.5 : 0.86;
      it.vrot *= 0.8;
      if (th.mine) it.rot = 0;
    }
  }

  if (th.mine && (it.grounded || it.stuck)) {
    const was = it.armT;
    it.armT += DT;
    if (was < MINE_ARM && it.armT >= MINE_ARM) w.emit({ t: 'mineArm', x: it.x, y: it.y });
    if (it.armT >= MINE_ARM && it.fuse < 0) {
      for (const f of w.fighters) {
        if (!f.alive || f.gone) continue;
        if (Math.abs(f.x - it.x) < 9 + f.w / 2 && f.y > it.y - 20 && f.y - f.h < it.y + 2) {
          it.fuse = 0.22;
          w.emit({ t: 'mineTrigger', x: it.x, y: it.y });
          break;
        }
      }
    }
  }
  if (it.y > w.killY + 100 || it.age > 120) it.active = false;
}

export function updateItems(w: World): void {
  for (const it of w.items) {
    if (!it.active) continue;
    it.px = it.x;
    it.py = it.y;
    it.age += DT;
    if (it.live) {
      updateLive(w, it);
      continue;
    }
    if (it.noPickupTimer > 0) it.noPickupTimer -= DT;
    it.vy = Math.min(it.vy + GRAVITY * w.gravityAt(it.x, it.y) * DT, MAX_FALL);
    if (!it.grounded) it.rot += it.vrot * DT;
    const prevY = it.y;
    moveBody(w.map, it, DT, {}, res);
    if (!it.grounded && supportOnProps(w, it, prevY, -1)) {
      res.landed = true;
      res.impactVy = 0;
    }
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
      conveyorPush(w, it);
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
