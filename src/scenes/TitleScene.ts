import Phaser from 'phaser';
import { Art } from '../art';
import { PLAYER_PRESETS, type Appearance } from '../art/appearance';
import { armFrame, BF, FRAME_META } from '../art/fighterArt';
import { hexToNum, P } from '../art/palette';
import { audio } from '../audio/AudioManager';
import { VIEW_H, VIEW_W } from '../game/display';
import { keyboardBinds, keyLabel, type Action } from '../input/bindings';
import { keyboard } from '../input/keyboard';
import { saveSettings, settings } from '../game/settings';
import { defaultSetup } from './MatchScene';

const DIFF_ORDER = ['easy', 'normal', 'hard', 'expert'] as const;

const PLAYER_COLORS = [0xea4a4a, 0x4a8af0];

/** Title + controls cards. M7 replaces this with the full menu and live bot battle. */
export class TitleScene extends Phaser.Scene {
  private bots = settings.quickBots;
  private diffIdx = Math.max(0, DIFF_ORDER.indexOf(settings.botDifficulty));
  private dummyText!: Phaser.GameObjects.BitmapText;
  private prompt!: Phaser.GameObjects.BitmapText;
  private t = 0;
  private sparks: { x: number; y: number; vy: number; img: Phaser.GameObjects.Image }[] = [];

  constructor() {
    super('title');
  }

  create(): void {
    const k = (this.registry.get('scale') as number) ?? 1;
    this.applyZoom(k);
    this.game.events.on('rescale', this.applyZoom, this);
    this.events.once('shutdown', () => this.game.events.off('rescale', this.applyZoom, this));
    this.cameras.main.setBackgroundColor(P.night);

    // drifting embers
    for (let i = 0; i < 40; i++) {
      const img = this.add.image(Math.random() * VIEW_W, Math.random() * VIEW_H, 'fx', 'p1').setTint(i % 3 === 0 ? 0xf07a2a : 0xf8c840).setAlpha(0.6);
      this.sparks.push({ x: img.x, y: img.y, vy: 10 + Math.random() * 25, img });
    }

    const g = this.add.graphics();
    // skyline silhouette
    g.fillStyle(hexToNum(P.shadow), 1);
    let x = 0;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    while (x < VIEW_W) {
      const w = 20 + rnd() * 40;
      const h = 40 + rnd() * 90;
      g.fillRect(x, VIEW_H - h, w, h);
      x += w + 2;
    }
    g.fillStyle(hexToNum(P.ink), 1).fillRect(0, VIEW_H - 24, VIEW_W, 24);

    this.add.bitmapText(VIEW_W / 2 + 3, 43, 'px', 'SCRAPYARD').setOrigin(0.5).setScale(6).setTint(hexToNum(P.red0));
    this.add.bitmapText(VIEW_W / 2, 40, 'pxo', 'SCRAPYARD').setOrigin(0.5).setScale(6).setTint(hexToNum(P.yellow));
    this.add.bitmapText(VIEW_W / 2 + 3, 91, 'px', 'RIOT').setOrigin(0.5).setScale(6).setTint(hexToNum(P.red0));
    this.add.bitmapText(VIEW_W / 2, 88, 'pxo', 'RIOT').setOrigin(0.5).setScale(6).setTint(hexToNum(P.red2));
    this.add.bitmapText(VIEW_W / 2, 122, 'smo', 'A PIXEL-ART PARTY BRAWLER FOR UP TO 10 FIGHTERS').setOrigin(0.5).setTint(0xc3c9dc);

    this.card(0, 20, 146, PLAYER_PRESETS[0]);
    this.card(1, VIEW_W - 20 - 280, 146, PLAYER_PRESETS[1]);

    this.prompt = this.add.bitmapText(VIEW_W / 2, 312, 'pxo', 'ENTER: QUICK MATCH').setOrigin(0.5).setScale(2);
    this.add.bitmapText(VIEW_W / 2, 330, 'smo', 'L: MATCH SETUP (TEAMS, GAMEPADS, MODES)     C: CONTROLS').setOrigin(0.5).setTint(0xfff4a0);
    this.dummyText = this.add.bitmapText(VIEW_W / 2, 344, 'smo', '').setOrigin(0.5).setTint(0xc3c9dc);
    this.updateDummyText();
  }

  private applyZoom(k: number): void {
    this.cameras.main.setZoom(k);
    this.cameras.main.centerOn(VIEW_W / 2, VIEW_H / 2);
  }

  private updateDummyText(): void {
    this.dummyText.setText(`QUICK MATCH BOTS: ${this.bots} (0-8)     DIFFICULTY: ${DIFF_ORDER[this.diffIdx].toUpperCase()} (TAB)`);
  }

  private card(idx: number, x: number, y: number, look: Appearance): void {
    const g = this.add.graphics();
    const color = PLAYER_COLORS[idx];
    g.fillStyle(hexToNum(P.ink), 0.85).fillRect(x, y, 280, 150);
    g.lineStyle(1, color, 1).strokeRect(x + 0.5, y + 0.5, 279, 149);
    g.fillStyle(color, 1).fillRect(x, y, 280, 12);
    this.add.bitmapText(x + 6, y + 3, 'sm', `PLAYER ${idx + 1} - KEYBOARD`).setTint(hexToNum(P.ink));

    // fighter preview at 3x
    const tex = Art.fighter(this, look);
    const px = x + 40;
    const py = y + 110;
    const meta = FRAME_META[BF.IDLE0];
    const s = 3;
    const cont = this.add.container(px, py).setScale(s);
    cont.add(this.add.image(meta.bshX - 16, meta.bshY - 32, tex.arm, armFrame(1.75, 0)).setTint(0xb0a8c0));
    cont.add(this.add.image(0, 0, tex.body, BF.IDLE0).setOrigin(0.5, 1));
    cont.add(this.add.image(meta.neckX - 16, meta.neckY - 32, tex.head, 0).setOrigin(8 / 16, 13 / 16));
    cont.add(this.add.image(meta.shX - 16, meta.shY - 32, tex.arm, armFrame(1.4, 0)));
    this.tweens.add({ targets: cont, y: py - 2, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    const b = keyboardBinds[idx];
    const keys = (a: Action) => b[a].map(keyLabel).join(' / ');
    const rows: [string, string][] = [
      ['MOVE', `${keys('up')} ${keys('left')} ${keys('down')} ${keys('right')}`],
      ['JUMP', `${keys('jump')} (OR UP)`],
      ['ATTACK', `${keys('attack')}  HOLD = AIM`],
      ['KICK', keys('kick')],
      ['GRAB/PICK UP', keys('interact')],
      ['SWITCH GUN', keys('cycle')],
    ];
    rows.forEach(([label, val], i) => {
      this.add.bitmapText(x + 84, y + 22 + i * 13, 'sm', label).setTint(0x8d95b0);
      this.add.bitmapText(x + 150, y + 22 + i * 13, 'sm', val).setTint(0xffffff);
    });
    this.add.bitmapText(x + 84, y + 104, 'sm', 'GUNS: HOLD ATTACK, UP/DOWN AIMS,').setTint(0xc3c9dc);
    this.add.bitmapText(x + 84, y + 112, 'sm', 'LET GO TO FIRE. SMGS SPRAY WHILE HELD.').setTint(0xc3c9dc);
    this.add.bitmapText(x + 84, y + 124, 'sm', 'DOWN WHILE RUNNING = ROLL  DOWN+JUMP =').setTint(0xc3c9dc);
    this.add.bitmapText(x + 84, y + 132, 'sm', 'DROP  DOWN IN AIR = DIVE  2X JUMP, WALL').setTint(0xc3c9dc);
    this.add.bitmapText(x + 84, y + 140, 'sm', `JUMP  2X TAP = SPRINT  ${keys('gadget')} = MEDKIT`).setTint(0xc3c9dc);
  }

  override update(_t: number, deltaMs: number): void {
    const dt = deltaMs / 1000;
    this.t += dt;
    this.prompt.setAlpha(Math.floor(this.t * 2.5) % 2 === 0 ? 1 : 0.35);
    for (const s of this.sparks) {
      s.y -= s.vy * dt;
      s.x += Math.sin(this.t * 2 + s.vy) * 6 * dt;
      if (s.y < -4) {
        s.y = VIEW_H + 4;
        s.x = Math.random() * VIEW_W;
      }
      s.img.setPosition(Math.round(s.x), Math.round(s.y));
    }
    for (let d = 0; d <= 8; d++) {
      if (keyboard.justPressed('Digit' + d) || keyboard.justPressed('Numpad' + d)) {
        this.bots = d;
        settings.quickBots = d;
        saveSettings();
        this.updateDummyText();
        audio.play('uiMove');
      }
    }
    if (keyboard.justPressed('Tab')) {
      this.diffIdx = (this.diffIdx + 1) % DIFF_ORDER.length;
      settings.botDifficulty = DIFF_ORDER[this.diffIdx];
      saveSettings();
      this.updateDummyText();
      audio.play('uiMove');
    }
    if (keyboard.justPressed('KeyL')) {
      audio.play('uiOk');
      this.scene.start('lobby');
      return;
    }
    if (keyboard.justPressed('KeyC')) {
      audio.play('uiOk');
      this.scene.start('controls', { from: 'title' });
      return;
    }
    if (keyboard.justPressed('Enter') || keyboard.justPressed('Space') || keyboard.justPressed('NumpadEnter')) {
      audio.play('uiOk');
      const params = new URLSearchParams(location.search);
      params.set('bots', String(this.bots));
      params.set('diff', DIFF_ORDER[this.diffIdx]);
      this.scene.start('match', defaultSetup(params));
    }
  }
}
