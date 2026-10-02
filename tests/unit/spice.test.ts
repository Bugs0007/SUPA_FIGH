import { describe, expect, it } from 'vitest';
import { computeAwards } from '../../src/sim/awards';
import { DT } from '../../src/sim/constants';
import { Match, type FighterStats } from '../../src/sim/match';
import { spec } from './helpers';

const st = (p: Partial<FighterStats>): FighterStats => ({
  kills: 0,
  deaths: 0,
  suicides: 0,
  damage: 0,
  roundsWon: 0,
  explosiveKills: 0,
  fireKills: 0,
  meleeKills: 0,
  envKills: 0,
  bounties: 0,
  ...p,
});

describe('awards', () => {
  it('gives each fighter at most one award, best title first', () => {
    const a = computeAwards([
      st({ kills: 9, damage: 600, explosiveKills: 4, roundsWon: 3 }),
      st({ kills: 2, explosiveKills: 2, deaths: 5 }),
      st({ suicides: 3, deaths: 4, damage: 5 }),
      st({ kills: 1, deaths: 0 }),
    ]);
    expect(a[0]).toMatchObject({ fighter: 0, title: 'MVP' });
    expect(a.find((x) => x.title === 'DEMOLITION EXPERT')?.fighter).toBe(1);
    expect(a.find((x) => x.title === 'BUTTERFINGERS')?.fighter).toBe(2);
    expect(a.find((x) => x.title === 'SURVIVOR')?.fighter).toBe(3);
    expect(new Set(a.map((x) => x.fighter)).size).toBe(a.length);
  });

  it('quiet matches still hand out silly awards (one each)', () => {
    expect(computeAwards([st({}), st({})]).map((a) => a.title)).toEqual(['SURVIVOR', 'PACIFIST']);
  });
});

describe('bounty', () => {
  it('the leader wears the crown; killing them is announced and worth a point in deathmatch', () => {
    const m = new Match({ mapId: 'test', mode: 'deathmatch', fighters: [spec('A'), spec('B'), spec('C')], roundsToWin: 3, friendlyFire: false, weaponSpawnRate: 0, seed: 2, timeLimit: 60 });
    expect(m.bounty).toBe(-1);
    m.stats[1].kills = 3;
    expect(m.bounty).toBe(1);
    const w = m.world;
    // C kills B (the bounty) by pushing them out of the world after being hit
    const [, b, c] = w.fighters;
    b.lastAttacker = c.id;
    b.lastHitTime = w.time;
    b.lastWeapon = 'pistol';
    b.y = w.killY + 10;
    m.step([]);
    expect(m.events.some((e) => e.t === 'bounty' && e.f === 1 && e.by === 2)).toBe(true);
    expect(m.scores.get(100 + 2)).toBe(2); // kill + bounty bonus
    expect(m.stats[2].envKills).toBe(1);
    for (let i = 0; i < 10 / DT; i++) m.step([]);
  });
});

import { MODIFIERS } from '../../src/sim/data/modifiers';
import { World } from '../../src/sim/world';
import { getMap } from '../../src/sim/map/maps';

describe('chaos modifiers', () => {
  const mk = (mods: string[]) => new World(getMap('test'), [spec('A'), spec('B')], { friendlyFire: false, weaponSpawnRate: 1, gravityScale: 1, modifiers: mods }, 3);

  it('each round flips a different card, deterministically', () => {
    const cfg = { mapId: 'test', mode: 'brawl' as const, fighters: [spec('A'), spec('B')], roundsToWin: 9, friendlyFire: false, weaponSpawnRate: 1, seed: 5, chaos: true };
    const seq = (m: Match) => {
      const out: string[] = [];
      for (let r = 0; r < 6; r++) {
        out.push(m.roundModifiers[0]);
        m.startRound();
      }
      return out;
    };
    const a = seq(new Match(cfg));
    expect(a).toEqual(seq(new Match(cfg)));
    for (let i = 1; i < a.length; i++) expect(a[i]).not.toBe(a[i - 1]);
    for (const id of a) expect(MODIFIERS.some((m) => m.id === id)).toBe(true);
  });

  it('modifiers change the world', () => {
    expect(mk(['lowGravity']).gravityScale).toBe(0.5);
    expect(mk(['explosive']).props.some((p) => p.type === 'crate')).toBe(false);
    expect(mk(['turbo']).fighters[0].speedBoost).toBeGreaterThan(100);
    expect(mk(['noGuns']).items.every((it) => !it.weaponId || !['pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'minigun', 'uzi', 'revolver', 'bazooka', 'flamer', 'flaregun'].includes(it.weaponId))).toBe(true);
    const armory = mk(['armory']).items.length;
    expect(armory).toBeGreaterThan(mk([]).items.length);
  });

  it('glass jaw triples damage, vampires heal the attacker', async () => {
    const { applyHit } = await import('../../src/sim/combat');
    const w = mk(['glassJaw', 'vampires']);
    const [a, b] = w.fighters;
    a.hp = 50;
    a.invuln = b.invuln = 0;
    applyHit(w, b, { damage: 10, kbX: 0, kbY: 0, attacker: a.id, weapon: 'pistol', kind: 'bullet' });
    expect(b.hp).toBe(70);
    expect(a.hp).toBe(65);
  });

  it('every modifier runs a round without crashing', () => {
    for (const m of MODIFIERS) {
      const w = mk([m.id]);
      for (let i = 0; i < 300; i++) w.step([]);
    }
  });
});

import { killFighter } from '../../src/sim/combat';
import { GHOST_COOLDOWN, GHOST_DELAY } from '../../src/sim/constants';
import { intent, run } from './helpers';

describe('ghosts', () => {
  it('the dead rise as ghosts in brawl, fly around and BOO things away', () => {
    const w = new World(getMap('test'), [spec('A'), spec('B')], { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1, ghosts: true }, 3);
    const [a, b] = w.fighters;
    run(w, 5);
    killFighter(w, a, { damage: 999, kbX: 0, kbY: 0, attacker: -1, weapon: 'test', kind: 'fall' });
    run(w, Math.ceil(GHOST_DELAY * 60) + 5);
    expect(a.ghost).toBe(true);
    const x0 = a.gx;
    run(w, 30, () => [intent({ moveX: 1 })]);
    expect(a.gx).toBeGreaterThan(x0 + 20);
    // park the ghost next to B and BOO
    a.gx = b.x - 20;
    a.gy = b.y - 12;
    a.ghostCd = 0;
    const bx = b.x;
    run(w, 1, () => [intent({ attack: true })]);
    run(w, 10);
    expect(Math.abs(b.x - bx)).toBeGreaterThan(3);
    expect(a.ghostCd).toBeGreaterThan(GHOST_COOLDOWN - 1);
    // can't spam
    const cd = a.ghostCd;
    run(w, 1, () => [intent()]);
    run(w, 1, () => [intent({ attack: true })]);
    expect(a.ghostCd).toBeLessThan(cd);
  });

  it('no ghosts in deathmatch worlds', () => {
    const w = new World(getMap('test'), [spec('A'), spec('B')], { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 3);
    const a = w.fighters[0];
    killFighter(w, a, { damage: 999, kbX: 0, kbY: 0, attacker: -1, weapon: 'test', kind: 'fall' });
    run(w, 200);
    expect(a.ghost).toBe(false);
  });
});

import { BotController } from '../../src/ai/bot';
import { ReplayPlayer } from '../../src/sim/replay';

describe('instant replay', () => {
  it('re-simulating the recorded round reproduces it exactly', () => {
    const fighters = Array.from({ length: 6 }, (_, i) => spec('B' + i));
    const m = new Match({ mapId: 'factory', mode: 'brawl', fighters, roundsToWin: 5, friendlyFire: false, weaponSpawnRate: 1, seed: 77, chaos: true });
    const bots = fighters.map((_, i) => new BotController(() => m.world, i, { seed: 4 }));
    const original = m.world;
    for (let t = 0; t < 150 / DT && m.round === 1; t++) {
      m.step(bots.map((b) => b.poll()));
      m.world.events.length = 0;
    }
    expect(m.round).toBe(2);
    const rec = m.lastRecording!;
    expect(rec.finalKillTick).toBeGreaterThan(0);
    expect(rec.ticks).toBe(original.tick);
    const p = new ReplayPlayer(rec);
    p.skipTo(rec.ticks);
    const snap = (w: typeof original) =>
      JSON.stringify([w.tick, w.fighters.map((f) => [f.x, f.y, f.hp, f.alive, f.state, f.inv.map((i) => i?.id)]), w.props.map((q) => [q.x, q.y, q.active])]);
    expect(snap(p.world)).toBe(snap(original));
  });
});
