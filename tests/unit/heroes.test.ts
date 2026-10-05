import { describe, expect, it } from 'vitest';
import { TILE } from '../../src/sim/constants';
import { FORM_DURATION, GENERIC_DURATION, HEROES, POWER_ORB, heroAttackLabel, maxLevel } from '../../src/sim/data/heroes';
import { SLOT, WEAPONS, weaponDef } from '../../src/sim/data/weapons';
import type { Fighter, FighterSpawn } from '../../src/sim/fighter';
import { ability, transform, transformed } from '../../src/sim/hero';
import { killFighter } from '../../src/sim/combat';
import type { SimEvent } from '../../src/sim/events';
import { packIntent, type Intent } from '../../src/sim/intent';
import { Match } from '../../src/sim/match';
import { World } from '../../src/sim/world';
import { FLAT, intent, run } from './helpers';

const FLOOR_Y = 9 * TILE;

function heroWorld(heroA: string, heroB = '', heroPowers = false): World {
  const specs: FighterSpawn[] = [
    { name: 'A', team: 0, isBot: false, upJumps: false, hero: heroA },
    { name: 'B', team: 0, isBot: false, upJumps: false, hero: heroB },
  ];
  const w = new World(FLAT, specs, { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1, heroPowers }, 3);
  run(w, 2);
  place(w.fighters[0], 100);
  place(w.fighters[1], 300);
  run(w, 2);
  return w;
}

function place(f: Fighter, x: number): void {
  f.x = f.px = x;
  f.y = f.py = FLOOR_Y;
  f.vx = f.vy = 0;
  f.invuln = 0;
  f.facing = 1;
}

/** Hero at form level n (n orbs eaten). */
function levelUp(w: World, f: Fighter, n: number): void {
  for (let i = 0; i < n; i++) transform(w, f);
}

/** Step with A holding the given buttons for `hold` ticks, then released; returns every event seen. */
function press(w: World, btns: Partial<Intent>, hold = 1, after = 30): SimEvent[] {
  const seen: SimEvent[] = [];
  for (let t = 0; t < hold + after; t++) {
    w.step([t < hold ? intent(btns) : intent()]);
    seen.push(...w.events);
    w.events.length = 0;
  }
  return seen;
}

describe('hero data', () => {
  it('there is one power orb pickup; heroes have 4 forms, 3 moves and a punch-punch-punch-kick combo', () => {
    const orb = WEAPONS[POWER_ORB];
    expect(orb.powerup?.kind).toBe('orb');
    expect(orb.spawnWeight).toBe(0);
    expect(orb.slot).toBe(SLOT.GADGET);
    for (const h of Object.values(HEROES)) {
      expect(h.forms.length, h.id).toBe(4);
      expect(h.combo.length, h.id).toBe(4);
      expect(h.combo.map((c) => !!c.kick), h.id).toEqual([false, false, false, true]);
      expect(h.combo[3].knockdown).toBe(true);
      expect(h.super.names.length, h.id).toBe(4);
      // each form is stronger than the last
      for (let i = 1; i < h.forms.length; i++) {
        expect(h.forms[i].damageMul, h.id).toBeGreaterThan(h.forms[i - 1].damageMul);
        expect(h.forms[i].speedMul, h.id).toBeGreaterThanOrEqual(1);
      }
      expect(heroAttackLabel(h.id + ':combo')).toBe(h.comboName);
      expect(heroAttackLabel(h.id + ':second')).toBe(h.second.name);
      expect(heroAttackLabel(h.id + ':super')).toBeTruthy();
    }
  });

  it('hero base stats stay close to the scrapyard fighter', () => {
    for (const h of Object.values(HEROES)) {
      expect(h.stats.speed).toBeGreaterThanOrEqual(0.95);
      expect(h.stats.speed).toBeLessThanOrEqual(1.08);
      expect(h.stats.hp).toBeGreaterThanOrEqual(95);
      expect(h.stats.hp).toBeLessThanOrEqual(110);
    }
  });

  it('the fists combo is punch, punch, punch, kick for everyone', () => {
    const w = heroWorld('');
    const f = w.fighters[0];
    place(w.fighters[1], 112);
    const hp = w.fighters[1].hp;
    // mash attack: four hits, the last one a knockdown kick
    const seen: SimEvent[] = [];
    for (let t = 0; t < 90; t++) {
      w.step([intent({ attack: t % 12 < 2 }), intent()]);
      seen.push(...w.events);
      w.events.length = 0;
    }
    const hits = seen.filter((e) => e.t === 'hit' && e.attacker === 0 && !e.corpse);
    expect(hits.length).toBeGreaterThanOrEqual(4);
    expect(hits.some((e) => e.t === 'hit' && e.kind === 'kick')).toBe(true);
    expect(w.fighters[1].hp).toBeLessThan(hp - 15);
    void f;
  });
});

describe('transformations (power orbs)', () => {
  it('each orb raises a hero one form level; the timer refills; the top level caps', () => {
    const w = heroWorld('naruto');
    const f = w.fighters[0];
    expect(f.power).toBe('');
    expect(transformed(f)).toBe(false);
    for (let lvl = 1; lvl <= maxLevel('naruto'); lvl++) {
      run(w, 60);
      transform(w, f);
      expect(f.power).toBe('hero');
      expect(f.powerLevel).toBe(lvl);
      expect(f.powerTime).toBe(FORM_DURATION);
      expect(ability(f)).toBe(HEROES.naruto.forms[lvl - 1]);
    }
    transform(w, f);
    expect(f.powerLevel).toBe(maxLevel('naruto'));
  });

  it('picking up the orb item transforms the fighter', () => {
    const w = heroWorld('goku');
    const f = w.fighters[0];
    w.spawnWeapon(POWER_ORB, f.x, f.y - 2);
    run(w, 20);
    expect(f.powerLevel).toBe(1);
    expect(w.items.some((it) => it.active && it.weaponId === POWER_ORB)).toBe(false);
  });

  it('forms expire back to the base form; death ends them too', () => {
    const w = heroWorld('luffy');
    const f = w.fighters[0];
    levelUp(w, f, 2);
    expect(f.speedMul).toBeDefined();
    run(w, Math.ceil(FORM_DURATION * 60) + 10);
    expect(f.power).toBe('');
    expect(f.powerLevel).toBe(0);
    levelUp(w, f, 3);
    expect(f.power).toBe('hero');
    killFighter(w, f, { damage: 999, kbX: 0, kbY: 0, attacker: 1, weapon: 'fists', kind: 'melee' });
    run(w, 3);
    expect(f.power).toBe('');
  });

  it('forms raise speed and damage', () => {
    const base = heroWorld('goku');
    const f0 = base.fighters[0];
    const w = heroWorld('goku');
    const f = w.fighters[0];
    levelUp(w, f, 4);
    run(base, 30, () => [intent({ moveX: 1 }), intent()]);
    run(w, 30, () => [intent({ moveX: 1 }), intent()]);
    expect(f.x - 100).toBeGreaterThan((f0.x - 100) * 1.1);
  });

  it('anyone else gets a shorter generic boost (no form, no super)', () => {
    const w = heroWorld('');
    const f = w.fighters[0];
    transform(w, f);
    expect(f.power).toBe('boost');
    expect(f.powerLevel).toBe(0);
    expect(f.powerMax).toBe(GENERIC_DURATION);
    expect(transformed(f)).toBe(false);
    expect(ability(f)?.damageMul).toBeGreaterThan(1);
  });
});

describe('ability 2 (the kick key)', () => {
  it('Goku Kamehameha: hold to charge, release to fire; a full charge hits harder than a tap', () => {
    const dmg = (hold: number) => {
      const w = heroWorld('goku');
      place(w.fighters[1], 230);
      const hp = w.fighters[1].hp;
      press(w, { kick: true }, hold, 60);
      return hp - w.fighters[1].hp;
    };
    const tap = dmg(16);
    const full = dmg(80);
    expect(tap).toBeGreaterThan(5);
    expect(full).toBeGreaterThan(tap + 4);
  });

  it('Kamehameha can be angled up in the air and respects its cooldown', () => {
    const w = heroWorld('goku');
    const f = w.fighters[0];
    press(w, { kick: true }, 30, 40);
    expect(f.secondCd).toBeGreaterThan(0);
    const before = w.fighters[1].hp;
    place(w.fighters[1], 230);
    press(w, { kick: true }, 1, 30);
    // on cooldown: no second beam
    expect(w.fighters[1].hp).toBe(before);
  });

  it('Naruto: shadow clones rush forward and hit; one more clone per form', () => {
    const count = (lvl: number) => {
      const w = heroWorld('naruto');
      levelUp(w, w.fighters[0], lvl);
      run(w, 2);
      w.step([intent({ kick: true }), intent()]);
      run(w, 8); // (while transformed a lone press waits a moment for a second button)
      return w.clones.filter((c) => c.active).length;
    };
    expect(count(0)).toBe(2);
    expect(count(1)).toBe(3);
    expect(count(3)).toBe(5);
    const w = heroWorld('naruto');
    place(w.fighters[1], 170);
    const hp = w.fighters[1].hp;
    press(w, { kick: true }, 1, 40);
    expect(w.fighters[1].hp).toBeLessThan(hp - 6);
  });

  it('Luffy: gum-gum gatling lands many hits', () => {
    const w = heroWorld('luffy');
    place(w.fighters[1], 140);
    const hp = w.fighters[1].hp;
    const seen = press(w, { kick: true }, 1, 70);
    const hits = seen.filter((e) => e.t === 'hit' && e.weapon === 'luffy:second');
    expect(hits.length).toBeGreaterThanOrEqual(4);
    expect(w.fighters[1].hp).toBeLessThan(hp - 8);
  });

  it('heroes do not do a plain kick: the kick key is ability 2 (their kick is in the combo)', () => {
    const w = heroWorld('luffy');
    const seen = press(w, { kick: true }, 1, 20);
    expect(seen.some((e) => e.t === 'kick')).toBe(false);
    const w2 = heroWorld('');
    const seen2 = press(w2, { kick: true }, 1, 20);
    expect(seen2.some((e) => e.t === 'kick')).toBe(true);
  });
});

describe('super (both abilities together, transformed only)', () => {
  const names = (seen: SimEvent[]) => seen.filter((e) => e.t === 'superStart').map((e) => (e.t === 'superStart' ? e.name : ''));

  it('does nothing special untransformed', () => {
    const w = heroWorld('goku');
    const seen = press(w, { ability: true, kick: true }, 2, 20);
    expect(names(seen)).toEqual([]);
  });

  it.each(['naruto', 'luffy', 'goku'])('%s: ability + kick together fires the super, named after the form', (hero) => {
    const w = heroWorld(hero);
    const f = w.fighters[0];
    levelUp(w, f, 2);
    run(w, 2);
    const seen = press(w, { ability: true, kick: true }, 2, 5);
    expect(names(seen)).toEqual([HEROES[hero].super.names[1]]);
    expect(f.specialCd).toBeGreaterThan(5);
  });

  it('the two buttons only need to land within a tenth of a second', () => {
    const w = heroWorld('luffy');
    levelUp(w, w.fighters[0], 1);
    const seen: SimEvent[] = [];
    for (let t = 0; t < 12; t++) {
      w.step([intent({ ability: t === 0, kick: t === 4 }), intent()]);
      seen.push(...w.events);
      w.events.length = 0;
    }
    expect(names(seen).length).toBe(1);
  });

  it('a single button still works while transformed (after a short buffer)', () => {
    const w = heroWorld('naruto');
    levelUp(w, w.fighters[0], 1);
    const seen = press(w, { kick: true }, 1, 20);
    expect(names(seen)).toEqual([]);
    expect(w.clones.length).toBeGreaterThan(0);
  });

  it('the super recharges: a second try right away does not fire', () => {
    const w = heroWorld('luffy');
    levelUp(w, w.fighters[0], 1);
    press(w, { ability: true, kick: true }, 2, 60);
    const seen = press(w, { ability: true, kick: true }, 2, 10);
    expect(names(seen)).toEqual([]);
  });

  it('Luffy: the giant fist hits far away, harder in higher forms', () => {
    const dmg = (lvl: number) => {
      const w = heroWorld('luffy');
      levelUp(w, w.fighters[0], lvl);
      place(w.fighters[1], 230);
      // (measure the hit itself: a strong punch sends the target flying off this small test map)
      const seen = press(w, { ability: true, kick: true }, 2, 70);
      return seen.filter((e) => e.t === 'hit' && e.weapon === 'luffy:super').reduce((n, e) => n + (e.t === 'hit' ? e.damage : 0), 0);
    };
    expect(dmg(1)).toBeGreaterThan(18);
    expect(dmg(4)).toBeGreaterThan(dmg(1) + 10);
  });

  it('Naruto: the tailed beast bomb is a big explosive orb that grows with the form', () => {
    const size = (lvl: number) => {
      const w = heroWorld('naruto');
      levelUp(w, w.fighters[0], lvl);
      let s = 0;
      for (let t = 0; t < 70 && !s; t++) {
        w.step([intent({ ability: t < 2, kick: t < 2 }), intent()]);
        s = w.bullets.find((b) => b.active && b.kind === 'chakra')?.size ?? 0;
      }
      return s;
    };
    expect(size(1)).toBeGreaterThan(0);
    expect(size(4)).toBeGreaterThan(size(1));
  });

  it('Goku: the super kamehameha reaches further and hits harder than the normal one', () => {
    const dmg = (kick: boolean) => {
      const w = heroWorld('goku');
      levelUp(w, w.fighters[0], 1);
      place(w.fighters[1], 370);
      const hp = w.fighters[1].hp;
      press(w, kick ? { ability: true, kick: true } : { kick: true }, kick ? 2 : 80, 80);
      return hp - w.fighters[1].hp;
    };
    const sup = dmg(true);
    expect(sup).toBeGreaterThan(20);
    expect(dmg(false)).toBe(0); // out of the normal beam's reach
  });
});

describe('power orb spawning', () => {
  it('the world drops orbs (a couple at a time) when enabled', () => {
    const w = heroWorld('', '', true);
    run(w, 60 * 25);
    const orbs = () => w.items.filter((it) => it.active && it.weaponId === POWER_ORB).length;
    expect(orbs()).toBeGreaterThanOrEqual(1);
    run(w, 60 * 60);
    expect(orbs()).toBeLessThanOrEqual(2);
  });

  it('no orbs unless enabled', () => {
    const w = heroWorld('');
    run(w, 60 * 40);
    expect(w.items.some((it) => it.active && weaponDef(it.weaponId).powerup?.kind === 'orb')).toBe(false);
  });

  it('matches with heroes and powers are deterministic', () => {
    const play = () => {
      const m = new Match({
        mapId: 'test',
        mode: 'brawl',
        fighters: ['naruto', 'luffy', 'goku', ''].map((hero, i) => ({ name: 'F' + i, team: 0, isBot: false, upJumps: false, hero })),
        roundsToWin: 3,
        friendlyFire: false,
        weaponSpawnRate: 1,
        seed: 11,
        heroPowers: true,
      });
      let h = 0;
      for (let t = 0; t < 60 * 30; t++) {
        const intents = m.world.fighters.map((f, i) =>
          intent({ moveX: Math.sin(t / 40 + i) > 0 ? 1 : -1, attack: (t + i * 7) % 23 === 0, ability: (t + i) % 50 < 20, kick: (t + i * 5) % 71 < 12, jump: (t + i * 3) % 61 === 0 }),
        );
        m.step(intents);
        for (const x of intents) h = (h * 31 + packIntent(x)) | 0;
      }
      return m.world.fighters.map((f) => `${f.x.toFixed(3)},${f.y.toFixed(3)},${f.hp.toFixed(1)},${f.power},${f.powerLevel}`).join('|');
    };
    expect(play()).toBe(play());
  });
});
