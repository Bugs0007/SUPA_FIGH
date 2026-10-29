import { describe, expect, it } from 'vitest';
import { IntentSlot, intentFor, TickSampler } from '../../src/net/intentWire';
import { emptyIntent, packIntent, type Intent } from '../../src/sim/intent';

const pack = (p: Partial<Intent>) => packIntent({ ...emptyIntent(), ...p });
const JUMP = 1 << 8;

describe('IntentSlot (server side)', () => {
  it('holds stamped controls until their tick and then keeps the level', () => {
    const s = new IntentSlot();
    expect(s.applyAt(0, 10, pack({ moveX: 1 }), 0)).toBe(true);
    const out = emptyIntent();
    expect(s.take(out, 9).moveX).toBe(0);
    expect(s.take(out, 10).moveX).toBe(1);
    expect(s.take(out, 11).moveX).toBe(1); // level stays until the next message
    s.applyAt(1, 12, pack({}), 0);
    expect(s.take(out, 12).moveX).toBe(0);
    expect(s.late).toBe(0);
  });

  it('an edge is pressed for exactly the tick it was stamped with, even if the level says released', () => {
    const s = new IntentSlot();
    s.applyAt(0, 5, pack({}), JUMP);
    const out = emptyIntent();
    expect(s.take(out, 4).jump).toBe(false);
    expect(s.take(out, 5).jump).toBe(true);
    expect(s.take(out, 6).jump).toBe(false);
  });

  it('applies late messages at once and counts them; ignores stale sequence numbers; caps a runaway queue', () => {
    const s = new IntentSlot();
    const out = emptyIntent();
    expect(s.applyAt(3, 2, pack({ moveX: -1 }), 0)).toBe(true);
    expect(s.take(out, 8).moveX).toBe(-1);
    expect(s.late).toBe(1);
    expect(s.applyAt(3, 9, pack({}), 0)).toBe(false); // repeated seq
    expect(s.applyAt(2, 9, pack({}), 0)).toBe(false); // older seq
    for (let i = 0; i < 500; i++) s.applyAt(10 + i, 1000 + i, 0, 0);
    expect(s.applyAt(999, 5000, 0, 0)).toBe(false); // queue full
  });

  it('sorts messages that arrive out of tick order and marks the slot as stamped', () => {
    const s = new IntentSlot();
    expect(s.stamped).toBe(false);
    s.applyAt(0, 20, pack({ moveX: 1 }), 0);
    s.applyAt(1, 15, pack({ moveX: -1 }), 0);
    const out = emptyIntent();
    expect(s.take(out, 16).moveX).toBe(-1);
    expect(s.take(out, 20).moveX).toBe(1);
    expect(s.stamped).toBe(true);
  });

  it('plain (unstamped) controls still work next to it', () => {
    const s = new IntentSlot();
    s.apply(0, pack({ moveX: 1 }), JUMP);
    const out = emptyIntent();
    const first = { ...s.take(out, 1) };
    expect(first.moveX).toBe(1);
    expect(first.jump).toBe(true);
    expect(s.take(out, 2).jump).toBe(false);
  });
});

describe('TickSampler (client side)', () => {
  it('sends when the level changes, when a button went down, and as a heartbeat; not otherwise', () => {
    const t = new TickSampler();
    const held = emptyIntent();
    t.poll(held);
    expect(t.tick(0).msg).not.toBeNull(); // the first one
    expect(t.tick(16).msg).toBeNull(); // nothing changed
    t.poll({ ...held, moveX: 1 });
    expect(t.tick(33).msg?.v).toBe(pack({ moveX: 1 }));
    expect(t.tick(50).msg).toBeNull();
    // a tap between two ticks: pressed and released before the tick runs
    t.poll({ ...held, moveX: 1, jump: true });
    t.poll({ ...held, moveX: 1 });
    const r = t.tick(66);
    expect(r.msg?.e).toBe(JUMP);
    expect(intentFor(r.v, r.e).jump).toBe(true); // what the local sim runs ...
    expect(r.msg && intentFor(r.msg.v, r.msg.e).jump).toBe(true); // ... is what the server will run
    expect(t.tick(83).msg).toBeNull();
    expect(t.tick(66 + 260).msg).not.toBeNull(); // heartbeat
  });

  it('sequence numbers only go up', () => {
    const t = new TickSampler();
    const seqs: number[] = [];
    for (let i = 0; i < 6; i++) {
      t.poll({ ...emptyIntent(), moveX: i % 2 ? 1 : -1 });
      const m = t.tick(i * 16).msg;
      if (m) seqs.push(m.seq);
    }
    expect(seqs).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('the local intent and the wire intent are the same, axes included (quantized like the server sees them)', () => {
    const t = new TickSampler();
    t.poll({ ...emptyIntent(), moveX: 0.37, moveY: -0.8 });
    const r = t.tick(0);
    const local = intentFor(r.v, r.e);
    const wire = intentFor(r.msg!.v, r.msg!.e);
    expect(local).toEqual(wire);
    expect(Math.abs(local.moveX - 0.37)).toBeLessThan(0.08); // 15 levels per axis
  });
});
