import Phaser from 'phaser';
import { randomAppearance } from '../art/appearance';
import { heroLook } from '../art/heroArt';
import { HEROES, maxLevel } from '../sim/data/heroes';
import { hexToNum, P, TEAM_COLORS, TEAM_NAMES } from '../art/palette';
import { audio } from '../audio/AudioManager';
import { VIEW_H, VIEW_W } from '../game/display';
import { connectedPads, padMenu } from '../input/gamepad';
import { keyboard } from '../input/keyboard';
import { menu } from '../input/menu';
import { getMap, MAP_LIST } from '../sim/map/maps';
import { MODE_NAMES, type GameMode } from '../sim/match';

const MODE_ORDER: GameMode[] = ['brawl', 'deathmatch', 'koth', 'juggernaut', 'gungame', 'coop'];
import {
  DIFF_ORDER,
  lobbyProblem,
  lobbyToMatch,
  loadLobby,
  MAX_SLOTS,
  saveLobby,
  slotStartForm,
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

const SLOT_COLS = ['kind', 'team', 'skill', 'look', 'form'] as const;
const SLOT_COL_X = [36, 130, 186, 244, 298];
const SLOT_COL_W = [88, 50, 52, 50, 38];
const SETTINGS = ['map', 'mode', 'length', 'sudden', 'ff', 'weapons', 'chaos', 'powers', 'start', 'controls'] as const;
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

  constructor() {
    super('lobby');
  }

  create(): void {
    bindZoom(this, VIEW_W, VIEW_H);
    this.cameras.main.setBackgroundColor(P.night);
    this.cfg = loadLobby();
    this.row = 0;
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
    this.add.bitmapText(130, 32, 'sm', 'TEAM').setTint(0x8d95b0);
    this.add.bitmapText(186, 32, 'sm', 'BOT SKILL').setTint(0x8d95b0);
    this.add.bitmapText(244, 32, 'sm', 'HERO / LOOK').setTint(0x8d95b0);
    this.add.bitmapText(298, 32, 'sm', 'START FORM').setTint(0x8d95b0);
    for (let i = 0; i < MAX_SLOTS; i++) {
      const y = 44 + i * 28;
      this.add.bitmapText(8, y + 6, 'smo', String(i + 1)).setTint(0x8d95b0);
      this.texts.push(SLOT_COL_X.map((x) => this.add.bitmapText(x, y + 6, 'smo', '')));
      this.previews.push(this.add.container(0, 0));
    }
    SETTINGS.forEach((_, i) => {
      this.settingLabels.push(this.add.bitmapText(354, 52 + i * 17, 'sm', '').setTint(0x8d95b0).setDepth(2));
      this.settingValues.push(this.add.bitmapText(626, 49 + i * 17, 'pxo', '').setOrigin(1, 0).setDepth(2));
    });
    this.bar = new HintBar(this);
    this.joinText = this.add.bitmapText(8, 330, 'sm', '').setTint(0x8d95b0);
    this.status = this.add.bitmapText(354, 48 + SETTINGS.length * 17 + 3, 'smo', '').setTint(0xea4a4a).setDepth(2);
    this.preview = this.add.image(490,280,'__DEFAULT').setDepth(1);
    this.blurb = this.add.bitmapText(344, 330, 'sm', '').setTint(0x8d95b0);
    this.refreshPreviews();
    this.render();
  }

  /** Full textured arena, fitted without distorting its proportions. */
  private drawMapPreview(): void {
    if (this.previewMap === this.cfg.mapId) return;
    this.previewMap = this.cfg.mapId;
    this.preview.setTexture(bakeMapPreview(this,this.cfg.mapId)).setDisplaySize(184,92);
    this.blurb.setText(getMap(this.cfg.mapId).name.toUpperCase()).setOrigin(.5,0).setX(490);
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
    this.t += deltaMs / 1000;
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
        changed = this.changeSlot(this.row, SLOT_COLS[this.col], keyboard.isDown('ShiftLeft') || keyboard.isDown('ShiftRight') ? -1 : 1);
      }
    } else {
      if (lr) changed = this.changeSetting(set, lr);
      if (menu.confirm()) {
        if (set === 'start') return this.start();
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

  /** Cycle the value of one slot column; false when that column does nothing for this slot. */
  private changeSlot(i: number, col: (typeof SLOT_COLS)[number], d: number): boolean {
    const s = this.cfg.slots[i];
    if (col === 'kind') s.kind = cycle(SLOT_KINDS, s.kind, d);
    else if (col === 'team') s.team = (s.team + d + 5) % 5;
    else if (col === 'skill') s.difficulty = cycle(DIFF_ORDER, s.difficulty, d);
    else if (col === 'form') {
      if (s.kind === 'empty' || !s.hero) return false; // only heroes have power-up forms
      const n = maxLevel(s.hero) + 1;
      s.form = (slotStartForm(s) + d + n) % n;
    } else s.look = randomAppearance();
    return true;
  }

  private changeSetting(set: Setting, d: number): boolean {
    const c = this.cfg;
    switch (set) {
      case 'map':
        c.mapId = cycle(
          MAP_LIST.map((m) => m.id),
          c.mapId,
          d,
        );
        return true;
      case 'mode':
        c.mode = cycle(MODE_ORDER, c.mode, d);
        return true;
      case 'length':
        if (c.mode === 'coop') return false;
        if (c.mode === 'brawl') c.roundsToWin = Math.max(1, Math.min(10, c.roundsToWin + d));
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
      default:
        return false;
    }
  }

  private start(): void {
    const problem = lobbyProblem(this.cfg);
    if (problem) {
      audio.play('uiBack');
      this.cameras.main.shake(120, 0.004);
      return;
    }
    saveLobby(this.cfg);
    audio.play('uiOk');
    this.scene.start('match', lobbyToMatch(this.cfg, Math.floor(Math.random() * 1e9)));
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
      const [kind, team, skill, look, form] = this.texts[i];
      const dim = s.kind === 'empty' ? 0x5a5668 : 0xffffff;
      kind.setText(SLOT_KIND_LABELS[s.kind]).setTint(s.kind.startsWith('pad') && !connectedPads()[Number(s.kind.slice(3))] ? 0xc08060 : dim);
      team.setText(s.kind === 'empty' ? '' : TEAM_NAMES[s.team]).setTint(s.team > 0 ? hexToNum(TEAM_COLORS[s.team]) : 0xc3c9dc);
      skill.setText(s.kind === 'bot' ? s.difficulty.toUpperCase() : '').setTint(0xc3c9dc);
      look.setText(s.kind === 'empty' ? '' : s.hero ? (HEROES[s.hero]?.name ?? 'EDIT...') : 'EDIT...').setTint(s.hero ? hexToNum(P.orange) : 0x8d95b0);
      const lv = slotStartForm(s);
      form.setText(s.kind === 'empty' || !s.hero ? '' : lv ? `FORM ${lv}` : 'BASE').setTint(lv ? hexToNum(P.yellow) : 0xc3c9dc);
      if (sel) {
        g.lineStyle(1, blink ? 0xffffff : 0xf8c840, 1).strokeRect(SLOT_COL_X[this.col] - 3.5, y + 2.5, SLOT_COL_W[this.col], 14);
      }
    });
    // settings
    const vals: Record<Setting, [string, string]> = {
      map: ['MAP', MAP_LIST.find((m) => m.id === c.mapId)?.name ?? c.mapId],
      mode: ['MODE', MODE_NAMES[c.mode]],
      length:
        c.mode === 'brawl'
          ? ['FIRST TO', `${c.roundsToWin} ROUNDS`]
          : c.mode === 'coop'
            ? ['LENGTH', 'SURVIVE 15 WAVES']
            : ['TIME LIMIT', `${Math.floor(c.timeLimit / 60)}:${String(c.timeLimit % 60).padStart(2, '0')}`],
      sudden: ['SUDDEN DEATH', c.mode === 'brawl' ? (c.suddenDeath ? c.suddenDeath + 'S' : 'OFF') : '-'],
      ff: ['FRIENDLY FIRE', c.friendlyFire ? 'ON' : 'OFF'],
      weapons: ['WEAPONS', WEAPON_RATE_LABELS[WEAPON_RATES.indexOf(c.weaponSpawnRate)] ?? 'NORMAL'],
      chaos: ['CHAOS CARDS', c.chaos ? 'ON' : 'OFF'],
      powers: ['HERO POWER-UPS', c.heroPowers && c.mode !== 'gungame' ? 'ON' : 'OFF'],
      start: ['', '>> START MATCH <<'],
      controls: ['', 'CONTROLS...'],
    };
    panel(g, 344, 38, 292, SETTINGS.length * 17 + 22, hexToNum(P.purple1), this.setting() !== null);
    SETTINGS.forEach((st, i) => {
      const sel = this.row === MAX_SLOTS + i;
      const y = 50 + i * 17;
      if (sel) rowBar(g, 346, y - 3, 288, 15, blink);
      const [label, value] = vals[st];
      const label_ = this.settingLabels[i];
      const val = this.settingValues[i];
      if (st === 'start' || st === 'controls') {
        label_.setText('');
        val.setOrigin(0.5, 0).setX(490).setText(value).setTint(st === 'start' ? hexToNum(P.green2) : sel ? 0xffffff : 0xc3c9dc);
      } else {
        label_.setText(label).setTint(sel ? 0xffffff : 0x8d95b0);
        val.setOrigin(1, 0).setX(626).setText(sel ? `< ${value} >` : value).setTint(sel ? 0xffffff : 0xfff4a0);
      }
    });
    this.drawMapPreview();
    const problem = lobbyProblem(c);
    this.status.setText(problem ?? '').setVisible(!!problem);
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
