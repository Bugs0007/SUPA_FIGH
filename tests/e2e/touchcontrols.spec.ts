import { expect, test, type CDPSession, type Page } from '@playwright/test';

// The phone controls in a touch-emulating browser: a JUMP and a CROUCH button on the far right with the other buttons
// shifted left to make room (nothing overlaps, everything on screen), both working like the keyboard keys, and the
// browser's own double-tap zoom / magnifier / selection kept out of the game.

interface GameHandle {
  match: () => { world: { tick: number; fighters: { state: string; grounded: boolean; y: number; vy: number }[] } } | null;
}
type Win = { __GAME__: GameHandle };

const LANDSCAPE = { width: 915, height: 412 };

async function open(page: Page, heroes = '-,-') {
  await page.goto(`/?scene=match&humans=1&bots=1&heroes=${heroes}&touch=1&timer=1&seed=5`);
  await page.waitForFunction(() => ((window as unknown as Win).__GAME__?.match()?.world.tick ?? 0) > 60);
  await page.waitForFunction(() => document.querySelector<HTMLElement>('#touch')?.dataset.mode === 'game');
}

const fighter = (page: Page) => page.evaluate(() => (window as unknown as Win).__GAME__.match()!.world.fighters[0]);

async function rectOf(page: Page, sel: string) {
  return page.evaluate((s) => {
    const el = document.querySelector<HTMLElement>(s);
    if (!el || getComputedStyle(el).display === 'none') return null;
    const r = el.getBoundingClientRect();
    return { l: r.left, t: r.top, r: r.right, b: r.bottom };
  }, sel);
}

async function hold(cdp: CDPSession, x: number, y: number, ms: number, page: Page) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test.use({ hasTouch: true, isMobile: true, viewport: LANDSCAPE, deviceScaleFactor: 2 });

test('JUMP and CROUCH sit on the far right and nothing overlaps or leaves the screen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  // heroes show their ability buttons too: check the busiest layout
  for (const heroes of ['-,-', 'naruto,-']) {
    await open(page, heroes);
    const ids = ['.b-jump', '.b-crouch', '.b-attack', '.b-kick', '.b-ability', '.b-super', '.b-grab', '.b-swap', '.b-med', '.b-pause', '.pad'];
    const rects: Record<string, { l: number; t: number; r: number; b: number }> = {};
    for (const id of ids) {
      const r = await rectOf(page, id);
      if (r) rects[id] = r;
    }
    expect(Object.keys(rects), heroes).toContain('.b-jump');
    expect(Object.keys(rects)).toContain('.b-crouch');
    if (heroes !== '-,-') expect(Object.keys(rects)).toContain('.b-ability');
    const names = Object.keys(rects);
    for (const n of names) {
      const r = rects[n];
      expect(r.l, `${n} inside the screen`).toBeGreaterThanOrEqual(0);
      expect(r.t, n).toBeGreaterThanOrEqual(0);
      expect(r.r, n).toBeLessThanOrEqual(LANDSCAPE.width + 0.5);
      expect(r.b, n).toBeLessThanOrEqual(LANDSCAPE.height + 0.5);
    }
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const a = rects[names[i]];
        const b = rects[names[j]];
        const overlap = Math.min(a.r, b.r) - Math.max(a.l, b.l) > 1 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 1;
        expect(overlap, `${names[i]} overlaps ${names[j]}`).toBe(false);
      }
    }
    // jump / crouch are the right-most game buttons, jump above crouch
    for (const n of names.filter((n) => !['.b-jump', '.b-crouch', '.b-pause', '.pad'].includes(n))) {
      expect(rects[n].r, `${n} is left of the jump / crouch column`).toBeLessThan(rects['.b-jump'].l + 1);
    }
    expect(rects['.b-jump'].b).toBeLessThanOrEqual(rects['.b-crouch'].t + 1);
    await page.screenshot({ path: `tests/e2e/screenshots/touch-${heroes.startsWith('naruto') ? 'hero' : 'plain'}.png` });
  }
  expect(errors).toEqual([]);
});

test('JUMP jumps, CROUCH crouches, and the pad and a button can share a key', async ({ page }) => {
  await open(page);
  const cdp = await page.context().newCDPSession(page);
  await page.waitForFunction(() => (window as unknown as Win).__GAME__.match()!.world.fighters[0].grounded);
  const y0 = (await fighter(page)).y;

  const jump = (await rectOf(page, '.b-jump'))!;
  const jx = (jump.l + jump.r) / 2;
  const jy = (jump.t + jump.b) / 2;
  await page.touchscreen.tap(jx, jy);
  await page.waitForTimeout(150);
  const jumping = await fighter(page);
  expect(jumping.vy < 0 || jumping.y < y0 - 2, `jumping: vy ${jumping.vy}, y ${jumping.y} vs ${y0}`).toBe(true);

  await page.waitForFunction(() => (window as unknown as Win).__GAME__.match()!.world.fighters[0].grounded, undefined, { timeout: 5000 });
  const crouch = (await rectOf(page, '.b-crouch'))!;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: (crouch.l + crouch.r) / 2, y: (crouch.t + crouch.b) / 2 }] });
  await page.waitForTimeout(250);
  expect((await fighter(page)).state).toBe('crouch');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(250);
  expect((await fighter(page)).state).not.toBe('crouch');

  // JUMP and the pad's up arrow press the same key: letting go of one must not release the other
  await page.waitForFunction(() => (window as unknown as Win).__GAME__.match()!.world.fighters[0].grounded);
  const keys = await page.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const load = (path: string): Promise<any> => import(/* @vite-ignore */ path);
    const { keyboard } = await load('/src/input/keyboard.ts');
    const { keyboardBinds } = await load('/src/input/bindings.ts');
    const code: string = keyboardBinds[0].up[0];
    const ptr = (type: string, id: number, x = 0, y = 0) => new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'touch' });
    const jumpBtn = document.querySelector('.b-jump')!;
    const pad = document.querySelector('.pad')!;
    const r = pad.getBoundingClientRect();
    const seen: Record<string, boolean> = {};
    // (a press that is released within one frame stays latched until the game has seen it: let frames pass between steps)
    const frames = () => new Promise((resolve) => setTimeout(resolve, 80));
    jumpBtn.dispatchEvent(ptr('pointerdown', 21));
    await frames();
    seen.jumpDown = keyboard.held(code);
    pad.dispatchEvent(ptr('pointerdown', 22, r.left + r.width / 2, r.top + 6)); // the pad's up arrow
    await frames();
    pad.dispatchEvent(ptr('pointerup', 22));
    await frames();
    seen.afterPadReleased = keyboard.held(code); // JUMP still holds it
    jumpBtn.dispatchEvent(ptr('pointerup', 21));
    await frames();
    seen.afterJumpReleased = keyboard.held(code);
    return seen;
  });
  expect(keys).toEqual({ jumpDown: true, afterPadReleased: true, afterJumpReleased: false });
});

test('double taps on the buttons do not zoom, select text or open a magnifier', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await open(page);
  const cdp = await page.context().newCDPSession(page);
  const atk = (await rectOf(page, '.b-attack'))!;
  const kick = (await rectOf(page, '.b-kick'))!;
  const pad = (await rectOf(page, '.pad'))!;
  for (const r of [atk, kick, pad]) {
    const x = (r.l + r.r) / 2;
    const y = (r.t + r.b) / 2;
    for (let i = 0; i < 3; i++) await hold(cdp, x, y, 40, page); // rapid taps, well inside the double-tap window
  }
  const state = await page.evaluate(() => ({
    scale: window.visualViewport?.scale ?? 1,
    selected: String(window.getSelection() ?? ''),
    rangeCount: window.getSelection()?.rangeCount ?? 0,
    zoomedInner: window.innerWidth,
  }));
  expect(state.scale).toBe(1);
  expect(state.selected).toBe('');
  expect(state.rangeCount).toBe(0);

  // the events that cause those effects are all cancelled
  const cancelled = await page.evaluate(() => {
    const btn = document.querySelector('.b-attack')!;
    const fire = (el: EventTarget, e: Event) => {
      el.dispatchEvent(e);
      return e.defaultPrevented;
    };
    return {
      touchstart: fire(btn, new Event('touchstart', { bubbles: true, cancelable: true })),
      touchend: fire(btn, new Event('touchend', { bubbles: true, cancelable: true })),
      dblclick: fire(btn, new MouseEvent('dblclick', { bubbles: true, cancelable: true })),
      contextmenu: fire(btn, new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
      selectstart: fire(btn, new Event('selectstart', { bubbles: true, cancelable: true })),
      userSelect: getComputedStyle(btn).userSelect,
      callout: (getComputedStyle(btn) as unknown as { webkitTouchCallout: string }).webkitTouchCallout,
      touchAction: getComputedStyle(btn).touchAction,
    };
  });
  expect(cancelled).toMatchObject({ touchstart: true, touchend: true, dblclick: true, contextmenu: true, selectstart: true, userSelect: 'none', touchAction: 'none' });
  expect(errors).toEqual([]);
});
