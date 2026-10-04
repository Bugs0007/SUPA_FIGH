import { expect, test, type Page } from '@playwright/test';

// Real keyboard path: W/Up jumps, double-tap Down drops, hero base abilities (D50, D51).

type F = { x: number; y: number; px: number; py: number; vx: number; vy: number; hp: number; maxHp: number; invuln: number; flying: boolean; grounded: boolean; state: string; facing: number };
type Handle = { match: () => { world: { tick: number; fighters: F[] } } | null };

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

const fighter = (page: Page, i: number) => page.evaluate((n) => (window as unknown as { __GAME__: Handle }).__GAME__.match()!.world.fighters[n], i);

/** Teleport a fighter (feet position, px). */
const put = (page: Page, i: number, x: number, y: number, facing = 1) =>
  page.evaluate(
    ([n, px, py, fc]) => {
      const f = (window as unknown as { __GAME__: Handle }).__GAME__.match()!.world.fighters[n];
      f.x = f.px = px;
      f.y = f.py = py;
      f.vx = f.vy = 0;
      f.facing = fc;
      f.invuln = 0;
    },
    [i, x, y, facing] as const,
  );

async function hold(page: Page, key: string, ms: number): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

async function start(page: Page, query: string): Promise<void> {
  await page.goto(`/?scene=match&map=test&powers=0&timer=1&seed=5&${query}`);
  await page.waitForFunction(() => ((window as unknown as { __GAME__?: Handle }).__GAME__?.match()?.world.tick ?? 0) > 50);
}

test('W jumps (and double jumps), double-tap S drops through a platform', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, 'bots=0&humans=2');
  await put(page, 0, 6 * 16 + 8, 27 * 16);
  await page.waitForTimeout(300);
  let top = Infinity;
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(40);
    top = Math.min(top, (await fighter(page, 0)).y);
  }
  await page.keyboard.up('KeyW');
  expect(27 * 16 - top).toBeGreaterThan(30);
  // land, then stand on the catwalk and double-tap S
  await page.waitForTimeout(700);
  await put(page, 0, 27 * 16, 14 * 16);
  await page.waitForTimeout(300);
  expect((await fighter(page, 0)).y).toBe(14 * 16);
  await hold(page, 'KeyS', 60);
  await page.waitForTimeout(60);
  await hold(page, 'KeyS', 60);
  await page.waitForTimeout(500);
  expect((await fighter(page, 0)).y).toBeGreaterThan(14 * 16 + 20);
  expect(errors).toEqual([]);
});

test('Goku levitates with B and flies with WASD; S down to the floor lands', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, 'bots=0&humans=2&heroes=goku,naruto');
  await put(page, 0, 6 * 16 + 8, 27 * 16);
  await page.waitForTimeout(300);
  await hold(page, 'KeyB', 60);
  await page.waitForTimeout(300);
  let f = await fighter(page, 0);
  expect(f.flying).toBe(true);
  const y0 = f.y;
  await hold(page, 'KeyW', 300);
  f = await fighter(page, 0);
  expect(f.y).toBeLessThan(y0 - 15);
  expect(f.flying).toBe(true);
  const x0 = f.x;
  await hold(page, 'KeyA', 250);
  f = await fighter(page, 0);
  expect(f.x).toBeLessThan(x0 - 10);
  // hovering: no fall
  const y1 = f.y;
  await page.waitForTimeout(400);
  f = await fighter(page, 0);
  expect(Math.abs(f.y - y1)).toBeLessThan(8);
  await hold(page, 'KeyS', 1200);
  await page.waitForTimeout(200);
  f = await fighter(page, 0);
  expect(f.flying).toBe(false);
  expect(f.grounded).toBe(true);
  await page.screenshot({ path: 'tests/e2e/screenshots/goku-flight.png' });
  expect(errors).toEqual([]);
});

test("P2's Naruto hits a bot with the Rasengan (P2 ability key)", async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, 'bots=1&diff=easy&humans=2&heroes=goku,naruto');
  // P2 on open floor facing right, the bot right in front of him
  await put(page, 1, 4 * 16, 27 * 16, 1);
  await put(page, 2, 4 * 16 + 50, 27 * 16, -1);
  await page.waitForTimeout(100);
  const before = (await fighter(page, 2)).hp;
  await put(page, 2, 4 * 16 + 50, 27 * 16, -1);
  await hold(page, 'KeyP', 60); // P2 laptop ability key
  await page.waitForTimeout(700);
  const after = (await fighter(page, 2)).hp;
  expect(after).toBeLessThan(before);
  expect(errors).toEqual([]);
});
