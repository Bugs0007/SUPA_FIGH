import { describe, expect, it } from 'vitest';
import { Hub } from '../../server/hub';
import type { Session } from '../../server/session';
import { ARENA_CODE } from '../../src/net/protocol';
import { TestClient } from './netHelpers';

const ARENA = { countdown: 15, fill: 6, maxHumans: 3, rounds: 3 };

/** advance the hub's clock `s` seconds in 100 ms slices */
function wait(hub: Hub, s: number): void {
  for (let t = 0; t < s * 10; t++) hub.advance(100);
}

describe('server: the public ARENA', () => {
  it('only exists when the server opens it, and is listed like any room', () => {
    expect(new Hub().rooms.has(ARENA_CODE)).toBe(false);
    const hub = new Hub({ arena: ARENA });
    const a = new TestClient(hub, 'a');
    a.send({ t: 'list' });
    const info = a.last('rooms')!.rooms.find((r) => r.code === ARENA_CODE);
    expect(info).toMatchObject({ arena: true, state: 'lobby', mode: 'brawl' });
    // a room made by a player is an ordinary hosted room, not an arena
    a.send({ t: 'create' });
    const own = hub.rooms.get(a.last('room')!.code)!;
    expect(own.arena).toBeNull();
    expect(a.last('room')!.arena).toBeUndefined();
  });

  it('counts down once somebody is in, then starts a Brawl with bots filling the places', () => {
    const hub = new Hub({ arena: ARENA, seed: 3 });
    const a = new TestClient(hub, 'a');
    a.send({ t: 'join', room: ARENA_CODE });
    expect(a.last('room')!.arena).toEqual({ countdown: -1, fill: 6 }); // nobody has picked a fighter yet
    wait(hub, 20);
    expect(a.of('start')).toHaveLength(0);
    a.claim(0, { hero: 'luffy' });
    wait(hub, 1);
    expect(a.last('room')!.arena!.countdown).toBeGreaterThan(10);
    wait(hub, 12);
    expect(a.of('start')).toHaveLength(0);
    expect(a.last('room')!.arena!.countdown).toBeLessThanOrEqual(3);
    wait(hub, 4);
    const start = a.last('start')!;
    expect(start.cfg.mode).toBe('brawl');
    expect(start.cfg.roundsToWin).toBe(3);
    expect(start.cfg.fighters).toHaveLength(6);
    expect(start.cfg.fighters.filter((f) => !f.isBot)).toHaveLength(1);
    expect(start.mine).toEqual([0]);
    expect(a.last('room')!.state).toBe('playing');
  });

  it('nobody hosts it: settings and START are refused for everyone', () => {
    const hub = new Hub({ arena: ARENA });
    const a = new TestClient(hub, 'a');
    a.send({ t: 'join', room: ARENA_CODE });
    a.claim();
    a.config({ mapId: 'rooftops' });
    expect(a.last('err')?.code).toBe('notHost');
    a.send({ t: 'start' });
    expect(a.of('err').at(-1)?.code).toBe('notHost');
    expect(hub.rooms.get(ARENA_CODE)!.config.mapId).toBe('random');
  });

  it('humans share a match; a latecomer waits for the next one without seeing this one', () => {
    const hub = new Hub({ arena: ARENA, seed: 3 });
    const a = new TestClient(hub, 'a');
    const b = new TestClient(hub, 'b');
    for (const c of [a, b]) {
      c.send({ t: 'join', room: ARENA_CODE });
      c.claim();
    }
    wait(hub, 17);
    expect(a.of('start')).toHaveLength(1);
    expect(b.of('start')).toHaveLength(1);
    expect(a.last('start')!.cfg.fighters.filter((f) => !f.isBot)).toHaveLength(2);
    expect(a.last('start')!.cfg.fighters).toHaveLength(6);

    const c = new TestClient(hub, 'c');
    c.send({ t: 'join', room: ARENA_CODE });
    c.claim();
    expect(c.of('err')).toHaveLength(0); // claims are accepted for the next match
    wait(hub, 2);
    expect(c.of('start')).toHaveLength(0);
    expect(c.last('room')!.state).toBe('playing');
  });

  it('a full arena refuses another player', () => {
    const hub = new Hub({ arena: ARENA });
    const clients = ['a', 'b', 'c', 'd'].map((d) => new TestClient(hub, d));
    for (const c of clients) {
      c.send({ t: 'join', room: ARENA_CODE });
      c.claim();
    }
    expect(clients[3].of('err').at(-1)?.code).toBe('full');
    expect(clients[2].of('err')).toHaveLength(0);
  });

  it('only one player per device, and a match with everybody gone is dropped', () => {
    const hub = new Hub({ arena: ARENA, seed: 3 });
    const a = new TestClient(hub, 'a');
    a.send({ t: 'join', room: ARENA_CODE });
    a.claim(1); // a second local player: not in the arena
    expect(a.last('room')!.peers[0].claims.some(Boolean)).toBe(false);
    a.claim(0);
    wait(hub, 17);
    const room = hub.rooms.get(ARENA_CODE)!;
    expect(room.state).toBe('playing');
    expect((room.session as Session).over).toBe(false);
    a.drop();
    wait(hub, 12);
    expect(room.state).toBe('lobby');
    expect(hub.rooms.has(ARENA_CODE)).toBe(true); // the arena is never cleaned up like an empty player room
  });
});
