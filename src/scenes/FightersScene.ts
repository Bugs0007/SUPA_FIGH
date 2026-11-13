import Phaser from 'phaser';
import { PLAYER_PRESETS } from '../art/appearance';
import { dragonFlame } from '../art/charizardMotion';
import { formCount, formLook, heroLook } from '../art/heroArt';
import { pokemonFrame } from '../art/pokemonArt';
import { hexToNum, P } from '../art/palette';
import { audio } from '../audio/AudioManager';
import { VIEW_H, VIEW_W } from '../game/display';
import { menu } from '../input/menu';
import { HERO_ANIME, HERO_ORDER, heroDef, superBombDamage, superFistFor, type HeroAnime } from '../sim/data/heroes';
import { POKEMON_DAMAGE, POKEMON_PARTNERS, pokemonSpecies, pokemonStage, type PokemonSpecies } from '../sim/data/pokemon';
import { HeroLiveGallery } from './HeroLiveGallery';
import { demoMoveName, type DemoMode } from './heroDemo';
import { hint, HintBar, meter } from './kit';
import { bindZoom, fighterPreview } from './ui';

type Group = HeroAnime | 'original';
const THEMES: Record<Group, { name: string; light: number; dark: number }> = {
  naruto: { name: 'NARUTO', light: 0xffac58, dark: 0x452a21 },
  'one-piece': { name: 'ONE PIECE', light: 0xff7972, dark: 0x4a2531 },
  'dragon-ball': { name: 'DRAGON BALL', light: 0x74caff, dark: 0x1b3651 },
  bleach: { name: 'BLEACH', light: 0xf5b8ff, dark: 0x423052 },
  'black-clover': { name: 'BLACK CLOVER', light: 0xa3f0af, dark: 0x234238 },
  pokemon: { name: 'POKEMON', light: 0xffdc69, dark: 0x533b23 },
  original: { name: 'BRAWLKAI', light: 0xffdf8a, dark: 0x473820 },
};

const CARD_W = 148;
const CARD_H = 270;
const CARD_Y = 60;
const CARDS_PER_PAGE = 4;
const FORM_STEP = 1.3;

interface Picker {
  from: string;
  onPick: (hero: string, pokemon?: PokemonSpecies) => void;
  pokemon?: PokemonSpecies;
  dispose: () => void;
}

interface RosterData {
  hero?: string;
  mode?: DemoMode;
  showMoves?: boolean;
  picker?: Picker;
  choosePokemon?: boolean;
}

/** Reuse the same roster in the title, slot editor and room, preserving the caller's state. */
export function openFighterPicker(scene: Phaser.Scene, hero: string, onPick: Picker['onPick'], pokemon?: PokemonSpecies): void {
  const close = () => scene.scene.stop('fighters');
  scene.events.once('shutdown', close);
  const picker: Picker = { from: scene.sys.settings.key, onPick, pokemon, dispose: () => { scene.events.off('shutdown', close); } };
  scene.scene.launch('fighters', { hero, picker } satisfies RosterData);
  scene.scene.sleep();
}

interface Card {
  hero: string;
  x: number;
  portrait: Phaser.GameObjects.Container;
  form: number;
  formText: Phaser.GameObjects.BitmapText;
}

function ultimatePower(id: string): number {
  const h = heroDef(id);
  if (id === 'ash') return POKEMON_DAMAGE.ultimate[3];
  if (!h) return 0;
  const level = h.forms.length;
  const { bomb, beam } = h.super;
  const damage = bomb ? superBombDamage(bomb, level) : beam ? beam.damage[0] + beam.damagePerLevel * (level - 1) : superFistFor(id, level)?.damage ?? 0;
  return damage * h.forms[level - 1].damageMul;
}

function fit(text: Phaser.GameObjects.BitmapText, width: number): void {
  if (text.width > width) text.setScale(text.scaleX * width / text.width);
}

export class FightersScene extends Phaser.Scene {
  private dataIn: RosterData = {};
  private group: Group = 'naruto';
  private hero = '';
  private cards: Card[] = [];
  private gfx!: Phaser.GameObjects.Graphics;
  private bar!: HintBar;
  private gallery: HeroLiveGallery | null = null;
  private partnerIndex = 0;
  private partnerDetails!: Phaser.GameObjects.BitmapText;
  private partnerNames: Phaser.GameObjects.BitmapText[] = [];
  private t = 0;

  constructor() {
    super('fighters');
  }

  private groups(): readonly Group[] {
    return this.dataIn.picker ? ['original', ...HERO_ANIME] : [...HERO_ANIME, 'original'];
  }

  private groupHeroes(group = this.group): string[] {
    return group === 'original' ? [''] : HERO_ORDER.filter(id => heroDef(id)?.anime === group);
  }

  create(data: RosterData = {}): void {
    this.dataIn = data;
    this.hero = heroDef(data.hero)?.id ?? (data.hero === '' || data.picker ? '' : 'naruto');
    this.group = heroDef(this.hero)?.anime ?? 'original';
    this.cards = [];
    this.gallery = null;
    this.t = 0;
    this.cameras.main.setBackgroundColor(P.night);
    if (data.choosePokemon) {
      this.createPartnerPicker();
      return;
    }
    if (data.showMoves) {
      this.gallery = new HeroLiveGallery(this, this.hero, data.mode);
      this.bar = new HintBar(this);
      const hints = [hint.move('MOVE', 'lr'), hint.move('FIGHTER', 'ud')];
      if (this.hero) hints.push(hint.key('FORM', ['Q', 'E'], [4, 5]));
      if (this.hero === 'ash') hints.push(hint.key('PARTNER', ['P'], [2]));
      this.bar.set([...hints, hint.ok('REPLAY'), hint.back('ROSTER')]);
      return;
    }

    bindZoom(this, VIEW_W, VIEW_H);
    this.gfx = this.add.graphics();
    this.add.bitmapText(VIEW_W / 2, 7, 'pxo', data.picker ? 'CHOOSE FIGHTER' : 'FIGHTERS').setOrigin(0.5, 0).setScale(2).setTint(hexToNum(P.yellow));

    const groups = this.groups();
    const tabW = 608 / groups.length;
    const tabs = this.add.graphics();
    groups.forEach((group, i) => {
      const x = 16 + i * tabW;
      const theme = THEMES[group];
      const active = group === this.group;
      tabs.fillStyle(theme.dark, active ? 1 : 0.45).fillRect(x, 33, tabW - 4, 19);
      tabs.fillStyle(theme.light, active ? 1 : 0.28).fillRect(x, 51, tabW - 4, 1);
      this.add.bitmapText(x + (tabW - 4) / 2, 42, 'sm', theme.name).setOrigin(0.5).setTint(active ? theme.light : 0xa5aec7);
      this.add.zone(x, 33, tabW - 4, 20).setOrigin(0).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.changeGroup(group));
    });
    const heroes = this.groupHeroes();
    const start = Math.floor(heroes.indexOf(this.hero) / CARDS_PER_PAGE) * CARDS_PER_PAGE;
    const shown = heroes.slice(start, start + CARDS_PER_PAGE);
    shown.forEach((id, i) => this.buildCard(id, (VIEW_W - shown.length * CARD_W - (shown.length - 1) * 6) / 2 + i * (CARD_W + 6)));

    this.bar = new HintBar(this);
    this.bar.set([hint.move('ANIME', 'ud'), hint.move('FIGHTER', 'lr'), hint.ok(data.picker ? 'SELECT' : 'SEE MOVES'), hint.back('BACK')]);
    this.render();
  }

  private buildCard(hero: string, x: number): void {
    const theme = THEMES[this.group];
    const def = heroDef(hero);
    const cx = x + CARD_W / 2;
    const name = this.add.bitmapText(cx, CARD_Y + 9, 'pxo', def?.name ?? 'SCRAPPER').setOrigin(0.5, 0).setScale(1.55).setTint(theme.light).setDepth(4);
    fit(name, CARD_W - 10);

    const portrait = fighterPreview(this, heroLook(hero, PLAYER_PRESETS[0]), cx, CARD_Y + 155, 4).setDepth(3);
    ['SPEED', 'HEALTH', 'ULT'].forEach((label, i) => this.add.bitmapText(x + 8, CARD_Y + 164 + i * 8, 'sm', label).setTint(0x98a2bc).setDepth(4));
    const rows = [
      ['ABILITY', def?.base.name ?? 'CLASSIC BRAWLER'],
      ['KICK KEY', def?.second.name ?? 'KICK'],
      ['ULTIMATE', def?.super.names.at(-1) ?? 'POWER ORB BOOST'],
      ['SPECIAL', demoMoveName(hero, 'special', 0)],
    ];
    rows.forEach(([label, move], i) => {
      const y = CARD_Y + 193 + i * 15;
      this.add.bitmapText(x + 8, y, 'sm', label).setTint(0x98a2bc).setDepth(4);
      fit(this.add.bitmapText(x + 8, y + 7, 'sm', move).setTint(0xffffff).setDepth(4), CARD_W - 16);
    });
    const formText = this.add.bitmapText(cx, CARD_Y + 257, 'sm', '').setOrigin(0.5).setDepth(4);
    this.cards.push({ hero, x, portrait, form: 0, formText });

    this.add.zone(x, CARD_Y, CARD_W, CARD_H).setOrigin(0).setDepth(7).setInteractive({ useHandCursor: true })
      .on('pointerover', () => this.focus(hero))
      .on('pointerdown', () => { this.focus(hero); this.open(); });
  }

  private focus(hero: string): void {
    if (hero === this.hero) return;
    this.hero = hero;
    this.t = 0;
    audio.play('uiMove');
  }

  private changeGroup(group: Group): void {
    if (group === this.group) return;
    audio.play('uiMove');
    this.scene.restart({ hero: this.groupHeroes(group)[0], picker: this.dataIn.picker } satisfies RosterData);
  }

  private open(): void {
    audio.play('uiOk');
    if (this.dataIn.picker) {
      if (this.hero === 'ash') {
        this.scene.restart({ hero: this.hero, picker: this.dataIn.picker, choosePokemon: true } satisfies RosterData);
        return;
      }
      this.dataIn.picker.onPick(this.hero);
      this.leave();
    } else this.scene.restart({ hero: this.hero, showMoves: true, mode: this.hero ? 'base' : 'special' } satisfies RosterData);
  }

  private createPartnerPicker(): void {
    bindZoom(this, VIEW_W, VIEW_H);
    this.gfx = this.add.graphics();
    this.partnerIndex = POKEMON_PARTNERS.indexOf(pokemonSpecies(this.dataIn.picker?.pokemon));
    this.add.bitmapText(VIEW_W / 2, 15, 'pxo', 'CHOOSE YOUR PARTNER').setOrigin(0.5, 0).setScale(2).setTint(THEMES.pokemon.light);
    this.add.bitmapText(VIEW_W / 2, 41, 'sm', 'DEFAULT PARTNER  /  ADD MORE POKEMON IN MATCH SETUP').setOrigin(0.5, 0).setTint(0xacb9d3);
    this.partnerNames = POKEMON_PARTNERS.map((species, i) => {
      const x = 35 + i % 4 * 144;
      const y = 60 + Math.floor(i / 4) * 99;
      const portrait = this.add.graphics().setPosition(x + 68, y + 61).setScale(3);
      const { sprite, originX, originY, fire } = pokemonFrame(species, 0, 'idle', 0, false);
      for (const run of sprite.runs) portrait.fillStyle(run.c).fillRect(run.x - originX, run.y - originY, run.w, 1);
      if (fire) {
        const flame = dragonFlame(fire.size, 2, false);
        for (const run of flame.runs) {
          portrait.fillStyle(run.c).fillRect(fire.tail[0] + run.x - fire.size - 2, fire.tail[1] + run.y - fire.size - 3, run.w, 1);
        }
      }
      this.add.zone(x, y, 136, 89).setOrigin(0).setInteractive({ useHandCursor: true })
        .on('pointerover', () => this.focusPartner(i))
        .on('pointerdown', () => { this.focusPartner(i); this.confirmPartner(); });
      return this.add.bitmapText(x + 68, y + 75, 'pxo', pokemonStage(species, 0).name).setOrigin(0.5).setScale(1.13);
    });
    this.partnerDetails = this.add.bitmapText(VIEW_W / 2, 274, 'sm', '').setOrigin(0.5, 0).setCenterAlign().setTint(0xe1e9fb);
    this.bar = new HintBar(this);
    this.bar.set([hint.move('PARTNER'), hint.ok('SELECT'), hint.back('ROSTER')]);
    this.focusPartner(this.partnerIndex);
  }

  private focusPartner(index: number): void {
    this.partnerIndex = index;
    this.gfx.clear();
    this.partnerNames.forEach((name, i) => {
      const x = 35 + i % 4 * 144;
      const y = 60 + Math.floor(i / 4) * 99;
      const active = i === index;
      this.gfx.fillStyle(active ? 0x303249 : 0x161e31).fillRect(x, y, 136, 89)
        .lineStyle(active ? 2 : 1, active ? THEMES.pokemon.light : 0x42465e).strokeRect(x, y, 136, 89);
      name.setTint(active ? THEMES.pokemon.light : 0xc3cfe8);
    });
    const species = POKEMON_PARTNERS[index];
    const base = pokemonStage(species, 0);
    const chain = Array.from({ length: base.maxStage + 1 }, (_, i) => pokemonStage(species, i).name).join('  >  ');
    this.partnerDetails.setText([chain, '', 'ABILITY  ' + base.shot + '    KICK  ' + base.dash,
      'ABILITY + KICK  ' + base.ultimate, 'POKE BALL SELECTED   TAP ATTACK SEND / STRIKE   HOLD ATTACK RETURN']);
  }

  private confirmPartner(): void {
    audio.play('uiOk');
    this.dataIn.picker?.onPick('ash', POKEMON_PARTNERS[this.partnerIndex]);
    this.leave();
  }

  private leave(): void {
    if (this.dataIn.picker) {
      this.dataIn.picker.dispose();
      this.scene.wake(this.dataIn.picker.from);
      this.scene.stop();
    } else this.scene.start('title');
  }

  override update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.05);
    this.t += dt;
    const ud = menu.up() ? -1 : menu.down() ? 1 : 0;
    const lr = menu.left() ? -1 : menu.right() ? 1 : 0;
    if (this.dataIn.choosePokemon) {
      if (menu.back()) {
        audio.play('uiBack');
        this.scene.restart({ hero: 'ash', picker: this.dataIn.picker } satisfies RosterData);
      } else if (ud || lr) {
        audio.play('uiMove');
        this.focusPartner((this.partnerIndex + ud * 4 + lr + POKEMON_PARTNERS.length) % POKEMON_PARTNERS.length);
      } else if (menu.confirm()) this.confirmPartner();
      this.bar.update();
      return;
    }
    if (this.gallery) {
      if (menu.back()) {
        audio.play('uiBack');
        this.scene.restart({ hero: this.hero } satisfies RosterData);
      } else if (ud) {
        const heroes = this.groups().flatMap(group => this.groupHeroes(group));
        const hero = heroes[(heroes.indexOf(this.hero) + ud + heroes.length) % heroes.length];
        audio.play('uiMove');
        this.scene.restart({ hero, showMoves: true, mode: this.gallery.currentMode } satisfies RosterData);
      } else if (lr) {
        audio.play('uiMove');
        this.gallery.cycle(lr);
      } else if (menu.confirm()) this.gallery.replay();
      else this.gallery.update();
      this.bar.update();
      return;
    }
    if (menu.back()) {
      audio.play('uiBack');
      this.leave();
      return;
    }
    if (ud) {
      const groups = this.groups();
      this.changeGroup(groups[(groups.indexOf(this.group) + ud + groups.length) % groups.length]);
      return;
    }
    if (lr) {
      const heroes = this.groupHeroes();
      const hero = heroes[(heroes.indexOf(this.hero) + lr + heroes.length) % heroes.length];
      if (this.cards.some(card => card.hero === hero)) this.focus(hero);
      else {
        audio.play('uiMove');
        this.scene.restart({ hero, picker: this.dataIn.picker } satisfies RosterData);
        return;
      }
    }
    if (menu.confirm()) this.open();
    else this.render();
  }

  private render(): void {
    const g = this.gfx;
    // The tabs are retained in their own graphics layer.
    const theme = THEMES[this.group];
    g.clear();
    for (const card of this.cards) {
      const { x, hero } = card;
      const def = heroDef(hero);
      const selected = hero === this.hero;
      const form = selected ? Math.floor(this.t / FORM_STEP) % (formCount(hero) + 1) : 0;
      g.fillStyle(0x161b2a).fillRect(x, CARD_Y, CARD_W, CARD_H);
      g.fillStyle(theme.dark).fillRect(x, CARD_Y, CARD_W, 31);
      g.fillStyle(theme.light, selected ? 0.9 : 0.48).fillRect(x, CARD_Y + 31, CARD_W, 1);
      for (let i = 0; i < 6; i++) g.fillStyle(theme.light, selected ? 0.054 : 0.027).fillRect(x + 7 + i * 6, CARD_Y + 40 + i * 5, CARD_W - 14 - i * 12, 115 - i * 7);
      g.fillStyle(0x0b0d16, 0.75).fillRect(x + 12, CARD_Y + 155, CARD_W - 24, 2);
      g.lineStyle(selected ? 2 : 1, selected ? theme.light : 0x36425a).strokeRect(x + 0.5, CARD_Y + 0.5, CARD_W - 1, CARD_H - 1);
      const values = [((def?.stats.speed ?? 1) - 0.9) / 0.25, ((def?.stats.hp ?? 100) - 80) / 50, ultimatePower(hero) / 140];
      values.forEach((v, i) => meter(g, x + 50, CARD_Y + 167 + i * 8, 86, Phaser.Math.Clamp(v, 0, 1), theme.light));
      if (form !== card.form) {
        card.form = form;
        card.portrait.destroy();
        card.portrait = fighterPreview(this, formLook(hero, form) ?? PLAYER_PRESETS[0], x + CARD_W / 2, CARD_Y + 155, 4).setDepth(3);
      }
      card.portrait.setAlpha(selected ? 1 : 0.84).setY(CARD_Y + 155 + (selected ? Math.round(Math.sin(this.t * 4)) : 0));
      card.formText.setScale(1).setText(form ? def!.forms[form - 1].name : selected ? 'BASE FORM' : '').setTint(theme.light);
      fit(card.formText, CARD_W - 12);
    }
    this.bar.update();
  }
}
