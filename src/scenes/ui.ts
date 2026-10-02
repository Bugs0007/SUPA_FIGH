import type Phaser from 'phaser';
import { Art } from '../art';
import type { Appearance } from '../art/appearance';
import { armFrame, BF, FRAME_META } from '../art/fighterArt';

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
