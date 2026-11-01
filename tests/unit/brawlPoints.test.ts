import { expect, it } from 'vitest';
import { Match } from '../../src/sim/match';
import { BRAWL_POINTS, rankBrawl } from '../../src/sim/data/brawl';
import { applyMatch, encodeMatch } from '../../src/net/renderState';
import { spec } from './helpers';
import { summonClones } from '../../src/sim/hero';

function match(n=4,rounds=3,teams?:number[]) {
  return new Match({mapId:'test',mode:'brawl',fighters:Array.from({length:n},(_,i)=>spec('P'+i,teams?.[i]??0)),roundsToWin:rounds,friendlyFire:false,weaponSpawnRate:0,seed:7});
}
function eliminate(m:Match,...ids:number[]) {
  for(const id of ids){const f=m.world.fighters[id];f.alive=false;f.gone=true;f.hp=0;f.state='dead';}
  m.step([]);
}
function finish(m:Match,order:number[]) {
  for(const id of order)eliminate(m,id);
  for(let i=0;i<200&&m.phase==='fight';i++)m.step([]);
  expect(m.phase).toBe('roundEnd');
}

it('awards the championship scale across all ten placements',()=>{
  const teams=Array.from({length:10},(_,i)=>100+i);
  const result=rankBrawl(teams,new Map(teams.slice(1).map((team,i)=>[team,10-i])));
  expect(result.map(p=>p.points)).toEqual([...BRAWL_POINTS]);
  expect(result.map(p=>p.team)).toEqual(teams);
});
it('tracks elimination order and scores every fighter once per round',()=>{
  const m=match();finish(m,[0,1,2]);
  expect([...m.scores]).toEqual([[103,25],[102,18],[101,15],[100,12]]);
  expect(m.roundPlacements.map(p=>p.place)).toEqual([1,2,3,4]);
  for(let i=0;i<20;i++)m.step([]);
  expect(m.scores.get(103)).toBe(25);
  expect(m.stats[3].roundsWon).toBe(1);
});
it('same-tick eliminations share the lower occupied place regardless of player order',()=>{
  const m=match();eliminate(m,2,0);finish(m,[1]);
  expect(m.scores.get(100)).toBe(12);expect(m.scores.get(102)).toBe(12);
  expect(m.scores.get(101)).toBe(18);expect(m.scores.get(103)).toBe(25);
});
it('a simultaneous wipe has no invented winner and awards equal points',()=>{
  const m=match(2,1);eliminate(m,0,1);
  for(let i=0;i<200&&m.phase==='fight';i++)m.step([]);
  expect(m.roundWinner).toBeNull();expect(m.matchWinner).toBeNull();
  expect(m.scores.get(100)).toBe(18);expect(m.scores.get(101)).toBe(18);
});
it('a clone still alive on its master death tick cannot improve the masters placement',()=>{
  const m=new Match({mapId:'test',mode:'brawl',fighters:[{...spec('N'),hero:'naruto'},spec('B'),spec('C')],roundsToWin:3,friendlyFire:false,weaponSpawnRate:0,seed:7});
  const [naruto,other]=m.world.fighters;
  naruto.x=naruto.px=100;naruto.y=naruto.py=432;
  expect(summonClones(m.world,naruto)).toBeGreaterThan(0);
  naruto.y=other.y=m.world.killY+10;
  m.step([]);
  expect(naruto.alive).toBe(false);expect(other.alive).toBe(false);
  expect(m.world.fighters.some(f=>f.master===naruto.id&&f.alive)).toBe(true);
  for(let i=0;i<200&&m.phase==='fight';i++)m.step([]);
  expect(m.roundPlacements).toHaveLength(3);
  expect(m.scores.get(100)).toBe(15);expect(m.scores.get(101)).toBe(15);expect(m.scores.get(102)).toBe(25);
});
it('teams place only when their last member dies, with no per-member point multiplication',()=>{
  const m=match(5,3,[1,1,2,2,3]);
  eliminate(m,0);eliminate(m,4);eliminate(m,2);finish(m,[3]);
  expect(m.roundPlacements).toEqual([{team:1,place:1,points:25},{team:2,place:2,points:18},{team:3,place:3,points:15}]);
  expect(m.stats[0].roundsWon).toBe(1);expect(m.stats[1].roundsWon).toBe(1);
});
it('the point leader wins after the selected rounds even when somebody else wins the final round',()=>{
  const m=match();finish(m,[3,2,1]);expect(m.matchWinner).toBeNull();
  m.startRound();finish(m,[3,2,0]);expect(m.matchWinner).toBeNull();
  m.startRound();finish(m,[1,3,0]);
  expect(m.roundWinner).toBe(102);expect(m.matchWinner).toBe(100);expect(m.scores.get(100)).toBe(61);
});
it('tied championship leaders get an extra round, while unlimited never declares a champion',()=>{
  const m=match(2,2);finish(m,[1]);m.startRound();finish(m,[0]);
  expect(m.scores.get(100)).toBe(43);expect(m.scores.get(101)).toBe(43);expect(m.matchWinner).toBeNull();
  m.startRound();finish(m,[1]);expect(m.matchWinner).toBe(100);
  const unlimited=match(2,0);finish(unlimited,[1]);expect(unlimited.matchWinner).toBeNull();
});
it('snapshot restore retains earlier eliminations and LAN mirrors receive placements and totals',()=>{
  const m=match();eliminate(m,0);eliminate(m,1);
  const snap=JSON.parse(JSON.stringify(m.snapshot()));
  const restored=match();restored.restore(snap);
  finish(m,[2]);finish(restored,[2]);
  expect(restored.roundPlacements).toEqual(m.roundPlacements);expect([...restored.scores]).toEqual([...m.scores]);
  const mirror=match();applyMatch(mirror,JSON.parse(JSON.stringify(encodeMatch(m))));
  expect(mirror.roundPlacements).toEqual(m.roundPlacements);expect([...mirror.scores]).toEqual([...m.scores]);
});
