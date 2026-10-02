import { describe, expect, it } from 'vitest';
import { BotController } from '../../src/ai/bot';
import { killFighter } from '../../src/sim/combat';
import { DT } from '../../src/sim/constants';
import { SLOT } from '../../src/sim/data/weapons';
import { COOP, GUN_LADDER, JUGGERNAUT, Match, type GameMode, type MatchConfig } from '../../src/sim/match';
import { spec } from './helpers';

const cfg = (mode: GameMode, n = 4, over: Partial<MatchConfig> = {}): MatchConfig => ({
  mapId: 'test',
  mode,
  fighters: Array.from({ length: n }, (_, i) => ({ ...spec('F' + i), isBot: true })),
  roundsToWin: 3,
  friendlyFire: false,
  weaponSpawnRate: 1,
  seed: 6,
  timeLimit: 240,
  ...over,
});

const kill = (m: Match, victim: number, killer: number, weapon = 'pistol', kind: 'bullet' | 'melee' = 'bullet') => {
  const v = m.world.fighters[victim];
  const from = m.world.events.length;
  killFighter(m.world, v, { damage: 999, kbX: 0, kbY: 0, attacker: killer, weapon, kind });
  m.processWorldEvents(from);
  m.world.events.length = 0;
  m.step([]);
};

/** Bots play the mode until the match ends (or the cap). */
function playOut(c: MatchConfig, seconds: number): Match {
  const m = new Match(c);
  const bots = c.fighters.map((_, i) => new BotController(() => m.world, i, { seed: 3, difficulty: 'hard' }));
  for (let t = 0; t < seconds / DT && m.phase === 'fight'; t++) {
    m.step(bots.map((b) => b.poll()));
    m.world.events.length = 0;
    m.events.length = 0;
  }
  return m;
}

describe('king of the hill', () => {
  it('holding the hill alone scores; bots fight over it until someone wins', () => {
    const m = new Match(cfg('koth'));
    expect(m.hill).toBeTruthy();
    const f = m.world.fighters[0];
    const h = m.hill!;
    for (let i = 0; i < 3 / DT; i++) {
      f.x = h.x + h.w / 2;
      f.y = h.y + h.h;
      for (const o of m.world.fighters.slice(1)) o.x = 30; // far away
      m.step([]);
    }
    expect(m.scores.get(100)).toBeGreaterThanOrEqual(2);
    const played = playOut(cfg('koth', 6, { target: 20 }), 200);
    expect(played.phase).toBe('matchEnd');
  });
});

describe('juggernaut', () => {
  it('one heavy fighter; killing it passes the mantle and scores', () => {
    const m = new Match(cfg('juggernaut'));
    const j = m.juggernaut;
    expect(j).toBeGreaterThanOrEqual(0);
    expect(m.world.fighters[j].maxHp).toBe(JUGGERNAUT.hp);
    expect(m.world.fighters[j].inv[SLOT.HEAVY]?.id).toBe('minigun');
    expect(m.bounty).toBe(j);
    const other = (j + 1) % 4;
    kill(m, j, other);
    expect(m.juggernaut).toBe(other);
    expect(m.world.fighters[other].maxHp).toBe(JUGGERNAUT.hp);
    expect(m.scores.get(100 + other)).toBe(1);
  });
});

describe('gun game', () => {
  it('kills climb the ladder, melee kills demote, the final knife kill wins', () => {
    const m = new Match(cfg('gungame'));
    const w = m.world;
    expect(w.fighters[0].inv[SLOT.SIDEARM]?.id).toBe(GUN_LADDER[0]);
    kill(m, 1, 0);
    expect(m.gunLevel[0]).toBe(1);
    expect(w.fighters[0].inv[SLOT.SIDEARM]?.id).toBe(GUN_LADDER[1]);
    m.gunLevel[2] = 3;
    kill(m, 2, 0, 'knife', 'melee');
    expect(m.gunLevel[2]).toBe(2);
    m.gunLevel[0] = GUN_LADDER.length - 1;
    for (let i = 0; i < 200; i++) m.step([]); // let the victims respawn
    kill(m, 3, 0, 'knife', 'melee');
    expect(m.phase).toBe('matchEnd');
    expect(m.matchWinner).toBe(100);
  });

  it('weapons are handed out, never picked up', () => {
    const m = new Match(cfg('gungame'));
    const f = m.world.fighters[0];
    f.inv[SLOT.SIDEARM]!.ammo = 0;
    m.step([]);
    expect(f.inv[SLOT.SIDEARM]!.ammo).toBeGreaterThan(0);
    expect(m.world.items.length).toBe(0);
  });
});

describe('co-op survival', () => {
  it('waves of bots, shared lives, revives', () => {
    const fighters = [{ ...spec('H1'), isBot: false }, { ...spec('H2'), isBot: false }, ...Array.from({ length: 6 }, (_, i) => ({ ...spec('B' + i), isBot: true }))];
    const m = new Match(cfg('coop', 8, { fighters }));
    const w = m.world;
    expect(w.fighters.slice(2).every((f) => !f.alive)).toBe(true);
    for (let i = 0; i < 3 / DT; i++) m.step([]);
    expect(m.wave).toBe(1);
    const alive = w.fighters.slice(2).filter((f) => f.alive);
    expect(alive.length).toBe(2);
    // clear the wave
    for (const b of alive) kill(m, b.id, 0);
    for (let i = 0; i < (COOP.waveBreak + 1) / DT; i++) m.step([]);
    expect(m.wave).toBe(2);
    // a human dies: costs a life, respawns
    const lives = m.lives;
    kill(m, 1, 5);
    expect(m.lives).toBe(lives - 1);
    // revive instead of waiting: P1 holds interact over P2's body
    const [h1, h2] = w.fighters;
    h1.x = h2.x;
    h1.y = h2.y;
    for (let i = 0; i < (COOP.reviveTime + 0.2) / DT && !h2.alive; i++) {
      h1.x = h2.x;
      h1.y = h2.y;
      m.step([{ moveX: 0, moveY: 0, jump: false, attack: false, kick: false, interact: true, cycle: false, gadget: false, ability: false }]);
    }
    expect(h2.alive).toBe(true);
    expect(m.lives).toBe(lives); // refunded
  });

  it('the game ends when every human is down and no lives are left', () => {
    const fighters = [{ ...spec('H1'), isBot: false }, ...Array.from({ length: 3 }, (_, i) => ({ ...spec('B' + i), isBot: true }))];
    const m = new Match(cfg('coop', 4, { fighters }));
    m.lives = 0;
    kill(m, 0, -1);
    m.step([]);
    expect(m.phase).toBe('matchEnd');
  });
});

describe('bots play every respawn mode to the end', () => {
  it.each(['deathmatch', 'juggernaut', 'gungame'] as const)('%s', (mode) => {
    const m = playOut(cfg(mode, 6, { timeLimit: 60, target: 6 }), 130);
    expect(m.phase).toBe('matchEnd');
  });
});
