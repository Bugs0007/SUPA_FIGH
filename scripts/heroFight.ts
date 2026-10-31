// Hero bot duel report (bot close-fight AI, BOT_FIGHT in src/ai/botData.ts): how much damage is fists vs hero
// moves, how often the two stand close, how much they guard. Two bots, Naruto vs Sasuke by default, both starting
// in `form`, `matches` x `seconds` on `map`:
//   npm run herofight -- <form> [map] [difficulty] [heroA] [heroB] [matches] [seconds]
import { BotController } from '../src/ai/bot';
import { Match } from '../src/sim/match';

const form = Number(process.argv[2] ?? 4);
const map = process.argv[3] ?? 'test';
const diff = (process.argv[4] ?? 'hard') as 'hard';
const ha = process.argv[5] ?? 'naruto';
const hb = process.argv[6] ?? 'sasuke';
const matches = Number(process.argv[7] ?? 6);
const secs = Number(process.argv[8] ?? 90);
const dmg: Record<string, number> = {};
const starts: Record<string, number> = {};
const guard: Record<string, number> = { block: 0, parry: 0, guardBreak: 0, blockTicks: 0 };
let close = 0, total = 0, kills = 0;
const distHist = [0, 0, 0, 0, 0];
const stateClose: Record<string, number> = {};
for (let m = 0; m < matches; m++) {
  const match = new Match({
    mapId: map, mode: 'brawl', roundsToWin: 99, friendlyFire: false, weaponSpawnRate: 0, seed: 11 + m * 7, heroPowers: false,
    fighters: [
      { name: 'A', team: 0, isBot: true, upJumps: false, hero: ha, startForm: form },
      { name: 'B', team: 0, isBot: true, upJumps: false, hero: hb, startForm: form },
    ],
  } as any);
  const bots = match.world.fighters.map((f, i) => new BotController(() => match.world, i, { difficulty: diff, seed: 5 + m, clone: f.master >= 0 }));
  for (let t = 0; t < 60 * secs; t++) {
    const intents = bots.map((b) => b.poll());
    match.step(intents);
    const w = match.world;
    for (const e of w.events as any[]) {
      if (e.t === 'hit' && !e.corpse) dmg[e.weapon] = (dmg[e.weapon] ?? 0) + e.damage;
      if (e.t === 'kill') kills++;
      if (e.t === 'block' || e.t === 'parry' || e.t === 'guardBreak') guard[e.t]++;
      if (e.t === 'superStart' || e.t === 'chargeStart' || e.t === 'rasengan' || e.t === 'clone' || e.t === 'amaterasu' || e.t === 'transform' || e.t === 'blink' || e.t === 'stretch') {
        const k = e.t + (e.phase ? ':' + e.phase : '') + ' f' + e.f;
        starts[k] = (starts[k] ?? 0) + 1;
      }
    }
    w.events.length = 0;
    match.events.length = 0;
    const [a, b] = w.fighters;
    if (a.alive && b.alive && match.phase === 'fight') {
      total++;
      if (a.state === 'block') guard.blockTicks++;
      if (b.state === 'block') guard.blockTicks++;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      distHist[Math.min(4, Math.floor(d / 30))]++;
      if (d < 30) {
        close++;
        for (const f of [a, b]) {
          const k = f.name + ':' + f.state + (f.specialKind ? '/' + f.specialKind : '') + (f.grounded ? '' : ' air');
          stateClose[k] = (stateClose[k] ?? 0) + 1;
        }
      }
    }
  }
}
const all = Object.values(dmg).reduce((s, v) => s + v, 0);
const combo = Object.entries(dmg).filter(([k]) => k.endsWith(':combo')).reduce((s, [, v]) => s + v, 0);
console.log(`${ha} vs ${hb} form ${form} map ${map} ${diff}: close(<30px) ${(close / total).toFixed(2)}  combo share ${(combo / all).toFixed(2)}  total dmg ${Math.round(all)}  kills ${kills}`);
console.log('dist hist per 30px', distHist.map((v) => (v / total).toFixed(2)).join(' '));
console.log('damage by weapon', Object.entries(dmg).sort((x, y) => y[1] - x[1]).map(([k, v]) => k + '=' + Math.round(v)).join('  '));
console.log('guard', JSON.stringify(guard), 'block time share', (guard.blockTicks / (2 * total)).toFixed(3));
console.log('move starts', JSON.stringify(starts));
console.log('states while close', Object.entries(stateClose).sort((x, y) => y[1] - x[1]).slice(0, 14).map(([k, v]) => k + '=' + v).join('  '));
