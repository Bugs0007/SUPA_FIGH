import Phaser from 'phaser';
import { armFrame, BF, FRAME_META } from '../art/fighterArt';
import { POWER_COLORS } from '../art/heroArt';
import { hexToNum, P } from '../art/palette';
import { SHOULDER_Y_STAND } from '../sim/constants';
import type { Fighter } from '../sim/fighter';
import type { Clone } from '../sim/hero';
import type { World } from '../sim/world';
import type { FighterView } from './FighterView';
import type { Fx } from './Fx';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
/** Particles to emit this frame for a continuous rate (per second). */
const emitCount = (rate: number, dt: number) => Math.floor(rate * dt + Math.random());

const INK = hexToNum(P.ink);
const colorsOf = (power: string): [number, number] => {
  const c = POWER_COLORS[power] ?? [P.white, P.white];
  return [hexToNum(c[0]), hexToNum(c[1])];
};

interface CloneSprite {
  root: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  head: Phaser.GameObjects.Image;
  arm: Phaser.GameObjects.Image;
}

/**
 * Hero power visuals (M9): auras of chunky orbiting pixels, steam/flame/spark motes, stretched rubber
 * limbs, shadow clones, chakra/ki orbs and charge glows. Pixel discs are drawn row by row so they keep
 * hard edges at every zoom.
 */
export class HeroFx {
  private back: Phaser.GameObjects.Graphics;
  private front: Phaser.GameObjects.Graphics;
  private orbs: Phaser.GameObjects.Graphics;
  private clones: CloneSprite[] = [];

  constructor(
    private scene: Phaser.Scene,
    private world: World,
    private views: FighterView[],
    private fx: Fx,
  ) {
    this.back = scene.add.graphics().setDepth(39);
    this.front = scene.add.graphics().setDepth(41);
    this.orbs = scene.add.graphics().setDepth(57);
  }

  destroy(): void {
    this.back.destroy();
    this.front.destroy();
    this.orbs.destroy();
    for (const c of this.clones) c.root.destroy();
  }

  /** Filled pixel disc (hard edges). */
  private disc(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, color: number, alpha = 1): void {
    const x0 = Math.round(cx);
    const y0 = Math.round(cy);
    const rr = Math.max(0.5, r);
    g.fillStyle(color, alpha);
    for (let dy = -Math.floor(rr); dy <= Math.floor(rr); dy++) {
      const half = Math.floor(Math.sqrt(rr * rr - dy * dy) + 0.25);
      g.fillRect(x0 - half, y0 + dy, half * 2 + 1, 1);
    }
  }

  sync(alpha: number, dt: number, time: number): void {
    const b = this.back;
    const fr = this.front;
    b.clear();
    fr.clear();
    for (const v of this.views) {
      const f = v.fighter;
      if (!f.alive || f.gone) continue;
      const x = lerp(f.px, f.x, alpha);
      const y = lerp(f.py, f.y, alpha);
      if (f.power) this.aura(f, x, y, dt, time);
      if (f.stretchLen > 0) this.stretchLimb(v, x, y);
      if (f.charge >= 0) this.chargeGlow(f, x, y, time);
    }
    this.drawClones(time);
    this.drawOrbs(alpha, dt, time);
  }

  private aura(f: Fighter, x: number, y: number, dt: number, time: number): void {
    const [c0, c1] = colorsOf(f.power);
    const expiring = f.powerTime < 3 && Math.floor(time * 10) % 2 === 0;
    if (expiring) return;
    const cy = y - 11;
    const n = f.powerFull ? 10 : 6;
    const rx = f.powerFull ? 10 : 8;
    const ry = f.powerFull ? 14 : 12;
    for (let i = 0; i < n; i++) {
      const a = time * (f.powerFull ? 5 : 3.5) + (i * Math.PI * 2) / n;
      const flick = (Math.floor(time * 24) + i) % 5 === 0;
      if (flick) continue;
      const px = Math.round(x + Math.cos(a) * rx);
      // flame-like: pixels drift upward along the ellipse
      const py = Math.round(cy + Math.sin(a) * ry - Math.abs(Math.cos(a * 0.5)) * 2);
      const g = Math.sin(a) < 0 ? this.back : this.front;
      g.fillStyle(i % 2 ? c1 : c0, 0.9).fillRect(px - 1, py - 1, 2, 2);
    }
    // ground glow under the feet
    this.back.fillStyle(c0, 0.25).fillRect(Math.round(x) - 7, Math.round(y) - 1, 14, 1);
    if (dt <= 0) return;
    const power = f.powerFull ? f.power : '';
    if (power === 'gear2') {
      // pink/white steam puffs
      for (let i = emitCount(14, dt); i > 0; i--) {
        this.fx.spawn({ frame: 'puff3', x: x + rnd(-5, 5), y: y - rnd(4, 20), vx: rnd(-10, 10), vy: rnd(-40, -20), drag: 1.5, life: rnd(0.4, 0.8), s0: 0.4, s1: 1.4, a0: 0.55, a1: 0, tint: Math.random() < 0.5 ? c0 : c1, depth: 42 });
      }
    } else {
      const rate = f.powerFull ? 18 : 6;
      for (let i = emitCount(rate, dt); i > 0; i--) {
        this.fx.spawn({ frame: Math.random() < 0.3 ? 'p2' : 'p1', x: x + rnd(-7, 7), y: y - rnd(0, 22), vx: rnd(-6, 6), vy: rnd(-55, -25), life: rnd(0.25, 0.5), a0: 1, a1: 0, tint: Math.random() < 0.6 ? c0 : c1, add: true, depth: 42 });
      }
    }
  }

  /** Rubber arm (or leg for a stretch kick) from the body out to the current reach. */
  private stretchLimb(v: FighterView, x: number, y: number): void {
    const f = v.fighter;
    const look = f.power && f.powerFull && v.powered ? v.powered : v.look;
    const kick = f.state === 'kick';
    const ly = Math.round(kick ? y - 5 : y - SHOULDER_Y_STAND + 1);
    const x0 = Math.round(x + f.facing * 2);
    const len = Math.round(f.w / 2 + f.stretchLen);
    const x1 = x0 + f.facing * len;
    const l = Math.min(x0, x1);
    const w = Math.abs(x1 - x0);
    const g = this.front;
    const skin = hexToNum(kick ? look.skin : look.skin);
    g.fillStyle(INK, 1).fillRect(l - 1, ly - 2, w + 2, 4);
    g.fillStyle(skin, 1).fillRect(l, ly - 1, w, 2);
    // a few stretch lines along the limb
    g.fillStyle(hexToNum(P.white), 0.5);
    for (let i = 6; i < w - 6; i += 7) g.fillRect(l + i, ly - 1, 2, 1);
    // fist / foot
    const fx0 = x1 - (f.facing > 0 ? 1 : 3);
    g.fillStyle(INK, 1).fillRect(fx0 - 1, ly - 3, 6, 6);
    g.fillStyle(kick ? hexToNum(look.shoesColor) : skin, 1).fillRect(fx0, ly - 2, 4, 4);
  }

  private chargeGlow(f: Fighter, x: number, y: number, time: number): void {
    const [c0, c1] = colorsOf(f.power);
    const k = Math.min(1, f.charge);
    const hx = x + f.facing * 9;
    const hy = y - SHOULDER_Y_STAND + 1;
    const r = 1.5 + k * 3.5 + Math.sin(time * 40) * 0.5;
    this.disc(this.front, hx, hy, r + 1, c0, 0.8);
    this.disc(this.front, hx, hy, r * 0.6, c1, 1);
    if (Math.random() < 0.5) this.fx.spawn({ frame: 'p1', x: hx + rnd(-12, 12), y: hy + rnd(-12, 12), life: 0.15, a0: 1, a1: 0, tint: c1, add: true, depth: 58 });
  }

  private drawOrbs(alpha: number, dt: number, time: number): void {
    const g = this.orbs;
    g.clear();
    for (const bl of this.world.bullets) {
      if (!bl.active || (bl.kind !== 'chakra' && bl.kind !== 'ki')) continue;
      const x = lerp(bl.px, bl.x, alpha);
      const y = lerp(bl.py, bl.y, alpha);
      const r = Math.max(2, bl.size + 1);
      const sp = Math.hypot(bl.vx, bl.vy) || 1;
      if (bl.kind === 'chakra') {
        // dark core, red/orange churning edge
        this.disc(g, x, y, r + 2, hexToNum('#ff7a2a'), 0.85);
        this.disc(g, x, y, r + 1, hexToNum('#c8202a'), 1);
        this.disc(g, x, y, r - 1, hexToNum('#2a0610'), 1);
        for (let i = 0; i < 6; i++) {
          const a = time * 9 + (i * Math.PI) / 3;
          g.fillStyle(i % 2 ? hexToNum('#ff7a2a') : hexToNum('#ffd060'), 1).fillRect(Math.round(x + Math.cos(a) * (r + 2)) - 1, Math.round(y + Math.sin(a) * (r + 2)) - 1, 2, 2);
        }
        for (let i = emitCount(40, dt); i > 0; i--) {
          this.fx.spawn({ frame: 'p2', x: x - (bl.vx / sp) * r, y: y + rnd(-r, r), vx: -bl.vx * 0.15 + rnd(-15, 15), vy: rnd(-20, 20), life: rnd(0.15, 0.3), a0: 1, a1: 0, tint: Math.random() < 0.5 ? hexToNum('#c8202a') : hexToNum('#ff7a2a'), add: true, depth: 56 });
        }
      } else {
        this.disc(g, x, y, r + 1, hexToNum('#7ad8ff'), 0.8);
        this.disc(g, x, y, r, hexToNum('#fff8c0'), 1);
        this.disc(g, x, y, Math.max(1, r - 2), 0xffffff, 1);
        for (let i = emitCount(30 + r * 6, dt); i > 0; i--) {
          this.fx.spawn({ frame: 'p1', x: x - (bl.vx / sp) * r, y: y + rnd(-r, r), vx: -bl.vx * 0.1, vy: rnd(-10, 10), life: rnd(0.1, 0.25), a0: 1, a1: 0, tint: Math.random() < 0.5 ? hexToNum('#7ad8ff') : 0xffffff, add: true, depth: 56 });
        }
      }
    }
  }

  /** Shadow clones: copies of the owner's (powered) sprite in a punch pose, fading in and out. */
  private drawClones(time: number): void {
    let n = 0;
    const meta = FRAME_META[BF.PUNCH];
    for (const c of this.world.clones as Clone[]) {
      if (!c.active) continue;
      const v = this.views[c.owner];
      if (!v) continue;
      const tex = v.poweredTex && this.world.fighters[c.owner].powerFull ? v.poweredTex : v.tex;
      let s = this.clones[n];
      if (!s) {
        const root = this.scene.add.container(0, 0).setDepth(39);
        const body = this.scene.add.image(0, 0, tex.body, BF.PUNCH).setOrigin(0.5, 1);
        const head = this.scene.add.image(0, 0, tex.head, 0).setOrigin(8 / 16, 13 / 16);
        const arm = this.scene.add.image(0, 0, tex.arm, 0);
        root.add([body, head, arm]);
        s = this.clones[n] = { root, body, head, arm };
      }
      n++;
      s.body.setTexture(tex.body, BF.PUNCH);
      s.head.setTexture(tex.head, 0).setPosition(meta.neckX - 16, meta.neckY - 32);
      const striking = c.t > 0.06;
      s.arm.setTexture(tex.arm, armFrame(striking ? 0 : 0.6, striking ? 1 : 0)).setPosition(meta.shX - 16, meta.shY - 32);
      const fade = Math.min(1, c.t / 0.05, (0.38 - c.t) / 0.08);
      s.root
        .setVisible(true)
        .setPosition(Math.round(c.x + c.facing * (striking ? 2 : 0)), Math.round(c.y))
        .setScale(c.facing, 1)
        .setAlpha(Math.max(0, fade) * (0.75 + Math.sin(time * 50) * 0.1));
    }
    for (let i = n; i < this.clones.length; i++) this.clones[i].root.setVisible(false);
  }
}
