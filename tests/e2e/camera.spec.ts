import { expect, test, type Page } from '@playwright/test';

// The shared camera must keep every human player on screen, whatever the bots do (D52).

type Handle = {
  game: { scene: { getScene: (k: string) => { cameras: { main: { worldView: { x: number; y: number; right: number; bottom: number } } } } } };
  match: () => { world: { tick: number; map: { pxW: number; pxH: number }; fighters: { x: number; y: number; px: number; py: number; vx: number; vy: number; alive: boolean; isBot: boolean; invuln: number; grounded: boolean }[] } } | null;
};

const ticksPast = (page: Page, n: number) =>
  page.waitForFunction((t) => ((window as unknown as { __GAME__?: Handle }).__GAME__?.match()?.world.tick ?? 0) > t, n);

/** For each living human: is the whole body inside the camera view? */
const humansInView = (page: Page) =>
  page.evaluate(() => {
    const g = (window as unknown as { __GAME__: Handle }).__GAME__;
    const v = g.game.scene.getScene('match').cameras.main.worldView;
    return g
      .match()!
      .world.fighters.filter((f) => !f.isBot && f.alive)
      .map((f) => f.x >= v.x && f.x <= v.right && f.y - 22 >= v.y && f.y <= v.bottom);
  });

for (const map of ['train', 'docks', 'construction', 'office']) {
  test(`both players stay on screen at opposite ends of ${map}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`/?scene=match&map=${map}&bots=6&diff=hard&timer=1&seed=11&powers=0`);
    await ticksPast(page, 30);
    // teleport P1 to the far left and P2 to the far right, near the floor of the open map
    await page.evaluate(() => {
      const w = (window as unknown as { __GAME__: Handle }).__GAME__.match()!.world;
      const [a, b] = w.fighters;
      for (const f of [a, b]) {
        f.invuln = 99;
        f.vx = f.vy = 0;
      }
      a.x = a.px = 40;
      b.x = b.px = w.map.pxW - 40;
      a.y = a.py = 40;
      b.y = b.py = 40;
    });
    let samples = 0;
    let misses = 0;
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(100);
      const seen = await humansInView(page);
      samples += seen.length;
      misses += seen.filter((s) => !s).length;
    }
    expect(samples).toBeGreaterThan(20);
    expect(misses).toBe(0);
    expect(errors).toEqual([]);
  });
}
