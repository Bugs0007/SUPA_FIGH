import { describe, expect, it } from 'vitest';
import { Hub } from '../../server/hub';
import type { Session } from '../../server/session';
import { NetClient } from '../../src/net/client';
import { PROTOCOL_VERSION } from '../../src/net/protocol';
import { RemoteSim, type StartMsg } from '../../src/net/remoteSim';
import { applyHit } from '../../src/sim/combat';
import { emptyIntent } from '../../src/sim/intent';
import { loopback } from './netHelpers';

const STEP = 1000 / 60;

/** A real NetClient on an in-process hub, plus a fake clock the test drives. */
async function connect(hub: Hub, device: string) {
  const net = loopback(hub);
  const client = new NetClient(device, device.toUpperCase(), net.factory);
  await client.connect('loopback://');
  return { client, net };
}

async function twoPlayerMatch(config: Record<string, unknown> = {}) {
  const hub = new Hub({ seed: 12 });
  const a = await connect(hub, 'a');
  const b = await connect(hub, 'b');
  a.client.send({ t: 'create' });
  const code = a.client.room!.code;
  b.client.send({ t: 'join', room: code });
  for (const c of [a, b]) c.client.send({ t: 'claim', local: 0, claim: { name: c.client.name, hero: '', upJumps: true, look: {} } });
  a.client.send({ t: 'config', config: { mapId: 'test', mode: 'brawl', bots: [], ...config } });
  b.client.send({ t: 'ready', ready: true });
  const starts: StartMsg[] = [];
  b.client.onMessage((m) => m.t === 'start' && starts.push(m));
  a.client.onMessage((m) => m.t === 'start' && starts.push(m));
  a.client.send({ t: 'start' });
  let nowMs = 0;
  const clock = () => nowMs;
  const simA = new RemoteSim(a.client, starts[0], clock);
  const simB = new RemoteSim(b.client, starts[1], clock);
  const session = () => hub.rooms.get(code)!.session as Session;
  /** one 60 Hz frame: the server advances, the clients show what they have */
  const frame = () => {
    nowMs += STEP;
    hub.advance(STEP);
    simA.update(STEP / 1000);
    simB.update(STEP / 1000);
  };
  return { hub, a, b, simA, simB, session, frame, code };
}

describe('NetClient', () => {
  it('connects, says hello, tracks the room and measures nothing until pinged', async () => {
    const hub = new Hub();
    const { client } = await connect(hub, 'dev1');
    expect(client.state).toBe('online');
    client.send({ t: 'create' });
    expect(client.room?.host).toBe('dev1');
  });

  it('reconnects with the same device id and lands back in its room', async () => {
    const hub = new Hub();
    const { client, net } = await connect(hub, 'dev1');
    client.send({ t: 'create' });
    const code = client.room!.code;
    net.sockets[0].sever();
    expect(client.state).toBe('reconnecting');
    await new Promise((r) => setTimeout(r, 400)); // first backoff is 250 ms
    expect(client.state).toBe('online');
    expect(client.room?.code).toBe(code); // the server put it straight back into the room
    expect(net.sockets).toHaveLength(2);
  });

  it('a first connection that fails reports why and ends up closed (no endless retry)', async () => {
    const client = new NetClient('x', 'X', () => {
      throw new Error('bad address');
    });
    await expect(client.connect('nope')).rejects.toThrow('bad address');
    expect(client.state).toBe('closed');
  });

  it('a protocol version mismatch is final', async () => {
    const hub = new Hub();
    const net = loopback(hub);
    const client = new NetClient('x', 'X', net.factory);
    const seen: string[] = [];
    client.onMessage((m) => m.t === 'err' && seen.push(m.code));
    const done = client.connect('loopback://').catch(() => undefined);
    await new Promise((r) => setTimeout(r, 5));
    net.sockets[0].send(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION + 1, device: 'x', name: 'X' }));
    await done;
    expect(seen).toContain('version');
  });
});

describe('RemoteSim', () => {
  it('shows the server\'s fighters a few ticks late and blended, and delivers each event once', async () => {
    const { simA, session, frame } = await twoPlayerMatch();
    expect(simA.mine).toEqual([0]);
    // record where the server's fighters were at every tick
    const history = new Map<number, { x: number; y: number }[]>();
    const seenEvents: string[] = [];
    let drawn = 0;
    let worstErr = 0;
    for (let n = 0; n < 60 * 12; n++) {
      frame();
      const w = session().match.world;
      history.set(w.tick, w.fighters.map((f) => ({ x: f.x, y: f.y })));
      for (const e of simA.events.splice(0)) seenEvents.push(e.t);
      if (n < 90) continue;
      // what the renderer draws: px -> x by alpha
      const f = simA.match.world.fighters[1];
      const shownX = f.px + (f.x - f.px) * simA.alpha;
      // the server's x at the render time (interpolated between the two ticks around it)
      const rt = simA.timeline.time!;
      const t0 = Math.floor(rt);
      const h0 = history.get(t0);
      const h1 = history.get(t0 + 1);
      if (!h0 || !h1) continue;
      const truth = h0[1].x + (h1[1].x - h0[1].x) * (rt - t0);
      worstErr = Math.max(worstErr, Math.abs(shownX - truth));
      drawn++;
    }
    expect(drawn).toBeGreaterThan(300);
    // fighters fall and settle in the first second, then idle: the blend must sit on the truth
    expect(worstErr).toBeLessThan(2);
    expect(simA.timeline.delay).toBeGreaterThanOrEqual(4);
    expect(simA.timeline.delay).toBeLessThanOrEqual(6);
    expect(seenEvents.length).toBeGreaterThan(0);
  });

  it('turns local intents into controls the server acts on', async () => {
    const { simA, session, frame } = await twoPlayerMatch();
    for (let n = 0; n < 60; n++) frame();
    const x0 = session().match.world.fighters[0].x;
    const right = { ...emptyIntent(), moveX: 1 };
    for (let n = 0; n < 40; n++) {
      simA.sendInputs([right]);
      frame();
    }
    expect(session().match.world.fighters[0].x).toBeGreaterThan(x0 + 20);
    // a tap that lasts one frame still registers (edge bits)
    simA.sendInputs([{ ...emptyIntent(), jump: true }]);
    simA.sendInputs([emptyIntent()]);
    const y = session().match.world.fighters[0].y;
    frame();
    frame();
    expect(session().match.world.fighters[0].y).toBeLessThan(y - 0.5);
  });

  it('rebuilds the mirror\'s World when the server starts a new round', async () => {
    const { simA, simB, session, frame } = await twoPlayerMatch();
    for (let n = 0; n < 120; n++) frame();
    const first = simA.match.world;
    expect(simA.worldChanged).toBe(false);
    // knock fighter 1 out: the round ends, and ~3.5 s later the next one begins in a new World
    const w = session().match.world;
    applyHit(w, w.fighters[1], { damage: 9999, kbX: 0, kbY: 0, attacker: 0, weapon: 'test', kind: 'melee', ignoreInvuln: true });
    let changedAt = -1;
    for (let n = 0; n < 60 * 8 && changedAt < 0; n++) {
      frame();
      if (simA.worldChanged) changedAt = n;
    }
    expect(changedAt).toBeGreaterThan(0);
    expect(simA.match.world).not.toBe(first);
    expect(simB.worldChanged).toBe(true);
    expect(simA.match.round).toBe(2);
    expect(simA.matchEvents.some((e) => e.t === 'roundEnd')).toBe(true);
    // and it keeps following the new world
    for (let n = 0; n < 60; n++) frame();
    expect(simA.match.world.tick).toBeGreaterThan(30);
    expect(simA.match.world.fighters[0].alive).toBe(true);
  });

  it('knows when the match is over', async () => {
    const { simA, session, frame, a } = await twoPlayerMatch({ mode: 'deathmatch', timeLimit: 30 });
    for (let n = 0; n < 60; n++) frame();
    const w = session().match.world; // one kill, so the buzzer has a winner (a tie goes to overtime)
    applyHit(w, w.fighters[1], { damage: 9999, kbX: 0, kbY: 0, attacker: 0, weapon: 'test', kind: 'melee', ignoreInvuln: true });
    session().match.processWorldEvents(0); // scores the kill (the sim only looks at events from inside step())
    let n = 0;
    while (!simA.ended && n++ < 60 * 60) frame();
    expect(simA.ended).toBe(true);
    expect(a.client.room!.state).toBe('lobby');
  });
});
