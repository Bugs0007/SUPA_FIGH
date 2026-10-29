// End to end over real WebSockets on localhost: a server running faster than real time and N clients that are
// bots playing through their own mirror of the match (so a snapshot / control round trip happens ~30 times a second).

import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { BotController } from '../../src/ai/bot';
import { IntentSender } from '../../src/net/intentWire';
import { PROTOCOL_VERSION, type ClientMsg, type ServerMsg } from '../../src/net/protocol';
import { applyMatch, applyWorld, positionsOf } from '../../src/net/renderState';
import { Match } from '../../src/sim/match';
import { startServer, type RunningServer } from '../../server/server';

class BotClient {
  ws: WebSocket;
  msgs: ServerMsg[] = [];
  mirror: Match | null = null;
  mine: number[] = [];
  snaps = 0;
  lastTick = -1;
  tickRegressions = 0;
  private bot: BotController | null = null;
  private sender = new IntentSender();
  private started = performance.now();

  constructor(
    url: string,
    readonly device: string,
    private play = true,
  ) {
    this.ws = new WebSocket(url);
    this.ws.on('open', () => this.send({ t: 'hello', v: PROTOCOL_VERSION, device, name: device.toUpperCase() }));
    this.ws.on('message', (data) => this.onMessage(JSON.parse(data.toString())));
  }

  send(msg: ClientMsg): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private onMessage(msg: ServerMsg): void {
    this.msgs.push(msg);
    if (msg.t === 'start') {
      this.mirror = new Match(msg.cfg);
      this.mine = msg.mine;
      this.lastTick = -1;
      const m = this.mirror;
      this.bot = this.mine.length ? new BotController(() => m.world, this.mine[0], { difficulty: 'normal', seed: 3 }) : null;
    } else if (msg.t === 'snap' && this.mirror) {
      this.snaps++;
      if (msg.tick < this.lastTick) this.tickRegressions++;
      this.lastTick = msg.tick;
      applyWorld(this.mirror.world, msg.w, positionsOf(this.mirror.world));
      if (msg.m) applyMatch(this.mirror, msg.m);
      if (this.play && this.bot) {
        this.sender.poll(this.bot.poll());
        const out = this.sender.take(performance.now() - this.started);
        if (out) this.send({ t: 'in', slot: this.mine[0], ...out, v: out.v, e: out.e });
      }
    }
  }

  async waitFor(pred: () => boolean, ms = 20_000, what = 'condition'): Promise<void> {
    const t0 = performance.now();
    while (!pred()) {
      if (performance.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
      await new Promise((r) => setTimeout(r, 5));
    }
  }

  has(t: ServerMsg['t']): boolean {
    return this.msgs.some((m) => m.t === t);
  }

  last<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }> | undefined {
    return this.msgs.filter((m): m is Extract<ServerMsg, { t: T }> => m.t === t).at(-1);
  }

  close(): void {
    this.ws.close();
  }
}

let server: RunningServer | null = null;
const clients: BotClient[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.ws.terminate();
  await server?.close();
  server = null;
});

const connect = async (device: string, play = true) => {
  const c = new BotClient(`ws://127.0.0.1:${server!.port}`, device, play);
  clients.push(c);
  await c.waitFor(() => c.has('welcome'), 5000, `${device} welcome`);
  return c;
};

describe('server over real WebSockets', () => {
  it('answers /health and binds where it was told to', async () => {
    server = await startServer({ port: 0, host: '127.0.0.1' });
    const res = await fetch(`http://127.0.0.1:${server.port}/health`);
    expect(await res.text()).toBe('ok');
  });

  it('runs a full match with bot clients, then returns everyone to the lobby', async () => {
    server = await startServer({ port: 0, host: '127.0.0.1', speed: 20, seed: 9 });
    const host = await connect('host');
    host.send({ t: 'create' });
    await host.waitFor(() => host.has('room'));
    const code = host.last('room')!.code;
    const guests = [await connect('g1'), await connect('g2'), await connect('g3')];
    for (const g of guests) g.send({ t: 'join', room: code });
    for (const c of [host, ...guests]) {
      c.send({ t: 'claim', local: 0, claim: { name: c.device.toUpperCase(), hero: '', upJumps: false, look: { hair: 'short', n: 3 } } });
    }
    host.send({ t: 'config', config: { mapId: 'factory', mode: 'deathmatch', timeLimit: 30, bots: [{ hero: 'goku', difficulty: 'normal' }, { hero: '', difficulty: 'easy' }] } });
    // settings changes un-ready everybody, so ready up only after the host's config has landed
    await host.waitFor(() => host.last('room')?.config.mapId === 'factory', 5000, 'config');
    for (const g of guests) g.send({ t: 'ready', ready: true });
    await host.waitFor(() => (host.last('room')?.peers.filter((p) => p.ready).length ?? 0) === 3, 5000, 'guests ready');
    host.send({ t: 'start' });

    const everyone = [host, ...guests];
    await host.waitFor(() => everyone.every((c) => c.has('start')), 5000, 'start');
    expect(host.last('start')!.cfg.fighters).toHaveLength(6);
    expect(new Set(everyone.flatMap((c) => c.mine)).size).toBe(4); // four humans, four distinct fighters

    await host.waitFor(() => everyone.every((c) => c.has('end')), 30_000, 'the match to end');
    for (const c of everyone) {
      expect(c.snaps).toBeGreaterThan(30 * 30); // 30 Hz for at least the 30 s of play
      expect(c.tickRegressions).toBe(0);
      expect(c.mirror!.matchWinner).not.toBeNull();
    }
    // the bot clients really played: the server saw their controls move the fighters around
    const stats = everyone[0].mirror!.stats;
    expect(stats.reduce((n, s) => n + s.kills + s.deaths, 0)).toBeGreaterThan(0);
    await host.waitFor(() => host.last('room')?.state === 'lobby', 5000, 'lobby');
  }, 60_000);

  it('a client that reconnects with the same device id gets its fighter and the match back', async () => {
    server = await startServer({ port: 0, host: '127.0.0.1', speed: 5, seed: 4 });
    const a = await connect('a');
    a.send({ t: 'create' });
    await a.waitFor(() => a.has('room'));
    const code = a.last('room')!.code;
    const b = await connect('b');
    b.send({ t: 'join', room: code });
    a.send({ t: 'claim', local: 0, claim: { name: 'A', hero: '', upJumps: true, look: {} } });
    b.send({ t: 'claim', local: 0, claim: { name: 'B', hero: '', upJumps: true, look: {} } });
    a.send({ t: 'config', config: { mapId: 'test', mode: 'deathmatch', timeLimit: 60, bots: [] } });
    await a.waitFor(() => a.last('room')?.config.timeLimit === 60, 5000, 'config');
    b.send({ t: 'ready', ready: true });
    await a.waitFor(() => a.last('room')?.peers.some((p) => p.ready) ?? false, 5000, 'b ready');
    a.send({ t: 'start' });
    await b.waitFor(() => b.snaps > 10);
    const fighter = b.mine[0];

    b.ws.terminate();
    await a.waitFor(() => a.last('room')?.peers.find((p) => p.device === 'b')?.connected === false, 5000, 'drop noticed');
    const b2 = await connect('b');
    await b2.waitFor(() => b2.has('start') && b2.snaps > 5, 5000, 'rejoined');
    expect(b2.mine).toEqual([fighter]);
    expect(b2.last('room')!.peers.find((p) => p.device === 'b')!.connected).toBe(true);
  }, 30_000);

  it('drops an oversized frame without taking the server down', async () => {
    server = await startServer({ port: 0, host: '127.0.0.1' });
    const c = await connect('big');
    const closed = new Promise<number>((r) => c.ws.on('close', (code) => r(code)));
    c.ws.send('x'.repeat(100_000));
    expect([1006, 1009]).toContain(await closed); // the server cuts the connection (1009 = message too big)
    const ok = await connect('fine');
    ok.send({ t: 'create' });
    await ok.waitFor(() => ok.has('room'));
  });
});
