import { expect, test, type Page } from '@playwright/test';
import { startServer, type RunningServer } from '../../server/server';

// The two ways out of a server match, in a real browser: the match ends (awards screen, then back to the room's lobby
// with the connection kept) and the player leaves from the pause menu (back to the title, out of the room).

type Win = { __GAME__: { game: { scene: { getScene: (k: string) => Record<string, unknown> | null } }; scene: () => string[] } };

let server: RunningServer;
test.beforeAll(async () => {
  // 6x: a brawl to one round win with three bots ends within about ten seconds of real time
  server = await startServer({ port: 0, host: '127.0.0.1', seed: 52, speed: 6 });
});
test.afterAll(async () => {
  await server.close();
});

async function startMatch(page: Page, url: string) {
  await page.goto('/?timer=1');
  await page.waitForFunction(() => (window as unknown as Win).__GAME__?.scene().includes('title'));
  await page.evaluate(async (u) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const load = (path: string): Promise<any> => import(/* @vite-ignore */ path);
    const { NetClient } = await load('/src/net/client.ts');
    const { RemoteSim } = await load('/src/net/remoteSim.ts');
    const { netMatchData } = await load('/src/scenes/netSetup.ts');
    const client = new NetClient('end-' + Math.random().toString(16).slice(2), 'END', (a: string) => new WebSocket(a) as never);
    await client.connect(u);
    client.send({ t: 'create' });
    client.send({ t: 'claim', local: 0, claim: { name: 'END', hero: '', upJumps: true, look: {} } });
    client.send({ t: 'config', config: { mapId: 'test', mode: 'brawl', roundsToWin: 1, bots: [1, 2, 3].map(() => ({ hero: '', difficulty: 'hard' })) } });
    const game = (window as unknown as Win).__GAME__.game as unknown as { scene: { start: (k: string, d: unknown) => void } };
    client.onMessage((m: { t: string }) => {
      if (m.t === 'start') game.scene.start('match', netMatchData(new RemoteSim(client, m)));
    });
    client.send({ t: 'start' });
  }, url);
  await page.waitForFunction(() => (window as unknown as Win).__GAME__.scene().includes('match'), undefined, { timeout: 20_000 });
}

test('when the match ends everybody lands back in the room lobby, connection kept', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await startMatch(page, `ws://127.0.0.1:${server.port}`);
  await page.waitForFunction(() => (window as unknown as Win).__GAME__.scene().includes('netlobby'), undefined, { timeout: 60_000 });
  const state = await page.evaluate(() => {
    const lobby = (window as unknown as Win).__GAME__.game.scene.getScene('netlobby') as unknown as { phase: string; client: { online: boolean; room: { state: string; peers: { claims: unknown[] }[] } } };
    return { phase: lobby.phase, online: lobby.client.online, room: lobby.client.room.state, claims: lobby.client.room.peers[0].claims.filter(Boolean).length };
  });
  expect(state).toEqual({ phase: 'room', online: true, room: 'lobby', claims: 1 });
  await page.screenshot({ path: 'tests/e2e/screenshots/netend-lobby.png' });
  expect(errors).toEqual([]);
});

test('LEAVE GAME in the pause menu leaves the room and returns to the title', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await startMatch(page, `ws://127.0.0.1:${server.port}`);
  await page.waitForTimeout(800);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  // RESUME, SETTINGS, CONTROLS, LEAVE GAME (no RESTART online)
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(80);
  }
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => (window as unknown as Win).__GAME__.scene().includes('title'), undefined, { timeout: 10_000 });
  expect(errors).toEqual([]);
});
