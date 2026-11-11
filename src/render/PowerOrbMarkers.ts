import type Phaser from 'phaser';
import { POWER_ORB } from '../sim/data/heroes';
import type { World } from '../sim/world';

const GOLD = 0xffd76a;
const INK = 0x21152d;
const NOTICE_TIME = 2.1;

export class PowerOrbMarkers {
  private readonly ink: Phaser.GameObjects.Graphics;
  private readonly notices = new Map<number, { born: number; label: Phaser.GameObjects.BitmapText }>();

  constructor(private readonly scene: Phaser.Scene) {
    this.ink = scene.add.graphics().setDepth(89);
  }

  destroy(): void {
    this.ink.destroy();
    for (const { label } of this.notices.values()) label.destroy();
    this.notices.clear();
  }

  update(world: World, camera: Phaser.Cameras.Scene2D.Camera, alpha: number, time: number): void {
    const g = this.ink;
    g.clear();
    const unit = ((this.scene.registry.get('scale') as number) || 1) / camera.zoom;
    const cx = camera.scrollX + camera.width / 2, cy = camera.scrollY + camera.height / 2;
    const halfW = camera.width / (2 * camera.zoom), halfH = camera.height / (2 * camera.zoom);
    const edgeX = Math.max(unit, halfW - 20 * unit), edgeY = Math.max(unit, halfH - 33 * unit);
    const active = new Set<number>();
    for (const orb of world.items) {
      if (!orb.active || orb.weaponId !== POWER_ORB) continue;
      active.add(orb.id);
      let notice = this.notices.get(orb.id);
      if (!notice) {
        const label = this.scene.add.bitmapText(0, 0, 'sm', 'POWER ORB').setOrigin(0.5, 1).setDepth(90);
        notice = { born: time, label };
        this.notices.set(orb.id, notice);
      }
      const age = time - notice.born;
      const x = orb.px + (orb.x - orb.px) * alpha, y = orb.py + (orb.y - orb.py) * alpha - orb.h / 2;
      const dx = x - cx, dy = y - cy;
      const offscreen = Math.abs(dx) >= halfW - 5 * unit || Math.abs(dy) >= halfH - 5 * unit;
      notice.label.setVisible(!offscreen && age < NOTICE_TIME);

      if (offscreen) {
        const t = Math.min(edgeX / Math.max(0.001, Math.abs(dx)), edgeY / Math.max(0.001, Math.abs(dy)));
        const direction = Math.hypot(dx, dy) || 1;
        const ux = dx / direction, uy = dy / direction;
        const ax = cx + dx * t, ay = cy + dy * t;
        const pulse = 1 + Math.sin(age * 9) * 0.12;
        const arrow = (length: number, width: number, c: number) => g.fillStyle(c).fillTriangle(
          ax + ux * length * unit, ay + uy * length * unit,
          ax + (-ux * 3 - uy * width) * unit, ay + (-uy * 3 + ux * width) * unit,
          ax + (-ux * 3 + uy * width) * unit, ay + (-uy * 3 - ux * width) * unit);
        arrow(12 * pulse, 7, INK);
        arrow(9 * pulse, 4, GOLD);
        this.diamond(ax - ux * 7 * unit, ay - uy * 7 * unit, unit * 5);
      } else if (age < NOTICE_TIME) {
        const fade = Math.min(1, (NOTICE_TIME - age) * 3);
        const rise = 15 + Math.sin(age * 8) * 2;
        this.diamond(x, y - rise * unit, 4.5 * unit, fade);
        const r = (7 + 13 * Math.min(age, 1)) * unit;
        g.lineStyle(unit, GOLD, fade * 0.6).strokeEllipse(x, y, r * 2, r * 1.1);
        notice.label.setPosition(Math.max(cx - halfW + 35 * unit, Math.min(cx + halfW - 35 * unit, x)),
          Math.max(cy - halfH + 15 * unit, y - (rise + 7) * unit)).setScale(unit).setTint(GOLD).setAlpha(fade);
      }
    }
    for (const [id, { label }] of this.notices) {
      if (active.has(id)) continue;
      label.destroy();
      this.notices.delete(id);
    }
  }

  private diamond(x: number, y: number, size: number, alpha = 1): void {
    const g = this.ink;
    for (const [s, color] of [[size, INK], [size * 0.7, GOLD]] as const) {
      g.fillStyle(color, alpha).fillTriangle(x, y - s, x - s, y, x + s, y);
      g.fillTriangle(x, y + s, x - s, y, x + s, y);
    }
  }
}
