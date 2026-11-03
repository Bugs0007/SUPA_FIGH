import { expect,it } from 'vitest';
import { balanceScenario } from '../../scripts/balanceScenarios';
import { MAP_LIST } from '../../src/sim/map/maps';
it('covers every map, difficulty and fall-death combination once per block',()=>{
 const block=Array.from({length:MAP_LIST.length*4},(_,i)=>balanceScenario(i,MAP_LIST.length));
 expect(new Set(block.map(s=>JSON.stringify(s))).size).toBe(MAP_LIST.length*4);
 for(let i=0;i<MAP_LIST.length;i++)expect(block.filter(s=>s.mapIndex===i)).toHaveLength(4);
 expect(Array.from({length:block.length},(_,i)=>balanceScenario(i+block.length,MAP_LIST.length))).toEqual(block);
});
it.each([2,3,4])('covers all 72 scenarios in a 1,000-round %i-player cell',n=>{
 const scenarios=Array.from({length:1000},(_,r)=>balanceScenario(Math.floor(r/n),MAP_LIST.length));
 expect(new Set(scenarios.map(s=>JSON.stringify(s))).size).toBe(MAP_LIST.length*4);
});

it('interleaves hard and expert while visiting every map in the first rotation',()=>{
 const first=Array.from({length:MAP_LIST.length},(_,i)=>balanceScenario(i,MAP_LIST.length));
 expect(new Set(first.map(s=>s.mapIndex)).size).toBe(MAP_LIST.length);
 expect(new Set(first.map(s=>s.difficulty)).size).toBe(2);
});
