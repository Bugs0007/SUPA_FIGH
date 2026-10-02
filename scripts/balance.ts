// Balance survey: bots on every map, aggregate kills per weapon + round lengths.
//   npx vite-node scripts/balance.ts [matchesPerMap=2] [difficulty=normal] [seed=1]
import type { Difficulty } from '../src/ai/botData';
import { runBotSim } from '../src/ai/botsim';
import { MAP_LIST } from '../src/sim/map/maps';

const [matches = '2', difficulty = 'normal', seed = '1'] = process.argv.slice(2);
const total: Record<string, number> = {};
let kills = 0;
let rounds = 0;
let timeouts = 0;
let secs = 0;
let worstIdle = 0;
let worstAt = '';
for (const m of MAP_LIST) {
  const r = runBotSim({ matches: +matches, bots: 8, map: m.id, difficulty: difficulty as Difficulty, seed: +seed });
  for (const [w, k] of Object.entries(r.kills)) total[w] = (total[w] ?? 0) + k;
  kills += r.totalKills;
  rounds += r.rounds;
  timeouts += r.timeouts;
  secs += r.avgRoundSec * r.rounds;
  if (r.maxIdle > worstIdle) {
    worstIdle = r.maxIdle;
    worstAt = r.idleAt;
  }
  console.log(`${m.id.padEnd(14)} ${String(r.rounds).padStart(3)} rounds  avg ${r.avgRoundSec.toFixed(1).padStart(5)} s  timeouts ${r.timeouts}  kills ${r.totalKills}`);
}
console.log(`\nALL: ${rounds} rounds, avg ${(secs / rounds).toFixed(1)} s, ${timeouts} timeouts, worst idle ${worstIdle.toFixed(1)} s ${worstAt}`);
for (const [w, k] of Object.entries(total).sort((a, b) => b[1] - a[1])) {
  console.log(`${w.padEnd(14)} ${String(k).padStart(5)}  ${((k / kills) * 100).toFixed(1).padStart(5)}%`);
}
