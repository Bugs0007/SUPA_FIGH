import { expect, test, type Page } from '@playwright/test';

// Main menu: player names, fighter (hero) choice and map choice flow into the quick match.

type Handle = {
  match: () => { cfg: { mapId: string }; world: { tick: number; fighters: { name: string; hero: string; isBot: boolean }[] } } | null;
  scene: () => string[];
  game: { scene: { getScene: (k: string) => { players: { label: string }[] } } };
};

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

const onScene = (page: Page, key: string) =>
  page.waitForFunction((k) => (window as unknown as { __GAME__?: Handle }).__GAME__?.scene().includes(k), key);

async function press(page: Page, key: string, times = 1): Promise<void> {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key);
    await page.waitForTimeout(50);
  }
}

test('name, fighter and map from the title screen are used by quick match', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?timer=1');
  await onScene(page, 'title');
  await page.waitForTimeout(200);
  // focus starts on QUICK MATCH; up x8 = P1 NAME
  await press(page, 'ArrowUp', 8);
  await press(page, 'Enter');
  await page.keyboard.type('bhagath');
  await press(page, 'Enter');
  // P1 FIGHTER: SCRAPPER -> NARUTO -> LUFFY -> GOKU
  await press(page, 'ArrowDown');
  await press(page, 'ArrowRight', 3);
  // P2 NAME: type, then cancel with Esc (keeps "P2")
  await press(page, 'ArrowDown');
  await press(page, 'Enter');
  await page.keyboard.type('nope');
  await press(page, 'Escape');
  // P2 FIGHTER: NARUTO
  await press(page, 'ArrowDown');
  await press(page, 'ArrowRight');
  // MAP: RANDOM is first, TEST ARENA is the default; right x2 = NIGHT TRAIN
  await press(page, 'ArrowDown');
  await press(page, 'ArrowRight', 2);
  // BOTS: 1
  await press(page, 'ArrowDown', 2);
  await press(page, 'Digit1');
  await page.screenshot({ path: 'tests/e2e/screenshots/title-setup.png' });
  // down to the buttons, QUICK MATCH
  await press(page, 'ArrowDown', 2);
  await press(page, 'Enter');
  await page.waitForFunction(() => ((window as unknown as { __GAME__?: Handle }).__GAME__?.match()?.world.tick ?? 0) > 10);
  const info = await page.evaluate(() => {
    const g = (window as unknown as { __GAME__: Handle }).__GAME__;
    const m = g.match()!;
    return { map: m.cfg.mapId, fighters: m.world.fighters.map((f) => ({ name: f.name, hero: f.hero, bot: f.isBot })) };
  });
  expect(info.map).toBe('train');
  expect(info.fighters).toEqual([
    { name: 'BHAGATH', hero: 'goku', bot: false },
    { name: 'P2', hero: 'naruto', bot: false },
    { name: 'BOT 1', hero: '', bot: true },
  ]);
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'tests/e2e/screenshots/title-quickmatch.png' });

  // profiles persist: back on the title the card still says BHAGATH / GOKU, and the lobby's
  // KEYBOARD 1 slot uses the same fighter
  await page.goto('/?timer=1');
  await onScene(page, 'title');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('scrapyard.profiles') ?? '[]'));
  expect(stored[0].name).toBe('BHAGATH');
  expect(stored[0].hero).toBe('goku');
  const lobby = await page.evaluate(() => JSON.parse(localStorage.getItem('scrapyard.lobby') ?? '{}'));
  expect(lobby.slots?.[0]?.hero).toBe('goku');
  expect(errors).toEqual([]);
});

test('quick match refuses to start with fewer than 2 fighters', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?timer=1');
  await onScene(page, 'title');
  await page.waitForTimeout(200);
  await press(page, 'ArrowUp', 3); // PLAYERS (buttons -> skill -> bots -> players)
  await press(page, 'ArrowRight'); // 2 -> 1
  await press(page, 'Digit0'); // no bots
  await press(page, 'ArrowDown', 3); // buttons
  await press(page, 'Enter');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as unknown as { __GAME__: Handle }).__GAME__.scene())).toContain('title');
  await press(page, 'Digit2');
  await press(page, 'Enter');
  await page.waitForFunction(() => ((window as unknown as { __GAME__?: Handle }).__GAME__?.match()?.world.tick ?? 0) > 5);
  const n = await page.evaluate(() => (window as unknown as { __GAME__: Handle }).__GAME__.match()!.world.fighters.filter((f) => !f.isBot).length);
  expect(n).toBe(1);
  expect(errors).toEqual([]);
});
