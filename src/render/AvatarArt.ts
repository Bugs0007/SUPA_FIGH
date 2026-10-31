import type Phaser from 'phaser';
import { armSprite, KURAMA, kuramaSprite, SUSANOO, susanooSprite, type ArmSpec } from '../art/avatarSprites';
import { paintRuns } from '../art/pixelRaster';

type G = Phaser.GameObjects.Graphics;

/** Paints the pixel-art spirits and arms of art/avatarSprites.ts. Local coordinates always face the opponent. */
export class AvatarArt {
  constructor(
    private back: G,
    private front: G,
  ) {}

  /** A spectral or chakra arm from the shoulder, through the elbow, to the fist. */
  arm(g: G, spec: ArmSpec, alpha = 1): void {
    const a = armSprite(spec);
    paintRuns(g, a.baked, a.ox, a.oy, false, alpha);
  }

  /**
   * Sasuke's Susanoo as a bust behind the fighter: bow drawn by `charge` (0..1, -1 / -2 = released). The sprite steps
   * between three flame frames and bobs a pixel, like the fighters' own idle frames.
   */
  susanoo(x: number, y: number, d: number, level: number, alpha: number, time: number, charge = 1): void {
    const lvl = level >= 4 ? 4 : 3;
    const released = charge < 0;
    const stage = released ? 0 : Math.min(SUSANOO.stages - 1, Math.floor(Math.max(0, charge) * SUSANOO.stages));
    const sprite = susanooSprite(lvl, stage, Math.floor(time * 7));
    const bob = Math.floor(time * 3) % 2 === 0 ? 0 : -1;
    // the chest sits just behind the fighter's chest; the hem reaches the feet
    const chestX = Math.round(x - d * 7);
    const chestY = Math.round(y - 22 + bob);
    paintRuns(this.back, sprite, d > 0 ? chestX - SUSANOO.cx : chestX + SUSANOO.cx, chestY - SUSANOO.cy, d < 0, alpha);

    // the bowstring and the nocked arrow are single-pixel lines over the sprite, as in the sprite sheets
    const g = this.front;
    const at = (sx: number, sy: number): [number, number] => [chestX + d * sx, chestY + sy];
    const nock = at(SUSANOO.nockX[stage], SUSANOO.nockY);
    const t = at(SUSANOO.tipTop[0], SUSANOO.tipTop[1]);
    const b = at(SUSANOO.tipBottom[0], SUSANOO.tipBottom[1]);
    g.lineStyle(1, 0xe3d9ff, alpha).lineBetween(t[0], t[1], nock[0], nock[1]).lineBetween(nock[0], nock[1], b[0], b[1]);
    if (!released) {
      const tip = at(41, SUSANOO.nockY);
      g.fillStyle(0xf0ebff, alpha).fillRect(Math.min(nock[0], tip[0]), nock[1], Math.abs(tip[0] - nock[0]) + 1, 1);
      const pulse = Math.floor(time * 12) % 2 === 0;
      g.fillStyle(0xffe27a, alpha);
      for (let i = 0; i < 4; i++) g.fillRect(tip[0] - d * i, tip[1] - (3 - i), 1, (3 - i) * 2 + 1);
      g.fillStyle(pulse ? 0xffffff : 0xfff3b0, alpha).fillRect(tip[0] - (d > 0 ? 1 : 0), tip[1], 2, 1);
    }
  }

  /** Nine-tailed avatar: only exists for Naruto's final ultimate. Its mouth matches the real launch point. */
  kurama(x: number, y: number, d: number, alpha: number, time: number): void {
    const sprite = kuramaSprite(Math.floor(time * 6));
    // the eye sits in front of and above the fighter; the tails and shoulders trail behind
    const ex = Math.round(x + d * KURAMA.eyeAhead);
    const ey = Math.round(y - KURAMA.eyeUp);
    paintRuns(this.back, sprite, d > 0 ? ex - KURAMA.cx : ex + KURAMA.cx, ey - KURAMA.cy, d < 0, alpha);
  }
}
