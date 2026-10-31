import { afterEach, describe, expect, it } from 'vitest';
import { BotController } from '../../src/ai/bot';
import { DEFAULT_ROOM_CONFIG, sanitizeConfig } from '../../src/net/protocol';
import { DT, FIGHTER_H, THROW_IN, TILE } from '../../src/sim/constants';
import type { SimEvent } from '../../src/sim/events';
import { dropColumn, fallKills, throwInSpot } from '../../src/sim/fall';
import type { FighterSpawn } from '../../src/sim/fighter';
import { Match, type GameMode, type MatchConfig } from '../../src/sim/match';
import { getMap, MAP_LIST } from '../../src/sim/map/maps';
import type { MapDef } from '../../src/sim/map/mapData';
import { World, type WorldSettings } from '../../src/sim/world';
import { defaultLobby, loadLobby, lobbyToMatch } from '../../src/scenes/lobby';
import { spec } from './helpers';

/** open sky, a floor with a pit in the middle (columns 13..16) */
const PIT: MapDef = {
  id: 'pit',
  name: 'pit',
  theme: 'arena',
  rows: [
    '..............................',
    '..............................',
    '..............................',
    '..............................',
    '..............................',
    '..............................',
    '..............................',
    '..S......................S....',
    '#############....#############',
    '#############....#############',
  ],
};

const OFF: WorldSettings = { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1, fallDeath: false };
const ON: WorldSettings = { friendlyFire: false, weaponSpawnRate: 0, gravityScale: 1 };

function pitWorld(settings: WorldSettings, n = 2): World {
  return new World(PIT, Array.from({ length: n }, (_, i) => spec('F' + i)), settings, 3);
}

/** drop fighter 0 into the pit and run until it is gone or back on its feet */
function dropInPit(w: World): SimEvent[] {
  const f = w.fighters[0];
  w.step([]);
  f.x = 15 * TILE;
  f.y = 6 * TILE;
  f.grounded = false;
  const events: SimEvent[] = [];
  for (let t = 0; t < 4 / DT; t++) {
    w.step([]);
    events.push(...w.events);
    w.events.length = 0;
  }
  return events;
}

describe('fall death ON (default)', () => {
  it('falling into the pit kills as before', () => {
    const w = pitWorld(ON);
    const ev = dropInPit(w);
    const f = w.fighters[0];
    expect(f.alive).toBe(false);
    expect(f.gone).toBe(true);
    expect(ev.some((e) => e.t === 'kill' && e.victim === 0 && e.cause === 'fall')).toBe(true);
    expect(ev.some((e) => e.t === 'thrownIn')).toBe(false);
  });

  it('a missing setting means ON (old configs, replays and tests)', () => {
    const m = new Match({ mapId: 'test', mode: 'brawl', fighters: [spec('A'), spec('B')], roundsToWin: 3, friendlyFire: false, weaponSpawnRate: 0, seed: 1 });
    expect(m.world.settings.fallDeath).toBe(true);
  });
});

describe('fall death OFF: thrown back in', () => {
  it('reappears above the arena over a floor, falls back in, takes the penalty, is invulnerable', () => {
    const w = pitWorld(OFF);
    const f = w.fighters[0];
    w.step([]);
    f.x = 15 * TILE;
    f.y = w.killY + 1;
    f.invuln = 0;
    w.step([]);
    const ev = w.events.find((e) => e.t === 'thrownIn');
    expect(ev).toBeDefined();
    if (ev?.t !== 'thrownIn') return;
    expect(f.alive).toBe(true);
    expect(f.gone).toBe(false);
    // above the top of the map, over the nearest column with a floor (the pit is columns 13..16)
    expect(f.y).toBeLessThan(0);
    expect(f.y).toBeGreaterThan(-THROW_IN.above - 10);
    const col = Math.floor(f.x / TILE);
    expect(col < 13 || col > 16).toBe(true);
    expect(Math.abs(col - 15)).toBeLessThanOrEqual(3);
    expect(f.vy).toBeGreaterThan(0);
    expect(f.state).toBe('flinch');
    expect(f.hp).toBe(100 - THROW_IN.damage);
    expect(f.invuln).toBeGreaterThan(THROW_IN.invuln - 0.05);
    expect(ev).toMatchObject({ f: 0, x: f.x, y: f.y, damage: THROW_IN.damage, attacker: -1 });
    expect(ev.fromY).toBe(w.map.pxH); // exit point clamped onto the map's bottom edge
    expect(ev.fromX).toBeCloseTo(15 * TILE, 0);
    // it lands on the floor and gets up
    for (let t = 0; t < 2 / DT; t++) w.step([]);
    expect(f.alive).toBe(true);
    expect(f.grounded).toBe(true);
    expect(f.y).toBe(8 * TILE);
    expect(f.state).toBe('normal');
  });

  it('the pit drop end to end: alive, thrown in once, no kill', () => {
    const w = pitWorld(OFF);
    const ev = dropInPit(w);
    const f = w.fighters[0];
    expect(f.alive).toBe(true);
    expect(f.grounded).toBe(true);
    expect(ev.filter((e) => e.t === 'thrownIn')).toHaveLength(1);
    expect(ev.some((e) => e.t === 'kill')).toBe(false);
  });

  it('the penalty never kills (at least 1 HP left)', () => {
    for (const hp of [3, 1, 0.4]) {
      const w = pitWorld(OFF);
      const f = w.fighters[0];
      w.step([]);
      f.hp = hp;
      f.y = w.killY + 1;
      w.step([]);
      expect(f.alive).toBe(true);
      expect(f.hp).toBe(Math.min(hp, 1));
    }
  });

  it('keeps its weapons', () => {
    const w = pitWorld(OFF);
    const f = w.fighters[0];
    w.step([]);
    f.inv[1] = { id: 'pistol', ammo: 9, dur: 1 };
    f.y = w.killY + 1;
    w.step([]);
    expect(f.inv[1]).toEqual({ id: 'pistol', ammo: 9, dur: 1 });
  });

  it('the fall is credited to the last attacker as damage, never as a kill', () => {
    const cfg: MatchConfig = { mapId: 'test', mode: 'brawl', fighters: [spec('A'), spec('B'), spec('C')], roundsToWin: 3, friendlyFire: false, weaponSpawnRate: 0, seed: 2, fallDeath: false };
    const m = new Match(cfg);
    const w = m.world;
    m.step([]);
    const [a, b] = w.fighters;
    a.lastAttacker = b.id;
    a.lastHitTime = w.time;
    const before = m.stats[b.id].damage;
    a.y = w.killY + 5;
    m.step([]);
    expect(a.alive).toBe(true);
    expect(m.stats[b.id].damage - before).toBe(THROW_IN.damage);
    expect(m.stats[b.id].kills).toBe(0);
    expect(m.stats[a.id].deaths).toBe(0);
    // too long ago: nobody gets credit
    a.lastHitTime = -100;
    a.invuln = 0;
    const before2 = m.stats[b.id].damage;
    a.y = w.killY + 5;
    m.step([]);
    expect(m.stats[b.id].damage).toBe(before2);
  });

  it('falling off a side comes back in from the top, inside the map', () => {
    const w = pitWorld(OFF);
    const f = w.fighters[0];
    w.step([]);
    f.x = -200;
    w.step([]);
    expect(f.alive).toBe(true);
    expect(f.x).toBeGreaterThan(0);
    expect(f.x).toBeLessThan(4 * TILE);
    expect(f.y).toBeLessThan(0);
  });

  it('under a roof it drops in from just below the roof', () => {
    const w = new World(getMap('test'), [spec('A'), spec('B')], OFF, 1);
    const f = w.fighters[0];
    w.step([]);
    f.y = w.killY + 1;
    w.step([]);
    expect(f.alive).toBe(true);
    expect(f.y).toBeGreaterThan(0);
    expect(w.map.rectSolid(f.x - f.w / 2, f.y - FIGHTER_H, f.x + f.w / 2, f.y)).toBe(false);
  });

  it('shadow clones still poof; co-op enemy bots still die; everyone else is thrown in', () => {
    const w = pitWorld(OFF);
    const f = w.fighters[0];
    expect(fallKills(w, f)).toBe(false);
    expect(fallKills(w, { ...f, master: 1 })).toBe(true);
    expect(fallKills(w, { ...f, isBot: true })).toBe(false);
    const coop = pitWorld({ ...OFF, fallDeathBots: true });
    expect(fallKills(coop, { ...f, isBot: true })).toBe(true);
    expect(fallKills(coop, f)).toBe(false);
    const m = new Match({ mapId: 'test', mode: 'coop', fighters: [spec('A'), { ...spec('B'), isBot: true }], roundsToWin: 1, friendlyFire: false, weaponSpawnRate: 0, seed: 1, fallDeath: false });
    expect(m.world.settings).toMatchObject({ fallDeath: false, fallDeathBots: true });
  });

  it('every map: a fighter dropped out anywhere lands safely back in, once', () => {
    for (const def of MAP_LIST) {
      for (const frac of [0.02, 0.25, 0.5, 0.75, 0.98]) {
        const w = new World(def, [spec('A'), spec('B')], OFF, 5);
        const f = w.fighters[0];
        w.step([]);
        f.x = w.map.pxW * frac;
        f.y = w.killY + 1;
        f.vy = 300;
        let ins = 0;
        for (let t = 0; t < 3 / DT && !(ins > 0 && f.grounded); t++) {
          w.step([]);
          ins += w.events.filter((e) => e.t === 'thrownIn').length;
          w.events.length = 0;
        }
        const where = `${def.id} @${frac}`;
        expect(ins, where).toBe(1);
        expect(f.alive, where).toBe(true);
        expect(f.grounded, where).toBe(true);
        expect(f.y, where).toBeLessThan(w.map.pxH);
      }
    }
  });

  it('every map has at least one safe drop column, and the spot is free of solids', () => {
    for (const def of MAP_LIST) {
      const w = new World(def, [spec('A'), spec('B')], OFF, 5);
      let cols = 0;
      for (let tx = 0; tx < w.map.w; tx++) if (dropColumn(w, tx)) cols++;
      expect(cols, def.id).toBeGreaterThan(0);
      const s = throwInSpot(w, w.map.pxW / 2);
      expect(w.map.rectSolid(s.x - 5, s.y - FIGHTER_H, s.x + 5, s.y), def.id).toBe(false);
    }
  });
});

describe('the setting travels: lobby -> match config -> world, rooms, replays', () => {
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('defaults to ON and flows from the lobby into the world', () => {
    const c = defaultLobby();
    expect(c.fallDeath).toBe(true);
    expect(lobbyToMatch(c, 1).config.fallDeath).toBe(true);
    c.fallDeath = false;
    const data = lobbyToMatch(c, 1);
    expect(data.config.fallDeath).toBe(false);
    const m = new Match(data.config);
    expect(m.world.settings.fallDeath).toBe(false);
    expect(m.recording?.settings.fallDeath).toBe(false);
  });

  it('an old lobby save (no fallDeath) loads with fall death ON', () => {
    const store: Record<string, string> = {};
    const old = { ...defaultLobby() } as Partial<ReturnType<typeof defaultLobby>>;
    delete old.fallDeath;
    store['scrapyard.lobby'] = JSON.stringify(old);
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = v) };
    expect(loadLobby().fallDeath).toBe(true);
    store['scrapyard.lobby'] = JSON.stringify({ ...old, fallDeath: false });
    expect(loadLobby().fallDeath).toBe(false);
  });

  it('LAN rooms carry it', () => {
    expect(DEFAULT_ROOM_CONFIG.fallDeath).toBe(true);
    expect(sanitizeConfig({ fallDeath: false })?.fallDeath).toBe(false);
    expect(sanitizeConfig({ fallDeath: true })?.fallDeath).toBe(true);
    expect(sanitizeConfig({ mapId: 'test' })).not.toHaveProperty('fallDeath');
  });
});

describe('every mode plays with fall death off', () => {
  const MODES: GameMode[] = ['brawl', 'deathmatch', 'koth', 'juggernaut', 'gungame', 'coop'];
  for (const mode of MODES) {
    it(mode, () => {
      const fighters: FighterSpawn[] = Array.from({ length: 6 }, (_, i) => ({ ...spec('B' + i), isBot: true }));
      if (mode === 'coop') fighters[0] = spec('HUMAN');
      const m = new Match({ mapId: 'rooftops', mode, fighters, roundsToWin: 9, friendlyFire: false, weaponSpawnRate: 1, seed: 7, timeLimit: 300, fallDeath: false });
      const bots = m.world.fighters.map((f, i) => new BotController(() => m.world, i, { seed: 7, clone: f.master >= 0 }));
      let thrown = 0;
      let fallKillsSeen = 0;
      for (let t = 0; t < 20 / DT; t++) {
        const w = m.world;
        // push someone out of the map every 2 s
        if (t % 120 === 60) {
          const v = w.fighters.find((f, i) => f.alive && f.master < 0 && (i + t) % 2 === 0) ?? w.fighters.find((f) => f.alive && f.master < 0);
          if (v) v.y = w.killY + 2;
        }
        m.step(bots.map((b) => b.poll()));
        for (const e of m.world.events) {
          if (e.t === 'thrownIn') thrown++;
          if (e.t === 'kill' && e.cause === 'fall' && m.world.fighters[e.victim].master < 0) fallKillsSeen++;
        }
        m.world.events.length = 0;
        m.events.length = 0;
        for (const f of m.world.fighters) {
          if (!f.alive) continue;
          expect(Number.isFinite(f.x) && Number.isFinite(f.y), `${mode} f${f.id}`).toBe(true);
          expect(f.y, `${mode} f${f.id}`).toBeLessThanOrEqual(m.world.killY + 400);
        }
      }
      expect(thrown).toBeGreaterThan(0);
      // only co-op's enemy bots may still fall to their death
      if (mode !== 'coop') expect(fallKillsSeen).toBe(0);
    }, 120000);
  }
});
