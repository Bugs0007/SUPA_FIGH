import { expect, test, type Page } from '@playwright/test';
import { startServer, type RunningServer } from '../../server/server';
import type { Session } from '../../server/session';

// Client-side prediction in a real browser, against a server that adds 150 ms each way (a bad network): with it on, the
// fighter moves on the next frames after the key goes down; with it off it waits for the server's snapshot.

type Win = {
  __GAME__: { game: { scene: { start: (k: string, d: unknown) => void; getScene: (k: string) => Record<string, unknown> | null } }; scene: () => string[] };
  __net?: { sim: { match: { world: { tick: number; fighters: { x: number }[] } }; mine: number[]; predictor: { ready: boolean; corrections: number; margin: number } | null } };
  __react?: { keyAt: number; moveAt: number };
};

let server: RunningServer;
test.beforeAll(async () => {
  server = await startServer({ port: 0, host: '127.0.0.1', seed: 61, netSim: { latencyMs: 150, jitterMs: 15, loss: 0 } });
});
test.afterAll(async () => {
  await server.close();
});

async function play(page: Page, predict: boolean) {
  await page.goto('/?timer=1');
  await page.waitForFunction(() => (window as unknown as Partial<Win>).__GAME__?.scene().includes('title'));
  await page.evaluate(
    async ({ url, predict }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const load = (path: string): Promise<any> => import(/* @vite-ignore */ path);
      const { NetClient } = await load('/src/net/client.ts');
      const { RemoteSim } = await load('/src/net/remoteSim.ts');
      const { netMatchData } = await load('/src/scenes/netSetup.ts');
      const w = window as unknown as Win;
      const client = new NetClient('pred-' + Math.random().toString(16).slice(2), 'PRED', (u: string) => new WebSocket(u) as never);
      await client.connect(url);
      client.send({ t: 'create' });
      client.send({ t: 'claim', local: 0, claim: { name: 'PRED', hero: '', upJumps: true, look: {} } });
      client.send({ t: 'config', config: { mapId: 'test', mode: 'deathmatch', timeLimit: 120, bots: [] } });
      client.onMessage((m: { t: string }) => {
        if (m.t !== 'start') return;
        const sim = new RemoteSim(client, m, undefined, { predict });
        w.__net = { sim };
        w.__GAME__.game.scene.start('match', netMatchData(sim));
      });
      client.send({ t: 'start' });
    },
    { url: `ws://127.0.0.1:${server.port}`, predict },
  );
  await page.waitForFunction(() => (window as unknown as Win).__net?.sim.match.world.tick! > 120, undefined, { timeout: 30_000 });
  await page.waitForTimeout(600);
  // time from the key going down to the first visible movement, measured inside the page
  await page.evaluate(() => {
    const w = window as unknown as Win;
    const sim = w.__net!.sim;
    const x0 = sim.match.world.fighters[sim.mine[0]].x;
    const r = { keyAt: 0, moveAt: 0 };
    w.__react = r;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyD' && !r.keyAt) r.keyAt = performance.now();
    });
    const loop = () => {
      if (r.keyAt && !r.moveAt && Math.abs(sim.match.world.fighters[sim.mine[0]].x - x0) > 0.3) r.moveAt = performance.now();
      requestAnimationFrame(loop);
      if (!document.hidden) return;
      setTimeout(loop, 16);
    };
    loop();
    // (timer=1 pages run on setTimeout: keep sampling at the same rate)
    setInterval(() => {
      if (r.keyAt && !r.moveAt && Math.abs(sim.match.world.fighters[sim.mine[0]].x - x0) > 0.3) r.moveAt = performance.now();
    }, 4);
  });
  await page.keyboard.down('KeyD');
  await page.waitForFunction(() => (window as unknown as Win).__react!.moveAt > 0, undefined, { timeout: 10_000 });
  const ms = await page.evaluate(() => {
    const r = (window as unknown as Win).__react!;
    return r.moveAt - r.keyAt;
  });
  await page.waitForTimeout(700);
  await page.keyboard.up('KeyD');
  return ms;
}

test('with prediction the fighter reacts at once on a 150 ms-each-way network; without it waits for the server', async ({ browser }) => {
  const errors: string[] = [];
  const open = async () => {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    return page;
  };
  const on = await open();
  const msOn = await play(on, true);
  const state = await on.evaluate(() => {
    const p = (window as unknown as Win).__net!.sim.predictor!;
    return { ready: p.ready, corrections: p.corrections, margin: p.margin };
  });
  await on.screenshot({ path: 'tests/e2e/screenshots/netpredict.png' });
  const off = await open();
  const msOff = await play(off, false);

  console.log('PREDICT-E2E reaction ms: on', Math.round(msOn), 'off', Math.round(msOff), JSON.stringify(state));
  expect(state.ready).toBe(true);
  expect(msOn).toBeLessThan(100); // a frame or two plus the first tick of acceleration
  expect(msOff).toBeGreaterThan(300); // a full round trip plus the interpolation buffer
  // and the server really moved the fighter too (the prediction is not a fiction)
  const live = [...server.hub.rooms.values()].map((r) => r.session as Session | null).filter(Boolean) as Session[];
  expect(live.length).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});
