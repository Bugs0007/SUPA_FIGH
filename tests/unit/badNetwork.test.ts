// Whole matches under bad network conditions (D76): the real server logic, the real NetClient / RemoteSim, and a
// simulated link between them with latency, jitter and loss, all on a fake clock so the runs are exact and fast.

import { describe, expect, it } from 'vitest';
import { Hub } from '../../server/hub';
import { NetSim, type NetSimOptions } from '../../server/netsim';
import type { Session } from '../../server/session';
import { NetClient, type SocketFactory, type SocketLike } from '../../src/net/client';
import { RemoteSim, type StartMsg } from '../../src/net/remoteSim';
import { applyHit } from '../../src/sim/combat';
import { emptyIntent } from '../../src/sim/intent';

const STEP = 1000 / 60;

/** a fake clock with a queue of things due later */
class Clock {
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
interface Gate {
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

async function playUnder(net: NetSimOptions) {
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
  for (const c of [a, b]) c.send({ t: 'claim', local: 0, claim: { name: c.name, hero: '', upJumps: true, look: {} } });
  a.send({ t: 'config', config: { mapId: 'factory', mode: 'deathmatch', timeLimit: 30, bots: [{ hero: 'goku', difficulty: 'normal' }, { hero: '', difficulty: 'hard' }] } });
  until(() => a.room?.config.mapId === 'factory' && b.room?.config.mapId === 'factory', 'config reached both');
  b.send({ t: 'ready', ready: true });
  until(() => !!a.room?.peers.find((p) => p.device === 'b')?.ready, 'b ready');
  const starts: Record<string, StartMsg> = {};
  for (const c of [a, b]) c.onMessage((m) => m.t === 'start' && (starts[c.device] = m));
  a.send({ t: 'start' });
  until(() => !!starts.a && !!starts.b, 'both started');
  const simA = new RemoteSim(a, starts.a, () => clock.now);
  const simB = new RemoteSim(b, starts.b, () => clock.now);
  const session = () => hub.rooms.get(a.room!.code)!.session as Session;
  return { clock, gate, hub, a, b, simA, simB, session, pump };
}

const CASES: { name: string; net: NetSimOptions; maxErrPx: number; maxResponseMs: number }[] = [
  { name: 'good WiFi (5 ms)', net: { latencyMs: 5, jitterMs: 3, loss: 0 }, maxErrPx: 2, maxResponseMs: 260 },
  { name: 'busy WiFi (60 ms, 40 ms jitter, 5% loss)', net: { latencyMs: 60, jitterMs: 40, loss: 0.05 }, maxErrPx: 3, maxResponseMs: 500 },
  { name: 'awful WiFi (120 ms, 80 ms jitter, 15% loss)', net: { latencyMs: 120, jitterMs: 80, loss: 0.15 }, maxErrPx: 4, maxResponseMs: 800 },
];

describe('whole matches under bad network conditions', () => {
  it.each(CASES)('$name: plays to the end, follows the server, and responds to controls', async ({ net, maxErrPx, maxResponseMs }) => {
    const { clock, simA, simB, session, pump } = await playUnder(net);
    const history = new Map<number, { x: number }[]>();
    const clocks = new Map<RemoteSim, { wid: number; time: number }>();
    let worstErr = 0;
    let measured = 0;
    let responseMs = -1;
    let pressedAt = -1;
    let x0 = 0;

    for (let n = 0; n < 60 * 90 && !(simA.ended && simB.ended); n++) {
      // A holds "run right" from frame 120 to 400; at frame 200 a kill makes sure the buzzer has a winner (a tie goes to overtime)
      if (n === 120) {
        pressedAt = clock.now;
        x0 = simA.match.world.fighters[simA.mine[0]].x;
      }
      simA.sendInputs([n >= 120 && n < 400 ? { ...emptyIntent(), moveX: 1 } : emptyIntent()]);
      simB.sendInputs([emptyIntent()]);
      if (n === 200) {
        const w = session().match.world;
        applyHit(w, w.fighters[3], { damage: 9999, kbX: 0, kbY: 0, attacker: 0, weapon: 'test', kind: 'melee', ignoreInvuln: true });
        session().match.processWorldEvents(0);
      }
      pump();
      simA.update(STEP / 1000);
      simB.update(STEP / 1000);

      const live = session() as Session | null; // gone once the server has ended the match; clients still play out the last frames
      if (live) history.set(live.match.world.tick, live.match.world.fighters.map((f) => ({ x: f.x })));
      for (const s of [simA, simB]) {
        const t = s.timeline.time;
        if (t === null) continue;
        // the render clock never runs backwards inside one world, and the buffer stays within its design bounds
        const prev = clocks.get(s);
        const wid = (s as unknown as { wid: number }).wid;
        if (prev && prev.wid === wid) expect(t).toBeGreaterThanOrEqual(prev.time - 1e-9);
        clocks.set(s, { wid, time: t });
        expect(s.timeline.delay).toBeLessThanOrEqual(6);
      }

      // what A sees of its own fighter vs where the server had it at that render time
      const t = simA.timeline.time;
      const me = simA.mine[0];
      if (t !== null && n > 90 && n < 400) {
        const f = simA.match.world.fighters[me];
        const shown = f.px + (f.x - f.px) * simA.alpha;
        const h0 = history.get(Math.floor(t));
        const h1 = history.get(Math.floor(t) + 1);
        if (h0 && h1) {
          worstErr = Math.max(worstErr, Math.abs(shown - (h0[me].x + (h1[me].x - h0[me].x) * (t - Math.floor(t)))));
          measured++;
        }
        if (responseMs < 0 && pressedAt > 0 && Math.abs(shown - x0) > 6) responseMs = clock.now - pressedAt;
      }
    }

    expect(simA.ended && simB.ended, 'the match reached its end').toBe(true);
    expect(simA.match.matchWinner).not.toBeNull();
    expect(measured).toBeGreaterThan(150);
    expect(worstErr, 'drawn position vs the server at that moment').toBeLessThan(maxErrPx);
    expect(responseMs, 'time from pressing right to seeing the fighter move').toBeGreaterThan(0);
    expect(responseMs).toBeLessThan(maxResponseMs);
  }, 90_000);

  it('survives a 3-second blackout: the render clock holds, frames resume in a burst, controls work again', async () => {
    const { gate, simA, session, pump } = await playUnder({ latencyMs: 30, jitterMs: 10, loss: 0 });
    for (let n = 0; n < 180; n++) {
      pump();
      simA.update(STEP / 1000);
    }
    const tickBefore = simA.match.world.tick;
    const timeBefore = simA.timeline.time!;
    gate.held = true; // nothing reaches the client for 3 s
    for (let n = 0; n < 60 * 3; n++) {
      pump();
      simA.update(STEP / 1000);
    }
    // the clock ran up to the newest frame it had and then held: no extrapolation, no running backwards
    expect(simA.timeline.time!).toBeGreaterThanOrEqual(timeBefore);
    expect(simA.timeline.time!).toBeLessThanOrEqual(timeBefore + 8);
    expect(session().match.world.tick).toBeGreaterThan(tickBefore + 60 * 3 - 5); // the server did not wait

    gate.held = false;
    for (const f of gate.queue.splice(0)) f(); // the stalled link delivers everything at once
    const x0 = session().match.world.fighters[simA.mine[0]].x;
    for (let n = 0; n < 60 * 4; n++) {
      simA.sendInputs([{ ...emptyIntent(), moveX: 1 }]);
      pump();
      simA.update(STEP / 1000);
    }
    expect(simA.match.world.tick).toBeGreaterThan(tickBefore + 60 * 3); // caught up
    expect(session().match.world.tick - simA.match.world.tick).toBeLessThan(30); // and back to within half a second of live
    expect(Math.abs(session().match.world.fighters[simA.mine[0]].x - x0)).toBeGreaterThan(15); // controls work again
  }, 60_000);
});
