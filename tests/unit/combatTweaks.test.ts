import { describe, expect, it } from 'vitest';
import { BotController } from '../../src/ai/bot';
import { DEFAULT_KEYBOARD, findConflicts, loadKeyBinds, type KeyBinds } from '../../src/input/bindings';
import { DEFAULT_PAD, loadPadBinds, PAD_ACTIONS } from '../../src/input/gamepad';
import { intentFor, IntentSlot, TickSampler } from '../../src/net/intentWire';
import { parseClientMsg, PROTOCOL_VERSION } from '../../src/net/protocol';
import { HEROES } from '../../src/sim/data/heroes';
import { applyHit } from '../../src/sim/combat';
import type { SimEvent } from '../../src/sim/events';
import type { Fighter } from '../../src/sim/fighter';
import { clonesOf, summonClones, transform } from '../../src/sim/hero';
import { emptyIntent, packIntent, unpackIntent, type Intent } from '../../src/sim/intent';
import { getMap } from '../../src/sim/map/maps';
import { RoundRecording } from '../../src/sim/replay';
import { World } from '../../src/sim/world';
import { FLAT, intent, run, spec } from './helpers';

const N = HEROES.naruto.base.dash!;
const S = HEROES.sasuke.base.dash!;

// ------------------------------------------------------------------ the BLOCK button on the wire

describe('the BLOCK button bit', () => {
  it('pack / unpack round-trips it next to every other button (bit 15)', () => {
    const all: (keyof Intent)[] = ['jump', 'attack', 'kick', 'interact', 'cycle', 'gadget', 'ability', 'block'];
    for (const b of all) {
      const i = { ...emptyIntent(), [b]: true, moveX: 1, moveY: -1 } as Intent;
      const o = unpackIntent(packIntent(i));
      for (const k of all) expect(o[k], `${b} -> ${k}`).toBe(k === b);
      expect(o.moveX).toBe(1);
      expect(o.moveY).toBe(-1);
    }
    expect(packIntent({ ...emptyIntent(), block: true }) >> 8).toBe(128);
    expect(packIntent({ ...emptyIntent(), block: true, moveX: 1, moveY: 1 })).toBeLessThanOrEqual(0xffff);
  });

  it('a BLOCK tap between two network ticks still reaches the server (edges)', () => {
    const s = new TickSampler();
    s.poll({ ...emptyIntent(), block: true });
    s.poll(emptyIntent());
    const { v, e } = s.tick(0);
    expect(intentFor(v, e).block).toBe(true);
    const slot = new IntentSlot();
    slot.apply(0, v, e);
    expect(slot.take(emptyIntent()).block).toBe(true);
    expect(slot.take(emptyIntent()).block).toBe(false);
  });

  it('the protocol accepts the 16-bit controls and was bumped so older peers are refused', () => {
    expect(PROTOCOL_VERSION).toBe(5);
    const v = packIntent({ ...emptyIntent(), block: true, attack: true });
    expect(v).toBeGreaterThan(0x7fff);
    const m = parseClientMsg(JSON.stringify({ t: 'in', slot: 0, seq: 1, v, e: v & 0xff00 }));
    expect(m).toMatchObject({ t: 'in', v, e: v & 0xff00 });
    expect(parseClientMsg(JSON.stringify({ t: 'in', slot: 0, seq: 1, v: 0x10000, e: 0 }))).toBeNull();
  });

  it('replays record and play back BLOCK', () => {
    const w = new World(FLAT, [spec('A')], { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 3);
    const rec = new RoundRecording(FLAT, [spec('A')], { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 3, w.fighters.length);
    rec.record([intent({ block: true, kick: true })], 0);
    rec.record([intent({ attack: true })], 0);
    const out = [emptyIntent()];
    rec.read(0, out);
    expect(out[0]).toMatchObject({ block: true, kick: true, attack: false });
    rec.read(1, out);
    expect(out[0]).toMatchObject({ block: false, attack: true });
  });
});

// ------------------------------------------------------------------ bindings

describe('BLOCK bindings', () => {
  it('defaults: G (P1), Num5 / K (P2), RT on pads, with no conflicts anywhere', () => {
    expect(DEFAULT_KEYBOARD[0].block).toEqual(['KeyG']);
    expect(DEFAULT_KEYBOARD[1].block).toEqual(['Numpad5', 'KeyK']);
    expect(findConflicts(DEFAULT_KEYBOARD)).toEqual([]);
    expect(DEFAULT_PAD.block).toEqual([7]);
    expect(DEFAULT_PAD.attack).toEqual([2]);
    const used = PAD_ACTIONS.flatMap((a) => DEFAULT_PAD[a]);
    expect(new Set(used).size).toBe(used.length);
  });

  it('keyboard bindings saved before BLOCK existed still load, and BLOCK gets its default keys', () => {
    const old = DEFAULT_KEYBOARD.map((b) => {
      const o: Partial<KeyBinds> = { ...b };
      delete o.block;
      return o;
    });
    old[0].attack = ['KeyY']; // a custom binding survives
    const binds = loadKeyBinds(old);
    expect(binds[0].attack).toEqual(['KeyY']);
    expect(binds[0].block).toEqual(['KeyG']);
    expect(binds[1].block).toEqual(['Numpad5', 'KeyK']);
    // a save that already uses G for something else: BLOCK is left unbound there instead of clashing
    old[0].gadget = ['KeyG'];
    const b2 = loadKeyBinds(old);
    expect(b2[0].block).toEqual([]);
    expect(findConflicts(b2)).toEqual([]);
    // a save with BLOCK keeps it
    expect(loadKeyBinds([{ ...DEFAULT_KEYBOARD[0], block: ['KeyQ'] }, DEFAULT_KEYBOARD[1]])[0].block).toEqual(['KeyQ']);
  });

  it('pad bindings saved before BLOCK: the old second PUNCH on RT becomes BLOCK', () => {
    const old = { jump: [0], attack: [2, 7], kick: [1], interact: [3], cycle: [5], gadget: [4], ability: [6] };
    const [p] = loadPadBinds([old]);
    expect(p.attack).toEqual([2]);
    expect(p.block).toEqual([7]);
    // a custom save that put RT on another action keeps it, BLOCK starts unbound
    const [q] = loadPadBinds([{ ...old, attack: [2], ability: [7] }]);
    expect(q.ability).toEqual([7]);
    expect(q.block).toEqual([]);
    expect(loadPadBinds(null)[0]).toEqual(DEFAULT_PAD);
  });
});

// ------------------------------------------------------------------ shadow clones never guard

describe('shadow clones cannot block or parry', () => {
  function withClones(): { w: World; n: Fighter; clones: Fighter[] } {
    const w = new World(FLAT, [{ ...spec('N'), hero: 'naruto' }, spec('E')], { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 }, 9);
    run(w, 5);
    const n = w.fighters[0];
    expect(summonClones(w, n)).toBeGreaterThan(0);
    return { w, n, clones: clonesOf(w, n) };
  }

  it('holding BLOCK never raises a clone guard (Naruto himself still guards)', () => {
    const { w, n, clones } = withClones();
    for (let t = 0; t < 60; t++) {
      w.step(w.fighters.map(() => intent({ block: true })));
      for (const c of clones) expect(c.state).not.toBe('block');
    }
    expect(n.state).toBe('block');
  });

  it.each([0,.12])('a clone in stale guard state cannot block or parry (parry timer %s)',parry=>{
    const {w,clones}=withClones(),c=clones[0],attacker=w.fighters[1];
    attacker.x=c.x+c.facing*12;attacker.y=c.y;
    c.invuln=0;c.state='block';c.parryT=parry;c.blockStun=.5;
    const hp=c.hp;w.events.length=0;
    expect(applyHit(w,c,{damage:5,kbX:0,kbY:0,attacker:attacker.id,weapon:'fists',kind:'melee',x:attacker.x,y:c.y-10})).toBe(true);
    expect(c.hp).toBe(hp-5);
    expect(c.parryT).toBe(0);expect(c.blockStun).toBe(0);
    expect(w.events.some(e=>(e.t==='block'||e.t==='parry')&&e.victim===c.id)).toBe(false);
  });

  it('a clone drops stale blockstun immediately even while BLOCK stays held',()=>{
    const {w,clones}=withClones(),c=clones[0];
    c.state='block';c.parryT=.12;c.blockStun=1;
    w.step(w.fighters.map(()=>intent({block:true})));
    expect(c.state).not.toBe('block');expect(c.parryT).toBe(0);expect(c.blockStun).toBe(0);
  });

  it('a punch on a clone holding BLOCK lands in full: no block, no parry', () => {
    const { w, clones } = withClones();
    const c = clones[0];
    const e = w.fighters[1];
    // the enemy stands right in front of the clone, facing it
    e.x = e.px = c.x + 12 * c.facing;
    e.facing = (-c.facing) as 1 | -1;
    e.y = e.py = c.y;
    c.invuln = 0; // (a fresh clone has a moment of spawn protection)
    const hp = c.hp;
    const ev: SimEvent[] = [];
    for (let t = 0; t < 20; t++) {
      w.step(w.fighters.map((f, i) => intent(i === 1 ? { attack: t === 5 } : f.master >= 0 ? { block: true } : {})));
      ev.push(...w.events);
      w.events.length = 0;
    }
    expect(ev.some((x) => (x.t === 'block' || x.t === 'parry') && x.victim === c.id)).toBe(false);
    expect(ev.some((x) => x.t === 'hit' && x.victim === c.id) || !c.alive).toBe(true);
    expect(c.hp).toBeLessThan(hp);
  });

  it('clone bots never press BLOCK in a fight, the other bots still do now and then', () => {
    const map = getMap('test');
    const specs = [{ ...spec('N'), hero: 'naruto', isBot: true }, ...[1, 2, 3].map((i) => ({ ...spec('b' + i), isBot: true }))];
    const w = new World(map, specs, { friendlyFire: false, weaponSpawnRate: 1, gravityScale: 1 }, 21);
    const bots = w.fighters.map((f, i) => new BotController(() => w, i, { difficulty: 'expert', seed: 40 + i, clone: f.master >= 0 }));
    let cloneTicks = 0;
    let guards = 0;
    for (let t = 0; t < 60 * 30; t++) {
      const n = w.fighters[0];
      if (t % 120 === 0 && n.alive && clonesOf(w, n).length === 0) summonClones(w, n);
      const ins = bots.map((b) => b.poll());
      w.fighters.forEach((f, i) => {
        if (f.master >= 0 && f.alive) {
          cloneTicks++;
          expect(ins[i].block).toBe(false);
          expect(f.state).not.toBe('block');
        } else if (f.state === 'block') guards++;
      });
      w.step(ins);
    }
    expect(cloneTicks).toBeGreaterThan(60);
    expect(guards).toBeGreaterThan(0);
  });
});

// ------------------------------------------------------------------ symmetric orb clash

describe('Rasengan / Chidori clash with forms', () => {
  /** Naruto at form `nl` and Sasuke at form `sl` dash at each other on the floor; `swap` = Sasuke in slot 0. */
  function clash(nl: number, sl: number, swap: boolean) {
    const heroes = swap ? ['sasuke', 'naruto'] : ['naruto', 'sasuke'];
    const w = new World(FLAT, heroes.map((h) => ({ ...spec(h), hero: h })), { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1, heroPowers: false }, 4);
    run(w, 5);
    const n = w.fighters.find((f) => f.hero === 'naruto' && f.master < 0)!;
    const s = w.fighters.find((f) => f.hero === 'sasuke')!;
    for (const [f, x, face] of [[n, 100, 1], [s, 280, -1]] as const) {
      f.x = f.px = x;
      f.y = f.py = 144;
      f.vx = f.vy = f.invuln = 0;
      f.facing = face;
    }
    for (let i = 0; i < nl; i++) transform(w, n);
    for (let i = 0; i < sl; i++) transform(w, s);
    const formHp = { n: n.formHp, s: s.formHp };
    const ev: SimEvent[] = [];
    for (let t = 0; t < 60 && n.hp === n.maxHp && n.formHp === formHp.n; t++) {
      w.step(w.fighters.map((f) => intent(f.master < 0 ? { ability: true } : {})));
      ev.push(...w.events);
      w.events.length = 0;
    }
    return { w, n, s, ev, formHp };
  }

  it('Naruto in form 2 vs a base Sasuke: the average damage, the stronger (form-scaled) Rasengan push, and stun only for Naruto', () => {
    const out = [false, true].map((swap) => {
      const { n, s, ev, formHp } = clash(2, 0, swap);
      expect(ev.filter((e) => e.t === 'clash')).toHaveLength(1);
      const hits = ev.filter((e): e is Extract<SimEvent, { t: 'hit' }> => e.t === 'hit');
      const hn = hits.find((h) => h.victim === n.id)!;
      const hs = hits.find((h) => h.victim === s.id)!;
      expect(hn.damage).toBeCloseTo(hs.damage, 9);
      expect(hn.damage).toBeGreaterThan((N.damage + S.damage) / 2); // Naruto's form raises his half
      expect(ev.some((e) => e.t === 'arc')).toBe(false);
      // the same loss for both (Naruto's form health absorbs it first: compare health + form health)
      const lostN = n.maxHp - n.hp + (formHp.n - n.formHp);
      const lostS = s.maxHp - s.hp + (formHp.s - s.formHp);
      expect(lostN).toBeCloseTo(lostS, 6);
      expect(n.state).toBe('flinch');
      expect(n.flinchTime).toBe(S.stun);
      expect(s.state).not.toBe('flinch');
      expect(n.vx).toBeCloseTo(-s.vx, 6);
      expect(n.vy).toBeCloseTo(s.vy, 6);
      expect(Math.abs(n.vx)).toBeGreaterThan(N.knockX); // form-scaled knockback
      return { d: hn.damage, vx: [n.vx, s.vx], vy: [n.vy, s.vy], hp: [n.hp, s.hp], t: [n.stateTime, s.stateTime], x: [n.x, s.x] };
    });
    expect(out[0]).toEqual(out[1]);
  });
});
