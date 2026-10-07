// Finds exciting natural bot-vs-bot windows for the trailer: runs headless matches of 3 hero bots (pre-
// transformed) over many seeds and scores sliding windows by the abilities used, hits and knock-outs.
// Usage: npx vite-node scripts/trailer/scout.ts <map> <levelsCsv e.g. 3,4,4> <seedFrom> <seedTo> [window=300] [heroes=naruto,luffy,goku]
import { BotController } from '../../src/ai/bot';
import { DT } from '../../src/sim/constants';
import { transform } from '../../src/sim/hero';
import { Match } from '../../src/sim/match';
import type { SimEvent } from '../../src/sim/events';

const [map = 'alien', lv = '3,3,3', s0 = '1', s1 = '40', win = '300', hs = 'naruto,luffy,goku'] = process.argv.slice(2);
const heroes = hs.split(',');
const levels = lv.split(',').map(Number);
const WINDOW = Number(win);
const MAXT = 1500;

const WEIGHT: Record<string, number> = { superStart: 14, beam: 3, chargeStart: 2, stretch: 4, rasengan: 3, clone: 1, explosion: 6, kill: 20, transform: 6, flyStart: 4, rocket: 4 };

for (let seed = Number(s0); seed <= Number(s1); seed++) {
  const fighters = heroes.map((h, i) => ({ name: 'B' + i, team: 0, isBot: true, upJumps: false, hero: h }));
  const match = new Match({ mapId: map, mode: 'brawl', timeLimit: 180, fighters, roundsToWin: 5, friendlyFire: false, weaponSpawnRate: 1, heroPowers: false, seed });
  levels.forEach((l, i) => {
    for (let k = 0; k < l; k++) transform(match.world, match.world.fighters[i]);
  });
  match.world.events.length = 0;
  const bots = fighters.map((_, i) => new BotController(() => match.world, i, { difficulty: 'expert', seed }));
  const intents = bots.map((b) => b.poll());
  const score: number[] = new Array(MAXT).fill(0);
  const log: { t: number; what: string }[] = [];
  let killT = -1;
  const round = match.round;
  for (let t = 0; t < MAXT && match.round === round; t++) {
    for (let i = 0; i < bots.length; i++) intents[i] = bots[i].poll();
    match.step(intents);
    for (const e of match.world.events as SimEvent[]) {
      if (e.t === 'hit' && !e.corpse) score[t] += Math.min(6, e.damage / 6);
      else if (WEIGHT[e.t]) score[t] += WEIGHT[e.t];
      if (e.t === 'kill') {
        killT = t;
        log.push({ t, what: `KILL v${e.victim}<-${e.killer} ${e.weapon}` });
      } else if (e.t === 'superStart') log.push({ t, what: `super f${e.f} ${e.name}` });
      else if (e.t === 'beam') log.push({ t, what: `beam f${e.f}${e.super ? ' SUPER' : ''}` });
      else if (e.t === 'explosion') log.push({ t, what: 'explosion' });
    }
    match.world.events.length = 0;
    match.events.length = 0;
  }
  let best = 0;
  let bestT = 0;
  let acc = 0;
  for (let t = 0; t < MAXT; t++) {
    acc += score[t];
    if (t >= WINDOW) acc -= score[t - WINDOW];
    if (acc > best) {
      best = acc;
      bestT = t - WINDOW + 1;
    }
  }
  const kills = log.filter((l) => l.what.startsWith('KILL')).length;
  console.log(`seed ${seed} ${map}: best window ${Math.max(0, bestT)}..${Math.max(0, bestT) + WINDOW} score ${best.toFixed(0)} kills ${kills} lastKill@${killT} (${(killT * DT).toFixed(1)}s) events ${log.filter((l) => !l.what.startsWith('KILL')).length}`);
}
