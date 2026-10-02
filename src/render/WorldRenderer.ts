import Phaser from 'phaser';
import { Art } from '../art';
import type { Appearance } from '../art/appearance';
import { hexToNum, P } from '../art/palette';
import { BACK_ROW, backMask, THEMES, tileMask } from '../art/tileArt';
import { GRAVITY, TILE } from '../sim/constants';
import { weaponDef } from '../sim/data/weapons';
import { activeWeapon, gunGeometry, throwOrigin, throwPower, throwVelocity, type Fighter } from '../sim/fighter';
import { MINE_ARM } from '../sim/item';
import { TK } from '../sim/map/tiles';
import type { World } from '../sim/world';
import { segmentAabb as segmentAabbT } from '../sim/physics';
import { FighterView } from './FighterView';
import { Fx } from './Fx';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Particles to emit this frame for a continuous rate (per second). */
const emitCount = (rate: number, dt: number) => Math.floor(rate * dt + Math.random());
const POWERUP_GLOW: Record<string, number> = { speed: hexToNum(P.yellow), strength: hexToNum(P.red2), bullettime: hexToNum(P.glass1) };

interface FloatText {
  obj: Phaser.GameObjects.BitmapText;
  life: number;
  vy: number;
}

export interface FighterLook {
  look: Appearance;
  color: number;
  label: string;
}

/** Draws one World. Rebuilt every round (cheap: textures are cached). */
export class WorldRenderer {
  readonly fx: Fx;
  readonly views: FighterView[] = [];
  private tilemap: Phaser.Tilemaps.Tilemap;
  private fg: Phaser.Tilemaps.TilemapLayer;
  private bg: Phaser.Tilemaps.TilemapLayer;
  private decals: Phaser.GameObjects.RenderTexture;
  private items = new Map<number, Phaser.GameObjects.Image>();
  private props = new Map<number, { img: Phaser.GameObjects.Image; hp: number; flash: number }>();
  private rockets: Phaser.GameObjects.Image[] = [];
  private overlay: Phaser.GameObjects.Graphics;
  private tracers: Phaser.GameObjects.Graphics;
  private bars: Phaser.GameObjects.Graphics;
  private floats: FloatText[] = [];
  private debugGfx: Phaser.GameObjects.Graphics;
  debug = false;

  constructor(
    private scene: Phaser.Scene,
    readonly world: World,
    looks: FighterLook[],
  ) {
    const map = world.map;
    const theme = world.def.theme;
    const th = THEMES[theme] ?? THEMES.arena;
    scene.cameras.main.setBackgroundColor(th.sky0);

    const key = Art.tileset(scene, theme);
    this.tilemap = scene.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: map.w, height: map.h });
    const ts = this.tilemap.addTilesetImage(key, key, TILE, TILE, 0, 0)!;
    this.bg = this.tilemap.createBlankLayer('bg', ts)!.setDepth(0);
    this.fg = this.tilemap.createBlankLayer('fg', ts)!.setDepth(20);
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        if (map.back[y * map.w + x]) this.bg.putTileAt(BACK_ROW * 16 + backMask(map, x, y), x, y);
        this.refreshTile(x, y);
      }
    }

    this.decals = scene.add.renderTexture(0, 0, map.pxW, map.pxH).setOrigin(0, 0).setDepth(25);
    this.fx = new Fx(scene, map, this.decals);

    world.fighters.forEach((f, i) => {
      const l = looks[i];
      this.views.push(new FighterView(scene, f, l.look, l.color, l.label));
    });

    this.tracers = scene.add.graphics().setDepth(55).setBlendMode(Phaser.BlendModes.ADD);
    this.overlay = scene.add.graphics().setDepth(66);
    this.bars = scene.add.graphics().setDepth(68);
    this.debugGfx = scene.add.graphics().setDepth(90);
  }

  private refreshTile(x: number, y: number): void {
    const map = this.world.map;
    if (x < 0 || y < 0 || x >= map.w || y >= map.h) return;
    const k = map.get(x, y);
    if (k === TK.EMPTY) this.fg.removeTileAt(x, y);
    else this.fg.putTileAt(k * 16 + tileMask(map, x, y), x, y);
  }

  private syncTiles(): void {
    const ch = this.world.map.changes;
    if (ch.length === 0) return;
    for (const c of ch) {
      this.refreshTile(c.tx, c.ty);
      this.refreshTile(c.tx - 1, c.ty);
      this.refreshTile(c.tx + 1, c.ty);
      this.refreshTile(c.tx, c.ty - 1);
      this.refreshTile(c.tx, c.ty + 1);
    }
    ch.length = 0;
  }

  floatText(x: number, y: number, text: string, color: number, big = false): void {
    const obj = this.scene.add
      .bitmapText(Math.round(x), Math.round(y), big ? 'pxo' : 'smo', text.toUpperCase())
      .setOrigin(0.5, 1)
      .setTint(color)
      .setDepth(75);
    this.floats.push({ obj, life: big ? 1.1 : 0.7, vy: big ? -30 : -45 });
  }

  sync(alpha: number, dt: number, time: number): void {
    const w = this.world;
    this.syncTiles();

    for (const v of this.views) v.update(alpha, dt, time, w.time);

    // items
    const seen = new Set<number>();
    for (const it of w.items) {
      if (!it.active) continue;
      seen.add(it.id);
      let img = this.items.get(it.id);
      const wf = Art.weapon(it.weaponId);
      if (!img) {
        img = this.scene.add.image(0, 0, wf?.key ?? 'fx', wf?.frame ?? 'p3').setDepth(35);
        this.items.set(it.id, img);
      }
      const x = lerp(it.px, it.x, alpha);
      let y = lerp(it.py, it.y, alpha) - it.h / 2;
      const def = weaponDef(it.weaponId);
      if (def.powerup) {
        y -= 3 + Math.sin(time * 4 + it.id) * 2;
        if (Math.random() < dt * 8) this.fx.motes(x, y + 4, 1, POWERUP_GLOW[it.weaponId] ?? 0xffffff);
      }
      img.setPosition(x, y).setRotation(it.rot);
      if (it.live) {
        this.liveItemFx(it, x, y, time);
        img.clearTint();
        continue;
      }
      const empty = !!def.gun && it.ammo <= 0 && it.age > 0;
      // brief flash every ~2.2 s so pickups catch the eye without looking like white blobs
      const glint = it.grounded && (time * 0.45 + it.id * 0.37) % 1 < 0.04;
      if (glint && !empty) img.setTintFill(0xffffff);
      else if (empty) img.setTint(0x777777);
      else img.clearTint();
    }
    for (const [id, img] of this.items) {
      if (!seen.has(id)) {
        img.destroy();
        this.items.delete(id);
      }
    }

    this.syncProps(alpha, dt);

    // projectiles
    const g = this.tracers;
    g.clear();
    let rocketN = 0;
    for (const b of w.bullets) {
      if (!b.active) continue;
      const hx = lerp(b.px, b.x, alpha);
      const hy = lerp(b.py, b.y, alpha);
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const dx = b.vx / sp;
      const dy = b.vy / sp;
      if (b.kind === 'flame') {
        if (dt > 0) this.fx.flameBlob(hx, hy, b.vx, b.vy, b.traveled / b.range);
        continue;
      }
      if (b.kind === 'rocket') {
        let img = this.rockets[rocketN];
        if (!img) {
          const rf = Art.weapon('proj_rocket')!;
          img = this.rockets[rocketN] = this.scene.add.image(0, 0, rf.key, rf.frame).setDepth(56);
        }
        img.setVisible(true).setPosition(hx, hy).setRotation(Math.atan2(dy, dx));
        rocketN++;
        this.fx.glowDot(hx - dx * 6, hy - dy * 6, hexToNum(P.orange), 0.6);
        for (let i = emitCount(60, dt); i > 0; i--) this.fx.smokeTrail(hx - dx * 7, hy - dy * 7);
        continue;
      }
      if (b.kind === 'flare') {
        this.fx.glowDot(hx, hy, hexToNum(P.red2), 1.1);
        for (let i = emitCount(40, dt); i > 0; i--) this.fx.sparks(hx, hy, -dx, -dy, 1, hexToNum(P.orange), 60);
        continue;
      }
      // don't draw behind the muzzle / last bounce
      const maxLen = Math.max(0, (hx - b.ox) * dx + (hy - b.oy) * dy);
      const sniper = b.kind === 'sniper';
      const long = Math.min(maxLen, b.kind === 'pellet' ? 12 : sniper ? 70 : 26);
      const short = Math.min(maxLen, b.kind === 'pellet' ? 5 : sniper ? 30 : 10);
      g.lineStyle(sniper ? 2 : 1, 0xf8c840, 0.35);
      g.lineBetween(hx - dx * long, hy - dy * long, hx, hy);
      g.lineStyle(1, sniper ? 0xffffff : 0xfff4a0, 1);
      g.lineBetween(hx - dx * short, hy - dy * short, hx, hy);
    }
    for (let i = rocketN; i < this.rockets.length; i++) this.rockets[i].setVisible(false);

    this.syncFire(dt);
    this.drawAimAids(alpha);

    // health bars
    const bars = this.bars;
    bars.clear();
    for (const v of this.views) {
      const f = v.fighter;
      if (!f.alive || f.gone) continue;
      const x = Math.round(lerp(f.px, f.x, alpha)) - 7;
      const y = Math.round(lerp(f.py, f.y, alpha)) - 28;
      const frac = Math.max(0, f.hp) / 100;
      const trail = Math.max(0, v.hpTrail) / 100;
      bars.fillStyle(hexToNum(P.ink), 1).fillRect(x - 1, y - 1, 16, 4);
      bars.fillStyle(0xffffff, 1).fillRect(x, y, Math.round(14 * trail), 2);
      const col = frac > 0.6 ? P.green2 : frac > 0.3 ? P.yellow : P.red2;
      bars.fillStyle(hexToNum(col), 1).fillRect(x, y, Math.round(14 * frac), 2);
    }

    // floating texts
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const ft = this.floats[i];
      ft.life -= dt;
      ft.obj.y += ft.vy * dt;
      ft.vy *= Math.pow(0.05, dt);
      ft.obj.setAlpha(Math.min(1, ft.life * 4));
      if (ft.life <= 0) {
        ft.obj.destroy();
        this.floats.splice(i, 1);
      }
    }

    this.fx.update(dt);
    this.drawDebug();
  }

  private liveItemFx(it: World['items'][number], x: number, y: number, time: number): void {
    const th = weaponDef(it.weaponId).throw;
    if (!th) return;
    const red = hexToNum(P.red2);
    if (th.mine) {
      const armed = it.armT >= MINE_ARM;
      if (armed && (time * 2 + it.id * 0.3) % 1 < 0.12) this.fx.glowDot(x, y - 3, red, 0.45);
    } else if (th.remote) {
      if ((time * 1.5 + it.id * 0.3) % 1 < 0.15) this.fx.glowDot(x, y, red, 0.45);
    } else if (th.cook && it.fuse >= 0) {
      // fuse sparks, blinking faster near the end
      if (Math.random() < 0.5) this.fx.sparks(x, y - 3, 0, -1, 1, hexToNum(P.yellow2), 40);
      if (it.fuse < 1 && (time * 8) % 1 < 0.3) this.fx.glowDot(x, y, red, 0.5);
    } else if (th.fire) {
      if (Math.random() < 0.6) this.fx.flame(x, y - 4, 0.4);
    }
  }

  private syncProps(alpha: number, dt: number): void {
    const seen = new Set<number>();
    for (const p of this.world.props) {
      if (!p.active) continue;
      seen.add(p.id);
      let v = this.props.get(p.id);
      if (!v) {
        const pf = Art.weapon('prop_' + p.type)!;
        v = { img: this.scene.add.image(0, 0, pf.key, pf.frame).setDepth(34), hp: p.hp, flash: 0 };
        this.props.set(p.id, v);
      }
      if (p.hp < v.hp) v.flash = 0.06;
      v.hp = p.hp;
      const x = lerp(p.px, p.x, alpha);
      const y = lerp(p.py, p.y, alpha) - p.h / 2;
      v.img.setPosition(x, y).setRotation(p.rot);
      if (v.flash > 0) {
        v.flash -= dt;
        v.img.setTintFill(0xffffff);
      } else if (p.fuse >= 0) {
        v.img.setTint((p.fuse * 12) % 2 < 1 ? 0xff8060 : 0xffffff);
      } else v.img.clearTint();
      if (p.fuse >= 0) {
        for (let i = emitCount(p.def.rocket ? 50 : 25, dt); i > 0; i--) {
          if (p.def.rocket) {
            this.fx.jet(x, y + p.h / 2);
            this.fx.smokeTrail(x, y + p.h / 2);
          } else this.fx.flame(x + (Math.random() - 0.5) * p.w, y - p.h / 2, 0.8);
        }
      } else if (p.hp < p.def.hp * 0.5 && p.def.explosion && Math.random() < dt * 6) {
        this.fx.smokeTrail(x, y - p.h / 2, 0x6a6678);
      }
    }
    for (const [id, v] of this.props) {
      if (!seen.has(id)) {
        v.img.destroy();
        this.props.delete(id);
      }
    }
  }

  private syncFire(dt: number): void {
    if (dt <= 0) return;
    const w = this.world;
    for (const p of w.fires) {
      if (!p.active) continue;
      const life = Math.min(1, p.life / 1.2);
      for (let i = emitCount(14 * life, dt); i > 0; i--) this.fx.flame(p.x, p.y - 1, 0.6 + 0.5 * life);
    }
    for (const bt of w.burningTiles.values()) {
      const x = bt.tx * TILE;
      const y = bt.ty * TILE;
      for (let i = emitCount(22, dt); i > 0; i--) this.fx.flame(x + Math.random() * TILE, y + 2 + Math.random() * 6, 1.1);
    }
    for (const f of w.fighters) {
      if (f.gone) continue;
      if (f.burn > 0) {
        for (let i = emitCount(30, dt); i > 0; i--) this.fx.flame(f.x + (Math.random() - 0.5) * f.w, f.y - Math.random() * f.h, 0.9);
      }
      if (f.jetting) for (let i = emitCount(70, dt); i > 0; i--) this.fx.jet(f.x - f.facing * 5, f.y - 8);
      if (f.alive && f.speedBoost > 0 && Math.random() < dt * 14) this.fx.motes(f.x, f.y - 4, 1, hexToNum(P.yellow));
      if (f.alive && f.strengthBoost > 0 && Math.random() < dt * 10) this.fx.motes(f.x, f.y - 12, 1, hexToNum(P.red2));
    }
  }

  /** Sniper laser sights and the grenade arc preview for humans. */
  private drawAimAids(alpha: number): void {
    const g = this.overlay;
    g.clear();
    const w = this.world;
    for (const f of w.fighters) {
      if (!f.alive || f.gone || f.state !== 'aim') continue;
      const def = activeWeapon(f);
      if (def.gun?.laser && f.aimHeld) {
        const geo = gunGeometry(f, def);
        const ox = geo.muzzleX + (lerp(f.px, f.x, alpha) - f.x);
        const oy = geo.muzzleY + (lerp(f.py, f.y, alpha) - f.y);
        const ex = ox + geo.dirX * 900;
        const ey = oy + geo.dirY * 900;
        const hit = w.map.raycastSolid(ox, oy, ex, ey);
        let tx = hit ? hit.x : ex;
        let ty = hit ? hit.y : ey;
        // stop at the first fighter in the way
        for (const o of w.fighters) {
          if (o === f || !o.alive || o.gone) continue;
          const t = segmentAabbT(ox, oy, tx, ty, o.x - o.w / 2, o.y - o.h, o.x + o.w / 2, o.y);
          if (t >= 0) {
            tx = ox + (tx - ox) * t;
            ty = oy + (ty - oy) * t;
          }
        }
        g.lineStyle(1, 0xff2030, 0.45).lineBetween(ox, oy, tx, ty);
        g.fillStyle(0xff4040, 1).fillRect(Math.round(tx) - 1, Math.round(ty) - 1, 2, 2);
      }
      const th = def.throw;
      if (th && f.aimHeld && !th.mine && !f.isBot) this.drawArc(f, th, alpha);
    }
  }

  private drawArc(f: Fighter, th: NonNullable<ReturnType<typeof weaponDef>['throw']>, alpha: number): void {
    const g = this.overlay;
    const w = this.world;
    const o = throwOrigin(f);
    let x = o.x + (lerp(f.px, f.x, alpha) - f.x);
    let y = o.y + (lerp(f.py, f.y, alpha) - f.y);
    let { vx, vy } = throwVelocity(f, th, throwPower(f));
    const step = 1 / 30;
    const grav = GRAVITY * w.gravityScale;
    const col = f.cook >= 0 && f.cook < 1 ? 0xff6050 : 0xffffff;
    for (let i = 0; i < 40; i++) {
      const nx = x + vx * step;
      const ny = y + vy * step;
      vy += grav * step;
      if (w.map.solidAtPx(nx, ny)) {
        g.fillStyle(col, 0.9).fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
        break;
      }
      x = nx;
      y = ny;
      if (i % 2 === 0) g.fillStyle(col, 0.75 - i * 0.015).fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }

  private drawDebug(): void {
    const g = this.debugGfx;
    g.clear();
    if (!this.debug) return;
    for (const f of this.world.fighters) {
      if (f.gone) continue;
      g.lineStyle(1, f.alive ? (f.invuln > 0 ? 0x00ffff : 0x00ff00) : 0x888888, 1);
      g.strokeRect(f.x - f.w / 2, f.y - f.h, f.w, f.h);
    }
    g.lineStyle(1, 0xffff00, 1);
    for (const it of this.world.items) if (it.active) g.strokeRect(it.x - it.w / 2, it.y - it.h, it.w, it.h);
    g.lineStyle(1, 0xff8800, 1);
    for (const p of this.world.props) if (p.active) g.strokeRect(p.x - p.w / 2, p.y - p.h, p.w, p.h);
  }

  destroy(): void {
    for (const v of this.views) v.destroy();
    for (const img of this.items.values()) img.destroy();
    for (const f of this.floats) f.obj.destroy();
    for (const v of this.props.values()) v.img.destroy();
    for (const r of this.rockets) r.destroy();
    this.overlay.destroy();
    this.fx.destroy();
    this.decals.destroy();
    this.tracers.destroy();
    this.bars.destroy();
    this.debugGfx.destroy();
    this.tilemap.destroy();
  }
}
