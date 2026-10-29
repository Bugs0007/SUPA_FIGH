// Client-side prediction of this device's own fighters (D77). The device runs the REAL fighter code, ahead of the
// server's clock, in a sandbox world, so the fighter it controls reacts on the very next frame instead of one round
// trip plus the interpolation buffer later. The server stays in charge: every ~33 ms it sends the exact state of the
// predicted fighters (`pred`), the sandbox is rebuilt from it (environment from the matching snapshot) and the
// controls the server has not seen yet are run again on top ("rewind and replay"). Disagreements are blended away.
//
// Alignment is exact because controls are stamped with the server tick they will be applied at: the prediction's tick
// counter IS the estimated server tick, the server runs input N in the step that makes tick N, and the replay therefore
// runs the same controls on the same ticks the server will. Only what the sandbox cannot know (other players' actions,
// hits, pickups, props pushed by others) can differ, and that is what reconciliation corrects.

import { DT } from '../sim/constants';
import { updateFire } from '../sim/fire';
import { updateFighter, type Fighter } from '../sim/fighter';
import { updateGimmicks } from '../sim/gimmicks';
import type { Intent } from '../sim/intent';
import { updateItems } from '../sim/item';
import { updateProps } from '../sim/prop';
import { clonePlain } from '../sim/snapshot';
import type { World } from '../sim/world';
import { intentFor, TickSampler } from './intentWire';
import type { PredMsg } from './protocol';
import { applyWorld, type RenderSnapshot } from './renderState';

/** Fighter fields drawn from the prediction; everything else (hp, inventory, powers...) stays the server's. */
export const PREDICTED_FIELDS = [
  'vx', 'vy', 'w', 'h', 'grounded', 'facing', 'state', 'stateTime', 'wallSlide', 'sprintDir', 'airJumpTime', 'aimAngle',
  'aimHeld', 'crouchAim', 'combo', 'airKick', 'rot', 'jetting', 'carry', 'flying', 'stretchLen', 'stretchAngle', 'anchorX',
  'anchorY', 'recoverAt', 'specialKind', 'charge', 'beamWidth', 'wallDir', 'armReach', 'armBack', 'ropeLen', 'grip',
  'lastShotTime', 'cook',
] as const satisfies readonly (keyof Fighter)[];

/** more than this many pixels of disagreement and the fighter snaps instead of sliding */
const SNAP_PX = 48;
/** how fast a correction fades (seconds) */
const SMOOTH_TAU = 0.09;
const MAX_STEPS_PER_FRAME = 8;
const HISTORY_TICKS = 300;
const MIN_MARGIN = 2;
const MAX_MARGIN = 8;
/** with no measured round trip yet */
const DEFAULT_RTT_MS = 50;

interface Held {
  v: number;
  e: number;
}

export interface Outgoing {
  /** index among this device's fighters */
  local: number;
  tick: number;
  seq: number;
  v: number;
  e: number;
}

export class Predictor {
  /** the sandbox: a World whose fighters other than ours are only scenery */
  world: World | null = null;
  wid = -1;
  /** the tick of the last sandbox step (= estimated server tick of the controls sampled most recently) */
  tick = 0;
  /** have the server's clock (from snapshots): inputs can be stamped */
  clockReady = false;
  /** have a pred from the server: the sandbox is meaningful */
  ready = false;
  /** ticks of safety added to the lead; grows when the server reports late controls */
  margin = MIN_MARGIN;
  /** number of corrections applied (diagnostics / tests) */
  corrections = 0;
  worstCorrection = 0;
  private acc = 0;
  private steer = 0;
  private samplers: TickSampler[];
  private hist = new Map<number, Held[]>();
  private offsets: { x: number; y: number }[];
  private lastLate = 0;
  private lastLateAt = 0;

  constructor(
    readonly slots: number[],
    private makeWorld: (round: number, modifiers: string[]) => World,
  ) {
    this.samplers = slots.map(() => new TickSampler());
    this.offsets = slots.map(() => ({ x: 0, y: 0 }));
  }

  /** Continue the legacy sender's sequence numbers (the server drops anything not newer). */
  continueSeq(seqs: number[]): void {
    this.samplers.forEach((s, n) => {
      if (s.seq < seqs[n]) s.seq = seqs[n];
    });
  }

  reset(wid: number): void {
    this.world = null;
    this.wid = wid;
    this.ready = false;
    this.clockReady = false;
    this.hist.clear();
    this.acc = 0;
    this.offsets.forEach((o) => ((o.x = 0), (o.y = 0)));
  }

  // ------------------------------------------------------------ the clock

  /** A snapshot arrived: where is the server now, and so which tick will the controls sampled now be applied at? */
  onSnap(tick: number, wid: number, rttMs: number, timeScale: number): void {
    if (wid !== this.wid) this.reset(wid);
    const rtt = rttMs >= 0 ? rttMs : DEFAULT_RTT_MS;
    // the snapshot is one way old; the controls sampled now need another way to get there
    const target = tick + (rtt / 1000) * 60 * timeScale + this.margin;
    const err = target - (this.tick + this.acc);
    if (!this.clockReady || Math.abs(err) > 8) {
      // (re)start the clock: ticks we skip repeat the last controls
      this.tick = Math.max(this.tick, 0);
      this.jumpTo(Math.round(target));
      this.clockReady = true;
      this.steer = 0;
    } else {
      this.steer = Math.max(-0.1, Math.min(0.1, err * 0.02));
    }
  }

  private jumpTo(target: number): void {
    const last = this.heldAt(this.tick);
    for (let t = this.tick + 1; t <= target; t++) this.hist.set(t, last.map((h) => ({ v: h.v, e: 0 })));
    this.tick = target;
    this.acc = 0;
  }

  private heldAt(tick: number): Held[] {
    for (let t = tick; t > tick - 8 && t >= 0; t--) {
      const h = this.hist.get(t);
      if (h) return h;
    }
    return this.slots.map(() => ({ v: 0, e: 0 }));
  }

  // ------------------------------------------------------------ running ahead

  /** Every frame: the controllers' current state (kept for the next tick). */
  pollFrame(intents: readonly (Intent | null)[]): void {
    intents.forEach((it, n) => {
      if (it) this.samplers[n].poll(it);
    });
  }

  /** Run the ticks that are due; returns the control messages to send (already stamped). */
  advance(dt: number, timeScale: number, nowMs: number): Outgoing[] {
    const out: Outgoing[] = [];
    // corrections fade out
    const fade = Math.exp(-dt / SMOOTH_TAU);
    for (const o of this.offsets) {
      o.x *= fade;
      o.y *= fade;
      if (Math.abs(o.x) < 0.01) o.x = 0;
      if (Math.abs(o.y) < 0.01) o.y = 0;
    }
    if (!this.clockReady) return out;
    this.acc += dt * 60 * timeScale * (1 + this.steer);
    let steps = 0;
    while (this.acc >= 1 && steps < MAX_STEPS_PER_FRAME) {
      this.acc -= 1;
      steps++;
      this.tick++;
      const held: Held[] = this.samplers.map((s, n) => {
        const r = s.tick(nowMs);
        if (r.msg) out.push({ local: n, tick: this.tick, seq: r.msg.seq, v: r.msg.v, e: r.msg.e });
        return { v: r.v, e: r.e };
      });
      this.hist.set(this.tick, held);
      this.hist.delete(this.tick - HISTORY_TICKS);
      if (this.ready) this.step(this.tick);
    }
    if (steps >= MAX_STEPS_PER_FRAME) this.acc = 0;
    return out;
  }

  /** One tick of the sandbox: what World.step does for the things that matter to our fighters. */
  private step(tick: number): void {
    const w = this.world!;
    w.tick = tick;
    w.time = tick * DT;
    updateGimmicks(w);
    const held = this.hist.get(tick) ?? this.heldAt(tick);
    this.slots.forEach((slot, n) => {
      const f = w.fighters[slot];
      const inp = intentFor(held[n].v, held[n].e);
      updateFighter(w, f, inp);
      if (w.bulletTime > 0 && w.bulletTimeOwner === f.id && f.alive) {
        // bullet time: its owner lives at double speed inside the slowed world
        const px = f.px;
        const py = f.py;
        updateFighter(w, f, inp);
        f.px = px;
        f.py = py;
      }
    });
    if (w.bulletTime > 0) w.bulletTime = Math.max(0, w.bulletTime - DT);
    updateItems(w);
    updateProps(w);
    updateFire(w);
    w.events.length = 0;
  }

  // ------------------------------------------------------------ the server's word

  /**
   * The server's exact state of our fighters at `pred.tick`, with the snapshot of the same tick for everything
   * around them. Rebuild the sandbox from it and run the controls it has not seen yet.
   */
  onAuth(pred: PredMsg, env: RenderSnapshot, round: number, modifiers: string[], nowMs: number): void {
    if (pred.wid !== this.wid) this.reset(pred.wid);
    // the server counts controls that reached it after their tick: a bigger lead
    if (pred.late > this.lastLate) {
      this.margin = Math.min(MAX_MARGIN, this.margin + 1);
      this.lastLateAt = nowMs;
    } else if (this.margin > MIN_MARGIN && nowMs - this.lastLateAt > 1500) {
      this.margin--;
      this.lastLateAt = nowMs;
    }
    this.lastLate = pred.late;

    if (!this.world) this.world = this.makeWorld(round, modifiers);
    const w = this.world;
    const before = this.ready ? this.slots.map((s) => ({ x: w.fighters[s].x, y: w.fighters[s].y })) : null;

    applyWorld(w, env);
    for (const { slot, fighter } of pred.f) if (this.slots.includes(slot)) Object.assign(w.fighters[slot], clonePlain(fighter));
    w.tick = pred.tick;
    w.time = pred.tick * DT;
    // run again what the server has not seen
    if (this.clockReady) for (let t = pred.tick + 1; t <= this.tick; t++) this.step(t);
    this.ready = true;
    if (!before) return;
    this.slots.forEach((s, n) => {
      const f = w.fighters[s];
      const dx = before[n].x - f.x;
      const dy = before[n].y - f.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.05) return;
      this.corrections++;
      this.worstCorrection = Math.max(this.worstCorrection, d);
      const o = this.offsets[n];
      if (d > SNAP_PX) {
        o.x = o.y = 0;
      } else {
        // keep what is on screen where it is; the difference fades
        o.x += dx;
        o.y += dy;
      }
    });
  }

  // ------------------------------------------------------------ for drawing

  /** The predicted fighter of this device's n-th player and where to draw it (null while there is nothing to show). */
  visual(n: number): { fighter: Fighter; x: number; y: number } | null {
    if (!this.ready || !this.world) return null;
    const f = this.world.fighters[this.slots[n]];
    if (!f.alive || f.gone || f.ghost) return null;
    const a = Math.min(1, this.acc);
    const o = this.offsets[n];
    return { fighter: f, x: f.px + (f.x - f.px) * a + o.x, y: f.py + (f.y - f.py) * a + o.y };
  }
}
