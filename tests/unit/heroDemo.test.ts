import { describe, expect, it } from 'vitest';
import { HEROES, HERO_ORDER, POWER_ORB } from '../../src/sim/data/heroes';
import { POKEMON_PARTNERS, pokemonEvolutionTime, pokemonStage, POKEMON_TIMING } from '../../src/sim/data/pokemon';
import { rosterSpecial } from '../../src/sim/data/rosterSpecials';
import { HeroDemo, demoModes, demoMoveName, describeDemoMove, minDemoForm } from '../../src/scenes/heroDemo';

describe('arena move demonstrations', () => {
  it.each(POKEMON_PARTNERS)('%s reaches its major form through a power orb', pokemon => {
    const last = pokemonStage(pokemon, 0).maxStage;
    const demo = new HeroDemo('ash', 'base', last - 1, pokemon);
    const world = demo.world;
    const trainer = world.fighters[0];
    const companion = world.fighters[trainer.trainer!.slot];
    world.settings.noPickups = false;
    const orb = world.spawnWeapon(POWER_ORB, trainer.x, trainer.y);
    world.step([]);
    expect(orb.active).toBe(false);
    expect(trainer.trainer!.active).toBe(-1);
    expect(companion.alive).toBe(false);
    expect(companion.pokemon).toMatchObject({ stage: last, previousStage: last - 1, move: 'evolve' });
    expect(companion.name).toBe(pokemonStage(pokemon, last).name);
    expect(pokemonEvolutionTime(pokemon, last, last - 1)).toBe(POKEMON_TIMING.ascend);
  });

  it.each(POKEMON_PARTNERS)('%s can demonstrate every evolved attack in the arena', pokemon => {
    const maxStage = pokemonStage(pokemon, 0).maxStage;
    for (let level = 0; level <= maxStage; level++) {
      for (const mode of ['base', 'second', 'super'] as const) {
        const demo = new HeroDemo('ash', mode, level, pokemon);
        const rival = demo.world.fighters[1];
        while (!demo.done && rival.hp === rival.maxHp) {
          demo.step();
          demo.world.events.length = 0;
        }
        expect(rival.hp, `${pokemon} stage ${level}, ${mode}`).toBeLessThan(rival.maxHp);
      }
    }
  });

  it.each(['charmander', 'gible'] as const)('%s shows mount, takeoff and descent using normal controls', pokemon => {
    const demo = new HeroDemo('ash', 'mount', 0, pokemon);
    const [ash] = demo.world.fighters;
    const partner = demo.world.fighters[ash.trainer!.slot];
    expect(pokemonStage(pokemon, demo.level).flies).toBe(true);
    let mounted = false;
    let climbed = false;
    let descended = false;
    while (!demo.done) {
      demo.step();
      mounted ||= ash.trainer!.mounted;
      climbed ||= mounted && partner.vy < -40;
      descended ||= climbed && partner.vy > 40;
      demo.world.events.length = 0;
    }
    expect({ mounted, climbed, descended }).toEqual({ mounted: true, climbed: true, descended: true });
  });

  it.each(['squirtle', 'bulbasaur', 'froakie', 'pikachu', 'treecko', 'riolu'] as const)(
    '%s shows a ground mount walking and jumping in the arena',
    pokemon => {
      const demo = new HeroDemo('ash', 'mount', 0, pokemon);
      const [ash] = demo.world.fighters;
      const partner = demo.world.fighters[ash.trainer!.slot];
      let walked = false;
      let jumped = false;
      while (!demo.done) {
        demo.step();
        if (ash.trainer!.mounted) {
          expect(partner.flying).toBe(false);
          walked ||= partner.grounded && Math.abs(partner.vx) > 40;
          jumped ||= partner.vy < -40;
        }
        demo.world.events.length = 0;
      }
      expect(walked && jumped).toBe(true);
    },
  );

  for (const hero of HERO_ORDER) {
    for (const mode of demoModes(hero).filter(mode => mode !== 'mount')) {
      it(`${hero || 'scrapper'} ${mode} interacts with a real sparring rival`, () => {
        const centered = mode === 'super' && HEROES[hero]?.super.bomb?.centered;
        const special = mode === 'special' ? rosterSpecial(hero) : undefined;
        const weapon = `${hero || 'scrapper'}:special`;
        for (let level = minDemoForm(hero, mode); level <= (HEROES[hero]?.forms.length ?? 0); level++) {
          const demo = new HeroDemo(hero, mode, level);
          expect(demo.world.def.id).toBe('dojo');
          const fighter = demo.world.fighters[0];
          expect(fighter.trainer?.stage ?? fighter.powerLevel).toBe(level);
          let interacted = false;
          let specialStarted = false;
          let immediateBurst = false;
          let bursts = 0;
          while (!demo.done) {
            demo.step();
            const events = demo.world.events;
            interacted ||= events.some(e => mode === 'guard' ? (demo.reflecting ? e.t === 'reflect' && e.victim === 0 : e.t === 'block' && (e.victim === 0 || e.victim === fighter.trainer?.slot))
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
