import Phaser from 'phaser';
import { hexToNum, P } from '../art/palette';
import { audio } from '../audio/AudioManager';
import { VIEW_H, VIEW_W } from '../game/display';
import { saveSettings, settings, type Settings } from '../game/settings';
import { menu } from '../input/menu';
import { bindZoom } from './ui';

type Row =
  | { label: string; key: keyof Settings; kind: 'pct' }
  | { label: string; key: keyof Settings; kind: 'bool' }
  | { label: string; kind: 'back' };

const ROWS: Row[] = [
  { label: 'MASTER VOLUME', key: 'masterVolume', kind: 'pct' },
  { label: 'SOUND EFFECTS', key: 'sfxVolume', kind: 'pct' },
  { label: 'MUSIC', key: 'musicVolume', kind: 'pct' },
  { label: 'SCREEN SHAKE', key: 'screenShake', kind: 'pct' },
  { label: 'GORE', key: 'gore', kind: 'bool' },
  { label: 'DAMAGE NUMBERS', key: 'damageNumbers', kind: 'bool' },
  { label: 'INSTANT REPLAYS', key: 'replays', kind: 'bool' },
  { label: 'FULLSCREEN', key: 'fullscreen', kind: 'bool' },
  { label: 'UP / W JUMPS', key: 'upJump', kind: 'bool' },
  { label: 'BACK', kind: 'back' },
];

/** Settings. As an overlay (paused match) it stops itself on BACK; otherwise it returns to `from`. */
export class SettingsScene extends Phaser.Scene {
  private row = 0;
  private from = 'title';
  private overlay = false;
  private texts: Phaser.GameObjects.BitmapText[] = [];
  private gfx!: Phaser.GameObjects.Graphics;

  constructor() {
    super('settings');
  }

  create(data: { from?: string; overlay?: boolean }): void {
    this.from = data?.from ?? 'title';
    this.overlay = !!data?.overlay;
    bindZoom(this, VIEW_W, VIEW_H);
    if (!this.overlay) this.cameras.main.setBackgroundColor(P.night);
    this.row = 0;
    this.gfx = this.add.graphics();
    if (this.overlay) this.gfx.fillStyle(0x000000, 0.85).fillRect(0, 0, VIEW_W, VIEW_H);
    this.add.bitmapText(VIEW_W / 2, 24, 'pxo', 'SETTINGS').setOrigin(0.5, 0).setScale(2).setTint(hexToNum(P.yellow));
    this.texts = ROWS.map((_, i) => this.add.bitmapText(VIEW_W / 2 - 120, 76 + i * 24, 'pxo', ''));
    this.add.bitmapText(VIEW_W / 2, VIEW_H - 16, 'sm', 'UP/DOWN: SELECT   LEFT/RIGHT: CHANGE   ESC: BACK').setOrigin(0.5, 0).setTint(0xc3c9dc);
    this.render();
  }

  override update(): void {
    if (menu.back() || (menu.confirm() && ROWS[this.row].kind === 'back')) {
      saveSettings();
      audio.play('uiBack');
      if (this.overlay) this.scene.stop();
      else this.scene.start(this.from);
      return;
    }
    if (menu.up()) {
      this.row = (this.row - 1 + ROWS.length) % ROWS.length;
      audio.play('uiMove');
    }
    if (menu.down()) {
      this.row = (this.row + 1) % ROWS.length;
      audio.play('uiMove');
    }
    const r = ROWS[this.row];
    const lr = menu.left() ? -1 : menu.right() ? 1 : menu.confirm() ? 1 : 0;
    if (lr && r.kind !== 'back') {
      const s = settings as unknown as Record<string, number | boolean>;
      if (r.kind === 'pct') s[r.key] = Math.round(Math.max(0, Math.min(1, (s[r.key] as number) + lr * 0.1)) * 10) / 10;
      else s[r.key] = !s[r.key];
      if (r.key === 'fullscreen') {
        if (settings.fullscreen && !this.scale.isFullscreen) this.scale.startFullscreen();
        else if (!settings.fullscreen && this.scale.isFullscreen) this.scale.stopFullscreen();
      }
      audio.setVolumes(settings.masterVolume, settings.sfxVolume, settings.musicVolume);
      saveSettings();
      audio.play('uiOk');
    }
    this.render();
  }

  private render(): void {
    ROWS.forEach((r, i) => {
      const sel = this.row === i;
      let val = '';
      if (r.kind === 'pct') {
        const v = settings[r.key] as number;
        val = `${'#'.repeat(Math.round(v * 10))}${'.'.repeat(10 - Math.round(v * 10))} ${Math.round(v * 100)}%`;
      } else if (r.kind === 'bool') val = settings[r.key] ? 'ON' : 'OFF';
      this.texts[i].setText(r.kind === 'back' ? 'BACK' : `${r.label.padEnd(16, ' ')} ${val}`).setTint(sel ? 0xffffff : 0x8d95b0);
      if (sel) this.texts[i].setText('> ' + this.texts[i].text);
    });
  }
}
