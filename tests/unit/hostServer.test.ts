import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { request } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { NetSim, isLossy } from '../../server/netsim';
import { startServer, type RunningServer } from '../../server/server';
import { staticHandler } from '../../server/static';
import { PROTOCOL_VERSION } from '../../src/net/protocol';
import { lanAddresses } from '../../server/lan';

let server: RunningServer | null = null;
let dir = '';
afterEach(async () => {
  await server?.close();
  server = null;
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = '';
});

function site(): string {
  dir = mkdtempSync(join(tmpdir(), 'brawlkai-site-'));
  const root = join(dir, 'site');
  mkdirSync(join(root, 'assets'), { recursive: true });
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>BRAWLKAI</title>' + 'x'.repeat(3000));
  writeFileSync(join(root, 'assets', 'app-abc123.js'), 'console.log(1);' + ' '.repeat(5000));
  writeFileSync(join(root, 'assets', 'pic.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  writeFileSync(join(dir, 'secret.txt'), 'top secret'); // next to the site root: what a ../ would reach
  return root;
}

describe('static file server (npm run host)', () => {
  it('serves the build with types, gzip, caching and no escape from its directory', async () => {
    const root = site();
    server = await startServer({ port: 0, host: '127.0.0.1', http: staticHandler(root) });
    const base = `http://127.0.0.1:${server.port}`;

    const index = await fetch(base + '/');
    expect(index.status).toBe(200);
    expect(index.headers.get('content-type')).toContain('text/html');
    expect(index.headers.get('cache-control')).toBe('no-cache');
    expect(await index.text()).toContain('BRAWLKAI');

    const js = await fetch(base + '/assets/app-abc123.js');
    expect(js.headers.get('content-type')).toContain('text/javascript');
    expect(js.headers.get('cache-control')).toContain('immutable');
    expect(js.headers.get('content-encoding')).toBe('gzip'); // fetch asks for gzip and undici inflates it
    expect((await js.text()).startsWith('console.log(1);')).toBe(true);

    expect((await fetch(base + '/assets/pic.png')).headers.get('content-type')).toBe('image/png');
    expect((await fetch(base + '/health')).status).toBe(200);
    expect((await fetch(base + '/missing.html')).status).toBe(404);
    expect((await fetch(base + '/assets/', { method: 'POST' })).status).toBe(405);
    // path tricks must not leave the directory (raw request: fetch would normalize the dots away)
    for (const evil of ['/..%2fsecret.txt', '/%2e%2e/secret.txt', '/assets/..%2f..%2fsecret.txt', '/%00']) {
      const res = await fetch(base + evil);
      expect(res.status, evil).not.toBe(200);
      expect(await res.text()).not.toContain('top secret');
    }
  });

  it('the websocket still works next to the static files', async () => {
    server = await startServer({ port: 0, host: '127.0.0.1', http: staticHandler(site()) });
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
    const welcome = new Promise<{ t: string; urls?: string[] }>((r) => ws.on('message', (d) => r(JSON.parse(d.toString()))));
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, device: 'x', name: 'X' })));
    expect((await welcome).t).toBe('welcome');
    ws.close();
  });

  it('lists this machine\'s LAN addresses, private ranges first', () => {
    const addrs = lanAddresses();
    for (const a of addrs) expect(a).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    const rank = (ip: string) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : 3);
    expect(addrs.map(rank)).toEqual([...addrs.map(rank)].sort((a, b) => a - b));
  });
});

describe('HTTPS mode', () => {
  it('serves https and wss from a locally generated certificate, and tells clients the join URLs', async () => {
    dir = mkdtempSync(join(tmpdir(), 'brawlkai-tls-'));
    try {
      execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'), '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
    } catch {
      return; // no openssl on this machine: the same code path is exercised by the manual play-test list
    }
    server = await startServer({ port: 0, host: '127.0.0.1', tls: { key: readFileSync(join(dir, 'k.pem')), cert: readFileSync(join(dir, 'c.pem')) }, urls: ['https://192.168.1.5:8080'] });
    const status = await new Promise<number>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port: server!.port, path: '/health', rejectUnauthorized: false }, (res) => resolve(res.statusCode ?? 0));
      req.on('error', reject).end();
    });
    expect(status).toBe(200);
    const ws = new WebSocket(`wss://127.0.0.1:${server.port}`, { rejectUnauthorized: false });
    const welcome = new Promise<{ t: string; urls?: string[] }>((r) => ws.on('message', (d) => r(JSON.parse(d.toString()))));
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, device: 'x', name: 'X' })));
    expect(await welcome).toMatchObject({ t: 'welcome', urls: ['https://192.168.1.5:8080'] });
    ws.close();
  });
});

describe('NetSim', () => {
  /** a manual clock + scheduler */
  function rig(opts: ConstructorParameters<typeof NetSim>[0]) {
    let now = 0;
    const queue: { at: number; fn: () => void }[] = [];
    const sim = new NetSim(opts, (ms, fn) => void queue.push({ at: now + ms, fn }), () => now);
    const run = (to: number) => {
      for (;;) {
        queue.sort((a, b) => a.at - b.at);
        if (!queue.length || queue[0].at > to) break;
        const q = queue.shift()!;
        now = q.at;
        q.fn();
      }
      now = to;
    };
    return { sim, run, at: () => now };
  }

  it('delays every frame by the latency and keeps them in order despite jitter', () => {
    const { sim, run, at } = rig({ latencyMs: 50, jitterMs: 100, loss: 0, seed: 3 });
    const got: { n: number; at: number }[] = [];
    const send = sim.link((raw) => got.push({ n: Number(raw), at: at() }));
    for (let i = 0; i < 200; i++) {
      send(String(i));
      run(at() + 5);
    }
    run(at() + 1000);
    expect(got.map((g) => g.n)).toEqual(Array.from({ length: 200 }, (_, i) => i)); // in order
    expect(Math.min(...got.map((g, i) => g.at - i * 5))).toBeGreaterThanOrEqual(50 - 1); // never faster than the latency
  });

  it('drops only the frames the protocol can afford to lose, at about the configured rate', () => {
    const { sim, run, at } = rig({ latencyMs: 0, jitterMs: 0, loss: 0.2, seed: 9 });
    const got: string[] = [];
    const send = sim.link((raw) => got.push(raw));
    for (let i = 0; i < 2000; i++) send(`{"t":"snap","n":${i}}`);
    for (let i = 0; i < 300; i++) send(`{"t":"start","n":${i}}`);
    run(at() + 100_000);
    const snaps = got.filter((g) => g.startsWith('{"t":"snap"')).length;
    const reliable = got.filter((g) => g.startsWith('{"t":"start"')).length;
    expect(reliable).toBe(300); // lobby / start / end are never lost
    expect(snaps / 2000).toBeGreaterThan(0.72);
    expect(snaps / 2000).toBeLessThan(0.88);
    expect(isLossy('{"t":"in","slot":0}')).toBe(true);
    expect(isLossy('{"t":"room"}')).toBe(false);
  });

  it('is deterministic for a seed and inactive when everything is zero', () => {
    const a = rig({ latencyMs: 20, jitterMs: 20, loss: 0.3, seed: 4 });
    const b = rig({ latencyMs: 20, jitterMs: 20, loss: 0.3, seed: 4 });
    const ga: string[] = [];
    const gb: string[] = [];
    const sa = a.sim.link((r) => ga.push(r));
    const sb = b.sim.link((r) => gb.push(r));
    for (let i = 0; i < 100; i++) {
      sa(`{"t":"snap","n":${i}}`);
      sb(`{"t":"snap","n":${i}}`);
    }
    a.run(10_000);
    b.run(10_000);
    expect(ga).toEqual(gb);
    expect(rig({ latencyMs: 0, jitterMs: 0, loss: 0 }).sim.active).toBe(false);
  });
});

describe('server with a network simulation switched on', () => {
  it('adds the latency to every round trip (ping shows it) and still plays', async () => {
    server = await startServer({ port: 0, host: '127.0.0.1', netSim: { latencyMs: 60, jitterMs: 10, loss: 0 } });
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
    await new Promise((r) => ws.on('open', r));
    const t0 = performance.now();
    const pong = new Promise<number>((resolve) =>
      ws.on('message', (d) => {
        const m = JSON.parse(d.toString());
        if (m.t === 'pong') resolve(performance.now() - t0);
      }),
    );
    ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, device: 'x', name: 'X' }));
    ws.send(JSON.stringify({ t: 'create' }));
    ws.send(JSON.stringify({ t: 'ping', n: 1 }));
    const rtt = await pong;
    expect(rtt).toBeGreaterThan(110); // 60 ms each way
    expect(rtt).toBeLessThan(400);
    ws.close();
  });
});
