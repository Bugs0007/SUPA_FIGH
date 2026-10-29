// A bad-network simulator for testing (D75): wraps the two directions of a connection with latency, jitter and
// loss. WebSocket is TCP, so nothing is really lost on the wire; the simulator models what players feel instead.
//   - latency / jitter: every frame is delayed, and frames still arrive in order (a late frame holds back the ones
//     behind it, like TCP's head-of-line blocking);
//   - loss: the frames the protocol is designed to lose (snapshots to clients, control frames to the server) are
//     dropped with that probability, and any frame may suffer a retransmit stall of ~200 ms with half that probability.
// Everything else (lobby messages, `start`, `end`) is delivered reliably.

export interface NetSimOptions {
  /** one-way delay in ms */
  latencyMs: number;
  /** added random delay, uniform 0..jitterMs */
  jitterMs: number;
  /** 0..1 */
  loss: number;
  seed?: number;
}

export type Scheduler = (ms: number, fn: () => void) => void;

/** Frames that are safe to drop: later ones carry the same (level) state. */
export const isLossy = (raw: string): boolean => raw.startsWith('{"t":"snap"') || raw.startsWith('{"t":"in"');

const RETRANSMIT_MS = 200;

export class NetSim {
  private seed: number;

  constructor(
    readonly opts: NetSimOptions,
    private schedule: Scheduler = (ms, fn) => void setTimeout(fn, ms),
    private now: () => number = () => Date.now(),
  ) {
    this.seed = (opts.seed ?? 1) >>> 0 || 1;
  }

  private rand(): number {
    // mulberry32: deterministic so a failing run can be replayed
    let t = (this.seed = (this.seed + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  get active(): boolean {
    const o = this.opts;
    return o.latencyMs > 0 || o.jitterMs > 0 || o.loss > 0;
  }

  /**
   * One direction of one connection: returns the function to call instead of `deliver`. Frames wait in a queue and are
   * handed over strictly first-in first-out as they come due (separate timers of nearly equal length do not reliably
   * fire in order, which a real TCP stream never does).
   */
  link(deliver: (raw: string) => void): (raw: string) => void {
    let lastAt = 0;
    const queue: { at: number; raw: string }[] = [];
    let armed = false;
    const arm = (ms: number) => {
      if (armed) return;
      armed = true;
      this.schedule(Math.max(0, ms), drain);
    };
    const drain = () => {
      armed = false;
      while (queue.length && queue[0].at <= this.now()) deliver(queue.shift()!.raw);
      if (queue.length) arm(queue[0].at - this.now()); // a timer that fires a hair early waits for the rest
    };
    return (raw) => {
      const o = this.opts;
      if (o.loss > 0 && isLossy(raw) && this.rand() < o.loss) return;
      let delay = o.latencyMs + this.rand() * o.jitterMs;
      if (o.loss > 0 && this.rand() < o.loss / 2) delay += RETRANSMIT_MS;
      const at = Math.max(lastAt, this.now() + delay);
      lastAt = at;
      queue.push({ at, raw });
      arm(queue[0].at - this.now());
    };
  }
}
