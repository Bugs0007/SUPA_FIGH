import { expect, test, type Page } from '@playwright/test';

// Trailer mode (src/trailer): ?trailer=1 is a clean bot match, ?trailer=1&shot=<id> is a deterministic scripted shot.

type Trailer = { ready: () => boolean; begin: () => boolean; step: () => void; events: () => { vf: number; what: string }[]; audioLog: () => unknown[] };

async function shotEvents(page: Page, shot: string, frames: number): Promise<string> {
  await page.goto(`/?trailer=1&shot=${shot}&timer=1`);
  await page.waitForFunction(() => (window as unknown as { __TRAILER__?: Trailer }).__TRAILER__?.ready());
  return page.evaluate((n) => {
    const t = (window as unknown as { __TRAILER__: Trailer }).__TRAILER__;
    t.begin();
    for (let i = 0; i < n; i++) t.step();
    return JSON.stringify([t.events(), t.audioLog().length]);
  }, frames);
}

test('?trailer=1 runs a clean bot match: no HUD, no errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?trailer=1&timer=1&speed=2');
  await page.waitForFunction(() => (window as unknown as { __GAME__?: { scene: () => string[] } }).__GAME__?.scene().includes('match'));
  await page.waitForTimeout(1500);
  const scenes = await page.evaluate(() => (window as unknown as { __GAME__: { scene: () => string[] } }).__GAME__.scene());
  expect(scenes).toContain('trailerHud');
  expect(scenes).not.toContain('hud');
  expect(errors).toEqual([]);
});

test('a scripted trailer shot is deterministic and shows the ability', async ({ page }) => {
  const a = await shotEvents(page, 'rasengan', 70);
  const b = await shotEvents(page, 'rasengan', 70);
  expect(a).toBe(b);
  expect(a).toContain('rasengan');
  expect(a).toContain('melee/rasengan');
});
