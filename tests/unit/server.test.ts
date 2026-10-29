import { describe, expect, it } from 'vitest';
import { Hub } from '../../server/hub';
import type { Session } from '../../server/session';
import { PROTOCOL_VERSION, SNAPSHOT_EVERY } from '../../src/net/protocol';
import { run, TestClient } from './netHelpers';

const JUMP = 1 << 8;

/** A hub with a lobby of two humans (host a, guest b) on the test arena, ready to start. */
function lobby(config: Parameters<TestClient['config']>[0] = {}) {
  const hub = new Hub({ seed: 5 });
  const a = new TestClient(hub, 'a');
  a.send({ t: 'create' });
  const code = a.last('room')!.code;
  const b = new TestClient(hub, 'b');
  b.send({ t: 'join', room: code });
  a.claim();
  b.claim();
  a.config({ mapId: 'test', mode: 'deathmatch', timeLimit: 30, bots: [], ...config });
  b.send({ t: 'ready', ready: true });
  const room = hub.rooms.get(code)!;
  return { hub, a, b, code, room, session: () => room.session as Session };
}

describe('server: rooms and lobby', () => {
  it('creates, lists and joins rooms; only the host configures and starts', () => {
    const hub = new Hub();
    const a = new TestClient(hub, 'a');
    a.send({ t: 'create' });
    const room = a.last('room')!;
    expect(room.code).toMatch(/^[A-Z2-9]{4}$/);
    expect(room.host).toBe('a');

    const b = new TestClient(hub, 'b');
    b.send({ t: 'list' });
    expect(b.last('rooms')!.rooms.map((r) => r.code)).toEqual([room.code]);
    b.send({ t: 'join', room: room.code.toLowerCase() });
    expect(b.last('room')!.peers.map((p) => p.device)).toEqual(['a', 'b']);
    expect(a.last('room')!.peers).toHaveLength(2); // the host hears about it too

    b.config({ mapId: 'rooftops' });
    expect(b.last('err')?.code).toBe('notHost');
    b.send({ t: 'start' });
    expect(b.of('err').at(-1)?.code).toBe('notHost');
    a.config({ mapId: 'rooftops', mode: 'koth', bots: [{ hero: 'goku', difficulty: 'hard' }] });
    expect(b.last('room')!.config).toMatchObject({ mapId: 'rooftops', mode: 'koth', bots: [{ hero: 'goku', difficulty: 'hard' }] });

    b.send({ t: 'join', room: 'ZZZZ' });
    expect(b.last('err')?.code).toBe('noRoom');
  });

  it('refuses to start without players or with someone not ready', () => {
    const hub = new Hub();
    const a = new TestClient(hub, 'a');
    a.send({ t: 'create' });
    a.send({ t: 'start' });
    expect(a.last('err')?.code).toBe('noPlayers');
    const b = new TestClient(hub, 'b');
    b.send({ t: 'join', room: a.last('room')!.code });
    a.claim();
    b.claim();
    a.send({ t: 'start' });
    expect(a.last('err')?.code).toBe('notReady');
    b.send({ t: 'ready', ready: true });
    a.send({ t: 'start' });
    expect(a.last('start')).toBeDefined();
  });

  it('sanitizes what clients send: names, configs, junk frames, wrong versions', () => {
    const hub = new Hub();
    const a = new TestClient(hub, 'a', 'x'.repeat(40) + '\u0001é');
    a.send({ t: 'create' });
    expect(a.last('room')!.peers[0].name).toBe('x'.repeat(12));
    a.config({ roundsToWin: 999, mapId: 'nope', timeLimit: -5, bots: Array(30).fill({ hero: 'zzz', difficulty: 'godlike' }) });
    const c = a.last('room')!.config;
    expect(c.roundsToWin).toBe(9);
    expect(c.mapId).toBe('test'); // unknown map ignored
    expect(c.timeLimit).toBe(30);
    expect(c.bots.length).toBeLessThanOrEqual(10);
    expect(c.bots[0]).toEqual({ hero: '', difficulty: 'normal' });

    const before = a.msgs.length;
    a.sendRaw('not json');
    a.sendRaw(JSON.stringify({ t: 'in', slot: 'x' }));
    a.sendRaw(JSON.stringify({ t: 'nope' }));
    a.sendRaw('x'.repeat(20_000));
    expect(a.msgs.slice(before).map((m) => m.t === 'err' && m.code)).toEqual(['badMessage', 'badMessage', 'badMessage', 'badMessage']);

    const late = new TestClient(hub, 'c');
    late.sendRaw(JSON.stringify({ t: 'hello', v: 999, device: 'c', name: 'C' }));
    expect(late.last('err')?.code).toBe('version');
    expect(late.closed).toBe(true);

    const rude = new TestClient(hub, 'd');
    rude.sendRaw(JSON.stringify({ t: 'start' }));
    expect(rude.last('err')?.code).toBe('noRoom');
    expect(PROTOCOL_VERSION).toBe(1);
  });

  it('leaving hands the host role to someone still connected', () => {
    const { a, b, code, hub } = lobby();
    a.send({ t: 'leave' });
    expect(b.last('room')!.host).toBe('b');
    b.send({ t: 'leave' });
    hub.advance(61_000);
    expect(hub.rooms.has(code)).toBe(false); // nobody left: the room is dropped
  });
});

describe('server: a running match', () => {
  it('starts with the humans first, then bots, and tells each device which fighters are theirs', () => {
    const { a, b, session } = lobby({ bots: [{ hero: 'naruto', difficulty: 'easy' }] });
    a.send({ t: 'start' });
    const s = a.last('start')!;
    expect(s.cfg.fighters.map((f) => [f.name, f.isBot, f.hero])).toEqual([['A', false, undefined], ['B', false, undefined], ['BOT 1', true, 'naruto']]);
    expect(a.last('start')!.mine).toEqual([0]);
    expect(b.last('start')!.mine).toEqual([1]);
    expect(s.cfg.seed).toBe(5);
    expect(session().match.world.fighters.length).toBeGreaterThan(3); // Naruto's clone slots come with the bot
  });

  it('clients receive 30 Hz snapshots that match the server frame for frame', () => {
    const { hub, a, b, session } = lobby({ bots: [{ hero: 'goku', difficulty: 'normal' }, { hero: '', difficulty: 'hard' }] });
    a.send({ t: 'start' });
    let compared = 0;
    run(hub, 6000, () => {
      const w = session().match.world;
      for (const c of [a, b]) {
        const snap = c.snaps.at(-1);
        if (!snap || snap.tick !== w.tick) continue;
        const m = c.mirror!.world;
        w.fighters.forEach((f, i) => {
          if (f.master >= 0 && f.gone && !f.alive) return;
          expect(m.fighters[i].x).toBeCloseTo(f.x, 1);
          expect(m.fighters[i].y).toBeCloseTo(f.y, 1);
          expect(m.fighters[i].hp).toBeCloseTo(f.hp, 1);
          expect(m.fighters[i].state).toBe(f.state);
        });
        compared++;
      }
    });
    expect(compared).toBeGreaterThan(100);
    const ticks = a.snaps.map((s) => s.tick);
    expect(ticks.every((t, i) => i === 0 || t - ticks[i - 1] === SNAPSHOT_EVERY)).toBe(true);
    expect(a.snaps.some((s) => s.ev.length > 0)).toBe(true);
    expect(a.snaps[0].m).toBeDefined(); // the first frame carries the match state
    expect(a.snaps.filter((s) => s.m).length).toBeLessThan(a.snaps.length); // and not every one does
    expect(a.snaps.length).toBe(b.snaps.length);
  });

  it('moves a fighter with its owner\'s controls and ignores everyone else\'s', () => {
    const { hub, a, b, session } = lobby();
    a.send({ t: 'start' });
    run(hub, 500);
    const w = () => session().match.world;
    const x0 = [w().fighters[0].x, w().fighters[1].x];

    // b tries to drive a's fighter (slot 0) and its own (slot 1)
    b.hold(0, { moveX: 1 });
    b.hold(1, { moveX: 1 });
    run(hub, 700);
    expect(w().fighters[0].x).toBeCloseTo(x0[0], 0); // not b's to move
    expect(w().fighters[1].x).toBeGreaterThan(x0[1] + 20);

    // a's controls arrive; b lets go
    b.hold(1, {});
    a.hold(0, { moveX: -1 });
    const x1 = w().fighters[0].x;
    run(hub, 500);
    expect(w().fighters[0].x).toBeLessThan(x1 - 15);
  });

  it('a button pressed and released between two ticks still registers (edge bits)', () => {
    const { hub, a, session } = lobby();
    a.send({ t: 'start' });
    run(hub, 700);
    const f = session().match.world.fighters[0];
    expect(f.grounded).toBe(true);
    const y0 = f.y;
    a.hold(0, {}, 0); // control: no edge, no jump
    hub.advance(1000 / 60);
    hub.advance(1000 / 60);
    expect(f.y).toBe(y0);
    // level says "nothing held", the edge says a jump was tapped
    a.hold(0, {}, JUMP);
    hub.advance(1000 / 60);
    hub.advance(1000 / 60);
    expect(f.y).toBeLessThan(y0 - 0.5);
  });

  it('a dropped device is replaced by a bot, and reclaims its fighter by reconnecting', () => {
    const { hub, a, b, session } = lobby();
    a.send({ t: 'start' });
    run(hub, 300);
    const idx = b.mine[0];
    expect(session().fightersOf('b')).toEqual([idx]);

    b.hold(idx, { moveX: 1 }); // held when the connection dies
    b.drop();
    expect(a.last('room')!.peers.find((p) => p.device === 'b')!.connected).toBe(false);
    run(hub, 3000);
    // a bot plays it now: the last controls b sent no longer stick
    const internals = session() as unknown as { connected: boolean[]; controllers: object[]; inputs: object[] };
    expect(internals.connected[idx]).toBe(false);

    const b2 = new TestClient(hub, 'b');
    expect(b2.last('start')?.mine).toEqual([idx]); // same fighter back, straight into the match
    expect(a.last('room')!.peers.find((p) => p.device === 'b')!.connected).toBe(true);
    run(hub, 100);
    expect(b2.snaps.length).toBeGreaterThan(0);

    // its controls work again (the sequence counter started over)
    const x0 = session().match.world.fighters[idx].x;
    b2.hold(idx, { moveX: 1 }, 0, 0);
    run(hub, 700);
    expect(session().match.world.fighters[idx].x).not.toBeCloseTo(x0, 0);
  });

  it('plays a whole deathmatch to the awards screen and returns to the lobby, ready for another', () => {
    const { hub, a, b, room } = lobby({ bots: [{ hero: '', difficulty: 'normal' }, { hero: 'luffy', difficulty: 'hard' }] });
    a.send({ t: 'start' });
    let guard = 0;
    while (room.state === 'playing' && guard++ < 60 * 60) hub.advance(1000 / 60);
    expect(room.state).toBe('lobby');
    for (const c of [a, b]) {
      expect(c.last('end')).toBeDefined();
      expect(c.snaps.some((s) => s.m?.phase === 'matchEnd')).toBe(true);
      expect(c.mirror!.matchWinner).not.toBeNull();
      expect(c.snaps.some((s) => s.me.some((e) => e.t === 'matchEnd'))).toBe(true);
    }
    // a 30 s deathmatch + 9 s awards
    expect(a.snaps.at(-1)!.tick).toBeGreaterThan(30 * 60);
    expect(a.snaps.at(-1)!.tick).toBeLessThan(45 * 60);

    // same room, same fighters: ready up and go again
    expect(a.last('room')!.state).toBe('lobby');
    b.send({ t: 'ready', ready: true });
    a.send({ t: 'start' });
    expect(a.of('start')).toHaveLength(2);
    expect(room.state).toBe('playing');
  });
});
