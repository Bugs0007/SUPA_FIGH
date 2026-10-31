import { expect, test, type Page } from '@playwright/test';
import { startServer, type RunningServer } from '../../server/server';
import type { Session } from '../../server/session';

// Two browsers (two contexts = two devices) go through the real screens: Title -> HOST GAME / JOIN GAME -> room lobby
// -> ready up -> start -> a match on the server, then a dropped connection that reconnects into the same fighter.

interface Scenes {
  getScene: (key: string) => Record<string, unknown> | null;
  getScenes: (active: boolean) => { scene: { key: string } }[];
}
type Win = { __GAME__: { game: { scene: Scenes }; scene: () => string[] } };

const room = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as Win).__GAME__.game.scene.getScene('netlobby') as { client?: { room: { code: string; host: string; config: { mapId: string; mode: string; bots: unknown[] }; peers: { name: string; ready: boolean; claims: unknown[] }[] } | null } } | null;
    return s?.client?.room ?? null;
  });
const scenes = (page: Page) => page.evaluate(() => (window as unknown as Win).__GAME__.scene());
const press = async (page: Page, key: string, times = 1) => {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key);
    await page.waitForTimeout(40);
  }
};

let server: RunningServer;
test.beforeAll(async () => {
  server = await startServer({ port: 0, host: '127.0.0.1', seed: 41, urls: ['http://192.168.1.50:8080'] });
});
test.afterAll(async () => {
  await server.close();
});

test('host and join through the menus, ready up, play, reconnect', async ({ browser }) => {
  const errors: string[] = [];
  const open = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`/?timer=1&server=ws://127.0.0.1:${server.port}`);
    await page.waitForFunction(() => (window as unknown as Win).__GAME__?.scene().includes('title'));
    return page;
  };
  const host = await open();
  const guest = await open();

  // HOST GAME is the 3rd button, JOIN GAME the 4th (focus starts on the button row)
  await press(host, 'ArrowRight', 2);
  await press(host, 'Enter');
  await host.waitForFunction(() => (window as unknown as Win).__GAME__.scene().includes('netlobby'));
  await expect.poll(async () => (await room(host))?.code, { timeout: 10_000 }).toMatch(/^[A-Z2-9]{4}$/);
  const code = (await room(host))!.code;

  await press(guest, 'ArrowRight', 3);
  await press(guest, 'Enter');
  await guest.waitForFunction(() => (window as unknown as Win).__GAME__.scene().includes('netlobby'));
  // the room list shows the host's room: Enter joins the first one
  await guest.waitForTimeout(600);
  await press(guest, 'Enter');
  await expect.poll(async () => (await room(guest))?.code, { timeout: 10_000 }).toBe(code);

  // both devices were given their first player automatically
  await expect.poll(async () => (await room(host))?.peers.map((p) => p.claims.filter(Boolean).length)).toEqual([1, 1]);
  await host.screenshot({ path: 'tests/e2e/screenshots/netlobby-host.png' });
  await guest.screenshot({ path: 'tests/e2e/screenshots/netlobby-guest.png' });

  // the host changes the map: the guest's lobby follows; two bots join in
  await press(host, 'ArrowRight');
  await expect.poll(async () => (await room(guest))?.config.mapId).not.toBe('test');
  await press(host, 'ArrowDown', 3); // MAP, MODE, LENGTH, BOTS
  await press(host, 'ArrowRight', 2);
  await expect.poll(async () => (await room(guest))?.config.bots.length).toBe(2);

  // the guest is not the host: pressing START-ish things does nothing, READY works; the host can then start
  await press(guest, 'ArrowDown', 4); // P1, F1, P2, F2 -> READY
  await press(guest, 'Enter');
  await expect.poll(async () => (await room(host))?.peers.find((p) => p.ready)).toBeTruthy();
  await press(host, 'ArrowDown', 11); // BOTS -> ... -> START MATCH (row 14 of 15)
  await host.screenshot({ path: 'tests/e2e/screenshots/netlobby-ready.png' });
  await press(host, 'Enter');

  for (const page of [host, guest]) await page.waitForFunction(() => (window as unknown as Win).__GAME__.scene().includes('match'), undefined, { timeout: 20_000 });
  const live = [...server.hub.rooms.values()][0].session as Session;
  expect(live.match.world.fighters.length).toBeGreaterThanOrEqual(4);
  await guest.waitForTimeout(1000);

  // the guest's keyboard moves the guest's fighter (the second human: fighter 1)
  const x0 = live.match.world.fighters[1].x;
  await guest.keyboard.down('KeyD');
  await guest.waitForTimeout(700);
  await guest.keyboard.up('KeyD');
  expect(Math.abs(live.match.world.fighters[1].x - x0)).toBeGreaterThan(15);
  await guest.screenshot({ path: 'tests/e2e/screenshots/netlobby-match.png' });

  // the guest's connection drops: it reconnects by itself into the same fighter and keeps playing
  const tickOf = (page: Page) => page.evaluate(() => ((window as unknown as Win).__GAME__.game.scene.getScene('match') as unknown as { match: { world: { tick: number } } }).match.world.tick);
  await guest.evaluate(() => {
    const m = (window as unknown as Win).__GAME__.game.scene.getScene('match') as unknown as { net: { client: { socket: { close: () => void } } } };
    m.net.client.socket.close();
  });
  await expect
    .poll(async () => (await guest.evaluate(() => ((window as unknown as Win).__GAME__.game.scene.getScene('match') as unknown as { net: { client: { state: string } } }).net.client.state)), { timeout: 10_000 })
    .toBe('online');
  const t1 = await tickOf(guest);
  await guest.waitForTimeout(800);
  expect(await tickOf(guest)).toBeGreaterThan(t1 + 20);
  expect(await scenes(guest)).toContain('match');

  expect(errors).toEqual([]);
});

test("a server that isn't there shows the can't-connect screen, and retry works once it is", async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?timer=1&server=ws://127.0.0.1:9');
  await page.waitForFunction(() => (window as unknown as Win).__GAME__?.scene().includes('title'));
  await press(page, 'ArrowRight', 3);
  await press(page, 'Enter');
  await page.waitForFunction(() => (window as unknown as Win).__GAME__.scene().includes('netlobby'));
  await expect
    .poll(async () => page.evaluate(() => ((window as unknown as Win).__GAME__.game.scene.getScene('netlobby') as unknown as { phase: string }).phase), { timeout: 15_000 })
    .toBe('error');
  await page.screenshot({ path: 'tests/e2e/screenshots/netlobby-error.png' });
  await press(page, 'Escape');
  await page.waitForFunction(() => (window as unknown as Win).__GAME__.scene().includes('title'));
  expect(errors).toEqual([]);
});
