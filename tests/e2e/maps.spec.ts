import { expect, test } from '@playwright/test';

// Every themed map loads in the real renderer (backgrounds, gimmicks, bots) without console errors.
const MAPS = ['rooftops', 'train', 'factory', 'construction', 'casino', 'docks', 'office', 'lab', 'mine'];

for (const id of MAPS) {
  test(`map ${id} runs with bots`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto(`/?scene=match&timer=1&humans=0&bots=6&seed=3&map=${id}&speed=2`);
    await page.waitForFunction(() => ((window as unknown as { __GAME__?: { match: () => { world: { tick: number } } | null } }).__GAME__?.match()?.world.tick ?? 0) > 240, null, {
      timeout: 60_000,
    });
    await page.screenshot({ path: `tests/e2e/screenshots/map-${id}.png` });
    expect(errors).toEqual([]);
  });
}
