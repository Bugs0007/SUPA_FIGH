import Phaser from 'phaser';
import { randomAppearance } from '../art/appearance';
import { hexToNum, P, TEAM_COLORS, TEAM_NAMES } from '../art/palette';
import { audio } from '../audio/AudioManager';
import { VIEW_H, VIEW_W } from '../game/display';
import { connectedPads, padMenu } from '../input/gamepad';
import { keyboard } from '../input/keyboard';
import { menu } from '../input/menu';
import { MAP_LIST } from '../sim/map/maps';
import { MODE_NAMES } from '../sim/match';
import {
  DIFF_ORDER,
  lobbyProblem,
  lobbyToMatch,
  loadLobby,
  MAX_SLOTS,
  saveLobby,
  SLOT_KIND_LABELS,
  SLOT_KINDS,
  SUDDEN_DEATH_OPTIONS,
  TIME_OPTIONS,
  WEAPON_RATE_LABELS,
  WEAPON_RATES,
  type LobbyCfg,
} from './lobby';
import { bindZoom, fighterPreview } from './ui';

const SLOT_COLS = ['kind', 'team', 'skill', 'look'] as const;
const SETTINGS = ['map', 'mode', 'length', 'sudden', 'ff', 'weapons', 'start', 'controls'] as const;
type Setting = (typeof SETTINGS)[number];

const cycle = <T,>(list: readonly T[], cur: T, d: number): T => list[(list.indexOf(cur) + d + list.length) % list.length];

/** Match setup: 10 fighter slots (keyboard / gamepad / bot / empty, team, bot skill, look) + rules. */
export class LobbyScene extends Phaser.Scene {
  private cfg!: LobbyCfg;
  private row = 0;
  private col = 0;
  private texts: Phaser.GameObjects.BitmapText[][] = [];
  private settingTexts: Phaser.GameObjects.BitmapText[] = [];
  private previews: Phaser.GameObjects.Container[] = [];
  private gfx!: Phaser.GameObjects.Graphics;
  private hint!: Phaser.GameObjects.BitmapText;
  private status!: Phaser.GameObjects.BitmapText;
  private t = 0;

  constructor() {
    super('lobby');
  }

  create(): void {
    bindZoom(this, VIEW_W, VIEW_H);
    this.cameras.main.setBackgroundColor(P.night);
    this.cfg = loadLobby();
    this.row = 0;
    this.col = 0;
    this.gfx = this.add.graphics();
    this.add.bitmapText(VIEW_W / 2, 8, 'pxo', 'MATCH SETUP').setOrigin(0.5, 0).setScale(2).setTint(hexToNum(P.yellow));
    this.add.bitmapText(36, 32, 'sm', 'FIGHTER').setTint(0x8d95b0);
    this.add.bitmapText(130, 32, 'sm', 'TEAM').setTint(0x8d95b0);
    this.add.bitmapText(186, 32, 'sm', 'BOT SKILL').setTint(0x8d95b0);
    this.add.bitmapText(244, 32, 'sm', 'LOOK').setTint(0x8d95b0);
    for (let i = 0; i < MAX_SLOTS; i++) {
      const y = 44 + i * 28;
      this.add.bitmapText(8, y + 6, 'smo', String(i + 1)).setTint(0x8d95b0);
      this.texts.push([0, 1, 2, 3].map((c) => this.add.bitmapText([36, 130, 186, 244][c], y + 6, 'smo', '')));
      this.previews.push(this.add.container(0, 0));
    }
    SETTINGS.forEach((_, i) => this.settingTexts.push(this.add.bitmapText(352, 48 + i * 22, 'pxo', '')));
    this.hint = this.add.bitmapText(VIEW_W / 2, VIEW_H - 12, 'sm', '').setOrigin(0.5, 0).setTint(0xc3c9dc);
    this.status = this.add.bitmapText(352, 48 + SETTINGS.length * 22 + 6, 'smo', '').setTint(0xea4a4a);
    this.refreshPreviews();
    this.render();
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
      this.previews[i] = s.kind === 'empty' ? this.add.container(0, 0) : fighterPreview(this, s.look, 24, y, 1);
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
      if (menu.confirm() || keyboard.justPressed('Tab')) {
        this.changeSlot(this.row, SLOT_COLS[this.col], keyboard.isDown('ShiftLeft') || keyboard.isDown('ShiftRight') ? -1 : 1);
        changed = true;
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
      for (const s of this.cfg.slots) s.look = randomAppearance();
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

  private changeSlot(i: number, col: (typeof SLOT_COLS)[number], d: number): void {
    const s = this.cfg.slots[i];
    if (col === 'kind') s.kind = cycle(SLOT_KINDS, s.kind, d);
    else if (col === 'team') s.team = (s.team + d + 5) % 5;
    else if (col === 'skill') s.difficulty = cycle(DIFF_ORDER, s.difficulty, d);
    else s.look = randomAppearance();
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
        c.mode = c.mode === 'brawl' ? 'deathmatch' : 'brawl';
        return true;
      case 'length':
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
      g.fillStyle(sel ? 0x3a3054 : 0x221d2e, 1).fillRect(4, y, 300, 26);
      if (s.team > 0 && s.kind !== 'empty') g.fillStyle(hexToNum(TEAM_COLORS[s.team]), 1).fillRect(4, y, 2, 26);
      const [kind, team, skill, look] = this.texts[i];
      const dim = s.kind === 'empty' ? 0x5a5668 : 0xffffff;
      kind.setText(SLOT_KIND_LABELS[s.kind]).setTint(s.kind.startsWith('pad') && !connectedPads()[Number(s.kind.slice(3))] ? 0xc08060 : dim);
      team.setText(s.kind === 'empty' ? '' : TEAM_NAMES[s.team]).setTint(s.team > 0 ? hexToNum(TEAM_COLORS[s.team]) : 0xc3c9dc);
      skill.setText(s.kind === 'bot' ? s.difficulty.toUpperCase() : '').setTint(0xc3c9dc);
      look.setText(s.kind === 'empty' ? '' : 'SHUFFLE').setTint(0x8d95b0);
      if (sel) {
        const x = [36, 130, 186, 244][this.col];
        const w = [88, 50, 52, 50][this.col];
        g.lineStyle(1, blink ? 0xffffff : 0xf8c840, 1).strokeRect(x - 3.5, y + 2.5, w, 14);
      }
    });
    // settings
    const vals: Record<Setting, string> = {
      map: `MAP: ${MAP_LIST.find((m) => m.id === c.mapId)?.name ?? c.mapId}`,
      mode: `MODE: ${MODE_NAMES[c.mode]}`,
      length: c.mode === 'brawl' ? `FIRST TO: ${c.roundsToWin} ROUNDS` : `TIME: ${Math.floor(c.timeLimit / 60)}:${String(c.timeLimit % 60).padStart(2, '0')}`,
      sudden: `SUDDEN DEATH: ${c.mode === 'brawl' ? (c.suddenDeath ? c.suddenDeath + 'S' : 'OFF') : '-'}`,
      ff: `FRIENDLY FIRE: ${c.friendlyFire ? 'ON' : 'OFF'}`,
      weapons: `WEAPONS: ${WEAPON_RATE_LABELS[WEAPON_RATES.indexOf(c.weaponSpawnRate)] ?? 'NORMAL'}`,
      start: '>> START MATCH <<',
      controls: 'CONTROLS...',
    };
    SETTINGS.forEach((s, i) => {
      const sel = this.row === MAX_SLOTS + i;
      const y = 48 + i * 22;
      if (sel) g.fillStyle(0x3a3054, 1).fillRect(344, y - 4, 290, 16);
      this.settingTexts[i].setText(vals[s]).setTint(s === 'start' ? hexToNum(P.green2) : sel ? 0xffffff : 0xc3c9dc);
    });
    const problem = lobbyProblem(c);
    this.status.setText(problem ?? '').setVisible(!!problem);
    const pads = connectedPads().length;
    this.hint.setText(
      this.setting() === null
        ? `UP/DOWN: SLOT   LEFT/RIGHT: COLUMN   ENTER: CHANGE (SHIFT = BACK)   F5: SHUFFLE ALL   ESC: BACK   PADS: ${pads} (START = JOIN)`
        : `UP/DOWN: SETTING   LEFT/RIGHT: CHANGE   ENTER: SELECT   ESC: BACK   PADS: ${pads} (START = JOIN)`,
    );
  }
}
