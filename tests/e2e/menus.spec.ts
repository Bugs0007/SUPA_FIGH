import { expect, test, type Page } from '@playwright/test';

type Handle = { match: () => { cfg: { mode: string }; world: { tick: number; fighters: unknown[] } } | null; scene: () => string[] };

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
    await page.waitForTimeout(60);
  }
}

test('title -> lobby -> deathmatch with teams', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?timer=1');
  await onScene(page, 'title');
  await press(page, 'KeyL');
  await onScene(page, 'lobby');
  await page.waitForTimeout(200);
  // slot 1: move to TEAM column and set RED
  await press(page, 'ArrowRight');
  await press(page, 'Enter');
  // MODE row = slots(10) + 1 -> from slot 0 go down 11
  await press(page, 'ArrowDown', 11);
  await press(page, 'ArrowRight'); // brawl -> deathmatch
  await page.screenshot({ path: 'tests/e2e/screenshots/lobby.png' });
  // START row = slots(10) + 8 (map, mode, length, sudden, ff, weapons, chaos, hero power-ups, START)
  await press(page, 'ArrowDown', 7);
  await press(page, 'Enter');
  await page.waitForFunction(() => ((window as unknown as { __GAME__?: Handle }).__GAME__?.match()?.world.tick ?? 0) > 20);
  const info = await page.evaluate(() => {
    const m = (window as unknown as { __GAME__: Handle }).__GAME__.match()!;
    return { mode: m.cfg.mode, n: m.world.fighters.length };
  });
  expect(info).toEqual({ mode: 'deathmatch', n: 5 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tests/e2e/screenshots/deathmatch.png' });
  expect(errors).toEqual([]);
});

test('rebind P1 jump, see it saved, restore defaults', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?timer=1');
  await onScene(page, 'title');
  await press(page, 'KeyC');
  await onScene(page, 'controls');
  await page.waitForTimeout(200);
  await press(page, 'ArrowDown', 5); // jump row
  await press(page, 'Enter');
  await press(page, 'KeyQ');
  const saved = await page.evaluate(() => localStorage.getItem('scrapyard-riot:keybinds') ?? Object.entries(localStorage).find(([k]) => k.includes('keybinds'))?.[1] ?? '');
  expect(saved).toContain('KeyQ');
  // bind P1 kick to P2's attack key to trigger a conflict warning
  await press(page, 'ArrowDown', 2); // kick row
  await press(page, 'Enter');
  await press(page, 'KeyL');
  await page.screenshot({ path: 'tests/e2e/screenshots/controls.png' });
  // restore defaults (row after the 11 actions)
  await press(page, 'ArrowDown', 5);
  await press(page, 'Enter');
  const after = await page.evaluate(() => Object.entries(localStorage).find(([k]) => k.includes('keybinds'))?.[1] ?? '');
  expect(after).not.toContain('KeyQ');
  await press(page, 'Escape');
  await onScene(page, 'title');
  expect(errors).toEqual([]);
});

test('fighter creator edits a lobby slot look', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?scene=lobby&timer=1');
  await onScene(page, 'lobby');
  await page.waitForTimeout(200);
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('scrapyard.lobby') ?? 'null')?.slots?.[0]?.look?.skin ?? null);
  await press(page, 'ArrowRight', 3); // LOOK column
  await press(page, 'Enter');
  await onScene(page, 'creator');
  await page.waitForTimeout(200);
  await press(page, 'ArrowDown'); // HERO row -> SKIN row
  await press(page, 'ArrowRight'); // next skin tone
  await page.screenshot({ path: 'tests/e2e/screenshots/creator.png' });
  await press(page, 'Escape');
  await onScene(page, 'lobby');
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('scrapyard.lobby') ?? 'null')?.slots?.[0]?.look?.skin);
  expect(after).toBeTruthy();
  expect(after).not.toBe(before);
  expect(errors).toEqual([]);
});

test('pause menu: settings overlay, then quit to title', async ({ page }) => {
  const errors = collectErrors(page);
  type Hud = { pauseIdx: number; wasPaused: boolean };
  const hud = () => `(window.__GAME__.game.scene.getScene('hud'))`;
  const waitHud = (cond: string) => page.waitForFunction(`(() => { const h = ${hud()}; return ${cond}; })()`);
  void ({} as Hud);
  await page.goto('/?scene=match&timer=1&humans=1&bots=1');
  await page.waitForFunction(() => ((window as unknown as { __GAME__?: Handle }).__GAME__?.match()?.world.tick ?? 0) > 20);
  await press(page, 'Escape');
  await waitHud('h.wasPaused === true');
  for (let i = 1; i <= 2; i++) {
    await press(page, 'ArrowDown');
    await waitHud(`h.pauseIdx === ${i}`);
  }
  await press(page, 'Enter'); // SETTINGS
  await onScene(page, 'settings');
  const vol0 = await page.evaluate(() => JSON.parse(localStorage.getItem('scrapyard.settings') ?? '{}').sfxVolume ?? 0.9);
  await press(page, 'ArrowDown'); // SFX
  await press(page, 'ArrowLeft');
  await page.waitForFunction((v) => JSON.parse(localStorage.getItem('scrapyard.settings') ?? '{}').sfxVolume < v - 0.05, vol0);
  await page.screenshot({ path: 'tests/e2e/screenshots/settings.png' });
  await press(page, 'Escape');
  await page.waitForFunction(() => !(window as unknown as { __GAME__: Handle }).__GAME__.scene().includes('settings'));
  // still paused: QUIT is index 4
  for (let i = 3; i <= 4; i++) {
    await press(page, 'ArrowDown');
    await waitHud(`h.pauseIdx === ${i}`);
  }
  await page.screenshot({ path: 'tests/e2e/screenshots/pause.png' });
  await press(page, 'Enter');
  await onScene(page, 'title');
  expect(errors).toEqual([]);
});
