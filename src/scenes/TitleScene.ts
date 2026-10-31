import Phaser from 'phaser';
import { bakeBackground, BACKGROUNDS } from '../art/backgroundArt';
import { heroLook } from '../art/heroArt';
import { hexToNum, P } from '../art/palette';
import { audio } from '../audio/AudioManager';
import { music } from '../audio/music';
import { isTouchDevice, VIEW_H, VIEW_W } from '../game/display';
import { NAME_MAX, profiles, sanitizeName, saveProfiles } from '../game/profiles';
import { saveSettings, settings } from '../game/settings';
import { keyboardBinds, keyLabel, type Action } from '../input/bindings';
import { inputDevice, padLabel } from '../input/devices';
import { padBinds, padMenu } from '../input/gamepad';
import { keyboard } from '../input/keyboard';
import { menu } from '../input/menu';
import { HERO_ORDER, HEROES } from '../sim/data/heroes';
import { getMap, MAP_LIST } from '../sim/map/maps';
import { loadLobby, saveLobby } from './lobby';
import { defaultSetup } from './MatchScene';
import { hint, HintBar } from './kit';
import { PLAYER_COLORS, Puppet } from './ui';
import { bakeMapPreview } from '../art/mapPreview';
const DIFF_ORDER = ['easy', 'normal', 'hard', 'expert'] as const;
const BUTTONS = [
  { label: 'QUICK MATCH', action: 'quick' },
  { label: 'MATCH SETUP', action: 'lobby' },
  { label: 'HOST GAME', action: 'host' },
  { label: 'JOIN GAME', action: 'join' },
  { label: 'CONTROLS', action: 'controls' },
  { label: 'SETTINGS', action: 'settings' },
] as const;
type ButtonAction = (typeof BUTTONS)[number]['action'];
/** Focus order (Up/Down). Left/Right changes the value; on the button row it picks a button. */
const ROWS = ['p1name', 'p1hero', 'p2name', 'p2hero', 'map', 'players', 'bots', 'skill', 'buttons'] as const;
type Row = (typeof ROWS)[number];
const MAP_CHOICES = ['random', ...MAP_LIST.map((m) => m.id)];
const CARD_W = 220;
const CARD_Y = 50;
const CARD_H = 108;
const CENTER_X = 12;
const CENTER_W = 384;
const BUTTON_RECTS = [[12, 164], [184, 110], [302, 84], [394, 84], [486, 68], [562, 66]] as const;
/** Short one-line pitch per fighter for the cards (heroes add their signature move below). */
const SCRAPPER_DESC = 'NO POWERS. ALL GUTS. CUSTOMIZE THE LOOK IN MATCH SETUP.';
function wrap(text: string, maxChars: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if ((line + ' ' + word).trim().length > maxChars) {
      out.push(line);
      line = word;
    }
    else
      line = (line + ' ' + word).trim();
  }
  if (line)
    out.push(line);
  return out;
}
/**
* Main menu: each keyboard player sets a NAME and picks a FIGHTER (scrapyard or a hero, with an animated
* preview of their signature move); the center panel picks the MAP (live backdrop + full arena), players,
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
  private sparks: {
    x: number;
    y: number;
    vy: number;
    img: Phaser.GameObjects.Image;
  }[] = [];
  private far!: Phaser.GameObjects.TileSprite;
  private near: Phaser.GameObjects.TileSprite | null = null;
  private theme = '';
  private gfx!: Phaser.GameObjects.Graphics;
  private arenaImage!: Phaser.GameObjects.Image;
  private puppets: Puppet[] = [];
  private cardTexts: {
    name: Phaser.GameObjects.BitmapText;
    hero: Phaser.GameObjects.BitmapText;
    ability: Phaser.GameObjects.BitmapText;
    desc: Phaser.GameObjects.BitmapText[];
    header: Phaser.GameObjects.BitmapText;
  }[] = [];
  private mapText!: Phaser.GameObjects.BitmapText;
  private blurb: Phaser.GameObjects.BitmapText[] = [];
  private valueTexts: Partial<Record<Row, Phaser.GameObjects.BitmapText>> = {};
  private buttonTexts: Phaser.GameObjects.BitmapText[] = [];
  private warn!: Phaser.GameObjects.BitmapText;
  private bar!: HintBar;
  private barMode = '';
  private ctl: Phaser.GameObjects.BitmapText[][] = [];
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
    this.barMode = '';
    this.ctl = [];
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
    this.arenaImage = this.add.image(CENTER_X + CENTER_W / 2, 169, '__DEFAULT').setDepth(4);
    this.add.bitmapText(14, 11, 'px', 'BRAWLKAI').setScale(3).setTint(0x704027).setDepth(5);
    this.add.bitmapText(12, 9, 'pxo', 'BRAWLKAI').setScale(3).setTint(0xffd86f).setDepth(5);
    this.add.bitmapText(222, 17, 'smo', 'CHOOSE YOUR ARENA. BRING YOUR RIVALS.').setTint(0xd5ddeb).setDepth(5);
    this.add.bitmapText(222, 29, 'sm', 'LOCAL MULTIPLAYER / ONLINE / UP TO 10 FIGHTERS').setTint(0x93a6c0).setDepth(5);
    for (let i = 0; i < 2; i++)
      this.buildCard(i);
    this.buildCenter();
    this.buttonTexts = BUTTONS.map((b) => this.add.bitmapText(0, 320, 'pxo', b.label).setOrigin(0.5).setDepth(5));
    this.buildTapTargets();
    this.warn = this.add.bitmapText(VIEW_W / 2, 335, 'sm', '').setOrigin(0.5, 0).setTint(0x8d95b0).setDepth(5);
    this.bar = new HintBar(this, VIEW_H - 15, 30);
    this.add.bitmapText(VIEW_W - 4, 4, 'sm', 'V' + __APP_VERSION__).setOrigin(1, 0).setTint(0x5a5668).setDepth(5);
    this.refresh();
  }
  /** Touch / mouse: tap a row to change it (like pressing OK on it) and a button to go. */
  private buildTapTargets(): void {
    this.buttonTexts.forEach((t, i) => {
      const [x, w] = BUTTON_RECTS[i];
      const target = this.add.zone(x, 309, w, 22).setOrigin(0).setDepth(7).setInteractive({ useHandCursor: true });
      target.on('pointerdown', () => {
        if (this.editing !== null)
          return;
        this.row = 'buttons';
        this.button = i;
        this.go(BUTTONS[i].action);
      });
    });
    this.arenaImage.setInteractive({ useHandCursor: true }).on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.editing !== null)
        return;
      this.row = 'map';
      const direction = p.worldX < CENTER_X + CENTER_W / 2 ? -1 : 1;
      this.change('map', direction);
      saveSettings();
      audio.play('uiMove');
      this.refresh();
    });
    const zones: [
      Row,
      number,
      number,
      number
    ][] = [
      ['p1name', 478, 68, 142], ['p1hero', 478, 86, 142],
      ['p2name', 478, 186, 142], ['p2hero', 478, 204, 142],
      ['map', CENTER_X + 8, 62, CENTER_W - 16],
      ['players', 12, 287, 106], ['bots', 130, 287, 106], ['skill', 248, 287, 148],
    ];
    for (const [row, x, y, w] of zones) {
      const z = this.add.zone(x, y, w, 16).setOrigin(0, 0).setDepth(7).setInteractive({ useHandCursor: true });
      z.on('pointerdown', () => {
        if (this.editing !== null)
          return;
        this.row = row;
        if (row === 'p1name' || row === 'p2name')
          return this.startEdit(row === 'p1name' ? 0 : 1);
        if (this.change(row, 1)) {
          saveSettings();
          audio.play('uiMove');
        }
      });
    }
  }
  private applyZoom(k: number): void {
    this.cameras.main.setZoom(k);
    this.cameras.main.centerOn(VIEW_W / 2, VIEW_H / 2);
  }
  // ------------------------------------------------------------------ layout
  private cardX(_i: number): number { return 408; }
  private cardY(i: number): number { return CARD_Y + i * 118; }
  private buildCard(i: number): void {
    const x = this.cardX(i), y = this.cardY(i);
    const header = this.add.bitmapText(x + 8, y + 4, 'sm', '').setTint(0xe9edf6).setDepth(5);
    const name = this.add.bitmapText(x + 76, y + 21, 'pxo', '').setDepth(5);
    const hero = this.add.bitmapText(x + 76, y + 39, 'pxo', '').setDepth(5);
    const ability = this.add.bitmapText(x + 76, y + 57, 'sm', '').setTint(0xffc77b).setDepth(5);
    const desc = [0, 1].map(l => this.add.bitmapText(x + 76, y + 67 + l * 7, 'sm', '').setTint(0xa5b7cc).setDepth(5));
    this.ctl[i] = [0, 1, 2].map(n => this.add.bitmapText(x + 76, y + 83 + n * 7, 'sm', '').setTint(0x8295b0).setDepth(5));
    const pup = new Puppet(this, x + 31, y + 91, 2);
    pup.root.setDepth(6);
    this.puppets[i] = pup;
    this.cardTexts[i] = { name, hero, ability, desc, header };
    this.applyFighter(i);
  }
  /** The three control lines of a player card, for the device in use (player 2 is always the second keyboard). */
  private controlLines(i: number): string[] {
    const dev = inputDevice.current;
    if (i === 0 && dev === 'touch')
      return ['STICK: MOVE / UP: JUMP', 'ATK / KICK / GRAB', 'SUPER: BOTH ABILITIES'];
    if (i === 0 && (dev === 'ps' || dev === 'xbox')) {
      const b = padBinds[0], n = (a: keyof typeof b) => padLabel(b[a][0] ?? 0, inputDevice.pad).replace(' / ', '/');
      return ['MOVE: LEFT STICK', 'JUMP ' + n('jump') + ' / ATTACK ' + n('attack'), 'ABILITY ' + n('ability') + ' / KICK ' + n('kick')];
    }
    const b = keyboardBinds[i], key = (a: Action) => b[a].slice(0, 1).map(keyLabel).join('/');
    return ['MOVE ' + key('left') + '/' + key('right') + ' / JUMP ' + key('up'), 'ATTACK ' + key('attack') + ' / GRAB ' + key('interact'), 'ABILITY ' + key('ability') + ' / KICK ' + key('kick')];
  }
  private deviceName(i: number): string {
    const dev = inputDevice.current;
    if (i === 0 && dev === 'touch')
      return 'TOUCH';
    if (i === 0 && (dev === 'ps' || dev === 'xbox'))
      return dev === 'ps' ? 'PLAYSTATION PAD' : 'XBOX PAD';
    return 'KEYBOARD';
  }
  private buildCenter(): void {
    this.add.bitmapText(24, 55, 'sm', 'THE ARENA').setTint(0x8eabc1).setDepth(5);
    this.mapText = this.add.bitmapText(24, 67, 'pxo', '').setDepth(5);
    this.add.bitmapText(374, 67, 'sm', '< >').setOrigin(1, 0).setTint(0x80cfdb).setDepth(5);
    this.blurb = [0, 1].map(l => this.add.bitmapText(24, 263 + l * 8, 'sm', '').setTint(0xa9bdce).setDepth(5));
    for (const [r, label, x, w] of [['players', 'PLAYERS', 12, 106], ['bots', 'BOTS', 130, 106], ['skill', 'SKILL', 248, 148]] as const) {
      this.add.bitmapText(x + 5, 291, 'sm', label).setTint(0x8da8be).setDepth(5);
      this.valueTexts[r] = this.add.bitmapText(x + w - 6, 289, 'pxo', '').setOrigin(1, 0).setDepth(5);
    }
  }
  private applyTheme(): void {
    const mapId = this.resolvedPreviewMap();
    const theme = getMap(mapId).theme ?? 'arena';
    if (theme === this.theme)
      return;
    this.theme = theme;
    const keys = bakeBackground(this, theme);
    this.cameras.main.setBackgroundColor(BACKGROUNDS[theme]?.sky ?? P.night);
    this.far.setTexture(keys.far);
    if (keys.near) {
      if (!this.near)
        this.near = this.add.tileSprite(0, 0, VIEW_W, VIEW_H, keys.near).setOrigin(0, 0).setDepth(0.5);
      else
        this.near.setTexture(keys.near).setVisible(true);
    }
    else
      this.near?.setVisible(false);
  }
  /** The fully rendered arena ('random' cycles through the whole collection). */
  private resolvedPreviewMap(): string {
    if (settings.quickMap !== 'random')
      return getMap(settings.quickMap).id;
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
    const desc = wrap(h ? `${h.base.desc} KICK KEY: ${h.second.name}. ORBS = NEXT FORM. BOTH ABILITIES = SUPER.` : SCRAPPER_DESC, 33);
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
    }
    else if (action === 'lobby')
      this.scene.start('lobby');
    else if (action === 'host' || action === 'join')
      this.scene.start('netlobby', { role: action });
    else
      this.scene.start(action, { from: 'title' });
  }
  private cycleHero(i: number, d: number): void {
    const order = HERO_ORDER as readonly string[];
    const p = profiles[i];
    p.hero = order[(order.indexOf(p.hero) + d + order.length) % order.length];
    saveProfiles();
    // keep the lobby's KEYBOARD slots in sync with the card
    const lobby = loadLobby();
    for (const s of lobby.slots)
      if (s.kind === 'kb' + i)
        s.hero = p.hero;
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
    if (isTouchDevice()) {
      // no hardware keyboard: the phone's own text box
      const v = window.prompt('NAME (MAX ' + NAME_MAX + ')', profiles[i].name);
      if (v !== null) {
        profiles[i].name = sanitizeName(v.toUpperCase(), i);
        saveProfiles();
      }
      return;
    }
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
        if (this.editFresh)
          this.editBuf = '';
        this.editFresh = false;
        if (this.editBuf.length >= NAME_MAX)
          continue;
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
    }
    else if (keyboard.justPressed('Escape')) {
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
    }
    else if (menu.down()) {
      this.row = ROWS[(ri + 1) % ROWS.length];
      audio.play('uiMove');
    }
    const lr = menu.left() ? -1 : menu.right() ? 1 : 0;
    if (this.row === 'buttons') {
      if (lr) {
        this.button = (this.button + lr + BUTTONS.length) % BUTTONS.length;
        audio.play('uiMove');
      }
      if (menu.confirm())
        return this.go(BUTTONS[this.button].action);
    }
    else if (this.row === 'p1name' || this.row === 'p2name') {
      if (menu.confirm())
        this.startEdit(this.row === 'p1name' ? 0 : 1);
    }
    else {
      if (lr)
        changed = this.change(this.row, lr);
      else if (menu.confirm())
        changed = this.change(this.row, 1);
    }
    // shortcuts (as before): 0-8 = bots, Tab = bot skill, L = match setup, C = controls
    for (let d = 0; d <= 8; d++) {
      if (keyboard.justPressed('Digit' + d) || keyboard.justPressed('Numpad' + d)) {
        settings.quickBots = d;
        changed = true;
      }
    }
    if (keyboard.justPressed('Tab'))
      changed = this.change('skill', 1);
    if (changed) {
      saveSettings();
      audio.play('uiMove');
    }
    if (keyboard.justPressed('KeyL') || padMenu.justPressed(3))
      return this.go('lobby');
    if (keyboard.justPressed('KeyC') || padMenu.justPressed(2))
      return this.go('controls');
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
    if (this.near)
      this.near.tilePositionX = Math.round(drift * (def?.near ?? 0.3) * 3);
    for (const p of this.puppets)
      p.update(dt);
  }
  // ------------------------------------------------------------------ drawing
  private refresh(): void {
    this.applyTheme();
    const g = this.gfx.clear(), sel = (r: Row) => this.row === r;
    const panel = (x: number, y: number, w: number, h: number, color: number, active: boolean) => {
      g.fillStyle(0x040b17, .72).fillRect(x + 3, y + 4, w, h);
      g.fillStyle(0x101d30, .96).fillRect(x, y, w, h);
      g.lineStyle(1, color, active ? 1 : .38).strokeRect(x + .5, y + .5, w - 1, h - 1);
      g.fillStyle(color, active ? .8 : .35).fillRect(x + 1, y + 1, w - 2, 2);
    };
    const focus = (x: number, y: number, w: number) => g.fillStyle(0x34516c, .8).fillRect(x, y, w, 14);
    for (let i = 0; i < 2; i++) {
      const x = this.cardX(i), y = this.cardY(i), off = i === 1 && settings.quickPlayers < 2;
      const nameRow: Row = i === 0 ? 'p1name' : 'p2name', heroRow: Row = i === 0 ? 'p1hero' : 'p2hero';
      panel(x, y, CARD_W, CARD_H, PLAYER_COLORS[i], sel(nameRow) || sel(heroRow));
      g.fillStyle(PLAYER_COLORS[i], .16).fillRect(x + 1, y + 3, CARD_W - 2, 12);
      g.fillStyle(0x070f20, 1).fillEllipse(x + 32, y + 93, 55, 8);
      g.lineStyle(1, PLAYER_COLORS[i], .6).strokeEllipse(x + 32, y + 92, 52, 8);
      if (sel(nameRow))
        focus(x + 72, y + 18, 142);
      if (sel(heroRow))
        focus(x + 72, y + 36, 142);
      const c = this.cardTexts[i], editing = this.editing === i;
      c.name.setText(editing ? this.editBuf + (Math.floor(this.t * 3) % 2 ? ' ' : '_') : profiles[i].name).setTint(editing ? 0xffe1a2 : PLAYER_COLORS[i]);
      const hero = this.fighterName(profiles[i].hero);
      c.hero.setText(sel(heroRow) ? '< ' + hero + ' >' : hero).setTint(profiles[i].hero ? 0xffce91 : 0xe4edf3);
      c.header.setText(off ? 'PLAYER 2 / OFF' : 'PLAYER ' + (i + 1) + ' / ' + this.deviceName(i));
      this.controlLines(i).forEach((l, n) => this.ctl[i][n].setText(l));
      this.puppets[i].dim = off;
    }
    panel(CENTER_X, CARD_Y, CENTER_W, 234, 0x66c9cd, sel('map'));
    this.mapText.setText(settings.quickMap === 'random' ? 'RANDOM / ' + getMap(this.resolvedPreviewMap()).name : getMap(settings.quickMap).name).setTint(0xffde99);
    const preview = this.resolvedPreviewMap();
    if (preview !== this.drawnMap) {
      this.drawnMap = preview;
      this.arenaImage.setTexture(bakeMapPreview(this, preview)).setDisplaySize(348, 174);
      const b = wrap(getMap(preview).blurb?.toUpperCase() ?? '', 85);
      this.blurb.forEach((t, n) => t.setText(b[n] ?? ''));
    }
    const vals = { players: String(settings.quickPlayers), bots: String(settings.quickBots), skill: settings.botDifficulty.toUpperCase() };
    for (const [r, x, w] of [['players', 12, 106], ['bots', 130, 106], ['skill', 248, 148]] as const) {
      panel(x, 286, w, 18, 0x769bb3, sel(r));
      this.valueTexts[r]!.setText(sel(r) ? '< ' + vals[r] + ' >' : vals[r]).setTint(sel(r) ? 0xffe3a4 : 0xdae5ef);
    }
    const buttons = BUTTON_RECTS;
    this.buttonTexts.forEach((t, i) => {
      const [x, w] = buttons[i];
      const on = this.row === 'buttons' && this.button === i;
      g.fillStyle(i === 0 ? 0xf4ca76 : on ? 0x385973 : 0x192b40, 1).fillRect(x, 309, w, 22);
      g.lineStyle(1, on ? 0xffe5ac : 0x55778d, on ? 1 : .5).strokeRect(x + .5, 309.5, w - 1, 21);
      t.setPosition(x + w / 2, 320).setScale(i === 0 ? 1.35 : 1)
        .setTint(i === 0 ? 0x162337 : on ? 0xffe9c5 : 0xc1d2e4).setAlpha(1);
    });
    this.footerText(settings.quickPlayers + settings.quickBots);
  }
  private footerText(fighters: number): void {
    let mode: string;
    let items;
    if (this.editing !== null) {
      mode = 'edit';
      items = [hint.key(`TYPE A NAME (MAX ${NAME_MAX})`, []), hint.key('SAVE', ['ENTER']), hint.key('CANCEL', ['ESC'])];
    }
    else if (this.row === 'p1name' || this.row === 'p2name') {
      mode = 'name';
      items = [hint.move('ROW', 'ud'), hint.ok('EDIT NAME')];
    }
    else if (this.row === 'buttons') {
      mode = 'buttons';
      items = [hint.move('CHOOSE', 'lr'), hint.ok('GO'), hint.move('FIGHTERS & MAP', 'ud'), hint.key('SETUP', ['L'], [3]), hint.key('CONTROLS', ['C'], [2])];
    }
    else {
      mode = 'rows';
      items = [hint.move('CHANGE', 'lr'), hint.move('ROW', 'ud'), hint.key('SETUP', ['L'], [3]), hint.key('CONTROLS', ['C'], [2])];
    }
    if (mode !== this.barMode) {
      this.barMode = mode;
      this.bar.set(items);
    }
    this.bar.update();
    const need = fighters < 2 && this.row === 'buttons';
    this.warn.setText(need ? 'ADD BOTS OR A SECOND PLAYER (NEED 2 FIGHTERS)' : this.row === 'buttons' ? '' : '').setTint(hexToNum(P.red2));
  }
}
