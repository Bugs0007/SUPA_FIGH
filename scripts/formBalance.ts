// Reproducible same-starting-form balance survey. Node bundle (see balance:forms script).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { setPriority, constants as osConstants } from 'node:os';
import { fileURLToPath } from 'node:url';
import { BOT_FIGHT } from '../src/ai/botData';
import { BotController } from '../src/ai/bot';
import { balanceScenario } from './balanceScenarios';
import { HEROES } from '../src/sim/data/heroes';
import { Match } from '../src/sim/match';
import { MAP_LIST } from '../src/sim/map/maps';
const heroes=['naruto','sasuke','luffy','goku'];
function permutations(a:string[]):string[][] {return a.length===1?[a]:a.flatMap((x,i)=>permutations(a.filter((_,j)=>i!==j)).map(p=>[x,...p]));}
const groups=Array.from({length:15},(_,i)=>heroes.filter((_,j)=>(i+1)&(1<<j))).filter(g=>g.length>=2);
const args=process.argv.slice(2);
const option=(key:string,fallback:string)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const rounds=Number(option('--rounds',/^\d+$/.test(args[0]??'')?args[0]:'1000')),seed=Number(option('--seed','17001'));
if(!Number.isInteger(rounds)||rounds<1||rounds>100000||!Number.isSafeInteger(seed))throw new Error('Use an integer round count (1–100000) and seed');
const output=resolve(option('--out',args[1]&&!args[0].startsWith('--')?args[1]:'tests/e2e/screenshots/balance/baseline.json'));
const tuning = args.includes('--tuning-json') ? JSON.parse(option('--tuning-json','null'))
  : args.includes('--tuning') ? JSON.parse(readFileSync(resolve(option('--tuning','')),'utf8')) : null;
function tune(target: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [key,value] of Object.entries(patch)) {
    if (!Object.hasOwn(target,key) || key === '__proto__') throw new Error('Unknown tuning key '+key);
    if (value && typeof value === 'object' && !Array.isArray(value)) tune(target[key] as Record<string,unknown>,value as Record<string,unknown>);
    else target[key]=value;
  }
}
if(tuning){
  const structured=Object.hasOwn(tuning,'heroes')||Object.hasOwn(tuning,'ai');
  const heroesPatch=structured?tuning.heroes:tuning;
  if(heroesPatch)tune(HEROES as unknown as Record<string,unknown>,heroesPatch);
  if(tuning.ai)tune(BOT_FIGHT as unknown as Record<string,unknown>,tuning.ai);
}
interface Cell {form:number;group:string[];rounds:number;wins:Record<string,number>;draws:number;timeouts:number;seconds:number;damage:Record<string,number>;kills:Record<string,number>;moves:Record<string,number>;points:Record<string,number>;blocks:{wins:Record<string,number>;draws:number}[];scenarios:Record<string,{n:number;wins:Record<string,number>;draws:number}>;}
async function run(form:number,group:string[]):Promise<Cell> {
 const result:Cell={form,group,rounds:0,wins:Object.fromEntries(group.map(h=>[h,0])),draws:0,timeouts:0,seconds:0,damage:Object.fromEntries(group.map(h=>[h,0])),kills:{},moves:{},points:Object.fromEntries(group.map(h=>[h,0])),blocks:[],scenarios:{}};
 const seats=permutations(group);
 for(let r=0;r<rounds;r++){
  const trial=Math.floor(r/group.length),base=seats[trial%seats.length],shift=r%group.length;
  const order=[...base.slice(shift),...base.slice(0,shift)];
  const {mapIndex,fallDeath,difficulty}=balanceScenario(trial,MAP_LIST.length);
  const map=MAP_LIST[mapIndex].id;
  const roundSeed=(seed+trial*104729+form*7919)>>>0;
  const m=new Match({mapId:map,mode:'brawl',roundsToWin:0,friendlyFire:false,weaponSpawnRate:0,seed:roundSeed,heroPowers:false,fallDeath,suddenDeath:75,
   fighters:order.map(hero=>({name:hero,team:0,isBot:true,upJumps:false,hero,startForm:form}))});
  m.recording=null; // input recording is irrelevant to outcomes; do not retain millions of intent frames
  const bots=m.world.fighters.map((f,i)=>new BotController(()=>m.world,i,{difficulty,seed:roundSeed+i*31,clone:f.master>=0}));
  const intents=bots.map(b=>b.poll());
  let t=0;
  for(;t<180*60&&m.phase==='fight';t++){
   for(let i=0;i<bots.length;i++)intents[i]=bots[i].poll();
   m.step(intents);
   for(const e of m.world.events){
    if(e.t==='kill')result.kills[e.weapon||e.cause]=(result.kills[e.weapon||e.cause]??0)+1;
    if('f' in e&&typeof e.f==='number'&&['superStart','chargeStart','rasengan','clone','amaterasu','blink','stretch'].includes(e.t)){
     const f=m.world.fighters[e.f];if(f&&f.master<0){const key=f.hero+':'+e.t;result.moves[key]=(result.moves[key]??0)+1;}
    }
   }
   m.world.events.length=0;m.events.length=0;
  }
  const winner=m.roundWinner===null?undefined:order[m.membersOf(m.roundWinner)[0]];
  result.rounds++;result.seconds+=t/60;
  const block=result.blocks[trial]??={wins:Object.fromEntries(group.map(h=>[h,0])),draws:0};
  if(winner)block.wins[winner]++;else block.draws++;
  if((r+1)%100===0){console.log(JSON.stringify({progress:{form,group,round:r+1}}));await new Promise<void>(done=>setImmediate(done));}
  if(m.phase==='fight')result.timeouts++;
  if(winner)result.wins[winner]++;else result.draws++;
  order.forEach((h,i)=>{result.damage[h]+=m.stats[i].damage;result.points[h]+=m.roundPlacements.find(p=>m.membersOf(p.team).includes(i))?.points??0;});
  const key=map+':'+difficulty+':fall'+(fallDeath?'On':'Off');
  const sc=result.scenarios[key]??={n:0,wins:Object.fromEntries(group.map(h=>[h,0])),draws:0};
  sc.n++;if(winner)sc.wins[winner]++;else sc.draws++;
 }
 return result;
}
if(args.includes('--worker')){
 const jobs=JSON.parse(option('--jobs','[]')) as {form:number;group:string[]}[];
 for(const job of jobs)console.log(JSON.stringify(await run(job.form,job.group)));
}else{
 mkdirSync(dirname(output),{recursive:true});
 let jobs=Array.from({length:5},(_,form)=>groups.filter(g=>!args.includes('--duels')||g.length===2).map(group=>({form,group}))).flat().filter(j=>!args.includes('--form')||j.form===Number(option('--form','0'))).filter(j=>!args.includes('--ffa')||j.group.length>2);
 const fingerprint=createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
 let cells:Cell[]=[];
 if(args.includes('--resume')){const previous=JSON.parse(readFileSync(output,'utf8'));if(previous.simulationSha256!==fingerprint||previous.seed!==seed||previous.roundsPerCell!==rounds||JSON.stringify(previous.overrides??null)!==JSON.stringify(tuning))throw new Error('Resume requires the same bundle, seed and round count');cells=previous.cells;jobs=jobs.filter(j=>!cells.some(c=>c.form===j.form&&c.group.join('/')===j.group.join('/')));}
 const workers=Math.min(Number(option('--workers','6')),jobs.length);
 if(jobs.length&&(!Number.isInteger(workers)||workers<1||workers>16))throw new Error('Use 1–16 workers');
 const started=Date.now();
 const save=()=>writeFileSync(output,JSON.stringify({roundsPerCell:rounds,seed,overrides:tuning,simulationSha256:fingerprint,scenarioRules:'No new weapons or power orbs; existing map props and their drops remain; cyclic slot swaps over permuted seat orders; hard/expert; fall death on/off; natural form loss; 75s sudden death; 180s cap; draws/timeouts are not wins',started:new Date(started).toISOString(),elapsedSeconds:(Date.now()-started)/1000,cells},null,2));
 await Promise.all(Array.from({length:workers},(_,i)=>new Promise<void>((done,fail)=>{
  const shard=jobs.filter((_,j)=>j%workers===i);
  const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'--worker','--jobs',JSON.stringify(shard),'--rounds',String(rounds),'--seed',String(seed),...(tuning?['--tuning-json',JSON.stringify(tuning)]:[])],{stdio:['ignore','pipe','inherit']});
  if(child.pid)try{setPriority(child.pid,osConstants.priority.PRIORITY_BELOW_NORMAL);}catch{/* scheduling never changes the simulation */}
  let pending='';child.stdout.on('data',(data)=>{pending+=String(data);let end:number;while((end=pending.indexOf('\n'))>=0){const line=pending.slice(0,end);pending=pending.slice(end+1);if(!line.trim())continue;const parsed=JSON.parse(line);if(parsed.progress){console.log('progress '+JSON.stringify(parsed.progress));continue;}const cell=parsed as Cell;cells.push(cell);save();console.log(`${cells.length}/${jobs.length} form${cell.form} ${cell.group.join('/')} ${JSON.stringify(cell.wins)} draws=${cell.draws} timeout=${cell.timeouts} elapsed=${((Date.now()-started)/1000).toFixed(0)}s`);}});
  child.on('error',fail);child.on('exit',code=>code===0?done():fail(new Error('worker exit '+code)));
 })));
 save();console.log('Saved '+output);
}
