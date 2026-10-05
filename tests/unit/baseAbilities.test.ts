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

describe('Goku: levitation', () => {
  it('ABILITY takes off; flies in all 4 directions; hovers without falling', () => {
    const w = world('goku');
    put(w, 0, 10 * TILE);
    put(w, 1, 34 * TILE);
    settle(w);
    const f = w.fighters[0];
    tap(w, { ability: true });
    expect(f.flying).toBe(true);
    hold(w, 20, {});
    const hoverY = f.y;
    expect(hoverY).toBeLessThan(FLOOR - 4);
    hold(w, 30, {});
    expect(Math.abs(f.y - hoverY)).toBeLessThan(6); // hovering, not falling
    let y = f.y;
    hold(w, 20, { moveY: -1 });
    expect(f.y).toBeLessThan(y - 20); // up
    let x = f.x;
    hold(w, 20, { moveX: 1 });
    expect(f.x).toBeGreaterThan(x + 20); // right
    hold(w, 15, {}); // momentum: let him stop before reversing
    x = f.x;
    hold(w, 20, { moveX: -1 });
    expect(f.x).toBeLessThan(x - 20); // left
    y = f.y;
    hold(w, 12, { moveY: 1 });
    expect(f.y).toBeGreaterThan(y + 10); // down
    expect(f.flying).toBe(true);
  });

  it('the meter runs out and he drops; it refills on the ground', () => {
    const w = world('goku');
    put(w, 0, 10 * TILE);
    put(w, 1, 34 * TILE);
    settle(w);
    const f = w.fighters[0];
    const max = HEROES.goku.base.fly!.meter;
    tap(w, { ability: true });
    hold(w, Math.ceil((max + 0.3) * 60), { moveY: -1 });
    expect(f.flying).toBe(false);
    expect(f.flyMeter).toBe(0);
    hold(w, 90, {});
    expect(f.grounded).toBe(true);
    hold(w, 120, {});
    expect(f.flyMeter).toBeGreaterThan(1.5);
  });

  it('flying down to the floor lands; ABILITY again also lands', () => {
    const w = world('goku');
    put(w, 0, 10 * TILE);
    put(w, 1, 34 * TILE);
    settle(w);
    const f = w.fighters[0];
    tap(w, { ability: true });
    hold(w, 30, {});
    hold(w, 60, { moveY: 1 });
    expect(f.flying).toBe(false);
    expect(f.grounded).toBe(true);
    hold(w, 30, {});
    tap(w, { ability: true });
    expect(f.flying).toBe(true);
    hold(w, 20, {});
    tap(w, { ability: true });
    expect(f.flying).toBe(false);
  });

  it('jumping again with no air jumps left takes off too', () => {
    const w = world('goku');
    put(w, 0, 10 * TILE);
    put(w, 1, 34 * TILE);
    settle(w);
    const f = w.fighters[0];
    hold(w, 10, { jump: true });
    hold(w, 2, {});
    hold(w, 6, { jump: true }); // double jump
    hold(w, 2, {});
    expect(f.flying).toBe(false);
    hold(w, 2, { jump: true }); // third press
    expect(f.flying).toBe(true);
  });

  it('getting punched out of the sky ends the flight', () => {
    const w = world('goku');
    put(w, 0, 10 * TILE);
    put(w, 1, 34 * TILE);
    settle(w);
    const f = w.fighters[0];
    tap(w, { ability: true });
    hold(w, 20, {});
    const o = w.fighters[1];
    o.x = f.x + 9;
    o.y = f.y;
    o.facing = -1;
    w.step([intent(), intent({ attack: true })]);
    for (let t = 0; t < 20; t++) w.step([intent(), intent()]);
    expect(f.hp).toBeLessThan(f.maxHp);
    expect(f.flying).toBe(false);
  });

  it('once transformed, flight never runs out', () => {
    const w = world('goku');
    put(w, 0, 10 * TILE);
    put(w, 1, 34 * TILE);
    settle(w);
    const f = w.fighters[0];
    transform(w, f);
    // jump, double jump, third press = flight; the meter does not drain
    hold(w, 10, { jump: true });
    hold(w, 2, {});
    hold(w, 6, { jump: true });
    hold(w, 2, {});
    hold(w, 2, { jump: true });
    expect(f.flying).toBe(true);
    const m = f.flyMeter;
    hold(w, 300, {});
    expect(f.flying).toBe(true);
    expect(f.flyMeter).toBe(m);
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
  it('stretch punch hits a fighter far away', () => {
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
    expect(o.hp).toBeLessThan(o.maxHp);
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
    tap(w, { ability: true });
    let rocket = false;
    for (let t = 0; t < 30; t++) {
      w.step([]);
      if (w.events.some((e) => e.t === 'rocket')) rocket = true;
    }
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
