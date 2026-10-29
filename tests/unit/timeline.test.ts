import { describe, expect, it } from 'vitest';
import { Timeline } from '../../src/net/timeline';

interface S {
  tick: number;
  wid: number;
}

/** Drive a timeline: snapshots every 2 ticks arrive at `arrive(i)` ms, frames are drawn every 1000/60 ms. */
function simulate(opts: { seconds: number; arrive: (i: number) => number; wid?: (i: number) => number }) {
  const tl = new Timeline<S>();
  const log: { t: number; time: number; alpha: number; a: number; b: number; latest: number }[] = [];
  const delivered: number[] = [];
  const arrivals = Array.from({ length: Math.ceil(opts.seconds * 30) }, (_, i) => ({ at: opts.arrive(i), snap: { tick: (i + 1) * 2, wid: opts.wid?.(i) ?? 1 } }));
  arrivals.sort((x, y) => x.at - y.at);
  let next = 0;
  for (let t = 0; t < opts.seconds * 1000; t += 1000 / 60) {
    while (next < arrivals.length && arrivals[next].at <= t) {
      for (const s of tl.push(arrivals[next].snap, arrivals[next].at)) delivered.push(s.tick);
      next++;
    }
    tl.advance(1 / 60, 60);
    for (const s of tl.takeDue()) delivered.push(s.tick);
    const f = tl.frame();
    if (f) log.push({ t, time: tl.time!, alpha: f.alpha, a: f.a.tick, b: f.b.tick, latest: tl.latest });
  }
  return { tl, log, delivered };
}

describe('Timeline (interpolation buffer)', () => {
  it('trails the newest snapshot by a short buffer and blends smoothly between two snapshots', () => {
    const { log, tl } = simulate({ seconds: 6, arrive: (i) => 100 + i * (1000 / 30) });
    const steady = log.filter((l) => l.t > 2000);
    // always blending between neighbours with 0..1 alpha, the clock moving forward
    for (let i = 1; i < steady.length; i++) {
      expect(steady[i].time).toBeGreaterThanOrEqual(steady[i - 1].time);
      expect(steady[i].alpha).toBeGreaterThanOrEqual(0);
      expect(steady[i].alpha).toBeLessThanOrEqual(1);
      expect(steady[i].a).toBeLessThanOrEqual(steady[i].b);
    }
    // 60 ticks/s render clock vs 60 ticks/s of snapshots: it advances ~1 tick per frame (no stalls, no jumps)
    const steps = steady.slice(1).map((l, i) => l.time - steady[i].time);
    expect(Math.max(...steps)).toBeLessThan(1.3);
    expect(Math.min(...steps)).toBeGreaterThan(0.7);
    // the gap to the newest snapshot averages 4-6 ticks (67-100 ms) and swings by about 2 as snapshots arrive in steps
    expect(steady.filter((l) => l.a === l.b).length).toBe(0); // never ran dry: always a snapshot ahead to blend towards
    const lag = steady.map((l) => l.latest - l.time);
    expect(Math.min(...lag)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...lag)).toBeLessThanOrEqual(7);
    expect(tl.stale).toBe(0);
  });

  it('delivers every snapshot exactly once, in order', () => {
    const { delivered } = simulate({ seconds: 5, arrive: (i) => 50 + i * (1000 / 30) });
    expect(new Set(delivered).size).toBe(delivered.length);
    expect(delivered).toEqual([...delivered].sort((a, b) => a - b));
    expect(delivered.length).toBeGreaterThan(5 * 30 - 12);
  });

  it('grows its buffer under jitter and never goes backwards or runs past the newest snapshot', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
    const calm = simulate({ seconds: 8, arrive: (i) => i * (1000 / 30) });
    const jittery = simulate({ seconds: 8, arrive: (i) => i * (1000 / 30) + rand() * 50 });
    expect(jittery.tl.delay).toBeGreaterThan(calm.tl.delay);
    expect(jittery.tl.delay).toBeLessThanOrEqual(6);
    for (const l of jittery.log) expect(l.time).toBeLessThanOrEqual(l.latest + 1e-9);
    const times = jittery.log.map((l) => l.time);
    expect(times.every((t, i) => i === 0 || t >= times[i - 1])).toBe(true);
  });

  it('holds the last frame when snapshots stop (no extrapolation), then resumes', () => {
    // snapshots stop after 2 s of 6, then resume
    const { log } = simulate({ seconds: 6, arrive: (i) => (i < 60 ? i * (1000 / 30) : 4000 + (i - 60) * (1000 / 30)) });
    const gap = log.filter((l) => l.t > 2500 && l.t < 3900);
    const last = gap[gap.length - 1];
    expect(last.time).toBeCloseTo(gap[gap.length - 1].latest, 5); // ran up to the newest frame and held
    expect(gap[gap.length - 1].alpha).toBe(1);
    expect(log[log.length - 1].t).toBeGreaterThan(5900);
  });

  it('a new world flushes the old one\'s pending events and restarts the clock', () => {
    const tl = new Timeline<S>();
    for (let i = 1; i <= 5; i++) tl.push({ tick: i * 2, wid: 1 }, i * 33);
    tl.advance(1 / 60, 60);
    const due = tl.takeDue().map((s) => s.tick);
    const flushed = tl.push({ tick: 2, wid: 2 }, 300).map((s) => s.tick);
    expect([...due, ...flushed]).toEqual([2, 4, 6, 8, 10].slice(0, due.length + flushed.length));
    expect(due.length + flushed.length).toBe(5); // nothing lost
    expect(tl.time).toBeNull();
    expect(tl.length).toBe(1);
  });

  it('ignores duplicates and out-of-order snapshots', () => {
    const tl = new Timeline<S>();
    tl.push({ tick: 4, wid: 1 }, 0);
    tl.push({ tick: 4, wid: 1 }, 1);
    tl.push({ tick: 2, wid: 1 }, 2);
    expect(tl.length).toBe(1);
  });

  it('jumps instead of racing to catch up after a long stall', () => {
    const tl = new Timeline<S>();
    for (let i = 1; i <= 4; i++) tl.push({ tick: i * 2, wid: 1 }, i * 33);
    tl.advance(1 / 60, 60);
    // 2 seconds later a burst of snapshots arrives
    for (let i = 5; i <= 130; i++) tl.push({ tick: i * 2, wid: 1 }, 2000 + i);
    tl.advance(1 / 60, 60);
    expect(tl.latest - tl.time!).toBeLessThanOrEqual(6.5);
  });
});
