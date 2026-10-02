import { describe, expect, it } from 'vitest';
import { defaultLobby, lobbyProblem, lobbyToMatch } from '../../src/scenes/lobby';

describe('lobby', () => {
  it('default lobby is startable: 2 keyboards + 3 bots', () => {
    const c = defaultLobby();
    expect(lobbyProblem(c)).toBeNull();
    const m = lobbyToMatch(c, 1);
    expect(m.players.map((p) => p.label)).toEqual(['P1', 'P2', 'B1', 'B2', 'B3']);
    expect(m.players.map((p) => p.input)).toEqual(['kb0', 'kb1', 'bot', 'bot', 'bot']);
    expect(m.config.fighters.length).toBe(5);
  });

  it('rejects bad setups', () => {
    const c = defaultLobby();
    for (const s of c.slots) s.team = 1;
    expect(lobbyProblem(c)).toMatch(/SAME TEAM/);
    const d = defaultLobby();
    d.slots[2].kind = 'kb0';
    expect(lobbyProblem(d)).toMatch(/SAME CONTROLS/);
    const e = defaultLobby();
    e.slots.forEach((s, i) => (s.kind = i === 0 ? 'kb0' : 'empty'));
    expect(lobbyProblem(e)).toMatch(/AT LEAST 2/);
  });

  it('teams carry into the match and color fighters', () => {
    const c = defaultLobby();
    c.slots[0].team = 1;
    c.slots[2].team = 1;
    c.slots[1].team = 2;
    c.mode = 'deathmatch';
    c.timeLimit = 60;
    const m = lobbyToMatch(c, 3);
    expect(m.config.mode).toBe('deathmatch');
    expect(m.config.timeLimit).toBe(60);
    expect(m.players[0].spawn.team).toBe(1);
    expect(m.players[0].color).toBe(m.players[2].color);
  });
});

describe('lobby heroes (M9)', () => {
  it('a hero slot spawns that hero with the hero look; power-ups follow the toggle', () => {
    const c = defaultLobby();
    c.slots[0].hero = 'goku';
    c.slots[2].hero = 'luffy';
    const m = lobbyToMatch(c, 1);
    expect(m.config.fighters[0].hero).toBe('goku');
    expect(m.players[0].look.hair).toBe('saiyan');
    expect(m.config.fighters[2].hero).toBe('luffy');
    expect(m.players[2].look.hat).toBe('strawhat');
    expect(m.config.fighters[1].hero).toBeUndefined();
    expect(m.config.heroPowers).toBe(true);
    c.heroPowers = false;
    expect(lobbyToMatch(c, 1).config.heroPowers).toBe(false);
  });
});
