import { expect, test } from '@playwright/test';

test('selecting an ability demonstrates it in the arena and leaves the roster cleanly', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?timer=1');
  const onScene = (key: string) => page.waitForFunction(key => (window as any).__GAME__?.scene().includes(key), key);
  await onScene('title');
  await page.mouse.click(532, 640); // Fighters
  await onScene('fighters');
  await page.mouse.click(397, 84); // One Piece
  await page.waitForFunction(() => (window as any).__GAME__.game.scene.getScene('fighters').group === 'one-piece');
  await page.mouse.click(486, 280); // Zoro
  await onScene('hero-demo');

  await page.mouse.click(535, 88); // Ultimate
  await page.waitForFunction(() => (window as any).__GAME__.game.scene.getScene('hero-demo').demo?.mode === 'super');
  await page.mouse.click(1130, 136); // Asura
  const result = await page.waitForFunction(() => {
    const demo = (window as any).__GAME__.game.scene.getScene('hero-demo').demo;
    const rival = demo?.world.fighters[1];
    if (demo?.level !== 4 || !rival || rival.hp >= rival.maxHp) return false;
    return { map: demo.world.def.id, hero: demo.hero, health: rival.hp };
  });
  expect(await result.jsonValue()).toMatchObject({ map: 'dojo', hero: 'zoro' });

  await page.mouse.click(950, 88); // Special
  await page.mouse.click(140, 136); // Base Form
  await page.waitForFunction(() => {
    const demo = (window as any).__GAME__.game.scene.getScene('hero-demo').demo;
    return demo?.hero === 'zoro' && demo.mode === 'special' && demo.level === 0 && demo.world.fighters[1].hp < demo.world.fighters[1].maxHp;
  });

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !(window as any).__GAME__.scene().includes('hero-demo'));
  await onScene('fighters');
  expect(errors).toEqual([]);
});

test('the BrawlKai roster tab demonstrates Scrapper’s Shoulder Check', async ({ page }) => {
  await page.goto('/?timer=1');
  await page.waitForFunction(() => (window as any).__GAME__?.scene().includes('title'));
  await page.mouse.click(532, 640); // Fighters
  await page.waitForFunction(() => (window as any).__GAME__?.scene().includes('fighters'));
  await page.mouse.click(1140, 84); // BrawlKai
  await page.waitForFunction(() => (window as any).__GAME__.game.scene.getScene('fighters').group === 'original');
  await page.mouse.click(640, 280); // Scrapper
  await page.waitForFunction(() => {
    const demo = (window as any).__GAME__.game.scene.getScene('hero-demo').demo;
    return demo?.hero === '' && demo.mode === 'special' && demo.level === 0 && demo.world.fighters[1].hp < demo.world.fighters[1].maxHp;
  });
});
