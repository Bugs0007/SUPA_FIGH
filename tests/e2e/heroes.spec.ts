import { expect, test, type Page } from '@playwright/test';

// M9: each hero through the real input path: pick up its power-up → transformed look + aura →
// powered melee combo (Naruto: shadow clones) → ABILITY special → the power expires and normal
// weapons work again. No console errors.

/* eslint-disable @typescript-eslint/no-explicit-any */
const G = 'window.__GAME__';

const HEROES = [
  { hero: 'naruto', power: 'kurama', item: 'chakrascroll', holdTicks: 3 },
  { hero: 'luffy', power: 'gear2', item: 'strawtoken', holdTicks: 3 },
  { hero: 'goku', power: 'ssj', item: 'energycore', holdTicks: 45 },
];

const tick = (page: Page) => page.evaluate(`${G}.match()?.world.tick ?? -1`) as Promise<number>;

async function waitTicks(page: Page, n: number): Promise<void> {
  const t0 = await tick(page);
  await page.waitForFunction((t) => ((window as any).__GAME__.match()?.world.tick ?? 0) >= t, t0 + n, { timeout: 30_000 });
}

/** Hold a key for a number of sim ticks (wall-clock independent). */
async function press(page: Page, code: string, ticks = 3): Promise<void> {
  await page.keyboard.down(code);
  await waitTicks(page, ticks);
  await page.keyboard.up(code);
}

for (const h of HEROES) {
  test(`hero ${h.hero}: power-up, combo, special, expiry`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto(`/?scene=match&timer=1&humans=1&bots=1&diff=easy&seed=7&powers=0&map=test&heroes=${h.hero}`);
    await page.waitForFunction(() => ((window as any).__GAME__?.match()?.world.tick ?? 0) > 40, null, { timeout: 60_000 });

    // record what happens between frames (clones, specials, combo steps)
    await page.evaluate(() => {
      const rec = { clones: 0, chakra: 0, ki: 0, stretch: 0, combo: 0 };
      (window as any).__REC__ = rec;
      setInterval(() => {
        const w = (window as any).__GAME__.match()?.world;
        if (!w) return;
        const f = w.fighters[0];
        rec.clones = Math.max(rec.clones, w.clones.filter((c: any) => c.active).length);
        rec.chakra += w.bullets.some((b: any) => b.active && b.kind === 'chakra') ? 1 : 0;
        rec.ki += w.bullets.some((b: any) => b.active && b.kind === 'ki') ? 1 : 0;
        rec.stretch = Math.max(rec.stretch, f.stretchLen);
        if (f.state === 'melee') rec.combo = Math.max(rec.combo, f.combo + 1);
      }, 5);
    });

    // keep the sparring bot out of the way, give P1 a pistol, drop the power-up on P1
    await page.evaluate(
      ({ item }) => {
        const w = (window as any).__GAME__.match().world;
        const [f, b] = w.fighters;
        b.x = b.px = f.x + (f.x < 300 ? 200 : -200);
        b.y = b.py = f.y;
        f.inv[1] = { id: 'pistol', ammo: 6, dur: 1 };
        f.active = 0;
        w.spawnWeapon(item, f.x, f.y - 2);
      },
      { item: h.item },
    );
    await page.waitForFunction((p) => (window as any).__GAME__.match().world.fighters[0].power === p, h.power, { timeout: 20_000 });
    expect(await page.evaluate(`${G}.match().world.fighters[0].powerFull`)).toBe(true);
    await waitTicks(page, 2);
    expect(await page.evaluate(`${G}.game.scene.getScene('match').wr.views[0].showsPowered`)).toBe(true);
    await page.screenshot({ path: `tests/e2e/screenshots/hero-${h.hero}-powered.png` });

    // powered fist combo through the keyboard
    for (let i = 0; i < 3; i++) {
      await press(page, 'KeyF', 3);
      await waitTicks(page, 7);
    }
    await waitTicks(page, 30);
    const rec1 = (await page.evaluate('window.__REC__')) as Record<string, number>;
    expect(rec1.combo).toBeGreaterThanOrEqual(2);
    if (h.hero === 'naruto') expect(rec1.clones).toBeGreaterThan(0);

    // special on the ABILITY key (Goku holds to charge a ki blast)
    await page.evaluate(() => {
      const f = (window as any).__GAME__.match().world.fighters[0];
      f.state = 'normal';
      f.specialCd = 0;
    });
    await press(page, 'KeyB', h.holdTicks);
    await waitTicks(page, 20);
    const rec2 = (await page.evaluate('window.__REC__')) as Record<string, number>;
    if (h.hero === 'naruto') expect(rec2.chakra).toBeGreaterThan(0);
    if (h.hero === 'luffy') expect(rec2.stretch).toBeGreaterThan(40);
    if (h.hero === 'goku') expect(rec2.ki).toBeGreaterThan(0);
    await page.screenshot({ path: `tests/e2e/screenshots/hero-${h.hero}-special.png` });

    // expiry: back to normal attacks; the pistol still works
    await page.evaluate(() => ((window as any).__GAME__.match().world.fighters[0].powerTime = 0.05));
    await page.waitForFunction(() => (window as any).__GAME__.match().world.fighters[0].power === '', null, { timeout: 20_000 });
    await waitTicks(page, 2);
    expect(await page.evaluate(`${G}.game.scene.getScene('match').wr.views[0].showsPowered`)).toBe(false);
    await page.evaluate(() => {
      const f = (window as any).__GAME__.match().world.fighters[0];
      f.state = 'normal';
      f.active = 1;
    });
    await press(page, 'KeyF', 3);
    await waitTicks(page, 20);
    expect(await page.evaluate(`${G}.match().world.fighters[0].inv[1]?.ammo ?? 0`)).toBeLessThan(6);
    expect(errors).toEqual([]);
  });
}

test('lobby → creator: pick a hero for slot 1 and start a match with it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?scene=creator&timer=1');
  await page.waitForFunction(() => (window as any).__GAME__?.scene().includes('creator'));
  await page.waitForTimeout(300);
  // HERO row is selected first: right ×3 = GOKU (scrapyard → naruto → luffy → goku)
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(120);
  }
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => (window as any).__GAME__.scene().includes('lobby'));
  const hero = await page.evaluate(() => JSON.parse(localStorage.getItem('scrapyard.lobby') ?? '{}')?.slots?.[0]?.hero);
  expect(hero).toBe('goku');
  expect(errors).toEqual([]);
});
