import { DT, TILE } from './constants';
import { teamKey } from './combat';
import { spawnableWeapons, weaponDef } from './data/weapons';
import type { SimEvent } from './events';
import { activeWeapon, createFighter, selectBestSlot, updateFighter, type Fighter, type FighterSpawn } from './fighter';
import { emptyIntent, type Intent } from './intent';
import { createItem, updateItems, type Item } from './item';
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
}

export const DEFAULT_WORLD_SETTINGS: WorldSettings = {
  friendlyFire: false,
  weaponSpawnRate: 1,
  gravityScale: 1,
};

const MAX_BULLETS = 512;
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
  events: SimEvent[] = [];
  killY: number;
  gravityScale: number;
  private nextItemId = 1;
  private weaponTimer = 0;

  constructor(def: MapDef, specs: FighterSpawn[], settings: WorldSettings, seed: number) {
    this.def = def;
    this.parsed = parseMap(def);
    this.map = new TileMap(this.parsed);
    this.rng = new Rng(seed);
    this.settings = settings;
    this.gravityScale = settings.gravityScale * (def.gravityScale ?? 1);
    this.killY = this.map.pxH + (def.killMargin ?? 48);

    const pts = this.rng.shuffle([...this.parsed.spawns]);
    if (pts.length === 0) pts.push({ x: this.map.pxW / 2, y: TILE * 2 });
    specs.forEach((s, i) => {
      const p = pts[i % pts.length];
      const jitter = i >= pts.length ? this.rng.range(-6, 6) : 0;
      const f = createFighter(i, s, p.x + jitter, p.y);
      f.facing = p.x < this.map.pxW / 2 ? 1 : -1;
      f.grounded = true;
      f.invuln = 0.6; // brief spawn protection
      this.fighters.push(f);
    });

    this.spawnInitialWeapons();
    this.weaponTimer = this.nextWeaponDelay();
  }

  emit(e: SimEvent): void {
    this.events.push(e);
  }

  step(intents: readonly Intent[]): void {
    this.tick++;
    this.time = this.tick * DT;
    for (let i = 0; i < this.fighters.length; i++) updateFighter(this, this.fighters[i], intents[i] ?? NO_INTENT);
    updateBullets(this);
    updateItems(this);
    this.updateWeaponSpawner();
    if (this.tick % 120 === 0) this.items = this.items.filter((it) => it.active);
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
    for (const b of this.bullets) if (!b.active) return initBullet(b, s);
    if (this.bullets.length >= MAX_BULLETS) return null;
    const b = newBullet();
    this.bullets.push(b);
    return initBullet(b, s);
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
    return this.spawnItem(id, def.gun?.ammo ?? 0, def.melee?.durability ?? 1, x, y);
  }

  private pool() {
    const all = spawnableWeapons();
    const ids = this.settings.weaponPool;
    return ids ? all.filter((w) => ids.includes(w.id)) : all;
  }

  private randomWeaponId(): string | null {
    const pool = this.pool();
    if (pool.length === 0) return null;
    return this.rng.weighted(pool, (w) => w.spawnWeight).id;
  }

  private spawnInitialWeapons(): void {
    const rate = this.settings.weaponSpawnRate;
    if (rate <= 0) return;
    const pts = this.rng.shuffle([...this.parsed.weaponSpawns]);
    const n = Math.min(pts.length, Math.ceil(pts.length * 0.55 * rate));
    for (let i = 0; i < n; i++) {
      const id = this.randomWeaponId();
      if (id) this.spawnWeapon(id, pts[i].x, pts[i].y - 1);
    }
  }

  private nextWeaponDelay(): number {
    const rate = Math.max(0.05, this.settings.weaponSpawnRate);
    return this.rng.range(7, 12) / rate;
  }

  private updateWeaponSpawner(): void {
    if (this.settings.weaponSpawnRate <= 0) return;
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
    let best: Item | null = null;
    let bestD = Infinity;
    for (const it of this.items) {
      if (!it.active) continue;
      if (it.noPickupBy === fighterId && it.noPickupTimer > 0) continue;
      if (it.thrownDmg > 0) continue;
      const dx = Math.abs(it.x - f.x);
      if (dx > f.w / 2 + it.w / 2 + range) continue;
      if (it.y < f.y - f.h - range || it.y - it.h > f.y + range) continue;
      if (autoOnly) {
        const def = weaponDef(it.weaponId);
        const cur = f.inv[def.slot];
        const merge = cur && cur.id === it.weaponId && !!def.gun;
        if (cur && !merge) continue;
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
    const slot = def.slot;
    const cur = f.inv[slot];
    if (cur && cur.id === it.weaponId && def.gun) {
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
    if (swap || !f.inv[f.active] || f.active === slot || (def.gun && !wasGun)) f.active = slot;
    it.active = false;
    this.emit({ t: 'pickup', f: f.id, weapon: it.weaponId, x: it.x, y: it.y });
    return true;
  }

  dropAllWeapons(f: Fighter): void {
    for (let s = 0; s < f.inv.length; s++) {
      const it = f.inv[s];
      if (!it) continue;
      f.inv[s] = null;
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
