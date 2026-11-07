import { describe, expect, it } from 'vitest';
import { DT } from '../../src/sim/constants';
import { rosterSpecial } from '../../src/sim/data/rosterSpecials';
import { transform } from '../../src/sim/hero';
import { World } from '../../src/sim/world';
import { FLAT, intent, run } from './helpers';

const special = intent({ attack: true, ability: true });

function arena(hero: string, gap: number) {
  const w = new World(FLAT, [
    { hero, name: 'Fighter', team: 1, isBot: false, upJumps: false },
    { name: 'Rival', team: 2, isBot: false, upJumps: false },
  ], { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 99);
  run(w, 5);
  for (const f of w.fighters) {
    f.x = f.px = 100 + f.id * gap;
    f.y = f.py = 144;
    f.invuln = f.vx = f.vy = 0;
    f.facing = f.id === 0 ? 1 : -1;
  }
  return w;
}

function fireAtFighter(w: World, kind: 'ki' | 'bullet') {
  const x = w.fighters[0].x + 42;
  const y = w.fighters[0].y - w.fighters[0].h / 2;
  return w.spawnBullet({ x, y, vx: -920, vy: 0, ox: x, oy: y, owner: 1, weapon: 'test',
    damage: 10, range: 220, falloff: 1, knock: 60, ricochet: false, pierce: 0, kind })!;
}

describe('Attack + Ability roster specials', () => {
  it('starts from an opening attack but respects its own cooldown', () => {
    const w = arena('zoro', 56);
    const [f, rival] = w.fighters;
    w.step([intent({ attack: true })]);
    w.step([special]);
    expect(f.specialKind).toBe('rosterSpecial');
    run(w, 39);
    expect(f.x).toBeGreaterThan(rival.x);
    const hp = rival.hp;
    expect(hp).toBeLessThan(rival.maxHp);
    w.step([special]);
    run(w, 39);
    expect(rival.hp).toBe(hp);
    expect(f.formComboCd).toBeGreaterThan(0);
  });

  it('keeps a transformed ultimate on Ability + Kick', () => {
    const w = arena('zoro', 35);
    transform(w, w.fighters[0]);
    w.step([intent({ attack: true, ability: true, kick: true })]);
    expect(w.fighters[0].specialKind).toBe('bomb');
  });

  it('gives Naruto the shared shortcut alongside his older one', () => {
    const w = arena('naruto', 90);
    transform(w, w.fighters[0]);
    w.step([special]);
    expect(w.fighters[0].specialKind).toBe('formCombo');
  });

  it('raises and then slams the same rival with Takt', () => {
    const w = arena('law', 92);
    const rival = w.fighters[1];
    w.step([special]);
    run(w, Math.ceil(0.28 / DT));
    const liftedHp = rival.hp;
    expect(liftedHp).toBeLessThan(rival.maxHp);
    expect(rival.vy).toBeLessThan(0);
    run(w, Math.ceil(0.20 / DT));
    expect(rival.hp).toBeLessThan(liftedHp);
    expect(rival.state).toBe('knockdown');
  });

  it.each([['vegeta', 2], ['sanji', 3], ['ichigo', 2], ['rukia', 2], ['byakuya', 3], ['yuno', 3]] as const)(
    '%s can land all %i distinct beats at the intended spacing', (hero, count) => {
      const spec = rosterSpecial(hero)!;
      const w = arena(hero, spec.demoGap);
      let hits = 0;
      for (let tick = 0; tick <= Math.ceil(spec.duration / DT); tick++) {
        w.events.length = 0;
        w.step([tick === 0 ? special : intent()]);
        hits += w.events.filter(e => e.t === 'hit' && e.victim === 1 && e.weapon === hero + ':special').length;
      }
      expect(hits).toBe(count);
    },
  );

  it('locks the petal rain area at input so a rival can dodge it', () => {
    const w = arena('byakuya', 100);
    const rival = w.fighters[1];
    w.step([special]);
    rival.x -= 52;
    run(w, Math.ceil(0.8 / DT));
    expect(rival.hp).toBe(rival.maxHp);
  });

  it('cleanses Asta and dispels energy on the active sweep', () => {
    const w = arena('asta', 30);
    const f = w.fighters[0];
    f.burn = 1;
    w.step([special]);
    const windup = rosterSpecial('asta')!.windup;
    run(w, Math.ceil(windup / DT) - 1);
    const shot = fireAtFighter(w, 'ki');
    w.step([intent()]);
    expect(shot.active).toBe(false);
    expect(f.burn).toBe(0);
    expect(w.events.some(e => e.t === 'projectileFizzle')).toBe(true);
  });

  it('absorbs ordinary shots across multiple ticks while Black Moon is open', () => {
    const w = arena('yami', 37);
    const f = w.fighters[0];
    w.step([special]);
    run(w, Math.ceil(0.18 / DT));
    const first = fireAtFighter(w, 'bullet');
    w.step([intent()]);
    expect(first.active).toBe(false);
    run(w, 6);
    const second = fireAtFighter(w, 'bullet');
    w.step([intent()]);
    expect(second.active).toBe(false);
    expect(f.hp).toBe(f.maxHp);
  });
});
