// Whole matches under bad network conditions (D76): the real server logic, NetClient and RemoteSim over a simulated
// link (latency, jitter, loss) on a fake clock. Prediction is off here: this is the baseline the server-authoritative
// path gives (tests/unit/prediction.test.ts shows what prediction changes).

import { describe, expect, it } from 'vitest';
import type { Session } from '../../server/session';
import type { RemoteSim } from '../../src/net/remoteSim';
import { applyHit } from '../../src/sim/combat';
import { emptyIntent } from '../../src/sim/intent';
import { playUnder, STEP, type NetSimOptions } from './netHarness';

const CASES: { name: string; net: NetSimOptions; maxErrPx: number; maxResponseMs: number }[] = [
  { name: 'good WiFi (5 ms)', net: { latencyMs: 5, jitterMs: 3, loss: 0 }, maxErrPx: 2, maxResponseMs: 260 },
  { name: 'busy WiFi (60 ms, 40 ms jitter, 5% loss)', net: { latencyMs: 60, jitterMs: 40, loss: 0.05 }, maxErrPx: 3, maxResponseMs: 750 },
  { name: 'awful WiFi (120 ms, 80 ms jitter, 15% loss)', net: { latencyMs: 120, jitterMs: 80, loss: 0.15 }, maxErrPx: 4, maxResponseMs: 1000 },
];

describe('whole matches under bad network conditions', () => {
  it.each(CASES)('$name: plays to the end, follows the server, and responds to controls', async ({ net, maxErrPx, maxResponseMs }) => {
    const { clock, simA, simB, session, pump } = await playUnder(net);
    const history = new Map<number, { x: number }[]>();
    const clocks = new Map<RemoteSim, { wid: number; time: number }>();
    let worstErr = 0;
    let measured = 0;
    let responseMs = -1;
    let pressedAt = -1;
    let x0 = 0;

    for (let n = 0; n < 60 * 90 && !(simA.ended && simB.ended); n++) {
      // A holds "run right" from frame 120 to 400; at frame 200 a kill makes sure the buzzer has a winner (a tie goes to overtime)
      if (n === 120) {
        pressedAt = clock.now;
        x0 = simA.match.world.fighters[simA.mine[0]].x;
      }
      simA.sendInputs([n >= 120 && n < 400 ? { ...emptyIntent(), moveX: 1 } : emptyIntent()]);
      simB.sendInputs([emptyIntent()]);
      if (n === 200) {
        const w = session().match.world;
        applyHit(w, w.fighters[3], { damage: 9999, kbX: 0, kbY: 0, attacker: 0, weapon: 'test', kind: 'melee', ignoreInvuln: true });
        session().match.processWorldEvents(0);
      }
      pump();
      simA.update(STEP / 1000);
      simB.update(STEP / 1000);

      const live = session() as Session | null; // gone once the server has ended the match; clients still play out the last frames
      if (live) history.set(live.match.world.tick, live.match.world.fighters.map((f) => ({ x: f.x })));
      for (const s of [simA, simB]) {
        const t = s.timeline.time;
        if (t === null) continue;
        // the render clock never runs backwards inside one world, and the buffer stays within its design bounds
        const prev = clocks.get(s);
        const wid = (s as unknown as { wid: number }).wid;
        if (prev && prev.wid === wid) expect(t).toBeGreaterThanOrEqual(prev.time - 1e-9);
        clocks.set(s, { wid, time: t });
        expect(s.timeline.delay).toBeLessThanOrEqual(6);
      }

      // what A sees of its own fighter vs where the server had it at that render time
      const t = simA.timeline.time;
      const me = simA.mine[0];
      if (t !== null && n > 90 && n < 400) {
        const f = simA.match.world.fighters[me];
        const shown = f.px + (f.x - f.px) * simA.alpha;
        const h0 = history.get(Math.floor(t));
        const h1 = history.get(Math.floor(t) + 1);
        if (h0 && h1) {
          worstErr = Math.max(worstErr, Math.abs(shown - (h0[me].x + (h1[me].x - h0[me].x) * (t - Math.floor(t)))));
          measured++;
        }
        if (responseMs < 0 && pressedAt > 0 && Math.abs(shown - x0) > 6) responseMs = clock.now - pressedAt;
      }
    }

    expect(simA.ended && simB.ended, 'the match reached its end').toBe(true);
    expect(simA.match.matchWinner).not.toBeNull();
    expect(measured).toBeGreaterThan(150);
    expect(worstErr, 'drawn position vs the server at that moment').toBeLessThan(maxErrPx);
    expect(responseMs, 'time from pressing right to seeing the fighter move').toBeGreaterThan(0);
    expect(responseMs).toBeLessThan(maxResponseMs);
  }, 90_000);

  it('survives a 3-second blackout: the render clock holds, frames resume in a burst, controls work again', async () => {
    const { gate, simA, session, pump } = await playUnder({ latencyMs: 30, jitterMs: 10, loss: 0 });
    for (let n = 0; n < 180; n++) {
      pump();
      simA.update(STEP / 1000);
    }
    const tickBefore = simA.match.world.tick;
    const timeBefore = simA.timeline.time!;
    gate.held = true; // nothing reaches the client for 3 s
    for (let n = 0; n < 60 * 3; n++) {
      pump();
      simA.update(STEP / 1000);
    }
    // the clock ran up to the newest frame it had and then held: no extrapolation, no running backwards
    expect(simA.timeline.time!).toBeGreaterThanOrEqual(timeBefore);
    expect(simA.timeline.time!).toBeLessThanOrEqual(timeBefore + 8);
    expect(session().match.world.tick).toBeGreaterThan(tickBefore + 60 * 3 - 5); // the server did not wait

    gate.held = false;
    for (const f of gate.queue.splice(0)) f(); // the stalled link delivers everything at once
    const x0 = session().match.world.fighters[simA.mine[0]].x;
    for (let n = 0; n < 60 * 4; n++) {
      simA.sendInputs([{ ...emptyIntent(), moveX: 1 }]);
      pump();
      simA.update(STEP / 1000);
    }
    expect(simA.match.world.tick).toBeGreaterThan(tickBefore + 60 * 3); // caught up
    expect(session().match.world.tick - simA.match.world.tick).toBeLessThan(30); // and back to within half a second of live
    expect(Math.abs(session().match.world.fighters[simA.mine[0]].x - x0)).toBeGreaterThan(15); // controls work again
  }, 60_000);
});
