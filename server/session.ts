// One running match on the server: the authoritative Match, the bots that drive every non-human fighter
// (and any human whose device dropped), and the latest controls of each human. Knows nothing about sockets.

import { BotController } from '../src/ai/bot';
import { DT, MATCH_END_TIME } from '../src/sim/constants';
import { emptyIntent, type Intent } from '../src/sim/intent';
import { Match, type MatchConfig, type MatchEvent } from '../src/sim/match';
import type { SimEvent } from '../src/sim/events';
import { IntentSlot } from '../src/net/intentWire';
import { encodeMatch, encodeWorld } from '../src/net/renderState';
import { SNAPSHOT_EVERY, type BotSpec, type PredMsg, type SnapMsg } from '../src/net/protocol';

/** Match-level state is resent at least this often (snapshots) even when nothing changed */
const MATCH_STATE_EVERY = 10;

export interface SessionSlot {
  /** device that plays this fighter (null = a bot, from the start) */
  owner: string | null;
  bot?: BotSpec;
}

export class Session {
  readonly match: Match;
  /** fighter index -> who plays it (players only; clone slots are bots) */
  readonly slots: SessionSlot[];
  /** world identity for clients: bumps whenever the round's World is rebuilt */
  wid = 1;
  ticks = 0;
  private lastWorld;
  private controllers: BotController[];
  private inputs: (IntentSlot | null)[];
  private connected: boolean[];
  private intents: Intent[];
  private scratch: Intent[];
  private events: SimEvent[] = [];
  private matchEvents: MatchEvent[] = [];
  private snaps = 0;
  private lastMatchKey = '';
  private lastSnapWid = 0;
  /** the match is over and its awards screen has run its course */
  over = false;

  constructor(readonly cfg: MatchConfig, slots: SessionSlot[]) {
    this.match = new Match(cfg);
    this.slots = slots;
    this.lastWorld = this.match.world;
    const fighters = this.match.world.fighters;
    this.controllers = fighters.map((_, i) => this.makeBot(i));
    this.inputs = fighters.map((_, i) => (slots[i]?.owner ? new IntentSlot() : null));
    this.connected = fighters.map((_, i) => !!slots[i]?.owner);
    this.intents = fighters.map(() => emptyIntent());
    this.scratch = fighters.map(() => emptyIntent());
  }

  private makeBot(i: number): BotController {
    const f = this.match.world.fighters[i];
    const spec = this.slots[i]?.bot ?? (f.master >= 0 ? this.slots[f.master]?.bot : undefined);
    return new BotController(() => this.match.world, i, { difficulty: spec?.difficulty ?? 'normal', seed: this.cfg.seed + i, clone: f.master >= 0 });
  }

  /** Controls from a device for one of its fighters. Ignored when the fighter is not theirs. */
  input(device: string, slot: number, seq: number, v: number, e: number, tick?: number, wid?: number): void {
    if (this.slots[slot]?.owner !== device) return;
    const input = this.inputs[slot];
    if (!input) return;
    // stamped for a tick of THIS world: run at exactly that tick (what a predicting client ran). A message from before
    // a round change (another world's ticks) is just applied at the next tick like an unstamped one.
    if (tick !== undefined && wid === this.wid) input.applyAt(seq, tick, v, e);
    else input.apply(seq, v, e);
  }

  /** The exact state of the fighters of a predicting device, to go with the snapshot just built (null = nothing to send). */
  predFor(device: string): PredMsg | null {
    const mine = this.fightersOf(device).filter((i) => this.inputs[i]?.stamped);
    if (mine.length === 0) return null;
    const w = this.match.world;
    return {
      t: 'pred',
      tick: w.tick,
      wid: this.wid,
      late: mine.reduce((n, i) => n + (this.inputs[i]?.late ?? 0), 0),
      f: mine.map((slot) => ({ slot, fighter: w.fighters[slot] })),
    };
  }

  /** A human's device dropped (a bot plays the fighter meanwhile) or came back. */
  setConnected(device: string, connected: boolean): void {
    this.slots.forEach((s, i) => {
      if (s.owner !== device) return;
      this.connected[i] = connected;
      this.inputs[i] = new IntentSlot(); // a fresh sequence: a returning client starts counting again
      if (!connected) this.controllers[i] = this.makeBot(i); // fresh brain: no stale timers from before
    });
  }

  /** Fighter indices a device plays. */
  fightersOf(device: string): number[] {
    return this.slots.flatMap((s, i) => (s.owner === device ? [i] : []));
  }

  /** One 60 Hz tick. */
  step(): void {
    const fighters = this.match.world.fighters.length;
    for (let i = 0; i < fighters; i++) {
      const input = this.inputs[i];
      this.intents[i] = input && this.connected[i] ? input.take(this.scratch[i], this.match.world.tick + 1) : this.controllers[i].poll();
    }
    this.match.step(this.intents);
    this.ticks++;
    const w = this.match.world;
    if (w !== this.lastWorld) {
      this.lastWorld = w;
      this.wid++;
    }
    for (const e of w.events) this.events.push(e);
    w.events.length = 0;
    for (const e of this.match.events) this.matchEvents.push(e);
    this.match.events.length = 0;
    // the match resets itself after the awards screen: the room goes back to the lobby just before that
    if (this.match.phase === 'matchEnd' && this.match.phaseTime >= MATCH_END_TIME - 2 * DT) this.over = true;
  }

  get snapshotDue(): boolean {
    return this.ticks % SNAPSHOT_EVERY === 0;
  }

  /** The frame for every client; drains the events collected since the last one. */
  snapshot(): SnapMsg {
    const m = encodeMatch(this.match);
    const key = JSON.stringify({ ...m, phaseTime: 0 });
    const withMatch = key !== this.lastMatchKey || this.snaps % MATCH_STATE_EVERY === 0 || this.matchEvents.length > 0 || this.wid !== this.lastSnapWid;
    this.lastSnapWid = this.wid;
    this.lastMatchKey = key;
    this.snaps++;
    const msg: SnapMsg = {
      t: 'snap',
      tick: this.match.world.tick,
      wid: this.wid,
      w: encodeWorld(this.match.world),
      ev: this.events,
      me: this.matchEvents,
    };
    if (withMatch) msg.m = m;
    this.events = [];
    this.matchEvents = [];
    return msg;
  }
}
