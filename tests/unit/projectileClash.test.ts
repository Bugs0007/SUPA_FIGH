// Hero ranged attacks meeting in the air: equal calibers clash in a big blast, a higher caliber overpowers the other.
import { describe, expect, it } from 'vitest';
import { caliber } from '../../src/sim/clash';
import { CLASH } from '../../src/sim/data/heroes';
import type { SimEvent } from '../../src/sim/events';
import type { Intent } from '../../src/sim/intent';
import { transform } from '../../src/sim/hero';
import { World } from '../../src/sim/world';
import { FLAT, intent, run } from './helpers';

interface Who {
  hero?: string;
  x: number;
  level?: number;
  team?: number;
  facing?: 1 | -1;
}

function duel(who: Who[], friendlyFire = false): World {
  const w = new World(
    FLAT,
    who.map((o, i) => ({ name: 'P' + i, hero: o.hero, team: o.team ?? 0, isBot: false, upJumps: false })),
    { friendlyFire, weaponSpawnRate: 0, gravityScale: 1 },
    77,
  );
  run(w, 5);
  who.forEach((o, i) => {
    const f = w.fighters[i];
    f.x = f.px = o.x;
    f.y = f.py = 144;
    f.vx = f.vy = f.invuln = 0;
    f.facing = o.facing ?? (o.x < 240 ? 1 : -1);
    for (let l = 0; l < (o.level ?? 0); l++) transform(w, f);
  });
  w.events.length = 0;
  return w;
}

/** Step with per-fighter intents from `fn(tick, fighter index)` and collect the events. */
function play(w: World, ticks: number, fn: (t: number, i: number) => Partial<Intent> = () => ({})): SimEvent[] {
  const events: SimEvent[] = [];
  for (let t = 0; t < ticks; t++) {
    w.step(w.fighters.map((_, i) => intent(fn(t, i))));
    events.push(...w.events);
    w.events.length = 0;
  }
  return events;
}

const SUPER = { ability: true, kick: true };
const hitsBy = (events: SimEvent[], weapon: string, victim: number) =>
  events.filter((e) => e.t === 'hit' && e.weapon === weapon && e.victim === victim && !e.corpse).length;
const clashes = (events: SimEvent[]) => events.filter((e) => e.t === 'projectileClash');
const fizzles = (events: SimEvent[]) => events.filter((e) => e.t === 'projectileFizzle');

describe('caliber', () => {
  it('a super beats any ability whatever the forms; same tier: the higher form', () => {
    expect(caliber(2, 1)).toBeGreaterThan(caliber(1, 4));
    expect(caliber(2, 4)).toBeGreaterThan(caliber(2, 3));
    expect(caliber(1, 2)).toBeGreaterThan(caliber(1, 0));
    expect(caliber(2, 3)).toBe(caliber(2, 3));
  });
});

describe('equal calibers clash', () => {
  it('two top-form Susanoo arrows meet mid-air: both gone, a big blast hurts whoever stands under it', () => {
    // aimed straight (Down held on the ground = no lock-on); a bystander under the middle that bullets fly past
    const who: Who[] = [{ hero: 'sasuke', x: 60, level: 4, team: 1 }, { hero: 'sasuke', x: 420, level: 4, team: 2 }, { x: 240, team: 3, facing: 1 }];
    const w = duel(who);
    w.fighters[2].invuln = 999; // (projectiles skip i-frames, blasts do not)
    const events = play(w, 120, (t, i) => (i < 2 && t === 0 ? { ...SUPER, moveY: 1 } : {}));
    const c = clashes(events);
    expect(c).toHaveLength(1);
    const boom = c[0].t === 'projectileClash' ? c[0] : null;
    expect(boom!.x).toBeGreaterThan(200);
    expect(boom!.x).toBeLessThan(280);
    expect(boom!.y).toBeLessThan(144 - 22); // in the air, above everyone's heads
    expect(boom!.radius).toBeCloseTo(84 * CLASH.radiusMul, 3); // the bigger blast (both 84 px) x 1.25
    expect(w.bullets.some((b) => b.active && b.weapon === 'sasuke:super')).toBe(false);
    expect(hitsBy(events, 'sasuke:super', 0)).toBe(0); // neither arrow got through
    expect(hitsBy(events, 'sasuke:super', 1)).toBe(0);
    expect(w.fighters[2].hp).toBeLessThan(100); // the bystander under the blast
  });

  it('two equal fireballs (ability vs ability, same form) clash too', () => {
    const w = duel([{ hero: 'sasuke', x: 60, team: 1 }, { hero: 'sasuke', x: 420, team: 2 }]);
    const events = play(w, 90, (t) => (t === 0 ? { kick: true } : {}));
    expect(clashes(events)).toHaveLength(1);
    expect(hitsBy(events, 'sasuke:second', 0) + hitsBy(events, 'sasuke:second', 1)).toBe(0);
  });

  it('two equal Kamehamehas meet tip to tip: a clash, and both beams stop', () => {
    const w = duel([{ hero: 'goku', x: 180, level: 1, team: 1 }, { hero: 'goku', x: 300, level: 1, team: 2 }]);
    const events = play(w, 40, (t) => (t < 16 ? { kick: true } : {}));
    expect(clashes(events)).toHaveLength(1);
    expect(w.fighters[0].specialKind).not.toBe('beam');
    expect(w.fighters[1].specialKind).not.toBe('beam');
    // neither beam reached the other Goku (only the clash blast, close by, caught them)
    expect(events.some((e) => e.t === 'hit' && e.weapon === 'goku:second' && e.kind !== 'explosion')).toBe(false);
    const c = clashes(events)[0];
    expect(c.t === 'projectileClash' && Math.abs(c.x - 240)).toBeLessThan(3); // halfway between them
  });
});

describe('a higher caliber overpowers', () => {
  for (const [ult, fire] of [[4, 0], [1, 2]] as const) {
    it(`a form-${ult} super arrow tears through a form-${fire} fireball and hits its caster`, () => {
      const w = duel([{ hero: 'sasuke', x: 60, level: ult, team: 1 }, { hero: 'sasuke', x: 420, level: fire, team: 2 }]);
      const events = play(w, 150, (t, i) => (t === 0 ? (i === 0 ? SUPER : { kick: true }) : {}));
      expect(clashes(events)).toHaveLength(0);
      expect(fizzles(events)).toHaveLength(1);
      expect(hitsBy(events, 'sasuke:second', 0)).toBe(0); // the fireball never arrived
      expect(hitsBy(events, 'sasuke:super', 1)).toBe(1); // the arrow did
    });
  }

  for (const order of ['sasuke first', 'naruto first'] as const) {
    it(`same tier: Sasuke's form-4 arrow beats Naruto's form-3 bomb (${order} in the fighter list)`, () => {
      const s: Who = { hero: 'sasuke', x: 60, level: 4, team: 1 };
      const n: Who = { hero: 'naruto', x: 420, level: 3, team: 2 };
      const w = duel(order === 'sasuke first' ? [s, n] : [n, s]);
      const si = order === 'sasuke first' ? 0 : 1;
      const ni = 1 - si;
      const events = play(w, 200, (t) => (t === 0 ? SUPER : {}));
      expect(clashes(events)).toHaveLength(0);
      expect(fizzles(events)).toHaveLength(1);
      expect(hitsBy(events, 'naruto:super', si)).toBe(0);
      expect(hitsBy(events, 'sasuke:super', ni)).toBe(1);
      expect(events.some((e) => e.t === 'explosion' && e.weapon === 'naruto:super')).toBe(false);
    });
  }

  it("Goku's Kamehameha vs Sasuke's form-4 arrow: the arrow cuts through the beam and hits Goku", () => {
    const w = duel([{ hero: 'sasuke', x: 60, level: 4, team: 1 }, { hero: 'goku', x: 420, level: 4, team: 2 }]);
    let cut = false;
    const events: SimEvent[] = [];
    for (let t = 0; t < 140; t++) {
      w.step([intent(t === 0 ? SUPER : {}), intent(t >= 33 && t < 48 ? { kick: true } : {})]);
      events.push(...w.events);
      w.events.length = 0;
      if (w.fighters[1].beamCut >= 0) cut = true;
    }
    expect(events.some((e) => e.t === 'beam' && e.f === 1)).toBe(true);
    expect(cut).toBe(true); // the beam stopped where the arrow crossed it
    expect(clashes(events)).toHaveLength(0);
    expect(fizzles(events)).toHaveLength(0); // a beam is cut, not destroyed; the arrow is untouched
    expect(hitsBy(events, 'sasuke:super', 1)).toBe(1);
  });

  it('a stronger beam destroys a weaker fireball that flies into it', () => {
    const w = duel([{ hero: 'sasuke', x: 60, team: 1 }, { hero: 'goku', x: 420, level: 1, team: 2 }]);
    const events = play(w, 90, (t, i) => (i === 0 ? (t === 0 ? { kick: true } : {}) : t >= 15 && t < 31 ? { kick: true } : {}));
    expect(events.some((e) => e.t === 'beam' && e.f === 1)).toBe(true);
    expect(fizzles(events)).toHaveLength(1);
    expect(clashes(events)).toHaveLength(0);
    expect(hitsBy(events, 'sasuke:second', 1)).toBe(0);
    expect(w.bullets.some((b) => b.active && b.weapon === 'sasuke:second')).toBe(false);
  });
});

describe("Luffy's giant fist head is a super too", () => {
  // Naruto's bomb leaves at 0.45 s and flies left; Luffy throws the fist so its head is out when the bomb arrives
  const fistVsBomb = (luffy: number, naruto: number) => {
    const w = duel([{ hero: 'luffy', x: 60, level: luffy, team: 1 }, { hero: 'naruto', x: 420, level: naruto, team: 2 }]);
    const events = play(w, 150, (t, i) => ((i === 0 && t === 40) || (i === 1 && t === 0) ? SUPER : {}));
    return { w, events };
  };

  it('same form: the fist and the bomb clash, both are gone', () => {
    const { w, events } = fistVsBomb(2, 2);
    expect(clashes(events)).toHaveLength(1);
    expect(w.bullets.some((b) => b.active && b.weapon === 'naruto:super')).toBe(false);
    expect(hitsBy(events, 'naruto:super', 0)).toBe(0);
    expect(events.some((e) => e.t === 'hit' && e.weapon === 'luffy:super' && e.victim === 1 && e.kind === 'melee')).toBe(false);
  });

  it('a higher form fist smashes the bomb and reaches Naruto', () => {
    const { events } = fistVsBomb(3, 2);
    expect(clashes(events)).toHaveLength(0);
    expect(fizzles(events)).toHaveLength(1);
    expect(hitsBy(events, 'naruto:super', 0)).toBe(0);
    expect(hitsBy(events, 'luffy:super', 1)).toBeGreaterThanOrEqual(1);
  });
});

describe('who never collides', () => {
  it('ordinary gun bullets ignore all of it (no caliber)', () => {
    const w = duel([{ hero: 'sasuke', x: 60, level: 4, team: 1 }, { x: 420, team: 2 }]);
    const events: SimEvent[] = [];
    for (let t = 0; t < 120; t++) {
      if (t === 45) {
        // a pistol bullet from the right, straight down the arrow's path
        w.spawnBullet({ x: 400, y: 120, vx: -600, vy: 0, ox: 400, oy: 120, owner: 1, weapon: 'pistol', damage: 10, range: 400, falloff: 1, knock: 50, ricochet: false, pierce: 0, kind: 'bullet' });
      }
      w.step([intent(t === 0 ? SUPER : {}), intent()]);
      events.push(...w.events);
      w.events.length = 0;
    }
    expect(w.bullets.every((b) => b.tier === 0 || b.weapon !== 'pistol')).toBe(true);
    expect(clashes(events)).toHaveLength(0);
    expect(fizzles(events)).toHaveLength(0);
    expect(hitsBy(events, 'sasuke:super', 1)).toBe(1);
  });

  it("teammates' attacks pass through each other; with friendly fire on they clash", () => {
    const who: Who[] = [{ hero: 'sasuke', x: 60, level: 4, team: 1 }, { hero: 'sasuke', x: 420, level: 4, team: 1 }];
    const fire = (t: number) => (t === 0 ? { ...SUPER, moveY: 1 } : {});
    expect(clashes(play(duel(who), 120, fire))).toHaveLength(0);
    expect(clashes(play(duel(who, true), 120, fire))).toHaveLength(1);
  });
});
