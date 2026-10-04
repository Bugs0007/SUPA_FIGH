import { expect, test, type Page } from '@playwright/test';

// Regression: scenes keep their instance between runs, so anything created in create() must be
// reset there. Re-entering a scene used to reuse destroyed BitmapTexts from the previous run
// ("Cannot read properties of null (reading 'chars')").

type Handle = {
  game: { scene: { getScene: (k: string) => { pauseAction?: (a: string) => void } } };
  match: () => { world: { tick: number } } | null;
  scene: () => string[];
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

const ticksPast = (page: Page, n: number) =>
  page.waitForFunction((t) => ((window as unknown as { __GAME__?: Handle }).__GAME__?.match()?.world.tick ?? 0) > t, n);

const pauseAction = (page: Page, a: string) =>
  page.evaluate((act) => (window as unknown as { __GAME__: Handle }).__GAME__.game.scene.getScene('match').pauseAction!(act), a);

async function press(page: Page, key: string, times = 1): Promise<void> {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key);
    await page.waitForTimeout(60);
  }
}

test('restart and re-enter a match several times without errors', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?scene=match&bots=3&timer=1');
  await ticksPast(page, 30);
  for (let i = 0; i < 3; i++) {
    await pauseAction(page, 'restart');
    await ticksPast(page, 30);
  }
  await pauseAction(page, 'quit');
  await onScene(page, 'title');
  await page.waitForTimeout(200);
  await press(page, 'Enter'); // quick match from the title
  await ticksPast(page, 30);
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});

test('re-enter title, lobby and creator without errors', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?timer=1');
  await onScene(page, 'title');
  for (let i = 0; i < 2; i++) {
    await press(page, 'KeyL');
    await onScene(page, 'lobby');
    await page.waitForTimeout(150);
    await press(page, 'Escape');
    await onScene(page, 'title');
    await page.waitForTimeout(150);
  }
  // lobby -> creator -> lobby -> creator -> lobby
  await press(page, 'KeyL');
  await onScene(page, 'lobby');
  await page.waitForTimeout(150);
  // change values after re-entering (unchanged text never touched the destroyed objects' fonts)
  await press(page, 'ArrowRight'); // TEAM column
  await press(page, 'Enter');
  await press(page, 'Enter', 4); // back to solo
  await press(page, 'ArrowLeft'); // KIND column
  await press(page, 'ArrowUp'); // last row (CONTROLS...) → setting rows change with left/right
  await press(page, 'ArrowUp', 9); // MAP row
  await press(page, 'ArrowRight');
  await press(page, 'ArrowLeft');
  await press(page, 'ArrowDown', 9);
  await press(page, 'ArrowDown'); // back to slot 1
  for (let i = 0; i < 2; i++) {
    await press(page, 'ArrowLeft'); // slot 1, LOOK column (columns wrap)
    await press(page, 'Enter');
    await onScene(page, 'creator');
    await page.waitForTimeout(150);
    await press(page, 'Escape');
    await onScene(page, 'lobby');
    await page.waitForTimeout(150);
  }
  expect(errors).toEqual([]);
});

test('restart from the pause menu starts unpaused', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?scene=match&bots=2&timer=1');
  await ticksPast(page, 20);
  await press(page, 'Escape');
  await page.waitForTimeout(100);
  await pauseAction(page, 'restart');
  await ticksPast(page, 40);
  expect(errors).toEqual([]);
});
