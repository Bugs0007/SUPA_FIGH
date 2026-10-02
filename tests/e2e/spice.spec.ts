import { expect, test, type Page } from '@playwright/test';

type MS = { replay: { ready: boolean } | null; match: { round: number; phase: string } };
const ms = (page: Page) => page.evaluate(() => {
  const s = (window as unknown as { __GAME__: { game: { scene: { getScene: (k: string) => MS } } } }).__GAME__.game.scene.getScene('match');
  return { replay: !!s.replay, ready: !!s.replay?.ready, round: s.match.round, phase: s.match.phase };
});

test('a round-ending kill plays an instant replay, then the match continues', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/?scene=match&timer=1&humans=0&bots=2&diff=expert&mods=glassJaw&seed=8&map=test');
  await page.waitForFunction(
    () => {
      const s = (window as unknown as { __GAME__?: { game: { scene: { getScene: (k: string) => MS | null } } } }).__GAME__?.game.scene.getScene('match');
      return !!s?.replay?.ready;
    },
    null,
    { timeout: 150_000 },
  );
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'tests/e2e/screenshots/replay.png' });
  // skip it
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => {
    const s = (window as unknown as { __GAME__: { game: { scene: { getScene: (k: string) => MS } } } }).__GAME__.game.scene.getScene('match');
    return !s.replay && s.match.round >= 2;
  }, null, { timeout: 30_000 });
  const st = await ms(page);
  expect(st.replay).toBe(false);
  expect(errors).toEqual([]);
});

test('chaos cards and big heads render without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?scene=match&timer=1&humans=1&bots=3&chaos=1&mods=bigHeads&seed=12&map=casino');
  await page.waitForFunction(() => ((window as unknown as { __GAME__?: { match: () => { world: { tick: number } } | null } }).__GAME__?.match()?.world.tick ?? 0) > 150);
  await page.screenshot({ path: 'tests/e2e/screenshots/chaos.png' });
  expect(errors).toEqual([]);
});
