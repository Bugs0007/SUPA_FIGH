import { expect, test, type Page } from '@playwright/test';

// Main menu: player names, fighter (hero) choice and map choice flow into the quick match.

type Handle = {
  match: () => { cfg: { mapId: string }; world: { tick: number; fighters: { name: string; hero: string; isBot: boolean; master: number }[] } } | null;
  scene: () => string[];
  game: { scene: { getScene: (k: string) => { players: { label: string }[]; editing?: number | null; group?: string } } };
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

test('Sasuke and a new arena can be chosen from the title, including the full preview click targets', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?timer=1');
  await onScene(page, 'title');
  // The existing focus order is unchanged. P1 fighter is seven rows above the action buttons.
  await press(page, 'ArrowUp', 7);
  await press(page, 'ArrowRight', 4);
  // Browse backward through random and the two new indoor halls to Valley.
  for (let i = 0; i < 6; i++) {
    await page.mouse.click(200, 330);
    await page.waitForTimeout(80);
  }
  await page.screenshot({ path: 'tests/e2e/screenshots/title-sasuke-valley.png' });
  // The right side of the Quick Match button is clickable.
  await page.mouse.click(170, 640);
  await page.waitForFunction(() => ((window as unknown as { __GAME__?: Handle }).__GAME__?.match()?.world.tick ?? 0) > 10);
  const picked = await page.evaluate(() => {
    const m = (window as unknown as { __GAME__: Handle }).__GAME__.match()!;
    return { map: m.cfg.mapId, hero: m.world.fighters[0].hero };
  });
  expect(picked).toEqual({ map: 'valley', hero: 'sasuke' });
  expect(errors).toEqual([]);
});

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
  const doneEditing = () => page.waitForFunction(() => (window as unknown as { __GAME__: Handle }).__GAME__.game.scene.getScene('title').editing === null);
  await page.mouse.click(1060, 150); // P1 name
  await page.keyboard.type('bhagath');
  await press(page, 'Enter');
  await doneEditing();

  const pick = async (rowY: number, group: string, tabX: number) => {
    await page.mouse.click(1060, rowY);
    await onScene(page, 'fighters');
    await page.mouse.click(tabX, 84);
    await page.waitForFunction(group => (window as unknown as { __GAME__: Handle }).__GAME__.game.scene.getScene('fighters').group === group, group);
    await page.mouse.click(486, 275); // first fighter in a two-fighter category
    await onScene(page, 'title');
  };
  await pick(185, 'dragon-ball', 740); // P1: Goku

  await page.mouse.click(1060, 385); // P2 name, then cancel
  await page.keyboard.type('nope');
  await press(page, 'Escape');
  await doneEditing();
  await pick(420, 'naruto', 336); // P2: Naruto

  await page.mouse.click(600, 330); // Test Arena -> Rooftops
  await page.mouse.click(600, 330); // Rooftops -> Night Train
  await press(page, 'Digit1');
  await page.screenshot({ path: 'tests/e2e/screenshots/title-setup.png' });
  await page.mouse.click(80, 640); // Quick Match
  await page.waitForFunction(() => ((window as unknown as { __GAME__?: Handle }).__GAME__?.match()?.world.tick ?? 0) > 10);
  const info = await page.evaluate(() => {
    const g = (window as unknown as { __GAME__: Handle }).__GAME__;
    const m = g.match()!;
    // Naruto's reserved shadow-clone slots are effects of his moves, not menu roster entries.
    return { map: m.cfg.mapId, fighters: m.world.fighters.filter((f) => f.master < 0).map((f) => ({ name: f.name, hero: f.hero, bot: f.isBot })) };
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
