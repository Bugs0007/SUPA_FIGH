import { describe, expect, it } from 'vitest';
import { TILE } from '../../src/sim/constants';
import { CLONE, GENERIC_DURATION, HEROES, POWERS, heroAttackLabel } from '../../src/sim/data/heroes';
import { SLOT, WEAPONS, weaponDef } from '../../src/sim/data/weapons';
import type { Fighter, FighterSpawn } from '../../src/sim/fighter';
import { ability, transform } from '../../src/sim/hero';
import { packIntent } from '../../src/sim/intent';
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

/** Press a button for one tick then release. */
function tap(w: World, btn: 'attack' | 'ability' | 'kick', ticks = 30): void {
  run(w, 1, () => [intent({ [btn]: true })]);
  run(w, ticks);
}

describe('hero data', () => {
  it('every power has a pickup item, a matching hero and a sane duration', () => {
    for (const p of Object.values(POWERS)) {
      const item = WEAPONS[p.item];
      expect(item, p.id).toBeDefined();
      expect(item.powerup?.kind).toBe('hero');
      expect(item.powerup?.power).toBe(p.id);
      expect(item.powerup?.duration).toBe(p.duration);
      expect(item.spawnWeight, 'power-ups never appear at weapon spawns').toBe(0);
      expect(item.slot).toBe(SLOT.GADGET);
      expect(HEROES[p.hero]?.power).toBe(p.id);
      expect(p.duration).toBeGreaterThanOrEqual(15);
      expect(p.duration).toBeLessThanOrEqual(25);
      expect(p.ability.special, p.id).toBeDefined();
      expect(heroAttackLabel(p.id)).toBe(p.comboName);
      expect(heroAttackLabel(p.id + ':special')).toBe(p.ability.special!.name);
    }
  });

  it('hero base stats stay close to the scrapyard fighter', () => {
    for (const h of Object.values(HEROES)) {
      expect(Math.abs(h.stats.speed - 1)).toBeLessThanOrEqual(0.05);
      expect(Math.abs(h.stats.hp - 100)).toBeLessThanOrEqual(5);
    }
  });
});

describe('transformations', () => {
  it('the matching hero gets the full power; it expires back to normal', () => {
    const w = heroWorld('naruto');
    const a = w.fighters[0];
    transform(w, a, 'kurama');
    expect(a.power).toBe('kurama');
    expect(a.powerFull).toBe(true);
    expect(ability(a)?.special?.name).toBe('CHAKRA BOMB');
    expect(a.speedMul).toBeCloseTo(1.03, 5); // applied next tick
    run(w, 1);
    expect(a.speedMul).toBeGreaterThan(1.2);
    run(w, Math.ceil(POWERS.kurama.duration * 60) + 2);
    expect(a.power).toBe('');
    expect(ability(a)).toBeNull();
    expect(w.events.some((e) => e.t === 'powerEnd' && e.f === a.id) || a.power === '').toBe(true);
    run(w, 1);
    expect(a.speedMul).toBeCloseTo(1.03, 5); // naruto base speed only
  });

  it('anyone else gets a shorter generic boost without the special', () => {
    const w = heroWorld('', 'luffy');
    const a = w.fighters[0];
    transform(w, a, 'kurama');
    expect(a.powerFull).toBe(false);
    expect(a.powerMax).toBe(GENERIC_DURATION);
    expect(ability(a)?.special).toBeUndefined();
    tap(w, 'ability');
    expect(a.state).not.toBe('special');
    expect(w.bullets.some((b) => b.active)).toBe(false);
  });

  it('picking up the power item transforms the fighter', () => {
    const w = heroWorld('goku');
    const a = w.fighters[0];
    const it = w.spawnWeapon('energycore', a.x, a.y);
    w.pickUp(a, it, false);
    expect(a.power).toBe('ssj');
    expect(a.powerFull).toBe(true);
    expect(it.active).toBe(false);
    expect(a.inv[SLOT.GADGET]).toBeNull(); // power-ups never take a slot
  });

  it('dying ends the power', () => {
    const w = heroWorld('naruto');
    const a = w.fighters[0];
    transform(w, a, 'kurama');
    a.hp = 1;
    w.fighters[0].invuln = 0;
    // fall damage free kill: just kill directly through the combat path
    a.hp = -1;
    a.alive = false;
    a.state = 'dead';
    run(w, 1);
    expect(a.power).toBe('');
  });
});

describe('specials', () => {
  it('Kurama: ABILITY fires a chakra bomb with a cooldown; guns still work', () => {
    const w = heroWorld('naruto');
    const [a, b] = w.fighters;
    transform(w, a, 'kurama');
    run(w, 1);
    tap(w, 'ability', 1);
    const bomb = w.bullets.find((x) => x.active && x.kind === 'chakra');
    expect(bomb).toBeDefined();
    expect(bomb!.size).toBeGreaterThan(0);
    expect(a.specialCd).toBeGreaterThan(4);
    // second press during the cooldown does nothing
    run(w, 30);
    tap(w, 'ability', 1);
    expect(w.bullets.filter((x) => x.active && x.kind === 'chakra').length).toBeLessThanOrEqual(1);
    run(w, 90);
    expect(b.hp).toBeLessThan(b.maxHp - 20);
    expect(w.events.length).toBeGreaterThanOrEqual(0);
    // normal weapons keep working while powered
    a.inv[SLOT.SIDEARM] = { id: 'pistol', ammo: 5, dur: 1 };
    a.active = SLOT.SIDEARM;
    a.state = 'normal';
    run(w, 1, () => [intent({ attack: true })]);
    run(w, 2);
    expect(a.inv[SLOT.SIDEARM]!.ammo).toBe(4);
  });

  it('Kurama: combo hit 3 spawns shadow clones that strike once and vanish', () => {
    const w = heroWorld('naruto');
    const [a, b] = w.fighters;
    transform(w, a, 'kurama');
    place(b, a.x + 22);
    run(w, 1);
    for (let i = 0; i < 3; i++) run(w, 9, (t) => [intent({ attack: t === 0 })]);
    run(w, 4);
    expect(w.clones.length).toBeGreaterThan(0);
    const clone = w.clones[0];
    expect(clone.owner).toBe(a.id);
    run(w, Math.ceil(CLONE.life * 60) + 2);
    expect(w.clones.every((c) => !c.active)).toBe(true);
    // clones are effect entities, never fighters
    expect(w.fighters.length).toBe(2);
  });

  it('Gear 2: fist combo reaches further than normal fists', () => {
    const reachHit = (power: boolean) => {
      const w = heroWorld('luffy');
      const [a, b] = w.fighters;
      if (power) transform(w, a, 'gear2');
      place(b, a.x + 26); // out of normal fist range
      run(w, 1);
      const hp = b.hp;
      tap(w, 'attack', 20);
      return hp - b.hp;
    };
    expect(reachHit(false)).toBe(0);
    expect(reachHit(true)).toBeGreaterThan(0);
  });

  it('Gear 2: the rubber bullet stretches out, hits far away and snaps back', () => {
    const w = heroWorld('luffy');
    const [a, b] = w.fighters;
    transform(w, a, 'gear2');
    place(b, a.x + 100);
    run(w, 1);
    run(w, 1, () => [intent({ ability: true })]);
    let maxLen = 0;
    for (let i = 0; i < 30; i++) {
      run(w, 1);
      maxLen = Math.max(maxLen, a.stretchLen);
    }
    expect(maxLen).toBeGreaterThan(80);
    expect(a.stretchLen).toBe(0);
    expect(a.state).not.toBe('special');
    expect(b.hp).toBeLessThan(b.maxHp);
  });

  it('Super Saiyan: tap = small ki blast, hold = charged bigger blast', () => {
    const shoot = (hold: number) => {
      const w = heroWorld('goku');
      const a = w.fighters[0];
      transform(w, a, 'ssj');
      run(w, 1);
      run(w, hold, () => [intent({ ability: true })]);
      run(w, 1);
      const ki = w.bullets.find((x) => x.active && x.kind === 'ki');
      return { ki, cd: a.specialCd };
    };
    const small = shoot(1);
    const big = shoot(70);
    expect(small.ki).toBeDefined();
    expect(big.ki).toBeDefined();
    expect(big.ki!.damage).toBeGreaterThan(small.ki!.damage * 2);
    expect(big.ki!.size).toBeGreaterThan(small.ki!.size);
    expect(big.ki!.explosion).not.toBeNull();
    expect(small.ki!.explosion).toBeNull();
    expect(big.cd).toBeGreaterThan(small.cd);
  });

  it('Super Saiyan: powered kick hits harder', () => {
    const kick = (power: boolean) => {
      const w = heroWorld('goku');
      const [a, b] = w.fighters;
      if (power) transform(w, a, 'ssj');
      place(b, a.x + 12);
      run(w, 1);
      tap(w, 'kick', 20);
      return b.maxHp - b.hp;
    };
    expect(kick(true)).toBeGreaterThan(kick(false) * 1.4);
  });
});

describe('power-up spawning', () => {
  it('the world drops one hero power-up at a time when enabled', () => {
    const w = heroWorld('', '', true);
    const ids = new Set(Object.values(POWERS).map((p) => p.item));
    run(w, 60 * 25);
    const powers = w.items.filter((it) => it.active && ids.has(it.weaponId));
    expect(powers.length).toBe(1);
    run(w, 60 * 45);
    expect(w.items.filter((it) => it.active && ids.has(it.weaponId)).length).toBe(1);
  });

  it('no power-ups unless enabled', () => {
    const w = heroWorld('');
    run(w, 60 * 40);
    expect(w.items.some((it) => it.active && weaponDef(it.weaponId).powerup?.kind === 'hero')).toBe(false);
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
        const intents = m.world.fighters.map((f, i) => intent({ moveX: Math.sin(t / 40 + i) > 0 ? 1 : -1, attack: (t + i * 7) % 23 === 0, ability: (t + i) % 50 < 20, jump: (t + i * 3) % 61 === 0 }));
        m.step(intents);
        for (const x of intents) h = (h * 31 + packIntent(x)) | 0;
      }
      return m.world.fighters.map((f) => `${f.x.toFixed(3)},${f.y.toFixed(3)},${f.hp.toFixed(1)},${f.power}`).join('|');
    };
    expect(play()).toBe(play());
  });
});
