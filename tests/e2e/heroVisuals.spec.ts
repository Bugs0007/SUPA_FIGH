import { expect, test } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any */
test('one-tail Rasengan assistants are visual, pooled, and clear after the move', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/?scene=match&timer=1&humans=1&bots=1&heroes=naruto&powers=0&map=test');
  await page.waitForFunction(() => ((window as any).__GAME__?.match()?.world.tick ?? 0) > 30);
  const result = await page.evaluate(() => {
    const g = (window as any).__GAME__;
    g.game.loop.stop();
    const w = g.match().world;
    const renderer = g.game.scene.getScene('match').wr;
    const f = w.fighters[0];
    const fx = renderer.heroFx;
    const pool = fx.choreography.echoes.get(f.id);
    f.state = 'special';
    f.specialKind = 'rasengan';
    f.stateTime = 0.08;
    f.recoverAt = 0;
    f.power = '';
    f.powerLevel = 0;
    fx.sync(1, 0.01, 0.5);
    const baseHelpers = pool.filter((e: any) => e.root.visible).length;
    f.power = 'hero';
    f.powerLevel = 1;
    f.formHp = 30;
    const before = JSON.stringify(w.fighters);
    const objects = renderer.scene.children.list.length;
    fx.sync(1, 0.01, 1);
    const helpers = pool.filter((e: any) => e.root.visible).length;
    const unchanged = JSON.stringify(w.fighters) === before;
    for (let i = 0; i < 120; i++) fx.sync(1, 0.01, 1 + i / 60);
    const pooled = renderer.scene.children.list.length === objects;
    f.state = 'normal';
    fx.sync(1, 0.01, 3);
    const cleared = pool.every((e: any) => !e.root.visible);
    f.state = 'special';
    f.alive = false;
    fx.sync(1, 0.01, 3.1);
    const deadClear = pool.every((e: any) => !e.root.visible);
    return { baseHelpers, helpers, unchanged, pooled, cleared, deadClear };
  });
  expect(result).toEqual({ baseHelpers: 0, helpers: 2, unchanged: true, pooled: true, cleared: true, deadClear: true });
  expect(errors).toEqual([]);
});

for (const hero of ['naruto', 'luffy', 'goku']) {
  test(`${hero}: every form's abilities render and the gallery restarts cleanly`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`/?scene=art&page=moves&hero=${hero}&timer=1`);
    await page.waitForFunction(() => (window as any).__GAME__?.game.scene.getScene('art').gallery?.views.length === 5);
    const initial = await page.evaluate(() => {
      const scene = (window as any).__GAME__.game.scene.getScene('art');
      return { objects: scene.children.list.length, cameras: scene.cameras.cameras.length };
    });
    expect(initial.cameras).toBe(6);
    for (const [key, mode] of [['Digit1', 'base'], ['Digit2', 'second'], ['Digit3', 'super']]) {
      await page.keyboard.press(key);
      await page.waitForFunction(mode => (window as any).__GAME__.game.scene.getScene('art').gallery.mode === mode, mode);
      const levels = await page.evaluate(() => {
        const g = (window as any).__GAME__;
        const gallery = g.game.scene.getScene('art').gallery;
        gallery.t = 1.7;
        gallery.update(1 / 60);
        return gallery.views.map((v: any) => ({ level: v.fighter.powerLevel, visible: v.root.visible, powered: v.showsPowered }));
      });
      expect(levels.map((f: any) => f.level)).toEqual([0, 1, 2, 3, 4]);
      expect(levels.every((f: any) => f.visible && f.powered === (f.level > 0))).toBe(true);
    }
    for (let restart = 0; restart < 3; restart++) {
      await page.evaluate(() => (window as any).__GAME__.game.scene.getScene('art').scene.restart());
      await page.waitForTimeout(200);
      await page.waitForFunction(() => (window as any).__GAME__.game.scene.getScene('art').gallery?.views.length === 5);
      expect(await page.evaluate(() => {
        const scene = (window as any).__GAME__.game.scene.getScene('art');
        return { objects: scene.children.list.length, cameras: scene.cameras.cameras.length };
      })).toEqual(initial);
    }
    expect(errors).toEqual([]);
  });
}
