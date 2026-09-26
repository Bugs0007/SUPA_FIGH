import Phaser from 'phaser';
import { P, hexToNum } from '../art/palette';
import type { TileMap } from '../sim/map/tilemap';

interface Particle {
  img: Phaser.GameObjects.Image;
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  drag: number;
  life: number;
  max: number;
  rot: number;
  vr: number;
  s0: number;
  s1: number;
  a0: number;
  a1: number;
  collide: boolean;
  bounce: number;
  /** stamp a decal where it hits a solid, then die */
  stain: boolean;
}

export interface SpawnOpts {
  frame: string;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  g?: number;
  drag?: number;
  life: number;
  rot?: number;
  vr?: number;
  s0?: number;
  s1?: number;
  a0?: number;
  a1?: number;
  tint?: number;
  collide?: boolean;
  bounce?: number;
  stain?: boolean;
  depth?: number;
  add?: boolean;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const BLOOD = [hexToNum(P.blood), hexToNum(P.blood2), hexToNum(P.red1)];

/** Pooled, map-aware particles (Phaser images from the single 'fx' atlas). */
export class Fx {
  private pool: Particle[] = [];
  private cursor = 0;
  gore = true;

  constructor(
    scene: Phaser.Scene,
    private map: TileMap,
    private decals: Phaser.GameObjects.RenderTexture | null,
    size = 900,
  ) {
    for (let i = 0; i < size; i++) {
      const img = scene.add.image(0, 0, 'fx', 'p1').setVisible(false).setActive(false).setDepth(60);
      this.pool.push({
        img,
        alive: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        g: 0,
        drag: 0,
        life: 0,
        max: 1,
        rot: 0,
        vr: 0,
        s0: 1,
        s1: 1,
        a0: 1,
        a1: 1,
        collide: false,
        bounce: 0,
        stain: false,
      });
    }
  }

  destroy(): void {
    for (const p of this.pool) p.img.destroy();
    this.pool.length = 0;
  }

  spawn(o: SpawnOpts): void {
    // round-robin: when full, recycle the oldest slot
    let p: Particle | null = null;
    for (let k = 0; k < this.pool.length; k++) {
      const c = this.pool[(this.cursor + k) % this.pool.length];
      if (!c.alive) {
        p = c;
        this.cursor = (this.cursor + k + 1) % this.pool.length;
        break;
      }
    }
    if (!p) {
      p = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % this.pool.length;
    }
    p.alive = true;
    p.x = o.x;
    p.y = o.y;
    p.vx = o.vx ?? 0;
    p.vy = o.vy ?? 0;
    p.g = o.g ?? 0;
    p.drag = o.drag ?? 0;
    p.life = o.life;
    p.max = o.life;
    p.rot = o.rot ?? 0;
    p.vr = o.vr ?? 0;
    p.s0 = o.s0 ?? 1;
    p.s1 = o.s1 ?? p.s0;
    p.a0 = o.a0 ?? 1;
    p.a1 = o.a1 ?? p.a0;
    p.collide = o.collide ?? false;
    p.bounce = o.bounce ?? 0;
    p.stain = o.stain ?? false;
    p.img
      .setFrame(o.frame)
      .setVisible(true)
      .setActive(true)
      .setPosition(o.x, o.y)
      .setRotation(p.rot)
      .setScale(p.s0)
      .setAlpha(p.a0)
      .setDepth(o.depth ?? 60)
      .setBlendMode(o.add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    if (o.tint !== undefined) p.img.setTint(o.tint);
    else p.img.clearTint();
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        p.img.setVisible(false).setActive(false);
        continue;
      }
      p.vy += p.g * dt;
      if (p.drag > 0) {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      const nx = p.x + p.vx * dt;
      const ny = p.y + p.vy * dt;
      if (p.collide && this.map.solidAtPx(nx, ny)) {
        if (p.stain && this.decals && this.gore) {
          this.decals.stamp('fx', 'splat' + Math.floor(Math.random() * 4), Math.round(nx), Math.round(ny), {
            tint: p.img.tintTopLeft,
            alpha: 0.9,
          });
          p.alive = false;
          p.img.setVisible(false).setActive(false);
          continue;
        }
        if (this.map.solidAtPx(nx, p.y)) p.vx = -p.vx * p.bounce;
        else p.x = nx;
        if (this.map.solidAtPx(p.x, ny)) {
          p.vy = -p.vy * p.bounce;
          p.vx *= 0.7;
          p.vr *= 0.5;
        } else p.y = ny;
      } else {
        p.x = nx;
        p.y = ny;
      }
      p.rot += p.vr * dt;
      const t = 1 - p.life / p.max;
      p.img.setPosition(p.x, p.y).setRotation(p.rot).setScale(p.s0 + (p.s1 - p.s0) * t).setAlpha(p.a0 + (p.a1 - p.a0) * t);
    }
  }

  // ------------------------------------------------------------ recipes

  muzzle(x: number, y: number, angle: number, big: boolean): void {
    this.spawn({ frame: big ? 'flash0' : 'flash1', x, y, rot: angle, life: 0.05, s0: 1, s1: 0.8, depth: 62, add: true });
    for (let i = 0; i < (big ? 6 : 3); i++) {
      const a = angle + rnd(-0.5, 0.5);
      const s = rnd(40, 110);
      this.spawn({ frame: 'puff2', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 10, drag: 6, life: rnd(0.2, 0.4), s0: 0.6, s1: 1.4, a0: 0.5, a1: 0, tint: 0x9a96a8 });
    }
  }

  casing(x: number, y: number, facing: number, shell: boolean): void {
    this.spawn({
      frame: shell ? 'shell' : 'casing',
      x,
      y,
      vx: -facing * rnd(30, 70),
      vy: rnd(-140, -90),
      g: 700,
      life: 1.4,
      vr: rnd(-20, 20),
      collide: true,
      bounce: 0.4,
      depth: 55,
    });
  }

  sparks(x: number, y: number, dx: number, dy: number, n: number, tint = 0xfff4a0, speed = 160): void {
    const base = Math.atan2(dy, dx);
    for (let i = 0; i < n; i++) {
      const a = base + rnd(-0.9, 0.9);
      const s = rnd(speed * 0.4, speed);
      this.spawn({ frame: 'p1', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 400, drag: 3, life: rnd(0.12, 0.3), tint, add: true, depth: 61 });
    }
  }

  blood(x: number, y: number, dx: number, dy: number, n: number): void {
    if (!this.gore) {
      this.sparks(x, y, dx, dy, Math.ceil(n / 2), 0xffffff, 120);
      return;
    }
    const base = Math.atan2(dy, dx);
    for (let i = 0; i < n; i++) {
      const a = base + rnd(-0.7, 0.7);
      const s = rnd(40, 180);
      this.spawn({
        frame: Math.random() < 0.3 ? 'p2' : 'p1',
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 40,
        g: 600,
        life: rnd(0.4, 0.9),
        tint: BLOOD[i % 3],
        collide: true,
        stain: true,
        depth: 58,
      });
    }
  }

  dust(x: number, y: number, n: number, spread = 40): void {
    for (let i = 0; i < n; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      this.spawn({
        frame: Math.random() < 0.5 ? 'puff2' : 'puff3',
        x: x + rnd(-3, 3),
        y: y - 2,
        vx: dir * rnd(spread * 0.3, spread),
        vy: rnd(-25, -5),
        drag: 5,
        life: rnd(0.25, 0.45),
        s0: 0.6,
        s1: 1.2,
        a0: 0.7,
        a1: 0,
        tint: 0xc8bca8,
        depth: 45,
      });
    }
  }

  smoke(x: number, y: number, n: number, tint = 0x5a5668): void {
    for (let i = 0; i < n; i++) {
      this.spawn({
        frame: Math.random() < 0.5 ? 'puff4' : 'puff6',
        x: x + rnd(-4, 4),
        y: y + rnd(-4, 4),
        vx: rnd(-20, 20),
        vy: rnd(-40, -10),
        drag: 2,
        life: rnd(0.5, 1),
        s0: 0.5,
        s1: 1.4,
        a0: 0.6,
        a1: 0,
        tint,
        depth: 57,
      });
    }
  }

  shards(x: number, y: number, n: number, dx = 0): void {
    for (let i = 0; i < n; i++) {
      this.spawn({
        frame: 'shard',
        x: x + rnd(-6, 6),
        y: y + rnd(-6, 6),
        vx: dx * 80 + rnd(-90, 90),
        vy: rnd(-150, 20),
        g: 700,
        life: rnd(0.6, 1.2),
        vr: rnd(-15, 15),
        collide: true,
        bounce: 0.3,
        depth: 59,
      });
    }
  }

  chips(x: number, y: number, n: number, tint?: number): void {
    for (let i = 0; i < n; i++) {
      this.spawn({ frame: 'chip', x, y, vx: rnd(-80, 80), vy: rnd(-140, -40), g: 700, life: rnd(0.4, 0.8), vr: rnd(-20, 20), collide: true, bounce: 0.3, tint });
    }
  }

  hitStar(x: number, y: number, big: boolean): void {
    this.spawn({ frame: 'star', x, y, life: big ? 0.12 : 0.08, s0: big ? 1.6 : 1, s1: 0.4, rot: Math.random() * 3, add: true, depth: 63 });
  }
}
