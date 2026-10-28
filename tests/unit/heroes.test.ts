import { describe, expect, it } from 'vitest';
import { TILE } from '../../src/sim/constants';
import { FORM_HP, GENERIC_DURATION, HEROES, POWER_ORB, heroAttackLabel, maxLevel, superFistFor } from '../../src/sim/data/heroes';
import { SLOT, WEAPONS, weaponDef } from '../../src/sim/data/weapons';
import type { Fighter, FighterSpawn } from '../../src/sim/fighter';
import { ability, formLayers, holdFlies, transform, transformed } from '../../src/sim/hero';
import { applyHit, killFighter } from '../../src/sim/combat';
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
  it('each orb raises a hero one form level and adds a layer of form health; the top level caps', () => {
    const w = heroWorld('naruto');
    const f = w.fighters[0];
    expect(f.power).toBe('');
    expect(transformed(f)).toBe(false);
    for (let lvl = 1; lvl <= maxLevel('naruto'); lvl++) {
      run(w, 60);
      transform(w, f);
      expect(f.power).toBe('hero');
      expect(f.powerLevel).toBe(lvl);
      expect(f.formHp).toBe(lvl * FORM_HP);
      expect(formLayers(f)).toBe(lvl);
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

  it('forms never time out: they last until the form health is gone', () => {
    const w = heroWorld('luffy');
    const f = w.fighters[0];
    levelUp(w, f, 2);
    run(w, 60 * 120);
    expect(f.power).toBe('hero');
    expect(f.powerLevel).toBe(2);
    expect(f.formHp).toBe(2 * FORM_HP);
  });

  it('damage goes into the form health first; the form wears off at zero, extra damage reaches hp', () => {
    const w = heroWorld('goku');
    const f = w.fighters[0];
    levelUp(w, f, 2); // 60 form hp
    const hit = (dmg: number) => applyHit(w, f, { damage: dmg, kbX: 0, kbY: 0, attacker: 1, weapon: 'fists', kind: 'melee' });
    hit(20);
    expect(f.formHp).toBe(40);
    expect(f.hp).toBe(f.maxHp);
    expect(formLayers(f)).toBe(2);
    f.invuln = 0;
    hit(25);
    expect(f.formHp).toBe(15);
    expect(formLayers(f)).toBe(1);
    f.invuln = 0;
    hit(30); // 15 absorbed, 15 left over
    expect(f.power).toBe('');
    expect(f.powerLevel).toBe(0);
    expect(f.hp).toBe(f.maxHp - 15);
  });

  it('falls, water and sudden-death drain bypass the form health', () => {
    const w = heroWorld('goku');
    const f = w.fighters[0];
    levelUp(w, f, 1);
    applyHit(w, f, { damage: 5, kbX: 0, kbY: 0, attacker: -1, weapon: 'drain', kind: 'drain' });
    expect(f.formHp).toBe(FORM_HP);
    expect(f.hp).toBe(f.maxHp - 5);
  });

  it('a new orb adds a fresh layer on top of whatever is left', () => {
    const w = heroWorld('luffy');
    const f = w.fighters[0];
    levelUp(w, f, 1);
    f.formHp = 10;
    transform(w, f);
    expect(f.powerLevel).toBe(2);
    expect(f.formHp).toBe(10 + FORM_HP);
  });

  it('death ends the form', () => {
    const w = heroWorld('luffy');
    const f = w.fighters[0];
    levelUp(w, f, 3);
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

describe('hold Up to fly (final forms of Naruto and Luffy)', () => {
  const flyWorld = (hero: string, level: number) => {
    const w = new World(FLAT, [{ name: 'A', team: 0, isBot: false, upJumps: true, hero }, { name: 'B', team: 0, isBot: false, upJumps: false }], { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 3);
    run(w, 2);
    place(w.fighters[0], 100);
    place(w.fighters[1], 400);
    levelUp(w, w.fighters[0], level);
    run(w, 4);
    return w;
  };
  const heightAfter = (w: World, ticks: number, i: Partial<Intent>) => {
    let top = Infinity;
    for (let t = 0; t < ticks; t++) {
      w.step([intent(i), intent()]);
      top = Math.min(top, w.fighters[0].y);
    }
    return top;
  };

  it.each(['naruto', 'luffy'])('%s: only the final form flies', (hero) => {
    for (const lvl of [1, 3]) expect(holdFlies(flyWorld(hero, lvl).fighters[0])).toBe(false);
    expect(holdFlies(flyWorld(hero, 4).fighters[0])).toBe(true);
  });

  it.each(['naruto', 'luffy'])('%s: holding Up climbs far above a normal jump; letting go falls', (hero) => {
    const norm = heightAfter(flyWorld(hero, 3), 120, { moveY: -1 });
    const w = flyWorld(hero, 4);
    const flown = heightAfter(w, 120, { moveY: -1 });
    expect(FLOOR_Y - flown).toBeGreaterThan(FLOOR_Y - norm + 40);
    expect(w.fighters[0].flying).toBe(true);
    heightAfter(w, 3, {});
    expect(w.fighters[0].flying).toBe(false);
    const y = w.fighters[0].y;
    run(w, 20);
    expect(w.fighters[0].y).toBeGreaterThan(y);
  });

  it('the form ends -> flight ends', () => {
    const w = flyWorld('luffy', 4);
    heightAfter(w, 60, { moveY: -1 });
    expect(w.fighters[0].flying).toBe(true);
    w.fighters[0].formHp = 0;
    heightAfter(w, 3, { moveY: -1 });
    expect(w.fighters[0].flying).toBe(false);
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

  it('Naruto: ability 2 summons real clone fighters (full rules in heroUpgrades.test.ts)', () => {
    const w = heroWorld('naruto');
    w.step([intent({ kick: true }), intent()]);
    run(w, 8);
    expect(w.fighters.filter((c) => c.master === 0 && c.alive).length).toBe(2);
  });

  it.each([0, 1])('Naruto form %i: every clone is already alive on the frame the cast triggers', (level) => {
    const w = heroWorld('naruto');
    levelUp(w, w.fighters[0], level);
    w.events.length = 0;
    let cast = false;
    for (let t = 0; t < 15; t++) {
      w.step([intent({ kick: t === 0 }), intent()]);
      if (w.events.some(e => e.t === 'clone')) {
        cast = true;
        expect(w.fighters.filter(c => c.master === 0 && c.alive && !c.gone)).toHaveLength(2 + level);
        expect(w.events.filter(e => e.t === 'clone')).toHaveLength(2 + level);
        break;
      }
    }
    expect(cast).toBe(true);
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
    expect(w.fighters.filter((c) => c.master === 0 && c.alive).length).toBe(3);
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

  it('Goku: Spirit Bomb travels beyond normal Kamehameha range and deals explosive damage', () => {
    const dmg = (kick: boolean) => {
      const w = heroWorld('goku');
      levelUp(w, w.fighters[0], 1);
      place(w.fighters[1], 370);
      const hp = w.fighters[1].hp;
      const seen = press(w, kick ? { ability: true, kick: true } : { kick: true }, kick ? 2 : 80, 140);
      if (kick) expect(seen.some(e => e.t === 'explosion')).toBe(true);
      return hp - w.fighters[1].hp;
    };
    const sup = dmg(true);
    expect(sup).toBeGreaterThan(20);
    expect(dmg(false)).toBe(0); // out of the normal beam's reach
  });

  it('Luffy: super fist radius doubles and range grows exponentially, including the actual hitbox', () => {
    const stats = [1, 2, 3, 4].map(level => superFistFor('luffy', level)!);
    expect(stats.map(s => s.fist)).toEqual([5, 10, 20, 40]);
    expect(stats.map(s => s.range)).toEqual([150, 240, 384, 614]);
    // A target beyond Gear Second's reach is hit by Gear Fourth's real combat query.
    const hitAtDistance = (level: number) => {
      const w = heroWorld('luffy');
      levelUp(w, w.fighters[0], level);
      place(w.fighters[1], 430);
      return press(w, { ability: true, kick: true }, 2, 60).some(e => e.t === 'hit' && e.weapon === 'luffy:super' && e.victim === 1);
    };
    expect(hitAtDistance(1)).toBe(false);
    expect(hitAtDistance(3)).toBe(true);
  });

  it('Goku: Spirit Bomb charges, launches once per use, scales with form, and is canceled by lost power', () => {
    for (const level of [1, 4]) {
      const w = heroWorld('goku');
      const f = w.fighters[0];
      levelUp(w, f, level);
      // Keep the target invulnerable so the ball can be inspected in flight.
      w.fighters[1].invuln = 999;
      w.step([intent({ ability: true, kick: true }), intent()]);
      run(w, 10);
      expect(f.specialKind).toBe('bomb');
      expect(f.charge).toBeGreaterThan(0); // Charging must be visible before the projectile launches.
      expect(f.charge).toBeLessThan(1);
      expect(w.bullets.some(b => b.active && b.weapon === 'goku:super')).toBe(false);
      const seen: SimEvent[] = [];
      for (let t = 0; t < 60; t++) {
        w.step([intent(), intent()]);
        seen.push(...w.events);
        w.events.length = 0;
      }
      const ball = w.bullets.find(b => b.active && b.weapon === 'goku:super')!;
      expect(ball.kind).toBe('ki');
      expect(ball.size).toBe(18 + (level - 1) * 6);
      expect(ball.range).toBe(520);
      expect(ball.explosion!.radius).toBe(45 + (level - 1) * 12);
      expect(seen.filter(e => e.t === 'special' && e.power === 'goku')).toHaveLength(1);
      expect(f.specialCd).toBeGreaterThan(0);
    }
    const w = heroWorld('goku');
    levelUp(w, w.fighters[0], 1);
    w.step([intent({ ability: true, kick: true }), intent()]);
    run(w, 10);
    w.fighters[0].formHp = 0;
    run(w, 80);
    expect(w.bullets.some(b => b.weapon === 'goku:super')).toBe(false);
  });

  it('Naruto: the charging bomb becomes visible again on a later use', () => {
    const w = heroWorld('naruto');
    const f = w.fighters[0];
    levelUp(w, f, 4);
    for (let use = 0; use < 2; use++) {
      f.specialCd = 0;
      w.step([intent({ ability: true, kick: true }), intent()]);
      run(w, 10);
      expect(f.specialKind).toBe('bomb');
      expect(f.charge).toBeGreaterThan(0);
      run(w, 90);
      expect(f.charge).toBe(-1);
    }
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
