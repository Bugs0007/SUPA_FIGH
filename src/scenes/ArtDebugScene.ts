import Phaser from 'phaser';
import { Art } from '../art';
import { PLAYER_PRESETS, randomAppearance } from '../art/appearance';
import { ARM_GUARD, armFrame, BF, BODY_FRAMES, FRAME_META } from '../art/fighterArt';
import { WEAPON_ART } from '../art/weaponArt';
import { formCount, formLook, HERO_ART } from '../art/heroArt';
import { avatarLaunch, HEROES, ULT_WINDUP } from '../sim/data/heroes';
import { AvatarArt, bijudamaGather, SPIRIT_FORM } from '../render/AvatarArt';
import { airBob } from '../art/finalSpiritArt';
import { paintRuns } from '../art/pixelRaster';
import { KURAMA_OPTIONS, SUSANOO_OPTIONS, type SpiritOption } from '../art/spiritOptions';
import { VIEW_H, VIEW_W } from '../game/display';
import { HeroMoveGallery } from './HeroMoveGallery';
import { drawTails } from '../render/HeroFx';
import { formFx } from '../art/heroArt';

/** greedy word wrap into lines of at most `max` characters */
function wrapNote(text: string, max: number): string {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && (line + ' ' + word).length > max) {
      out.push(line);
      line = word;
    } else line = line ? line + ' ' + word : word;
  }
  out.push(line);
  return out.join(String.fromCharCode(10));
}

/** Dev-only sprite inspector: /?scene=art (fighters), &page=weapons, &page=heroes */
export class ArtDebugScene extends Phaser.Scene {
  private gallery: HeroMoveGallery | null = null;
  constructor() {
    super('art');
  }

  create(): void {
    this.gallery = null;
    this.spiritAvatars = null;
    this.optionGfx = null;
    this.optionSprites = [];
    this.spiritFighter = null;
    this.spiritGfx = null;
    const k = (this.registry.get('scale') as number) ?? 1;
    this.cameras.main.setZoom(k).centerOn(VIEW_W / 2, VIEW_H / 2).setBackgroundColor('#3a3448');
    const page = new URLSearchParams(location.search).get('page');
    if (page === 'moves') {
      const hero = new URLSearchParams(location.search).get('hero') ?? 'naruto';
      this.cameras.main.setBackgroundColor('#0b101d');
      this.gallery = new HeroMoveGallery(this, Object.hasOwn(HERO_ART, hero) ? hero : 'naruto');
      return;
    }
    if (page === 'options') {
      this.optionsPage();
      return;
    }
    if (page === 'spirits') {
      this.spiritsPage();
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
        const guard = i === BF.GUARD;
        if (!m.hideArms) c.add(this.add.image(m.bshX - 16, m.bshY - 32, tex.arm, guard ? ARM_GUARD + 1 : armFrame(1.8, 0)).setTint(0xb0a8c0));
        c.add(this.add.image(0, 0, tex.body, i).setOrigin(0.5, 1).setRotation(0));
        if (!m.hideHead) c.add(this.add.image(m.neckX - 16, m.neckY - 32, tex.head, i === BF.HURT ? 1 : 0).setOrigin(8 / 16, 13 / 16));
        if (!m.hideArms) c.add(this.add.image(m.shX - 16, m.shY - 32, tex.arm, guard ? ARM_GUARD : armFrame(i === BF.AIM ? 0 : 1.3, i === BF.AIM ? 1 : 0)));
        this.add.bitmapText(x, y + 2, 'sm', String(i));
      }
    });
    this.add.bitmapText(12, 345, 'sm', 'WEAPONS & PROPS: ?scene=art&page=weapons');
  }

  override update(_time: number, delta: number): void {
    this.gallery?.update(Math.min(delta / 1000, 0.05));
    if (this.spiritAvatars) this.drawSpirits(Math.min(delta / 1000, 0.05));
    if (this.optionGfx) this.drawOptions(Math.min(delta / 1000, 0.05));
  }

  private optionSprites: { opt: SpiritOption; x: number; y: number }[] = [];
  private optionGfx: Phaser.GameObjects.Graphics | null = null;
  private optionTime = 0;

  /** Design studies: ?scene=art&page=options&spirit=susanoo|kurama shows five takes side by side (see art/spiritOptions.ts). */
  private optionsPage(): void {
    this.cameras.main.setBackgroundColor('#141a2a');
    const which = new URLSearchParams(location.search).get('spirit') === 'kurama' ? KURAMA_OPTIONS : SUSANOO_OPTIONS;
    const cols = Math.max(1, Math.floor(VIEW_W / which[0].w));
    this.optionGfx = this.add.graphics();
    this.optionTime = 0;
    this.optionSprites = which.map((opt, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = Math.round(VIEW_W / cols / 2 + col * (VIEW_W / cols));
      const y = (which === SUSANOO_OPTIONS ? 168 : 128 + row * 162);
      this.add.bitmapText(x, y + 6, 'smo', opt.name).setOrigin(0.5, 0).setTint(0xffdf8a);
      this.add.bitmapText(x, y + 17, 'sm', wrapNote(opt.note, 28)).setOrigin(0.5, 0).setTint(0xa5b7d2).setCenterAlign();
      return { opt, x, y };
    });
  }

  private drawOptions(dt: number): void {
    this.optionTime += dt;
    const f = Math.floor(this.optionTime * 6) % 4;
    const g = this.optionGfx!;
    g.clear();
    for (const { opt, x, y } of this.optionSprites) paintRuns(g, opt.bake(f), x - opt.ax, y - opt.ay);
  }

  private spiritAvatars: AvatarArt | null = null;
  private spiritGfx: Phaser.GameObjects.Graphics | null = null;
  private spiritTime = 0;

  /**
   * The big spirits as the match draws them: ?scene=art&page=spirits&spirit=susanoo4|susanoo3|kurama, optionally
   * `charge=0..1` to freeze the wind-up at a point (else it loops: forming, drawing, firing) and `aim` (radians).
   */
  private spiritsPage(): void {
    this.cameras.main.setBackgroundColor('#141a2a');
    this.spiritGfx = this.add.graphics();
    this.spiritAvatars = new AvatarArt(this.spiritGfx, this.spiritGfx);
    this.spiritTime = 0;
    const q = new URLSearchParams(location.search);
    const zoom = Number(q.get('zoom')) || 1;
    const k = (this.registry.get('scale') as number) ?? 1;
    const which = q.get('spirit') ?? 'susanoo4';
    if (zoom !== 1) this.cameras.main.setZoom(k * zoom).centerOn(which === 'kurama' ? 250 : 220, 300 - 70 + (Number(q.get('cy')) || 0));
  }

  private drawSpirits(dt: number): void {
    const g = this.spiritGfx!;
    const q = new URLSearchParams(location.search);
    const which = q.get('spirit') ?? 'susanoo4';
    const aim = Number(q.get('aim')) || 0;
    // ?air=1: the airborne posture (the fighter hovers 70 px up)
    const air = q.get('air') === '1';
    const fixed = q.get('charge');
    this.spiritTime += dt;
    const loop = ULT_WINDUP + 1.6;
    const t = this.spiritTime % loop;
    const charge = fixed !== null ? Number(fixed) : Math.min(1, t / ULT_WINDUP);
    g.clear();
    g.fillStyle(0x2a3350, 1).fillRect(0, 300, VIEW_W, 60);
    const x = which === 'kurama' ? 250 : 220;
    const y = air ? 230 : 300;
    // the fighter it forms around
    const look = which === 'kurama' ? HERO_ART.naruto.look : HERO_ART.sasuke.look;
    const tex = Art.fighter(this, look);
    if (!this.spiritFighter) {
      this.spiritFighter = this.add.image(x, y, tex.body, BF.IDLE0).setOrigin(0.5, 1).setDepth(5);
    }
    const sinceShot = fixed === null && t > ULT_WINDUP ? t - ULT_WINDUP : -1;
    if (which === 'kurama') {
      const tilt = this.spiritAvatars!.kurama(x, y, 1, sinceShot > 0.3 ? Math.max(0, 1 - (sinceShot - 0.3) / 0.4) : 1, this.spiritTime, charge >= SPIRIT_FORM.end, aim, charge, Math.max(0, sinceShot), air);
      const gather = bijudamaGather(charge);
      if (sinceShot < 0 && gather.k > 0) {
        const m = avatarLaunch('naruto', 4, aim + tilt);
        this.spiritAvatars!.bijudama(g, x + m.ahead, y - m.up + (air ? airBob(this.spiritTime) : 0), 9.5 * gather.size, gather.k, this.spiritTime);
      }
    }
    else this.spiritAvatars!.susanoo(x, y, 1, which === 'susanoo3' ? 3 : 4, sinceShot > 0.3 ? Math.max(0, 1 - (sinceShot - 0.3) / 0.4) : 1, this.spiritTime, charge, sinceShot, aim, air);
  }

  private spiritFighter: Phaser.GameObjects.Image | null = null;

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
