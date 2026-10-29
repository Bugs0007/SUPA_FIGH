// The client's interpolation buffer (D74). Snapshots arrive every 2 sim ticks with network jitter; the timeline plays
// them back at a render time that trails the newest one by a small buffer, so there is almost always a snapshot on
// both sides of "now" to blend between. Time here is SIM ticks (60 per second, scaled by slow-mo), not wall time.

export interface Stamped {
  tick: number;
  /** world identity: ticks restart in a new World, so snapshots of different ones never blend */
  wid: number;
}

/**
 * Buffer bounds in ticks: the render clock trails the newest snapshot by this much on average (snapshots arrive in
 * steps of 2 ticks, so the gap swings by +-1 around it). 4 = 67 ms (lowest gap 50 ms), 6 = 100 ms.
 */
const MIN_DELAY = 4;
const MAX_DELAY = 6;
/** further than this from the target (ticks) the clock jumps instead of catching up */
const SNAP_ERROR = 15;

export class Timeline<T extends Stamped> {
  private entries: { snap: T; delivered: boolean }[] = [];
  /** render time in ticks, null until the first snapshot */
  time: number | null = null;
  /** current buffer length in ticks (adapts to jitter) */
  delay = MIN_DELAY;
  private lastArrival = -1;
  private intervalEma = 1000 / 30;
  private jitterEma = 0;
  /** snapshots dropped from the front of the queue before they were rendered (diagnostics) */
  stale = 0;

  get length(): number {
    return this.entries.length;
  }

  /** The newest snapshot's tick (-1 when empty). */
  get latest(): number {
    return this.entries.length ? this.entries[this.entries.length - 1].snap.tick : -1;
  }

  /**
   * A snapshot arrived. `nowMs` is any monotonic clock: only the spacing between arrivals is used (jitter).
   * Returns snapshots of the previous world that were still waiting, so their events are not lost.
   */
  push(snap: T, nowMs: number): T[] {
    let flushed: T[] = [];
    const last = this.entries[this.entries.length - 1]?.snap;
    if (last && last.wid !== snap.wid) {
      // a new World: whatever is left of the old one is over. Hand back its undelivered events and start afresh.
      flushed = this.entries.filter((e) => !e.delivered).map((e) => e.snap);
      this.entries = [];
      this.time = null;
    } else if (last && snap.tick <= last.tick) {
      return flushed; // duplicate or out of order
    }
    if (this.lastArrival >= 0) {
      const dt = nowMs - this.lastArrival;
      this.jitterEma += (Math.abs(dt - this.intervalEma) - this.jitterEma) * 0.1;
      this.intervalEma += (dt - this.intervalEma) * 0.1;
      const want = Math.min(MAX_DELAY, MIN_DELAY + (this.jitterEma / (1000 / 60)) * 2);
      this.delay += (want - this.delay) * 0.05;
    }
    this.lastArrival = nowMs;
    this.entries.push({ snap, delivered: false });
    return flushed;
  }

  /** Move the render clock on by `dt` seconds of real time at `rate` ticks per second (60 x slow-mo scale). */
  advance(dt: number, rate: number): void {
    if (!this.entries.length) return;
    const latest = this.latest;
    const target = latest - this.delay;
    if (this.time === null) {
      this.time = Math.max(this.entries[0].snap.tick, target);
    } else {
      const err = target - this.time;
      if (Math.abs(err) > SNAP_ERROR) this.time = target;
      else this.time += dt * rate * Math.min(1.25, Math.max(0.8, 1 + err * 0.1));
    }
    if (this.time > latest) this.time = latest; // buffer ran dry: hold the last frame, never extrapolate
  }

  /** Snapshots the render clock has passed whose events have not been handed out yet. */
  takeDue(): T[] {
    const out: T[] = [];
    if (this.time === null) return out;
    for (const e of this.entries) {
      if (e.delivered) continue;
      if (e.snap.tick > this.time) break;
      e.delivered = true;
      out.push(e.snap);
    }
    return out;
  }

  /** The two snapshots around the render time and how far between them it is (0..1); drops what is behind. */
  frame(): { a: T; b: T; alpha: number } | null {
    if (this.time === null || !this.entries.length) return null;
    const i = this.entries.findIndex((e) => e.snap.tick >= this.time!);
    if (i < 0) {
      const s = this.entries[this.entries.length - 1].snap;
      return { a: s, b: s, alpha: 1 };
    }
    if (i === 0) return { a: this.entries[0].snap, b: this.entries[0].snap, alpha: 1 };
    const a = this.entries[i - 1].snap;
    const b = this.entries[i].snap;
    if (i > 1) {
      this.stale += this.entries.slice(0, i - 1).filter((e) => !e.delivered).length;
      this.entries.splice(0, i - 1);
    }
    return { a, b, alpha: b.tick === a.tick ? 1 : Math.min(1, Math.max(0, (this.time - a.tick) / (b.tick - a.tick))) };
  }

  clear(): void {
    this.entries = [];
    this.time = null;
    this.lastArrival = -1;
  }
}
