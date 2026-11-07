import type Phaser from 'phaser';
import { formFx } from '../art/heroArt';
import { hexToNum } from '../art/palette';
import { audio } from '../audio/AudioManager';
import { VIEW_H, VIEW_W } from '../game/display';
import { padMenu } from '../input/gamepad';
import { keyboard } from '../input/keyboard';
import { HEROES } from '../sim/data/heroes';
import { DEMO_FRAME, DEMO_SCENE, type DemoSelection } from './HeroDemoScene';
import { DEMO_MAP, demoModes, demoMoveName, describeDemoMove, minDemoForm, type DemoMode } from './heroDemo';
import { bindZoom } from './ui';

interface Tab {
  x: number;
  w: number;
  y: number;
  text: Phaser.GameObjects.BitmapText;
}

function fit(label: Phaser.GameObjects.BitmapText, width: number, scale = 1): void {
  label.setScale(scale);
  if (label.width > width) label.setScale(scale * width / label.width);
}

const MODE_LABELS: Record<DemoMode, string> = {
  base: 'ABILITY 1', second: 'ABILITY 2', super: 'ULTIMATE', combo: 'COMBO', special: 'SPECIAL', guard: 'GUARD',
};

/** Ability and form selection stays on the menu camera while the arena runs below it. */
export class HeroLiveGallery {
  private readonly modes: readonly DemoMode[];
  private readonly moveTabs: Tab[];
  private readonly formTabs: Tab[];
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.BitmapText;
  private readonly details: Phaser.GameObjects.BitmapText;
  private level = 0;
  private mode: DemoMode;

  constructor(private scene: Phaser.Scene, private hero: string, mode: DemoMode = 'base') {
    this.modes = demoModes(hero);
    this.mode = this.modes.includes(mode) ? mode : 'base';
    bindZoom(scene, VIEW_W, VIEW_H);
    scene.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    this.panel = scene.add.graphics();
    const heroTitle = scene.add.bitmapText(12, 8, 'pxo', HEROES[hero]?.name ?? 'SCRAPPER').setTint(0xffdf8a);
    fit(heroTitle, 345, 2);
    scene.add.bitmapText(625, 14, 'sm', DEMO_MAP.name + ' / LIVE DEMO').setOrigin(1, 0).setTint(0xabb8d1);

    const forms = ['BASE FORM', ...(HEROES[hero]?.forms.map(form => form.name) ?? [])];
    this.moveTabs = this.tabs(this.modes.map((item, i) => (i + 1) + '  ' + MODE_LABELS[item]), 35, i => this.choose(this.modes[i]));
    this.formTabs = this.tabs(forms, 59, i => {
      if (i >= minDemoForm(this.hero, this.mode)) this.choose(this.mode, i);
    });
    this.title = scene.add.bitmapText(12, 308, 'pxo', '').setTint(0xffdf8a);
    this.details = scene.add.bitmapText(12, 325, 'sm', '').setTint(0xc4d3e9).setMaxWidth(616);
    scene.add.bitmapText(627, 309, 'smo', 'REPLAY').setOrigin(1, 0).setTint(0xffdf8a);
    scene.add.zone(548, 305, 80, 18).setOrigin(0).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.replay());
    scene.events.once('shutdown', () => scene.scene.stop(DEMO_SCENE));
    this.choose(this.mode, 0, false);
  }

  private tabs(labels: string[], y: number, activate: (i: number) => void): Tab[] {
    const w = 616 / labels.length;
    return labels.map((label, i) => {
      const x = 12 + i * w;
      const text = this.scene.add.bitmapText(x + (w - 4) / 2, y + 9, 'sm', label).setOrigin(0.5);
      fit(text, w - 12);
      this.scene.add.zone(x, y, w - 4, 18).setOrigin(0).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => activate(i));
      return { x, w: w - 4, y, text };
    });
  }

  get currentMode(): DemoMode {
    return this.mode;
  }

  cycle(d: number): void {
    const i = this.modes.indexOf(this.mode);
    this.choose(this.modes[(i + d + this.modes.length) % this.modes.length]);
  }

  replay(): void {
    this.choose(this.mode, this.level);
  }

  update(): void {
    const keyboardMove = this.modes.findIndex((_, i) => keyboard.justPressed('Digit' + (i + 1)));
    if (keyboardMove >= 0) {
      this.choose(this.modes[keyboardMove]);
      return;
    }
    const formStep = keyboard.justPressed('KeyQ') || padMenu.justPressed(4) ? -1 : keyboard.justPressed('KeyE') || padMenu.justPressed(5) ? 1 : 0;
    if (formStep && this.formTabs.length > 1) {
      const min = minDemoForm(this.hero, this.mode);
      const count = this.formTabs.length - min;
      this.choose(this.mode, min + (this.level - min + formStep + count) % count);
    }
  }

  private choose(mode: DemoMode, level = this.level, sound = true): void {
    this.mode = mode;
    const min = minDemoForm(this.hero, mode);
    this.level = Math.max(min, level);
    if (sound) audio.play('uiOk');
    const accent = this.level ? hexToNum(formFx(this.hero, this.level).aura[1]) : 0x8acbf5;
    const g = this.panel.clear();
    const { x, y, w, h } = DEMO_FRAME;
    g.fillStyle(0x121623).fillRect(0, 0, VIEW_W, y).fillRect(0, y + h, VIEW_W, VIEW_H - y - h);
    g.fillRect(0, y, x, h).fillRect(x + w, y, VIEW_W - x - w, h);
    g.lineStyle(1, 0x52617d).strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
    g.fillStyle(0x273650).fillRect(547, 305, 81, 17);
    this.moveTabs.forEach((tab, i) => this.drawTab(tab, this.modes[i] === mode, false, 0xffdf8a));
    this.formTabs.forEach((tab, i) => this.drawTab(tab, i === this.level, i < min, accent));
    this.title.setText(demoMoveName(this.hero, mode, this.level));
    fit(this.title, 524);
    this.details.setText(describeDemoMove(this.hero, mode, this.level));

    const data: DemoSelection = { hero: this.hero, mode, level: this.level };
    this.scene.scene.stop(DEMO_SCENE);
    this.scene.scene.launch(DEMO_SCENE, data);
    this.scene.scene.sendToBack(DEMO_SCENE);
  }

  private drawTab(tab: Tab, active: boolean, disabled: boolean, color: number): void {
    this.panel.fillStyle(active ? 0x263852 : 0x1d2537).fillRect(tab.x, tab.y, tab.w, 18);
    this.panel.fillStyle(active ? color : 0x35435e).fillRect(tab.x, tab.y + 17, tab.w, 1);
    tab.text.setTint(active ? 0xf8f3e7 : disabled ? 0x687286 : 0xbcc8dd);
  }
}
