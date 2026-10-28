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

test('Kurama chakra arms render from real Rasengan and bomb inputs, including hit recovery', async ({ page }) => {
  await page.goto('/?scene=match&trailer=1&shot=rasengan&timer=1');
  await page.waitForFunction(() => (window as any).__TRAILER__?.ready());
  const result = await page.evaluate(() => {
    const h = (window as any).__GAME__, driver = (window as any).__TRAILER__;
    const scene = h.game.scene.getScene('match'), rig = scene.trailer;
    rig.spec.forms = [{ at: 0, who: 0, level: 4 }];
    rig.spec.start = 4;
    rig.spec.patches = [
      { at: 0, dur: 300, who: 0, idle: true }, { at: 0, dur: 300, who: 1, idle: true },
      { at: 20, dur: 3, who: 0, idle: true, ability: true },
      { at: 100, dur: 3, who: 0, idle: true, ability: true, kick: true },
    ];
    rig.attach();
    const fx = scene.wr.heroFx, f = scene.match.world.fighters[0];
    const states = new Set<string>();
    let unchanged = true;
    const draw = fx.choreography.kuramaArms.bind(fx.choreography);
    fx.choreography.kuramaArms = (...args: any[]) => {
      const before = JSON.stringify(scene.match.world.fighters);
      draw(...args);
      unchanged &&= before === JSON.stringify(scene.match.world.fighters);
      states.add(f.specialKind === 'rasengan' ? f.recoverAt > 0 ? 'rasengan-recovery' : 'rasengan' : f.charge < 0 ? 'bomb-release' : 'bomb-charge');
    };
    driver.begin();
    for (let i = 0; i < 190; i++) driver.step();
    return { states: [...states], unchanged, aboveBody: fx.front.depth > scene.wr.views[0].root.depth, belowOrb: fx.front.depth < fx.orbs.depth };
  });
  expect(result.states).toEqual(expect.arrayContaining(['rasengan', 'rasengan-recovery', 'bomb-charge', 'bomb-release']));
  expect(result.unchanged).toBe(true);
  expect(result.aboveBody && result.belowOrb).toBe(true);
});

test('Luffy attack artwork follows real Pistol, Gatling and super states without changing fighters', async ({ page }) => {
  await page.goto('/?scene=match&trailer=1&shot=pistol&timer=1');
  await page.waitForFunction(() => (window as any).__TRAILER__?.ready());
  const result = await page.evaluate(() => {
    const h = (window as any).__GAME__, driver = (window as any).__TRAILER__;
    const scene = h.game.scene.getScene('match'), rig = scene.trailer;
    rig.spec.forms = [{ at: 0, who: 0, level: 4 }];
    rig.spec.start = 4;
    rig.spec.patches = [
      { at: 0, dur: 300, who: 0, idle: true }, { at: 0, dur: 300, who: 1, idle: true },
      { at: 20, dur: 3, who: 0, idle: true, ability: true },
      { at: 80, dur: 3, who: 0, idle: true, kick: true },
      { at: 150, dur: 3, who: 0, idle: true, ability: true, kick: true },
    ];
    rig.attach();
    const art = scene.wr.heroFx.luffyArt;
    const states = new Set<string>();
    let unchanged = true, maxRadius = 0;
    for (const method of ['arm', 'gatling']) {
      const draw = art[method].bind(art);
      art[method] = (...args: any[]) => {
        const before = JSON.stringify(scene.match.world.fighters);
        draw(...args);
        unchanged &&= before === JSON.stringify(scene.match.world.fighters);
        const f = args[0].fighter;
        states.add(f.specialKind);
        if (f.specialKind === 'superFist') maxRadius = Math.max(maxRadius, f.beamWidth);
      };
    }
    driver.begin();
    for (let i = 0; i < 230; i++) driver.step();
    return { states: [...states], unchanged, maxRadius };
  });
  expect(result.states).toEqual(expect.arrayContaining(['pistol', 'gatling', 'superFist']));
  expect(result.unchanged).toBe(true);
  expect(result.maxRadius).toBe(40);
});
