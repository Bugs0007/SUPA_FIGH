import Phaser from 'phaser';
import { FACE_STYLES, HAIR_STYLES, HAT_STYLES, randomAppearance, TOP_STYLES, type Appearance } from '../art/appearance';
import { CLOTH_COLORS, HAIR_COLORS, hexToNum, P, SKIN_TONES } from '../art/palette';
import { Art } from '../art';
import { armFrame, BF, FRAME_META, type FighterTextures } from '../art/fighterArt';
import { formCount, formFx, formLook, HERO_ART } from '../art/heroArt';
import { drawTails } from '../render/HeroFx';
import { HEROES, HERO_ORDER } from '../sim/data/heroes';
import { audio } from '../audio/AudioManager';
import { VIEW_H, VIEW_W } from '../game/display';
import { keyboard } from '../input/keyboard';
import { menu } from '../input/menu';
import { loadLobby, saveLobby, syncSlotToProfile } from './lobby';
import { bindZoom } from './ui';

const PANTS = ['#2a2a3a', '#1f3a7a', '#3a4a2a', '#4a3a2a', '#1e1e28', '#646b87', '#5a2a28'];
const SHOES = ['#1e1614', '#3a2a20', '#f4f1ea', '#b8283a', '#2a2a3a'];

type Field = { key: keyof Appearance; label: string; options: readonly string[]; color?: boolean };

const FIELDS: Field[] = [
  { key: 'skin', label: 'SKIN', options: SKIN_TONES, color: true },
  { key: 'hair', label: 'HAIR', options: HAIR_STYLES },
  { key: 'hairColor', label: 'HAIR COLOR', options: HAIR_COLORS, color: true },
  { key: 'face', label: 'FACE', options: FACE_STYLES },
  { key: 'hat', label: 'HAT', options: HAT_STYLES },
  { key: 'hatColor', label: 'HAT COLOR', options: CLOTH_COLORS, color: true },
  { key: 'top', label: 'TOP', options: TOP_STYLES },
  { key: 'topColor', label: 'TOP COLOR', options: CLOTH_COLORS, color: true },
  { key: 'accentColor', label: 'ACCENT', options: CLOTH_COLORS, color: true },
  { key: 'pantsColor', label: 'PANTS', options: PANTS, color: true },
  { key: 'shoesColor', label: 'SHOES', options: SHOES, color: true },
];

// rows: 0 = HERO, 1..FIELDS.length = look parts, then RANDOMIZE, DONE
const R_HERO = 0;
const R_FIRST = 1;
const R_RANDOM = FIELDS.length + 1;
const R_DONE = FIELDS.length + 2;
const rowY = (r: number) => (r === R_HERO ? 40 : r < R_RANDOM ? 62 + (r - 1) * 19 : r === R_RANDOM ? 62 + FIELDS.length * 19 + 6 : 62 + FIELDS.length * 19 + 26);

/**
 * Fighter creator: pick a hero (M9) or edit the scrapyard look part by part, with a live animated
 * 6x preview. Heroes show their stats + power and alternate normal/powered in the preview.
 */
export class CreatorScene extends Phaser.Scene {
  private slot = 0;
  private look!: Appearance;
  private hero = '';
  private row = 0;
  private texts: Phaser.GameObjects.BitmapText[] = [];
  private heroText!: Phaser.GameObjects.BitmapText;
  private info: Phaser.GameObjects.BitmapText[] = [];
  private gfx!: Phaser.GameObjects.Graphics;
  private aura!: Phaser.GameObjects.Graphics;
  private preview: { root: Phaser.GameObjects.Container; body: Phaser.GameObjects.Image; head: Phaser.GameObjects.Image; front: Phaser.GameObjects.Image; back: Phaser.GameObjects.Image } | null = null;
  private texNormal: FighterTextures | null = null;
  /** textures of each transformation form (hero only), index 0 = form level 1 */
  private texForms: FighterTextures[] = [];
  private formIdx = 0;
  private t = 0;

  constructor() {
    super('creator');
  }

  create(data: { slot?: number }): void {
    bindZoom(this, VIEW_W, VIEW_H);
    this.cameras.main.setBackgroundColor(P.night);
    this.slot = data?.slot ?? 0;
    const cfg = loadLobby().slots[this.slot];
    this.look = { ...cfg.look };
    this.hero = cfg.hero ?? '';
    this.row = 0;
    this.texts = [];
    this.info = [];
    this.preview = null;
    this.gfx = this.add.graphics();
    this.aura = this.add.graphics().setDepth(0.5);
    this.add.bitmapText(VIEW_W / 2, 8, 'pxo', `FIGHTER ${this.slot + 1}`).setOrigin(0.5, 0).setScale(2).setTint(hexToNum(P.yellow));
    this.heroText = this.add.bitmapText(300, rowY(R_HERO), 'pxo', '');
    FIELDS.forEach((_, i) => this.texts.push(this.add.bitmapText(300, rowY(R_FIRST + i), 'pxo', '')));
    this.texts.push(this.add.bitmapText(300, rowY(R_RANDOM), 'pxo', 'RANDOMIZE'));
    this.texts.push(this.add.bitmapText(300, rowY(R_DONE), 'pxo', 'DONE'));
    for (let i = 0; i < 9; i++) this.info.push(this.add.bitmapText(300, 66 + i * 16, i === 0 ? 'pxo' : 'smo', ''));
    this.add.bitmapText(VIEW_W / 2, VIEW_H - 14, 'sm', 'UP/DOWN: ROW   LEFT/RIGHT: CHANGE   R: RANDOMIZE   ENTER/ESC: DONE').setOrigin(0.5, 0).setTint(0xc3c9dc);
    this.rebuildPreview();
    this.render();
  }

  private get shownLook(): Appearance {
    return HERO_ART[this.hero]?.look ?? this.look;
  }

  private rebuildPreview(): void {
    this.texNormal = Art.fighter(this, this.shownLook);
    this.texForms = [];
    for (let l = 1; l <= formCount(this.hero); l++) this.texForms.push(Art.fighter(this, formLook(this.hero, l)!));
    if (!this.preview) {
      const tex = this.texNormal;
      const root = this.add.container(140, 280).setScale(6).setDepth(1);
      const back = this.add.image(0, 0, tex.arm, 0).setTint(0xb0a8c0);
      const body = this.add.image(0, 0, tex.body, BF.IDLE0).setOrigin(0.5, 1);
      const head = this.add.image(0, 0, tex.head, 0).setOrigin(8 / 16, 13 / 16);
      const front = this.add.image(0, 0, tex.arm, 0);
      root.add([back, body, head, front]);
      this.preview = { root, body, head, front, back };
    }
  }

  /** Tiny animation loop: idle → run → punch; heroes flip between normal and powered. */
  private animatePreview(): void {
    const p = this.preview;
    if (!p || !this.texNormal) return;
    const cycleT = this.t % 4;
    // heroes step through their base look and every transformation form, 3.2 s each
    const steps = this.texForms.length + 1;
    this.formIdx = this.texForms.length ? Math.floor(this.t / 3.2) % steps : 0;
    const level = this.formIdx;
    const powered = level > 0;
    const tex = powered ? this.texForms[level - 1] : this.texNormal;
    let frame: number = Math.floor(this.t * 1.6) % 2 === 0 ? BF.IDLE0 : BF.IDLE1;
    let front = 1.4;
    let back = 1.75;
    let len = 0;
    if (cycleT > 1.5 && cycleT < 3) {
      const k = Math.floor(this.t * 12) % 6;
      frame = BF.RUN0 + k;
      const s = Math.sin((k / 6) * Math.PI * 2);
      front = Math.PI / 2 - s * 0.9;
      back = Math.PI / 2 + s * 0.9;
    } else if (cycleT >= 3 && cycleT < 3.6) {
      frame = BF.PUNCH;
      front = 0;
      len = 1;
    }
    // Naruto's forms 1-3 run on all fours like a fox
    const fox = this.hero === 'naruto' && level >= 1 && level <= 3 && frame !== BF.PUNCH;
    if (fox) {
      const running = frame >= BF.RUN0 && frame <= BF.RUN0 + 5;
      frame = running ? BF.FOX_RUN0 + (Math.floor(this.t * 10) % 4) : Math.floor(this.t * 1.6) % 2 === 0 ? BF.FOX_IDLE0 : BF.FOX_IDLE1;
      front = running ? 1.15 + Math.sin(this.t * 14) * 0.5 : 1.2;
      back = running ? 1.15 - Math.sin(this.t * 14) * 0.5 : 1.05;
      len = 1;
    }
    const m = FRAME_META[frame];
    p.body.setTexture(tex.body, frame);
    p.head.setTexture(tex.head, 0).setPosition(m.neckX - 16, m.neckY - 32);
    p.front.setTexture(tex.arm, armFrame(front, len)).setPosition(m.shX - 16, m.shY - 32);
    p.back.setTexture(tex.arm, armFrame(back, fox ? 1 : 0)).setPosition(m.bshX - 16, m.bshY - 32);
    p.root.y = 280 + Math.round(Math.sin(this.t * 3) * 2);
    // aura + tails while transformed (chunky orbiting pixels, like in a match)
    const g = this.aura.clear();
    if (powered) {
      const fxd = formFx(this.hero, level);
      drawTails(g, fxd, 140, p.root.y, 1, this.t, 6, this.hero === 'naruto' && level <= 3);
      const n = 6 + fxd.power * 3;
      for (let i = 0; i < n; i++) {
        const a = this.t * (3 + fxd.power) + (i * Math.PI * 2) / n;
        const x = 140 + Math.round(Math.cos(a) * (9 + fxd.power)) * 6;
        const y = p.root.y - 66 + Math.round(Math.sin(a) * (13 + fxd.power * 1.5)) * 6;
        g.fillStyle(hexToNum(fxd.aura[i % 2]), 0.9).fillRect(x - 6, y - 6, 12, 12);
      }
    }
  }

  private save(): void {
    const c = loadLobby();
    c.slots[this.slot].look = this.look;
    c.slots[this.slot].hero = this.hero;
    saveLobby(c);
    syncSlotToProfile(c.slots[this.slot]);
  }

  override update(_time: number, deltaMs: number): void {
    this.t += deltaMs / 1000;
    // heroes have a fixed look: only HERO / DONE are selectable
    const selectable = (r: number) => !this.hero || r === R_HERO || r === R_DONE;
    const rows = FIELDS.length + 3;
    const step = (d: number) => {
      do this.row = (this.row + d + rows) % rows;
      while (!selectable(this.row));
      audio.play('uiMove');
    };
    if (menu.up()) step(-1);
    if (menu.down()) step(1);
    const lr = menu.left() ? -1 : menu.right() ? 1 : 0;
    let changed = false;
    if (lr && this.row === R_HERO) {
      const i = HERO_ORDER.indexOf(this.hero as (typeof HERO_ORDER)[number]);
      this.hero = HERO_ORDER[(i + lr + HERO_ORDER.length) % HERO_ORDER.length];
      changed = true;
    } else if (lr && this.row >= R_FIRST && this.row < R_RANDOM) {
      const f = FIELDS[this.row - R_FIRST];
      const opts = f.options;
      const cur = opts.indexOf(this.look[f.key] as string);
      (this.look as unknown as Record<string, string>)[f.key] = opts[(cur + lr + opts.length) % opts.length];
      changed = true;
    }
    if ((keyboard.justPressed('KeyR') && !this.hero) || (menu.confirm() && this.row === R_RANDOM)) {
      this.look = randomAppearance();
      changed = true;
    }
    if (changed) {
      audio.play('uiOk');
      this.save();
      this.rebuildPreview();
    }
    if (menu.back() || (menu.confirm() && this.row !== R_RANDOM)) {
      this.save();
      audio.play('uiBack');
      this.scene.start('lobby');
      return;
    }
    this.render();
  }

  private render(): void {
    const g = this.gfx.clear();
    g.fillStyle(0x221d2e, 1).fillRect(60, 60, 160, 240);
    g.lineStyle(1, 0x4a4060, 1).strokeRect(60.5, 60.5, 159, 239);
    this.animatePreview();
    const hero = HEROES[this.hero];
    {
      const sel = this.row === R_HERO;
      const y = rowY(R_HERO);
      if (sel) g.fillStyle(0x3a3054, 1).fillRect(292, y - 4, 300, 16);
      if (sel) g.fillStyle(0xf8c840, 1).fillTriangle(286, y + 3, 282, y, 282, y + 6);
      this.heroText.setText(`HERO:  < ${hero ? hero.name : 'SCRAPYARD FIGHTER'} >`).setTint(sel ? 0xffffff : hero ? hexToNum(P.orange) : 0xc3c9dc);
    }
    // hero info replaces the part editor
    const lines = hero
      ? [
          hero.name,
          `SPEED ${Math.round(hero.stats.speed * 100)}%   HP ${hero.stats.hp}   COMBO: PUNCH PUNCH PUNCH KICK`,
          `ABILITY (B / NUM1 / P): ${hero.base.name}`,
          hero.base.desc,
          `KICK KEY = ABILITY 2: ${hero.second.name}`,
          hero.second.desc,
          `BOTH ABILITIES = SUPER (TRANSFORMED): ${hero.super.names[0]}...`,
          `POWER ORBS: EACH ONE = NEXT FORM (${hero.forms.length} FORMS)`,
          this.formIdx > 0 ? `NOW SHOWING: ${hero.forms[this.formIdx - 1].name}` : 'NOW SHOWING: BASE FORM',
        ]
      : [];
    this.info.forEach((t, i) => t.setText(lines[i] ?? '').setTint(i === 0 ? hexToNum(P.yellow) : i === 2 || i === 4 ? hexToNum(P.orange) : i === 8 ? hexToNum(P.yellow) : 0xc3c9dc));
    FIELDS.forEach((f, i) => {
      const r = R_FIRST + i;
      const sel = this.row === r;
      const y = rowY(r);
      this.texts[r - 1].setVisible(!hero);
      if (hero) return;
      if (sel) g.fillStyle(0x3a3054, 1).fillRect(292, y - 4, 300, 16);
      const v = this.look[f.key] as string;
      this.texts[r - 1].setText(`${f.label}: ${f.color ? '' : v.toUpperCase()}`).setTint(sel ? 0xffffff : 0xc3c9dc);
      if (f.color) {
        const x = 300 + this.texts[i].width + 6;
        g.fillStyle(hexToNum(P.ink), 1).fillRect(x - 1, y - 1, 26, 9);
        g.fillStyle(hexToNum(v), 1).fillRect(x, y, 24, 7);
      }
      if (sel) {
        g.fillStyle(0xf8c840, 1).fillTriangle(286, y + 3, 282, y, 282, y + 6);
      }
    });
    [R_RANDOM, R_DONE].forEach((r, k) => {
      const sel = this.row === r;
      const y = rowY(r);
      const txt = this.texts[r - 1];
      txt.setVisible(k === 1 || !hero);
      if (k === 0 && hero) return;
      if (sel) g.fillStyle(0x3a3054, 1).fillRect(292, y - 4, 300, 16);
      txt.setTint(sel ? 0xffffff : k === 1 ? hexToNum(P.green2) : 0xc3c9dc);
    });
  }
}
