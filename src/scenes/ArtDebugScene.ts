import Phaser from 'phaser';
import { Art } from '../art';
import { PLAYER_PRESETS, randomAppearance } from '../art/appearance';
import { armFrame, BF, BODY_FRAMES, FRAME_META } from '../art/fighterArt';
import { WEAPON_ART } from '../art/weaponArt';
import { HERO_ART, poweredLook } from '../art/heroArt';
import { HEROES } from '../sim/data/heroes';
import { VIEW_H, VIEW_W } from '../game/display';

/** Dev-only sprite inspector: /?scene=art (fighters), &page=weapons, &page=heroes */
export class ArtDebugScene extends Phaser.Scene {
  constructor() {
    super('art');
  }

  create(): void {
    const k = (this.registry.get('scale') as number) ?? 1;
    this.cameras.main.setZoom(k).centerOn(VIEW_W / 2, VIEW_H / 2).setBackgroundColor('#3a3448');
    const page = new URLSearchParams(location.search).get('page');
    if (page === 'weapons') {
      this.weaponsPage();
      return;
    }
    if (page === 'heroes') {
      this.heroesPage();
      return;
    }
    const looks = [...PLAYER_PRESETS, randomAppearance(), randomAppearance()];
    const s = 2;
    looks.slice(0, 2).forEach((look, row) => {
      const tex = Art.fighter(this, look);
      for (let i = 0; i < BODY_FRAMES; i++) {
        const x = 12 + (i % 12) * 52;
        const y = 50 + row * 162 + Math.floor(i / 12) * 52;
        const m = FRAME_META[i];
        const c = this.add.container(x + 16, y).setScale(s);
        if (!m.hideArms) c.add(this.add.image(m.bshX - 16, m.bshY - 32, tex.arm, armFrame(1.8, 0)).setTint(0xb0a8c0));
        c.add(this.add.image(0, 0, tex.body, i).setOrigin(0.5, 1).setRotation(0));
        if (!m.hideHead) c.add(this.add.image(m.neckX - 16, m.neckY - 32, tex.head, i === BF.HURT ? 1 : 0).setOrigin(8 / 16, 13 / 16));
        if (!m.hideArms) c.add(this.add.image(m.shX - 16, m.shY - 32, tex.arm, armFrame(i === BF.AIM ? 0 : 1.3, i === BF.AIM ? 1 : 0)));
        this.add.bitmapText(x, y + 2, 'sm', String(i));
      }
    });
    this.add.bitmapText(12, 345, 'sm', 'WEAPONS & PROPS: ?scene=art&page=weapons');
  }

  /** Each hero normal + powered at 1x (true game size) and 4x, in a few poses, next to a scrapyard fighter. */
  private heroesPage(): void {
    const poses = [BF.IDLE0, BF.RUN0 + 1, BF.JUMP, BF.PUNCH, BF.KICK, BF.CROUCH];
    const rows = [{ name: 'SCRAPYARD', look: PLAYER_PRESETS[0] }];
    for (const id of Object.keys(HERO_ART)) {
      rows.push({ name: HEROES[id]?.name ?? id, look: HERO_ART[id].look });
      rows.push({ name: (HEROES[id]?.name ?? id) + ' POWERED', look: poweredLook(id)! });
    }
    rows.forEach((r, row) => {
      const tex = Art.fighter(this, r.look);
      const y = 40 + row * 46;
      this.add.bitmapText(4, y - 30, 'sm', r.name);
      poses.forEach((frame, i) => {
        const m = FRAME_META[frame];
        const scale = i === 0 ? 1 : 1.5;
        const x = i === 0 ? 70 : 110 + i * 70;
        const c = this.add.container(x, y).setScale(scale);
        c.add(this.add.image(m.bshX - 16, m.bshY - 32, tex.arm, armFrame(1.8, 0)).setTint(0xb0a8c0));
        c.add(this.add.image(0, 0, tex.body, frame).setOrigin(0.5, 1));
        c.add(this.add.image(m.neckX - 16, m.neckY - 32, tex.head, 0).setOrigin(8 / 16, 13 / 16));
        c.add(this.add.image(m.shX - 16, m.shY - 32, tex.arm, armFrame(frame === BF.PUNCH ? 0 : 1.3, frame === BF.PUNCH ? 1 : 0)));
      });
    });
  }

  /** Every weapon/prop/projectile sprite at 2x with its id and grip marker. */
  private weaponsPage(): void {
    let x = 10;
    let y = 16;
    let rowH = 0;
    for (const id of Object.keys(WEAPON_ART)) {
      const wf = Art.weapon(id)!;
      const w = Math.max(wf.w * 2, id.length * 4) + 10;
      if (x + w > VIEW_W - 6) {
        x = 10;
        y += rowH + 14;
        rowH = 0;
      }
      this.add.image(x, y, wf.key, wf.frame).setOrigin(0, 0).setScale(2);
      this.add.rectangle(x + wf.gripX * 2 + 1, y + wf.gripY * 2 + 1, 2, 2, 0xff00ff);
      this.add.bitmapText(x, y + wf.h * 2 + 2, 'sm', id.toUpperCase());
      rowH = Math.max(rowH, wf.h * 2 + 8);
      x += w;
    }
  }
}
