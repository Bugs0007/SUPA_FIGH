import Phaser from 'phaser';
import { hash2 } from '../art/canvas';
import { hexToNum } from '../art/palette';
import { bakeValleyFalls, bakeValleyScenery, FALLS, RIVER, VALLEY_COLORS as C, VALLEY_WEATHER, valleyTerrainKey } from '../art/valleyArt';
import type { World } from '../sim/world';

/** Falls scroll speeds (px/s), river shimmer drift and splash tuning: visual only. */
const FX = { body: 72, streaks: 150, drift: 9, splashSpeed: 45, landSpeed: 160, rain: 70 };

interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

/**
 * Valley of the End motion (theme 'valley'): the waterfall scrolls behind the stone (the stone is re-drawn on top of
 * it from the baked terrain texture), foam churns at its foot, mist drifts, and the river surface sits IN FRONT of
 * fighters so anyone standing in the river is shin-deep, kicking up splashes as they move or land.
 */
export class ValleyFx {
  private body: Phaser.GameObjects.TileSprite;
  private streaks: Phaser.GameObjects.TileSprite;
  private terrain: Phaser.GameObjects.Image;
  private back: Phaser.GameObjects.Graphics;
  private front: Phaser.GameObjects.Graphics;
  private drops: Drop[] = [];
  private lastVy: number[] = [];
  private last = 0;

  constructor(private scene: Phaser.Scene, private world: World) {
    const f = bakeValleyFalls(scene);
    bakeValleyScenery(scene, world.def);
    const top = FALLS.crest + 3;
    const h = RIVER.y - top;
    this.body = scene.add.tileSprite(FALLS.x0, top, f.w, h, f.body).setOrigin(0, 0).setDepth(0.6);
    this.streaks = scene.add.tileSprite(FALLS.x0, top, f.w, h, f.streaks).setOrigin(0, 0).setDepth(0.61);
    this.terrain = scene.add.image(0, 0, valleyTerrainKey(world.def)).setOrigin(0, 0).setDepth(0.7);
    this.back = scene.add.graphics().setDepth(21);
    this.front = scene.add.graphics().setDepth(45);
  }

  update(time: number, alpha: number): void {
    const dt = Math.min(0.1, Math.max(0, time - this.last));
    this.last = time;
    this.body.tilePositionY = -Math.floor(time * FX.body) % 128;
    this.streaks.tilePositionY = -Math.floor(time * FX.streaks) % 128;

    // foam churning at the foot of the falls, and mist rising off it (behind fighters, over the rocks)
    const g = this.back.clear();
    const fw = FALLS.x1 - FALLS.x0;
    for (let i = 0; i < 34; i++) {
      const x = Math.round(FALLS.x0 - 8 + hash2(i, 1, 5) * (fw + 16));
      const y = Math.round(RIVER.y + Math.sin(time * (3 + hash2(i, 2, 5) * 3) + i) * 2);
      const r = 3 + Math.floor(hash2(i, 3, 5) * 4);
      // a rounded pixel blob: rows narrowing toward the top
      g.fillStyle(hexToNum(i % 3 ? C.foam : C.w3), 0.9);
      for (let k = 0; k < r; k++) g.fillRect(x - r + k, y - k, (r - k) * 2, 1);
      g.fillRect(x - r, y + 1, r * 2, 1);
    }
    // mist: pale pixels drifting up off the foot of the falls
    for (let i = 0; i < 48; i++) {
      const p = (time * (0.15 + hash2(i, 9, 6) * 0.1) + hash2(i, 4, 6)) % 1;
      const x = FALLS.x0 - 10 + hash2(i, 5, 6) * (fw + 20) + Math.sin(time * 0.6 + i) * 10;
      g.fillStyle(hexToNum(C.foam), 0.45 * (1 - p)).fillRect(Math.round(x), Math.round(RIVER.y - 6 - p * 110), i % 3 ? 1 : 2, 1);
    }
    // spray off the shelf in the middle of the falls
    for (let i = 0; i < 8; i++) {
      const p = (time * 1.6 + hash2(i, 7, 2)) % 1;
      const x = 37 * 16 + hash2(i, 8, 2) * 96;
      g.fillStyle(hexToNum(C.foam), 0.7 * (1 - p)).fillRect(Math.round(x + (i % 2 ? 1 : -1) * p * 14), Math.round(27 * 16 - 3 + p * p * 18), 2, 2);
    }

    // the river surface in front of the fighters (they stand shin-deep), shimmer drifting downstream
    const fr = this.front.clear();
    const h = this.world.map.pxH - RIVER.y;
    fr.fillStyle(hexToNum(C.w1), 0.62).fillRect(RIVER.x0, RIVER.y + 1, RIVER.x1 - RIVER.x0, h);
    fr.fillStyle(hexToNum(C.w3), 0.8).fillRect(RIVER.x0, RIVER.y, RIVER.x1 - RIVER.x0, 1);
    for (let i = 0; i < 40; i++) {
      const span = RIVER.x1 - RIVER.x0;
      const x = RIVER.x0 + ((hash2(i, 1, 9) * span + time * FX.drift * (1 + hash2(i, 2, 9))) % span);
      const y = RIVER.y + 2 + Math.floor(hash2(i, 3, 9) * (h - 4));
      const on = Math.sin(time * 2 + i * 1.7) > -0.2;
      if (on) fr.fillStyle(hexToNum(i % 4 ? C.w2 : C.w3), 0.75).fillRect(Math.round(x), y, 4 + (i % 3) * 3, 1);
    }

    // splashes: moving or landing in the river
    this.world.fighters.forEach((f, i) => {
      const prev = this.lastVy[i] ?? 0;
      this.lastVy[i] = f.vy;
      if (!f.alive || f.gone || dt <= 0) return;
      const x = f.px + (f.x - f.px) * alpha;
      const y = f.py + (f.y - f.py) * alpha;
      if (x < RIVER.x0 || x > RIVER.x1 || y < RIVER.y - 2 || y > RIVER.y + 12) return;
      const landing = f.grounded && prev > FX.landSpeed;
      const n = landing ? 10 : Math.abs(f.vx) > FX.splashSpeed && Math.random() < dt * 14 ? 1 : 0;
      for (let k = 0; k < n; k++) {
        this.drops.push({ x: x + (Math.random() - 0.5) * 10, y: RIVER.y, vx: (Math.random() - 0.5) * 90 - f.vx * 0.2, vy: -60 - Math.random() * (landing ? 120 : 60), life: 0.5 });
      }
    });
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.life -= dt;
      d.vy += 500 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.life <= 0 || d.y > RIVER.y + 2) {
        this.drops.splice(i, 1);
        continue;
      }
      fr.fillStyle(hexToNum(C.foam), 0.9).fillRect(Math.round(d.x), Math.round(d.y), 2, 2);
    }
    if (VALLEY_WEATHER === 'rain') {
      const view = this.scene.cameras.main.worldView;
      fr.fillStyle(0xb8c8d4, 0.35);
      for (let i = 0; i < 90; i++) {
        const x = view.x + ((hash2(i, 1, 3) * view.width - time * FX.rain * 0.4) % view.width + view.width) % view.width;
        const y = view.y + ((hash2(i, 2, 3) * view.height + time * FX.rain * 6) % view.height);
        fr.fillRect(Math.round(x), Math.round(y), 1, 5);
      }
    }
  }

  destroy(): void {
    this.body.destroy();
    this.streaks.destroy();
    this.terrain.destroy();
    this.back.destroy();
    this.front.destroy();
  }
}
