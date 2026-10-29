// Shared by the bad-network and prediction tests: the real server logic, NetClient and RemoteSim joined by a simulated
// link (latency / jitter / loss) on a fake clock, so runs are exact and fast.

import { expect } from 'vitest';
import { Hub } from '../../server/hub';
import { NetSim, type NetSimOptions } from '../../server/netsim';
import type { Session } from '../../server/session';
import { NetClient, type SocketFactory, type SocketLike } from '../../src/net/client';
import { RemoteSim, type StartMsg } from '../../src/net/remoteSim';
import type { RoomConfig } from '../../src/net/protocol';

export type { NetSimOptions };
export type { Session };

export const STEP = 1000 / 60;

/** a fake clock with a queue of things due later */
export class Clock {
  now = 0;
  private queue: { at: number; n: number; fn: () => void }[] = [];
  private n = 0;
  schedule = (ms: number, fn: () => void) => void this.queue.push({ at: this.now + ms, n: this.n++, fn });
  /** run everything due by `now` (in time order, then in the order it was queued) */
  tick(): void {
    for (;;) {
      this.queue.sort((a, b) => a.at - b.at || a.n - b.n);
      const next = this.queue[0];
      if (!next || next.at > this.now) return;
      this.queue.shift();
      next.fn();
    }
  }
}

/** Server -> client frames can be held back (a blackout) and then arrive in one burst, like a stalled TCP link. */
export interface Gate {
  held: boolean;
  queue: (() => void)[];
}

/** A socket whose two directions go through the network simulator. */
function simulatedSockets(hub: Hub, sim: NetSim, gate: Gate): SocketFactory {
  return () => {
    const fns: Record<string, ((ev: { data: unknown }) => void)[]> = {};
    const emit = (t: string, data: unknown = null) => (fns[t] ?? []).forEach((f) => f({ data }));
    let state = 0;
    const deliver = (raw: string) => {
      if (state !== 1) return;
      if (gate.held) gate.queue.push(() => emit('message', raw));
      else emit('message', raw);
    };
    const toClient = sim.link(deliver);
    const link = hub.open({ send: (raw) => toClient(raw), close: () => emit('close') });
    const toServer = sim.link((raw) => state === 1 && link.message(raw));
    queueMicrotask(() => {
      state = 1;
      emit('open');
    });
    const sock: SocketLike = {
      get readyState() {
        return state;
      },
      send: (data) => toServer(data),
      close: () => {
        state = 3;
        link.close();
      },
      addEventListener: (t: string, fn: (ev: { data: unknown }) => void) => void (fns[t] ??= []).push(fn),
    };
    return sock;
  };
}

export async function playUnder(net: NetSimOptions, opts: { predict?: boolean; config?: Partial<RoomConfig>; heroes?: [string, string] } = {}) {
  const clock = new Clock();
  const gate: Gate = { held: false, queue: [] };
  const hub = new Hub({ seed: 77 });
  const sim = new NetSim({ ...net, seed: 5 }, clock.schedule, () => clock.now);
  const pump = () => {
    clock.now += STEP;
    hub.advance(STEP);
    clock.tick();
  };
  /** the fake network and clock only move when pumped: pump until `cond` */
  const until = (cond: () => boolean, what: string, limit = 900) => {
    for (let i = 0; i < limit && !cond(); i++) pump();
    expect(cond(), what).toBe(true);
  };
  const mk = async (device: string) => {
    const client = new NetClient(device, device.toUpperCase(), simulatedSockets(hub, sim, gate), () => clock.now);
    void client.connect('sim://');
    await new Promise((r) => setTimeout(r, 0)); // the socket "opens" on a microtask
    until(() => client.online, `${device} online`);
    return client;
  };
  const a = await mk('a');
  const b = await mk('b');

  a.send({ t: 'create' });
  until(() => !!a.room, 'room created');
  b.send({ t: 'join', room: a.room!.code });
  for (const c of [a, b]) c.send({ t: 'claim', local: 0, claim: { name: c.name, hero: opts.heroes?.[c === a ? 0 : 1] ?? '', upJumps: true, look: {} } });
  a.send({ t: 'config', config: { mapId: 'factory', mode: 'deathmatch', timeLimit: 30, bots: [{ hero: 'goku', difficulty: 'normal' }, { hero: '', difficulty: 'hard' }], ...opts.config } });
  until(() => a.room?.config.mapId === (opts.config?.mapId ?? 'factory') && b.room?.config.mapId === (opts.config?.mapId ?? 'factory'), 'config reached both');
  b.send({ t: 'ready', ready: true });
  until(() => !!a.room?.peers.find((p) => p.device === 'b')?.ready, 'b ready');
  const starts: Record<string, StartMsg> = {};
  for (const c of [a, b]) c.onMessage((m) => m.t === 'start' && (starts[c.device] = m));
  a.send({ t: 'start' });
  until(() => !!starts.a && !!starts.b, 'both started');
  const simA = new RemoteSim(a, starts.a, () => clock.now, { predict: opts.predict });
  const simB = new RemoteSim(b, starts.b, () => clock.now, { predict: opts.predict });
  const session = () => hub.rooms.get(a.room!.code)!.session as Session;
  return { clock, gate, hub, a, b, simA, simB, session, pump };
}

