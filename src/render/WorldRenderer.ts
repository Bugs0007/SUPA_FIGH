import Phaser from 'phaser';
import { Art } from '../art';
import type { Appearance } from '../art/appearance';
import { hexToNum, P } from '../art/palette';
import { BACK_ROW, backMask, THEMES, tileMask } from '../art/tileArt';
import { TILE } from '../sim/constants';
import { TK } from '../sim/map/tiles';
import type { World } from '../sim/world';
import { FighterView } from './FighterView';
import { Fx } from './Fx';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

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
      const y = lerp(it.py, it.y, alpha) - it.h / 2;
      img.setPosition(x, y).setRotation(it.rot);
      const empty = it.ammo <= 0 && it.weaponId !== 'fists' && !!wf && it.age > 0;
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

    // tracers
    const g = this.tracers;
    g.clear();
    for (const b of w.bullets) {
      if (!b.active) continue;
      const hx = lerp(b.px, b.x, alpha);
      const hy = lerp(b.py, b.y, alpha);
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const dx = b.vx / sp;
      const dy = b.vy / sp;
      // don't draw behind the muzzle / last bounce
      const maxLen = Math.max(0, (hx - b.ox) * dx + (hy - b.oy) * dy);
      const long = Math.min(maxLen, b.kind === 'pellet' ? 12 : 26);
      const short = Math.min(maxLen, b.kind === 'pellet' ? 5 : 10);
      g.lineStyle(1, 0xf8c840, 0.35);
      g.lineBetween(hx - dx * long, hy - dy * long, hx, hy);
      g.lineStyle(1, 0xfff4a0, 1);
      g.lineBetween(hx - dx * short, hy - dy * short, hx, hy);
    }

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
  }

  destroy(): void {
    for (const v of this.views) v.destroy();
    for (const img of this.items.values()) img.destroy();
    for (const f of this.floats) f.obj.destroy();
    this.fx.destroy();
    this.decals.destroy();
    this.tracers.destroy();
    this.bars.destroy();
    this.debugGfx.destroy();
    this.tilemap.destroy();
  }
}
