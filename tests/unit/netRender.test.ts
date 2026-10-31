import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BotController } from '../../src/ai/bot';
import {
  applyMatch,
  applyWorld,
  encodeMatch,
  encodeWorld,
  FIGHTER_SPEC,
  FIGHTER_STATIC,
  ITEM_SPEC,
  positionsOf,
  PROP_SPEC,
} from '../../src/net/renderState';
import { Match, type MatchConfig } from '../../src/sim/match';

function config(mapId: string, extra: Partial<MatchConfig> = {}): MatchConfig {
  const heroes = ['naruto', 'luffy', 'goku', 'sasuke', undefined, 'naruto', undefined, 'goku'];
  return {
    mapId,
    mode: 'brawl',
    fighters: heroes.map((hero, i) => ({ name: 'B' + i, team: i % 4, isBot: true, upJumps: false, hero })),
    roundsToWin: 99,
    friendlyFire: false,
    weaponSpawnRate: 1,
    seed: 21,
    heroPowers: true,
    ...extra,
  };
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sourceFiles(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []));
}

describe('render state (D71)', () => {
  it('lists every Fighter field the render / HUD / audio code reads', () => {
    const src = readFileSync('src/sim/fighter.ts', 'utf8');
    const body = /export interface Fighter extends Body \{([\s\S]*?)\n\}/.exec(src)![1];
    const fields = [...body.matchAll(/^\s+(\w+)\??:/gm)].map((m) => m[1]).concat(['x', 'y', 'vx', 'vy', 'w', 'h', 'grounded']);
    const listed = new Set<string>([...FIGHTER_SPEC.map(([k]) => k), ...FIGHTER_STATIC]);
    const text = ['render', 'scenes', 'art', 'audio', 'game']
      .flatMap((d) => sourceFiles(join('src', d)))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    // names shared with unrelated objects (weapon grip points, gamepad prev state, sprite sheets...)
    const collisions = new Set(['prev', 'throwHold', 'wallLock']);
    const missing = fields.filter((k) => !listed.has(k) && !collisions.has(k) && new RegExp('\\.' + k + '(?![A-Za-z0-9_])').test(text));
    expect(missing, 'render code reads these Fighter fields but the net snapshot does not carry them').toEqual([]);
  });

  it('a mirror match follows the real one frame by frame, through JSON', () => {
    for (const mapId of ['test', 'factory', 'rooftops']) {
      const cfg = config(mapId);
      const real = new Match(cfg);
      const mirror = new Match(cfg);
      const bots = real.world.fighters.map((f, i) => new BotController(() => real.world, i, { difficulty: 'normal', seed: 3, clone: f.master >= 0 }));
      const intents = bots.map((b) => b.poll());
      let maxBytes = 0;
      for (let t = 0; t < 60 * 16; t++) {
        for (let i = 0; i < bots.length; i++) intents[i] = bots[i].poll();
        real.step(intents);
        real.world.events.length = 0;
        real.events.length = 0;
        if (t % 9 !== 0) continue;
        const wire = JSON.stringify([encodeWorld(real.world), encodeMatch(real)]);
        maxBytes = Math.max(maxBytes, wire.length);
        const [ws, ms] = JSON.parse(wire);
        const prev = positionsOf(mirror.world);
        applyWorld(mirror.world, ws, prev);
        applyMatch(mirror, ms);
        const a = real.world;
        const b = mirror.world;
        expect(b.tick).toBe(a.tick);
        a.fighters.forEach((f, i) => {
          const m = b.fighters[i];
          if (f.master >= 0 && f.gone && !f.alive) {
            expect(m.alive, `clone slot ${i}`).toBe(false);
            return;
          }
          for (const [k] of FIGHTER_SPEC) {
            if (k === 'inv') continue;
            const x = f[k] as unknown;
            const y = m[k] as unknown;
            if (typeof x === 'number') expect(y as number, `${mapId} t${t} f${i}.${k}`).toBeCloseTo(x, 1);
            else expect(y, `${mapId} t${t} f${i}.${k}`).toEqual(x);
          }
          expect(m.inv.map((s) => s && s.id)).toEqual(f.inv.map((s) => s && s.id));
        });
        expect(b.items.length).toBe(a.items.filter((i) => i.active).length);
        expect(b.props.length).toBe(a.props.filter((p) => p.active).length);
        expect(b.bullets.length).toBe(a.bullets.filter((x) => x.active).length);
        expect(b.fires.length).toBe(a.fires.filter((x) => x.active).length);
        expect(b.burningTiles.size).toBe(a.burningTiles.size);
        expect(Array.from(b.map.tiles)).toEqual(Array.from(a.map.tiles));
        a.gimmicks.movers.forEach((m, i) => expect(b.gimmicks.movers[i].x).toBeCloseTo(m.x, 1));
        expect(mirror.bounty).toBe(real.bounty);
        expect(mirror.stats).toEqual(real.stats);
      }
      // a lean snapshot (world + match) stays small even with 8 fighters + clones
      expect(maxBytes, mapId).toBeLessThan(9000);
    }
  });

  it('items and props round-trip with their ids and spec fields', () => {
    const cfg = config('test');
    const real = new Match(cfg);
    const mirror = new Match(cfg);
    for (let t = 0; t < 600; t++) {
      real.step(real.world.fighters.map(() => ({ moveX: 0, moveY: 0, jump: false, attack: false, kick: false, interact: false, cycle: false, gadget: false, ability: false })));
    }
    applyWorld(mirror.world, JSON.parse(JSON.stringify(encodeWorld(real.world))));
    const live = real.world.items.filter((i) => i.active);
    expect(live.length).toBeGreaterThan(3);
    live.forEach((it, n) => {
      for (const [k] of ITEM_SPEC) {
        const y = mirror.world.items[n][k] as unknown;
        if (typeof it[k] === 'number') expect(y as number).toBeCloseTo(it[k] as number, 1);
        else expect(y).toEqual(it[k]);
      }
    });
    real.world.props.filter((p) => p.active).forEach((p, n) => {
      for (const [k] of PROP_SPEC) {
        const y = mirror.world.props[n][k] as unknown;
        if (typeof p[k] === 'number') expect(y as number).toBeCloseTo(p[k] as number, 1);
        else expect(y).toEqual(p[k]);
      }
    });
  });

  it('keeps the previous positions as px / py so the renderer can blend, and snaps jumps (respawns)', () => {
    const cfg = config('test');
    const real = new Match(cfg);
    const mirror = new Match(cfg);
    const idle = () => real.world.fighters.map(() => ({ moveX: 1, moveY: 0, jump: false, attack: false, kick: false, interact: false, cycle: false, gadget: false, ability: false }));
    for (let t = 0; t < 30; t++) real.step(idle());
    applyWorld(mirror.world, encodeWorld(real.world));
    const before = positionsOf(mirror.world);
    for (let t = 0; t < 6; t++) real.step(idle());
    applyWorld(mirror.world, encodeWorld(real.world), before);
    const f = mirror.world.fighters[0];
    expect(f.px).toBe(before.fighters[0]!.x);
    expect(f.x).toBeCloseTo(real.world.fighters[0].x, 1);
    // teleport: no sliding across the map
    real.world.fighters[0].x += 400;
    applyWorld(mirror.world, encodeWorld(real.world), positionsOf(mirror.world));
    expect(mirror.world.fighters[0].px).toBeCloseTo(mirror.world.fighters[0].x, 5);
  });

  it('src/sim, src/ai and src/net stay free of Phaser, DOM and Node APIs', () => {
    const banned = /from 'phaser'|from 'node:|from 'ws'|window\.|document\.|process\.|require\(|localStorage|Math\.random/;
    const offenders: string[] = [];
    for (const dir of ['src/sim', 'src/ai', 'src/net']) {
      for (const f of sourceFiles(dir)) {
        const code = readFileSync(f, 'utf8')
          .split(/\r?\n/)
          .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'));
        code.forEach((l, i) => banned.test(l) && offenders.push(`${f}:${i + 1}: ${l.trim()}`));
      }
    }
    expect(offenders).toEqual([]);
  });
});
