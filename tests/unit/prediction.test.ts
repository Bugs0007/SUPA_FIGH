// Client-side prediction (D77) end to end: the real server logic, NetClient, RemoteSim and Predictor over a simulated
// link on a fake clock. What matters: the local fighter reacts within a frame or two whatever the latency, the
// prediction agrees with what the server then does, and disagreements are blended instead of popping.

import { describe, expect, it } from 'vitest';
import type { Session } from '../../server/session';
import { applyHit } from '../../src/sim/combat';
import { emptyIntent, type Intent } from '../../src/sim/intent';
import { playUnder, STEP, type NetSimOptions } from './netHarness';

const idle = emptyIntent();
const press = (p: Partial<Intent>): Intent => ({ ...emptyIntent(), ...p });

/** A scripted run of controls for one player: walk right, hop, walk left, crouch, jump again... */
function script(n: number): Intent {
  if (n < 120) return idle;
  if (n < 260) return press({ moveX: 1 });
  if (n < 330) return n % 30 < 2 ? press({ moveX: 1, jump: true }) : press({ moveX: 1 });
  if (n < 420) return press({ moveX: -1 });
  if (n < 470) return press({ moveY: 1 });
  if (n < 560) return n % 45 < 2 ? press({ jump: true }) : press({ moveX: 1 });
  return idle;
}

async function measure(net: NetSimOptions, predict: boolean) {
  const { clock, simA, simB, session, pump } = await playUnder(net, { predict, config: { bots: [], timeLimit: 120 } });
  const me = simA.mine[0];
  const truth = new Map<number, { x: number; y: number }>();
  const drawn: number[] = [];
  const predicted = new Map<number, { x: number; y: number }>();
  let pressedAt = -1;
  let x0 = 0;
  let responseMs = -1;
  let firstMoveMs = -1;
  for (let n = 0; n < 700; n++) {
    if (n === 120) {
      pressedAt = clock.now;
      x0 = simA.match.world.fighters[me].x;
    }
    simA.sendInputs([script(n)]);
    simB.sendInputs([idle]);
    pump();
    simA.update(STEP / 1000);
    simB.update(STEP / 1000);
    const live = session() as Session | null;
    if (live) truth.set(live.match.world.tick, { x: live.match.world.fighters[me].x, y: live.match.world.fighters[me].y });
    const f = simA.match.world.fighters[me];
    drawn.push(f.x);
    if (responseMs < 0 && pressedAt > 0 && Math.abs(f.x - x0) > 6) responseMs = clock.now - pressedAt;
    if (firstMoveMs < 0 && pressedAt > 0 && Math.abs(f.x - x0) > 0.3) firstMoveMs = clock.now - pressedAt;
    const p = simA.predictor;
    if (p?.ready && p.world) predicted.set(p.tick, { x: p.world.fighters[me].x, y: p.world.fighters[me].y });
  }
  // how well did the raw prediction for tick t match what the server then did at tick t?
  let sum = 0;
  let worst = 0;
  let n = 0;
  for (const [t, p] of predicted) {
    const s = truth.get(t);
    if (!s || t < 200) continue;
    const e = Math.hypot(p.x - s.x, p.y - s.y);
    sum += e;
    worst = Math.max(worst, e);
    n++;
  }
  const jumps = drawn.slice(1).map((x, i) => Math.abs(x - drawn[i]));
  return { responseMs, firstMoveMs, meanErr: n ? sum / n : -1, worstErr: worst, compared: n, maxFrameJump: Math.max(...jumps), simA };
}

describe('client-side prediction', () => {
  const CASES: { name: string; net: NetSimOptions; meanErr: number; worstErr: number; maxJump: number }[] = [
    { name: 'good WiFi (5 ms)', net: { latencyMs: 5, jitterMs: 3, loss: 0 }, meanErr: 0.01, worstErr: 0.5, maxJump: 4 },
    { name: 'busy WiFi (60 ms, 40 ms jitter, 5% loss)', net: { latencyMs: 60, jitterMs: 40, loss: 0.05 }, meanErr: 1.5, worstErr: 40, maxJump: 8 },
    { name: 'awful WiFi (120 ms, 80 ms jitter, 15% loss)', net: { latencyMs: 120, jitterMs: 80, loss: 0.15 }, meanErr: 10, worstErr: 100, maxJump: 14 },
  ];

  it.each(CASES)('$name: the fighter reacts within two frames, agrees with the server, and corrections are blended', async ({ net, meanErr, worstErr, maxJump }) => {
    const off = await measure(net, false);
    const on = await measure(net, true);
    // reaction: the first pixel moves on the 2nd frame whatever the network does; without prediction it waits for the server
    expect(on.firstMoveMs).toBeLessThanOrEqual(50);
    expect(on.responseMs).toBeLessThanOrEqual(120);
    expect(off.firstMoveMs).toBeGreaterThan(on.firstMoveMs * 2);
    // accuracy: the prediction for tick t vs what the server then did at tick t
    expect(on.compared).toBeGreaterThan(300);
    expect(on.meanErr).toBeLessThan(meanErr);
    expect(on.worstErr).toBeLessThan(worstErr);
    // smoothness: a correction never shows up as a jump on screen
    expect(on.maxFrameJump).toBeLessThan(maxJump);
    if (net.latencyMs <= 5) expect(on.simA.predictor!.corrections).toBe(0);
  }, 60_000);

  it('with prediction off nothing is predicted or stamped', async () => {
    const { simA, pump } = await playUnder({ latencyMs: 5, jitterMs: 0, loss: 0 }, { predict: false });
    for (let n = 0; n < 60; n++) {
      simA.sendInputs([press({ moveX: 1 })]);
      pump();
      simA.update(STEP / 1000);
    }
    expect(simA.predictor).toBeNull();
  });

  it('a knock-back the server decides arrives as a smooth correction, not a teleport', async () => {
    const { simA, simB, session, pump } = await playUnder({ latencyMs: 40, jitterMs: 10, loss: 0 }, { predict: true, config: { bots: [], timeLimit: 120 } });
    const me = simA.mine[0];
    const xs: number[] = [];
    let hitAt = -1;
    for (let n = 0; n < 420; n++) {
      simA.sendInputs([idle]);
      simB.sendInputs([idle]);
      if (n === 200) {
        // the server knocks our fighter sideways; nobody told the prediction
        const w = session().match.world;
        hitAt = n;
        applyHit(w, w.fighters[me], { damage: 5, kbX: 260, kbY: -120, attacker: 1, weapon: 'test', kind: 'melee', ignoreInvuln: true });
      }
      pump();
      simA.update(STEP / 1000);
      simB.update(STEP / 1000);
      xs.push(simA.match.world.fighters[me].x);
    }
    expect(hitAt).toBe(200);
    const before = xs[199];
    expect(Math.abs(xs[201] - before)).toBeLessThan(1); // not told yet: it stands there (the hit is the server's news)
    expect(Math.max(...xs.slice(205, 300)) - before).toBeGreaterThan(15); // then the knock-back shows
    const jumps = xs.slice(1).map((x, i) => Math.abs(x - xs[i]));
    expect(Math.max(...jumps)).toBeLessThan(30); // ... as motion, never a teleport
    expect(simA.predictor!.corrections).toBeGreaterThan(0);
  }, 60_000);

  it('a dead fighter is drawn from the server, and prediction returns for the next round', async () => {
    const { simA, simB, session, pump } = await playUnder({ latencyMs: 20, jitterMs: 5, loss: 0 }, { predict: true, config: { mode: 'brawl', roundsToWin: 3, bots: [] } });
    const me = simA.mine[0];
    const p = simA.predictor!;
    const frame = (intent: Intent) => {
      simA.sendInputs([intent]);
      simB.sendInputs([idle]);
      pump();
      simA.update(STEP / 1000);
      simB.update(STEP / 1000);
    };
    for (let n = 0; n < 150; n++) frame(idle);
    expect(p.ready).toBe(true);
    const wid0 = p.wid;
    const w = session().match.world;
    applyHit(w, w.fighters[me], { damage: 9999, kbX: 0, kbY: 0, attacker: 1, weapon: 'test', kind: 'melee', ignoreInvuln: true });
    for (let n = 0; n < 40; n++) frame(idle);
    expect(simA.match.world.fighters[me].alive).toBe(false);
    expect(p.visual(0)).toBeNull(); // nothing to predict while dead

    // the round ends, a new world begins: the sandbox is rebuilt and the fighter is controllable at once
    let guard = 0;
    while (p.wid === wid0 && guard++ < 60 * 8) frame(idle);
    expect(p.wid).not.toBe(wid0);
    for (let n = 0; n < 150; n++) frame(idle);
    expect(simA.match.world.fighters[me].alive).toBe(true);
    expect(p.ready).toBe(true);
    const x0 = simA.match.world.fighters[me].x;
    for (let n = 0; n < 30; n++) frame(press({ moveX: 1 }));
    expect(simA.match.world.fighters[me].x - x0).toBeGreaterThan(10);
    expect(session().match.world.fighters[me].x - x0).toBeGreaterThan(5); // and the server agrees
  }, 60_000);

  it.each(['naruto', 'luffy', 'goku'])('%s: abilities, flight and combos run in the sandbox without trouble and stay near the server', async (hero) => {
    const { simA, simB, session, pump } = await playUnder({ latencyMs: 30, jitterMs: 10, loss: 0 }, { predict: true, heroes: [hero, ''], config: { bots: [{ hero: '', difficulty: 'easy' }], timeLimit: 120 } });
    const me = simA.mine[0];
    const p = simA.predictor!;
    const truth = new Map<number, { x: number; y: number }>();
    const predicted = new Map<number, { x: number; y: number }>();
    let seed = 5;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
    let cur = idle;
    for (let n = 0; n < 900; n++) {
      if (n % 20 === 0) cur = press({ moveX: [-1, 0, 1][Math.floor(rnd() * 3)], moveY: rnd() < 0.3 ? -1 : 0, jump: rnd() < 0.3, attack: rnd() < 0.3, kick: rnd() < 0.15, ability: rnd() < 0.4, interact: rnd() < 0.1 });
      simA.sendInputs([cur]);
      simB.sendInputs([idle]);
      pump();
      simA.update(STEP / 1000);
      simB.update(STEP / 1000);
      const live = session() as Session | null;
      if (live) truth.set(live.match.world.tick, { x: live.match.world.fighters[me].x, y: live.match.world.fighters[me].y });
      if (p.ready && p.world) predicted.set(p.tick, { x: p.world.fighters[me].x, y: p.world.fighters[me].y });
      const f = simA.match.world.fighters[me];
      expect(Number.isFinite(f.x) && Number.isFinite(f.y)).toBe(true);
    }
    let sum = 0;
    let count = 0;
    for (const [t, q] of predicted) {
      const s = truth.get(t);
      if (s && t > 150) {
        sum += Math.hypot(q.x - s.x, q.y - s.y);
        count++;
      }
    }
    expect(count).toBeGreaterThan(400);
    // abilities react to other fighters the sandbox only sees a moment late, so some difference is expected: it must stay small
    expect(sum / count).toBeLessThan(25);
  }, 60_000);
});
