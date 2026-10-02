import { expect, test, type Page } from '@playwright/test';

interface GameHandle {
  match: () => {
    round: number;
    phase: string;
    world: { tick: number; fighters: { alive: boolean; hp: number; x: number; y: number; state: string }[] };
  } | null;
  scene: () => string[];
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

const tick = (page: Page) => page.evaluate(() => (window as unknown as { __GAME__: GameHandle }).__GAME__.match()?.world.tick ?? -1);

test('title screen boots without errors', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?timer=1');
  await page.waitForFunction(() => (window as unknown as { __GAME__?: GameHandle }).__GAME__?.scene().includes('title'));
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tests/e2e/screenshots/title.png' });
  expect(errors).toEqual([]);
});

test('a match runs, fighters take damage, keyboard drives P1', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?scene=match&timer=1&bots=4&seed=11&speed=4');
  await page.waitForFunction(() => ((window as unknown as { __GAME__?: GameHandle }).__GAME__?.match()?.world.tick ?? 0) > 30);

  // P1 walks right with the real keyboard
  const x0 = await page.evaluate(() => (window as unknown as { __GAME__: GameHandle }).__GAME__.match()!.world.fighters[0].x);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyD');
  const x1 = await page.evaluate(() => (window as unknown as { __GAME__: GameHandle }).__GAME__.match()!.world.fighters[0].x);
  expect(Math.abs(x1 - x0)).toBeGreaterThan(20);

  // let the dummies brawl at 4x for 600+ ticks (wall-clock time varies a lot with the GPU:
  // software-rendered headless browsers only manage ~25 fps)
  const t0 = await tick(page);
  await page.waitForFunction(
    (start) => ((window as unknown as { __GAME__: GameHandle }).__GAME__.match()?.world.tick ?? 0) > start + 600,
    t0,
    { timeout: 45_000 },
  );
  const hurt = await page.evaluate(() =>
    (window as unknown as { __GAME__: GameHandle }).__GAME__.match()!.world.fighters.some((f) => !f.alive || f.hp < 100),
  );
  expect(hurt).toBe(true);
  await page.screenshot({ path: 'tests/e2e/screenshots/match.png' });
  expect(errors).toEqual([]);
});

test('title -> match via Enter', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?timer=1');
  await page.waitForFunction(() => (window as unknown as { __GAME__?: GameHandle }).__GAME__?.scene().includes('title'));
  await page.keyboard.press('Digit2');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => ((window as unknown as { __GAME__?: GameHandle }).__GAME__?.match()?.world.tick ?? 0) > 10);
  const n = await page.evaluate(() => (window as unknown as { __GAME__: GameHandle }).__GAME__.match()!.world.fighters.length);
  expect(n).toBe(4);
  expect(errors).toEqual([]);
});
