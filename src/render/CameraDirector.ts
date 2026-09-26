import type Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../game/display';
import type { World } from '../sim/world';

/**
 * Smart shared camera: keeps every living fighter in frame with smooth zoom, clamps to the map,
 * supports cinematic focus (slow-mo) and trauma-based screen shake.
 */
export class CameraDirector {
  x = 0;
  y = 0;
  z = 1;
  private trauma = 0;
  private shakeT = 0;
  shakeScale = 1;
  private first = true;

  constructor(
    private cam: Phaser.Cameras.Scene2D.Camera,
    public baseZoom: number,
  ) {}

  addTrauma(v: number): void {
    this.trauma = Math.min(1, this.trauma + v * this.shakeScale);
  }

  update(dt: number, w: World, focus: { x: number; y: number } | null): void {
    const map = w.map;
    const mapW = map.pxW;
    const mapH = map.pxH;

    let l = Infinity;
    let r = -Infinity;
    let t = Infinity;
    let b = -Infinity;
    let n = 0;
    for (const f of w.fighters) {
      if (f.gone || (!f.alive && f.stateTime > 1.2)) continue;
      l = Math.min(l, f.x);
      r = Math.max(r, f.x);
      t = Math.min(t, f.y - 24);
      b = Math.max(b, f.y);
      n++;
    }
    if (n === 0) {
      l = r = mapW / 2;
      t = b = mapH / 2;
    }
    const padX = 70;
    const padY = 56;
    const bw = r - l + padX * 2;
    const bh = b - t + padY * 2;
    let tx = (l + r) / 2;
    let ty = (t + b) / 2;

    const zFitMap = Math.max(VIEW_W / mapW, VIEW_H / mapH);
    const zMin = Math.max(0.55, Math.min(1, zFitMap));
    const zMax = 1.7;
    let tz = Math.min(VIEW_W / bw, VIEW_H / bh);
    tz = Math.max(zMin, Math.min(zMax, tz));

    if (focus) {
      tx = focus.x;
      ty = focus.y - 10;
      tz = Math.max(tz * 1.35, 1.7);
    }

    if (this.first) {
      this.x = tx;
      this.y = ty;
      this.z = tz;
      this.first = false;
    }
    const kz = 1 - Math.exp(-dt * (focus ? 6 : 2.5));
    const kp = 1 - Math.exp(-dt * (focus ? 8 : 5));
    this.z += (tz - this.z) * kz;
    this.x += (tx - this.x) * kp;
    this.y += (ty - this.y) * kp;

    // clamp to map (or center when the view is bigger than the map)
    const halfW = VIEW_W / this.z / 2;
    const halfH = VIEW_H / this.z / 2;
    const cx = halfW * 2 >= mapW ? mapW / 2 : Math.max(halfW, Math.min(mapW - halfW, this.x));
    const cy = halfH * 2 >= mapH ? mapH / 2 : Math.max(halfH, Math.min(mapH - halfH, this.y));

    // shake
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.shakeT += dt * 60;
    const s = this.trauma * this.trauma;
    const ox = s * 7 * noise(this.shakeT, 1);
    const oy = s * 7 * noise(this.shakeT, 2);

    this.cam.setZoom(this.baseZoom * this.z);
    this.cam.centerOn(cx + ox, cy + oy);
  }
}

function noise(t: number, seed: number): number {
  return Math.sin(t * 1.7 + seed * 10) * 0.6 + Math.sin(t * 3.1 + seed * 4) * 0.4;
}
