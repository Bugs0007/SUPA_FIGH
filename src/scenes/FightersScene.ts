import Phaser from 'phaser';
import { formCount, formLook, HERO_ART } from '../art/heroArt';
import { hexToNum, P } from '../art/palette';
import { audio } from '../audio/AudioManager';
import { VIEW_H, VIEW_W } from '../game/display';
import { menu } from '../input/menu';
import { HEROES, superBombDamage, superFistFor } from '../sim/data/heroes';
import { HeroMoveGallery, MODES, type MoveMode } from './HeroMoveGallery';
import { hint, HintBar, meter } from './kit';
import { bindZoom, fighterPreview } from './ui';

/** The fighters shown as cards, in order (the scrapyard fighter has no powers to show). */
export const CARD_HEROES = ['naruto', 'sasuke', 'luffy', 'goku'] as const;

const THEME: Record<string, { main: number; dark: number; tag: string }> = {
  naruto: { main: 0xf0962a, dark: 0x5a2c0c, tag: 'CLONES / RASENGAN / WALL RUNNER' },
  sasuke: { main: 0x8a64e8, dark: 0x2a1a58, tag: 'CHIDORI / FIRE / SUSANOO ARCHER' },
  luffy: { main: 0xe8504a, dark: 0x58181a, tag: 'RUBBER REACH / GRAPPLES / GEARS' },
  goku: { main: 0x4aa0f0, dark: 0x13305a, tag: 'FLIGHT / KAMEHAMEHA / SPIRIT BOMB' },
};
const CARD_W = 148;
const CARD_H = 296;
const CARD_Y = 36;
const CARD_X = (i: number) => 12 + i * (CARD_W + 6);
const FORM_STEP = 1.3;

/** The hero's whole-body ultimate damage at the top form (for the card's power bar). */
function ultimatePower(hero: string): number {
  const h = HEROES[hero];
  const top = h.forms.length;
  const mul = h.forms[top - 1].damageMul;
  return h.super.kind === 'fist' ? superFistFor(hero, top)!.damage * mul : superBombDamage(h.super.bomb!, top) * mul;
}

/**
 * Fighters: one card per hero (portrait, stat bars, signature moves). Pick one to see its whole moveset animated, form
 * by form (the same rigs and effects as a match), so new players can learn what everyone does before they fight.
 */
export class FightersScene extends Phaser.Scene {
  private sel = 0;
  private gfx!: Phaser.GameObjects.Graphics;
  private bar!: HintBar;
  private portraits: Phaser.GameObjects.Container[] = [];
  private portraitForm: number[] = [];
  private gallery: HeroMoveGallery | null = null;
  private t = 0;
  private hero = '';
  private mode: MoveMode = 'base';

  constructor() {
    super('fighters');
  }

  create(data?: { sel?: number; hero?: string; mode?: MoveMode }): void {
    this.sel = Math.max(0, Math.min(CARD_HEROES.length - 1, data?.sel ?? 0));
    this.t = 0;
    this.portraits = [];
    this.portraitForm = [];
    this.labels = [];
    this.gallery = null;
    this.hero = data?.hero ?? '';
    this.mode = data?.mode ?? 'base';
    if (this.hero) {
      this.cameras.main.setBackgroundColor('#0b101d');
      this.gallery = new HeroMoveGallery(this, this.hero, true, this.mode);
      const bar = (this.bar = new HintBar(this));
      bar.set([hint.move('MOVE', 'lr'), hint.move('FIGHTER', 'ud'), hint.back('ALL FIGHTERS')]);
      return;
    }
    bindZoom(this, VIEW_W, VIEW_H);
    this.cameras.main.setBackgroundColor(P.night);
    this.gfx = this.add.graphics();
    this.add.bitmapText(VIEW_W / 2, 8, 'pxo', 'FIGHTERS').setOrigin(0.5, 0).setScale(2).setTint(hexToNum(P.yellow));
    CARD_HEROES.forEach((hero, i) => this.buildCard(hero, i));
    this.bar = new HintBar(this);
    this.bar.set([hint.move('FIGHTER', 'lr'), hint.ok('SEE MOVES'), hint.back('BACK')]);
    this.render();
  }

  private buildCard(hero: string, i: number): void {
    const x = CARD_X(i);
    const th = THEME[hero];
    const def = HEROES[hero];
    const cx = x + CARD_W / 2;
    this.add.bitmapText(cx, CARD_Y + 8, 'pxo', def.name).setOrigin(0.5, 0).setScale(1.6).setTint(th.main).setDepth(4);
    this.add.bitmapText(cx, CARD_Y + 30, 'sm', th.tag).setOrigin(0.5, 0).setTint(0xc3c9dc).setDepth(4).setScale(0.9);
    this.portraits[i] = fighterPreview(this, HERO_ART[hero].look, cx, CARD_Y + 176, 4).setDepth(3);
    this.portraitForm[i] = 0;
    // the three signature moves
    const rows: [string, string][] = [
      ['ABILITY', def.base.name],
      ['KICK KEY', def.second.name],
      ['ULTIMATE', def.super.names[def.super.names.length - 1]],
    ];
    rows.forEach(([label, name], r) => {
      const y = CARD_Y + 214 + r * 19;
      this.add.bitmapText(x + 8, y, 'sm', label).setTint(0x8d95b0).setDepth(4);
      this.add.bitmapText(x + 8, y + 8, 'sm', name.length > 27 ? name.slice(0, 26) + '.' : name).setTint(0xffffff).setDepth(4);
    });
    this.add.zone(x, CARD_Y, CARD_W, CARD_H).setOrigin(0).setDepth(7).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      if (this.sel !== i) {
        this.sel = i;
        audio.play('uiMove');
      } else this.open();
    }).on('pointerover', () => (this.sel = i));
  }

  private open(): void {
    audio.play('uiOk');
    this.scene.restart({ sel: this.sel, hero: CARD_HEROES[this.sel], mode: 'base' });
  }

  override update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.05);
    this.t += dt;
    if (this.gallery) {
      this.gallery.update(dt);
      if (menu.back()) {
        audio.play('uiBack');
        this.scene.restart({ sel: CARD_HEROES.indexOf(this.hero as (typeof CARD_HEROES)[number]) });
        return;
      }
      if (menu.left() || menu.right()) {
        audio.play('uiMove');
        this.gallery.cycle(menu.left() ? -1 : 1);
        this.mode = MODES[(MODES.indexOf(this.mode) + (menu.left() ? -1 : 1) + MODES.length) % MODES.length];
      }
      const ud = menu.up() ? -1 : menu.down() ? 1 : 0;
      if (ud) {
        audio.play('uiMove');
        const sel = (CARD_HEROES.indexOf(this.hero as (typeof CARD_HEROES)[number]) + ud + CARD_HEROES.length) % CARD_HEROES.length;
        this.scene.restart({ sel, hero: CARD_HEROES[sel], mode: this.mode });
        return;
      }
      this.bar.update();
      return;
    }
    if (menu.back()) {
      audio.play('uiBack');
      this.scene.start('title');
      return;
    }
    if (menu.left() || menu.right()) {
      this.sel = (this.sel + (menu.left() ? -1 : 1) + CARD_HEROES.length) % CARD_HEROES.length;
      audio.play('uiMove');
    }
    if (menu.confirm()) {
      this.open();
      return;
    }
    this.render();
  }

  private render(): void {
    const g = this.gfx;
    g.clear();
    const blink = Math.floor(this.t * 3) % 2 === 0;
    CARD_HEROES.forEach((hero, i) => {
      const x = CARD_X(i);
      const th = THEME[hero];
      const def = HEROES[hero];
      const on = this.sel === i;
      const lift = on ? -4 : 0;
      const y = CARD_Y + lift;
      // card body: dark panel, a coloured banner and spotlight behind the portrait, a bright border when picked
      g.fillStyle(0x161a2a, 1).fillRect(x, y, CARD_W, CARD_H);
      g.fillStyle(th.dark, 1).fillRect(x, y, CARD_W, 44);
      g.fillStyle(th.main, on ? 0.9 : 0.5).fillRect(x, y + 44, CARD_W, 2);
      for (let k = 0; k < 6; k++) g.fillStyle(th.main, (on ? 0.1 : 0.05) * (6 - k)).fillRect(x + 6 + k * 6, y + 54 + k * 5, CARD_W - 12 - k * 12, 118 - k * 10);
      g.fillStyle(0x080a12, 0.6).fillRect(x + 12, y + 176, CARD_W - 24, 3);
      g.lineStyle(on ? 2 : 1, on ? (blink ? 0xffffff : th.main) : 0x3a4060, 1).strokeRect(x + (on ? 1 : 0.5), y + (on ? 1 : 0.5), CARD_W - (on ? 2 : 1), CARD_H - (on ? 2 : 1));
      // stat bars
      const stats: [string, number][] = [
        ['SPEED', (def.stats.speed - 0.9) / 0.25],
        ['HEALTH', (def.stats.hp - 80) / 50],
        ['ULT', ultimatePower(hero) / 140],
      ];
      stats.forEach(([, v], k) => meter(g, x + 52, y + 188 + k * 8, 88, Math.max(0.08, Math.min(1, v)), th.main));
      // the picked card cycles through the hero's forms
      const p = this.portraits[i];
      p.setY(CARD_Y + 176 + lift + (on ? Math.round(Math.sin(this.t * 3)) : 0));
      const form = on ? Math.floor(this.t / FORM_STEP) % (formCount(hero) + 1) : 0;
      if (form !== this.portraitForm[i]) {
        this.portraitForm[i] = form;
        p.destroy();
        this.portraits[i] = fighterPreview(this, formLook(hero, form) ?? HERO_ART[hero].look, x + CARD_W / 2, CARD_Y + 176 + lift, 4).setDepth(3);
      }
      p.setAlpha(on ? 1 : 0.8);
    });
    this.updateLabels();
    this.bar.update();
  }

  private labels: Phaser.GameObjects.BitmapText[] = [];
  /** the stat names and the form name of the picked card (few texts, reused) */
  private updateLabels(): void {
    if (this.labels.length === 0) {
      CARD_HEROES.forEach((_, i) => {
        const x = CARD_X(i);
        ['SPEED', 'HEALTH', 'ULT'].forEach((s, k) => this.labels.push(this.add.bitmapText(x + 8, CARD_Y + 184 + k * 8, 'sm', s).setTint(0x8d95b0).setDepth(4)));
        this.labels.push(this.add.bitmapText(x + CARD_W / 2, CARD_Y + 278, 'sm', '').setOrigin(0.5, 0).setTint(0xffe9a0).setDepth(4));
      });
    }
    CARD_HEROES.forEach((hero, i) => {
      const form = this.portraitForm[i];
      const name = form === 0 ? 'BASE FORM' : HEROES[hero].forms[form - 1].name;
      this.labels[i * 4 + 3].setText(this.sel === i ? name : 'ENTER: SEE MOVES').setTint(this.sel === i ? 0xffe9a0 : 0x5a6078);
    });
  }
}
