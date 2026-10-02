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
    o.jump = this.held('jump');
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

/** Does nothing (empty slots, disconnected pads). */
export class NullController implements Controller {
  readonly label = 'NONE';
  private out = emptyIntent();
  poll(): Intent {
    return this.out;
  }
}
