import Phaser from 'phaser';
import { FACE_STYLES, HAIR_STYLES, HAT_STYLES, randomAppearance, TOP_STYLES, type Appearance } from '../art/appearance';
import { CLOTH_COLORS, HAIR_COLORS, hexToNum, P, SKIN_TONES } from '../art/palette';
import { audio } from '../audio/AudioManager';
import { VIEW_H, VIEW_W } from '../game/display';
import { keyboard } from '../input/keyboard';
import { menu } from '../input/menu';
import { loadLobby, saveLobby } from './lobby';
import { bindZoom, fighterPreview } from './ui';

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

/** Fighter creator: edit one lobby slot's look part by part with a live 4x preview. */
export class CreatorScene extends Phaser.Scene {
  private slot = 0;
  private look!: Appearance;
  private row = 0;
  private texts: Phaser.GameObjects.BitmapText[] = [];
  private gfx!: Phaser.GameObjects.Graphics;
  private preview: Phaser.GameObjects.Container | null = null;
  private t = 0;

  constructor() {
    super('creator');
  }

  create(data: { slot?: number }): void {
    bindZoom(this, VIEW_W, VIEW_H);
    this.cameras.main.setBackgroundColor(P.night);
    this.slot = data?.slot ?? 0;
    this.look = { ...loadLobby().slots[this.slot].look };
    this.row = 0;
    this.texts = [];
    this.gfx = this.add.graphics();
    this.add.bitmapText(VIEW_W / 2, 8, 'pxo', `FIGHTER ${this.slot + 1}`).setOrigin(0.5, 0).setScale(2).setTint(hexToNum(P.yellow));
    FIELDS.forEach((_, i) => this.texts.push(this.add.bitmapText(300, 48 + i * 22, 'pxo', '')));
    this.texts.push(this.add.bitmapText(300, 48 + FIELDS.length * 22 + 6, 'pxo', 'RANDOMIZE'));
    this.texts.push(this.add.bitmapText(300, 48 + FIELDS.length * 22 + 28, 'pxo', 'DONE'));
    this.add.bitmapText(VIEW_W / 2, VIEW_H - 14, 'sm', 'UP/DOWN: PART   LEFT/RIGHT: CHANGE   R: RANDOMIZE   ENTER/ESC: DONE').setOrigin(0.5, 0).setTint(0xc3c9dc);
    this.rebuildPreview();
    this.render();
  }

  private rebuildPreview(): void {
    this.preview?.destroy();
    this.preview = fighterPreview(this, this.look, 140, 280, 6);
  }

  private save(): void {
    const c = loadLobby();
    c.slots[this.slot].look = this.look;
    saveLobby(c);
  }

  override update(_time: number, deltaMs: number): void {
    this.t += deltaMs / 1000;
    const rows = FIELDS.length + 2;
    if (menu.up()) {
      this.row = (this.row - 1 + rows) % rows;
      audio.play('uiMove');
    }
    if (menu.down()) {
      this.row = (this.row + 1) % rows;
      audio.play('uiMove');
    }
    const lr = menu.left() ? -1 : menu.right() ? 1 : 0;
    let changed = false;
    if (lr && this.row < FIELDS.length) {
      const f = FIELDS[this.row];
      const opts = f.options;
      const cur = opts.indexOf(this.look[f.key] as string);
      (this.look as unknown as Record<string, string>)[f.key] = opts[(cur + lr + opts.length) % opts.length];
      changed = true;
    }
    if (keyboard.justPressed('KeyR') || (menu.confirm() && this.row === FIELDS.length)) {
      this.look = randomAppearance();
      changed = true;
    }
    if (changed) {
      audio.play('uiOk');
      this.save();
      this.rebuildPreview();
    }
    if (menu.back() || (menu.confirm() && this.row === FIELDS.length + 1) || (menu.confirm() && this.row < FIELDS.length)) {
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
    FIELDS.forEach((f, i) => {
      const sel = this.row === i;
      const y = 48 + i * 22;
      if (sel) g.fillStyle(0x3a3054, 1).fillRect(292, y - 4, 300, 16);
      const v = this.look[f.key] as string;
      this.texts[i].setText(`${f.label}: ${f.color ? '' : v.toUpperCase()}`).setTint(sel ? 0xffffff : 0xc3c9dc);
      if (f.color) {
        const x = 300 + this.texts[i].width + 6;
        g.fillStyle(hexToNum(P.ink), 1).fillRect(x - 1, y - 1, 26, 9);
        g.fillStyle(hexToNum(v), 1).fillRect(x, y, 24, 7);
      }
      if (sel) {
        g.fillStyle(0xf8c840, 1).fillTriangle(286, y + 3, 282, y, 282, y + 6);
      }
    });
    const n = FIELDS.length;
    [n, n + 1].forEach((r, k) => {
      const sel = this.row === r;
      const y = 48 + n * 22 + (k === 0 ? 6 : 28);
      if (sel) g.fillStyle(0x3a3054, 1).fillRect(292, y - 4, 300, 16);
      this.texts[r].setTint(sel ? 0xffffff : k === 1 ? hexToNum(P.green2) : 0xc3c9dc);
    });
    if (this.preview) this.preview.y = 280 + Math.round(Math.sin(this.t * 3) * 2);
  }
}
