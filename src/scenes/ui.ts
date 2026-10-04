import type Phaser from 'phaser';
import { Art } from '../art';
import type { Appearance } from '../art/appearance';
import { armFrame, BF, FRAME_META, type FighterTextures } from '../art/fighterArt';
import { hexToNum } from '../art/palette';
import { getMap } from '../sim/map/maps';
import { parseMap } from '../sim/map/mapData';
import { tileDef } from '../sim/map/tiles';

/** Human player colors (P1..P4). */
export const PLAYER_COLORS = [0xea4a4a, 0x4a8af0, 0x5ac85a, 0xf8c840];

/** A standing fighter preview (feet at x, y). Returns the container so callers can bob/destroy it. */
export function fighterPreview(scene: Phaser.Scene, look: Appearance, x: number, y: number, scale = 1): Phaser.GameObjects.Container {
  const tex = Art.fighter(scene, look);
  const meta = FRAME_META[BF.IDLE0];
  const cont = scene.add.container(x, y).setScale(scale);
  cont.add(scene.add.image(meta.bshX - 16, meta.bshY - 32, tex.arm, armFrame(1.75, 0)).setTint(0xb0a8c0));
  cont.add(scene.add.image(0, 0, tex.body, BF.IDLE0).setOrigin(0.5, 1));
  cont.add(scene.add.image(meta.neckX - 16, meta.neckY - 32, tex.head, 0).setOrigin(8 / 16, 13 / 16));
  cont.add(scene.add.image(meta.shX - 16, meta.shY - 32, tex.arm, armFrame(1.4, 0)));
  return cont;
}

/** Integer camera zoom that follows the game's scale factor. */
export function bindZoom(scene: Phaser.Scene, viewW: number, viewH: number): void {
  const apply = (k: number) => scene.cameras.main.setZoom(k).centerOn(viewW / 2, viewH / 2);
  apply((scene.registry.get('scale') as number) ?? 1);
  scene.game.events.on('rescale', apply);
  scene.events.once('shutdown', () => scene.game.events.off('rescale', apply));
}

/**
 * Minimap of a map (solids, glass, wood, platforms, ladders, water, spawns) centered in a box.
 * Returns the drawn size.
 */
export function drawMinimap(g: Phaser.GameObjects.Graphics, mapId: string, x: number, y: number, maxW: number, maxH: number): { w: number; h: number } {
  const pm = parseMap(getMap(mapId));
  const k = Math.max(1, Math.floor(Math.min(maxW / pm.w, maxH / pm.h)));
  const w = pm.w * k;
  const h = pm.h * k;
  const ox = x + Math.floor((maxW - w) / 2);
  const oy = y + Math.floor((maxH - h) / 2);
  g.fillStyle(0x0e0b16, 1).fillRect(ox - 2, oy - 2, w + 4, h + 4);
  for (let ty = 0; ty < pm.h; ty++) {
    for (let tx = 0; tx < pm.w; tx++) {
      const d = tileDef(pm.tiles[ty * pm.w + tx]);
      let c = pm.back[ty * pm.w + tx] ? 0x241e32 : -1;
      if (d.solid) c = d.material === 'glass' ? 0x5fa8c8 : d.material === 'wood' ? 0x94603a : 0x8d95b0;
      else if (d.oneWay) c = 0xb98450;
      else if (d.ladder) c = 0x6e4228;
      else if (d.hazard === 'water') c = 0x2d5a9a;
      if (c >= 0) g.fillStyle(c, 1).fillRect(ox + tx * k, oy + ty * k, k, d.oneWay ? Math.max(1, k >> 1) : k);
    }
  }
  g.fillStyle(0xea4a4a, 1);
  for (const s of pm.spawns) g.fillRect(ox + Math.floor(s.x / 16) * k, oy + (Math.floor(s.y / 16) - 1) * k, k, k);
  return { w, h };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Animated fighter for menus (feet at x, y; integer scale stays crisp). Loops idle -> run -> 3-hit combo
 * -> idle -> (heroes) their signature move: Goku levitates, Naruto forms a Rasengan, Luffy stretches.
 */
export class Puppet {
  readonly root: Phaser.GameObjects.Container;
  private back: Phaser.GameObjects.Image;
  private body: Phaser.GameObjects.Image;
  private head: Phaser.GameObjects.Image;
  private front: Phaser.GameObjects.Image;
  private fx: Phaser.GameObjects.Graphics;
  private tex!: FighterTextures;
  private look!: Appearance;
  private hero = '';
  private t = 0;
  dim = false;

  constructor(
    private scene: Phaser.Scene,
    private x: number,
    private y: number,
    scale: number,
  ) {
    this.root = scene.add.container(x, y).setScale(scale);
    this.fx = scene.add.graphics();
    this.back = scene.add.image(0, 0, '__DEFAULT');
    this.body = scene.add.image(0, 0, '__DEFAULT').setOrigin(0.5, 1);
    this.head = scene.add.image(0, 0, '__DEFAULT').setOrigin(8 / 16, 13 / 16);
    this.front = scene.add.image(0, 0, '__DEFAULT');
    this.root.add([this.back, this.body, this.head, this.front, this.fx]);
  }

  setLook(look: Appearance, hero: string): void {
    this.look = look;
    this.hero = hero;
    this.tex = Art.fighter(this.scene, look);
    this.t = 1.6; // jump straight into a little run + combo so the change is visible
  }

  destroy(): void {
    this.root.destroy();
  }

  update(dt: number): void {
    if (!this.tex) return;
    this.t += dt;
    const loop = this.hero ? 7.2 : 5.2;
    const t = this.t % loop;
    let frame: number = Math.floor(t * 1.4) % 2 === 0 ? BF.IDLE0 : BF.IDLE1;
    let fa = 1.38 + Math.sin(t * 4.4) * 0.06;
    let ba = 1.7;
    let fl = 0;
    let lift = 0;
    let face = 1;
    const g = this.fx.clear();
    if (t >= 2 && t < 3.2) {
      // run in place
      const k = Math.floor(t * 12) % 6;
      frame = BF.RUN0 + k;
      const s = Math.sin((k / 6) * Math.PI * 2);
      fa = Math.PI / 2 - s * 1.05 - 0.25;
      ba = Math.PI / 2 + s * 1.05 - 0.25;
    } else if (t >= 3.2 && t < 4.3) {
      // jab, cross, haymaker
      const c = t - 3.2;
      if (c < 0.06 || (c >= 0.3 && c < 0.36) || (c >= 0.6 && c < 0.7)) {
        frame = BF.WINDUP;
        fa = 0.6;
      } else if (c < 0.3) {
        frame = BF.PUNCH;
        fa = 0;
        fl = 1;
      } else if (c < 0.6) {
        frame = BF.CROSS;
        fa = 1.2;
        ba = 0;
        face = 1;
      } else if (c < 0.95) {
        frame = BF.UPPER;
        fa = lerp(1.3, -1.1, Math.min(1, (c - 0.7) / 0.1));
        fl = 1;
      }
    } else if (this.hero && t >= 5.2) {
      const a = t - 5.2;
      if (this.hero === 'goku') {
        frame = BF.HOVER;
        lift = Math.min(10, a * 30) - (a > 1.7 ? (a - 1.7) * 40 : 0) + Math.sin(a * 5) * 1;
        fa = 1.9;
        ba = 2.25;
        for (let i = 0; i < 4; i++) {
          const py = 1 + ((a * 30 + i * 5) % 12);
          g.fillStyle(i % 2 ? 0xffffff : 0xa8e0ff, 1 - py / 12).fillRect(-2 + (i % 3) * 2, py - lift, 1, 1);
        }
      } else if (this.hero === 'naruto') {
        const forming = a < 0.9;
        frame = forming ? BF.WINDUP : a < 1.4 ? BF.UPPER : BF.CROSS;
        fa = forming ? 0.55 : 0;
        ba = forming ? 0.75 : 2.6;
        fl = 1;
        if (a < 1.4) {
          const m = FRAME_META[frame];
          const hx = Math.round(m.shX - 16 + Math.cos(fa) * 9);
          const hy = Math.round(m.shY - 32 + Math.sin(fa) * 7);
          const r = forming ? 1 + Math.min(1, a / 0.9) * 3 : 4;
          disc(g, hx, hy, r + 1, 0x2a6ad8);
          disc(g, hx, hy, r, 0x7ac8ff);
          disc(g, hx, hy, Math.max(1, r * 0.45), 0xffffff);
        }
      } else if (this.hero === 'luffy') {
        frame = BF.CROSS;
        ba = 1.9;
        const len = a < 0.25 ? (a / 0.25) * 40 : a < 0.6 ? 40 : Math.max(0, 40 * (1 - (a - 0.6) / 0.25));
        const m = FRAME_META[frame];
        const sx = m.shX - 16;
        const sy = m.shY - 32 + 1;
        if (len > 0) {
          const skin = hexToNum(this.look.skin);
          g.fillStyle(0x140f1e, 1).fillRect(sx, sy - 2, len + 2, 4);
          g.fillStyle(skin, 1).fillRect(sx, sy - 1, len, 2);
          g.fillStyle(0x140f1e, 1).fillRect(sx + len - 1, sy - 3, 6, 6);
          g.fillStyle(skin, 1).fillRect(sx + len, sy - 2, 4, 4);
          fa = -100; // hide the regular arm
        }
      }
    }
    const m = FRAME_META[frame];
    this.body.setTexture(this.tex.body, frame).setPosition(0, -lift);
    this.head.setTexture(this.tex.head, 0).setPosition(m.neckX - 16, m.neckY - 32 - lift);
    this.back.setTexture(this.tex.arm, armFrame(ba, 0)).setPosition(m.bshX - 16, m.bshY - 32 - lift).setTint(0xb0a8c0);
    this.front.setVisible(fa > -50);
    if (fa > -50) this.front.setTexture(this.tex.arm, armFrame(fa, fl)).setPosition(m.shX - 16, m.shY - 32 - lift);
    this.root.setScale(Math.abs(this.root.scaleX) * face, this.root.scaleY).setPosition(this.x, this.y);
    this.root.setAlpha(this.dim ? 0.35 : 1);
  }
}

/** Filled pixel disc with hard edges. */
function disc(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, color: number): void {
  g.fillStyle(color, 1);
  for (let dy = -Math.floor(r); dy <= Math.floor(r); dy++) {
    const half = Math.floor(Math.sqrt(r * r - dy * dy) + 0.25);
    g.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
  }
}
