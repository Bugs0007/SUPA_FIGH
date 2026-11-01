import { expect, it } from 'vitest';
import { MAP_LIST, roundMap } from '../../src/sim/map/maps';
import { Match, type MatchConfig } from '../../src/sim/match';
import { sanitizeConfig } from '../../src/net/protocol';
import { applyMatch, encodeMatch } from '../../src/net/renderState';
import { spec } from './helpers';

const config: MatchConfig = {mapId:'random',mode:'brawl',fighters:[spec('A',0),spec('B',1)],roundsToWin:0,friendlyFire:false,weaponSpawnRate:0,seed:123};
it('shuffles every arena once per rotation without consecutive repeats',()=>{
  const ids=Array.from({length:MAP_LIST.length*2},(_,i)=>roundMap('random',123,i+1).id);
  expect(new Set(ids.slice(0,MAP_LIST.length)).size).toBe(MAP_LIST.length);
  expect(ids.every((id,i)=>i===0||id!==ids[i-1])).toBe(true);
  expect(ids).toEqual(Array.from({length:ids.length},(_,i)=>roundMap('random',123,i+1).id));
  expect(ids.slice(0,MAP_LIST.length)).not.toEqual(Array.from({length:MAP_LIST.length},(_,i)=>roundMap('random',456,i+1).id));
});
it('keeps fixed maps fixed',()=>{
  expect(roundMap('leaf',123,9).id).toBe('leaf');
});
it('rebuilds snapshots, LAN mirrors and prediction worlds on the current round map',()=>{
  const host=new Match(config),mirror=new Match(config);
  const first=host.world.def.id;
  host.startRound();
  expect(host.world.def.id).not.toBe(first);
  const restored=new Match(config);restored.restore(host.snapshot());
  expect(restored.snapshot()).toEqual(host.snapshot());
  mirror.rebuildWorld(host.round,host.roundModifiers);
  applyMatch(mirror,encodeMatch(host));
  expect(mirror.world.def.id).toBe(host.world.def.id);
  expect(mirror.freshWorld(host.round,[]).def.id).toBe(host.world.def.id);
  expect(host.recording).not.toBeNull();
});
it('accepts Random in room settings while rejecting unknown maps',()=>{
  expect(sanitizeConfig({mapId:'random'})).toEqual({mapId:'random'});
  expect(sanitizeConfig({mapId:'missing'})).toEqual({});
});
