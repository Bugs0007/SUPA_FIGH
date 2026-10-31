import { describe, expect, it } from 'vitest';
import { HEROES, heroAttackLabel } from '../../src/sim/data/heroes';
import type { SimEvent } from '../../src/sim/events';
import { endPower, holdFlies, transform } from '../../src/sim/hero';
import type { Intent } from '../../src/sim/intent';
import { World } from '../../src/sim/world';
import { FLAT, intent, run } from './helpers';

function setup(level = 0): World {
  const w = new World(FLAT, [
    { name: 'SASUKE', hero: 'sasuke', team: 0, isBot: false, upJumps: false },
    { name: 'TARGET', team: 0, isBot: false, upJumps: false },
  ], { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 51);
  run(w, 5);
  for (const [i, f] of w.fighters.entries()) {
    f.x = f.px = i === 0 ? 70 : 360;
    f.y = f.py = 144;
    f.vx = f.vy = f.invuln = 0;
    f.facing = 1;
  }
  for (let i = 0; i < level; i++) transform(w, w.fighters[0]);
  w.events.length = 0;
  return w;
}

function press(w: World, input: Partial<Intent>, ticks = 60): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    w.step([intent(i === 0 ? input : {})]);
    events.push(...w.events);
    w.events.length = 0;
  }
  return events;
}

describe('Sasuke', () => {
  it('Chidori dashes, hits once with its own credit, and spends a charge', () => {
    const w = setup(), f = w.fighters[0], target = w.fighters[1];
    target.x = target.px = 130;
    const events = press(w, { ability: true }, 50);
    const hits = events.filter(e => e.t === 'hit' && e.weapon === 'chidori');
    expect(hits).toHaveLength(1);
    expect(target.hp).toBeLessThan(100);
    expect(f.x).toBeGreaterThan(90);
    expect(f.baseUsed).toBe(1);
    expect(heroAttackLabel('chidori')).toBe('CHIDORI');
    expect(heroAttackLabel('rasengan')).toBe('RASENGAN');
    run(w, 180);
    expect(f.baseUsed).toBe(0);
  });

  it('a held fireball input launches once, respects cooldown, and burns the target', () => {
    const w = setup(), f = w.fighters[0], target = w.fighters[1];
    target.x = target.px = 180;
    let launches = 0;
    const seen: SimEvent[] = [];
    for (let i = 0; i < 70; i++) {
      w.step([intent({ kick: true })]);
      launches += w.events.filter(e => e.t === 'special' && e.power === 'sasuke').length;
      seen.push(...w.events);
      w.events.length = 0;
    }
    expect(launches).toBe(1);
    expect(f.secondCd).toBeGreaterThan(2);
    expect(seen.some(e => e.t === 'hit' && e.weapon === 'sasuke:second')).toBe(true);
    expect(target.hp).toBeLessThan(90);
    press(w, { kick: true }, 40);
    expect(w.bullets.filter(b => b.active && b.weapon === 'sasuke:second')).toHaveLength(0);
  });

  it('fireball up-aim is recorded at cast time and survives the release of its button', () => {
    const w = setup();
    press(w, { kick: true, moveY: -1 }, 20);
    const b = w.bullets.find(b => b.active && b.weapon === 'sasuke:second');
    expect(b).toBeDefined();
    expect(b!.vy).toBeLessThan(0);
    expect(b!.ignite).toBe(HEROES.sasuke.second.fireball!.ignite);
    expect(b!.size).toBe(5);
  });

  it('the base form cannot use the transformed super', () => {
    const w = setup();
    press(w, { ability: true, kick: true });
    expect(w.bullets.some(b => b.weapon === 'sasuke:super')).toBe(false);
  });

  for (let level = 1; level <= 4; level++) it(`form ${level} fires exactly one aimed super and scales its projectile`, () => {
    const w = setup(level), f = w.fighters[0];
    const events = press(w, { ability: true, kick: true, moveY: -1 }, 43);
    expect(events.filter(e => e.t === 'superStart')).toHaveLength(1);
    expect(events.filter(e => e.t === 'special')).toHaveLength(1);
    const b = w.bullets.find(b => b.active && b.weapon === 'sasuke:super');
    expect(b).toBeDefined();
    expect(b!.vy).toBeLessThan(0);
    expect(b!.size).toBeCloseTo(4 + (level - 1) * 1.2);
    expect(b!.explosion!.radius).toBe(24 + (level - 1) * 10);
    expect(f.specialCd).toBeGreaterThan(8);
    expect(holdFlies(f)).toBe(level === 4);
    const later = press(w, {}, 30);
    expect(later.filter(e => e.t === 'special')).toHaveLength(0);
    expect(f.state).not.toBe('special');
  });

  it('losing a form during the super windup cancels the shot', () => {
    const w = setup(4), f = w.fighters[0];
    press(w, { ability: true, kick: true }, 12);
    endPower(w, f);
    const events = press(w, {}, 50);
    expect(events.some(e => e.t === 'special')).toBe(false);
    expect(w.bullets.some(b => b.weapon === 'sasuke:super')).toBe(false);
    expect(f.state).toBe('normal');
  });
});
