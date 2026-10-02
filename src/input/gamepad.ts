// Gamepad support via the raw Gamepad API (Phaser's gamepad plugin is disabled). Standard mapping:
//   0 A  1 B  2 X  3 Y  4 LB  5 RB  6 LT  7 RT  8 Back  9 Start  12-15 D-pad  axes 0/1 left stick.
// Movement always comes from the left stick + d-pad; buttons are rebindable per pad (stored).

import { emptyIntent, type Intent } from '../sim/intent';
import { load, save } from '../game/storage';
import type { Controller } from './controllers';

export const PAD_ACTIONS = ['jump', 'attack', 'kick', 'interact', 'cycle', 'gadget', 'ability'] as const;
export type PadAction = (typeof PAD_ACTIONS)[number];
export type PadBinds = Record<PadAction, number[]>;

export const DEFAULT_PAD: PadBinds = {
  jump: [0],
  attack: [2, 7],
  kick: [1],
  interact: [3],
  cycle: [5],
  gadget: [4],
  ability: [6],
};

export const PAD_BUTTON_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'BACK', 'START', 'LS', 'RS', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'HOME'];

const MAX_PADS = 4;
const DEADZONE = 0.3;

function clonePad(b: PadBinds): PadBinds {
  const out = {} as PadBinds;
  for (const a of PAD_ACTIONS) out[a] = [...b[a]];
  return out;
}

/** Per-pad-slot button bindings (pad slot = order the pads were connected in). */
export const padBinds: PadBinds[] = (() => {
  const stored = load<PadBinds[] | null>('padbinds', null);
  return Array.from({ length: MAX_PADS }, (_, i) => {
    const d = clonePad(DEFAULT_PAD);
    const s = stored?.[i];
    if (s) for (const a of PAD_ACTIONS) if (Array.isArray(s[a])) d[a] = s[a];
    return d;
  });
})();

export function savePadBinds(): void {
  save('padbinds', padBinds);
}

export function resetPadBinds(slot: number): void {
  padBinds[slot] = clonePad(DEFAULT_PAD);
  savePadBinds();
}

function pads(): (Gamepad | null)[] {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return [];
  return Array.from(navigator.getGamepads());
}

/** Connected pads in slot order (index = slot). */
export function connectedPads(): Gamepad[] {
  return pads().filter((p): p is Gamepad => !!p && p.connected).slice(0, MAX_PADS);
}

function pressed(p: Gamepad, b: number): boolean {
  const btn = p.buttons[b];
  return !!btn && (btn.pressed || btn.value > 0.5);
}

/** Edge tracker for menus: any pad, standard buttons. Call update() once per frame. */
class PadMenu {
  private prev: boolean[][] = [];
  private cur: boolean[][] = [];
  private prevAxis: number[][] = [];
  private curAxis: number[][] = [];

  update(): void {
    this.prev = this.cur;
    this.prevAxis = this.curAxis;
    const ps = connectedPads();
    this.cur = ps.map((p) => p.buttons.map((_, i) => pressed(p, i)));
    this.curAxis = ps.map((p) => [axis(p.axes[0]), axis(p.axes[1])]);
  }

  /** button pressed this frame on pad `slot` (or any pad if slot < 0) */
  justPressed(button: number, slot = -1): boolean {
    for (let s = 0; s < this.cur.length; s++) {
      if (slot >= 0 && s !== slot) continue;
      if (this.cur[s][button] && !this.prev[s]?.[button]) return true;
    }
    return false;
  }

  /** stick flicked to a direction this frame: axis 0 = x, 1 = y; dir -1/1 */
  flicked(ax: number, dir: number): boolean {
    for (let s = 0; s < this.curAxis.length; s++) {
      if (this.curAxis[s][ax] === dir && this.prevAxis[s]?.[ax] !== dir) return true;
    }
    return false;
  }

  /** first button pressed this frame on a pad (rebinding capture) */
  firstJustPressed(slot: number): number | null {
    const c = this.cur[slot];
    if (!c) return null;
    for (let b = 0; b < c.length; b++) if (c[b] && !this.prev[slot]?.[b]) return b;
    return null;
  }
}

const axis = (v: number | undefined) => (v === undefined ? 0 : v > 0.6 ? 1 : v < -0.6 ? -1 : 0);

export const padMenu = new PadMenu();

export class GamepadController implements Controller {
  readonly label: string;
  private out = emptyIntent();

  constructor(readonly slot: number) {
    this.label = 'PAD ' + (slot + 1);
  }

  private pad(): Gamepad | null {
    return connectedPads()[this.slot] ?? null;
  }

  poll(): Intent {
    const o = this.out;
    const p = this.pad();
    o.moveX = 0;
    o.moveY = 0;
    o.jump = o.attack = o.kick = o.interact = o.cycle = o.gadget = o.ability = false;
    if (!p) return o; // unplugged: fighter stands still until it's back
    const ax = p.axes[0] ?? 0;
    const ay = p.axes[1] ?? 0;
    o.moveX = Math.abs(ax) > DEADZONE ? ax : 0;
    o.moveY = Math.abs(ay) > DEADZONE ? ay : 0;
    if (pressed(p, 14)) o.moveX = -1;
    if (pressed(p, 15)) o.moveX = 1;
    if (pressed(p, 12)) o.moveY = -1;
    if (pressed(p, 13)) o.moveY = 1;
    const b = padBinds[this.slot];
    for (const a of PAD_ACTIONS) o[a] = b[a].some((btn) => pressed(p, btn));
    return o;
  }

  rumble(strength: number, ms: number): void {
    const p = this.pad() as (Gamepad & { vibrationActuator?: { playEffect?: (t: string, o: object) => Promise<unknown> } }) | null;
    p?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: Math.min(1, strength * 1.3) }).catch(() => undefined);
  }
}
