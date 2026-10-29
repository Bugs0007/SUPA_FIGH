// Controls over the wire (D70). The sim edge-detects buttons from the level state each tick, so a tap that is
// pressed and released between two server ticks would vanish if only the level were sent. The client therefore
// also sends the buttons that went down since its last message ("edges"); the server presses them for exactly one
// tick even when the level says released. Same bit layout as `packIntent` (buttons in bits 8-14).

import { emptyIntent, packIntent, unpackIntent, type Intent } from '../sim/intent';

const BUTTON_MASK = 0x7f00;

/** Client side: turn polled intents into messages, remembering presses that happened between sends. */
export class IntentSender {
  private lastButtons = 0;
  private pendingEdges = 0;
  private lastSentV = -1;
  private lastSentAt = -1e9;
  seq = 0;

  /** Feed every poll of the controller (render frames or a timer). */
  poll(i: Intent): void {
    const buttons = packIntent(i) & BUTTON_MASK;
    this.pendingEdges |= buttons & ~this.lastButtons;
    this.lastButtons = buttons;
    this.current = packIntent(i);
  }

  private current = packIntent(emptyIntent());

  /** The message to send now, or null when nothing changed since the last one (and the heartbeat is not due). */
  take(nowMs: number, heartbeatMs = 250): { seq: number; v: number; e: number } | null {
    if (this.current === this.lastSentV && this.pendingEdges === 0 && nowMs - this.lastSentAt < heartbeatMs) return null;
    const msg = { seq: this.seq++, v: this.current, e: this.pendingEdges };
    this.pendingEdges = 0;
    this.lastSentV = this.current;
    this.lastSentAt = nowMs;
    return msg;
  }
}

/** Server side: the latest controls of one fighter. */
export class IntentSlot {
  private seq = -1;
  private v = packIntent(emptyIntent());
  private edges = 0;

  /** Returns false for a stale (older or repeated) message. */
  apply(seq: number, v: number, e: number): boolean {
    if (seq <= this.seq) return false;
    this.seq = seq;
    this.v = v;
    this.edges |= e & BUTTON_MASK;
    return true;
  }

  /** The intent for the next tick: the held state plus any presses that would otherwise be missed. */
  take(out: Intent): Intent {
    unpackIntent(this.v, out);
    const b = this.edges >> 8;
    if (b) {
      out.jump ||= (b & 1) !== 0;
      out.attack ||= (b & 2) !== 0;
      out.kick ||= (b & 4) !== 0;
      out.interact ||= (b & 8) !== 0;
      out.cycle ||= (b & 16) !== 0;
      out.gadget ||= (b & 32) !== 0;
      out.ability ||= (b & 64) !== 0;
    }
    this.edges = 0;
    return out;
  }

  /** Let go of everything (the player disconnected). */
  clear(): void {
    this.v = packIntent(emptyIntent());
    this.edges = 0;
  }
}
