import Phaser from 'phaser';
import { randomAppearance } from '../art/appearance';
import { heroLook } from '../art/heroArt';
import { HEROES, maxLevel } from '../sim/data/heroes';
import { pokemonSpecies, pokemonStage, pokemonTeam } from '../sim/data/pokemon';
import { PokemonTeamPicker } from './PokemonTeamPicker';
import { hexToNum, P, TEAM_COLORS, TEAM_NAMES } from '../art/palette';
import { audio } from '../audio/AudioManager';
import { VIEW_H, VIEW_W } from '../game/display';
import { connectedPads, padMenu } from '../input/gamepad';
import { keyboard } from '../input/keyboard';
import { menu } from '../input/menu';
import { saveSettings, settings } from '../game/settings';
import { getMap, MAP_LIST } from '../sim/map/maps';
import { MODE_NAMES } from '../sim/match';

import {
  DIFF_ORDER,
  lobbyProblem,
  lobbyToMatch,
  loadLobby,
  MAX_SLOTS,
  MODE_ORDER,
  saveLobby,
  slotStartForm,
  syncSlotToProfile,
  SLOT_KIND_LABELS,
  SLOT_KINDS,
  SUDDEN_DEATH_OPTIONS,
  TIME_OPTIONS,
  WEAPON_RATE_LABELS,
  WEAPON_RATES,
  type LobbyCfg,
} from './lobby';
import { hint, HintBar, panel, rowBar } from './kit';
import { inputDevice, PAD_NAMES } from '../input/devices';
import { bindZoom, fighterPreview } from './ui';
import { bakeMapPreview } from '../art/mapPreview';
import { shareUrl } from './shareLink';
import { openFighterPicker } from './FightersScene';

const SLOT_COLS = ['kind', 'team', 'skill', 'look', 'form', 'pokemon'] as const;
const SLOT_COL_X = [36, 118, 162, 214, 268, 306];
const SLOT_COL_W = [76, 38, 46, 48, 33, 30];
const SETTINGS = ['map', 'mode', 'length', 'sudden', 'ff', 'weapons', 'chaos', 'powers', 'fall', 'start', 'controls', 'simulate', 'share'] as const;
/** rules panel row pitch (px): 13 rows still clear the map preview below */
const SET_H = 15;
type Setting = (typeof SETTINGS)[number];

const padStyleOf = () => inputDevice.pad;
const cycle = <T,>(list: readonly T[], cur: T, d: number): T => list[(list.indexOf(cur) + d + list.length) % list.length];

/** Match setup: 10 fighter slots (keyboard / gamepad / bot / empty, team, bot skill, look) + rules. */
export class LobbyScene extends Phaser.Scene {
  private cfg!: LobbyCfg;
  private row = 0;
  private col = 0;
  private texts: Phaser.GameObjects.BitmapText[][] = [];
  private settingLabels: Phaser.GameObjects.BitmapText[] = [];
  private settingValues: Phaser.GameObjects.BitmapText[] = [];
  private bar!: HintBar;
  private barMode = '';
  private joinText!: Phaser.GameObjects.BitmapText;
  private previews: Phaser.GameObjects.Container[] = [];
  private gfx!: Phaser.GameObjects.Graphics;
  private status!: Phaser.GameObjects.BitmapText;
  private t = 0;
  private preview!: Phaser.GameObjects.Image;
  private previewMap = '';
  private blurb!: Phaser.GameObjects.BitmapText;
  /** transient message in the rules panel (share link copied...) */
  private notice = '';
  private noticeT = 0;
  private teamPicker: PokemonTeamPicker | null = null;

  constructor() {
    super('lobby');
  }

  /** `shared`: a setup opened from a share link (replaces the saved lobby). */
  create(data?: { shared?: LobbyCfg }): void {
    bindZoom(this, VIEW_W, VIEW_H);
    this.cameras.main.setBackgroundColor(P.night);
    this.cfg = data?.shared ?? loadLobby();
    if (data?.shared) saveLobby(this.cfg);
    this.notice = data?.shared ? 'SHARED SETUP LOADED' : '';
    this.noticeT = data?.shared ? 3 : 0;
    this.row = 0;
    this.teamPicker = null;
    this.col = 0;
    this.t = 0;
    // the scene instance is reused: forget the previous run's (destroyed) objects
    this.texts = [];
    this.settingLabels = [];
    this.settingValues = [];
    this.barMode = '';
    this.previews = [];
    this.previewMap = '';
    this.gfx = this.add.graphics();
    this.add.bitmapText(VIEW_W / 2, 8, 'pxo', 'MATCH SETUP').setOrigin(0.5, 0).setScale(2).setTint(hexToNum(P.yellow));
    this.add.bitmapText(36, 32, 'sm', 'FIGHTER').setTint(0x8d95b0);
    this.add.bitmapText(118, 32, 'sm', 'TEAM').setTint(0x8d95b0);
    this.add.bitmapText(162, 32, 'sm', 'BOT SKILL').setTint(0x8d95b0);
    this.add.bitmapText(214, 32, 'sm', 'HERO / LOOK').setTint(0x8d95b0);
    this.add.bitmapText(268, 32, 'sm', 'FORM').setTint(0x8d95b0);
    this.add.bitmapText(306, 32, 'sm', 'PKMN/ABIL').setTint(0xffdc69);
    for (let i = 0; i < MAX_SLOTS; i++) {
      const y = 44 + i * 28;
      this.add.bitmapText(8, y + 6, 'smo', String(i + 1)).setTint(0x8d95b0);
      this.texts.push(SLOT_COL_X.map((x) => this.add.bitmapText(x, y + 6, 'smo', '')));
      this.previews.push(this.add.container(0, 0));
      this.add.zone(303, y, 34, 26).setOrigin(0).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => { if (!this.teamPicker) { this.row = i; this.col = 5; this.openLoadout(i); } });
    }
    SETTINGS.forEach((_, i) => {
      this.settingLabels.push(this.add.bitmapText(354, 52 + i * SET_H, 'sm', '').setTint(0x8d95b0).setDepth(2));
      this.settingValues.push(this.add.bitmapText(626, 49 + i * SET_H, 'pxo', '').setOrigin(1, 0).setDepth(2));
    });
    this.bar = new HintBar(this);
    this.joinText = this.add.bitmapText(8, 330, 'sm', '').setTint(0x8d95b0);
    this.status = this.add.bitmapText(354, 48 + SETTINGS.length * SET_H + 1, 'smo', '').setTint(0xea4a4a).setDepth(2);
    this.preview = this.add.image(490, 291, '__DEFAULT').setDepth(1);
    this.blurb = this.add.bitmapText(344, 330, 'sm', '').setTint(0x8d95b0);
    this.refreshPreviews();
    this.render();
  }

  /** Full textured arena, fitted without distorting its proportions. */
  private drawMapPreview(): void {
    if (this.previewMap === this.cfg.mapId) return;
    this.previewMap = this.cfg.mapId;
    this.preview.setTexture(bakeMapPreview(this,this.cfg.mapId)).setDisplaySize(150, 75);
    this.preview.setVisible(this.cfg.mapId !== 'random');
    this.blurb.setText(this.cfg.mapId === 'random' ? 'RANDOM - EACH ROUND' : getMap(this.cfg.mapId).name.toUpperCase()).setOrigin(.5,0).setX(490);
  }

  private get rows(): number {
    return MAX_SLOTS + SETTINGS.length;
  }

  private setting(): Setting | null {
    return this.row >= MAX_SLOTS ? SETTINGS[this.row - MAX_SLOTS] : null;
  }

  private refreshPreviews(): void {
    this.cfg.slots.forEach((s, i) => {
      this.previews[i].destroy();
      const y = 44 + i * 28 + 24;
      this.previews[i] = s.kind === 'empty' ? this.add.container(0, 0) : fighterPreview(this, heroLook(s.hero, s.look), 24, y, 1);
    });
  }

  override update(_time: number, deltaMs: number): void {
    if (this.teamPicker) { this.teamPicker.update(); return; }
    this.t += deltaMs / 1000;
    this.noticeT = Math.max(0, this.noticeT - deltaMs / 1000);
    this.joinPads();
    let changed = false;
    if (menu.back()) {
      saveLobby(this.cfg);
      audio.play('uiBack');
      this.scene.start('title');
      return;
    }
    if (menu.up()) {
      this.row = (this.row - 1 + this.rows) % this.rows;
      audio.play('uiMove');
    }
    if (menu.down()) {
      this.row = (this.row + 1) % this.rows;
      audio.play('uiMove');
    }
    const set = this.setting();
    const lr = menu.left() ? -1 : menu.right() ? 1 : 0;
    if (set === null) {
      if (keyboard.justPressed('KeyP') && this.cfg.slots[this.row].hero === 'ash') { this.openTeam(this.row); return; }
      // slot rows: left/right picks the column, confirm changes it
      if (lr) {
        this.col = (this.col + lr + SLOT_COLS.length) % SLOT_COLS.length;
        audio.play('uiMove');
      }
      if ((menu.confirm() || keyboard.justPressed('Tab')) && SLOT_COLS[this.col] === 'look' && this.cfg.slots[this.row].kind !== 'empty') {
        saveLobby(this.cfg);
        audio.play('uiOk');
        this.scene.start('creator', { slot: this.row });
        return;
      }
      if (menu.confirm() || keyboard.justPressed('Tab')) {
        if (SLOT_COLS[this.col] === 'pokemon') { this.openLoadout(this.row); return; }
        changed = this.changeSlot(this.row, SLOT_COLS[this.col], keyboard.isDown('ShiftLeft') || keyboard.isDown('ShiftRight') ? -1 : 1);
      }
    } else {
      if (lr) changed = this.changeSetting(set, lr);
      if (menu.confirm()) {
        if (set === 'share') {
          void this.copyShareLink();
          return;
        }
        if (set === 'start' || set === 'simulate') return this.start(set === 'simulate');
        if (set === 'controls') {
          saveLobby(this.cfg);
          this.scene.start('controls', { from: 'lobby' });
          return;
        }
        changed = this.changeSetting(set, 1);
      }
    }
    if (keyboard.justPressed('F5')) {
      // quick: randomize every look
      for (const s of this.cfg.slots) {
        s.look = randomAppearance();
        s.hero = '';
        s.abilityHero = undefined;
      }
      changed = true;
    }
    if (changed) {
      saveLobby(this.cfg);
      this.refreshPreviews();
      audio.play('uiOk');
    }
    this.render();
  }

  /** A pad pressing START that isn't in the lobby yet takes the first bot/empty slot. */
  private joinPads(): void {
    const n = connectedPads().length;
    for (let p = 0; p < n; p++) {
      if (!padMenu.justPressed(9, p)) continue;
      const kind = ('pad' + p) as (typeof SLOT_KINDS)[number];
      if (this.cfg.slots.some((s) => s.kind === kind)) continue;
      const slot = this.cfg.slots.find((s) => s.kind === 'empty') ?? this.cfg.slots.find((s) => s.kind === 'bot');
      if (slot) {
        slot.kind = kind;
        saveLobby(this.cfg);
        this.refreshPreviews();
        audio.play('uiOk');
      }
    }
  }

  private openTeam(i: number): void {
    const slot = this.cfg.slots[i];
    if (slot.kind === 'empty' || slot.hero !== 'ash') return;
    this.teamPicker = new PokemonTeamPicker(this, slot.pokemonTeam, slot.pokemon, (team, first) => {
      slot.pokemonTeam = team;
      slot.pokemon = first;
      slot.form = slotStartForm(slot);
      syncSlotToProfile(slot);
      saveLobby(this.cfg);
      this.render();
    }, () => { this.teamPicker = null; this.barMode = ''; });
  }

  /** The Brawlkai body can use a full roster move set without becoming that hero visually. */
  private openAbility(i: number): void {
    const slot = this.cfg.slots[i];
    if (slot.kind === 'empty' || slot.hero) return;
    openFighterPicker(this, slot.abilityHero || 'naruto', (hero) => {
      if (!hero) return;
      slot.abilityHero = hero;
      slot.form = slotStartForm(slot);
      syncSlotToProfile(slot);
      saveLobby(this.cfg);
      this.render();
    });
  }

  private openLoadout(i: number): void {
    const slot = this.cfg.slots[i];
    if (slot.hero === 'ash') this.openTeam(i);
    else if (!slot.hero) this.openAbility(i);
  }

  /** Cycle one slot value; team selection uses its own panel. */
  private changeSlot(i: number, col: (typeof SLOT_COLS)[number], d: number): boolean {
    const s = this.cfg.slots[i];
    if (col === 'kind') s.kind = cycle(SLOT_KINDS, s.kind, d);
    else if (col === 'team') s.team = (s.team + d + 5) % 5;
    else if (col === 'skill') s.difficulty = cycle(DIFF_ORDER, s.difficulty, d);
    else if (col === 'form') {
      const abilityHero = s.hero || s.abilityHero || '';
      if (s.kind === 'empty' || !abilityHero) return false; // only powered loadouts have forms
      const n = 1 + (abilityHero === 'ash' ? pokemonStage(pokemonSpecies(s.pokemon), 0).maxStage : maxLevel(abilityHero));
      s.form = (slotStartForm(s) + d + n) % n;
    } else s.look = randomAppearance();
    return true;
  }

  private changeSetting(set: Setting, d: number): boolean {
    const c = this.cfg;
    switch (set) {
      case 'map':
        c.mapId = cycle(
          ['random', ...MAP_LIST.map((m) => m.id)],
          c.mapId,
          d,
        );
        return true;
      case 'mode':
        c.mode = cycle(MODE_ORDER, c.mode, d);
        return true;
      case 'length':
        if (c.mode === 'coop') return false;
        if (c.mode === 'brawl') c.roundsToWin = (c.roundsToWin+d+11)%11;
        else c.timeLimit = cycle(TIME_OPTIONS, c.timeLimit, d);
        return true;
      case 'sudden':
        c.suddenDeath = cycle(SUDDEN_DEATH_OPTIONS, c.suddenDeath, d);
        return true;
      case 'ff':
        c.friendlyFire = !c.friendlyFire;
        return true;
      case 'weapons':
        c.weaponSpawnRate = cycle(WEAPON_RATES, c.weaponSpawnRate, d);
        return true;
      case 'chaos':
        c.chaos = !c.chaos;
        return true;
      case 'powers':
        c.heroPowers = !c.heroPowers;
        return true;
      case 'fall':
        c.fallDeath = !c.fallDeath;
        // one preference: the Settings menu's FALL DEATH (Quick Match) follows Match Setup and vice versa
        settings.fallDeath = c.fallDeath;
        saveSettings();
        return true;
      default:
        return false;
    }
  }

  private start(simulate = false): void {
    const cfg: LobbyCfg = simulate
      ? { ...this.cfg, slots: this.cfg.slots.map((s) => s.kind === 'empty' ? s : { ...s, kind: 'bot' }) }
      : this.cfg;
    const problem = this.matchProblem(cfg, simulate);

    if (problem) {
      audio.play('uiBack');
      this.cameras.main.shake(120, 0.004);
      return;
    }
    saveLobby(this.cfg);
    audio.play('uiOk');
    const setup = lobbyToMatch(cfg, Math.floor(Math.random() * 1e9));
    if (simulate) {
      const input = window.prompt('Simulation speed multiplier (1 or higher)', '4');
      if (input === null) return;
      const multiplier = Number(input);
      if (!Number.isFinite(multiplier) || multiplier < 1) {
        window.alert('Enter a finite multiplier of 1 or higher.');
        return;
      }
      setup.simulationSpeed = multiplier;
    }
    this.scene.start('match', setup);
  }

  /** Put the share link on the clipboard (or show it in a prompt when the browser refuses). */
  private async copyShareLink(): Promise<void> {
    const url = shareUrl(this.cfg, location.href);
    saveLobby(this.cfg);
    audio.play('uiOk');
    try {
      await navigator.clipboard.writeText(url);
      this.flash('LINK COPIED - PASTE IT TO A FRIEND');
    } catch {
      window.prompt('Copy this link and send it to your friends:', url);
      this.flash('SHARE LINK READY');
    }
  }

  private flash(text: string): void {
    this.notice = text;
    this.noticeT = 3;
  }

  private matchProblem(cfg: LobbyCfg, simulate: boolean): string | null {
    return simulate && cfg.mode === 'coop' ? 'SELECT A COMPETITIVE MODE TO SIMULATE' : lobbyProblem(cfg);
  }

  private render(): void {
    const g = this.gfx;
    g.clear();
    const c = this.cfg;
    const blink = Math.floor(this.t * 3) % 2 === 0;
    // slots
    c.slots.forEach((s, i) => {
      const y = 44 + i * 28;
      const sel = this.row === i;
      g.fillStyle(sel ? 0x3a3054 : 0x221d2e, 1).fillRect(4, y, 334, 26);
      if (s.team > 0 && s.kind !== 'empty') g.fillStyle(hexToNum(TEAM_COLORS[s.team]), 1).fillRect(4, y, 2, 26);
      const [kind, team, skill, look, form, partners] = this.texts[i];
      const dim = s.kind === 'empty' ? 0x5a5668 : 0xffffff;
      kind.setText(SLOT_KIND_LABELS[s.kind]).setTint(s.kind.startsWith('pad') && !connectedPads()[Number(s.kind.slice(3))] ? 0xc08060 : dim);
      team.setText(s.kind === 'empty' ? '' : TEAM_NAMES[s.team]).setTint(s.team > 0 ? hexToNum(TEAM_COLORS[s.team]) : 0xc3c9dc);
      skill.setText(s.kind === 'bot' ? s.difficulty.toUpperCase() : '').setTint(0xc3c9dc);
      look.setText(s.kind === 'empty' ? '' : s.hero ? (HEROES[s.hero]?.name ?? 'EDIT...') : 'EDIT...').setTint(s.hero ? hexToNum(P.orange) : 0x8d95b0);
      const lv = slotStartForm(s);
      const abilityHero = s.hero || s.abilityHero || '';
      const major = abilityHero === 'ash' ? pokemonStage(pokemonSpecies(s.pokemon), lv).special : undefined;
      const formLabel = major === 'mega' ? 'MEGA' : major === 'bond' ? 'BOND' : lv ? `FORM ${lv}` : 'BASE';
      form.setText(s.kind === 'empty' || !abilityHero ? '' : formLabel).setTint(lv ? hexToNum(P.yellow) : 0xc3c9dc);
      partners.setText(s.kind !== 'empty' && s.hero === 'ash' ? pokemonTeam(s.pokemonTeam, pokemonSpecies(s.pokemon)).length + '/8' : abilityHero ? (HEROES[abilityHero]?.name ?? 'SET') : 'PICK')
        .setTint(s.hero === 'ash' || abilityHero ? 0xffdc69 : 0x5a5668);
      if (sel) {
        g.lineStyle(1, blink ? 0xffffff : 0xf8c840, 1).strokeRect(SLOT_COL_X[this.col] - 3.5, y + 2.5, SLOT_COL_W[this.col], 14);
      }
    });
    // settings
    const vals: Record<Setting, [string, string]> = {
      map: ['MAP', c.mapId === 'random' ? 'RANDOM' : MAP_LIST.find((m) => m.id === c.mapId)?.name ?? c.mapId],
      mode: ['MODE', MODE_NAMES[c.mode]],
      length:
        c.mode === 'brawl'
          ? ['CHAMPIONSHIP', c.roundsToWin===0?'UNLIMITED':`${c.roundsToWin} ROUNDS`]
          : c.mode === 'coop'
            ? ['LENGTH', 'SURVIVE 15 WAVES']
            : ['TIME LIMIT', `${Math.floor(c.timeLimit / 60)}:${String(c.timeLimit % 60).padStart(2, '0')}`],
      sudden: ['SUDDEN DEATH', c.mode === 'brawl' ? (c.suddenDeath ? c.suddenDeath + 'S' : 'OFF') : '-'],
      ff: ['FRIENDLY FIRE', c.friendlyFire ? 'ON' : 'OFF'],
      weapons: ['WEAPONS', WEAPON_RATE_LABELS[WEAPON_RATES.indexOf(c.weaponSpawnRate)] ?? 'NORMAL'],
      chaos: ['CHAOS CARDS', c.chaos ? 'ON' : 'OFF'],
      powers: ['HERO POWER-UPS', c.heroPowers && c.mode !== 'gungame' ? 'ON' : 'OFF'],
      fall: ['FALL DEATH', c.fallDeath ? 'ON' : 'OFF (THROWN BACK)'],
      start: ['', '>> START MATCH <<'],
      controls: ['', 'CONTROLS...'],
      simulate: ['', 'SIMULATE MATCH...'],
      share: ['', 'SHARE LINK (COPY)'],
    };
    panel(g, 344, 38, 292, SETTINGS.length * SET_H + 19, hexToNum(P.purple1), this.setting() !== null);
    SETTINGS.forEach((st, i) => {
      const sel = this.row === MAX_SLOTS + i;
      const y = 50 + i * SET_H;
      if (sel) rowBar(g, 346, y - 3, 288, 15, blink);
      const [label, value] = vals[st];
      const label_ = this.settingLabels[i];
      const val = this.settingValues[i];
      if (st === 'start' || st === 'controls' || st === 'simulate' || st === 'share') {
        label_.setText('');
        val.setOrigin(0.5, 0).setX(490).setText(value).setTint(st === 'start' ? hexToNum(P.green2) : sel ? 0xffffff : 0xc3c9dc);
      } else {
        label_.setText(label).setTint(sel ? 0xffffff : 0x8d95b0);
        val.setOrigin(1, 0).setX(626).setText(sel ? `< ${value} >` : value).setTint(sel ? 0xffffff : 0xfff4a0);
      }
    });
    this.drawMapPreview();
    const simulate = this.setting() === 'simulate';
    const problem = this.matchProblem(simulate
      ? { ...c, slots: c.slots.map((s) => s.kind === 'empty' ? s : { ...s, kind: 'bot' }) }
      : c, simulate);
    const note = this.noticeT > 0 ? this.notice : '';
    this.status.setText(note || (problem ?? '')).setTint(note ? 0x5ac85a : 0xea4a4a).setVisible(!!(note || problem));
    const pads = connectedPads().length;
    const ps = pads > 0 && padStyleOf() === 'ps';
    this.joinText.setText(
      pads > 0
        ? `${pads} PAD${pads > 1 ? 'S' : ''} CONNECTED - PRESS ${ps ? PAD_NAMES.ps[9] : PAD_NAMES.xbox[9]} (${ps ? PAD_NAMES.xbox[9] : PAD_NAMES.ps[9]}) ON A PAD TO JOIN`
        : 'NO GAMEPAD - PLUG IN A PLAYSTATION OR XBOX PAD TO ADD PLAYERS',
    );
    const mode = this.setting() === null ? 'slot' : 'rules';
    if (mode !== this.barMode) {
      this.barMode = mode;
      this.bar.set(
        mode === 'slot'
          ? [hint.move('SLOT', 'ud'), hint.move('COLUMN', 'lr'), hint.ok('CHANGE'), hint.key('SHUFFLE LOOKS', ['F5']), hint.back('BACK')]
          : [hint.move('SETTING', 'ud'), hint.move('CHANGE', 'lr'), hint.ok('SELECT'), hint.back('BACK')],
      );
    }
    this.bar.update();
  }
}
