import { expect, test } from '@playwright/test';

// Every non-Brawl mode boots in the real game with a human and bots, without console errors.
for (const mode of ['koth', 'juggernaut', 'gungame', 'coop']) {
  test(`mode ${mode} runs`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto(`/?scene=match&timer=1&humans=1&bots=5&mode=${mode}&seed=4&map=factory&speed=2`);
    await page.waitForFunction(() => ((window as unknown as { __GAME__?: { match: () => { world: { tick: number } } | null } }).__GAME__?.match()?.world.tick ?? 0) > 400, null, {
      timeout: 60_000,
    });
    await page.screenshot({ path: `tests/e2e/screenshots/mode-${mode}.png` });
    expect(errors).toEqual([]);
  });
}
