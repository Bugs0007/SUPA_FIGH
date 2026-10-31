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
  /** messages stamped with a future tick, waiting for it (client-side prediction, D77) */
  private queue: { tick: number; v: number; e: number }[] = [];
  /** stamped messages that reached the server after the tick they were meant for */
  late = 0;
  /** this device sends stamped controls: it predicts, so it is sent the exact state of its fighters */
  stamped = false;

  /** Returns false for a stale (older or repeated) message. Applied at the next tick. */
  apply(seq: number, v: number, e: number): boolean {
    if (seq <= this.seq) return false;
    this.seq = seq;
    this.v = v;
    this.edges |= e & BUTTON_MASK;
    return true;
  }

  /**
   * A message meant for the server tick `tick` (the tick whose step will see it). Held until that tick, so the server
   * runs exactly the controls the predicting client ran. Returns false for stale messages or a runaway queue.
   */
  applyAt(seq: number, tick: number, v: number, e: number): boolean {
    if (seq <= this.seq || this.queue.length >= MAX_QUEUE) return false;
    this.seq = seq;
    this.stamped = true;
    const m = { tick, v, e: e & BUTTON_MASK };
    // arrival order is send order on a WebSocket, but keep the queue sorted anyway
    let i = this.queue.length;
    while (i > 0 && this.queue[i - 1].tick > tick) i--;
    this.queue.splice(i, 0, m);
    return true;
  }

  /** The intent for the next tick: the held state plus any presses that would otherwise be missed. `tick` = the tick about to run. */
  take(out: Intent, tick?: number): Intent {
    if (tick !== undefined) {
      while (this.queue.length && this.queue[0].tick <= tick) {
        const m = this.queue.shift()!;
        if (m.tick < tick) this.late++;
        this.v = m.v;
        this.edges |= m.e;
      }
    }
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
    this.queue.length = 0;
  }
}

/** a predicting client sends at most this many ticks ahead; more is a bug or an attack */
const MAX_QUEUE = 120;

/** What the sim sees for one tick of one fighter: the held level plus the presses since the last tick. */
export function intentFor(v: number, e: number, out: Intent = emptyIntent()): Intent {
  unpackIntent(v, out);
  const b = (e & BUTTON_MASK) >> 8;
  if (b) {
    out.jump ||= (b & 1) !== 0;
    out.attack ||= (b & 2) !== 0;
    out.kick ||= (b & 4) !== 0;
    out.interact ||= (b & 8) !== 0;
    out.cycle ||= (b & 16) !== 0;
    out.gadget ||= (b & 32) !== 0;
    out.ability ||= (b & 64) !== 0;
  }
  return out;
}

/**
 * Client side, per simulation tick (client-side prediction): feed every frame's poll, then take one (level, edges)
 * pair per tick. The pair is both what the local sim runs and what is sent (stamped with the tick), so the server
 * and the prediction see identical controls. A message is only produced when something changed (or as a heartbeat).
 */
export class TickSampler {
  private lastButtons = 0;
  private edges = 0;
  private level = packIntent(emptyIntent());
  private lastSentV = -1;
  private lastSentAt = -1e9;
  seq = 0;

  poll(i: Intent): void {
    const buttons = packIntent(i) & BUTTON_MASK;
    this.edges |= buttons & ~this.lastButtons;
    this.lastButtons = buttons;
    this.level = packIntent(i);
  }

  /** The controls for the tick about to run, and the message to send for it (null = unchanged since the last one). */
  tick(nowMs: number, heartbeatMs = 250): { v: number; e: number; msg: { seq: number; v: number; e: number } | null } {
    const v = this.level;
    const e = this.edges;
    this.edges = 0;
    let msg: { seq: number; v: number; e: number } | null = null;
    if (v !== this.lastSentV || e !== 0 || nowMs - this.lastSentAt >= heartbeatMs) {
      msg = { seq: this.seq++, v, e };
      this.lastSentV = v;
      this.lastSentAt = nowMs;
    }
    return { v, e, msg };
  }
}
