import Phaser from 'phaser';
import { hexToNum, P } from '../art/palette';
import { audio } from '../audio/AudioManager';
import { VIEW_H, VIEW_W } from '../game/display';
import {
  ACTION_LABELS,
  ACTIONS,
  findConflicts,
  keyboardBinds,
  keyLabel,
  resetKeyBinds,
  saveKeyBinds,
  setBinding,
  type Action,
} from '../input/bindings';
import { connectedPads, PAD_ACTIONS, PAD_BUTTON_NAMES, padBinds, padMenu, resetPadBinds, savePadBinds, type PadAction } from '../input/gamepad';
import { keyboard } from '../input/keyboard';
import { menu } from '../input/menu';
import { bindZoom } from './ui';

const TABS = ['KEYBOARD 1', 'KEYBOARD 2', 'GAMEPAD 1', 'GAMEPAD 2', 'GAMEPAD 3', 'GAMEPAD 4'];
const PLAYER_NAME = ['P1', 'P2'];

/** Rebind every action, per keyboard layout and per gamepad. Saved immediately. */
export class ControlsScene extends Phaser.Scene {
  private tab = 0;
  /** 0 = tab row, 1..n = action rows, then RESTORE DEFAULTS, BACK */
  private row = 0;
  private col = 0;
  private capturing = false;
  private from = 'title';
  private texts: Phaser.GameObjects.BitmapText[][] = [];
  private tabText!: Phaser.GameObjects.BitmapText;
  private footer!: Phaser.GameObjects.BitmapText;
  private warn!: Phaser.GameObjects.BitmapText;
  private gfx!: Phaser.GameObjects.Graphics;
  private t = 0;

  constructor() {
    super('controls');
  }

  create(data: { from?: string }): void {
    this.from = data?.from ?? 'title';
    bindZoom(this, VIEW_W, VIEW_H);
    this.cameras.main.setBackgroundColor(P.night);
    this.tab = 0;
    this.row = 0;
    this.col = 0;
    this.capturing = false;
    this.texts = [];
    this.gfx = this.add.graphics();
    this.add.bitmapText(VIEW_W / 2, 8, 'pxo', 'CONTROLS').setOrigin(0.5, 0).setScale(2).setTint(hexToNum(P.yellow));
    this.tabText = this.add.bitmapText(VIEW_W / 2, 36, 'pxo', '').setOrigin(0.5, 0);
    for (let i = 0; i < ACTIONS.length + 2; i++) {
      const y = 60 + i * 19;
      this.texts.push([this.add.bitmapText(120, y, 'pxo', ''), this.add.bitmapText(330, y, 'pxo', ''), this.add.bitmapText(450, y, 'pxo', '')]);
    }
    this.warn = this.add.bitmapText(VIEW_W / 2, VIEW_H - 34, 'smo', '').setOrigin(0.5, 0).setTint(0xea4a4a);
    this.footer = this.add.bitmapText(VIEW_W / 2, VIEW_H - 14, 'sm', '').setOrigin(0.5, 0).setTint(0xc3c9dc);
    this.render();
  }

  private get isPad(): boolean {
    return this.tab >= 2;
  }

  private get actions(): readonly string[] {
    return this.isPad ? PAD_ACTIONS : ACTIONS;
  }

  private get rowCount(): number {
    return 1 + this.actions.length + 2;
  }

  override update(_time: number, deltaMs: number): void {
    this.t += deltaMs / 1000;
    if (this.capturing) {
      this.capture();
      this.render();
      return;
    }
    if (menu.back() && !keyboard.justPressed('Backspace')) {
      audio.play('uiBack');
      this.scene.start(this.from);
      return;
    }
    if (menu.up()) {
      this.row = (this.row - 1 + this.rowCount) % this.rowCount;
      audio.play('uiMove');
    }
    if (menu.down()) {
      this.row = (this.row + 1) % this.rowCount;
      audio.play('uiMove');
    }
    const lr = menu.left() ? -1 : menu.right() ? 1 : 0;
    const nActions = this.actions.length;
    if (lr) {
      if (this.row === 0) {
        this.tab = (this.tab + lr + TABS.length) % TABS.length;
        this.row = Math.min(this.row, this.rowCount - 1);
      } else if (!this.isPad) this.col = this.col === 0 ? 1 : 0;
      audio.play('uiMove');
    }
    if (menu.confirm()) {
      if (this.row >= 1 && this.row <= nActions) {
        this.capturing = true;
        audio.play('uiOk');
      } else if (this.row === nActions + 1) {
        if (this.isPad) resetPadBinds(this.tab - 2);
        else resetKeyBinds(this.tab);
        audio.play('uiOk');
      } else if (this.row === nActions + 2) {
        audio.play('uiBack');
        this.scene.start(this.from);
        return;
      }
    }
    if (keyboard.justPressed('Delete') && this.row >= 1 && this.row <= nActions && !this.isPad) {
      setBinding(keyboardBinds[this.tab], ACTIONS[this.row - 1], this.col, null);
      saveKeyBinds();
    }
    this.render();
  }

  private capture(): void {
    if (this.isPad) {
      const slot = this.tab - 2;
      if (keyboard.justPressed('Escape') || padMenu.justPressed(8, slot)) {
        this.capturing = false;
        return;
      }
      const b = padMenu.firstJustPressed(slot);
      if (b === null || b >= 12) return; // d-pad is reserved for movement
      const a = PAD_ACTIONS[this.row - 1] as PadAction;
      padBinds[slot][a] = [b];
      savePadBinds();
      this.capturing = false;
      audio.play('uiOk');
      return;
    }
    const code = keyboard.firstJustPressed();
    if (!code) return;
    this.capturing = false;
    if (code === 'Escape') return;
    const a = ACTIONS[this.row - 1];
    if (code === 'Backspace' || code === 'Delete') setBinding(keyboardBinds[this.tab], a, this.col, null);
    else if (code === 'ControlLeft' || code === 'ControlRight' || code === 'AltLeft' || code === 'AltRight' || code === 'MetaLeft' || code === 'MetaRight') {
      this.warn.setText('CTRL / ALT / META CAN CLOSE THE TAB WITH 2 PLAYERS - PICK ANOTHER KEY');
      return;
    } else setBinding(keyboardBinds[this.tab], a, this.col, code);
    saveKeyBinds();
    audio.play('uiOk');
  }

  private conflictText(player: number, action: Action, code: string): string | null {
    for (const c of findConflicts(keyboardBinds)) {
      if (c.code !== code) continue;
      const other = c.a.player === player && c.a.action === action ? c.b : c.b.player === player && c.b.action === action ? c.a : null;
      if (other) return `${keyLabel(code)} IS ALSO ${PLAYER_NAME[other.player]} ${ACTION_LABELS[other.action]}`;
    }
    return null;
  }

  private render(): void {
    const g = this.gfx;
    g.clear();
    const blink = Math.floor(this.t * 3) % 2 === 0;
    const padSlot = this.tab - 2;
    const padOk = this.isPad && !!connectedPads()[padSlot];
    this.tabText
      .setText(`<  ${TABS[this.tab]}${this.isPad && !padOk ? ' (NOT CONNECTED)' : ''}  >`)
      .setTint(this.row === 0 ? 0xffffff : 0x8d95b0);
    if (this.row === 0) g.fillStyle(0x3a3054, 1).fillRect(140, 32, 360, 15);
    const acts = this.actions;
    let warning = '';
    for (let i = 0; i < this.texts.length; i++) {
      const [label, k1, k2] = this.texts[i];
      const y = 60 + i * 19;
      const rowIdx = i + 1;
      const sel = this.row === rowIdx;
      if (sel) g.fillStyle(0x3a3054, 1).fillRect(110, y - 4, 420, 16);
      if (i < acts.length) {
        const a = acts[i];
        if (this.isPad) {
          label.setText(ACTION_LABELS[a as Action]).setTint(0xc3c9dc);
          const btns = padBinds[padSlot][a as PadAction];
          k1.setText(this.capturing && sel ? (blink ? 'PRESS A BUTTON' : '') : btns.map((b) => PAD_BUTTON_NAMES[b] ?? 'B' + b).join(' / ') || '-').setTint(0xffffff);
          k2.setText('');
        } else {
          const binds = keyboardBinds[this.tab][a as Action];
          label.setText(ACTION_LABELS[a as Action]).setTint(0xc3c9dc);
          [k1, k2].forEach((t, c) => {
            const code = binds[c];
            const conflict = code ? this.conflictText(this.tab, a as Action, code) : null;
            if (conflict && !warning) warning = conflict;
            const capturingThis = this.capturing && sel && this.col === c;
            t.setText(capturingThis ? (blink ? 'PRESS A KEY' : '') : code ? keyLabel(code) : '-').setTint(conflict ? 0xea4a4a : 0xffffff);
            if (sel && this.col === c && !this.capturing) g.lineStyle(1, blink ? 0xffffff : 0xf8c840, 1).strokeRect(t.x - 3.5, y - 3.5, 110, 14);
          });
        }
      } else if (i === acts.length) {
        label.setText('RESTORE DEFAULTS').setTint(sel ? 0xffffff : 0xc3c9dc);
        k1.setText('');
        k2.setText('');
      } else if (i === acts.length + 1) {
        label.setText('BACK').setTint(sel ? 0xffffff : 0xc3c9dc);
        k1.setText('');
        k2.setText('');
      } else {
        label.setText('');
        k1.setText('');
        k2.setText('');
      }
    }
    if (!this.capturing && !warning.startsWith('CTRL')) this.warn.setText(warning);
    this.footer.setText(
      this.capturing
        ? this.isPad
          ? 'PRESS A PAD BUTTON   ESC / BACK: CANCEL'
          : 'PRESS A KEY   ESC: CANCEL   BACKSPACE: CLEAR'
        : this.isPad
          ? 'UP/DOWN: ACTION   ENTER: REBIND   MOVEMENT = LEFT STICK / D-PAD   ESC: BACK'
          : 'UP/DOWN: ACTION   LEFT/RIGHT: 1ST/2ND KEY   ENTER: REBIND   DEL: CLEAR   ESC: BACK',
    );
  }
}
