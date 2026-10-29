import { expect, test, type Page } from '@playwright/test';
import { startServer, type RunningServer } from '../../server/server';
import type { Session } from '../../server/session';

// A real browser playing a match that runs on the game server: the page connects with the real NetClient, takes a
// room, starts a bots match and hands the RemoteSim to the Match scene (the lobby screens of M4 do the same).

interface GameHandle {
  game: { scene: { start: (key: string, data: unknown) => void; getScene: (key: string) => unknown } };
  scene: () => string[];
}
type Win = { __GAME__: GameHandle; __net?: { sim: { match: { world: { tick: number; fighters: { x: number }[] } }; timeline: { delay: number }; buffered: number } } };

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

let server: RunningServer;
test.beforeAll(async () => {
  server = await startServer({ port: 0, host: '127.0.0.1', seed: 31 });
});
test.afterAll(async () => {
  await server.close();
});

test('a browser plays a server match: rendering, controls, events', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?timer=1');
  await page.waitForFunction(() => (window as unknown as Partial<Win>).__GAME__?.scene().includes('title'));

  await page.evaluate(async (url) => {
    // the dev server serves the game's own modules: this is the same code (and module instances) the page runs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const load = (path: string): Promise<any> => import(/* @vite-ignore */ path);
    const { NetClient } = await load('/src/net/client.ts');
    const { RemoteSim } = await load('/src/net/remoteSim.ts');
    const { netMatchData } = await load('/src/scenes/netSetup.ts');
    const client = new NetClient('e2e-device', 'E2E', (u: string) => new WebSocket(u) as never);
    await client.connect(url);
    client.send({ t: 'create' });
    client.send({ t: 'claim', local: 0, claim: { name: 'E2E', hero: '', upJumps: true, look: { hair: 'spiky', skin: '#c68642' } } });
    client.send({ t: 'config', config: { mapId: 'factory', mode: 'deathmatch', timeLimit: 120, bots: [{ hero: 'goku', difficulty: 'normal' }, { hero: '', difficulty: 'easy' }] } });
    const w = window as unknown as Win;
    client.onMessage((m: { t: string }) => {
      if (m.t !== 'start') return;
      const sim = new RemoteSim(client, m);
      w.__net = { sim } as never;
      w.__GAME__.game.scene.start('match', netMatchData(sim));
    });
    client.send({ t: 'start' });
  }, `ws://127.0.0.1:${server.port}`);

  await page.waitForFunction(() => (window as unknown as Win).__net?.sim.match.world.tick! > 90, undefined, { timeout: 30_000 });
  expect(await page.evaluate(() => (window as unknown as Win).__GAME__.scene())).toContain('match');
  expect(await page.evaluate(() => (window as unknown as Win).__net!.sim.match.world.fighters.length)).toBeGreaterThanOrEqual(3);

  // the keyboard drives the player's fighter on the server
  const room = [...server.hub.rooms.values()][0];
  const mine = () => (room.session as Session).match.world.fighters[0].x;
  const x0 = mine();
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(600);
  await page.keyboard.up('KeyD');
  expect(Math.abs(mine() - x0)).toBeGreaterThan(15);

  // and what the page shows follows the server (same fighter, a few ticks behind)
  await page.waitForTimeout(300);
  const shown = await page.evaluate(() => (window as unknown as Win).__net!.sim.match.world.fighters[0].x);
  expect(Math.abs(shown - mine())).toBeLessThan(40);
  const delay = await page.evaluate(() => (window as unknown as Win).__net!.sim.timeline.delay);
  expect(delay).toBeGreaterThanOrEqual(4);
  expect(delay).toBeLessThanOrEqual(6);

  await page.screenshot({ path: 'tests/e2e/screenshots/netmatch.png' });
  expect(errors).toEqual([]);
});
