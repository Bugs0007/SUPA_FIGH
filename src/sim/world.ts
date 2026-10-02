import { applyHit, teamKey } from './combat';
import { DT, RESPAWN_PROTECTION, SUDDEN_DEATH_DPS, TILE } from './constants';
import { freshAmmo, spawnableWeapons, stacks, weaponDef } from './data/weapons';
import { spawnFire, updateBurning, updateFire, type BurningTile, type FirePatch } from './fire';
import type { SimEvent } from './events';
import { activeWeapon, createFighter, dropCooked, selectBestSlot, updateFighter, type Fighter, type FighterSpawn } from './fighter';
import { emptyIntent, type Intent } from './intent';
import { createItem, updateItems, type Item } from './item';
import { createProp, updateProps, type Prop } from './prop';
import type { PropType } from './data/props';
import { buildGimmicks, gravityMult, updateGimmicks, type Gimmicks } from './gimmicks';
import { parseMap, type MapDef, type ParsedMap } from './map/mapData';
import { TileMap } from './map/tilemap';
import { TK } from './map/tiles';
import { initBullet, newBullet, updateBullets, type Bullet, type BulletSpawn } from './projectile';
import { Rng } from './rng';

export interface WorldSettings {
  friendlyFire: boolean;
  /** 0 = no weapon spawns, 1 = normal, 2 = lots */
  weaponSpawnRate: number;
  gravityScale: number;
  /** restrict map weapon spawns to these ids (undefined = all spawnable) */
  weaponPool?: string[];
  /** active chaos modifier ids (data/modifiers.ts) */
  modifiers?: string[];
  /** dead fighters come back as poltergeists (Brawl) */
  ghosts?: boolean;
  /** Gun Game: no weapon pickups, no drops on death (the mode hands out weapons) */
  noPickups?: boolean;
}

export const DEFAULT_WORLD_SETTINGS: WorldSettings = {
  friendlyFire: false,
  weaponSpawnRate: 1,
  gravityScale: 1,
};

const MAX_BULLETS = 512;
/** share of map weapon spawns stocked at round start, and seconds between new drops (balance) */
const INITIAL_WEAPON_FRACTION = 0.8;
const WEAPON_RESPAWN: [number, number] = [5, 9];
const MAX_WEAPON_ITEMS = 22;
const NO_INTENT = emptyIntent();

/** One round of play. Pure simulation: no rendering, no audio, no DOM. */
export class World {
  readonly def: MapDef;
  readonly parsed: ParsedMap;
  readonly map: TileMap;
  readonly rng: Rng;
  readonly settings: WorldSettings;
  tick = 0;
  time = 0;
  fighters: Fighter[] = [];
  bullets: Bullet[] = [];
  items: Item[] = [];
  props: Prop[] = [];
  fires: FirePatch[] = [];
  /** wooden tiles on fire, keyed by tile index */
  burningTiles = new Map<number, BurningTile>();
  /** seconds of Bullet Time left (the world runs slow; the owner gets two updates per tick) */
  bulletTime = 0;
  bulletTimeOwner = -1;
  /** 0 = off, 1 = everyone revealed (bots know all positions), 2 = + HP drain */
  suddenDeath = 0;
  /** mode objective area bots should go to (King of the Hill), px rect */
  objective: { x: number; y: number; w: number; h: number } | null = null;
  private drainAcc = 0;
  private readonly specs: FighterSpawn[];
  events: SimEvent[] = [];
  killY: number;
  gravityScale: number;
  gimmicks: Gimmicks;
  /** active chaos modifiers */
  readonly mods: Set<string>;
  private weaponRate: number;
  private fireStormTimer = 3;
  private nextItemId = 1;
  private nextPropId = 1;
  private weaponTimer = 0;

  constructor(def: MapDef, specs: FighterSpawn[], settings: WorldSettings, seed: number) {
    this.def = def;
    this.parsed = parseMap(def);
    this.map = new TileMap(this.parsed);
    this.rng = new Rng(seed);
    this.settings = settings;
    this.mods = new Set(settings.modifiers ?? []);
    this.weaponRate = settings.weaponSpawnRate * (this.mods.has('armory') ? 3 : 1);
    this.gravityScale = settings.gravityScale * (def.gravityScale ?? 1) * (this.mods.has('lowGravity') ? 0.5 : 1);
    this.killY = this.map.pxH + (def.killMargin ?? 48);
    this.specs = specs;

    const pts = this.rng.shuffle([...this.parsed.spawns]);
    if (pts.length === 0) pts.push({ x: this.map.pxW / 2, y: TILE * 2 });
    specs.forEach((s, i) => {
      const p = pts[i % pts.length];
      const jitter = i >= pts.length ? this.rng.range(-6, 6) : 0;
      const f = createFighter(i, s, p.x + jitter, p.y);
      f.facing = p.x < this.map.pxW / 2 ? 1 : -1;
      f.grounded = true;
      f.invuln = 0.6; // brief spawn protection
      if (this.mods.has('turbo')) f.speedBoost = 1e9;
      this.fighters.push(f);
    });

    for (const p of this.parsed.props) this.spawnProp(this.mods.has('explosive') && p.type === 'crate' ? 'barrel' : p.type, p.x, p.y);
    this.gimmicks = buildGimmicks(this);
    this.spawnInitialWeapons();
    this.weaponTimer = this.nextWeaponDelay();
  }

  emit(e: SimEvent): void {
    this.events.push(e);
  }

  step(intents: readonly Intent[]): void {
    this.tick++;
    this.time = this.tick * DT;
    updateGimmicks(this);
    for (let i = 0; i < this.fighters.length; i++) {
      const f = this.fighters[i];
      updateFighter(this, f, intents[i] ?? NO_INTENT);
      if (this.bulletTime > 0 && this.bulletTimeOwner === i && f.alive) {
        // bullet time: the owner lives at double speed inside the slowed world
        const px = f.px;
        const py = f.py;
        updateFighter(this, f, intents[i] ?? NO_INTENT);
        f.px = px;
        f.py = py;
      }
      updateBurning(this, f);
    }
    if (this.bulletTime > 0) this.bulletTime = Math.max(0, this.bulletTime - DT);
    if (this.suddenDeath >= 2) this.drain();
    if (this.mods.has('firestorm')) this.fireStorm();
    updateBullets(this);
    updateItems(this);
    updateProps(this);
    updateFire(this);
    this.updateWeaponSpawner();
    if (this.tick % 120 === 0) this.items = this.items.filter((it) => it.active);
  }

  private fireStorm(): void {
    this.fireStormTimer -= DT;
    if (this.fireStormTimer > 0) return;
    this.fireStormTimer = this.rng.range(0.6, 1.6);
    spawnFire(this, this.rng.range(TILE, this.map.pxW - TILE), -TILE, this.rng.range(-30, 30), 80, -1);
  }

  private drain(): void {
    this.drainAcc += SUDDEN_DEATH_DPS * DT;
    if (this.drainAcc < 1) return;
    const dmg = this.drainAcc;
    this.drainAcc = 0;
    for (const f of this.fighters) {
      if (f.alive) applyHit(this, f, { damage: dmg, kbX: 0, kbY: 0, attacker: -1, weapon: 'suddendeath', kind: 'drain', ignoreInvuln: true });
    }
  }

  /** Bring a dead fighter back (Deathmatch): fresh state at the spawn farthest from living enemies. */
  respawn(f: Fighter): void {
    let best = this.parsed.spawns[0] ?? { x: this.map.pxW / 2, y: TILE * 2 };
    let bestD = -1;
    for (const p of this.parsed.spawns) {
      let d = Infinity;
      for (const o of this.fighters) if (o !== f && o.alive && teamKey(o) !== teamKey(f)) d = Math.min(d, Math.hypot(o.x - p.x, o.y - p.y));
      d += this.rng.range(0, 40); // don't always pick the same corner
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
    Object.assign(f, createFighter(f.id, this.specs[f.id], best.x, best.y));
    if (this.mods.has('turbo')) f.speedBoost = 1e9;
    f.facing = best.x < this.map.pxW / 2 ? 1 : -1;
    f.grounded = true;
    f.invuln = RESPAWN_PROTECTION;
    this.emit({ t: 'respawn', f: f.id, x: best.x, y: best.y });
  }

  // ------------------------------------------------------------ queries

  aliveTeams(): Set<number> {
    const s = new Set<number>();
    for (const f of this.fighters) if (f.alive) s.add(teamKey(f));
    return s;
  }

  living(): Fighter[] {
    return this.fighters.filter((f) => f.alive);
  }

  // ------------------------------------------------------------ spawning

  spawnBullet(s: BulletSpawn): Bullet | null {
    let b: Bullet | null = null;
    for (const c of this.bullets) {
      if (!c.active) {
        b = c;
        break;
      }
    }
    if (!b) {
      if (this.bullets.length >= MAX_BULLETS) return null;
      b = newBullet();
      this.bullets.push(b);
    }
    initBullet(b, s);
    if (this.mods.has('bouncy') && b.kind !== 'flame' && b.kind !== 'rocket') b.bounces = 4;
    return b;
  }

  spawnProp(type: PropType, x: number, y: number): Prop {
    const p = createProp(this.nextPropId++, type, x, y);
    this.props.push(p);
    return p;
  }

  /** Gravity multiplier at a point (map + gravity zones). */
  gravityAt(x: number, y: number): number {
    return gravityMult(this, x, y);
  }

  spawnItem(weaponId: string, ammo: number, dur: number, x: number, y: number, vx = 0, vy = 0): Item {
    const it = createItem(this.nextItemId++, weaponId, ammo, dur, x, y);
    it.vx = vx;
    it.vy = vy;
    this.items.push(it);
    return it;
  }

  spawnWeapon(id: string, x: number, y: number): Item {
    const def = weaponDef(id);
    return this.spawnItem(id, freshAmmo(def), def.melee?.durability ?? 1, x, y);
  }

  private pool() {
    let all = spawnableWeapons();
    if (this.mods.has('noGuns')) all = all.filter((w) => !w.gun);
    const ids = this.settings.weaponPool;
    return ids ? all.filter((w) => ids.includes(w.id)) : all;
  }

  randomWeaponId(): string | null {
    const pool = this.pool();
    if (pool.length === 0) return null;
    return this.rng.weighted(pool, (w) => w.spawnWeight).id;
  }

  private spawnInitialWeapons(): void {
    const rate = this.weaponRate;
    if (rate <= 0) return;
    const pts = this.rng.shuffle([...this.parsed.weaponSpawns]);
    const n = Math.min(pts.length, Math.ceil(pts.length * INITIAL_WEAPON_FRACTION * rate));
    for (let i = 0; i < n; i++) {
      const id = this.randomWeaponId();
      if (id) this.spawnWeapon(id, pts[i].x, pts[i].y - 1);
    }
  }

  private nextWeaponDelay(): number {
    const rate = Math.max(0.05, this.weaponRate);
    return this.rng.range(WEAPON_RESPAWN[0], WEAPON_RESPAWN[1]) / rate;
  }

  private updateWeaponSpawner(): void {
    if (this.weaponRate <= 0) return;
    this.weaponTimer -= DT;
    if (this.weaponTimer > 0) return;
    this.weaponTimer = this.nextWeaponDelay();
    let count = 0;
    for (const it of this.items) if (it.active) count++;
    if (count >= MAX_WEAPON_ITEMS) return;
    const free = this.parsed.weaponSpawns.filter(
      (p) => !this.items.some((it) => it.active && Math.abs(it.x - p.x) < 24 && Math.abs(it.y - p.y) < 24),
    );
    if (free.length === 0) return;
    const p = this.rng.pick(free);
    const id = this.randomWeaponId();
    if (!id) return;
    const it = this.spawnWeapon(id, p.x, p.y - 36);
    it.vy = 40;
    this.emit({ t: 'weaponSpawn', x: p.x, y: p.y, weapon: id });
  }

  // ------------------------------------------------------------ items

  /**
   * Nearest pickup-able item overlapping the fighter (expanded by range).
   * autoOnly: only items the fighter would take without pressing a key (empty slot / ammo merge).
   */
  findItemNear(f: Fighter, range: number, fighterId: number, autoOnly = false): Item | null {
    if (this.settings.noPickups) return null;
    let best: Item | null = null;
    let bestD = Infinity;
    for (const it of this.items) {
      if (!it.active) continue;
      if (it.noPickupBy === fighterId && it.noPickupTimer > 0) continue;
      if (it.thrownDmg > 0 || it.live) continue;
      const dx = Math.abs(it.x - f.x);
      if (dx > f.w / 2 + it.w / 2 + range) continue;
      if (it.y < f.y - f.h - range || it.y - it.h > f.y + range) continue;
      if (autoOnly) {
        const def = weaponDef(it.weaponId);
        const cur = f.inv[def.slot];
        const merge = cur && cur.id === it.weaponId && stacks(def);
        if (cur && !merge && !def.powerup) continue;
      }
      if (dx < bestD) {
        bestD = dx;
        best = it;
      }
    }
    return best;
  }

  /** Take an item. swap = replace whatever is in that slot (dropping it). */
  pickUp(f: Fighter, it: Item, swap: boolean): boolean {
    const def = weaponDef(it.weaponId);
    if (def.powerup) {
      const pu = def.powerup;
      if (pu.kind === 'speed') f.speedBoost = pu.duration;
      else if (pu.kind === 'strength') f.strengthBoost = pu.duration;
      else {
        this.bulletTime = pu.duration;
        this.bulletTimeOwner = f.id;
      }
      it.active = false;
      this.emit({ t: 'powerup', f: f.id, kind: pu.kind, x: it.x, y: it.y });
      return true;
    }
    const slot = def.slot;
    const cur = f.inv[slot];
    if (cur && cur.id === it.weaponId && stacks(def)) {
      cur.ammo += it.ammo;
      it.active = false;
      this.emit({ t: 'pickup', f: f.id, weapon: it.weaponId, x: it.x, y: it.y });
      return true;
    }
    if (cur && !swap) return false;
    if (cur) {
      const d = this.spawnItem(cur.id, cur.ammo, cur.dur, f.x, f.y - 10, -f.facing * 60, -110);
      d.noPickupBy = f.id;
      d.noPickupTimer = 0.6;
      d.vrot = -f.facing * 8;
    }
    const wasGun = !!activeWeapon(f).gun;
    f.inv[slot] = { id: it.weaponId, ammo: it.ammo, dur: it.dur };
    const armsUp = !!def.gun || !!def.melee;
    if (swap || f.active === slot || (armsUp && !f.inv[f.active]) || (def.gun && !wasGun)) f.active = slot;
    it.active = false;
    this.emit({ t: 'pickup', f: f.id, weapon: it.weaponId, x: it.x, y: it.y });
    return true;
  }

  dropAllWeapons(f: Fighter): void {
    if (f.cook > 0) dropCooked(this, f);
    if (this.settings.noPickups) {
      f.inv.fill(null);
      selectBestSlot(f);
      return;
    }
    for (let s = 0; s < f.inv.length; s++) {
      const it = f.inv[s];
      if (!it) continue;
      f.inv[s] = null;
      if (weaponDef(it.id).throw && it.ammo <= 0) continue;
      const d = this.spawnItem(it.id, it.ammo, it.dur, f.x, f.y - 12, this.rng.range(-110, 110) + f.vx * 0.3, this.rng.range(-230, -120));
      d.vrot = this.rng.range(-15, 15);
    }
    selectBestSlot(f);
  }

  // ------------------------------------------------------------ map & grabs

  breakTile(tx: number, ty: number): void {
    const kind = this.map.get(tx, ty);
    if (kind === TK.EMPTY) return;
    this.map.set(tx, ty, TK.EMPTY);
    this.emit({ t: 'tileBreak', tx, ty, kind });
  }

  /** Break any grab this fighter is part of (as grabber or victim). */
  releaseGrab(f: Fighter): void {
    if (f.grabTarget >= 0) {
      const v = this.fighters[f.grabTarget];
      f.grabTarget = -1;
      if (v && v.grabbedBy === f.id) {
        v.grabbedBy = -1;
        if (v.state === 'grabbed') {
          v.state = 'normal';
          v.stateTime = 0;
        }
      }
      if (f.state === 'grabbing') {
        f.state = 'normal';
        f.stateTime = 0;
      }
    }
    if (f.grabbedBy >= 0) {
      const g = this.fighters[f.grabbedBy];
      f.grabbedBy = -1;
      if (g && g.grabTarget === f.id) {
        g.grabTarget = -1;
        if (g.state === 'grabbing') {
          g.state = 'normal';
          g.stateTime = 0;
        }
      }
      if (f.state === 'grabbed') {
        f.state = 'normal';
        f.stateTime = 0;
      }
    }
  }
}
