import { expect, test, type Page } from '@playwright/test';

// M2 content smoke test: every weapon/throwable/gadget is used through the real keyboard path in a
// live match. Fails on any console error. Screenshots land in tests/e2e/screenshots/.

interface Inv {
  id: string;
  ammo: number;
  dur: number;
}
interface F {
  x: number;
  y: number;
  hp: number;
  alive: boolean;
  invuln: number;
  inv: (Inv | null)[];
  active: number;
  state: string;
}
interface W {
  tick: number;
  fighters: F[];
  props: { active: boolean }[];
  bulletTime: number;
  spawnWeapon: (id: string, x: number, y: number) => unknown;
}
type Handle = { match: () => { world: W } | null; scene: () => string[] };

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

const world = (page: Page) => page.evaluate(() => (window as unknown as { __GAME__: Handle }).__GAME__.match()!.world.tick);

async function waitTicks(page: Page, n: number): Promise<void> {
  const t0 = await world(page);
  await page.waitForFunction(
    (t) => ((window as unknown as { __GAME__: Handle }).__GAME__.match()?.world.tick ?? 0) >= t,
    t0 + n,
    { timeout: 30_000 },
  );
}

/** Put a weapon in P1's hands (keeps P1 alive and topped up so the tour can continue). */
async function arm(page: Page, id: string, slot: number, ammo: number): Promise<void> {
  await page.evaluate(
    ([id, slot, ammo]) => {
      const w = (window as unknown as { __GAME__: Handle }).__GAME__.match()!.world;
      const f = w.fighters[0];
      f.hp = 100;
      f.inv[slot as number] = { id: id as string, ammo: ammo as number, dur: 30 };
      f.active = slot as number;
    },
    [id, slot, ammo] as const,
  );
}

async function tap(page: Page, key: string, holdMs = 60): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(holdMs);
  await page.keyboard.up(key);
}

test('weapon sprite sheet renders', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?scene=art&page=weapons&timer=1');
  await page.waitForFunction(() => (window as unknown as { __GAME__?: Handle }).__GAME__?.scene().includes('art'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'tests/e2e/screenshots/weapons.png' });
  expect(errors).toEqual([]);
});

test('arsenal tour: every weapon type fires without errors', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?scene=match&timer=1&humans=1&bots=3&seed=21&map=test');
  await page.waitForFunction(() => ((window as unknown as { __GAME__?: Handle }).__GAME__?.match()?.world.tick ?? 0) > 30);
  await page.keyboard.press('F2'); // 2x sim speed

  const tour: [string, number, number, number][] = [
    // id, slot, ammo, hold ms
    ['knife', 0, 0, 60],
    ['sledge', 0, 0, 60],
    ['katana', 0, 0, 60],
    ['chair', 0, 0, 60],
    ['revolver', 1, 6, 60],
    ['uzi', 1, 40, 500],
    ['flaregun', 1, 3, 60],
    ['smg', 2, 45, 500],
    ['rifle', 2, 36, 500],
    ['sniper', 2, 5, 400],
    ['minigun', 2, 160, 1200],
    ['flamer', 2, 140, 900],
    ['bazooka', 2, 3, 120],
    ['grenade', 3, 3, 350],
    ['molotov', 3, 2, 250],
    ['mine', 3, 2, 80],
    ['c4', 3, 2, 200],
  ];
  for (const [id, slot, ammo, hold] of tour) {
    await arm(page, id, slot, ammo);
    await tap(page, 'KeyF', hold);
    await waitTicks(page, 20);
    if (id === 'flamer' || id === 'bazooka') await page.screenshot({ path: `tests/e2e/screenshots/arsenal-${id}.png` });
  }
  await waitTicks(page, 60);
  await tap(page, 'KeyF'); // detonate the C4
  await waitTicks(page, 90);
  await page.screenshot({ path: 'tests/e2e/screenshots/arsenal-after.png' });
  expect(errors).toEqual([]);
});

test('gadgets and powerups', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?scene=match&timer=1&humans=1&bots=1&seed=3&map=test');
  await page.waitForFunction(() => ((window as unknown as { __GAME__?: Handle }).__GAME__?.match()?.world.tick ?? 0) > 30);
  await arm(page, 'medkit', 4, 50);
  await page.evaluate(() => {
    const f = (window as unknown as { __GAME__: Handle }).__GAME__.match()!.world.fighters[0];
    f.hp = 40;
  });
  await tap(page, 'KeyF');
  await waitTicks(page, 5);
  const healed = await page.evaluate(() => (window as unknown as { __GAME__: Handle }).__GAME__.match()!.world.fighters[0].hp);
  expect(healed).toBeGreaterThan(80);

  // open floor away from ladders (W now jumps AND climbs)
  await page.evaluate(() => {
    const f = (window as unknown as { __GAME__: Handle }).__GAME__.match()!.world.fighters[0] as unknown as { x: number; px: number; y: number; py: number; vx: number; vy: number };
    f.x = f.px = 6 * 16 + 8;
    f.y = f.py = 27 * 16;
    f.vx = f.vy = 0;
  });
  await waitTicks(page, 10);
  await arm(page, 'jetpack', 4, 3.5);
  await page.keyboard.down('KeyW');
  await waitTicks(page, 50);
  await page.screenshot({ path: 'tests/e2e/screenshots/arsenal-jetpack.png' });
  await page.keyboard.up('KeyW');
  await waitTicks(page, 150); // (fall back down before the next pickup)

  await page.evaluate(() => {
    const w = (window as unknown as { __GAME__: Handle }).__GAME__.match()!.world;
    const f = w.fighters[0];
    w.spawnWeapon('bullettime', f.x, f.y - 2);
  });
  await waitTicks(page, 10);
  const bt = await page.evaluate(() => (window as unknown as { __GAME__: Handle }).__GAME__.match()!.world.bulletTime);
  expect(bt).toBeGreaterThan(0);
  await page.screenshot({ path: 'tests/e2e/screenshots/arsenal-bullettime.png' });

  expect(errors).toEqual([]);
});
