import type { Controller } from '../input/controllers';
import { emptyIntent, type Intent } from '../sim/intent';
import type { World } from '../sim/world';

/**
 * Placeholder sparring partner until the real bot AI (M3): wanders, hops, and swings at anyone
 * close. Reads sim state, outputs Intent — the same contract the real bots will use.
 */
export class WandererController implements Controller {
  readonly label = 'DUMMY';
  private out = emptyIntent();
  private dir = 1;
  private t = 0;

  constructor(
    private getWorld: () => World,
    private id: number,
  ) {}

  poll(): Intent {
    const w = this.getWorld();
    const f = w.fighters[this.id];
    const o = this.out;
    o.jump = false;
    o.attack = false;
    o.kick = false;
    o.interact = false;
    o.cycle = false;
    o.moveY = 0;
    if (!f || !f.alive) return o;
    this.t++;
    let target = null as null | (typeof w.fighters)[number];
    let best = 1e9;
    for (const e of w.fighters) {
      if (e === f || !e.alive) continue;
      const d = Math.abs(e.x - f.x) + Math.abs(e.y - f.y) * 2;
      if (d < best) {
        best = d;
        target = e;
      }
    }
    if (target && best < 160) this.dir = Math.sign(target.x - f.x) || 1;
    else if (this.t % 120 === 0 || (f.vx === 0 && this.t % 20 === 0)) this.dir = -this.dir;
    o.moveX = this.dir * (target && Math.abs(target.x - f.x) < 12 ? 0 : 1);
    if (this.t % 70 === 0 || (f.vx === 0 && f.grounded && this.t % 15 === 0)) o.jump = true;
    if (target && Math.abs(target.x - f.x) < 18 && Math.abs(target.y - f.y) < 14) {
      o.attack = this.t % 12 < 2;
      if (this.t % 90 === 45) o.kick = true;
    }
    if (f.inv[1] || f.inv[2]) {
      if (target && Math.abs(target.y - f.y) < 20 && best < 220) o.attack = this.t % 30 < 3;
    }
    return o;
  }
}
