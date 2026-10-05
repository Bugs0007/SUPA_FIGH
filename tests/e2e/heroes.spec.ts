import { expect, test, type Page } from '@playwright/test';

// M11: each hero through the real input path: eat power orbs one by one (each is the next form: look +
// aura change) -> ability 2 on the kick key -> the super with both ability keys -> the form expires and
// normal weapons work again. No console errors.

/* eslint-disable @typescript-eslint/no-explicit-any */
const G = 'window.__GAME__';

const HEROES = [
  { hero: 'naruto', second: 'clone' },
  { hero: 'luffy', second: 'gatling' },
  { hero: 'goku', second: 'beam' },
];

const tick = (page: Page) => page.evaluate(`${G}.match()?.world.tick ?? -1`) as Promise<number>;

async function waitTicks(page: Page, n: number): Promise<void> {
  const t0 = await tick(page);
  await page.waitForFunction((t) => ((window as any).__GAME__.match()?.world.tick ?? 0) >= t, t0 + n, { timeout: 30_000 });
}

/** Hold keys for a number of sim ticks (wall-clock independent). */
async function press(page: Page, codes: string[], ticks = 3): Promise<void> {
  for (const c of codes) await page.keyboard.down(c);
  await waitTicks(page, ticks);
  for (const c of codes) await page.keyboard.up(c);
}

for (const h of HEROES) {
  test(`hero ${h.hero}: orbs raise the form, ability 2, super, expiry`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto(`/?scene=match&timer=1&humans=1&bots=1&diff=easy&seed=7&powers=0&map=test&heroes=${h.hero}`);
    await page.waitForFunction(() => ((window as any).__GAME__?.match()?.world.tick ?? 0) > 40, null, { timeout: 60_000 });

    // record what the sim does between frames
    await page.evaluate(() => {
      const rec = { clones: 0, beam: 0, second: 0, sup: 0 };
      (window as any).__REC__ = rec;
      setInterval(() => {
        const w = (window as any).__GAME__.match()?.world;
        if (!w) return;
        const f = w.fighters[0];
        rec.clones = Math.max(rec.clones, w.clones.filter((c: any) => c.active).length);
        rec.beam = Math.max(rec.beam, f.beamWidth);
        rec.second = Math.max(rec.second, f.secondCd);
        rec.sup = Math.max(rec.sup, f.specialCd);
      }, 5);
    });
    // keep the sparring bot far away; P1 has a pistol for later
    await page.evaluate(() => {
      const w = (window as any).__GAME__.match().world;
      const [f, b] = w.fighters;
      b.x = b.px = f.x + (f.x < 300 ? 300 : -300);
      b.y = b.py = f.y;
      b.invuln = 999;
      f.inv[1] = { id: 'pistol', ammo: 6, dur: 1 };
      f.active = 0;
    });
    // three orbs, one at a time: the form level goes 1, 2, 3 and the look changes
    for (let level = 1; level <= 3; level++) {
      await page.evaluate(() => {
        const w = (window as any).__GAME__.match().world;
        const f = w.fighters[0];
        w.spawnWeapon('powerorb', f.x, f.y - 2);
      });
      await page.waitForFunction((l) => (window as any).__GAME__.match().world.fighters[0].powerLevel === l, level, { timeout: 20_000 });
      await waitTicks(page, 4);
      expect(await page.evaluate(`${G}.game.scene.getScene('match').wr.views[0].showsPowered`)).toBe(true);
    }
    await page.screenshot({ path: `tests/e2e/screenshots/hero-${h.hero}-form3.png` });

    // face the empty side, then ability 2 on the kick key (H) and the super on both keys (B + H)
    await page.evaluate(() => ((window as any).__GAME__.match().world.fighters[0].facing = 1));
    await press(page, ['KeyH'], h.hero === 'goku' ? 40 : 3);
    await waitTicks(page, 100);
    const rec = await page.evaluate(() => (window as any).__REC__);
    expect(rec.second, 'ability 2 went on cooldown').toBeGreaterThan(1);
    if (h.second === 'clone') expect(rec.clones).toBeGreaterThanOrEqual(2);
    else if (h.second === 'beam') expect(rec.beam).toBeGreaterThan(2);
    await press(page, ['KeyB', 'KeyH'], 4);
    await waitTicks(page, 30);
    expect(await page.evaluate(() => (window as any).__REC__.sup), 'the super went on cooldown').toBeGreaterThan(4);
    await page.screenshot({ path: `tests/e2e/screenshots/hero-${h.hero}-super.png` });

    // the form health runs out; guns work again
    await page.evaluate(() => ((window as any).__GAME__.match().world.fighters[0].formHp = 0));
    await page.waitForFunction(() => (window as any).__GAME__.match().world.fighters[0].power === '', null, { timeout: 20_000 });
    await waitTicks(page, 60);
    expect(await page.evaluate(`${G}.game.scene.getScene('match').wr.views[0].showsPowered`)).toBe(false);
    await page.evaluate(() => {
      const f = (window as any).__GAME__.match().world.fighters[0];
      f.state = 'normal';
      f.active = 1;
    });
    await press(page, ['KeyF'], 3);
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
