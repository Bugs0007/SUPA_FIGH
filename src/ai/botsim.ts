// Headless bot-vs-bot simulation used by scripts/botsim.ts (balance report) and the bot unit tests.
// Pure sim + AI, runs in Node.
import { BotController } from './bot';
import type { Difficulty } from './botData';
import { DT } from '../sim/constants';
import { Match } from '../sim/match';

export interface SimReport {
  rounds: number;
  timeouts: number;
  avgRoundSec: number;
  kills: Record<string, number>;
  totalKills: number;
  /** longest time any living bot spent within 12 px of one spot (s) */
  maxIdle: number;
  idleAt: string;
}

export function runBotSim(opts: {
  matches: number;
  bots: number;
  map: string;
  difficulty: Difficulty;
  seed: number;
  roundCap?: number;
  /** heroes for the first bots (M9) */
  heroes?: string[];
  heroPowers?: boolean;
}): SimReport {
  const kills: Record<string, number> = {};
  let rounds = 0;
  let timeouts = 0;
  let roundTicks = 0;
  let maxIdle = 0;
  let idleAt = '';
  const cap = Math.round((opts.roundCap ?? 120) / DT);
  for (let m = 0; m < opts.matches; m++) {
    const fighters = Array.from({ length: opts.bots }, (_, i) => ({ name: 'B' + i, team: 0, isBot: true, upJumps: false, hero: opts.heroes?.[i] }));
    const match = new Match({
      mapId: opts.map,
      mode: 'brawl',
      fighters,
      roundsToWin: 99,
      friendlyFire: false,
      weaponSpawnRate: 1,
      seed: opts.seed + m * 101,
      heroPowers: opts.heroPowers,
    });
    const bots = match.world.fighters.map(
      (f, i) => new BotController(() => match.world, i, { difficulty: opts.difficulty, seed: opts.seed + m, clone: f.master >= 0 }),
    );
    const intents = bots.map((b) => b.poll());
    for (let r = 0; r < 3; r++) {
      const startRound = match.round;
      const idle = match.world.fighters.map(() => ({ x: 0, y: 0, t: 0 }));
      let t = 0;
      while (match.round === startRound && t < cap) {
        for (let i = 0; i < bots.length; i++) intents[i] = bots[i].poll();
        match.step(intents);
        const w = match.world;
        for (const e of w.events) if (e.t === 'kill') kills[e.weapon || '?'] = (kills[e.weapon || '?'] ?? 0) + 1;
        w.events.length = 0;
        match.events.length = 0;
        if (t % 30 === 0) {
          w.fighters.forEach((f, i) => {
            const s = idle[i];
            // "stuck" = trying to travel (roam/loot) without getting anywhere
            const g = bots[i].debug().goal;
            const traveling = (g === 'roam' || g === 'loot') && f.state === 'normal';
            if (!f.alive || !traveling || Math.hypot(f.x - s.x, f.y - s.y) > 12) {
              s.x = f.x;
              s.y = f.y;
              s.t = t;
            } else if ((t - s.t) * DT > maxIdle && match.phase === 'fight') {
              maxIdle = (t - s.t) * DT;
              idleAt = `${opts.map} m${m} r${match.round} bot${i} @${Math.round(f.x)},${Math.round(f.y)} state=${f.state} ${JSON.stringify(bots[i].debug())}`;
            }
          });
        }
        t++;
      }
      rounds++;
      roundTicks += t;
      if (t >= cap) {
        timeouts++;
        match.startRound();
      }
    }
  }
  const totalKills = Object.values(kills).reduce((a, b) => a + b, 0);
  return { rounds, timeouts, avgRoundSec: (roundTicks / rounds) * DT, kills, totalKills, maxIdle, idleAt };
}

