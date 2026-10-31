// Bots in close hero fights (BOT_FIGHT in ai/botData.ts): hero moves at every range, blocking, beating a guard.
import { describe, expect, it } from 'vitest';
import { BotController } from '../../src/ai/bot';
import type { Difficulty } from '../../src/ai/botData';
import type { SimEvent } from '../../src/sim/events';
import type { Fighter, FighterSpawn } from '../../src/sim/fighter';
import type { Intent } from '../../src/sim/intent';
import { Match } from '../../src/sim/match';
import { World } from '../../src/sim/world';
import { FLAT, intent, spec } from './helpers';

const FLOOR = 144;
const hero = (name: string, id: string, startForm = 0): FighterSpawn => ({ ...spec(name), isBot: true, hero: id, startForm });

/** A bot (fighter 0) and a scripted fighter (1) facing each other on the flat map; the scripted one can't die. */
function duel(bot: FighterSpawn, other: FighterSpawn, bx: number, ox: number, seed = 4): World {
  const w = new World(FLAT, [bot, other], { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, seed);
  for (let i = 0; i < 5; i++) w.step([]);
  const [f, o] = w.fighters;
  for (const [g, x, face] of [[f, bx, ox >= bx ? 1 : -1], [o, ox, bx >= ox ? 1 : -1]] as const) {
    g.x = g.px = x;
    g.y = g.py = FLOOR;
    g.vx = g.vy = g.invuln = 0;
    g.facing = face;
    g.state = 'normal';
  }
  o.hp = 1e6;
  w.step([]);
  w.events.length = 0;
  return w;
}

/** Keep a dummy where it is (it still flinches / falls over, it just doesn't get knocked away). */
function pin(d: Fighter, x: number, y: number): void {
  d.x = d.px = x;
  d.y = d.py = y;
  d.vx = d.vy = 0;
}

/** Run the bot against a scripted opponent; `each` sees every tick's events and may stop the run. */
function play(w: World, bot: BotController, ticks: number, other: (t: number) => Partial<Intent>, each: (ev: SimEvent[], t: number) => boolean | void): void {
  for (let t = 0; t < ticks; t++) {
    w.step([bot.poll(), intent(other(t))]);
    const stop = each(w.events, t);
    w.events.length = 0;
    if (stop) return;
  }
}

describe('hero bots use their moves at every range', () => {
  it.each([
    ['naruto', 'rasengan'],
    ['sasuke', 'chidori'],
  ] as const)('%s dashes its %s point-blank', (id, weapon) => {
    const w = duel(hero('bot', id), spec('dummy'), 100, 114);
    const [f, d] = w.fighters;
    const bot = new BotController(() => w, 0, { difficulty: 'hard', seed: 3 });
    let formedClose = false;
    let landed = false;
    play(w, bot, 60 * 6, () => ({}), (ev) => {
      for (const e of ev) {
        if (e.t === 'rasengan' && e.f === 0 && e.phase === 'form' && Math.abs(f.x - d.x) < 30) formedClose = true;
        if (e.t === 'hit' && e.victim === 1 && e.weapon === weapon) landed = true;
      }
      pin(d, 114, FLOOR);
      return formedClose && landed;
    });
    expect(formedClose, 'started point-blank').toBe(true);
    expect(landed, 'landed').toBe(true);
  });

  it('a final-form hero fires its super point-blank (enemies crowding it set it off)', () => {
    const closeHits = [3, 4, 5, 6].filter((seed) => {
      const w = duel(hero('bot', 'naruto', 4), spec('dummy'), 100, 120);
      const [f, d] = w.fighters;
      const bot = new BotController(() => w, 0, { difficulty: 'hard', seed });
      let startedClose = false;
      let hit = false;
      play(w, bot, 60 * 4, () => ({}), (ev) => {
        for (const e of ev) {
          if (e.t === 'superStart' && e.f === 0 && Math.abs(f.x - d.x) <= 30) startedClose = true;
          if (e.t === 'hit' && e.victim === 1 && e.weapon === 'naruto:super' && startedClose) hit = true;
        }
        pin(d, 120, FLOOR);
        return hit;
      });
      return hit;
    }).length;
    expect(closeHits).toBeGreaterThanOrEqual(3);
  });

  it('the Rasengan dash is aimed diagonally at a target standing above', () => {
    // the dummy stands on the one-way platform (feet at y 80), up and to the right of Naruto
    const w = duel(hero('bot', 'naruto'), spec('dummy'), 110, 160);
    const [f, d] = w.fighters;
    pin(d, 160, 80);
    f.baseCd = 0.5; // (not the travel dash of the first tick, before it has seen the dummy)
    const bot = new BotController(() => w, 0, { difficulty: 'hard', seed: 5 });
    let below = false;
    let angle: number | null = null;
    let hit = false;
    play(w, bot, 60 * 6, () => ({}), (ev) => {
      for (const e of ev) {
        // (the orb forms below the target - from the floor or a hop - and the dash goes up at it)
        if (e.t === 'rasengan' && e.f === 0 && e.phase === 'form' && angle === null) below = f.y - d.y > 10;
        if (e.t === 'rasengan' && e.f === 0 && e.phase === 'dash' && angle === null && below) angle = f.dashAngle;
        if (e.t === 'hit' && e.victim === 1 && e.weapon === 'rasengan') hit = true;
      }
      pin(d, 160, 80);
      return angle !== null && hit;
    });
    expect(angle).not.toBeNull();
    expect(angle!).toBeCloseTo(-Math.PI / 4, 3); // up-forward
    expect(hit).toBe(true);
  });
});

describe('bots guard against attacks they see coming', () => {
  /** A Sasuke 60 px away dashes a Chidori at a plain fists bot: did the bot's guard meet it? */
  function chidoriAt(difficulty: Difficulty, seed: number): boolean {
    const w = duel({ ...spec('bot'), isBot: true }, hero('sasuke', 'sasuke'), 100, 160, seed);
    const bot = new BotController(() => w, 0, { difficulty, seed });
    let guarded = false;
    let hit = false;
    play(w, bot, 60, (t) => ({ ability: t < 20 }), (ev) => {
      for (const e of ev) {
        if ((e.t === 'block' || e.t === 'parry') && e.victim === 0) guarded = true;
        if (e.t === 'hit' && e.victim === 0) hit = true;
      }
      return guarded || hit;
    });
    return guarded;
  }

  it('expert bots raise the guard against a winding-up Chidori most of the time; easy bots rarely do', () => {
    const seeds = Array.from({ length: 20 }, (_, i) => 10 + i);
    const expert = seeds.filter((s) => chidoriAt('expert', s)).length;
    const easy = seeds.filter((s) => chidoriAt('easy', s)).length;
    expect(expert).toBeGreaterThanOrEqual(13);
    expect(easy).toBeLessThanOrEqual(5);
  });
});

describe('bots beat a guard instead of punching into it', () => {
  /** The bot next to an enemy that keeps its guard up toward it for 3 s. */
  function vsGuard(bot: FighterSpawn, seed: number): { punches: number; grabbed: boolean; ability: boolean } {
    const w = duel(bot, spec('blocker'), 100, 118);
    const [f, b] = w.fighters;
    for (let t = 0; t < 20; t++) w.step([intent(), intent({ attack: true })]);
    expect(b.state).toBe('block');
    w.events.length = 0;
    const ctl = new BotController(() => w, 0, { difficulty: 'hard', seed });
    let punches = 0;
    let grabbed = false;
    let ability = false;
    // (the blocker turns to keep facing the bot: its guard is always in the way)
    play(w, ctl, 60 * 3, () => ({ attack: true, moveX: Math.sign(f.x - b.x) }), (ev) => {
      for (const e of ev) {
        const front = Math.sign(f.x - b.x) === b.facing;
        if (e.t === 'swing' && e.f === 0 && b.state === 'block' && front && Math.abs(b.x - f.x) < 30) punches++;
        if (e.t === 'grab' && e.f === 0 && e.victim === 1) grabbed = true;
        if ((e.t === 'rasengan' && e.f === 0) || e.t === 'clone' || e.t === 'superStart') ability = true;
      }
    });
    return { punches, grabbed, ability };
  }
  const seeds = [7, 8, 9, 10, 11, 12];

  it('a fists bot grabs a guarding enemy (throws beat the guard) and never punches into it', () => {
    const runs = seeds.map((s) => vsGuard({ ...spec('bot'), isBot: true }, s));
    expect(runs.filter((r) => r.grabbed).length).toBeGreaterThanOrEqual(5);
    expect(runs.reduce((n, r) => n + r.punches, 0)).toBe(0);
  });

  it('a hero bot grabs or uses an ability on a guarding enemy, never its fists', () => {
    const runs = seeds.map((s) => vsGuard(hero('bot', 'naruto'), s));
    expect(runs.filter((r) => r.grabbed || r.ability).length).toBeGreaterThanOrEqual(5);
    expect(runs.reduce((n, r) => n + r.punches, 0)).toBe(0);
  });
});

describe('top-form Naruto vs Sasuke bots', () => {
  it('fight with their moves, not an endless fist fight (combos <= half the damage)', () => {
    const match = new Match({
      mapId: 'test', mode: 'brawl', roundsToWin: 99, friendlyFire: false, weaponSpawnRate: 0, seed: 11, heroPowers: false,
      fighters: [
        { name: 'NAR', team: 0, isBot: true, upJumps: false, hero: 'naruto', startForm: 4 },
        { name: 'SAS', team: 0, isBot: true, upJumps: false, hero: 'sasuke', startForm: 4 },
      ],
    } as ConstructorParameters<typeof Match>[0]);
    const bots = match.world.fighters.map((f: Fighter, i: number) => new BotController(() => match.world, i, { difficulty: 'hard', seed: 5, clone: f.master >= 0 }));
    let combo = 0;
    let total = 0;
    let moves = 0;
    for (let t = 0; t < 60 * 60; t++) {
      match.step(bots.map((b) => b.poll()));
      for (const e of match.world.events) {
        if (e.t === 'hit' && !e.corpse) {
          total += e.damage;
          if (e.weapon.endsWith(':combo')) combo += e.damage;
        }
        if (e.t === 'superStart' || (e.t === 'rasengan' && e.phase === 'dash') || e.t === 'amaterasu') moves++;
      }
      match.world.events.length = 0;
      match.events.length = 0;
    }
    expect(total).toBeGreaterThan(300);
    expect(combo / total).toBeLessThanOrEqual(0.5);
    expect(moves).toBeGreaterThan(20);
  });
});
