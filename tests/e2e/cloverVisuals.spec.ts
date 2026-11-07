import { expect, test } from '@playwright/test';
import type { Fighter } from '../../src/sim/fighter';

/* eslint-disable @typescript-eslint/no-explicit-any */
test('Asta and Yuno keep their wings behind the fighter in both facings', async ({ page }) => {
  await page.goto('/?scene=match&timer=1&humans=1&bots=1&heroes=asta,yuno&powers=0&map=test');
  await page.waitForFunction(() => (window as any).__GAME__?.match()?.world.tick > 20);
  const samples = await page.evaluate(() => {
    const game = (window as any).__GAME__.game;
    const scene = game.scene.getScene('match');
    const { world } = scene.match;
    const { heroFx, views } = scene.wr;
    game.loop.stop();

    const colors: Record<string, Set<number>> = {
      asta: new Set([0x251728, 0x9b2844, 0xff6e67]),
      yuno: new Set([0x174c4b, 0x4abc81, 0xb6ffb1, 0xf3ffe3]),
    };
    const back = heroFx.back;
    const fillStyle = back.fillStyle.bind(back);
    const fillRect = back.fillRect.bind(back);
    let color = 0;
    const painted: { x: number; y: number; width: number; color: number }[] = [];
    back.fillStyle = (ink: number, alpha: number) => {
      color = ink;
      return fillStyle(ink, alpha);
    };
    back.fillRect = (x: number, y: number, width: number, height: number) => {
      painted.push({ x, y, width, color });
      return fillRect(x, y, width, height);
    };

    const results = [];
    for (const [i, fighter] of (world.fighters as Fighter[]).slice(0, 2).entries()) {
      const x = 250 + i * 150, y = 150;
      for (const facing of [-1, 1]) {
        for (const pose of ['idle', 'sprint', 'air', 'guard']) {
          Object.assign(fighter, {
            x, px: x, y, py: y, alive: true, gone: false, power: 'hero', powerLevel: 3, formHp: 90,
            facing, state: pose === 'guard' ? 'block' : 'normal', specialKind: '', stateTime: 0.16,
            vx: pose === 'sprint' ? 220 * facing : 0, vy: pose === 'air' ? -70 : 0,
            grounded: pose !== 'air', sprintDir: pose === 'sprint' ? facing : 0, flying: pose === 'air',
          });
          painted.length = 0;
          scene.wr.sync(1, 0, 1);
          const wing = painted.filter(mark => colors[fighter.hero].has(mark.color) && Math.abs(mark.x - x) < 45 && Math.abs(mark.y - y) < 54);
          results.push({
            hero: fighter.hero, pose, facing,
            drawn: wing.length > 0 && back.depth < views[i].root.depth,
            behind: wing.every(mark => facing > 0 ? mark.x + mark.width <= x : mark.x >= x),
          });
        }
      }
    }
    return results;
  });
  expect(samples).toHaveLength(16);
  for (const sample of samples) {
    expect(sample, `${sample.hero} ${sample.pose} facing ${sample.facing}`).toMatchObject({ drawn: true, behind: true });
  }
});
