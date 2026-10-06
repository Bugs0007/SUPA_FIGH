// Bot = a Controller that reads the (pure) sim state and outputs an Intent, exactly like a human.
//
//   perceive  — what enemies it can see/hear (line of sight via the tilemap, no wallhacks), memory
//   think     — every `think` seconds pick a goal by utility: fight / loot / heal / flee / roam
//   act       — per tick: navigation motor (path following, scripted jumps), aiming, throwing,
//               melee, dodging, weapon switching, stuck recovery
// Deterministic given its seed (own Rng), so headless balance sims are reproducible.

import type { Controller } from '../input/controllers';
import { sameTeam } from '../sim/combat';
import { AIM_LIMIT, DT, GRAVITY, TILE } from '../sim/constants';
import { SLOT, THROW_AIM, weaponDef, type ThrowStats } from '../sim/data/weapons';
import { activeWeapon, gunGeometry, throwOrigin, throwVelocity, type Fighter } from '../sim/fighter';
import { hazardNear } from '../sim/gimmicks';
import { heroDef, POWER_ORB } from '../sim/data/heroes';
import { baseAbility, transformed } from '../sim/hero';
import { emptyIntent, type Intent } from '../sim/intent';
import { type Item } from '../sim/item';
import { Rng } from '../sim/rng';
import type { World } from '../sim/world';
import { DIFFICULTIES, PERSONALITIES, weaponAi, type Difficulty, type DifficultyDef, type Personality } from './botData';
import { MANEUVERS, navFor, type NavEdge, type NavGraph, type NavNode } from './nav';

export interface BotOptions {
  difficulty?: Difficulty;
  personality?: Personality;
  seed?: number;
  /** Naruto's shadow clone: only fights (Rasengan), never loots or heals, follows its master */
  clone?: boolean;
}

type Goal =
  | { t: 'fight'; target: number }
  | { t: 'loot'; item: number }
  | { t: 'heal' }
  | { t: 'flee'; x: number; y: number }
  | { t: 'roam'; node: number };

interface Memory {
  x: number;
  y: number;
  t: number;
  seen: boolean;
  /** first time seen in the current sighting (reaction delay) */
  since: number;
}

type Btn = 'jump' | 'attack' | 'kick' | 'interact' | 'cycle' | 'ability';

const STUCK_TIME = 1.1;

export class BotController implements Controller {
  readonly label: string;
  readonly diff: DifficultyDef;
  readonly persona: Personality;
  private out = emptyIntent();
  private prev = emptyIntent();
  private rng: Rng;
  private world: World | null = null;
  private graph: NavGraph | null = null;
  private now = 0;
  private nextThink = 0;
  private goal: Goal = { t: 'roam', node: -1 };
  private mem = new Map<number, Memory>();
  private taps = new Set<Btn>();
  // navigation
  private path: { from: number; edge: NavEdge }[] = [];
  private pathIdx = 0;
  private pathGoal = -1;
  private replanAt = 0;
  private script: { edge: NavEdge; from: number; t: number; air: boolean } | null = null;
  private penalties = new Map<string, number>();
  private progressX = 0;
  private progressY = 0;
  private progressT = 0;
  private stuckLevel = 0;
  // combat
  private aimOffset = 0;
  private aimStart = 0;
  private holdTicks = 0;
  private throwAngle: number | null = null;
  private dodged = new WeakSet<object>();
  private crouchUntil = 0;
  private meleeNext = 0;
  /** loot goal bookkeeping: give up on items we can't get */
  private lootSince = 0;
  private lootId = -1;
  private ignoreItems = new Map<number, number>();
  /** ticks left to hold ABILITY (charging a ki blast) */
  private chargeTicks = 0;
  private hold: 'ability' | 'kick' | 'both' = 'ability';
  private readonly isClone: boolean;

  constructor(
    private getWorld: () => World,
    readonly id: number,
    opts: BotOptions = {},
  ) {
    this.diff = DIFFICULTIES[opts.difficulty ?? 'normal'];
    this.rng = new Rng((opts.seed ?? 1) * 7919 + id * 104729 + 13);
    this.persona = opts.personality ?? PERSONALITIES[this.rng.int(0, PERSONALITIES.length - 1)];
    this.label = 'BOT';
    this.isClone = !!opts.clone;
  }

  // ------------------------------------------------------------------ main

  poll(): Intent {
    const w = this.getWorld();
    if (w !== this.world) this.reset(w);
    const o = this.out;
    o.moveX = 0;
    o.moveY = 0;
    o.jump = false;
    o.attack = false;
    o.kick = false;
    o.interact = false;
    o.cycle = false;
    o.ability = false;
    const f = w.fighters[this.id];
    if (f && f.alive && !f.gone) {
      this.now = w.time;
      this.perceive(w, f);
      if (this.now >= this.nextThink) {
        this.nextThink = this.now + this.diff.think * this.rng.range(0.8, 1.2);
        this.think(w, f);
      }
      this.act(w, f);
      this.applyTaps();
    } else if (f && f.ghost) {
      this.haunt(w, f);
      this.applyTaps();
    }
    this.prev.moveX = o.moveX;
    this.prev.moveY = o.moveY;
    this.prev.jump = o.jump;
    this.prev.attack = o.attack;
    this.prev.kick = o.kick;
    this.prev.interact = o.interact;
    this.prev.cycle = o.cycle;
    this.prev.ability = o.ability;
    return o;
  }

  private reset(w: World): void {
    this.world = w;
    this.graph = navFor(w.def);
    this.mem.clear();
    this.taps.clear();
    this.path = [];
    this.pathGoal = -1;
    this.script = null;
    this.penalties.clear();
    this.goal = { t: 'roam', node: -1 };
    this.nextThink = 0;
    this.throwAngle = null;
    this.holdTicks = 0;
  }

  /** Request a button press; it's delivered as a clean edge (released the tick before if needed). */
  private tap(b: Btn): void {
    this.taps.add(b);
  }

  private applyTaps(): void {
    for (const b of this.taps) {
      if (this.prev[b]) {
        this.out[b] = false; // release first, press next tick
      } else {
        this.out[b] = true;
        this.taps.delete(b);
      }
    }
  }

  /** Dead bot in Brawl: drift toward the nearest living enemy and BOO them when it's charged. */
  private haunt(w: World, f: Fighter): void {
    let best: Fighter | null = null;
    let bestD = Infinity;
    for (const e of w.fighters) {
      if (!e.alive || e.gone || sameTeam(e, f)) continue;
      const d = Math.hypot(e.x - f.gx, e.y - 10 - f.gy);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (!best) return;
    const dx = best.x - f.gx;
    const dy = best.y - 12 - f.gy;
    this.out.moveX = Math.abs(dx) > 8 ? Math.sign(dx) : 0;
    this.out.moveY = Math.abs(dy) > 8 ? Math.sign(dy) : 0;
    if (bestD < 36 && f.ghostCd <= 0 && this.rng.chance(0.05)) this.tap('attack');
  }

  // ------------------------------------------------------------------ perception

  private perceive(w: World, f: Fighter): void {
    const eyeY = f.y - f.h + 4;
    for (const e of w.fighters) {
      if (e === f || !e.alive || e.gone || sameTeam(e, f)) {
        this.mem.delete(e.id);
        continue;
      }
      const dx = e.x - f.x;
      const dy = e.y - e.h / 2 - eyeY;
      const d = Math.hypot(dx, dy);
      let sees = d < 70; // close enough to hear/feel
      if (!sees && d < this.diff.sight && (this.now * 60 + e.id) % 4 < 1) {
        sees = w.map.clearShot(f.x, eyeY, e.x, e.y - e.h / 2);
      } else if (!sees && d < this.diff.sight) {
        const m = this.mem.get(e.id);
        sees = !!m && m.seen && this.now - m.t < 0.1; // keep last tick's result between checks
      }
      if (!sees && d < 650 && w.time - e.lastShotTime < 0.25) sees = true; // heard a shot
      if (w.suddenDeath > 0) sees = true; // sudden death reveals everyone
      const m = this.mem.get(e.id);
      if (sees) {
        this.mem.set(e.id, { x: e.x, y: e.y, t: this.now, seen: true, since: m && m.seen ? m.since : this.now });
      } else if (m) {
        m.seen = false;
        if (this.now - m.t > 5) this.mem.delete(e.id);
      }
    }
  }

  private visible(id: number): boolean {
    const m = this.mem.get(id);
    return !!m && m.seen && this.now - m.since >= this.diff.reaction;
  }

  // ------------------------------------------------------------------ decisions

  private think(w: World, f: Fighter): void {
    const g = this.graph!;
    const here = g.nearest(f.x, f.y);
    if (!here) return;
    this.refreshBlocked(w);
    const costs = g.costsFrom(here.id, 20, this.edgeCost);

    // danger first
    const danger = this.danger(w, f);
    if (danger) {
      this.goal = { t: 'flee', x: danger.x, y: danger.y };
      return;
    }

    // heal
    const kit = f.inv[SLOT.GADGET];
    if (!this.isClone && kit?.id === 'medkit' && f.hp < 35 + 30 * this.persona.caution) {
      this.goal = { t: 'heal' };
      return;
    }

    // best target: known enemies, closer & weaker & visible preferred
    let target = -1;
    let targetScore = -Infinity;
    for (const [id, m] of this.mem) {
      const e = w.fighters[id];
      if (!e || !e.alive) continue;
      const node = g.nearest(m.x, m.y);
      const travel = node ? costs[node.id] : Infinity;
      const dist = Math.hypot(m.x - f.x, m.y - f.y);
      const score = -dist / 100 - Math.min(travel, 20) * 0.5 + (m.seen ? 2 : 0) - e.hp / 50 - (this.now - m.t);
      if (score > targetScore) {
        targetScore = score;
        target = id;
      }
    }

    // best item: value gain over what we'd replace, divided by travel time
    let item = -1;
    let itemScore = 0;
    const mine = this.bestWeaponValue(f);
    for (let i = 0; i < w.items.length && !this.isClone; i++) {
      const it = w.items[i];
      if (!it.active || it.live || it.thrownDmg > 0) continue;
      if ((this.ignoreItems.get(it.id) ?? -1) > this.now) continue;
      const def = weaponDef(it.weaponId);
      if (def.gun && it.ammo <= 0) continue;
      const node = g.nearest(it.x, it.y);
      if (!node || costs[node.id] === Infinity) continue;
      const ai = weaponAi(it.weaponId);
      const cur = f.inv[def.slot];
      let gain = ai.value - (cur ? weaponAi(cur.id).value : 0);
      if (def.powerup) gain = ai.value;
      // power orbs: heroes want every one (each is another form level); anyone else still takes them (and denies them)
      if (it.weaponId === POWER_ORB) gain = f.hero ? ai.value + 30 : ai.value;
      if (def.gadget?.kind === 'medkit') gain += (100 - f.hp) * 0.4;
      if (ai.kind === 'melee') gain += this.persona.meleeLove;
      if (gain <= 3) continue;
      const score = (gain * (0.4 + this.persona.greed)) / (1 + costs[node.id] * 1.5);
      if (score > itemScore) {
        itemScore = score;
        item = i;
      }
    }

    const fightScore = target >= 0 ? (8 + mine * 0.25) * (0.4 + this.persona.aggression) * (this.visible(target) ? 1.5 : 1) : 0;

    // mode objective (King of the Hill): get on it and stay on it
    const obj = w.objective;
    if (obj) {
      const inside = f.x >= obj.x && f.x <= obj.x + obj.w && f.y - f.h / 2 >= obj.y && f.y - f.h / 2 <= obj.y + obj.h;
      const closeFight = target >= 0 && this.visible(target) && Math.hypot((this.mem.get(target)?.x ?? 0) - f.x, (this.mem.get(target)?.y ?? 0) - f.y) < 120;
      if (!closeFight && (!inside || target < 0 || this.rng.chance(0.7))) {
        const n = g.nearest(obj.x + obj.w / 2, obj.y + obj.h);
        if (n) {
          this.goal = { t: 'roam', node: n.id };
          return;
        }
      }
    }
    // unarmed bots want a weapon badly (unless the enemy is right here)
    const close = target >= 0 && Math.hypot((this.mem.get(target)?.x ?? 0) - f.x, (this.mem.get(target)?.y ?? 0) - f.y) < 40;
    const lootScore = item >= 0 ? itemScore * (mine === 0 && !close ? 4 : mine < 30 ? 2 : 1) : 0;

    if (target >= 0 && fightScore >= lootScore) this.goal = { t: 'fight', target };
    else if (item >= 0) {
      const id = w.items[item].id;
      if (id !== this.lootId) {
        this.lootId = id;
        this.lootSince = this.now;
      } else if (this.now - this.lootSince > 8) {
        // can't get it (unreachable since the map changed, someone camping it...): forget it a while
        this.ignoreItems.set(id, this.now + 15);
        this.lootId = -1;
        this.goal = { t: 'roam', node: -1 };
        return;
      }
      this.goal = { t: 'loot', item: id };
    }
    else if (this.isClone) {
      // no enemy in mind: stay with the master
      const m = w.fighters[f.master];
      const n = m && m.alive ? g.nearest(m.x, m.y) : null;
      this.goal = { t: 'roam', node: n ? n.id : -1 };
    } else if (this.goal.t !== 'roam' || this.goal.node < 0 || this.atNode(f, this.goal.node)) {
      // roam toward weapon spawns and random reachable spots
      const pts = w.parsed.weaponSpawns;
      let node: NavNode | null = null;
      if (pts.length > 0 && this.rng.chance(0.6)) {
        const p = pts[this.rng.int(0, pts.length - 1)];
        node = g.nearest(p.x, p.y);
      }
      if (!node) {
        const cands = g.nodes.filter((n) => n.stand && costs[n.id] < 20);
        node = cands.length ? cands[this.rng.int(0, cands.length - 1)] : null;
      }
      this.goal = { t: 'roam', node: node ? node.id : -1 };
    }
  }

  private bestWeaponValue(f: Fighter): number {
    let best = 0;
    for (const it of f.inv) {
      if (!it) continue;
      const def = weaponDef(it.id);
      if (def.gun && it.ammo <= 0) continue;
      best = Math.max(best, weaponAi(it.id).value);
    }
    return best;
  }

  /** Something about to explode / burn next to us: returns its position. */
  private danger(w: World, f: Fighter): { x: number; y: number } | null {
    const cy = f.y - f.h / 2;
    const hz = hazardNear(w, f);
    if (hz) return { x: hz.x + hz.w / 2, y: hz.y + hz.h / 2 };
    for (const it of w.items) {
      if (!it.active || !it.live) continue;
      const th = weaponDef(it.weaponId).throw;
      if (!th) continue;
      const r = (th.explosion?.radius ?? 30) + 12;
      const d = Math.hypot(it.x - f.x, it.y - cy);
      if (d > r) continue;
      if (it.fuse >= 0 && it.fuse < 2.2) return { x: it.x, y: it.y };
      if (th.impact && it.thrownBy !== f.id && !it.grounded) return { x: it.x, y: it.y };
    }
    for (const p of w.props) {
      if (p.active && p.fuse >= 0 && Math.hypot(p.x - f.x, p.y - f.y) < (p.def.explosion?.radius ?? 40) + 10) return { x: p.x, y: p.y };
    }
    if (f.burn <= 0) {
      for (const p of w.fires) if (p.active && Math.abs(p.x - f.x) < 14 && Math.abs(p.y - f.y) < 14) return { x: p.x, y: p.y };
    }
    return null;
  }

  private atNode(f: Fighter, node: number): boolean {
    const n = this.graph!.nodeUnder(f.x, f.y, f.w / 2);
    return !!n && n.id === node;
  }

  /** Nodes currently occupied by props (refreshed each decision): passable, but awkward. */
  private blocked = new Set<number>();
  private hazardNodes = new Set<number>();

  private refreshBlocked(w: World): void {
    this.blocked.clear();
    const g = this.graph!;
    // hazard footprints (whole sweep) are always expensive: timing is hard to predict
    for (const h of w.gimmicks.hazards) {
      const d = h.def;
      for (let ty = Math.floor(d.y); ty < Math.ceil(d.y + d.h) + 1; ty++) {
        for (let tx = Math.floor(d.x); tx < Math.ceil(d.x + d.w + (d.sweep ?? 0)); tx++) {
          const n = g.at(tx, ty);
          if (n) this.hazardNodes.add(n.id);
        }
      }
    }
    for (const p of w.props) {
      if (!p.active || p.carriedBy >= 0 || !p.grounded) continue;
      const n = g.nodeUnder(p.x, p.y, p.w / 2);
      if (n) this.blocked.add(n.id);
    }
  }

  /** Path cost additions: edges that failed before, and cells blocked by props. */
  private edgeCost = (from: number, e: NavEdge): number => {
    return (this.penalties.get(from + ':' + e.to) ?? 0) + (this.blocked.has(e.to) ? 1.5 : 0) + (this.hazardNodes.has(e.to) ? 3 : 0);
  };

  // ------------------------------------------------------------------ per-tick behavior

  private act(w: World, f: Fighter): void {
    // states we must react to regardless of goals
    if (f.state === 'grabbed') {
      // mash to break free
      if (w.tick % 2 === 0) this.out.attack = true;
      else this.out.jump = true;
      return;
    }
    if (f.state === 'grabbing') {
      if (f.grabTimer > 0.15 + this.rng.next() * 0.3) {
        this.out.moveY = this.rng.chance(0.4) ? -1 : 0;
        this.tap('attack');
      }
      return;
    }
    if (f.carry >= 0) {
      this.tap('attack'); // throw whatever we picked up
      return;
    }
    if (f.state === 'ledge' && !this.script) {
      this.out.moveX = f.facing;
      return;
    }
    if (f.burn > 0 && f.grounded && f.state === 'normal' && this.rng.chance(0.08)) {
      // stop, drop and roll
      this.out.moveX = f.facing;
      this.out.moveY = 1;
      return;
    }
    if (this.dodge(w, f)) return;

    switch (this.goal.t) {
      case 'fight':
        this.fight(w, f, this.goal.target);
        break;
      case 'loot': {
        const id = this.goal.item;
        const it = w.items.find((i) => i.id === id && i.active);
        if (!it) {
          this.nextThink = this.now;
          break;
        }
        this.loot(w, f, it);
        break;
      }
      case 'heal':
        this.heal(f);
        break;
      case 'flee':
        this.flee(f, this.goal.x, this.goal.y);
        break;
      case 'roam': {
        const n = this.goal.node >= 0 ? this.graph!.nodes[this.goal.node] : null;
        if (n) this.navigate(w, f, n.x, n.y);
        break;
      }
    }
  }

  // ------------------------------------------------------------------ combat

  private fight(w: World, f: Fighter, targetId: number): void {
    const e = w.fighters[targetId];
    const m = this.mem.get(targetId);
    if (!e || !e.alive || !m) {
      this.nextThink = this.now;
      return;
    }
    const seen = this.visible(targetId);
    const tx = seen ? e.x : m.x;
    const ty = seen ? e.y : m.y;
    const dx = tx - f.x;
    const dist = Math.hypot(dx, ty - f.y);

    // live C4 near the target: blow it
    const c4 = f.inv[SLOT.THROWABLE];
    if (c4?.id === 'c4' && seen) {
      const near = w.items.some((it) => it.active && it.live && it.weaponId === 'c4' && it.thrownBy === f.id && Math.hypot(it.x - e.x, it.y - e.y) < 45);
      const meClose = w.items.some((it) => it.active && it.live && it.weaponId === 'c4' && it.thrownBy === f.id && Math.hypot(it.x - f.x, it.y - f.y) < 70);
      if (near && !meClose) {
        if (this.select(w, f, SLOT.THROWABLE)) this.tap('attack');
        return;
      }
    }

    // hero special (Kurama chakra bomb, Gear 2 rubber bullet, Super Saiyan ki blast)
    if (this.useSpecial(w, f, e, seen)) return;

    // keep throwing if we're mid-throw
    const act = activeWeapon(f);
    if (act.throw && f.state === 'aim' && f.aimHeld) {
      this.throwAt(w, f, act.throw, e);
      return;
    }

    const slot = this.chooseSlot(w, f, dist, seen, e);
    if (slot !== f.active) {
      if (f.state === 'aim' && f.aimHeld) {
        this.out.attack = false; // let go first
        return;
      }
      this.select(w, f, slot);
      this.navigate(w, f, tx, ty);
      return;
    }

    const def = activeWeapon(f);
    const ai = weaponAi(def.id);
    const want = ai.range[1] * 0.6 * this.persona.rangeBias;
    if (def.throw && seen) {
      this.throwAt(w, f, def.throw, e);
      return;
    }
    if (def.gun && seen && dist <= ai.range[1] * 1.1 && dist >= ai.range[0] * 0.7) {
      this.shoot(w, f, e);
      return;
    }
    if (f.state === 'aim' && f.aimHeld) {
      this.out.attack = false;
      return;
    }
    if (!def.gun && !def.throw) {
      // melee (or fists)
      const reach = ai.range[1];
      const close = Math.abs(dx) < reach + 4 && Math.abs(e.y - f.y) < 14 && seen;
      if (close) {
        const face = dx >= 0 ? 1 : -1;
        if (f.facing !== face) this.out.moveX = face;
        if (this.now >= this.meleeNext && f.state === 'normal') {
          this.meleeNext = this.now + this.rng.range(0.08, 0.22) + this.diff.reaction * 0.3;
          const r = this.rng.next();
          if (r < 0.12 && f.kickCooldown <= 0 && !f.hero) this.tap('kick'); // (a hero's kick button is ability 2)
          else if (r < 0.2 && def.id === 'fists' && e.state === 'normal') this.tap('interact');
          else this.tap('attack');
        }
        return;
      }
      this.navigate(w, f, tx, ty);
      return;
    }
    // gun but out of range / not visible: move closer (or to a spot at the preferred distance)
    if (seen && dist < want * 0.5 && ai.range[0] > 0) {
      this.flee(f, e.x, e.y);
      return;
    }
    this.navigate(w, f, tx, ty);
  }

  /**
   * Hero moves (D51, D58): super (both buttons) when transformed and ready, then ability 2 (kick button:
   * Kamehameha charge / clone rush / gatling), then ability 1 - each only when the target is level with
   * the bot, in the move's range band and in line of sight. Returns true while busy.
   */
  private useSpecial(w: World, f: Fighter, e: Fighter, seen: boolean): boolean {
    if (this.chargeTicks > 0) {
      this.chargeTicks--;
      const on = this.chargeTicks > 0;
      this.out.ability = on && this.hold !== 'kick';
      this.out.kick = on && this.hold !== 'ability';
      if (f.state === 'special' && f.facing !== (e.x >= f.x ? 1 : -1)) this.out.moveX = e.x >= f.x ? 1 : -1;
      return true;
    }
    if (f.state === 'special') return true;
    const h = heroDef(f.hero);
    if (!h || !seen || f.state !== 'normal' || !f.grounded || f.carry >= 0 || e.state === 'roll' || e.invuln > 0.15) return false;
    const dx = e.x - f.x;
    const dist = Math.abs(dx);
    const dy = Math.abs(e.y - f.y);
    const clear = () => w.map.clearShot(f.x, f.y - 15, e.x, e.y - 12);
    const face = dx >= 0 ? 1 : -1;
    const go = (hold: 'ability' | 'kick' | 'both', ticks: number) => {
      this.out.moveX = face;
      this.hold = hold;
      this.chargeTicks = ticks;
      this.out.ability = hold !== 'kick';
      this.out.kick = hold !== 'ability';
      return true;
    };
    const roll = (k: number) => this.rng.chance(k + this.diff.throwChance * 0.2);
    if (this.isClone) return this.useBase(w, f, e, seen);
    // super
    if (transformed(f) && f.specialCd <= 0) {
      const reach = h.super.kind === 'fist' ? (h.super.fist?.range ?? 150) : h.super.kind === 'beam' ? 300 : 230;
      if (dist >= 40 && dist <= reach && dy <= (h.super.kind === 'beam' ? 20 : 12) && clear() && roll(0.2)) return go('both', 4);
    }
    // ability 2
    const s2 = h.second;
    if (f.secondCd <= 0) {
      if (s2.kind === 'beam' && dist >= 50 && dist <= (s2.beam?.range ?? 200) && dy <= 20 && clear() && roll(0.12)) {
        return go('kick', Math.round(this.rng.range(0.3, 1.2) * 60));
      }
      if (s2.kind === 'clones' && f.cloneCount === 0 && dist >= 40 && dist <= 220 && dy <= 30 && clear() && roll(0.1)) return go('kick', 2);
      if (s2.kind === 'gatling' && dist >= 14 && dist <= (s2.gatling?.range ?? 60) && dy <= 14 && clear() && roll(0.15)) return go('kick', 2);
    }
    return this.useBase(w, f, e, seen);
  }

  /**
   * Hero base abilities (D51): Rasengan dash (held until it lands), Gum-Gum Pistol (held while the arm
   * reaches), Instant Transmission - when the target is in line at the right distance with nothing between.
   */
  private useBase(w: World, f: Fighter, e: Fighter, seen: boolean): boolean {
    const b = baseAbility(f);
    if (!b || f.baseCd > 0 || (b.charges && f.baseUsed >= b.charges.max) || !seen || f.state !== 'normal' || !f.grounded || f.carry >= 0) return false;
    const dx = e.x - f.x;
    const dist = Math.abs(dx);
    const dy = Math.abs(e.y - f.y);
    let band: [number, number];
    let level = 8;
    if (b.kind === 'rasengan') band = [24, Math.min(240, (b.dash?.speed ?? 300) * 0.8)];
    else if (b.kind === 'pistol') band = [26, (b.stretch?.maxRange ?? 100) - 40];
    else {
      band = [56, (b.blink?.range ?? 100) + 10];
      level = 16;
    }
    if (dist < band[0] || dist > band[1] || dy > level || e.state === 'roll' || e.invuln > 0.15) return false;
    if (!w.map.clearShot(f.x, f.y - 15, e.x, e.y - 12)) return false;
    if (!this.rng.chance(0.12 + this.diff.throwChance * 0.2)) return false;
    this.out.moveX = dx >= 0 ? 1 : -1;
    // how long to keep the button down: until the dash / arm has had time to reach the target
    let ticks = 1;
    if (b.kind === 'rasengan' && b.dash) ticks = Math.min(Math.ceil(b.dash.maxTime * 60), Math.ceil((b.dash.windup + dist / b.dash.speed + 0.2) * 60));
    else if (b.kind === 'pistol' && b.stretch) ticks = Math.ceil(((dist + 10) / (b.stretch.extendSpeed ?? 700) + 0.05) * 60);
    this.chargeTicks = ticks;
    this.hold = 'ability';
    this.out.ability = true;
    return true;
  }

  /** Which slot to fight with at this distance. */
  private chooseSlot(w: World, f: Fighter, dist: number, seen: boolean, e: Fighter): number {
    let best: number = SLOT.MELEE;
    let bestScore = -Infinity;
    for (let s = 0; s < 5; s++) {
      const it = f.inv[s];
      const id = it ? it.id : 'fists';
      if (s !== SLOT.MELEE && !it) continue;
      const def = weaponDef(id);
      if (def.gadget || def.powerup) continue;
      if (def.gun && it!.ammo <= 0) continue;
      const ai = weaponAi(id);
      let score = ai.value;
      const [lo, hi] = ai.range;
      if (ai.kind === 'melee') score += this.persona.meleeLove - Math.max(0, dist - 40) * 0.3;
      else if (dist > hi) score -= (dist - hi) * 0.15;
      else if (dist < lo) score -= (lo - dist) * 0.6;
      if (ai.kind === 'explosive' && dist < 70) score -= 80; // don't blow ourselves up
      if (def.throw) {
        if (!it || it.ammo <= 0 || !seen || dist < lo || dist > hi || Math.abs(e.y - f.y) > 90) continue;
        if (def.throw.remote && w.items.some((i) => i.active && i.live && i.weaponId === id && i.thrownBy === f.id)) continue;
        // only sometimes, decided per think
        if (this.rng.next() > this.diff.throwChance * this.persona.throwLove * DT * 8) continue;
        score += 30;
      }
      if (s === f.active) score += 6; // hysteresis
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    return best;
  }

  /** Press cycle until the slot is active. Returns true when it is. */
  private select(w: World, f: Fighter, slot: number): boolean {
    if (f.active === slot) return true;
    if (slot !== SLOT.MELEE && !f.inv[slot]) return false;
    if (f.state === 'normal' || f.state === 'crouch' || f.state === 'climb') this.tap('cycle');
    void w;
    return false;
  }

  private shoot(w: World, f: Fighter, e: Fighter): void {
    const def = activeWeapon(f);
    const g = def.gun!;
    const face = e.x >= f.x ? 1 : -1;
    if (f.state !== 'aim') {
      if (f.state !== 'normal' && f.state !== 'crouch') return;
      if (f.facing !== face) {
        this.out.moveX = face; // turn first
        return;
      }
      this.out.attack = !this.prev.attack ? true : false;
      this.aimOffset = this.rng.range(-1, 1) * this.diff.aimError;
      this.aimStart = this.now;
      return;
    }
    if (!f.aimHeld) {
      // between semi-auto shots: re-press
      this.out.attack = !this.prev.attack;
      this.aimOffset = this.rng.range(-1, 1) * this.diff.aimError;
      return;
    }
    if (f.facing !== face) this.out.moveX = face;
    const geo = gunGeometry(f, def);
    let tx = e.x;
    let ty = e.y - e.h * 0.55;
    const speed = g.bulletSpeed;
    const tof = Math.hypot(tx - geo.shoulderX, ty - geo.shoulderY) / speed;
    if (speed < 700) {
      tx += e.vx * tof * 0.8;
      if (g.gravity) ty -= 0.5 * g.gravity * tof * tof;
    }
    const want = clamp(Math.atan2(ty - geo.shoulderY, Math.abs(tx - geo.shoulderX)) + this.aimOffset, -AIM_LIMIT, AIM_LIMIT);
    const diff = want - f.aimAngle;
    this.out.moveY = Math.abs(diff) < 0.006 ? 0 : clamp(diff * 7, -1, 1);
    const onTarget = Math.abs(diff) < this.diff.aimTolerance;
    // don't shoot a wall in our face with explosives
    const blocked = !w.map.clearShot(geo.shoulderX, geo.shoulderY, e.x, e.y - e.h / 2);
    if (g.auto) {
      this.out.attack = !blocked || g.projectile === 'flame';
      if (!onTarget && Math.abs(diff) > 0.25) this.out.attack = true; // keep aiming
      return;
    }
    // semi-auto: release to fire once on target (and off cooldown)
    const ready = onTarget && f.fireCooldown <= 0 && !blocked && this.now - this.aimStart > this.diff.reaction * 0.5;
    this.out.attack = !ready;
  }

  /** Hold to aim/charge a throwable, release on the computed arc. */
  private throwAt(w: World, f: Fighter, th: ThrowStats, e: Fighter): void {
    const face = e.x >= f.x ? 1 : -1;
    if (f.state !== 'aim') {
      if (f.state !== 'normal' && f.state !== 'crouch') return;
      if (f.facing !== face) {
        this.out.moveX = face;
        return;
      }
      if (!this.prev.attack) {
        this.out.attack = true;
        this.holdTicks = 0;
        this.throwAngle = null;
      }
      return;
    }
    if (!f.aimHeld) return;
    this.holdTicks++;
    this.out.attack = true;
    if (th.mine) {
      if (this.holdTicks > 2) this.out.attack = false;
      return;
    }
    if (this.throwAngle === null || this.holdTicks % 10 === 0) {
      const err = this.rng.range(-1, 1) * this.diff.throwError;
      this.throwAngle = solveThrow(w, f, th, e.x + e.vx * 0.4 + err, e.y);
    }
    if (this.throwAngle === null) {
      this.out.attack = this.holdTicks < 3; // no arc: lob it anyway
      return;
    }
    const diff = this.throwAngle - f.aimAngle;
    this.out.moveY = Math.abs(diff) < 0.01 ? 0 : clamp(diff * 7, -1, 1);
    const charged = this.holdTicks * DT >= THROW_AIM.rampTime;
    const cookSafe = !th.cook || f.cook > 0.8;
    if ((charged && Math.abs(diff) < 0.05) || !cookSafe || this.holdTicks > 90) this.out.attack = false;
  }

  /** Incoming projectile: crouch under it or jump over it (skill-limited). Returns true if busy. */
  private dodge(w: World, f: Fighter): boolean {
    if (this.now < this.crouchUntil && f.grounded && f.state !== 'aim') {
      this.out.moveY = 1;
      return true;
    }
    if (f.state !== 'normal' && f.state !== 'crouch') return false;
    const cx = f.x;
    const cy = f.y - f.h / 2;
    for (const b of w.bullets) {
      if (!b.active || b.owner === f.id || this.dodged.has(b)) continue;
      const sp2 = b.vx * b.vx + b.vy * b.vy;
      if (sp2 < 1) continue;
      const t = clamp(((cx - b.x) * b.vx + (cy - b.y) * b.vy) / sp2, 0, 0.4);
      if (t < 0.06) continue;
      const px = b.x + b.vx * t - cx;
      const py = b.y + b.vy * t - cy;
      if (Math.hypot(px, py) > 13) continue;
      this.dodged.add(b);
      if (!this.rng.chance(this.diff.dodge)) continue;
      const horizontal = Math.abs(b.vy) < Math.abs(b.vx) * 0.35;
      if (horizontal && f.grounded && b.kind !== 'rocket' && b.y < f.y - 10) {
        this.crouchUntil = this.now + 0.35;
        this.out.moveY = 1;
      } else if (f.grounded) {
        this.tap('jump');
        this.out.moveX = this.rng.sign();
      }
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ other goals

  private loot(w: World, f: Fighter, it: Item): void {
    const near = Math.abs(it.x - f.x) < f.w / 2 + it.w / 2 + 8 && it.y > f.y - f.h - 8 && it.y - it.h < f.y + 8;
    if (near) {
      const def = weaponDef(it.weaponId);
      if (f.inv[def.slot] && !def.powerup) this.tap('interact');
      this.out.moveX = Math.sign(it.x - f.x);
      if (it.y < f.y - 6 && f.grounded && f.state === 'normal') this.tap('jump'); // it's on a ledge/box
      this.trackProgress(w, f, true);
      return;
    }
    this.navigate(w, f, it.x, it.y);
  }

  private heal(f: Fighter): void {
    if (f.inv[SLOT.GADGET]?.id !== 'medkit') {
      this.nextThink = this.now;
      return;
    }
    if (f.state === 'aim' && f.aimHeld) {
      this.out.attack = false;
      return;
    }
    if (f.active !== SLOT.GADGET) this.tap('cycle');
    else this.tap('attack');
  }

  /** Run to the reachable node that gets us farthest from (x, y) quickly. */
  private flee(f: Fighter, x: number, y: number): void {
    const g = this.graph!;
    const here = g.nearest(f.x, f.y);
    if (!here) return;
    if (f.state === 'aim' && f.aimHeld) this.out.attack = false;
    let best: NavNode | null = null;
    let bestScore = -Infinity;
    const costs = g.costsFrom(here.id, 2.5, this.edgeCost);
    for (const n of g.nodes) {
      if (!n.stand || costs[n.id] === Infinity) continue;
      const score = Math.hypot(n.x - x, n.y - y) - costs[n.id] * 60;
      if (score > bestScore) {
        bestScore = score;
        best = n;
      }
    }
    if (best) this.navigate(this.world!, f, best.x, best.y);
  }

  // ------------------------------------------------------------------ navigation motor

  /** Move toward a world point using the nav graph. */
  private navigate(w: World, f: Fighter, x: number, y: number): void {
    const g = this.graph!;
    if (f.state === 'aim' && f.aimHeld) {
      this.out.attack = false;
      return;
    }
    if (this.script) {
      this.runScript(f);
      return;
    }
    const goal = g.nearest(x, y);
    if (!goal) return;
    const here = this.currentNode(f);

    // near the target on the same node: walk straight at it
    if (here && here.id === goal.id) {
      if (Math.abs(x - f.x) > 3) this.out.moveX = Math.sign(x - f.x);
      this.path = [];
      this.trackProgress(w, f, true);
      return;
    }
    if (!here && f.grounded && f.state !== 'climb') {
      // standing somewhere the graph doesn't know (on a prop, a corpse...): walk to the nearest node
      const n = g.nearest(f.x, f.y);
      if (n) this.out.moveX = Math.sign(n.x - f.x) || 1;
      this.trackProgress(w, f, false);
      return;
    }
    if (!here || !f.grounded) {
      // airborne or between cells: keep drifting toward the next waypoint
      const step = this.path[this.pathIdx];
      if (step) this.out.moveX = Math.sign(g.nodes[step.edge.to].x - f.x) || 0;
      if (f.state === 'climb' && step) this.climbToward(f, g.nodes[step.edge.to]);
      if (f.state !== 'climb') return;
    }

    const needPlan = goal.id !== this.pathGoal || this.pathIdx >= this.path.length || this.now >= this.replanAt;
    if (needPlan && here) {
      const p = g.path(here.id, goal.id, this.edgeCost);
      this.pathGoal = goal.id;
      this.replanAt = this.now + 1.2;
      if (!p) {
        this.path = [];
        return;
      }
      this.path = p;
      this.pathIdx = 0;
    }
    // skip steps we've already completed (or that start where we stand)
    if (here) {
      for (let i = this.pathIdx; i < this.path.length; i++) {
        if (this.path[i].from === here.id) {
          this.pathIdx = i;
          break;
        }
        if (this.path[i].edge.to === here.id) this.pathIdx = i + 1;
      }
    }
    const step = this.path[this.pathIdx];
    if (!step) return;
    const from = g.nodes[step.from];
    const to = g.nodes[step.edge.to];
    if (here && here.id !== step.from && here.id !== to.id) {
      this.replanAt = this.now; // off the path
      return;
    }
    const e = step.edge;
    switch (e.kind) {
      case 'walk':
        if (f.state === 'climb') {
          this.out.moveX = e.dir; // step off the ladder
          this.out.moveY = 0;
        } else this.out.moveX = Math.sign(to.x - f.x) || e.dir;
        break;
      case 'climb':
        this.climbToward(f, to);
        break;
      default:
        // scripted jump/fall/drop: line up on the node center, stand still, then replay the script
        if (this.align(f, from)) this.script = { edge: e, from: step.from, t: 0, air: false };
        break;
    }
    this.trackProgress(w, f, false);
  }

  private currentNode(f: Fighter): NavNode | null {
    const g = this.graph!;
    if (f.state === 'climb') return g.at(Math.floor(f.x / TILE), Math.floor((f.y - 1) / TILE));
    if (!f.grounded) return null;
    const n = g.nodeUnder(f.x, f.y, f.w / 2);
    if (n) return n;
    // standing on a prop / corpse: count as the node underneath it
    const below = g.nearest(f.x, f.y);
    return below && below.y - f.y < 24 && below.y >= f.y ? below : null;
  }

  private climbToward(f: Fighter, to: NavNode): void {
    if (f.state !== 'climb') {
      if (Math.abs(f.x - to.x) > 4) {
        this.out.moveX = Math.sign(to.x - f.x);
        return;
      }
      this.out.moveY = to.y < f.y ? -1 : 1;
      return;
    }
    const dy = to.y - f.y;
    this.out.moveY = Math.abs(dy) < 1 ? 0 : Math.sign(dy);
  }

  /** Get to the node center with ~zero velocity. Returns true when ready. */
  private align(f: Fighter, n: NavNode): boolean {
    const dx = n.x - f.x;
    if (Math.abs(dx) > 5) {
      this.out.moveX = Math.sign(dx);
      return false;
    }
    if (Math.abs(f.vx) > 20) return false; // let it decelerate
    if (Math.abs(dx) > 2.5) {
      if ((this.now * 60) % 3 < 1) this.out.moveX = Math.sign(dx); // nudge
      return false;
    }
    return f.grounded && f.state === 'normal';
  }

  private runScript(f: Fighter): void {
    const s = this.script!;
    const mv = MANEUVERS[s.edge.m];
    mv.policy(s.t, f, s.edge.dir, this.out);
    s.t++;
    if (!f.grounded) s.air = true;
    const done = (s.air && f.grounded && f.state === 'normal') || s.t > 160 || (f.state !== 'normal' && f.state !== 'ledge' && f.state !== 'ledgeClimb');
    if (!done) return;
    this.script = null;
    const here = this.graph!.nodeUnder(f.x, f.y, f.w / 2);
    if (!here || here.id !== s.edge.to) {
      // didn't land where the graph said (something changed, or we got hit): avoid this edge a while
      const key = s.from + ':' + s.edge.to;
      this.penalties.set(key, (this.penalties.get(key) ?? 0) + 2);
      this.replanAt = this.now;
    } else if (this.pathIdx < this.path.length) {
      this.pathIdx++;
    }
  }

  /** Stuck detection: no progress for a while → jump, then penalize the edge and re-plan. */
  private trackProgress(w: World, f: Fighter, direct: boolean): void {
    if (f.state !== 'normal' && f.state !== 'climb') {
      this.progressT = this.now;
      return;
    }
    if (Math.hypot(f.x - this.progressX, f.y - this.progressY) > 4) {
      this.progressX = f.x;
      this.progressY = f.y;
      this.progressT = this.now;
      this.stuckLevel = 0;
      return;
    }
    const stuck = this.now - this.progressT;
    if (stuck > STUCK_TIME && this.stuckLevel === 0) {
      this.stuckLevel = 1;
      this.tap('jump');
    } else if (stuck > STUCK_TIME * 2.2 && this.stuckLevel === 1) {
      this.stuckLevel = 2;
      const step = this.path[this.pathIdx];
      if (step) this.penalties.set(step.from + ':' + step.edge.to, (this.penalties.get(step.from + ':' + step.edge.to) ?? 0) + 5);
      this.path = [];
      this.replanAt = this.now;
      if (direct) this.goal = { t: 'roam', node: -1 };
      this.nextThink = this.now;
    } else if (stuck > STUCK_TIME * 4) {
      // still stuck: random walk + jump for a moment
      this.progressT = this.now;
      this.stuckLevel = 0;
      this.goal = { t: 'roam', node: -1 };
      this.tap('jump');
    }
    void w;
  }

  /** Debug info for overlays/tests. */
  debug(): { goal: string; path: number; stuck: number; persona: string; info: string } {
    let info = '';
    const w = this.world;
    if (w && this.goal.t === 'loot') {
      const id = this.goal.item;
      const it = w.items.find((i) => i.id === id);
      const n = it && this.graph!.nearest(it.x, it.y);
      if (it) info = `${it.weaponId}@${it.x.toFixed(1)},${it.y.toFixed(1)} g=${it.grounded} node=${n ? n.tx + ',' + n.ty : '-'}`;
    }
    return { goal: this.goal.t, path: Math.max(0, this.path.length - this.pathIdx), stuck: this.stuckLevel, persona: this.persona.name, info };
  }
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/**
 * Pick the aim angle (local, + = down) that lands a full-power throw closest to (x, y).
 * Simulates the same ballistic arc the arc preview uses. null if nothing lands near.
 */
export function solveThrow(w: World, f: Fighter, th: ThrowStats, x: number, y: number): number | null {
  const o = throwOrigin(f);
  const grav = GRAVITY * w.gravityScale;
  let best: number | null = null;
  let bestErr = 40;
  const probe = { ...f, vx: 0, vy: 0 } as Fighter;
  for (let a = -1.3; a <= 0.5; a += 0.05) {
    probe.aimAngle = a;
    let { vx, vy } = throwVelocity(probe, th, 1);
    let px = o.x;
    let py = o.y;
    const step = 1 / 30;
    for (let i = 0; i < 60; i++) {
      const nx = px + vx * step;
      const ny = py + vy * step;
      vy += grav * step;
      if (w.map.solidAtPx(nx, ny) || (vy > 0 && ny >= y - 2)) {
        const err = Math.abs(nx - x) + Math.abs(ny - y) * 0.5;
        if (err < bestErr) {
          bestErr = err;
          best = a;
        }
        break;
      }
      px = nx;
      py = ny;
    }
  }
  return best;
}

