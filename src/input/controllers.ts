import { emptyIntent, type Intent } from '../sim/intent';
import { ACTIONS, type Action, type KeyBinds } from './bindings';
import type { Keyboard } from './keyboard';

/** Anything that can drive a fighter: produces one Intent per sim tick. */
export interface Controller {
  readonly label: string;
  poll(): Intent;
  /** feedback for gamepads (0..1 strength, ms) */
  rumble?(strength: number, ms: number): void;
}

export class KeyboardController implements Controller {
  readonly label: string;
  private out = emptyIntent();

  constructor(
    private kb: Keyboard,
    private binds: KeyBinds,
    label: string,
  ) {
    for (const a of ACTIONS) for (const c of binds[a]) kb.gameKeys.add(c);
    this.label = label;
  }

  private held(a: Action): boolean {
    for (const c of this.binds[a]) if (this.kb.held(c)) return true;
    return false;
  }

  private consumeAll(): void {
    for (const a of ACTIONS) for (const c of this.binds[a]) this.kb.consume(c);
  }

  poll(): Intent {
    const o = this.out;
    o.moveX = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
    o.moveY = (this.held('down') ? 1 : 0) - (this.held('up') ? 1 : 0);
    // no jump key on the keyboard: Up is the jump button (the sim derives it, D50)
    o.jump = false;
    o.attack = this.held('attack');
    o.kick = this.held('kick');
    o.interact = this.held('interact');
    o.cycle = this.held('cycle');
    o.gadget = this.held('gadget');
    o.ability = this.held('ability');
    this.consumeAll();
    return o;
  }
}

/**
 * Several input devices for one fighter (the keyboard layout AND a gamepad, or touch buttons): whichever is
 * pushed wins. Lets a plugged-in pad work in Quick Match without any setup.
 */
export class MergedController implements Controller {
  readonly label: string;
  private out = emptyIntent();

  constructor(private parts: Controller[]) {
    this.label = parts.map((p) => p.label).join('+');
  }

  poll(): Intent {
    const o = this.out;
    o.moveX = o.moveY = 0;
    o.jump = o.attack = o.kick = o.interact = o.cycle = o.gadget = o.ability = false;
    for (const p of this.parts) {
      const i = p.poll();
      if (Math.abs(i.moveX) > Math.abs(o.moveX)) o.moveX = i.moveX;
      if (Math.abs(i.moveY) > Math.abs(o.moveY)) o.moveY = i.moveY;
      o.jump ||= i.jump;
      o.attack ||= i.attack;
      o.kick ||= i.kick;
      o.interact ||= i.interact;
      o.cycle ||= i.cycle;
      o.gadget ||= i.gadget;
      o.ability ||= i.ability;
    }
    return o;
  }

  rumble(strength: number, ms: number): void {
    for (const p of this.parts) p.rumble?.(strength, ms);
  }
}

/** Does nothing (empty slots, disconnected pads). */
export class NullController implements Controller {
  readonly label = 'NONE';
  private out = emptyIntent();
  poll(): Intent {
    return this.out;
  }
}
