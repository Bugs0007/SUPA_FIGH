import { describe, expect, it } from 'vitest';
import { HeroDemo, demoMoveName } from '../../src/scenes/heroDemo';
import { applyWorld, encodeWorld } from '../../src/net/renderState';
import { DT } from '../../src/sim/constants';
import { DRAGON_FIST } from '../../src/sim/data/heroes';

describe('Dragon Fist', () => {
  it('rushes into one real hit in the Super Saiyan 3 move demo and survives snapshot round-trip', () => {
    const demo = new HeroDemo('goku', 'special', DRAGON_FIST.level);
    const mirror = new HeroDemo('goku', 'special', DRAGON_FIST.level);
    const [goku, rival] = demo.world.fighters;
    const start = goku.x;
    const rivalHp = rival.hp;
    let launches = 0;
    let hits = 0;
    let largestStep = 0;
    while (!demo.done) {
      const before = goku.x;
      demo.step();
      if (goku.specialKind === 'dragonFist') largestStep = Math.max(largestStep, Math.abs(goku.x - before));
      for (const event of demo.world.events) {
        if (event.t === 'superStart' && event.name === 'DRAGON FIST') {
          launches++;
          applyWorld(mirror.world, JSON.parse(JSON.stringify(encodeWorld(demo.world))));
          expect(mirror.world.fighters[0].specialKind).toBe('dragonFist');
        }
        if (event.t === 'hit' && event.weapon === 'goku:dragonFist') hits++;
      }
      demo.world.events.length = 0;
    }
    expect(demoMoveName('goku', 'special', 3)).toBe('DRAGON FIST');
    expect(launches).toBe(1);
    expect(hits).toBe(1);
    expect(goku.x).toBeGreaterThan(start + 60);
    expect(largestStep).toBeLessThanOrEqual(DRAGON_FIST.speed * DT + 0.01);
    expect(rival.hp).toBeLessThan(rivalHp);
    expect(goku.specialKind).toBe('');
  });

  it.each([1, 2, 4])('keeps Vanish Strike at form %i', (level) => {
    const demo = new HeroDemo('goku', 'special', level);
    while (!demo.done && demo.world.fighters[0].state !== 'special') demo.step();
    expect(demoMoveName('goku', 'special', level)).toBe('VANISH STRIKE');
    expect(demo.world.fighters[0].specialKind).toBe('formCombo');
  });
});
