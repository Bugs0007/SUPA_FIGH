import Phaser from 'phaser';
import { Art } from '../art';
import { PLAYER_PRESETS, randomAppearance } from '../art/appearance';
import { armFrame, BF, BODY_FRAMES, FRAME_META } from '../art/fighterArt';
import { WEAPON_ART } from '../art/weaponArt';
import { formCount, formLook, HERO_ART } from '../art/heroArt';
import { HEROES } from '../sim/data/heroes';
import { VIEW_H, VIEW_W } from '../game/display';
import { HeroMoveGallery } from './HeroMoveGallery';
import { drawTails } from '../render/HeroFx';
import { formFx } from '../art/heroArt';

/** Dev-only sprite inspector: /?scene=art (fighters), &page=weapons, &page=heroes */
export class ArtDebugScene extends Phaser.Scene {
  private gallery: HeroMoveGallery | null = null;
  constructor() {
    super('art');
  }

  create(): void {
    this.gallery = null;
    const k = (this.registry.get('scale') as number) ?? 1;
    this.cameras.main.setZoom(k).centerOn(VIEW_W / 2, VIEW_H / 2).setBackgroundColor('#3a3448');
    const page = new URLSearchParams(location.search).get('page');
    if (page === 'moves') {
      const hero = new URLSearchParams(location.search).get('hero') ?? 'naruto';
      this.cameras.main.setBackgroundColor('#0b101d');
      this.gallery = new HeroMoveGallery(this, Object.hasOwn(HERO_ART, hero) ? hero : 'naruto');
      return;
    }
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

  override update(_time: number, delta: number): void {
    this.gallery?.update(Math.min(delta / 1000, 0.05));
  }

  /** Every hero: base look + each transformation form (idle, 3x) and the last form punching and kicking. */
  private heroesPage(): void {
    let row = 0;
    for (const id of Object.keys(HERO_ART)) {
      const y = 78 + row * 86;
      this.add.bitmapText(4, y - 70, 'sm', HEROES[id]?.name ?? id);
      const looks = [HERO_ART[id].look, ...Array.from({ length: formCount(id) }, (_, i) => formLook(id, i + 1)!)];
      looks.forEach((look, i) => {
        const tex = Art.fighter(this, look);
        const beast = id === 'naruto' && (i === 2 || i === 3);
        const frame = beast ? BF.FOX_IDLE0 : BF.IDLE0;
        const m = FRAME_META[frame];
        const x = 40 + i * 62;
        const c = this.add.container(x, y).setScale(2);
        if (id === 'naruto' && i > 0) {
          const tails = this.add.graphics();
          drawTails(tails, formFx(id, i), 0, 0, 1, 0, 1, beast);
          c.add(tails);
        }
        c.add(this.add.image(m.bshX - 16, m.bshY - 32, tex.arm, armFrame(1.8, 0)).setTint(0xb0a8c0));
        c.add(this.add.image(0, 0, tex.body, frame).setOrigin(0.5, 1));
        c.add(this.add.image(m.neckX - 16, m.neckY - 32, tex.head, 0).setOrigin(8 / 16, 13 / 16));
        c.add(this.add.image(m.shX - 16, m.shY - 32, tex.arm, armFrame(beast ? 1.2 : 1.15, beast ? 1 : 0)));
        const label = i === 0 ? 'BASE' : HEROES[id].forms[i - 1].name.replace('SUPER SAIYAN', 'SSJ').replace(' CLOAK', '').replace(' FORM', '').replace(' / PERFECT SUSANOO', '').replace('MANGEKYO SHARINGAN', 'MANGEKYO');
        this.add.bitmapText(x, y + 4, 'sm', label).setOrigin(0.5, 0);
      });
      const last = Art.fighter(this, looks[looks.length - 1]);
      [BF.PUNCH, BF.KICK].forEach((frame, i) => {
        const m = FRAME_META[frame];
        const c = this.add.container(380 + i * 70, y).setScale(2);
        c.add(this.add.image(m.bshX - 16, m.bshY - 32, last.arm, armFrame(1.8, 0)).setTint(0xb0a8c0));
        c.add(this.add.image(0, 0, last.body, frame).setOrigin(0.5, 1));
        c.add(this.add.image(m.neckX - 16, m.neckY - 32, last.head, 0).setOrigin(8 / 16, 13 / 16));
        c.add(this.add.image(m.shX - 16, m.shY - 32, last.arm, armFrame(frame === BF.PUNCH ? 0 : 1.3, frame === BF.PUNCH ? 1 : 0)));
      });
      row++;
    }
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
