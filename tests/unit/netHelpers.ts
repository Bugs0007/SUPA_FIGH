// Test support for the server: a fake client that talks to a Hub in-process (no sockets, no real time) and keeps a
// mirror Match up to date from the snapshots, exactly like a real client will.

import type { Hub } from '../../server/hub';
import type { SocketFactory, SocketLike } from '../../src/net/client';
import { applyMatch, applyWorld, positionsOf } from '../../src/net/renderState';
import { PROTOCOL_VERSION, type ClientMsg, type RoomConfig, type ServerMsg, type SlotClaim, type SnapMsg } from '../../src/net/protocol';
import { emptyIntent, packIntent, type Intent } from '../../src/sim/intent';
import { Match } from '../../src/sim/match';

export class TestClient {
  msgs: ServerMsg[] = [];
  snaps: SnapMsg[] = [];
  mirror: Match | null = null;
  mine: number[] = [];
  closed = false;
  private link;

  constructor(
    hub: Hub,
    readonly device: string,
    readonly name = device.toUpperCase(),
  ) {
    this.link = hub.open({
      send: (raw) => this.receive(raw),
      close: () => {
        this.closed = true;
      },
    });
    this.send({ t: 'hello', v: PROTOCOL_VERSION, device, name: this.name });
  }

  send(msg: ClientMsg | Record<string, unknown>): void {
    this.link.message(JSON.stringify(msg));
  }

  sendRaw(raw: string): void {
    this.link.message(raw);
  }

  /** The connection drops (the device stays known to its room). */
  drop(): void {
    this.link.close();
  }

  private receive(raw: string): void {
    const msg = JSON.parse(raw) as ServerMsg;
    this.msgs.push(msg);
    if (msg.t === 'start') {
      this.mirror = new Match(msg.cfg);
      this.mine = msg.mine;
    } else if (msg.t === 'snap' && this.mirror) {
      this.snaps.push(msg);
      applyWorld(this.mirror.world, msg.w, positionsOf(this.mirror.world));
      if (msg.m) applyMatch(this.mirror, msg.m);
    }
  }

  of<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }>[] {
    return this.msgs.filter((m): m is Extract<ServerMsg, { t: T }> => m.t === t);
  }

  last<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }> | undefined {
    return this.of(t).at(-1);
  }

  claim(local = 0, extra: Partial<SlotClaim> = {}): void {
    this.send({ t: 'claim', local, claim: { name: this.name, hero: '', upJumps: true, look: {}, ...extra } });
  }

  /** Hold these controls (the server keeps them until the next message). */
  hold(slot: number, i: Partial<Intent>, edges = 0, seq = this.seq++): void {
    this.send({ t: 'in', slot, seq, v: packIntent({ ...emptyIntent(), ...i }), e: edges });
  }

  private seq = 0;

  config(config: Partial<RoomConfig>): void {
    this.send({ t: 'config', config });
  }
}

/** Run the hub for `ms` of game time in ~16 ms steps. */
export function run(hub: Hub, ms: number, each?: () => void): void {
  const step = 1000 / 60;
  for (let t = 0; t < ms; t += step) {
    hub.advance(step);
    each?.();
  }
}

/** A socket that talks to a Hub in-process: lets the real NetClient run without a network or real time. */
export function loopback(hub: Hub): { factory: SocketFactory; sockets: LoopbackSocket[] } {
  const sockets: LoopbackSocket[] = [];
  return {
    sockets,
    factory: () => {
      const s = new LoopbackSocket(hub);
      sockets.push(s);
      return s;
    },
  };
}

export class LoopbackSocket implements SocketLike {
  readyState = 0;
  private fns: Record<string, ((ev: { data: unknown }) => void)[]> = {};
  private link;

  constructor(hub: Hub) {
    this.link = hub.open({
      send: (raw) => this.emit('message', { data: raw }),
      close: () => this.shutdown(),
    });
    queueMicrotask(() => {
      if (this.readyState !== 0) return;
      this.readyState = 1;
      this.emit('open', { data: null });
    });
  }

  addEventListener(type: string, fn: (ev: { data: unknown }) => void): void {
    (this.fns[type] ??= []).push(fn);
  }

  private emit(type: string, ev: { data: unknown }): void {
    for (const f of this.fns[type] ?? []) f(ev);
  }

  send(data: string): void {
    if (this.readyState === 1) this.link.message(data);
  }

  /** the client closes */
  close(): void {
    this.shutdown();
  }

  private shutdown(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.link.close();
    this.emit('close', { data: null });
  }

  /** the network dies under the client */
  sever(): void {
    this.shutdown();
  }
}
