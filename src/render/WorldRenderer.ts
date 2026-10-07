import Phaser from 'phaser';
import { Art } from '../art';
import type { Appearance } from '../art/appearance';
import { hexToNum, P } from '../art/palette';
import { BACK_ROW, backMask, backVariant, THEMES, tileMask } from '../art/tileArt';
import { GRAVITY, TILE } from '../sim/constants';
import { weaponDef } from '../sim/data/weapons';
import { activeWeapon, gunGeometry, throwOrigin, throwPower, throwVelocity, type Fighter } from '../sim/fighter';
import { MINE_ARM } from '../sim/item';
import { TK } from '../sim/map/tiles';
import type { World } from '../sim/world';
import { segmentAabb as segmentAabbT } from '../sim/physics';
import { FighterView } from './FighterView';
import { Fx } from './Fx';
import { HeroFx } from './HeroFx';
import { DecorLayer } from './Decor';
import { POWER_ORB } from '../sim/data/heroes';
import { baseAbility, formLayers } from '../sim/hero';
import { FORM_HP } from '../sim/data/heroes';
import { formFx } from '../art/heroArt';

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
  readonly heroFx: HeroFx;
  /** background decorations (map detailing) */
  private decor: DecorLayer;
  private tilemap: Phaser.Tilemaps.Tilemap;
  private fg: Phaser.Tilemaps.TilemapLayer;
  private bg: Phaser.Tilemaps.TilemapLayer;
  private decals: Phaser.GameObjects.RenderTexture;
  private items = new Map<number, Phaser.GameObjects.Image>();
  private props = new Map<number, { img: Phaser.GameObjects.Image; hp: number; flash: number }>();
  private rockets: Phaser.GameObjects.Image[] = [];
  private overlay: Phaser.GameObjects.Graphics;
  private gimmickBack: Phaser.GameObjects.Graphics;
  private gimmickFront: Phaser.GameObjects.Graphics;
  private conveyors: { x: number; y: number; dir: number }[] = [];
  private helis: { x: number; y: number; dir: number }[] = [];
  private tracers: Phaser.GameObjects.Graphics;
  private bars: Phaser.GameObjects.Graphics;
  private floats: FloatText[] = [];
  private debugGfx: Phaser.GameObjects.Graphics;
  debug = false;
  /** fighter wearing the bounty crown (-1 = none), set by the scene each frame */
  bounty = -1;
  /** King of the Hill zone + holder color (set by the scene) */
  hill: { x: number; y: number; w: number; h: number } | null = null;
  hillColor = 0xffffff;
  /** co-op revive progress per fighter (0..1) */
  revive: number[] = [];

  constructor(
    private scene: Phaser.Scene,
    readonly world: World,
    looks: FighterLook[],
  ) {
    const map = world.map;
    const theme = world.def.theme;
    const th = THEMES[theme] ?? THEMES.arena;
    // transparent: the BackgroundScene underneath paints sky + parallax layers
    scene.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    void th;

    const key = Art.tileset(scene, theme);
    this.tilemap = scene.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: map.w, height: map.h });
    const ts = this.tilemap.addTilesetImage(key, key, TILE, TILE, 0, 0)!;
    this.bg = this.tilemap.createBlankLayer('bg', ts)!.setDepth(0);
    this.fg = this.tilemap.createBlankLayer('fg', ts)!.setDepth(20);
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        if (map.back[y * map.w + x]) this.bg.putTileAt((BACK_ROW + backVariant(x, y)) * 16 + backMask(map, x, y), x, y);
        this.refreshTile(x, y);
      }
    }

    this.decor = new DecorLayer(scene, map, world.def);
    this.decals = scene.add.renderTexture(0, 0, map.pxW, map.pxH).setOrigin(0, 0).setDepth(25);
    this.fx = new Fx(scene, map, this.decals);

    world.fighters.forEach((f, i) => {
      const l = looks[i];
      const v = new FighterView(scene, f, l.look, l.color, l.label);
      v.bigHead = world.mods.has('bigHeads');
      this.views.push(v);
    });

    this.heroFx = new HeroFx(scene, world, this.views, this.fx);
    this.tracers = scene.add.graphics().setDepth(55).setBlendMode(Phaser.BlendModes.ADD);
    this.overlay = scene.add.graphics().setDepth(66);
    this.gimmickBack = scene.add.graphics().setDepth(30);
    this.gimmickFront = scene.add.graphics().setDepth(50);
    for (let y = 0; y < map.h; y++)
      for (let x = 0; x < map.w; x++) {
        const c = map.def(x, y).conveyor;
        if (c) this.conveyors.push({ x: x * TILE, y: y * TILE, dir: c });
      }
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

  setBarsVisible(v: boolean): void {
    this.bars.setVisible(v);
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
    this.heroFx.sync(alpha, dt, time);
    this.decor.update(time);

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
        if (it.weaponId === POWER_ORB) {
          // rare power orb: bigger bob, glow and a steady sparkle so it reads from across the map
          const col = hexToNum(Math.floor(time * 2) % 2 === 0 ? '#ffd84a' : '#4ab8ff');
          y -= 2;
          this.fx.glowDot(x, y, col, 1.2 + Math.sin(time * 6) * 0.2);
          if (Math.random() < dt * 20) this.fx.motes(x, y + 4, 1, col);
        } else if (Math.random() < dt * 8) this.fx.motes(x, y + 4, 1, POWERUP_GLOW[it.weaponId] ?? 0xffffff);
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
      if (b.kind === 'chakra' || b.kind === 'ki') continue; // HeroFx draws energy orbs
      if (b.kind === 'cannonball') {
        for (let i = emitCount(30, dt); i > 0; i--) this.fx.smokeTrail(hx - dx * 4, hy - dy * 4);
        continue; // the ball itself is drawn by HeroFx (normal blend layer)
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
    this.drawGimmicks(alpha, dt, time);
    this.drawAimAids(alpha);

    // health bars (+ the bounty crown, hill, revive progress)
    const bars = this.bars;
    bars.clear();
    if (this.hill) {
      const h = this.hill;
      const pulse = 0.5 + Math.sin(time * 4) * 0.25;
      bars.fillStyle(this.hillColor, 0.08 + pulse * 0.06).fillRect(h.x, h.y, h.w, h.h);
      bars.lineStyle(1, this.hillColor, pulse).strokeRect(h.x + 0.5, h.y + 0.5, h.w - 1, h.h - 1);
      bars.fillStyle(hexToNum(P.steel3), 1).fillRect(h.x + h.w / 2, h.y - 18, 1, 18);
      bars.fillStyle(this.hillColor, 1).fillRect(h.x + h.w / 2 + 1, h.y - 18, 8, 5);
    }
    this.revive.forEach((p, i) => {
      const f = w.fighters[i];
      if (!f || f.alive || f.gone || p <= 0) return;
      bars.fillStyle(hexToNum(P.ink), 1).fillRect(f.x - 9, f.y - 20, 18, 4);
      bars.fillStyle(hexToNum(P.green2), 1).fillRect(f.x - 8, f.y - 19, Math.round(16 * Math.min(1, p)), 2);
    });
    const bf = this.bounty >= 0 ? w.fighters[this.bounty] : null;
    if (bf && bf.alive && !bf.gone) {
      const cx = Math.round(lerp(bf.px, bf.x, alpha));
      const cy = Math.round(lerp(bf.py, bf.y, alpha)) - 49 + Math.round(Math.sin(time * 4) * 1);
      bars.fillStyle(hexToNum(P.ink), 1).fillRect(cx - 5, cy - 1, 11, 7);
      bars.fillStyle(hexToNum(P.yellow), 1).fillRect(cx - 4, cy + 2, 9, 3).fillRect(cx - 4, cy, 1, 2).fillRect(cx, cy - 1, 1, 3).fillRect(cx + 4, cy, 1, 2);
      bars.fillStyle(hexToNum(P.red2), 1).fillRect(cx, cy + 3, 1, 1);
    }
    for (const v of this.views) {
      const f = v.fighter;
      if (!f.alive || f.gone) continue;
      const x = Math.round(lerp(f.px, f.x, alpha)) - 7;
      const y = Math.round(lerp(f.py, f.y, alpha)) - 33;
      const frac = Math.max(0, f.hp) / f.maxHp;
      const trail = Math.max(0, v.hpTrail) / f.maxHp;
      bars.fillStyle(hexToNum(P.ink), 1).fillRect(x - 1, y - 1, 16, 4);
      bars.fillStyle(0xffffff, 1).fillRect(x, y, Math.round(14 * trail), 2);
      const col = frac > 0.6 ? P.green2 : frac > 0.3 ? P.yellow : P.red2;
      bars.fillStyle(hexToNum(col), 1).fillRect(x, y, Math.round(14 * frac), 2);
      // form health layers stacked above the HP bar (D61)
      if (f.power === 'hero') {
        const col = hexToNum(formFx(f.hero, f.powerLevel).aura[0]);
        const layers = formLayers(f);
        for (let k = 0; k < layers; k++) {
          const frac = Math.max(0, Math.min(1, (f.formHp - k * FORM_HP) / FORM_HP));
          const ly = y - 3 * (k + 1);
          bars.fillStyle(hexToNum(P.ink), 1).fillRect(x - 1, ly - 1, 16, 4);
          bars.fillStyle(0x3a3448, 1).fillRect(x, ly, 14, 2);
          bars.fillStyle(col, 1).fillRect(x, ly, Math.round(14 * frac), 2);
        }
      }
      // levitation ki meter (Goku): a strip under the HP bar while it isn't full / while flying
      const fly = baseAbility(f)?.fly;
      if (fly && !(f.power === 'hero') && (f.flying || f.flyMeter < fly.meter)) {
        const k = Math.max(0, Math.min(1, f.flyMeter / fly.meter));
        const low = k < 0.25 && Math.floor(time * 8) % 2 === 0;
        bars.fillStyle(hexToNum(P.ink), 1).fillRect(x - 1, y + 3, 16, 2);
        bars.fillStyle(0x2a3550, 1).fillRect(x, y + 3, 14, 1);
        bars.fillStyle(low ? 0xff6a5a : 0x8ad8ff, 1).fillRect(x, y + 3, Math.round(14 * k), 1);
      }
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

  /** A helicopter crossing the top of the map (supply drop). */
  heli(x: number): void {
    const dir = x < this.world.map.pxW / 2 ? 1 : -1;
    this.helis.push({ x: x - dir * 260, y: -6, dir });
  }

  private drawGimmicks(alpha: number, dt: number, time: number): void {
    const w = this.world;
    const g = this.gimmickBack;
    const fg = this.gimmickFront;
    g.clear();
    fg.clear();
    // gravity zones
    for (const z of w.gimmicks.gravity) {
      if (!z.active) continue;
      g.fillStyle(hexToNum(P.teal), 0.07).fillRect(z.l, z.t, z.r - z.l, z.b - z.t);
      g.lineStyle(1, hexToNum(P.teal), 0.35);
      for (let x = z.l; x < z.r; x += 8) {
        g.lineBetween(x, z.t, x + 4, z.t);
        g.lineBetween(x, z.b - 1, x + 4, z.b - 1);
      }
      if (dt > 0 && Math.random() < dt * (z.r - z.l) * 0.02) {
        this.fx.spawn({ frame: 'p1', x: z.l + Math.random() * (z.r - z.l), y: z.b - 2, vy: -25 - Math.random() * 20, life: 2, a0: 0.8, a1: 0, tint: hexToNum(P.teal), add: true, depth: 31 });
      }
    }
    // conveyors: moving chevrons along the belt top
    const off = (time * 45) % 4;
    for (const c of this.conveyors) {
      fg.fillStyle(hexToNum(P.yellow), 0.9);
      for (let i = 0; i < 4; i++) {
        const x = c.x + ((i * 4 + (c.dir > 0 ? off : 4 - off)) % 16);
        fg.fillRect(Math.floor(x), c.y + 2, 1, 2);
      }
    }
    // movers
    for (const m of w.gimmicks.movers) {
      const x = Math.round(lerp(m.px, m.x, alpha));
      const y = Math.round(lerp(m.py, m.y, alpha));
      const d = m.def;
      const cx = x + m.w / 2;
      if (d.swing) {
        g.lineStyle(1, hexToNum(P.steel1), 1);
        g.lineBetween(d.x * TILE, d.y * TILE, x + 3, y);
        g.lineBetween(d.x * TILE, d.y * TILE, x + m.w - 3, y);
        g.fillStyle(hexToNum(P.steel2), 1).fillRect(d.x * TILE - 2, d.y * TILE - 2, 4, 4);
      }
      switch (d.kind) {
        case 'girder':
          g.fillStyle(hexToNum(P.red1), 1).fillRect(x, y, m.w, m.h);
          g.fillStyle(hexToNum(P.red0), 1).fillRect(x, y + m.h - 2, m.w, 2);
          g.fillStyle(hexToNum(P.red2), 1).fillRect(x, y, m.w, 1);
          for (let i = x + 4; i < x + m.w - 2; i += 8) g.fillStyle(hexToNum(P.red0), 1).fillRect(i, y + 2, 1, m.h - 4);
          break;
        case 'elevator':
          g.lineStyle(1, hexToNum(P.steel1), 1);
          g.lineBetween(x + 3, 0, x + 3, y - 26);
          g.lineBetween(x + m.w - 3, 0, x + m.w - 3, y - 26);
          g.lineStyle(1, hexToNum(P.brass), 1).strokeRect(x + 0.5, y - 26.5, m.w - 1, 26);
          g.fillStyle(hexToNum(P.brass), 1).fillRect(x, y, m.w, 3);
          g.fillStyle(hexToNum(P.steel1), 1).fillRect(x, y + 3, m.w, m.h - 3);
          break;
        case 'hook':
          g.lineStyle(1, hexToNum(P.steel0), 1);
          for (let cy = (d.swing ? y : 0); cy < y; cy += 3) g.fillStyle(hexToNum(P.steel2), 1).fillRect(cx - 1, cy, 2, 2);
          g.fillStyle(hexToNum(P.yellow), 1).fillRect(x, y, m.w, m.h);
          g.fillStyle(hexToNum(P.ink), 1);
          for (let i = 0; i < m.w; i += 6) g.fillRect(x + i, y + 1, 3, m.h - 2);
          break;
        case 'cart': {
          g.fillStyle(hexToNum(P.wood1), 1).fillRect(x + 1, y, m.w - 2, m.h - 4);
          g.fillStyle(hexToNum(P.steel1), 1).fillRect(x, y, m.w, 2);
          g.fillStyle(hexToNum(P.ink), 1).fillCircle(x + 6, y + m.h - 2, 3).fillCircle(x + m.w - 6, y + m.h - 2, 3);
          g.fillStyle(hexToNum(P.steel3), 1).fillRect(x + 5, y + m.h - 3, 2, 2).fillRect(x + m.w - 7, y + m.h - 3, 2, 2);
          break;
        }
        default:
          g.fillStyle(hexToNum(P.steel2), 1).fillRect(x, y, m.w, m.h);
          g.fillStyle(hexToNum(P.steel4), 1).fillRect(x, y, m.w, 1);
          g.fillStyle(hexToNum(P.yellow), 1);
          for (let i = 0; i < m.w; i += 8) g.fillRect(x + i, y + m.h - 2, 4, 2);
      }
    }
    // hazards
    const blink = Math.floor(time * 10) % 2 === 0;
    for (const h of w.gimmicks.hazards) {
      const d = h.def;
      if (d.kind === 'crusher') {
        const shaftTop = h.y - TILE;
        const blockH = Math.min(14, h.h);
        const by = h.active ? h.y + h.h - blockH : h.y;
        fg.fillStyle(hexToNum(P.steel0), 1).fillRect(h.x + h.w / 2 - 2, shaftTop, 4, by - shaftTop);
        fg.fillStyle(hexToNum(P.steel1), 1).fillRect(h.x, by, h.w, blockH);
        fg.fillStyle(hexToNum(P.steel3), 1).fillRect(h.x, by, h.w, 1);
        for (let i = 0; i < h.w; i += 6) fg.fillStyle(hexToNum(P.yellow), 1).fillRect(h.x + i, by + blockH - 3, 3, 3);
        if (h.warn && blink) fg.fillStyle(hexToNum(P.red2), 0.5).fillRect(h.x, h.y + h.h - 2, h.w, 2);
      } else if (d.kind === 'laser') {
        fg.fillStyle(hexToNum(P.steel1), 1).fillRect(h.x - 1, h.y - 3, h.w + 2, 3).fillRect(h.x - 1, h.y + h.h, h.w + 2, 3);
        const beams = Math.max(1, Math.round(h.w / 6));
        for (let i = 0; i < beams; i++) {
          const bx = h.x + ((i + 0.5) * h.w) / beams;
          if (h.active) {
            fg.lineStyle(2, 0xff2030, 0.55).lineBetween(bx, h.y, bx, h.y + h.h);
            fg.lineStyle(1, 0xffd0d0, blink ? 1 : 0.7).lineBetween(bx, h.y, bx, h.y + h.h);
          } else if (h.warn && blink) fg.lineStyle(1, 0xff2030, 0.35).lineBetween(bx, h.y, bx, h.y + h.h);
          fg.fillStyle(h.active || (h.warn && blink) ? 0xff4040 : 0x602020, 1).fillRect(bx - 1, h.y - 2, 2, 1);
        }
      } else if (d.kind === 'fissure') {
        // glowing crack in the ground; erupts as a column of energy when active
        const gx = h.x;
        const gy = h.y + h.h;
        fg.fillStyle(0x0a0614, 1).fillRect(gx - 1, gy - 2, h.w + 2, 2);
        fg.fillStyle(0x4af0e0, h.warn && blink ? 1 : 0.6).fillRect(gx + 2, gy - 2, h.w - 4, 1);
        if (h.active) {
          for (let i = 0; i < h.w; i += 2) {
            const flick = Math.sin(time * 40 + i) * 3;
            fg.fillStyle(i % 4 ? 0x4af0e0 : 0xc8fff8, 0.85).fillRect(gx + i, h.y + flick, 2, h.h - flick);
          }
          fg.fillStyle(0xffffff, 0.9).fillRect(gx + h.w / 2 - 1, h.y, 2, h.h);
          if (dt > 0 && Math.random() < dt * 40) this.fx.spawn({ frame: 'p2', x: gx + Math.random() * h.w, y: gy - 4, vy: -160 - Math.random() * 120, vx: (Math.random() - 0.5) * 40, life: 0.4, a0: 1, a1: 0, tint: 0x4af0e0, add: true, depth: 62 });
        } else if (h.warn && dt > 0 && Math.random() < dt * 25) {
          this.fx.spawn({ frame: 'p1', x: gx + Math.random() * h.w, y: gy - 3, vy: -40, life: 0.3, a0: 1, a1: 0, tint: 0x4af0e0, add: true, depth: 62 });
        }
      } else if (d.kind === 'tunnel') {
        if (h.active) {
          fg.fillStyle(0x07060c, 1).fillRect(h.x - 40, h.y - 60, 40 + h.w, h.h + 60);
          fg.fillStyle(hexToNum(P.brick1), 1).fillRect(h.x - 40, h.y + h.h - 3, 40 + h.w, 3);
        } else if (h.warn && blink) {
          fg.fillStyle(hexToNum(P.red2), 0.8).fillRect(d.x * TILE + 2, h.y + h.h / 2 - 3, 6, 6);
        }
      }
    }
    // ship cannons: wooden carriage + iron barrel; recoil and a fuse spark while reloading
    for (const c of w.gimmicks.cannons) {
      const dir = c.def.dir;
      const recoil = Math.max(0, 1 - (w.time - c.shotAt) * 4) * 4;
      const bx = Math.round(c.x - dir * recoil);
      const by = c.y;
      g.fillStyle(hexToNum(P.wood1), 1).fillRect(bx - 7, by - 5, 14, 5);
      g.fillStyle(hexToNum(P.ink), 1).fillCircle(bx - 4, by - 1, 2).fillCircle(bx + 4, by - 1, 2);
      g.fillStyle(hexToNum(P.steel0), 1).fillRect(bx - 6 + (dir > 0 ? 0 : -6), by - 10, 18, 5);
      g.fillStyle(hexToNum(P.steel1), 1).fillRect(bx - 6 + (dir > 0 ? 0 : -6), by - 10, 18, 1);
      g.fillStyle(hexToNum(P.steel0), 1).fillRect(dir > 0 ? bx + 11 : bx - 13, by - 11, 2, 7);
      if (c.cd <= 0) {
        // ready: little 'interact' hint glow at the breech
        if (blink) g.fillStyle(hexToNum(P.yellow), 1).fillRect(bx - dir * 8 - 1, by - 12, 2, 2);
      }
    }
    // parachutes on falling supply crates
    for (const p of w.props) {
      if (!p.active || !p.loot || p.grounded) continue;
      const x = lerp(p.px, p.x, alpha);
      const y = lerp(p.py, p.y, alpha) - p.h;
      fg.lineStyle(1, 0xe8e4dc, 0.8).lineBetween(x - 6, y, x - 12, y - 18).lineBetween(x + 6, y, x + 12, y - 18);
      fg.fillStyle(hexToNum(P.red1), 1).fillRect(x - 14, y - 24, 28, 6);
      fg.fillStyle(0xe8e4dc, 1).fillRect(x - 10, y - 26, 20, 3);
      for (let i = -14; i < 14; i += 8) fg.fillStyle(0xe8e4dc, 1).fillRect(x + i, y - 24, 4, 6);
    }
    // supply helicopters
    for (let i = this.helis.length - 1; i >= 0; i--) {
      const h = this.helis[i];
      h.x += h.dir * 170 * dt;
      const x = Math.round(h.x);
      fg.fillStyle(0x101018, 1).fillRect(x - 14, h.y, 28, 9).fillRect(x - 30 * h.dir, h.y + 2, 18 * h.dir, 3);
      fg.fillRect(x - 22, h.y - 3, 44, 1);
      fg.fillStyle(blink ? 0xff3030 : 0x30ff60, 1).fillRect(x - 30 * h.dir, h.y + 1, 2, 2);
      if (Math.abs(h.x - (h.dir > 0 ? -400 : w.map.pxW + 400)) < 10 || h.x > w.map.pxW + 400 || h.x < -400) this.helis.splice(i, 1);
    }
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
      if (f.alive && f.sprintDir !== 0 && f.grounded && Math.random() < dt * 20) this.fx.dust(f.x - f.sprintDir * 4, f.y, 1, 20);
      if (f.alive && f.wallSlide !== 0 && Math.random() < dt * 15) this.fx.dust(f.x + f.wallSlide * 5, f.y - 10, 1, 8);
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
    this.heroFx.destroy();
    this.decor.destroy();
    for (const img of this.items.values()) img.destroy();
    for (const f of this.floats) f.obj.destroy();
    for (const v of this.props.values()) v.img.destroy();
    for (const r of this.rockets) r.destroy();
    this.overlay.destroy();
    this.gimmickBack.destroy();
    this.gimmickFront.destroy();
    this.fx.destroy();
    this.decals.destroy();
    this.tracers.destroy();
    this.bars.destroy();
    this.debugGfx.destroy();
    this.tilemap.destroy();
  }
}
