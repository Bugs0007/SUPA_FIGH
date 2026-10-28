import { describe, expect, it } from 'vitest';
import { KeyboardController } from '../../src/input/controllers';
import { DEFAULT_KEYBOARD } from '../../src/input/bindings';
import { Keyboard } from '../../src/input/keyboard';
import { isTouchDevice } from '../../src/game/display';

describe('synthetic key presses (on-screen touch controls)', () => {
  it('drive a keyboard controller exactly like real keys', () => {
    const kb = new Keyboard();
    const c = new KeyboardController(kb, DEFAULT_KEYBOARD[0], 'P1');
    kb.press('KeyD');
    kb.press('KeyF');
    let i = c.poll();
    expect(i.moveX).toBe(1);
    expect(i.attack).toBe(true);
    kb.release('KeyD');
    kb.release('KeyF');
    kb.endFrame();
    i = c.poll();
    expect(i.moveX).toBe(0);
    expect(i.attack).toBe(false);
  });

  it('a tap shorter than a frame is still seen once, and is an edge for menus', () => {
    const kb = new Keyboard();
    kb.press('Enter');
    kb.release('Enter');
    expect(kb.justPressed('Enter')).toBe(true);
    expect(kb.held('Enter')).toBe(true); // latched until consumed
    kb.endFrame();
    expect(kb.justPressed('Enter')).toBe(false);
  });

  it('holding does not re-trigger the edge', () => {
    const kb = new Keyboard();
    kb.press('ArrowUp');
    kb.endFrame();
    kb.press('ArrowUp');
    expect(kb.justPressed('ArrowUp')).toBe(false);
  });
});

describe('touch detection', () => {
  it('is off in headless runs', () => {
    expect(isTouchDevice()).toBe(false);
  });
});
