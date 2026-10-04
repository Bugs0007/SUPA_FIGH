import Phaser from 'phaser';
import { bakeBackground, BACKGROUNDS } from '../art/backgroundArt';
import { heroLook } from '../art/heroArt';
import { hexToNum, P } from '../art/palette';
import { audio } from '../audio/AudioManager';
import { music } from '../audio/music';
import { VIEW_H, VIEW_W } from '../game/display';
import { NAME_MAX, profiles, sanitizeName, saveProfiles } from '../game/profiles';
import { saveSettings, settings } from '../game/settings';
import { keyboardBinds, keyLabel, type Action } from '../input/bindings';
import { keyboard } from '../input/keyboard';
import { menu } from '../input/menu';
import { HERO_ORDER, HEROES } from '../sim/data/heroes';
import { getMap, MAP_LIST } from '../sim/map/maps';
import { loadLobby, saveLobby } from './lobby';
import { defaultSetup } from './MatchScene';
import { drawMinimap, PLAYER_COLORS, Puppet } from './ui';

const DIFF_ORDER = ['easy', 'normal', 'hard', 'expert'] as const;

const BUTTONS = [
  { label: 'QUICK MATCH', action: 'quick' },
  { label: 'MATCH SETUP', action: 'lobby' },
  { label: 'CONTROLS', action: 'controls' },
  { label: 'SETTINGS', action: 'settings' },
] as const;
type ButtonAction = (typeof BUTTONS)[number]['action'];

/** Focus order (Up/Down). Left/Right changes the value; on the button row it picks a button. */
const ROWS = ['p1name', 'p1hero', 'p2name', 'p2hero', 'map', 'players', 'bots', 'skill', 'buttons'] as const;
type Row = (typeof ROWS)[number];

const MAP_CHOICES = ['random', ...MAP_LIST.map((m) => m.id)];

const CARD_W = 200;
const CARD_Y = 62;
const CARD_H = 240;
const CENTER_X = 216;
const CENTER_W = 208;

/** Short one-line pitch per fighter for the cards (heroes add their signature move below). */
const SCRAPPER_DESC = 'NO POWERS. ALL GUTS. CUSTOMIZE THE LOOK IN MATCH SETUP.';

function wrap(text: string, maxChars: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if ((line + ' ' + word).trim().length > maxChars) {
      out.push(line);
      line = word;
    } else line = (line + ' ' + word).trim();
  }
  if (line) out.push(line);
  return out;
}

/**
 * Main menu: each keyboard player sets a NAME and picks a FIGHTER (scrapyard or a hero, with an animated
 * preview of their signature move); the center panel picks the MAP (live backdrop + minimap), players,
 * bots and bot skill for a quick match. Buttons: Quick Match, Match Setup, Controls, Settings.
 */
export class TitleScene extends Phaser.Scene {
  private row: Row = 'buttons';
  private button = 0;
  private editing: number | null = null;
  private editBuf = '';
  /** the old name is "selected": the first key replaces it (like a focused text field) */
  private editFresh = false;
  private t = 0;
  private sparks: { x: number; y: number; vy: number; img: Phaser.GameObjects.Image }[] = [];
  private far!: Phaser.GameObjects.TileSprite;
  private near: Phaser.GameObjects.TileSprite | null = null;
  private theme = '';
  private gfx!: Phaser.GameObjects.Graphics;
  private mini!: Phaser.GameObjects.Graphics;
  private puppets: Puppet[] = [];
  private cardTexts: { name: Phaser.GameObjects.BitmapText; hero: Phaser.GameObjects.BitmapText; ability: Phaser.GameObjects.BitmapText; desc: Phaser.GameObjects.BitmapText[]; header: Phaser.GameObjects.BitmapText }[] = [];
  private mapText!: Phaser.GameObjects.BitmapText;
  private blurb: Phaser.GameObjects.BitmapText[] = [];
  private valueTexts: Partial<Record<Row, Phaser.GameObjects.BitmapText>> = {};
  private buttonTexts: Phaser.GameObjects.BitmapText[] = [];
  private footer!: Phaser.GameObjects.BitmapText;
  private drawnMap = '';

  constructor() {
    super('title');
  }

  create(): void {
    // the scene instance is reused: reset everything from the previous visit
    this.row = 'buttons';
    this.button = 0;
    this.editing = null;
    this.editBuf = '';
    this.t = 0;
    this.sparks = [];
    this.puppets = [];
    this.cardTexts = [];
    this.blurb = [];
    this.valueTexts = {};
    this.buttonTexts = [];
    this.drawnMap = '';
    this.theme = '';
    this.near = null;

    const k = (this.registry.get('scale') as number) ?? 1;
    this.applyZoom(k);
    this.game.events.on('rescale', this.applyZoom, this);
    this.events.once('shutdown', () => this.game.events.off('rescale', this.applyZoom, this));
    music.play('title');

    // backdrop: the selected map's parallax layers, dimmed
    this.far = this.add.tileSprite(0, 0, VIEW_W, VIEW_H, '__DEFAULT').setOrigin(0, 0);
    this.applyTheme();
    this.add.rectangle(0, 0, VIEW_W, VIEW_H, hexToNum(P.night), 0.55).setOrigin(0, 0).setDepth(1);
    for (let i = 0; i < 34; i++) {
      const img = this.add.image(Math.random() * VIEW_W, Math.random() * VIEW_H, 'fx', 'p1').setTint(i % 3 === 0 ? 0xf07a2a : 0xf8c840).setAlpha(0.6).setDepth(2);
      this.sparks.push({ x: img.x, y: img.y, vy: 10 + Math.random() * 25, img });
    }
    this.gfx = this.add.graphics().setDepth(3);
    this.mini = this.add.graphics().setDepth(4);

    // logo
    this.add.bitmapText(VIEW_W / 2 + 2, 24, 'px', 'SCRAPYARD RIOT').setOrigin(0.5).setScale(4).setTint(hexToNum(P.red0)).setDepth(5);
    this.add.bitmapText(VIEW_W / 2, 22, 'pxo', 'SCRAPYARD RIOT').setOrigin(0.5).setScale(4).setTint(hexToNum(P.yellow)).setDepth(5);
    this.add.bitmapText(VIEW_W / 2, 46, 'smo', 'A PIXEL-ART PARTY BRAWLER FOR UP TO 10 FIGHTERS').setOrigin(0.5).setTint(0xc3c9dc).setDepth(5);

    for (let i = 0; i < 2; i++) this.buildCard(i);
    this.buildCenter();

    this.buttonTexts = BUTTONS.map((b) => this.add.bitmapText(0, 318, 'pxo', b.label).setOrigin(0.5).setDepth(5));
    this.footer = this.add.bitmapText(VIEW_W / 2, 341, 'sm', '').setOrigin(0.5, 0).setTint(0x8d95b0).setDepth(5);
    this.add.bitmapText(VIEW_W - 4, VIEW_H - 8, 'sm', 'V' + __APP_VERSION__).setOrigin(1, 0).setTint(0x5a5668).setDepth(5);
    this.refresh();
  }

  private applyZoom(k: number): void {
    this.cameras.main.setZoom(k);
    this.cameras.main.centerOn(VIEW_W / 2, VIEW_H / 2);
  }

  // ------------------------------------------------------------------ layout

  private cardX(i: number): number {
    return i === 0 ? 8 : VIEW_W - 8 - CARD_W;
  }

  private buildCard(i: number): void {
    const x = this.cardX(i);
    const header = this.add.bitmapText(x + 6, CARD_Y + 3, 'sm', `PLAYER ${i + 1} - KEYBOARD`).setTint(hexToNum(P.ink)).setDepth(5);
    this.add.bitmapText(x + 8, CARD_Y + 21, 'sm', 'NAME').setTint(0x8d95b0).setDepth(5);
    const name = this.add.bitmapText(x + 50, CARD_Y + 19, 'pxo', '').setDepth(5);
    this.add.bitmapText(x + 8, CARD_Y + 39, 'sm', 'FIGHTER').setTint(0x8d95b0).setDepth(5);
    const hero = this.add.bitmapText(x + 50, CARD_Y + 37, 'pxo', '').setDepth(5);
    const ability = this.add.bitmapText(x + CARD_W / 2, CARD_Y + 152, 'pxo', '').setOrigin(0.5, 0).setTint(hexToNum(P.orange)).setDepth(5);
    const desc = [0, 1, 2].map((l) => this.add.bitmapText(x + CARD_W / 2, CARD_Y + 166 + l * 8, 'sm', '').setOrigin(0.5, 0).setTint(0xc3c9dc).setDepth(5));
    // controls (the actual bindings, so rebinding shows up here)
    const b = keyboardBinds[i];
    const keys = (a: Action, n = 2) => b[a].slice(0, n).map(keyLabel).join('/');
    const lines = [
      `MOVE ${keys('left', 1)} ${keys('right', 1)}  JUMP ${keys('up', 1)}/${keys('jump')}  DROP ${keys('down', 1)} ${keys('down', 1)}`,
      `ATTACK ${keys('attack', 1)}  KICK ${keys('kick', 1)}  GRAB ${keys('interact', 1)}  SWAP ${keys('cycle', 1)}`,
      `ABILITY ${keys('ability', 1)}  MEDKIT ${keys('gadget', 1)}  HOLD ATTACK = AIM`,
    ];
    lines.forEach((l, n) => this.add.bitmapText(x + CARD_W / 2, CARD_Y + 200 + n * 9, 'sm', l).setOrigin(0.5, 0).setTint(0x8d95b0).setDepth(5));
    const pup = new Puppet(this, x + CARD_W / 2, CARD_Y + 140, 3);
    pup.root.setDepth(6);
    this.puppets[i] = pup;
    this.cardTexts[i] = { name, hero, ability, desc, header };
    this.applyFighter(i);
  }

  private buildCenter(): void {
    const x = CENTER_X;
    this.add.bitmapText(x + CENTER_W / 2, CARD_Y + 3, 'sm', 'QUICK MATCH').setOrigin(0.5, 0).setTint(0xfff4a0).setDepth(5);
    this.add.bitmapText(x + 8, CARD_Y + 21, 'sm', 'MAP').setTint(0x8d95b0).setDepth(5);
    this.mapText = this.add.bitmapText(x + CENTER_W / 2 + 10, CARD_Y + 19, 'pxo', '').setOrigin(0.5, 0).setDepth(5);
    this.blurb = [0, 1, 2].map((l) => this.add.bitmapText(x + CENTER_W / 2, CARD_Y + 124 + l * 8, 'sm', '').setOrigin(0.5, 0).setTint(0x8d95b0).setDepth(5));
    const rows: [Row, string, number][] = [
      ['players', 'PLAYERS', 156],
      ['bots', 'BOTS', 174],
      ['skill', 'BOT SKILL', 192],
    ];
    for (const [r, label, y] of rows) {
      this.add.bitmapText(x + 8, CARD_Y + y + 2, 'sm', label).setTint(0x8d95b0).setDepth(5);
      this.valueTexts[r] = this.add.bitmapText(x + CENTER_W - 10, CARD_Y + y, 'pxo', '').setOrigin(1, 0).setDepth(5);
    }
  }

  private applyTheme(): void {
    const mapId = this.resolvedPreviewMap();
    const theme = getMap(mapId).theme ?? 'arena';
    if (theme === this.theme) return;
    this.theme = theme;
    const keys = bakeBackground(this, theme);
    this.cameras.main.setBackgroundColor(BACKGROUNDS[theme]?.sky ?? P.night);
    this.far.setTexture(keys.far);
    if (keys.near) {
      if (!this.near) this.near = this.add.tileSprite(0, 0, VIEW_W, VIEW_H, keys.near).setOrigin(0, 0).setDepth(0.5);
      else this.near.setTexture(keys.near).setVisible(true);
    } else this.near?.setVisible(false);
  }

  /** the map shown in the backdrop/minimap ('random' cycles through all of them) */
  private resolvedPreviewMap(): string {
    if (settings.quickMap !== 'random') return getMap(settings.quickMap).id;
    return MAP_LIST[Math.floor(this.t / 2.5) % MAP_LIST.length].id;
  }

  private fighterName(hero: string): string {
    return hero ? (HEROES[hero]?.name ?? hero.toUpperCase()) : 'SCRAPPER';
  }

  private applyFighter(i: number): void {
    const p = profiles[i];
    this.puppets[i].setLook(heroLook(p.hero, p.look), p.hero);
    const h = HEROES[p.hero];
    const c = this.cardTexts[i];
    c.ability.setText(h ? h.base.name : 'SCRAPYARD FIGHTER');
    const desc = wrap(h ? h.base.desc : SCRAPPER_DESC, 46);
    c.desc.forEach((t, n) => t.setText(desc[n] ?? ''));
  }

  // ------------------------------------------------------------------ input

  private go(action: ButtonAction): void {
    if (action === 'quick' && settings.quickPlayers + settings.quickBots < 2) {
      audio.play('uiBack');
      this.cameras.main.shake(120, 0.004);
      return;
    }
    audio.play('uiOk');
    if (action === 'quick') {
      const params = new URLSearchParams(location.search);
      params.set('bots', String(settings.quickBots));
      params.set('diff', settings.botDifficulty);
      params.set('humans', String(settings.quickPlayers));
      const mapId = settings.quickMap === 'random' ? MAP_LIST[Math.floor(Math.random() * MAP_LIST.length)].id : settings.quickMap;
      params.set('map', mapId);
      params.delete('heroes'); // the cards decide
      this.scene.start('match', defaultSetup(params));
    } else if (action === 'lobby') this.scene.start('lobby');
    else this.scene.start(action, { from: 'title' });
  }

  private cycleHero(i: number, d: number): void {
    const order = HERO_ORDER as readonly string[];
    const p = profiles[i];
    p.hero = order[(order.indexOf(p.hero) + d + order.length) % order.length];
    saveProfiles();
    // keep the lobby's KEYBOARD slots in sync with the card
    const lobby = loadLobby();
    for (const s of lobby.slots) if (s.kind === 'kb' + i) s.hero = p.hero;
    saveLobby(lobby);
    this.applyFighter(i);
  }

  private change(row: Row, d: number): boolean {
    switch (row) {
      case 'p1hero':
      case 'p2hero':
        this.cycleHero(row === 'p1hero' ? 0 : 1, d);
        return true;
      case 'map': {
        const i = MAP_CHOICES.indexOf(settings.quickMap);
        settings.quickMap = MAP_CHOICES[(Math.max(0, i) + d + MAP_CHOICES.length) % MAP_CHOICES.length];
        return true;
      }
      case 'players':
        settings.quickPlayers = settings.quickPlayers === 1 ? 2 : 1;
        return true;
      case 'bots':
        settings.quickBots = (settings.quickBots + d + 9) % 9;
        return true;
      case 'skill': {
        const i = DIFF_ORDER.indexOf(settings.botDifficulty);
        settings.botDifficulty = DIFF_ORDER[(i + d + DIFF_ORDER.length) % DIFF_ORDER.length];
        return true;
      }
      default:
        return false;
    }
  }

  private startEdit(i: number): void {
    this.editing = i;
    this.editBuf = profiles[i].name;
    this.editFresh = true;
    audio.play('uiOk');
  }

  private updateEdit(): void {
    const i = this.editing!;
    for (const ch of keyboard.typed) {
      const c = ch.toUpperCase();
      if (/[A-Z0-9 .!?'\-_]/.test(c)) {
        if (this.editFresh) this.editBuf = '';
        this.editFresh = false;
        if (this.editBuf.length >= NAME_MAX) continue;
        this.editBuf += c;
        audio.play('uiMove', { pitch: 1.4 });
      }
    }
    if (keyboard.justPressed('Backspace') && this.editBuf.length) {
      this.editBuf = this.editFresh ? '' : this.editBuf.slice(0, -1);
      this.editFresh = false;
      audio.play('uiMove', { pitch: 0.8 });
    }
    if (keyboard.justPressed('Enter') || keyboard.justPressed('NumpadEnter')) {
      profiles[i].name = sanitizeName(this.editBuf, i);
      saveProfiles();
      this.editing = null;
      audio.play('uiOk');
    } else if (keyboard.justPressed('Escape')) {
      this.editing = null;
      audio.play('uiBack');
    }
  }

  override update(_t: number, deltaMs: number): void {
    const dt = deltaMs / 1000;
    this.t += dt;
    this.animate(dt);
    if (this.editing !== null) {
      this.updateEdit();
      this.refresh();
      return;
    }

    let changed = false;
    const ri = ROWS.indexOf(this.row);
    if (menu.up()) {
      this.row = ROWS[(ri - 1 + ROWS.length) % ROWS.length];
      audio.play('uiMove');
    } else if (menu.down()) {
      this.row = ROWS[(ri + 1) % ROWS.length];
      audio.play('uiMove');
    }
    const lr = menu.left() ? -1 : menu.right() ? 1 : 0;
    if (this.row === 'buttons') {
      if (lr) {
        this.button = (this.button + lr + BUTTONS.length) % BUTTONS.length;
        audio.play('uiMove');
      }
      if (menu.confirm()) return this.go(BUTTONS[this.button].action);
    } else if (this.row === 'p1name' || this.row === 'p2name') {
      if (menu.confirm()) this.startEdit(this.row === 'p1name' ? 0 : 1);
    } else {
      if (lr) changed = this.change(this.row, lr);
      else if (menu.confirm()) changed = this.change(this.row, 1);
    }

    // shortcuts (as before): 0-8 = bots, Tab = bot skill, L = match setup, C = controls
    for (let d = 0; d <= 8; d++) {
      if (keyboard.justPressed('Digit' + d) || keyboard.justPressed('Numpad' + d)) {
        settings.quickBots = d;
        changed = true;
      }
    }
    if (keyboard.justPressed('Tab')) changed = this.change('skill', 1);
    if (changed) {
      saveSettings();
      audio.play('uiMove');
    }
    if (keyboard.justPressed('KeyL')) return this.go('lobby');
    if (keyboard.justPressed('KeyC')) return this.go('controls');
    this.refresh();
  }

  private animate(dt: number): void {
    for (const s of this.sparks) {
      s.y -= s.vy * dt;
      s.x += Math.sin(this.t * 2 + s.vy) * 6 * dt;
      if (s.y < -4) {
        s.y = VIEW_H + 4;
        s.x = Math.random() * VIEW_W;
      }
      s.img.setPosition(Math.round(s.x), Math.round(s.y));
    }
    const def = BACKGROUNDS[this.theme];
    const drift = this.t * 18 + (def?.scroll ?? 0) * this.t * 0.2;
    this.far.tilePositionX = Math.round(drift * (def?.far ?? 0.1) * 3);
    if (this.near) this.near.tilePositionX = Math.round(drift * (def?.near ?? 0.3) * 3);
    for (const p of this.puppets) p.update(dt);
  }

  // ------------------------------------------------------------------ drawing

  private refresh(): void {
    this.applyTheme();
    const g = this.gfx.clear();
    const blink = Math.floor(this.t * 3) % 2 === 0;
    const sel = (r: Row) => this.row === r;
    const box = (x: number, y: number, w: number, h: number, color: number, active: boolean) => {
      g.fillStyle(hexToNum(P.ink), 0.86).fillRect(x, y, w, h);
      g.lineStyle(1, color, active ? 1 : 0.55).strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      g.fillStyle(color, active ? 1 : 0.8).fillRect(x, y, w, 12);
    };
    const highlight = (x: number, y: number, w: number) => {
      g.fillStyle(0x3a3054, 1).fillRect(x - 2, y - 3, w + 4, 14);
      g.fillStyle(blink ? 0xffffff : 0xf8c840, 1).fillTriangle(x - 1, y + 1, x - 1, y + 7, x + 2, y + 4);
    };

    // player cards
    for (let i = 0; i < 2; i++) {
      const x = this.cardX(i);
      const off = i === 1 && settings.quickPlayers < 2;
      const nameRow: Row = i === 0 ? 'p1name' : 'p2name';
      const heroRow: Row = i === 0 ? 'p1hero' : 'p2hero';
      const active = sel(nameRow) || sel(heroRow);
      box(x, CARD_Y, CARD_W, CARD_H, PLAYER_COLORS[i], active);
      // pedestal under the preview
      g.fillStyle(0x000000, 0.35).fillEllipse(x + CARD_W / 2, CARD_Y + 141, 54, 8);
      if (sel(nameRow)) highlight(x + 4, CARD_Y + 21, CARD_W - 8);
      if (sel(heroRow)) highlight(x + 4, CARD_Y + 39, CARD_W - 8);
      const c = this.cardTexts[i];
      const editing = this.editing === i;
      const name = editing ? this.editBuf + (blink ? '_' : ' ') : profiles[i].name;
      c.name.setText(name).setTint(editing ? (this.editFresh ? 0x8d95b0 : 0xfff4a0) : PLAYER_COLORS[i]);
      const hero = this.fighterName(profiles[i].hero);
      c.hero.setText(sel(heroRow) ? `< ${hero} >` : hero).setTint(profiles[i].hero ? hexToNum(P.orange) : 0xffffff);
      c.header.setText(off ? `PLAYER ${i + 1} - OFF (PLAYERS: 1)` : `PLAYER ${i + 1} - KEYBOARD`);
      this.puppets[i].dim = off;
    }

    // center: quick match settings
    const x = CENTER_X;
    const centerActive = sel('map') || sel('players') || sel('bots') || sel('skill');
    box(x, CARD_Y, CENTER_W, CARD_H, hexToNum(P.purple1), centerActive);
    if (sel('map')) highlight(x + 4, CARD_Y + 21, CENTER_W - 8);
    const mapLabel = settings.quickMap === 'random' ? 'RANDOM' : getMap(settings.quickMap).name;
    this.mapText.setText(sel('map') ? `< ${mapLabel} >` : mapLabel).setTint(sel('map') ? 0xffffff : 0xfff4a0);
    const preview = this.resolvedPreviewMap();
    if (preview !== this.drawnMap) {
      this.drawnMap = preview;
      this.mini.clear();
      drawMinimap(this.mini, preview, x + 6, CARD_Y + 36, CENTER_W - 12, 82);
      const b = wrap((getMap(preview).blurb ?? '').toUpperCase(), 48);
      this.blurb.forEach((t, n) => t.setText(b[n] ?? ''));
    }
    const vals: Partial<Record<Row, string>> = {
      players: String(settings.quickPlayers),
      bots: String(settings.quickBots),
      skill: settings.botDifficulty.toUpperCase(),
    };
    for (const r of ['players', 'bots', 'skill'] as const) {
      const t = this.valueTexts[r]!;
      if (sel(r)) highlight(x + 4, t.y + 2, CENTER_W - 8);
      t.setText(sel(r) ? `< ${vals[r]} >` : vals[r]!).setTint(sel(r) ? 0xffffff : 0xc3c9dc);
    }
    this.footerText(settings.quickPlayers + settings.quickBots);

    // buttons
    const widths = this.buttonTexts.map((t, i) => t.setScale(this.row === 'buttons' && i === this.button ? 2 : 1).width);
    const total = widths.reduce((a, b) => a + b + 22, -22);
    let bx = VIEW_W / 2 - total / 2;
    this.buttonTexts.forEach((t, i) => {
      const on = this.row === 'buttons' && i === this.button;
      t.setPosition(Math.round(bx + widths[i] / 2), 318).setTint(on ? 0xffffff : 0x8d95b0).setAlpha(on && !blink ? 0.75 : 1);
      bx += widths[i] + 22;
    });
  }

  private footerText(fighters: number): void {
    let hint: string;
    if (this.editing !== null) hint = `TYPE A NAME (MAX ${NAME_MAX})   ENTER: SAVE   ESC: CANCEL   BACKSPACE: DELETE`;
    else if (this.row === 'p1name' || this.row === 'p2name') hint = 'ENTER: CHANGE NAME   UP/DOWN: MOVE';
    else if (this.row === 'buttons') hint = fighters < 2 ? 'ADD BOTS OR A SECOND PLAYER (NEED 2 FIGHTERS)' : 'LEFT/RIGHT: CHOOSE   ENTER: GO   UP: PLAYERS, FIGHTERS & MAP';
    else hint = 'LEFT/RIGHT: CHANGE   UP/DOWN: MOVE   L: MATCH SETUP   C: CONTROLS';
    this.footer.setText(hint).setTint(fighters < 2 && this.row === 'buttons' ? hexToNum(P.red2) : 0x8d95b0);
  }
}
