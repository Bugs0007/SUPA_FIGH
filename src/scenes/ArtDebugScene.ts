import Phaser from 'phaser';
import { Art } from '../art';
import { PLAYER_PRESETS, randomAppearance } from '../art/appearance';
import { armFrame, BF, BODY_FRAMES, FRAME_META } from '../art/fighterArt';
import { WEAPON_ART } from '../art/weaponArt';
import { VIEW_H, VIEW_W } from '../game/display';

/** Dev-only sprite inspector: /?scene=art */
export class ArtDebugScene extends Phaser.Scene {
  constructor() {
    super('art');
  }

  create(): void {
    const k = (this.registry.get('scale') as number) ?? 1;
    this.cameras.main.setZoom(k).centerOn(VIEW_W / 2, VIEW_H / 2).setBackgroundColor('#3a3448');
    const looks = [...PLAYER_PRESETS, randomAppearance(), randomAppearance()];
    const s = 2;
    looks.slice(0, 3).forEach((look, row) => {
      const tex = Art.fighter(this, look);
      for (let i = 0; i < BODY_FRAMES; i++) {
        const x = 12 + (i % 13) * 48;
        const y = 50 + row * 110 + Math.floor(i / 13) * 52;
        const m = FRAME_META[i];
        const c = this.add.container(x + 16, y).setScale(s);
        if (!m.hideArms) c.add(this.add.image(m.bshX - 16, m.bshY - 32, tex.arm, armFrame(1.8, 0)).setTint(0xb0a8c0));
        c.add(this.add.image(0, 0, tex.body, i).setOrigin(0.5, 1).setRotation(0));
        if (!m.hideHead) c.add(this.add.image(m.neckX - 16, m.neckY - 32, tex.head, i === BF.HURT ? 1 : 0).setOrigin(8 / 16, 13 / 16));
        if (!m.hideArms) c.add(this.add.image(m.shX - 16, m.shY - 32, tex.arm, armFrame(i === BF.AIM ? 0 : 1.3, i === BF.AIM ? 1 : 0)));
        this.add.bitmapText(x, y + 2, 'sm', String(i));
      }
    });
    let wx = 12;
    for (const id of Object.keys(WEAPON_ART)) {
      const wf = Art.weapon(id)!;
      this.add.image(wx, 345, wf.key, wf.frame).setOrigin(0, 0.5).setScale(3);
      wx += wf.w * 3 + 12;
    }
  }
}
