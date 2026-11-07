import { expect, test } from '@playwright/test';

test('anime roster selection sets the title fighter and reaches a match', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?timer=1');
  const onScene = (key: string) => page.waitForFunction(key => (window as any).__GAME__?.scene().includes(key), key);
  await onScene('title');

  await page.mouse.click(1060, 185); // P1 fighter
  await onScene('fighters');
  await page.mouse.click(1140, 84); // Black Clover tab
  await page.waitForFunction(() => (window as any).__GAME__.game.scene.getScene('fighters').group === 'black-clover');
  await page.mouse.click(640, 275); // Yuno card
  await onScene('title');
  const hero = await page.evaluate(() => JSON.parse(localStorage.getItem('scrapyard.profiles') ?? '[]')[0]?.hero);
  expect(hero).toBe('yuno');

  await page.mouse.click(1060, 185); // Reopen at the current selection
  await onScene('fighters');
  await page.keyboard.press('Escape');
  await onScene('title');
  await page.mouse.click(80, 640); // Quick Match
  await page.waitForFunction(() => (window as any).__GAME__?.match()?.world.tick > 10);
  expect(await page.evaluate(() => (window as any).__GAME__.match().world.fighters[0].hero)).toBe('yuno');
  expect(errors).toEqual([]);
});
