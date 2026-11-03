import { expect, it } from 'vitest';
import { applyHit } from '../../src/sim/combat';
import { HEROES } from '../../src/sim/data/heroes';
import { summonClones } from '../../src/sim/hero';
import { World } from '../../src/sim/world';
import { FLAT, spec } from './helpers';

it.each(['melee','rasengan'])('scales clone %s damage once and credits Naruto', weapon=>{
 const w=new World(FLAT,[{...spec('N'),hero:'naruto'},spec('E')],{friendlyFire:false,weaponSpawnRate:0,gravityScale:1},42);
 const n=w.fighters[0],v=w.fighters[1];summonClones(w,n);
 const c=w.fighters.find(f=>f.master===0&&f.alive)!;v.invuln=0;
 applyHit(w,v,{damage:20,kbX:0,kbY:0,attacker:c.id,weapon,kind:'melee'});
 expect(v.hp).toBeCloseTo(100-20*HEROES.naruto.second.clones!.baseDamageMul!);
 expect(v.lastAttacker).toBe(n.id);
});
it('keeps the real Naruto damage intact and prevents clone friendly fire',()=>{
 const w=new World(FLAT,[{...spec('N'),hero:'naruto'},spec('E')],{friendlyFire:false,weaponSpawnRate:0,gravityScale:1},42);
 const n=w.fighters[0],v=w.fighters[1];summonClones(w,n);const c=w.fighters.find(f=>f.master===0&&f.alive)!;
 v.invuln=0;n.invuln=0;
 applyHit(w,v,{damage:20,kbX:0,kbY:0,attacker:n.id,weapon:'rasengan',kind:'melee'});expect(v.hp).toBe(80);
 applyHit(w,n,{damage:20,kbX:0,kbY:0,attacker:c.id,weapon:'rasengan',kind:'melee'});expect(n.hp).toBe(100);
});

it.each([0,1,2,3,4])('shares one clone damage budget at starting form %i',startForm=>{
 const w=new World(FLAT,[{...spec('N'),hero:'naruto',startForm},spec('E')],{friendlyFire:false,weaponSpawnRate:0,gravityScale:1},42);
 const n=w.fighters[0],v=w.fighters[1];n.hp=70;summonClones(w,n);v.invuln=0;
 const clones=w.fighters.filter(f=>f.master===0&&f.alive);
 for(const c of clones)applyHit(w,v,{damage:20,kbX:0,kbY:0,attacker:c.id,weapon:'rasengan',kind:'melee',ignoreInvuln:true});
 expect(100-v.hp).toBeCloseTo(20*HEROES.naruto.second.clones!.count*(startForm===0?HEROES.naruto.second.clones!.baseDamageMul!:startForm===4?HEROES.naruto.second.clones!.finalDamageMul!:HEROES.naruto.second.clones!.damageMul!));
 if(startForm===4)expect(clones.every(c=>c.hp===70)).toBe(true);
});
