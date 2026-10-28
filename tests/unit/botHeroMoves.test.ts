import { describe, expect, it } from 'vitest';
import { BotController } from '../../src/ai/bot';
import { TILE } from '../../src/sim/constants';
import type { FighterSpawn } from '../../src/sim/fighter';
import { getMap } from '../../src/sim/map/maps';
import { World } from '../../src/sim/world';
import { intent, spec } from './helpers';

const heroSpec = (hero: string): FighterSpawn => ({ name: hero, team: 0, isBot: true, upJumps: false, hero });

/** One hero bot hunting a passive dummy; returns the event types seen. */
function hunt(hero: string, start: [number, number], dummy: [number, number], seconds: number, seed = 1) {
  const w = new World(getMap('test'), [heroSpec(hero), spec('dummy')], { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 5);
  w.props.length = 0;
  const [f, d] = w.fighters;
  f.x = f.px = start[0] * TILE;
  f.y = f.py = start[1] * TILE;
  d.x = d.px = dummy[0] * TILE;
  d.y = d.py = dummy[1] * TILE;
  d.hp = 100000;
  const bot = new BotController(() => w, 0, { difficulty: 'hard', seed });
  const seen = new Set<string>();
  const phases = new Set<string>();
  let minY = f.y;
  for (let t = 0; t < 60 * seconds; t++) {
    w.step([bot.poll(), intent()]);
    for (const e of w.events) {
      seen.add(e.t);
      if (e.t === 'rasengan') phases.add(e.phase);
    }
    w.events.length = 0;
    minY = Math.min(minY, f.y);
  }
  return { w, f, d, seen, phases, minY };
}

describe('bot hero movement', () => {
  it("Goku's bot flies up to a target on a higher floor", () => {
    const r = hunt('goku', [4, 27], [27, 14], 30);
    expect(r.seen.has('flyStart')).toBe(true);
  });

  it("Luffy's bot grapples toward a target on a higher floor", () => {
    const r = hunt('luffy', [4, 27], [27, 14], 30);
    expect(r.seen.has('rocket')).toBe(true);
  });

  it("Naruto's bot walks up walls and dashes along open ground", () => {
    const climb = hunt('naruto', [32.3, 27], [24, 24], 30);
    expect(climb.seen.has('wallwalk'), 'wall walk').toBe(true);
    const dash = hunt('naruto', [4, 27], [40, 27], 12);
    expect(dash.phases.has('dash'), 'rasengan dash').toBe(true);
  });
});

describe('bot round restarts', () => {
  it('forgets crouch / melee timers from the previous round (world time restarts at 0)', () => {
    let w = new World(getMap('test'), [spec('a'), spec('b')], { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 1);
    const bot = new BotController(() => w, 0, { difficulty: 'normal', seed: 1 });
    for (let t = 0; t < 120; t++) w.step([bot.poll(), intent()]);
    const priv = bot as unknown as { crouchUntil: number; meleeNext: number };
    priv.crouchUntil = 18;
    priv.meleeNext = 25;
    w = new World(getMap('test'), [spec('a'), spec('b')], { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 2);
    bot.poll();
    expect(priv.crouchUntil).toBe(0);
    expect(priv.meleeNext).toBe(0);
  });

  it('two bots standing in the same spot still fight', () => {
    const w = new World(getMap('test'), [spec('a'), spec('b')], { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 9);
    w.props.length = 0;
    const [a, b] = w.fighters;
    a.x = a.px = b.x = b.px = 20 * TILE;
    a.y = a.py = b.y = b.py = 27 * TILE;
    const bots = [new BotController(() => w, 0, { difficulty: 'hard', seed: 1 }), new BotController(() => w, 1, { difficulty: 'hard', seed: 2 })];
    for (let t = 0; t < 60 * 10; t++) w.step(bots.map((x) => x.poll()));
    expect(Math.min(a.hp, b.hp)).toBeLessThan(100);
  });
});
