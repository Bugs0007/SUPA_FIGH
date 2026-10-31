import { describe, expect, it } from 'vitest';
import { BotController } from '../../src/ai/bot';
import { BOT_FIGHT } from '../../src/ai/botData';
import { applyHit, heavyOnGuard } from '../../src/sim/combat';
import { BLOCK, DT } from '../../src/sim/constants';
import { SLOT } from '../../src/sim/data/weapons';
import type { SimEvent } from '../../src/sim/events';
import type { FighterSpawn } from '../../src/sim/fighter';
import type { Intent } from '../../src/sim/intent';
import { getMap } from '../../src/sim/map/maps';
import { World } from '../../src/sim/world';
import { FLAT, intent, spec } from './helpers';

const FLOOR = 144;

/** Two fighters on the flat map, facing each other: A at 100 (facing right), B at `bx` (facing left). */
function duel(bx = 112, specs: FighterSpawn[] = [spec('A'), spec('B')]): World {
  const w = new World(FLAT, specs, { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 7);
  for (let i = 0; i < 5; i++) w.step([]);
  const [a, b] = w.fighters;
  for (const [f, x, face] of [[a, 100, 1], [b, bx, -1]] as const) {
    f.x = f.px = x;
    f.y = f.py = FLOOR;
    f.vx = f.vy = f.invuln = 0;
    f.facing = face;
    f.state = 'normal';
  }
  w.step([]);
  w.events.length = 0;
  return w;
}

/** Step `ticks` ticks with fixed intents for A and B; returns the events. */
function step(w: World, ticks: number, a: Partial<Intent> = {}, b: Partial<Intent> = {}): SimEvent[] {
  const out: SimEvent[] = [];
  for (let t = 0; t < ticks; t++) {
    w.step([intent(a), intent(b)]);
    out.push(...w.events);
    w.events.length = 0;
  }
  return out;
}

/** B raises its guard (holding PUNCH) and waits until the perfect-block window is over. */
function guardUp(w: World): void {
  step(w, 30, {}, { attack: true });
  expect(w.fighters[1].state).toBe('block');
  expect(w.fighters[1].parryT).toBe(0);
}

const ticks = (s: number) => Math.round(s / DT);

describe('blocking (hold PUNCH)', () => {
  it('a tap still punches and never raises the guard', () => {
    const w = duel(140);
    const a = w.fighters[0];
    const ev = step(w, 1, { attack: true });
    expect(a.state).toBe('melee');
    expect(ev.some((e) => e.t === 'swing')).toBe(true);
    for (let t = 0; t < 40; t++) {
      step(w, 1);
      expect(a.state).not.toBe('block');
    }
  });

  it('holding PUNCH raises the guard after BLOCK.hold seconds', () => {
    const w = duel(160);
    const a = w.fighters[0];
    expect(BLOCK.hold).toBe(0.15);
    step(w, ticks(BLOCK.hold), { attack: true }); // 9 ticks: 0.133 s held after the press tick
    expect(a.state).not.toBe('block');
    step(w, 1, { attack: true });
    expect(a.state).toBe('block');
    expect(a.parryT).toBeGreaterThan(0);
    // letting go drops it at once
    step(w, 1);
    expect(a.state).toBe('normal');
  });

  it('a held swing still in its windup is cancelled into the guard (no hit)', () => {
    const w = duel(114);
    const [a, b] = w.fighters;
    a.inv[SLOT.MELEE] = { id: 'chair', ammo: 0, dur: 4 }; // windup 0.18 s > the 0.15 s hold
    a.active = SLOT.MELEE;
    const ev = step(w, ticks(BLOCK.hold) + 1, { attack: true });
    expect(a.state).toBe('block');
    step(w, 20, { attack: true });
    expect(b.hp).toBe(100);
    expect(ev.some((e) => e.t === 'hit')).toBe(false);
  });

  it('holding attack with a gun or a throwable aims as before', () => {
    for (const [slot, id, ammo] of [[SLOT.SIDEARM, 'pistol', 12], [SLOT.THROWABLE, 'grenade', 2]] as const) {
      const w = duel(200);
      const a = w.fighters[0];
      a.inv[slot] = { id, ammo, dur: 1 };
      a.active = slot;
      step(w, 30, { attack: true });
      expect(a.state, id).toBe('aim');
    }
  });

  it('a frontal punch is blocked: chip damage, pushback, guard drain, no stun', () => {
    const w = duel();
    const [a, b] = w.fighters;
    guardUp(w);
    const ev = step(w, 12, { attack: true }, { attack: true });
    expect(ev.some((e) => e.t === 'hit' && e.victim === 1)).toBe(false);
    const blk = ev.find((e) => e.t === 'block');
    expect(blk).toMatchObject({ t: 'block', victim: 1, attacker: 0, chip: 0.6 });
    expect(b.hp).toBeCloseTo(100 - 4 * BLOCK.chip, 5);
    expect(b.guard).toBeLessThan(BLOCK.max);
    expect(b.state).toBe('block');
    expect(a.state).not.toBe('flinch');
  });

  it('a blocked kick does not knock down or pop up, costs double guard and holds the blocker in blockstun', () => {
    const w = duel();
    const [, b] = w.fighters;
    guardUp(w);
    let stun = 0;
    let vy = 0;
    for (let t = 0; t < 14; t++) {
      step(w, 1, { kick: t === 0 }, { attack: true });
      stun = Math.max(stun, b.blockStun);
      vy = Math.min(vy, b.vy);
    }
    expect(b.state).toBe('block');
    expect(vy).toBeGreaterThanOrEqual(0);
    expect(b.vx).toBeGreaterThanOrEqual(0); // pushed away from A (to the right), never pulled in
    expect(Math.abs(100 - b.hp - 9 * BLOCK.chip)).toBeLessThanOrEqual(0.051); // (chip is rounded to 0.1)
    expect(BLOCK.max - b.guard).toBeCloseTo(9 * BLOCK.costKick, 1);
    expect(stun).toBeGreaterThan(BLOCK.stunBase);
    expect(stun).toBeLessThanOrEqual(BLOCK.stunBase + 9 * BLOCK.stunPerDamage);
    // blockstun: releasing PUNCH does not drop the guard until it is over
    step(w, 1, {}, {});
    if (b.blockStun > 0) expect(b.state).toBe('block');
    step(w, ticks(BLOCK.stunMax) + 2);
    expect(b.state).toBe('normal');
  });

  it('a hit from behind is not blocked and drops the guard', () => {
    const w = duel();
    const [, b] = w.fighters;
    step(w, 30, {}, { attack: true, moveX: 1 }); // B guards facing away from A
    expect(b.state).toBe('block');
    expect(b.facing).toBe(1);
    const ev = step(w, 12, { attack: true }, { attack: true, moveX: 1 });
    expect(ev.some((e) => e.t === 'block')).toBe(false);
    expect(ev.some((e) => e.t === 'hit' && e.victim === 1)).toBe(true);
    expect(b.hp).toBe(96);
  });

  it('an empty guard meter breaks: the hit lands in full, 1.2 s stun, meter refills to 50', () => {
    const w = duel();
    const [, b] = w.fighters;
    guardUp(w);
    b.guard = 5;
    const ev = step(w, 14, { kick: true }, { attack: true });
    expect(ev.some((e) => e.t === 'guardBreak' && e.victim === 1)).toBe(true);
    expect(b.hp).toBe(91); // the full 9 of the kick
    expect(b.state).toBe('flinch');
    expect(b.flinchTime).toBe(BLOCK.breakStun);
    expect(b.guard).toBeGreaterThanOrEqual(BLOCK.breakRefill);
    expect(b.guard).toBeLessThan(BLOCK.breakRefill + 1);
    // still dazed a second later even though PUNCH is held
    step(w, 60, {}, { attack: true });
    expect(b.state).toBe('flinch');
  });

  it('the guard regenerates once nothing was blocked for a second', () => {
    const w = duel();
    const [, b] = w.fighters;
    guardUp(w);
    step(w, 12, { attack: true }, { attack: true });
    const after = b.guard;
    expect(after).toBeLessThan(BLOCK.max);
    step(w, ticks(BLOCK.regenDelay) - 14, {}, { attack: true });
    expect(b.guard).toBeCloseTo(after, 5);
    b.guard = 40;
    step(w, 60, {}, { attack: true });
    expect(b.guard).toBeGreaterThan(40 + BLOCK.regen * 0.9);
    step(w, 240);
    expect(b.guard).toBe(BLOCK.max);
  });

  it('a perfect block (right as the guard comes up) costs nothing and staggers the attacker', () => {
    const w = duel();
    const [a, b] = w.fighters;
    // B starts holding out of reach (its own opening jab whiffs), steps in as the guard comes up (tick 10),
    // and A's jab connects 3 ticks after its press: inside the 0.12 s window
    b.x = b.px = 150;
    const ev: SimEvent[] = [];
    let staggered = 0;
    for (let t = 0; t < 30; t++) {
      if (t === 10) {
        expect(b.state).toBe('block');
        b.x = b.px = 112;
        b.vx = 0;
      }
      ev.push(...step(w, 1, { attack: t === 10 }, { attack: true }));
      if (a.state === 'flinch') staggered = a.flinchTime;
    }
    expect(ev.find((e) => e.t === 'parry')).toMatchObject({ victim: 1, attacker: 0 });
    expect(ev.some((e) => e.t === 'block' || (e.t === 'hit' && e.victim === 1))).toBe(false);
    expect(b.hp).toBe(100);
    expect(b.guard).toBe(BLOCK.max);
    expect(staggered).toBe(BLOCK.parryStagger);
  });

  it('one parry window per press: a guard raised again in the same press has none', () => {
    const w = duel(200);
    const a = w.fighters[0];
    step(w, 12, { attack: true });
    expect(a.parryT).toBeGreaterThan(0);
    step(w, 1, { attack: true, jump: true }); // jump out of the guard...
    expect(a.vy).toBeLessThan(0);
    step(w, 2, { attack: true, jump: true }); // ...and it comes back up in the air
    expect(a.state).toBe('block');
    expect(a.grounded).toBe(false);
    expect(a.parryT).toBe(0);
    // release and hold again: a new window
    step(w, 60);
    step(w, 12, { attack: true });
    expect(a.state).toBe('block');
    expect(a.parryT).toBeGreaterThan(0);
  });

  it('fire, sudden-death drain and grabs go straight through a guard', () => {
    const w = duel();
    const [a, b] = w.fighters;
    guardUp(w);
    applyHit(w, b, { damage: 5, kbX: 0, kbY: 0, attacker: 0, weapon: 'fire', kind: 'fire', ignoreInvuln: true });
    expect(b.hp).toBe(95);
    applyHit(w, b, { damage: 3, kbX: 0, kbY: 0, attacker: -1, weapon: 'suddendeath', kind: 'drain', ignoreInvuln: true });
    expect(b.hp).toBe(92);
    expect(b.state).toBe('block');
    expect(b.guard).toBe(BLOCK.max);
    a.x = a.px = 104;
    step(w, 1, { interact: true }, { attack: true });
    expect(a.state).toBe('grabbing');
    expect(b.state).toBe('grabbed');
  });

  it('jump and kick cancel out of the guard', () => {
    const w = duel(200);
    const a = w.fighters[0];
    step(w, 12, { attack: true });
    expect(a.state).toBe('block');
    step(w, 1, { attack: true, jump: true });
    expect(a.state).toBe('normal');
    expect(a.vy).toBeLessThan(0);
    step(w, 60);
    step(w, 12, { attack: true });
    expect(a.state).toBe('block');
    step(w, 1, { attack: true, kick: true });
    expect(a.state).toBe('kick');
  });

  it('a hero cancels the guard into an ability', () => {
    const w = duel(300, [{ ...spec('N'), hero: 'naruto' }, spec('B')]);
    const n = w.fighters[0];
    step(w, 12, { attack: true });
    expect(n.state).toBe('block');
    step(w, 1, { attack: true, ability: true });
    expect(n.state).toBe('special');
  });

  it('hero abilities chip 0.3 and Chidori (2 s stun) is blocked without stunning', () => {
    const w = duel(130, [{ ...spec('S'), hero: 'sasuke' }, spec('B')]);
    const [s, b] = w.fighters;
    s.x = s.px = 70;
    guardUp(w);
    const ev = step(w, 50, { ability: true }, { attack: true });
    const blk = ev.find((e) => e.t === 'block');
    expect(blk).toBeDefined();
    expect(ev.some((e) => e.t === 'hit' && e.victim === 1)).toBe(false);
    expect(b.hp).toBeCloseTo(100 - 14 * BLOCK.chipHeavy, 5);
    expect(b.state).toBe('block');
    expect(heavyOnGuard({ kind: 'melee', weapon: 'chidori' })).toBe(true);
    expect(heavyOnGuard({ kind: 'bullet', weapon: 'goku:second' })).toBe(true);
    expect(heavyOnGuard({ kind: 'melee', weapon: 'naruto:combo' })).toBe(false);
    expect(heavyOnGuard({ kind: 'explosion', weapon: 'grenade' })).toBe(true);
    expect(heavyOnGuard({ kind: 'melee', weapon: 'fists' })).toBe(false);
    expect(s.id).toBe(0);
  });

  it('a frontal bullet is blocked and stops; one in the back is not', () => {
    const w = duel(200);
    const [a, b] = w.fighters;
    a.inv[SLOT.SIDEARM] = { id: 'pistol', ammo: 12, dur: 1 };
    a.active = SLOT.SIDEARM;
    guardUp(w);
    // aim (hold), fire (release): semi-automatic
    const ev = step(w, 20, { attack: true }, { attack: true });
    ev.push(...step(w, 30, {}, { attack: true }));
    expect(ev.some((e) => e.t === 'block' && e.victim === 1)).toBe(true);
    expect(ev.some((e) => e.t === 'hit' && e.victim === 1)).toBe(false);
    expect(b.hp).toBeGreaterThan(97);
    expect(b.state).toBe('block');
    expect(w.bullets.some((x) => x.active)).toBe(false);
    // B turns its back (still guarding): the next one goes through
    step(w, 5, {}, { attack: true, moveX: 1 });
    expect(b.facing).toBe(1);
    ev.push(...step(w, 20, { attack: true }, { attack: true, moveX: 1 }));
    ev.push(...step(w, 30, {}, { attack: true, moveX: 1 }));
    expect(ev.some((e) => e.t === 'hit' && e.victim === 1 && e.kind === 'bullet')).toBe(true);
    expect(b.hp).toBeLessThan(90);
  });

  it('bots guard now and then, always briefly (they never turtle)', () => {
    // (bots raise the guard on purpose since the close-fight AI, BOT_FIGHT in ai/botData.ts)
    const map = getMap('test');
    const n = 6;
    const w = new World(map, Array.from({ length: n }, (_, i) => ({ ...spec('bot' + i), isBot: true })), { friendlyFire: false, weaponSpawnRate: 1, gravityScale: 1 }, 11);
    const bots = w.fighters.map((_, i) => new BotController(() => w, i, { difficulty: 'expert', seed: 100 + i }));
    const run = new Array(n).fill(0);
    let blocks = 0;
    let longest = 0;
    for (let t = 0; t < 60 * 40; t++) {
      w.step(bots.map((bot) => bot.poll()));
      w.fighters.forEach((f, i) => {
        run[i] = f.state === 'block' ? run[i] + 1 : 0;
        if (run[i]) blocks++;
        longest = Math.max(longest, run[i]);
      });
    }
    expect(blocks / (n * 60 * 40)).toBeLessThan(0.05);
    expect(longest * DT).toBeLessThanOrEqual(BOT_FIGHT.guardMax + BLOCK.stunMax + 0.1);
  });
});
