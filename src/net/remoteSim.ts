// The client's stand-in for a local simulation (D74). It owns a mirror Match that is never stepped: snapshots from
// the server are buffered in a Timeline and, each frame, blended onto the mirror so the existing WorldRenderer,
// Juice, HUD and camera work on it unchanged. It also turns the local controllers' intents into network messages.

import type { SimEvent } from '../sim/events';
import type { Intent } from '../sim/intent';
import { Match, type MatchEvent } from '../sim/match';
import type { NetClient } from './client';
import { IntentSender } from './intentWire';
import type { ServerMsg, SlotClaim, SnapMsg } from './protocol';
import { applyMatch, applyWorld, positionsOf, type MatchRender } from './renderState';
import { Timeline } from './timeline';

export type StartMsg = Extract<ServerMsg, { t: 'start' }>;

/** a snapshot with the match-level state it is valid under (the server only sends that when it changes) */
interface Frame extends SnapMsg {
  mm: MatchRender | null;
}

export class RemoteSim {
  readonly match: Match;
  /** fighter index for each local player of this device, in claim order */
  readonly mine: number[];
  readonly looks: SlotClaim['look'][];
  /** how far between the two frames being shown (WorldRenderer.sync's alpha) */
  alpha = 1;
  /** the room's match is over and the server says go back to the lobby */
  ended = false;
  /** set when the World was replaced (new round / match): the scene must rebuild its renderer, then clear this */
  worldChanged = false;
  /** sim events and match events due for the renderer, audio and HUD (the scene drains these) */
  events: SimEvent[] = [];
  matchEvents: MatchEvent[] = [];
  readonly timeline = new Timeline<Frame>();
  private wid: number;
  private lastM: MatchRender | null = null;
  private applied: Frame | null = null;
  private senders: IntentSender[];
  private off: () => void;

  constructor(
    readonly client: NetClient,
    start: StartMsg,
    /** monotonic ms clock (arrival jitter, control heartbeat); tests drive their own */
    private now: () => number = () => performance.now(),
  ) {
    this.match = new Match(start.cfg);
    this.mine = start.mine;
    this.looks = start.looks;
    this.wid = start.wid;
    this.senders = start.mine.map(() => new IntentSender());
    this.off = client.onMessage((m) => this.onMessage(m));
  }

  private onMessage(m: ServerMsg): void {
    if (m.t === 'snap') {
      if (m.m) this.lastM = m.m;
      const frame: Frame = { ...m, mm: this.lastM };
      for (const old of this.timeline.push(frame, this.now())) this.deliver(old);
    } else if (m.t === 'end') this.ended = true;
    // reconnected after the match ended while we were away: the room is back in its lobby
    else if (m.t === 'room' && m.state === 'lobby') this.ended = true;
  }

  private deliver(f: Frame): void {
    for (const e of f.ev) this.events.push(e);
    for (const e of f.me) this.matchEvents.push(e);
  }

  /** Advance the render clock by `dt` seconds and show the matching blend of snapshots on the mirror. */
  update(dt: number): void {
    const tl = this.timeline;
    tl.advance(dt, 60 * this.match.timeScale);
    for (const f of tl.takeDue()) this.deliver(f);
    const cur = tl.frame();
    if (!cur) return;
    const { a, b } = cur;
    this.alpha = cur.alpha;
    if (this.applied === b) return;

    const m = this.match;
    if (b.wid !== this.wid || (b.mm && b.mm.round !== m.round)) {
      this.wid = b.wid;
      m.rebuildWorld(b.mm?.round ?? m.round + 1, b.mm?.roundModifiers ?? m.roundModifiers);
      this.worldChanged = true;
      this.applied = null;
    }
    // show `a` first when we skipped it, so the renderer's px / py blend from where `a` was
    if (a !== b && this.applied !== a) {
      applyWorld(m.world, a.w);
      this.applied = a;
    }
    applyWorld(m.world, b.w, a === b ? undefined : positionsOf(m.world));
    if (b.mm) applyMatch(m, b.mm);
    this.applied = b;
  }

  /** Send the local players' controls (one intent per claim, null = nothing to send). */
  sendInputs(intents: readonly (Intent | null)[]): void {
    intents.forEach((it, n) => {
      if (!it) return;
      const s = this.senders[n];
      s.poll(it);
      const out = s.take(this.now());
      if (out) this.client.send({ t: 'in', slot: this.mine[n], seq: out.seq, v: out.v, e: out.e });
    });
  }

  /** Frames waiting in the interpolation buffer (diagnostics). */
  get buffered(): number {
    return this.timeline.length;
  }

  dispose(): void {
    this.off();
    this.timeline.clear();
  }
}
