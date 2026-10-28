// Which kind of controller the player is using right now, and what its buttons are called.
// Menus use this to show the right hints: keyboard keys, PlayStation or Xbox pad buttons, or touch buttons.
// Pure logic (no Phaser): unit tested.

export type PadStyle = 'ps' | 'xbox';
export type Device = 'keyboard' | PadStyle | 'touch';

/** DualShock / DualSense / "Wireless Controller" report Sony's vendor id (054c) or a PlayStation-ish name. */
export function padStyleFromId(id: string): PadStyle {
  return /054c|sony|playstation|dualshock|dualsense|wireless controller|ps[345]/i.test(id) ? 'ps' : 'xbox';
}

/**
 * Standard-mapping buttons (the Gamepad API numbers a PlayStation pad the same as an Xbox one):
 *   0 A / Cross   1 B / Circle   2 X / Square   3 Y / Triangle   4 LB / L1   5 RB / R1   6 LT / L2   7 RT / R2
 *   8 Back / Share   9 Start / Options   10 LS / L3   11 RS / R3   12-15 D-pad   16 Home / PS
 */
export const PAD_NAMES: Record<PadStyle, string[]> = {
  xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'BACK', 'START', 'LS', 'RS', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'HOME'],
  ps: ['CROSS', 'CIRCLE', 'SQUARE', 'TRIANGLE', 'L1', 'R1', 'L2', 'R2', 'SHARE', 'OPTIONS', 'L3', 'R3', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'PS'],
};

/** Both names of a button, the pad in use first: "CROSS / A" on a PlayStation pad, "A / CROSS" on an Xbox pad. */
export function padLabel(button: number, first: PadStyle = 'ps'): string {
  const second: PadStyle = first === 'ps' ? 'xbox' : 'ps';
  const a = PAD_NAMES[first][button] ?? 'B' + button;
  const b = PAD_NAMES[second][button] ?? 'B' + button;
  return a === b ? a : `${a} / ${b}`;
}

/** Tracks the last device the player touched. */
class InputDevice {
  current: Device = 'keyboard';
  /** style of the pad most recently used (or the first connected one) */
  padStyle: PadStyle = 'xbox';
  /** a pad is plugged in */
  padConnected = false;

  note(d: Device): void {
    this.current = d;
  }

  /** the connected pads changed (called every frame): remember what kind they are */
  setPads(ids: string[]): void {
    this.padConnected = ids.length > 0;
    if (ids.length > 0) this.padStyle = padStyleFromId(ids[0]);
    else if (this.usingPad) this.current = 'keyboard';
  }

  notePad(id: string): void {
    this.padStyle = padStyleFromId(id);
    this.current = this.padStyle;
    this.padConnected = true;
  }

  /** the style to show for pad hints (even while the keyboard was touched last) */
  get pad(): PadStyle {
    return this.padStyle;
  }

  get usingPad(): boolean {
    return this.current === 'ps' || this.current === 'xbox';
  }
}

export const inputDevice = new InputDevice();

/** What each menu action is called per device (menus + hint bars). */
export const MENU_KEYS = {
  keyboard: { move: 'ARROWS', confirm: 'ENTER', back: 'ESC', tab: 'TAB' },
  touch: { move: 'D-PAD', confirm: 'OK', back: 'BACK', tab: '' },
} as const;
