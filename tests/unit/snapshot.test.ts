import { describe, expect, it } from 'vitest';
import { BotController } from '../../src/ai/bot';
import type { Intent } from '../../src/sim/intent';
import { DT } from '../../src/sim/constants';
import { Match, type GameMode, type MatchConfig } from '../../src/sim/match';
import { MAP_LIST } from '../../src/sim/map/maps';
import { clonePlain } from '../../src/sim/snapshot';

/** What the test compares: the whole world and match state, as JSON (so -0 / NaN differences also show). */
const state = (m: Match) => JSON.stringify(m.snapshot());

function config(mapId: string, mode: GameMode, extra: Partial<MatchConfig> = {}): MatchConfig {
  const heroes = ['naruto', 'luffy', 'goku', 'sasuke', undefined, 'naruto'];
  return {
    mapId,
    mode,
    fighters: heroes.map((hero, i) => ({ name: 'B' + i, team: mode === 'coop' ? 0 : i % 3, isBot: true, upJumps: false, hero })),
    roundsToWin: 99,
    friendlyFire: false,
    weaponSpawnRate: 1,
    seed: 11,
    heroPowers: true,
    chaos: true,
    ...extra,
  };
}

/** Pre-recorded intents: bots decide once, then the same inputs are fed to the uninterrupted and the restored run. */
function recordIntents(cfg: MatchConfig, ticks: number) {
  const match = new Match(cfg);
  const log: Intent[][] = [];
  const bots = match.world.fighters.map((f, i) => new BotController(() => match.world, i, { difficulty: 'normal', seed: 5, clone: f.master >= 0 }));
  const intents = bots.map((b) => b.poll());
  const snaps: { tick: number; snap: ReturnType<Match['snapshot']> }[] = [];
  for (let t = 0; t < ticks; t++) {
    for (let i = 0; i < bots.length; i++) intents[i] = bots[i].poll();
    log.push(intents.map((it) => ({ ...it })));
    if (t % 300 === 150) snaps.push({ tick: t, snap: match.snapshot() });
    match.step(intents);
    match.world.events.length = 0;
    match.events.length = 0;
  }
  return { log, snaps, final: state(match) };
}

describe('snapshot / restore (D70)', () => {
  it('survives JSON and does not alias the live match', () => {
    const m = new Match(config('test', 'brawl'));
    const s = m.snapshot();
    const json = JSON.stringify(s);
    expect(JSON.stringify(JSON.parse(json))).toBe(json);
    m.step(m.world.fighters.map(() => ({ moveX: 1, moveY: 0, jump: true, attack: false, kick: false, interact: false, cycle: false, gadget: false, ability: false })));
    expect(JSON.stringify(s)).toBe(json); // stepping the original did not touch the snapshot
    expect(clonePlain(s)).toEqual(s);
  });

  it('restore then step N ticks equals the uninterrupted run (brawl, heroes, chaos)', () => {
    const cfg = config('test', 'brawl');
    const ticks = 60 * 14;
    const { log, snaps, final } = recordIntents(cfg, ticks);
    expect(snaps.length).toBeGreaterThan(2);
    for (const { tick, snap } of snaps) {
      const m = new Match(cfg);
      m.restore(JSON.parse(JSON.stringify(snap)));
      expect(state(m)).toBe(JSON.stringify(snap)); // restoring reproduces the snapshot exactly
      for (let t = tick; t < ticks; t++) {
        m.step(log[t]);
        m.world.events.length = 0;
        m.events.length = 0;
      }
      expect(state(m), `restored at tick ${tick}`).toBe(final);
    }
  });

  it.each(['deathmatch', 'koth', 'juggernaut', 'gungame', 'coop'] as const)('restore round trip: %s', (mode) => {
    const cfg = config('rooftops', mode, { chaos: false });
    const ticks = 60 * 10;
    const { log, snaps, final } = recordIntents(cfg, ticks);
    const { tick, snap } = snaps[1];
    const m = new Match(cfg);
    m.restore(JSON.parse(JSON.stringify(snap)));
    for (let t = tick; t < ticks; t++) {
      m.step(log[t]);
      m.world.events.length = 0;
      m.events.length = 0;
    }
    expect(state(m)).toBe(final);
  });

  it('round trip holds on maps with gimmicks (movers, hazards, cannons, waves)', () => {
    const withGimmicks = MAP_LIST.filter((d) => (d.gimmicks?.length ?? 0) > 0).slice(0, 6);
    expect(withGimmicks.length).toBeGreaterThan(2);
    for (const def of withGimmicks) {
      const cfg = config(def.id, 'brawl', { chaos: false });
      const ticks = 60 * 8;
      const { log, snaps, final } = recordIntents(cfg, ticks);
      const { tick, snap } = snaps[1];
      const m = new Match(cfg);
      m.restore(JSON.parse(JSON.stringify(snap)));
      for (let t = tick; t < ticks; t++) {
        m.step(log[t]);
        m.world.events.length = 0;
        m.events.length = 0;
      }
      expect(state(m), def.id).toBe(final);
    }
  });

  it('rejects a snapshot from a different world', () => {
    const a = new Match(config('test', 'brawl'));
    const b = new Match(config('rooftops', 'brawl'));
    expect(() => b.world.restore(a.world.snapshot())).toThrow();
  });

  it('keeps simulation time (DT) consistent after restore', () => {
    const m = new Match(config('test', 'brawl'));
    for (let i = 0; i < 90; i++) m.step(m.world.fighters.map(() => ({ moveX: 0, moveY: 0, jump: false, attack: false, kick: false, interact: false, cycle: false, gadget: false, ability: false })));
    const r = new Match(config('test', 'brawl'));
    r.restore(m.snapshot());
    expect(r.world.tick).toBe(90);
    expect(r.world.time).toBeCloseTo(90 * DT, 9);
  });
});
