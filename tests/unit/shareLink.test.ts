import { describe, expect, it } from 'vitest';
import { defaultLobby, lobbyProblem } from '../../src/scenes/lobby';
import { decodeLobby, encodeLobby, lobbyFromHash, shareUrl } from '../../src/scenes/shareLink';

function sample() {
  const c = defaultLobby();
  c.mapId = 'random';
  c.mode = 'deathmatch';
  c.timeLimit = 120;
  c.friendlyFire = true;
  c.chaos = true;
  c.heroPowers = false;
  c.fallDeath = false;
  c.weaponSpawnRate = 2;
  c.slots[0].hero = 'naruto';
  c.slots[0].form = 2;
  c.slots[0].team = 1;
  c.slots[2].kind = 'bot';
  c.slots[2].difficulty = 'expert';
  c.slots[2].team = 2;
  c.slots[2].hero = 'sasuke';
  c.slots[3].hero = '';
  return c;
}

describe('share links', () => {
  it('round-trips the rules and every slot', () => {
    const c = sample();
    const d = decodeLobby(encodeLobby(c))!;
    expect(d).not.toBeNull();
    for (const k of ['mapId', 'mode', 'roundsToWin', 'timeLimit', 'suddenDeath', 'friendlyFire', 'weaponSpawnRate', 'chaos', 'heroPowers', 'fallDeath'] as const) expect(d[k], k).toEqual(c[k]);
    expect(d.slots).toHaveLength(c.slots.length);
    c.slots.forEach((s, i) => {
      expect(d.slots[i].kind, `slot ${i}`).toBe(s.kind);
      if (s.kind === 'empty') return;
      expect(d.slots[i].team).toBe(s.team);
      expect(d.slots[i].hero).toBe(s.hero);
      expect(d.slots[i].form).toBe(s.hero ? s.form : 0);
      if (!s.hero) expect(d.slots[i].look).toEqual({ ...s.look });
    });
    expect(lobbyProblem(d)).toBe(lobbyProblem(c));
  });

  it('is a short URL-safe string', () => {
    const e = encodeLobby(sample());
    expect(e).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(e.length).toBeLessThan(1200);
  });

  it('builds a hash link that reads back, keeping the page query', () => {
    const url = shareUrl(sample(), 'https://game.example/play/?timer=1#old');
    const u = new URL(url);
    expect(u.pathname).toBe('/play/');
    expect(u.search).toBe('?timer=1');
    expect(lobbyFromHash(u.hash)?.mode).toBe('deathmatch');
    expect(lobbyFromHash('')).toBeNull();
    expect(lobbyFromHash('#other=1')).toBeNull();
  });

  it('rejects garbage and clamps hostile values instead of throwing', () => {
    expect(decodeLobby('not base64 !!')).toBeNull();
    expect(decodeLobby('e30')).toBeNull(); // {}
    const evil = btoa(JSON.stringify({ v: 1, r: ['nope', 99, -5, 7, 7, 1, 9, 1, 1, 1], s: [[99, 99, 99, 'hacker', 99, ['x']], 'x', [1, 1, 1, 'goku', 99]] }));
    const d = decodeLobby(evil)!;
    expect(d.mapId).toBe(defaultLobby().mapId);
    expect(d.roundsToWin).toBe(defaultLobby().roundsToWin);
    expect(d.slots).toHaveLength(10);
    expect(d.slots[0].hero).toBe('');
    expect(d.slots[0].team).toBe(0);
    expect(d.slots[1].kind).toBe('empty');
    expect(d.slots[2].form).toBeLessThanOrEqual(4);
    expect(d.slots[3].kind).toBe('empty');
  });
});
