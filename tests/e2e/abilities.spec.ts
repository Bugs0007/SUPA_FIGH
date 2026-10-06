import { expect, test, type Page } from '@playwright/test';

// Real keyboard path: W/Up jumps, double-tap Down drops, hero base abilities (D50, D51).

/* eslint-disable @typescript-eslint/no-explicit-any */
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

/** Wait for sim ticks (not wall-clock time: software-rendered browsers only manage ~25 fps). 1 s = 60 ticks. */
async function wait(page: Page, ms: number): Promise<void> {
  const t0 = await page.evaluate(() => (window as unknown as { __GAME__: Handle }).__GAME__.match()!.world.tick);
  await page.waitForFunction((t) => ((window as unknown as { __GAME__: Handle }).__GAME__.match()?.world.tick ?? 0) >= t, t0 + Math.max(1, Math.round(ms * 0.06)), { timeout: 60_000 });
}

async function hold(page: Page, key: string, ms: number): Promise<void> {
  await page.keyboard.down(key);
  await wait(page, ms);
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
  await wait(page, 300);
  let top = Infinity;
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 8; i++) {
    await wait(page, 40);
    top = Math.min(top, (await fighter(page, 0)).y);
  }
  await page.keyboard.up('KeyW');
  expect(27 * 16 - top).toBeGreaterThan(30);
  // land, then stand on the catwalk and double-tap S
  await wait(page, 700);
  await put(page, 0, 27 * 16, 14 * 16);
  await wait(page, 300);
  expect((await fighter(page, 0)).y).toBe(14 * 16);
  await hold(page, 'KeyS', 60);
  await wait(page, 60);
  await hold(page, 'KeyS', 60);
  await wait(page, 500);
  expect((await fighter(page, 0)).y).toBeGreaterThan(14 * 16 + 20);
  expect(errors).toEqual([]);
});

test('Goku teleports with B (instant transmission); flight is a final-form thing: hold W in the air', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, 'bots=0&humans=2&heroes=goku,naruto');
  await put(page, 0, 6 * 16 + 8, 27 * 16);
  await wait(page, 300);
  const x0 = (await fighter(page, 0)).x;
  await page.keyboard.down('KeyD');
  await page.keyboard.down('KeyB');
  await wait(page, 80);
  await page.keyboard.up('KeyB');
  await wait(page, 150);
  await page.keyboard.up('KeyD');
  let f = await fighter(page, 0);
  expect(f.x - x0).toBeGreaterThan(80); // jumped ahead
  expect(f.flying).toBe(false);
  // base form: holding W is just a jump
  await wait(page, 800);
  await hold(page, 'KeyW', 500);
  expect((await fighter(page, 0)).flying).toBe(false);
  await wait(page, 800);
  // final form (4 orbs): jump, then hold W past the top of the jump = flight
  await page.evaluate(() => {
    const f = (window as any).__GAME__.match().world.fighters[0];
    f.power = 'hero';
    f.powerLevel = 4;
    f.formHp = 120;
  });
  await put(page, 0, 6 * 16 + 8, 27 * 16);
  await wait(page, 200);
  await page.keyboard.down('KeyW');
  await wait(page, 900);
  f = await fighter(page, 0);
  expect(f.flying).toBe(true);
  expect(f.y).toBeLessThan(27 * 16 - 60);
  await page.screenshot({ path: 'tests/e2e/screenshots/goku-flight.png' });
  await page.keyboard.up('KeyW');
  await wait(page, 1500);
  f = await fighter(page, 0);
  expect(f.flying).toBe(false);
  expect(errors).toEqual([]);
});

test('Naruto walks up a wall (D + W against it)', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, 'bots=0&humans=2&heroes=naruto,goku');
  await put(page, 0, 55 * 16 - 6, 27 * 16);
  await wait(page, 300);
  await page.keyboard.down('KeyD');
  await page.keyboard.down('KeyW');
  await wait(page, 700);
  const f = await fighter(page, 0);
  expect(f.state).toBe('wallwalk');
  expect(f.y).toBeLessThan(27 * 16 - 60);
  await page.screenshot({ path: 'tests/e2e/screenshots/naruto-wallwalk.png' });
  await page.keyboard.up('KeyW');
  await page.keyboard.up('KeyD');
  await wait(page, 1500);
  expect((await fighter(page, 0)).state).not.toBe('wallwalk');
  expect(errors).toEqual([]);
});

test("Luffy's Gum-Gum Pistol grabs the platform above (P2: Up + ability held) and pulls him onto it", async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, 'bots=0&humans=2&heroes=naruto,luffy');
  // the long catwalk at row 20 (y = 320) with open floor below it
  await put(page, 1, 12 * 16 + 8, 27 * 16);
  await wait(page, 300);
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('Numpad1');
  await wait(page, 700);
  await page.keyboard.up('Numpad1');
  await page.keyboard.up('ArrowUp');
  await wait(page, 600);
  const f = await fighter(page, 1);
  expect(f.y).toBeLessThan(21 * 16);
  expect(f.grounded).toBe(true);
  expect(errors).toEqual([]);
});

test("P2's Naruto hits a bot with the Rasengan (P2 ability key)", async ({ page }) => {
  const errors = collectErrors(page);
  await start(page, 'bots=1&diff=easy&humans=2&heroes=goku,naruto');
  // P2 on open floor facing right, the bot right in front of him
  await put(page, 1, 4 * 16, 27 * 16, 1);
  await put(page, 2, 4 * 16 + 50, 27 * 16, -1);
  await wait(page, 100);
  const before = (await fighter(page, 2)).hp;
  await put(page, 2, 4 * 16 + 50, 27 * 16, -1);
  await hold(page, 'KeyP', 60); // P2 laptop ability key
  await wait(page, 700);
  const after = (await fighter(page, 2)).hp;
  expect(after).toBeLessThan(before);
  expect(errors).toEqual([]);
});
