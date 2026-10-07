import { describe, expect, it } from 'vitest';
import { TILE } from '../../src/sim/constants';
import { HEROES } from '../../src/sim/data/heroes';
import { transform } from '../../src/sim/hero';
import type { Intent } from '../../src/sim/intent';
import type { MapDef } from '../../src/sim/map/mapData';
import { World } from '../../src/sim/world';
import { intent } from './helpers';

// D51: every hero has a signature move in base form on the ABILITY button.

const BOX: MapDef = {
  id: 'box',
  name: 'box',
  theme: 'arena',
  rows: [
    '########################################',
    '#......................................#',
    '#......................................#',
    '#......................................#',
    '#......................................#',
    '#......................................#',
    '#......................................#',
    '#......................................#',
    '#......................................#',
    '#......................................#',
    '#......................................#',
    '#......................................#',
    '#..S...S...S...S...S...S...S...S...S.S.#',
    '########################################',
  ],
};
const FLOOR = 13 * TILE;

function world(hero: string, n = 2): World {
  const specs = Array.from({ length: n }, (_, i) => ({ name: 'F' + i, team: 0, isBot: false, upJumps: false, hero: i === 0 ? hero : undefined }));
  const w = new World(BOX, specs, { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 7);
  return w;
}

function put(w: World, i: number, x: number, y = FLOOR, facing: 1 | -1 = 1): void {
  const f = w.fighters[i];
  f.x = f.px = x;
  f.y = f.py = y;
  f.vx = f.vy = 0;
  f.facing = facing;
  f.state = 'normal';
  f.invuln = 0; // no spawn protection in these tests
}

function settle(w: World): void {
  for (let i = 0; i < 6; i++) w.step([]);
}

function hold(w: World, ticks: number, i: Partial<Intent>): void {
  for (let t = 0; t < ticks; t++) w.step([intent(i)]);
}

const tap = (w: World, i: Partial<Intent>) => {
  hold(w, 1, i);
  hold(w, 1, {});
};

describe('Goku: instant transmission', () => {
  const tp = (w: World, extra: Partial<Intent> = {}) => {
    hold(w, 1, { ability: true, ...extra });
    hold(w, 1, {});
  };

  it('ABILITY teleports Goku forward (up to the range) with a cooldown', () => {
    const w = world('goku');
    put(w, 0, 10 * TILE);
    put(w, 1, 36 * TILE);
    settle(w);
    const f = w.fighters[0];
    const x0 = f.x;
    tp(w, { moveX: 1 });
    const range = HEROES.goku.base.blink!.range;
    expect(f.x - x0).toBeGreaterThan(range - 12);
    expect(f.x - x0).toBeLessThanOrEqual(range + 1);
    expect(f.baseCd).toBeGreaterThan(1.5);
    // on cooldown: a second press does nothing
    hold(w, 20, {});
    const x1 = f.x;
    tp(w, { moveX: 1 });
    expect(Math.abs(f.x - x1)).toBeLessThan(4); // (only the run, no second jump)
  });

  it('goes in the direction held: left, up (into the air) and facing when nothing is held', () => {
    const w = world('goku');
    put(w, 0, 20 * TILE);
    put(w, 1, 36 * TILE);
    settle(w);
    const f = w.fighters[0];
    const x0 = f.x;
    tp(w, { moveX: -1 });
    expect(f.x).toBeLessThan(x0 - 80);
    expect(f.facing).toBe(-1);
    hold(w, 200, {});
    const y0 = f.y;
    tp(w, { moveY: -1 });
    expect(f.y).toBeLessThan(y0 - 60);
  });

  it('stops short of a wall instead of ending up inside it', () => {
    const w = world('goku');
    put(w, 0, 37 * TILE + 8); // the right wall starts at x = 39 * 16
    put(w, 1, 4 * TILE);
    settle(w);
    const f = w.fighters[0];
    tp(w, { moveX: 1 });
    expect(f.x + f.w / 2).toBeLessThanOrEqual(39 * TILE);
    hold(w, 10, {});
    expect(w.map.rectSolid(f.x - f.w / 2, f.y - f.h, f.x + f.w / 2, f.y - 0.5)).toBe(false);
  });

  it('locks onto a fighter in that direction: appears behind them and strikes', () => {
    const w = world('goku');
    put(w, 0, 10 * TILE);
    put(w, 1, 10 * TILE + 90);
    settle(w);
    const f = w.fighters[0];
    const o = w.fighters[1];
    const ox = o.x;
    let hit = false;
    hold(w, 1, { ability: true, moveX: 1 });
    for (let t = 0; t < 12; t++) {
      w.step([]);
      if (w.events.some((e) => e.t === 'hit' && e.weapon === 'blink' && e.victim === 1)) hit = true;
    }
    expect(f.x).toBeGreaterThan(ox); // on the far side
    expect(f.facing).toBe(-1); // turned back toward them
    expect(hit).toBe(true);
    expect(o.hp).toBeLessThan(o.maxHp);
  });

  it('is invulnerable for a moment after the jump', () => {
    const w = world('goku');
    put(w, 0, 10 * TILE);
    put(w, 1, 36 * TILE);
    settle(w);
    tp(w, { moveX: 1 });
    expect(w.fighters[0].invuln).toBeGreaterThan(0.05);
  });
});

describe('flight (hold Up in the air): Goku always, Naruto and Luffy in the final form', () => {
  it('Goku flies in his base form and in every form', () => {
    for (let lvl = 0; lvl <= 4; lvl++) {
      const w = world('goku');
      put(w, 0, 10 * TILE, 8 * TILE);
      put(w, 1, 36 * TILE);
      const f = w.fighters[0];
      for (let i = 0; i < lvl; i++) transform(w, f);
      f.vy = 0;
      f.grounded = false;
      hold(w, 30, { moveY: -1 });
      expect(f.flying, 'form ' + lvl).toBe(true);
    }
  });

  it.each(['naruto', 'luffy'])('%s flies only in the final form', (hero) => {
    const base = world(hero);
    put(base, 0, 10 * TILE, 8 * TILE);
    put(base, 1, 36 * TILE);
    base.fighters[0].vy = 0;
    hold(base, 30, { moveY: -1 });
    expect(base.fighters[0].flying).toBe(false);

    const w = world(hero);
    put(w, 0, 10 * TILE, 8 * TILE);
    put(w, 1, 36 * TILE);
    const f = w.fighters[0];
    for (let i = 0; i < 4; i++) transform(w, f);
    expect(f.powerLevel).toBe(4);
    f.vy = 0;
    f.grounded = false;
    hold(w, 30, { moveY: -1 });
    expect(f.flying).toBe(true);
    const y = f.y;
    hold(w, 20, { moveY: -1 });
    expect(f.y).toBeLessThan(y - 20);
    hold(w, 20, {});
    expect(f.flying).toBe(false); // release: falls
  });

  it('Goku has no levitation ability any more: his ability 1 is the teleport', () => {
    expect(HEROES.goku.base.kind).toBe('blink');
    expect(HEROES.goku.alwaysFlies).toBe(true);
  });
});

describe('Naruto: rasengan', () => {
  it('dashes forward and blasts the first fighter it touches', () => {
    const w = world('naruto');
    put(w, 0, 10 * TILE);
    put(w, 1, 10 * TILE + 70);
    settle(w);
    const n = w.fighters[0];
    const o = w.fighters[1];
    tap(w, { ability: true });
    let credited = false;
    for (let t = 0; t < 40; t++) {
      w.step([]);
      if (w.events.some((e) => e.t === 'hit' && e.weapon === 'rasengan' && e.victim === 1)) credited = true;
    }
    expect(credited).toBe(true);
    expect(o.hp).toBeLessThan(o.maxHp - 10);
    expect(o.x).toBeGreaterThan(10 * TILE + 90); // blasted away
    expect(n.x).toBeGreaterThan(10 * TILE + 30); // dashed
  });

  it('has a cooldown', () => {
    const w = world('naruto');
    put(w, 0, 6 * TILE);
    put(w, 1, 34 * TILE);
    settle(w);
    const n = w.fighters[0];
    tap(w, { ability: true });
    hold(w, 40, {});
    expect(n.state).toBe('normal');
    tap(w, { ability: true });
    expect(n.state).toBe('normal');
    hold(w, Math.ceil(HEROES.naruto.base.cooldown * 60), {});
    tap(w, { ability: true });
    expect(n.state).toBe('special');
  });

  it('the dash ignores gravity (crosses gaps in the air)', () => {
    const w = world('naruto');
    put(w, 0, 6 * TILE, 6 * TILE);
    put(w, 1, 34 * TILE);
    const n = w.fighters[0];
    w.step([intent({ ability: true })]);
    const d = HEROES.naruto.base.dash!;
    hold(w, Math.ceil(d.windup * 60) + 2, {});
    const y = n.y;
    hold(w, Math.floor(d.time * 60) - 3, {});
    expect(Math.abs(n.y - y)).toBeLessThan(1);
  });
});

describe('Luffy: gum-gum pistol', () => {
  it('has three charges; a spent one refills 2 s later, one after another', () => {
    const w = world('luffy');
    put(w, 0, 10 * TILE);
    put(w, 1, 36 * TILE);
    settle(w);
    const f = w.fighters[0];
    for (let i = 0; i < 3; i++) {
      tap(w, { ability: true });
      hold(w, 30, {});
    }
    expect(f.baseUsed).toBe(3);
    tap(w, { ability: true });
    hold(w, 20, {});
    expect(f.baseUsed, 'no fourth use').toBe(3);
    hold(w, 60, {}); // ~2 s since the first use: one charge is back
    expect(f.baseUsed).toBe(2);
    tap(w, { ability: true });
    hold(w, 20, {});
    expect(f.baseUsed).toBe(3);
    hold(w, 130, {});
    expect(f.baseUsed).toBeLessThanOrEqual(2);
    hold(w, 360, {});
    expect(f.baseUsed).toBe(0);
  });

  it('stretch punch reaches a fighter far away but deals no damage', () => {
    const w = world('luffy');
    put(w, 0, 10 * TILE);
    put(w, 1, 10 * TILE + 90);
    settle(w);
    const o = w.fighters[1];
    tap(w, { ability: true });
    let hit = false;
    for (let t = 0; t < 20; t++) {
      w.step([]);
      if (w.events.some((e) => e.t === 'hit' && e.weapon === 'gumgum')) hit = true;
    }
    expect(hit).toBe(true);
    expect(o.hp).toBe(o.maxHp); // a traversal tool: it shoves, it never hurts
  });

  it('misses beyond its range', () => {
    const w = world('luffy');
    put(w, 0, 10 * TILE);
    put(w, 1, 10 * TILE + 140);
    settle(w);
    tap(w, { ability: true });
    hold(w, 30, {});
    expect(w.fighters[1].hp).toBe(w.fighters[1].maxHp);
  });

  it('a fist that hits a wall rockets Luffy to it', () => {
    const w = world('luffy');
    put(w, 0, 34 * TILE, FLOOR, 1); // the right wall is 4 tiles away (x = 39 * 16)
    put(w, 1, 4 * TILE);
    settle(w);
    const f = w.fighters[0];
    const x0 = f.x;
    let rocket = false;
    for (let t = 0; t < 40; t++) {
      w.step([intent({ ability: true })]); // (held: the grab only pulls while the button is down)
      if (w.events.some((e) => e.t === 'rocket')) rocket = true;
    }
    hold(w, 20, {});
    expect(rocket).toBe(true);
    expect(f.x).toBeGreaterThan(x0 + 30);
    expect(f.state).toBe('normal');
  });

  it('holding up angles the punch upward', () => {
    const w = world('luffy');
    put(w, 0, 10 * TILE);
    put(w, 1, 34 * TILE);
    settle(w);
    const f = w.fighters[0];
    hold(w, 1, { ability: true, moveY: -1 });
    expect(f.stretchAngle).toBeLessThan(0);
  });
});

describe('scrapyard fighters', () => {
  it('ABILITY does nothing without a hero', () => {
    const w = world('');
    put(w, 0, 10 * TILE);
    put(w, 1, 34 * TILE);
    settle(w);
    const f = w.fighters[0];
    tap(w, { ability: true });
    expect(f.state).toBe('normal');
    expect(f.flying).toBe(false);
  });
});
