import { load, save } from '../game/storage';

export const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'attack', 'kick', 'interact', 'cycle'] as const;
export type Action = (typeof ACTIONS)[number];
export type KeyBinds = Record<Action, string[]>;

export const ACTION_LABELS: Record<Action, string> = {
  left: 'LEFT',
  right: 'RIGHT',
  up: 'UP / AIM UP',
  down: 'DOWN / CROUCH',
  jump: 'JUMP',
  attack: 'ATTACK (HOLD=AIM)',
  kick: 'KICK',
  interact: 'PICK UP / GRAB',
  cycle: 'SWITCH WEAPON',
};

// Ctrl/Alt are deliberately never bound: P2 holding Ctrl while P1 presses W would close the tab.
export const DEFAULT_KEYBOARD: KeyBinds[] = [
  {
    left: ['KeyA'],
    right: ['KeyD'],
    up: ['KeyW'],
    down: ['KeyS'],
    jump: ['KeyG', 'Space'],
    attack: ['KeyF'],
    kick: ['KeyH'],
    interact: ['KeyT'],
    cycle: ['KeyR'],
  },
  {
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    jump: ['Numpad5', 'KeyK'],
    attack: ['Numpad4', 'KeyL'],
    kick: ['Numpad6', 'KeyJ'],
    interact: ['Numpad8', 'KeyO'],
    cycle: ['Numpad7', 'KeyI'],
  },
];

function clone(b: KeyBinds): KeyBinds {
  const out = {} as KeyBinds;
  for (const a of ACTIONS) out[a] = [...b[a]];
  return out;
}

export const keyboardBinds: KeyBinds[] = (() => {
  const stored = load<KeyBinds[] | null>('keybinds', null);
  if (!stored || stored.length !== DEFAULT_KEYBOARD.length) return DEFAULT_KEYBOARD.map(clone);
  return stored.map((b, i) => {
    const d = clone(DEFAULT_KEYBOARD[i]);
    for (const a of ACTIONS) if (Array.isArray(b[a])) d[a] = b[a];
    return d;
  });
})();

export function saveKeyBinds(): void {
  save('keybinds', keyboardBinds);
}

export function resetKeyBinds(): void {
  DEFAULT_KEYBOARD.forEach((d, i) => (keyboardBinds[i] = clone(d)));
  saveKeyBinds();
}

/** Human-readable key label for the controls card. */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'NUM' + code.slice(6).toUpperCase();
  const map: Record<string, string> = {
    ArrowLeft: '<',
    ArrowRight: '>',
    ArrowUp: '^',
    ArrowDown: 'v',
    Space: 'SPACE',
    ShiftLeft: 'LSHIFT',
    ShiftRight: 'RSHIFT',
    Enter: 'ENTER',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Minus: '-',
    Equal: '=',
  };
  return map[code] ?? code.toUpperCase();
}
