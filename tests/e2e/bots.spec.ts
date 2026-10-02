import { expect, test, type Page } from '@playwright/test';

// Bot-only match through the real game loop at 4x: rounds must finish and no living bot may stay
// parked in one spot for long while it's trying to travel.

interface F {
  x: number;
  y: number;
  alive: boolean;
  state: string;
}
type Handle = { match: () => { round: number; phase: string; world: { tick: number; fighters: F[] } } | null; scene: () => string[] };

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

test('8 bots finish rounds at 4x without getting stuck', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await page.goto('/?scene=match&timer=1&humans=0&bots=8&speed=4&seed=5&diff=hard');
  await page.waitForFunction(() => ((window as unknown as { __GAME__?: Handle }).__GAME__?.match()?.world.tick ?? 0) > 30);

  // sample positions; a bot that hasn't moved 12 px in 8 s of sim time (while alive, standing) is stuck
  const last = new Map<number, { x: number; y: number; tick: number }>();
  let worst = 0;
  for (let i = 0; i < 400; i++) {
    const snap = await page.evaluate(() => {
      const m = (window as unknown as { __GAME__: Handle }).__GAME__.match()!;
      return { round: m.round, tick: m.world.tick, fighters: m.world.fighters.map((f) => ({ x: f.x, y: f.y, alive: f.alive, state: f.state })) };
    });
    if (snap.round >= 3) break;
    snap.fighters.forEach((f, id) => {
      const l = last.get(id);
      if (!f.alive || !l || Math.hypot(f.x - l.x, f.y - l.y) > 12 || snap.tick < l.tick) last.set(id, { x: f.x, y: f.y, tick: snap.tick });
      else worst = Math.max(worst, (snap.tick - l.tick) / 60);
    });
    await page.waitForTimeout(250);
  }
  const round = await page.evaluate(() => (window as unknown as { __GAME__: Handle }).__GAME__.match()!.round);
  expect(round).toBeGreaterThanOrEqual(3);
  expect(worst).toBeLessThan(12);
  await page.screenshot({ path: 'tests/e2e/screenshots/bots.png' });
  expect(errors).toEqual([]);
});
