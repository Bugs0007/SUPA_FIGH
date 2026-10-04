import { load, save } from '../game/storage';

export const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'attack', 'kick', 'interact', 'cycle', 'gadget', 'ability'] as const;
export type Action = (typeof ACTIONS)[number];
export type KeyBinds = Record<Action, string[]>;

export const ACTION_LABELS: Record<Action, string> = {
  left: 'LEFT',
  right: 'RIGHT',
  up: 'UP = JUMP / AIM UP',
  down: 'DOWN (2X = DROP)',
  jump: 'JUMP',
  attack: 'ATTACK (HOLD=AIM)',
  kick: 'KICK',
  interact: 'PICK UP / GRAB',
  cycle: 'SWITCH WEAPON',
  gadget: 'USE GADGET',
  ability: 'HERO ABILITY',
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
    gadget: ['KeyV'],
    ability: ['KeyB'],
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
    gadget: ['Numpad9', 'KeyU'],
    ability: ['Numpad1', 'KeyP'],
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

export interface BindConflict {
  code: string;
  a: { player: number; action: Action };
  b: { player: number; action: Action };
}

/** Every key bound to more than one action (within a player or across players). */
export function findConflicts(all: KeyBinds[]): BindConflict[] {
  const seen = new Map<string, { player: number; action: Action }>();
  const out: BindConflict[] = [];
  all.forEach((binds, player) => {
    for (const action of ACTIONS) {
      for (const code of binds[action]) {
        const prev = seen.get(code);
        if (prev) out.push({ code, a: prev, b: { player, action } });
        else seen.set(code, { player, action });
      }
    }
  });
  return out;
}

/** Bind slot `index` (0 = primary, 1 = secondary) of an action to a key. null clears it. */
export function setBinding(binds: KeyBinds, action: Action, index: number, code: string | null): void {
  const list = [...binds[action]];
  if (code === null) list.splice(index, 1);
  else if (index < list.length) list[index] = code;
  else list.push(code);
  binds[action] = list.filter((c, i) => list.indexOf(c) === i).slice(0, 2);
}

export function saveKeyBinds(): void {
  save('keybinds', keyboardBinds);
}

export function resetKeyBinds(player?: number): void {
  DEFAULT_KEYBOARD.forEach((d, i) => {
    // mutate in place: live KeyboardControllers hold a reference to these objects
    if (player === undefined || player === i) Object.assign(keyboardBinds[i], clone(d));
  });
  saveKeyBinds();
}

export { clone as cloneBinds };

/** Human-readable key label for the controls card. */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'NUM' + code.slice(6).toUpperCase();
  const map: Record<string, string> = {
    ArrowLeft: '<',
    ArrowRight: '>',
    ArrowUp: 'UP',
    ArrowDown: 'DOWN',
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
