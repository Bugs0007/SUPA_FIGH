import { describe, expect, it } from 'vitest';
import { BotController, solveThrow } from '../../src/ai/bot';
import { runBotSim } from '../../src/ai/botsim';
import { TILE } from '../../src/sim/constants';
import { SLOT, weaponDef } from '../../src/sim/data/weapons';
import { getMap } from '../../src/sim/map/maps';
import { World } from '../../src/sim/world';
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
