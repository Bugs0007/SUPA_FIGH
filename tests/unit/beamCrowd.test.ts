import {expect,it} from 'vitest';
import {HEROES} from '../../src/sim/data/heroes';
import {summonClones} from '../../src/sim/hero';
import {World} from '../../src/sim/world';
import {FLAT,spec,intent} from './helpers';
function fire(extra:boolean,form=0,clones=false){
 const w=new World(FLAT,[{...spec('G'),hero:'goku',startForm:form},{...spec('N'),hero:'naruto'},spec('E')],{friendlyFire:false,weaponSpawnRate:0,gravityScale:1},42);
 w.fighters.slice(0,3).forEach((f,i)=>{f.x=f.px=[70,100,extra?130:400][i];f.y=f.py=144;f.vx=f.vy=f.invuln=0;f.facing=1;});
 if(clones){summonClones(w,w.fighters[1]);w.fighters.filter(c=>c.master===1&&c.alive).forEach((c,i)=>{c.x=c.px=112+i*10;c.y=c.py=144;c.vy=c.invuln=0;});}
 const damage=new Map<number,number>();
 for(let t=0;t<70;t++){
  w.step(w.fighters.map((_,i)=>intent(i===0&&t===0?{kick:true}:{})));
  for(const e of w.events)if(e.t==='hit'&&e.weapon==='goku:second'&&!e.corpse)damage.set(e.victim,(damage.get(e.victim)??0)+e.damage);
  w.events.length=0;
 }
 return damage;
}
it('normal base Kamehameha shares damage across multiple opposing teams',()=>{
 const single=fire(false),crowd=fire(true);
 expect(single.get(1)).toBeGreaterThan(0);
 expect(crowd.get(1)!/single.get(1)!).toBeCloseTo(HEROES.goku.second.beam!.crowdDamageByLevel![0]);
 expect(crowd.get(2)).toBeCloseTo(crowd.get(1)!);
});
it('Naruto and his clones remain one opponent for beam damage',()=>{
 const single=fire(false),clones=fire(false,0,true);
 expect(clones.get(1)).toBeCloseTo(single.get(1)!);
 expect(clones.size).toBeGreaterThan(1);
});
it('transformed Kamehameha retains its existing full crowd damage',()=>{
 const single=fire(false,1),crowd=fire(true,1);
 expect(crowd.get(1)).toBeCloseTo(single.get(1)!);
 expect(crowd.get(2)).toBeCloseTo(single.get(1)!);
});
