import { describe, expect, it } from 'vitest';
import { BotController } from '../../src/ai/bot';
import { findConflicts, DEFAULT_KEYBOARD, cloneBinds, setBinding } from '../../src/input/bindings';
import { DT } from '../../src/sim/constants';
import { SLOT } from '../../src/sim/data/weapons';
import { emptyIntent, packIntent, unpackIntent } from '../../src/sim/intent';
import { Match, type MatchConfig } from '../../src/sim/match';
import { intent, spec } from './helpers';

const base = (over: Partial<MatchConfig> = {}): MatchConfig => ({
  mapId: 'test',
  mode: 'brawl',
  fighters: [spec('A'), spec('B'), spec('C')],
  roundsToWin: 3,
  friendlyFire: false,
  weaponSpawnRate: 0,
  seed: 4,
  ...over,
});

describe('deathmatch', () => {
  it('dead fighters respawn, kills score, the timer ends the match', () => {
    const m = new Match(base({ mode: 'deathmatch', timeLimit: 20, respawnDelay: 1 }));
    const w = m.world;
    const [a, b] = w.fighters;
    // A kills B with a point-blank shotgun barrage
    w.step([]);
    b.x = a.x + 14;
    b.y = a.y;
    b.invuln = 0;
    a.facing = 1;
    b.hp = 5;
    a.inv[SLOT.HEAVY] = { id: 'shotgun', ammo: 6, dur: 1 };
    a.active = SLOT.HEAVY;
    m.step([intent({ attack: true })]);
    m.step([intent()]);
    for (let i = 0; i < 10; i++) m.step([]);
    expect(b.alive).toBe(false);
    expect(m.scores.get(100 + a.id)).toBe(1);
    for (let i = 0; i < 70; i++) m.step([]);
    expect(b.alive).toBe(true);
    expect(b.hp).toBe(100);
    expect(m.round).toBe(1);
    for (let i = 0; i < 20 / DT && m.phase === 'fight'; i++) m.step([]);
    expect(m.phase).toBe('matchEnd');
    expect(m.matchWinner).toBe(100 + a.id);
  });

  it('a tie at the buzzer goes to overtime', () => {
    const m = new Match(base({ mode: 'deathmatch', timeLimit: 2 }));
    for (let i = 0; i < 3 / DT; i++) m.step([]);
    expect(m.phase).toBe('fight');
    expect(m.overtime).toBe(true);
  });

  it('bots play deathmatch and the match ends', () => {
    const fighters = Array.from({ length: 6 }, (_, i) => spec('B' + i));
    const m = new Match(base({ mode: 'deathmatch', timeLimit: 40, fighters, weaponSpawnRate: 1 }));
    const bots = fighters.map((_, i) => new BotController(() => m.world, i, { seed: 3 }));
    let respawns = 0;
    for (let i = 0; i < 60 / DT && m.phase === 'fight'; i++) {
      m.step(bots.map((b) => b.poll()));
      respawns += m.world.events.filter((e) => e.t === 'respawn').length;
      m.world.events.length = 0;
    }
    expect(respawns).toBeGreaterThan(0);
    expect(m.phase).toBe('matchEnd');
  });
});

describe('brawl sudden death', () => {
  it('reveals, then drains everyone until the round ends', () => {
    const m = new Match(base({ suddenDeath: 3 }));
    const w = m.world;
    for (let i = 0; i < 3.2 / DT; i++) m.step([]);
    expect(w.suddenDeath).toBe(1);
    const hp = w.fighters[0].hp;
    for (let i = 0; i < 16 / DT; i++) m.step([]);
    expect(w.suddenDeath).toBe(2);
    expect(w.fighters[0].hp).toBeLessThan(hp);
    for (let i = 0; i < 60 / DT && m.round === 1; i++) m.step([]);
    expect(m.round).toBe(2); // everyone drained: draw, next round
  });
});

describe('input plumbing', () => {
  it('gadget/ability bits survive pack/unpack', () => {
    const i = { ...emptyIntent(), gadget: true, ability: true, moveX: 1 };
    const o = unpackIntent(packIntent(i));
    expect(o.gadget).toBe(true);
    expect(o.ability).toBe(true);
    expect(o.attack).toBe(false);
  });

  it('default bindings have no conflicts; duplicates are detected', () => {
    expect(findConflicts(DEFAULT_KEYBOARD)).toEqual([]);
    const binds = DEFAULT_KEYBOARD.map(cloneBinds);
    setBinding(binds[1], 'jump', 0, 'KeyF'); // P2 jump on P1's attack key
    const c = findConflicts(binds);
    expect(c.length).toBe(1);
    expect(c[0].code).toBe('KeyF');
    expect(c[0].a).toEqual({ player: 0, action: 'attack' });
    expect(c[0].b).toEqual({ player: 1, action: 'jump' });
  });

  it('setBinding keeps at most two unique keys per action', () => {
    const b = cloneBinds(DEFAULT_KEYBOARD[0]);
    setBinding(b, 'kick', 1, 'KeyQ');
    setBinding(b, 'kick', 2, 'KeyZ');
    expect(b.kick).toEqual(['KeyH', 'KeyQ']);
    setBinding(b, 'kick', 0, 'KeyQ');
    expect(b.kick).toEqual(['KeyQ']);
    setBinding(b, 'kick', 0, null);
    expect(b.kick).toEqual([]);
  });

  it('gadget button uses a medkit without switching weapons', async () => {
    const { makeWorld, run } = await import('./helpers');
    const w = makeWorld();
    run(w, 2);
    const f = w.fighters[0];
    f.hp = 40;
    f.inv[SLOT.SIDEARM] = { id: 'pistol', ammo: 5, dur: 1 };
    f.inv[SLOT.GADGET] = { id: 'medkit', ammo: 50, dur: 1 };
    f.active = SLOT.SIDEARM;
    run(w, 1, () => [intent({ gadget: true })]);
    expect(f.hp).toBe(90);
    expect(f.active).toBe(SLOT.SIDEARM);
    expect(f.inv[SLOT.GADGET]).toBeNull();
  });
});
