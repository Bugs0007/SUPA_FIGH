import { describe, expect, it } from 'vitest';
import { BotController } from '../../src/ai/bot';
import { TILE } from '../../src/sim/constants';
import { SLOT } from '../../src/sim/data/weapons';
import type { FighterSpawn } from '../../src/sim/fighter';
import { transform } from '../../src/sim/hero';
import { getMap } from '../../src/sim/map/maps';
import { World } from '../../src/sim/world';
import { intent, spec } from './helpers';

const luffy: FighterSpawn = { name: 'luffy', team: 0, isBot: true, upJumps: false, hero: 'luffy' };

/** A bot Luffy at `level` (0..4) is shot at by a stationary pistol dummy; returns how it fared over `seconds`. */
function underFire(level: number, difficulty: 'easy' | 'normal' | 'hard' | 'expert', seconds: number, seed = 1) {
  const w = new World(getMap('test'), [luffy, spec('shooter')], { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 5);
  w.props.length = 0;
  const [a, b] = w.fighters;
  a.x = a.px = 6 * TILE;
  a.y = a.py = 27 * TILE;
  b.x = b.px = 16 * TILE;
  b.y = b.py = 27 * TILE;
  b.facing = -1;
  b.hp = b.maxHp = 100000;
  b.inv[SLOT.SIDEARM] = { id: 'pistol', ammo: 9999, dur: 1 };
  b.active = SLOT.SIDEARM;
  for (let i = 0; i < level; i++) transform(w, a);
  const bot = new BotController(() => w, 0, { difficulty, seed });
  let reflects = 0;
  let blockTicks = 0;
  for (let t = 0; t < 60 * seconds; t++) {
    // (the shooter keeps its pistol up and tapping the trigger)
    w.step([bot.poll(), intent({ attack: t % 12 < 6, moveX: 0 })]);
    for (const e of w.events) if (e.t === 'reflect') reflects++;
    w.events.length = 0;
    if (a.state === 'block') blockTicks++;
  }
  return { w, a, b, reflects, blockTicks };
}

describe('bot Gear Fifth reflects', () => {
  it('a hard Gear Fifth bot guards against gunfire and throws the shots back', () => {
    const r = underFire(4, 'hard', 12);
    expect(r.reflects).toBeGreaterThan(0);
    expect(r.blockTicks).toBeGreaterThan(0);
  });

  it('lower gears never reflect', () => {
    const r = underFire(2, 'hard', 12);
    expect(r.reflects).toBe(0);
  });

  it('an expert reflects more than an easy bot', () => {
    let easy = 0;
    let expert = 0;
    for (const seed of [1, 2, 3]) {
      easy += underFire(4, 'easy', 10, seed).reflects;
      expert += underFire(4, 'expert', 10, seed).reflects;
    }
    expect(expert).toBeGreaterThan(easy);
  });
});
