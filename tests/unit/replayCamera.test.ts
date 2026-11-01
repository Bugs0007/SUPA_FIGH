import { describe, expect, it } from 'vitest';
import type Phaser from 'phaser';
import { CameraDirector } from '../../src/render/CameraDirector';
import { VIEW_H, VIEW_W } from '../../src/game/display';
import type { World } from '../../src/sim/world';

describe('replay victim camera', () => {
  it('frames the moving victim before and after death, even beyond map bounds', () => {
    let cx = 0, cy = 0, zoom = 1;
    const cam = {
      setZoom(z: number) { zoom = z; },
      centerOn(x: number, y: number) { cx = x; cy = y; },
    } as unknown as Phaser.Cameras.Scene2D.Camera;
    const director = new CameraDirector(cam, 1);
    const world = {
      map: { pxW: 800, pxH: 400 },
      fighters: [{ id: 0, x: 100, y: 200, alive: true, isBot: false, gone: false }],
    } as unknown as World;
    // The survivor stays on the left while the replay victim is launched right, then falls.
    for (const [i, target] of [{ x: 500, y: 200 }, { x: 1100, y: 100 }, { x: 1500, y: 800 }].entries()) {
      director.update(1 / 60, world, { ...target, follow: true, snap: i === 0 });
      expect(target.x).toBeGreaterThan(cx - VIEW_W / zoom / 2);
      expect(target.x).toBeLessThan(cx + VIEW_W / zoom / 2);
      expect(target.y - 40).toBeGreaterThan(cy - VIEW_H / zoom / 2);
      expect(target.y).toBeLessThan(cy + VIEW_H / zoom / 2);
    }
    expect(cx).toBeGreaterThan(world.map.pxW);
    expect(cy).toBeGreaterThan(world.map.pxH);
    // Ending the replay restores normal arena clamping.
    director.update(1 / 60, world, null);
    expect(cx).toBeLessThanOrEqual(world.map.pxW);
    expect(cy).toBeLessThanOrEqual(world.map.pxH);
  });
});
