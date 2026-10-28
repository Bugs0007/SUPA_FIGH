import { describe, expect, it } from 'vitest';
import { KeyboardController } from '../../src/input/controllers';
import { DEFAULT_KEYBOARD } from '../../src/input/bindings';
import { Keyboard } from '../../src/input/keyboard';
import { isTouchDevice } from '../../src/game/display';
import { directionSector } from '../../src/input/touch';

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

describe('8-way touch pad', () => {
  it('maps a thumb offset to one of eight arrows, clockwise from up', () => {
    expect(directionSector(0, -10)).toBe(0); // up
    expect(directionSector(10, -10)).toBe(1); // up-right
    expect(directionSector(10, 0)).toBe(2); // right
    expect(directionSector(10, 10)).toBe(3);
    expect(directionSector(0, 10)).toBe(4); // down
    expect(directionSector(-10, 10)).toBe(5);
    expect(directionSector(-10, 0)).toBe(6); // left
    expect(directionSector(-10, -10)).toBe(7); // up-left
  });

  it('each arrow covers 45 degrees', () => {
    expect(directionSector(10, -4)).toBe(2); // just under 22.5 degrees above right
    expect(directionSector(10, -5)).toBe(1);
  });
});
