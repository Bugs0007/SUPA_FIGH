import { describe, expect, it } from 'vitest';
import { BotController, solveThrow } from '../../src/ai/bot';
import { runBotSim } from '../../src/ai/botsim';
import { TILE } from '../../src/sim/constants';
import { SLOT, weaponDef } from '../../src/sim/data/weapons';
import { getMap } from '../../src/sim/map/maps';
import { World } from '../../src/sim/world';
import { transform } from '../../src/sim/hero';
import { FLAT, intent, spec } from './helpers';

describe('bots', () => {
  it('bot-only matches finish rounds, kill each other and never get stuck', () => {
    for (const difficulty of ['easy', 'expert'] as const) {
      const r = runBotSim({ matches: 2, bots: 8, map: 'test', difficulty, seed: 7 });
      expect(r.timeouts, difficulty).toBe(0);
      expect(r.totalKills, difficulty).toBeGreaterThan(20);
      expect(r.maxIdle, `${difficulty}: ${r.idleAt}`).toBeLessThan(10);
    }
  });

  it('an unarmed bot goes and picks up a gun', () => {
    const w = new World(getMap('test'), [spec('bot')], { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 3);
    const f = w.fighters[0];
    f.x = f.px = 4 * TILE;
    f.y = f.py = 27 * TILE;
    w.spawnWeapon('smg', 45 * TILE, 20 * TILE); // up on the right-hand wooden platform
    const bot = new BotController(() => w, 0, { difficulty: 'normal', seed: 1 });
    for (let t = 0; t < 60 * 25 && !f.inv[SLOT.HEAVY]; t++) w.step([bot.poll()]);
    expect(f.inv[SLOT.HEAVY]?.id).toBe('smg');
  });

  it('a bot hunts down a target on another floor and hurts it', () => {
    const w = new World(getMap('test'), [spec('bot'), spec('dummy')], { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 5);
    w.props.length = 0;
    const [f, d] = w.fighters;
    f.x = f.px = 4 * TILE;
    f.y = f.py = 27 * TILE;
    d.x = d.px = 27 * TILE;
    d.y = d.py = 14 * TILE; // on the metal catwalk
    const bot = new BotController(() => w, 0, { difficulty: 'hard', seed: 2 });
    for (let t = 0; t < 60 * 40 && d.hp === 100; t++) w.step([bot.poll(), intent()]);
    expect(d.hp).toBeLessThan(100);
  });

  it('throw solver lands grenades near the target', () => {
    const w = new World(FLAT, [spec('A')], { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 1);
    const f = w.fighters[0];
    f.x = 100;
    f.y = 9 * TILE;
    f.facing = 1;
    const th = weaponDef('grenade').throw!;
    for (const dist of [80, 140, 200]) {
      const a = solveThrow(w, f, th, f.x + dist, f.y);
      expect(a, `dist ${dist}`).not.toBeNull();
    }
  });

  it('bot behavior is deterministic for a seed', () => {
    const a = runBotSim({ matches: 1, bots: 6, map: 'test', difficulty: 'normal', seed: 42 });
    const b = runBotSim({ matches: 1, bots: 6, map: 'test', difficulty: 'normal', seed: 42 });
    expect(JSON.stringify(a.kills)).toBe(JSON.stringify(b.kills));
  });
});

describe('bots and hero powers (M9)', () => {
  const heroSpec = (name: string, hero: string) => ({ ...spec(name), isBot: true, hero });

  it.each([
    ['luffy', 'luffy:second'],
    ['goku', 'goku:second'],
  ] as const)('a base-form %s bot uses ability 2 (%s) at mid range', (hero, weapon) => {
    const w = new World(FLAT, [heroSpec('bot', hero), spec('dummy')], { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 4);
    const [f, d] = w.fighters;
    f.x = f.px = 80;
    d.x = d.px = hero === 'luffy' ? 120 : 180;
    const bot = new BotController(() => w, 0, { difficulty: 'hard', seed: 3 });
    let used = false;
    for (let t = 0; t < 60 * 8 && !used; t++) {
      w.step([bot.poll(), intent()]);
      used = w.events.some((e) => e.t === 'hit' && e.weapon === weapon);
    }
    expect(used).toBe(true);
  });

  it('a naruto bot summons shadow clones at mid range, and they fight with the Rasengan', () => {
    const w = new World(FLAT, [heroSpec('bot', 'naruto'), spec('dummy')], { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 4);
    const [f, d] = w.fighters;
    f.x = f.px = 80;
    d.x = d.px = 200;
    const bots = w.fighters.map((c, i) => new BotController(() => w, i, { difficulty: 'hard', seed: 3 + i, clone: c.master >= 0 }));
    let summoned = false;
    let rasengan = false;
    for (let t = 0; t < 60 * 12 && !(summoned && rasengan); t++) {
      w.step(bots.map((b) => b.poll()));
      summoned ||= f.cloneCount >= 2;
      rasengan ||= w.fighters.some((c) => c.master >= 0 && c.alive && c.specialKind === 'rasengan');
    }
    expect(summoned).toBe(true);
    expect(rasengan).toBe(true);
  });

  it('a transformed bot fires its super when the target is in range', () => {
    const w = new World(FLAT, [heroSpec('bot', 'luffy'), spec('dummy')], { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 4);
    const [f, d] = w.fighters;
    f.x = f.px = 100;
    d.x = d.px = 200;
    transform(w, f);
    const bot = new BotController(() => w, 0, { difficulty: 'hard', seed: 3 });
    let supered = false;
    for (let t = 0; t < 60 * 10 && !supered; t++) {
      w.step([bot.poll(), intent()]);
      supered = w.events.some((e) => e.t === 'superStart');
    }
    expect(supered).toBe(true);
  });

  it.each([
    ['naruto', 'rasengan'],
    ['luffy', 'gumgum'],
  ] as const)('a base-form %s bot uses its signature move (%s)', (hero, weapon) => {
    const w = new World(FLAT, [heroSpec('bot', hero), spec('dummy')], { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 4);
    const [f, d] = w.fighters;
    f.x = f.px = 100;
    d.x = d.px = 160;
    const bot = new BotController(() => w, 0, { difficulty: 'hard', seed: 3 });
    let used = false;
    for (let t = 0; t < 60 * 8 && !used; t++) {
      w.step([bot.poll(), intent()]);
      used = w.events.some((e) => e.t === 'hit' && e.weapon === weapon);
    }
    expect(used).toBe(true);
  });

  it('a hero bot goes for a power orb across the map and transforms', () => {
    const w = new World(getMap('test'), [heroSpec('bot', 'goku')], { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 3);
    const f = w.fighters[0];
    f.x = f.px = 4 * TILE;
    f.y = f.py = 27 * TILE;
    w.spawnWeapon('powerorb', 45 * TILE, 20 * TILE);
    const bot = new BotController(() => w, 0, { difficulty: 'normal', seed: 1 });
    for (let t = 0; t < 60 * 25 && !f.power; t++) w.step([bot.poll()]);
    expect(f.power).toBe('hero');
    expect(f.powerLevel).toBe(1);
  });

  it('bots with heroes and power-ups finish matches without getting stuck', () => {
    const r = runBotSim({ matches: 1, bots: 6, map: 'alien', difficulty: 'normal', seed: 5, heroes: ['naruto', 'luffy', 'goku'], heroPowers: true });
    expect(r.timeouts).toBe(0);
    expect(r.totalKills).toBeGreaterThan(5);
    expect(r.maxIdle, r.idleAt).toBeLessThan(10);
  });
});
