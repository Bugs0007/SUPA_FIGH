// Headless bot-vs-bot balance report: kills per weapon, round lengths, stuck bots.
//   npx vite-node scripts/botsim.ts [matches=4] [bots=8] [map=test] [difficulty=normal] [seed=1]
import type { Difficulty } from '../src/ai/botData';
import { runBotSim } from '../src/ai/botsim';

const [matches = '4', bots = '8', map = 'test', difficulty = 'normal', seed = '1'] = process.argv.slice(2);
const t0 = Date.now();
const r = runBotSim({ matches: +matches, bots: +bots, map, difficulty: difficulty as Difficulty, seed: +seed });
console.log(`${r.rounds} rounds (${r.timeouts} timeouts), avg ${r.avgRoundSec.toFixed(1)} s/round, ${((Date.now() - t0) / 1000).toFixed(1)} s wall`);
console.log(`max idle ${r.maxIdle.toFixed(1)} s ${r.idleAt}`);
for (const [w, k] of Object.entries(r.kills).sort((a, b) => b[1] - a[1])) {
  console.log(`${w.padEnd(12)} ${String(k).padStart(4)}  ${((k / r.totalKills) * 100).toFixed(1)}%`);
}
