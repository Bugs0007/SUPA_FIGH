import { describe, expect, it } from 'vitest';
import { defaultLobby, lobbyToMatch, slotStartForm } from '../../src/scenes/lobby';
import { FORM_HP, maxLevel } from '../../src/sim/data/heroes';
import { transform } from '../../src/sim/hero';
import { Match } from '../../src/sim/match';
import { World } from '../../src/sim/world';
import { FLAT, run } from './helpers';

const spec = (hero: string | undefined, startForm?: number) => ({ name: 'X', team: 0, isBot: false, upJumps: false, hero, startForm });
const worldOf = (...specs: ReturnType<typeof spec>[]) => new World(FLAT, specs, { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 7);

describe('start form (sim)', () => {
  it('a hero starts the round in the requested form, as if it had eaten that many orbs', () => {
    for (const hero of ['naruto', 'luffy', 'goku', 'sasuke']) {
      for (let lv = 0; lv <= maxLevel(hero); lv++) {
        const f = worldOf(spec(hero, lv), spec('goku')).fighters[0];
        expect(f.powerLevel).toBe(lv);
        expect(f.power).toBe(lv ? 'hero' : '');
        expect(f.powerFull).toBe(lv > 0);
        expect(f.formHp).toBe(lv * FORM_HP);
        expect(f.specialCd).toBe(0);
      }
    }
  });

  it('matches the state an orb gives (same fields as transform)', () => {
    const viaOrbs = worldOf(spec('sasuke'), spec('goku')).fighters[0];
    const w = worldOf(spec('sasuke'), spec('goku'));
    for (let i = 0; i < 3; i++) transform(w, w.fighters[0]);
    const viaSpec = worldOf(spec('sasuke', 3), spec('goku')).fighters[0];
    expect(viaOrbs.powerLevel).toBe(0);
    for (const k of ['power', 'powerLevel', 'powerFull', 'powerMax', 'powerTime', 'formHp', 'specialCd'] as const) {
      expect(viaSpec[k]).toBe(w.fighters[0][k]);
    }
  });

  it('is capped at the hero top form, and ignored for non-heroes', () => {
    expect(worldOf(spec('goku', 99), spec('luffy')).fighters[0].powerLevel).toBe(maxLevel('goku'));
    expect(worldOf(spec('goku', -3), spec('luffy')).fighters[0].powerLevel).toBe(0);
    const plain = worldOf(spec(undefined, 3), spec('luffy')).fighters[0];
    expect(plain.power).toBe('');
    expect(plain.powerLevel).toBe(0);
  });

  it('shadow clones do not get a form of their own, but copy their master\'s', () => {
    const w = worldOf(spec('naruto', 2), spec('goku'));
    const clones = w.fighters.filter((f) => f.master >= 0);
    expect(clones.length).toBeGreaterThan(0);
    for (const c of clones) expect(c.powerLevel).toBe(0);
    expect(w.fighters[0].powerLevel).toBe(2);
  });

  it('survives a respawn and a new round', () => {
    const w = worldOf(spec('luffy', 2), spec('goku'));
    run(w, 5);
    w.fighters[0].powerLevel = 0;
    w.fighters[0].power = '';
    w.fighters[0].formHp = 0;
    w.respawn(w.fighters[0]);
    expect(w.fighters[0].powerLevel).toBe(2);
    expect(w.fighters[0].formHp).toBe(2 * FORM_HP);

    const m = new Match({
      mapId: 'test',
      mode: 'brawl',
      fighters: [spec('goku', 4), spec('naruto', 1)],
      roundsToWin: 3,
      timeLimit: 60,
      suddenDeath: 0,
      friendlyFire: false,
      weaponSpawnRate: 0,
      chaos: false,
      heroPowers: false,
      seed: 3,
    });
    expect(m.world.fighters[0].powerLevel).toBe(4);
    expect(m.world.fighters[1].powerLevel).toBe(1);
  });
});

describe('start form (lobby)', () => {
  it('defaults to base and passes the chosen form into the match', () => {
    const c = defaultLobby();
    expect(c.slots.every((s) => s.form === 0)).toBe(true);
    c.slots[0].hero = 'goku';
    c.slots[0].form = 3;
    c.slots[2].hero = 'sasuke';
    c.slots[2].form = 1;
    const m = lobbyToMatch(c, 1);
    expect(m.config.fighters[0].startForm).toBe(3);
    expect(m.config.fighters[2].startForm).toBe(1);
    expect(m.config.fighters[1].startForm).toBeUndefined();
  });

  it('only heroes can start transformed, and the form is capped', () => {
    expect(slotStartForm({ hero: '', form: 3 })).toBe(0);
    expect(slotStartForm({ hero: 'luffy', form: 99 })).toBe(maxLevel('luffy'));
    expect(slotStartForm({ hero: 'luffy', form: -2 })).toBe(0);
    expect(slotStartForm({ hero: 'luffy', form: Number.NaN })).toBe(0);
    const c = defaultLobby();
    c.slots[2].form = 4; // a scrapyard bot with a stale form setting
    expect(lobbyToMatch(c, 1).config.fighters[2].startForm).toBeUndefined();
  });
});
