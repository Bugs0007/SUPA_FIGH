// Menu navigation from the keyboard (arrows/WASD, Enter/Space, Esc/Backspace) and any gamepad
// (d-pad/stick, A/Start = confirm, B/Back = back). Edges only — call from scene update().

import { padMenu } from './gamepad';
import { keyboard } from './keyboard';

const any = (...codes: string[]) => codes.some((c) => keyboard.justPressed(c));

export const menu = {
  up: () => any('ArrowUp', 'KeyW') || padMenu.justPressed(12) || padMenu.flicked(1, -1),
  down: () => any('ArrowDown', 'KeyS') || padMenu.justPressed(13) || padMenu.flicked(1, 1),
  left: () => any('ArrowLeft', 'KeyA') || padMenu.justPressed(14) || padMenu.flicked(0, -1),
  right: () => any('ArrowRight', 'KeyD') || padMenu.justPressed(15) || padMenu.flicked(0, 1),
  confirm: () => any('Enter', 'NumpadEnter', 'Space') || padMenu.justPressed(0) || padMenu.justPressed(9),
  back: () => any('Escape', 'Backspace') || padMenu.justPressed(1) || padMenu.justPressed(8),
};
