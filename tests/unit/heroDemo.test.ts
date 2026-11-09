import { describe, expect, it } from 'vitest';
import { HEROES, HERO_ORDER } from '../../src/sim/data/heroes';
import { rosterSpecial } from '../../src/sim/data/rosterSpecials';
import { HeroDemo, demoModes, demoMoveName, describeDemoMove, minDemoForm } from '../../src/scenes/heroDemo';

describe('arena move demonstrations', () => {
  for (const hero of HERO_ORDER) {
    for (const mode of demoModes(hero)) {
      it(`${hero || 'scrapper'} ${mode} interacts with a real sparring rival`, () => {
        const centered = mode === 'super' && HEROES[hero]?.super.bomb?.centered;
        const special = mode === 'special' ? rosterSpecial(hero) : undefined;
        const weapon = `${hero || 'scrapper'}:special`;
        for (let level = minDemoForm(hero, mode); level <= (HEROES[hero]?.forms.length ?? 0); level++) {
          const demo = new HeroDemo(hero, mode, level);
          expect(demo.world.def.id).toBe('dojo');
          expect(demo.world.fighters[0].powerLevel).toBe(level);
          let interacted = false;
          let specialStarted = false;
          let immediateBurst = false;
          let bursts = 0;
          while (!demo.done) {
            demo.step();
            const events = demo.world.events;
            interacted ||= events.some(e => mode === 'guard' ? (demo.reflecting ? e.t === 'reflect' && e.victim === 0 : e.t === 'block' && e.victim === 0)
              : e.t === 'hit' && e.victim === 1 && (!special || e.weapon === weapon) || mode === 'base' && e.t === 'blink' && e.f === 0);
            if (special) specialStarted ||= events.some(e => e.t === 'rosterSpecial' && e.phase === 'start' && e.f === 0 && e.hero === (hero || 'scrapper'));
            if (centered) {
              const tickBursts = events.filter(e => e.t === 'explosion' && e.weapon === hero + ':super').length;
              bursts += tickBursts;
              immediateBurst ||= tickBursts === 1 && events.some(e => e.t === 'superStart' && e.f === 0);
            }
            events.length = 0;
          }
          expect(interacted, 'form ' + level).toBe(true);
          if (special) expect(specialStarted).toBe(true);
          if (centered) {
            expect(immediateBurst).toBe(true);
            expect(bursts).toBe(1);
          }
        }
      });
    }
  }

  it('shows one named Attack + Ability move for every roster fighter', () => {
    const names = HERO_ORDER.map(hero => {
      expect(demoModes(hero)).toContain('special');
      const level = minDemoForm(hero, 'special');
      expect(describeDemoMove(hero, 'special', level)).toMatch(/^ATTACK \+ ABILITY\./);
      return demoMoveName(hero, 'special', level);
    });
    expect(names.every(Boolean)).toBe(true);
    expect(new Set(names).size).toBe(HERO_ORDER.length);
  });

  it('gives Sasuke’s dragon fire only to the Curse Mark projectile', () => {
    expect([0, 1, 2, 3, 4].map(level => demoMoveName('sasuke', 'second', level))).toEqual([
      'FIRE STYLE: FIREBALL', 'FIRE STYLE: FIREBALL', 'GREAT DRAGON FIRE', 'AMATERASU', 'AMATERASU',
    ]);
    const demo = new HeroDemo('sasuke', 'second', 2);
    let fired = false;
    while (!demo.done) {
      demo.step();
      fired ||= demo.world.bullets.some(bullet => bullet.active && bullet.weapon === 'sasuke:second' && bullet.form === 2);
      demo.world.events.length = 0;
    }
    expect(fired).toBe(true);
  });

  it.each(['asta', 'yami'])('%s special demonstrates real projectile cancellation', hero => {
    const demo = new HeroDemo(hero, 'special', 0);
    let absorbed = false;
    while (!demo.done) {
      demo.step();
      absorbed ||= demo.world.events.some(e => e.t === 'projectileFizzle');
      demo.world.events.length = 0;
    }
    expect(absorbed).toBe(true);
    expect(demo.world.fighters[0].hp).toBe(demo.world.fighters[0].maxHp);
  });
});
